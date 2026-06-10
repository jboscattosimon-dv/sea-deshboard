const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

// ── ROTAS PÚBLICAS (sem auth, validar só token) ────────────

// GET /api/onboarding/form/:token
router.get('/form/:token', async (req, res) => {
  const { token } = req.params;
  const { data: ob, error } = await supabase
    .from('onboarding_clientes')
    .select('id, cliente_id, status, token_publico, clientes(nome)')
    .eq('token_publico', token)
    .single();
  if (error || !ob) return res.status(404).json({ erro: 'Formulário não encontrado' });

  const { data: itens, error: itensErr } = await supabase
    .from('onboarding_itens_cliente')
    .select(`
      id, obrigatorio, status,
      catalogo:onboarding_itens_catalogo(id, categoria, label, descricao, tipo, ordem),
      respostas:onboarding_respostas(tipo_resposta, valor_texto, valor_checkbox, arquivo_url, arquivo_nome, respondido_em)
    `)
    .eq('onboarding_id', ob.id);
  if (itensErr) return res.status(400).json({ erro: itensErr.message });

  const sorted = (itens || []).sort((a, b) => (a.catalogo?.ordem || 0) - (b.catalogo?.ordem || 0));
  res.json({
    cliente_nome: ob.clientes?.nome || '',
    onboarding_id: ob.id,
    status: ob.status,
    itens: sorted.map(i => ({
      id: i.id,
      obrigatorio: i.obrigatorio,
      status: i.status,
      categoria: i.catalogo?.categoria,
      label: i.catalogo?.label,
      descricao: i.catalogo?.descricao,
      tipo: i.catalogo?.tipo,
      ordem: i.catalogo?.ordem,
      resposta: i.respostas?.[0] || null
    }))
  });
});

// POST /api/onboarding/form/:token/resposta/:itemId
router.post('/form/:token/resposta/:itemId', async (req, res) => {
  const { token, itemId } = req.params;
  const { data: ob } = await supabase
    .from('onboarding_clientes')
    .select('id')
    .eq('token_publico', token)
    .single();
  if (!ob) return res.status(404).json({ erro: 'Token inválido' });

  const { data: item } = await supabase
    .from('onboarding_itens_cliente')
    .select('id')
    .eq('id', itemId)
    .eq('onboarding_id', ob.id)
    .single();
  if (!item) return res.status(404).json({ erro: 'Item não encontrado' });

  const { tipo_resposta, valor_texto, valor_checkbox, nome, tipo, data: base64Data } = req.body;
  const respostaData = { item_id: itemId, tipo_resposta, respondido_em: new Date().toISOString() };

  if (tipo_resposta === 'arquivo' && base64Data && nome) {
    const safeName = nome.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${token}/${itemId}/${Date.now()}_${safeName}`;
    const b64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(b64, 'base64');
    const { error: upErr } = await supabase.storage
      .from('onboarding')
      .upload(storagePath, buffer, { contentType: tipo || 'application/octet-stream', upsert: true });
    if (upErr) return res.status(400).json({ erro: upErr.message });
    const { data: urlData } = supabase.storage.from('onboarding').getPublicUrl(storagePath);
    respostaData.arquivo_url = urlData.publicUrl;
    respostaData.arquivo_storage_path = storagePath;
    respostaData.arquivo_nome = nome;
  } else if (tipo_resposta === 'checkbox') {
    respostaData.valor_checkbox = valor_checkbox;
  } else {
    respostaData.valor_texto = valor_texto;
  }

  const { data: existing } = await supabase
    .from('onboarding_respostas').select('id').eq('item_id', itemId).single();

  let data, error;
  if (existing) {
    ({ data, error } = await supabase.from('onboarding_respostas')
      .update(respostaData).eq('item_id', itemId).select().single());
  } else {
    ({ data, error } = await supabase.from('onboarding_respostas')
      .insert([respostaData]).select().single());
  }
  if (error) return res.status(400).json({ erro: error.message });

  await supabase.from('onboarding_itens_cliente').update({ status: 'recebido' }).eq('id', itemId);
  await supabase.from('onboarding_clientes')
    .update({ status: 'em_revisao', atualizado_em: new Date().toISOString() })
    .eq('id', ob.id).eq('status', 'aguardando_cliente');

  res.json(data);
});

// ── ROTAS AUTENTICADAS ─────────────────────────────────────

// GET /api/onboarding/resumo
router.get('/resumo', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('onboarding_clientes')
    .select(`id, cliente_id, status, data_envio, data_conclusao, atualizado_em,
      clientes(nome),
      itens:onboarding_itens_cliente(id, status, obrigatorio)`)
    .order('atualizado_em', { ascending: false });
  if (error) return res.status(400).json({ erro: error.message });

  res.json((data || []).map(ob => {
    const itens = ob.itens || [];
    const total = itens.length;
    const resp = itens.filter(i => ['recebido', 'aprovado'].includes(i.status)).length;
    return {
      id: ob.id, cliente_id: ob.cliente_id,
      cliente_nome: ob.clientes?.nome || '',
      status: ob.status, data_envio: ob.data_envio,
      data_conclusao: ob.data_conclusao, atualizado_em: ob.atualizado_em,
      total_itens: total, itens_respondidos: resp,
      progresso: total > 0 ? Math.round(resp / total * 100) : 0
    };
  }));
});

// GET /api/onboarding/categorias
router.get('/categorias', auth, async (req, res) => {
  const { data: cats, error } = await supabase
    .from('onboarding_categorias').select('*').order('ordem').order('nome');
  if (error) return res.status(400).json({ erro: error.message });
  const { data: itens } = await supabase
    .from('onboarding_itens_catalogo').select('categoria');
  const counts = {};
  (itens || []).forEach(i => { counts[i.categoria] = (counts[i.categoria] || 0) + 1; });
  res.json((cats || []).map(c => ({ ...c, item_count: counts[c.nome] || 0 })));
});

// POST /api/onboarding/categorias
router.post('/categorias', auth, async (req, res) => {
  if (req.usuario.papel !== 'admin') return res.status(403).json({ erro: 'Apenas admin' });
  const { nome, descricao, ordem } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });
  const { data, error } = await supabase.from('onboarding_categorias')
    .insert([{ nome: nome.trim(), descricao: descricao || null, ordem: ordem || 0 }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

// GET /api/onboarding/catalogo
router.get('/catalogo', auth, async (req, res) => {
  let q = supabase.from('onboarding_itens_catalogo').select('*').order('ordem');
  if (req.usuario.papel !== 'admin') q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data || []);
});

// Desloca para cima todos os itens com ordem >= novaOrdem (exceto o próprio item)
async function shiftOrdem(novaOrdem, excludeId = null) {
  let q = supabase.from('onboarding_itens_catalogo').select('id, ordem').gte('ordem', novaOrdem);
  if (excludeId) q = q.neq('id', excludeId);
  const { data: toShift } = await q;
  for (const item of (toShift || [])) {
    await supabase.from('onboarding_itens_catalogo')
      .update({ ordem: item.ordem + 1 })
      .eq('id', item.id);
  }
}

// POST /api/onboarding/catalogo
router.post('/catalogo', auth, async (req, res) => {
  if (req.usuario.papel !== 'admin') return res.status(403).json({ erro: 'Apenas admin' });
  const { categoria, label, descricao, tipo, obrigatorio_por_padrao, ordem } = req.body;
  if (!categoria || !label) return res.status(400).json({ erro: 'categoria e label são obrigatórios' });
  const novaOrdem = ordem ?? 0;
  // Verifica conflito de ordem
  const { data: conflict } = await supabase.from('onboarding_itens_catalogo')
    .select('id').eq('ordem', novaOrdem).limit(1);
  if (conflict?.length) await shiftOrdem(novaOrdem);
  const { data, error } = await supabase.from('onboarding_itens_catalogo')
    .insert([{ categoria, label, descricao, tipo: tipo || 'upload',
      obrigatorio_por_padrao: obrigatorio_por_padrao ?? false,
      ordem: novaOrdem, criado_por: req.usuario.id }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

// PATCH /api/onboarding/catalogo/:itemId
router.patch('/catalogo/:itemId', auth, async (req, res) => {
  if (req.usuario.papel !== 'admin') return res.status(403).json({ erro: 'Apenas admin' });
  const { itemId } = req.params;
  const cols = ['categoria','label','descricao','tipo','obrigatorio_por_padrao','ordem','ativo'];
  const updates = {};
  cols.forEach(c => { if (req.body[c] !== undefined) updates[c] = req.body[c]; });
  // Se a ordem está sendo alterada, verifica conflito
  if (updates.ordem !== undefined) {
    const { data: conflict } = await supabase.from('onboarding_itens_catalogo')
      .select('id').eq('ordem', updates.ordem).neq('id', itemId).limit(1);
    if (conflict?.length) await shiftOrdem(updates.ordem, itemId);
  }
  const { data, error } = await supabase.from('onboarding_itens_catalogo')
    .update(updates).eq('id', itemId).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// DELETE /api/onboarding/catalogo/:itemId (exclusão permanente)
router.delete('/catalogo/:itemId', auth, async (req, res) => {
  if (req.usuario.papel !== 'admin') return res.status(403).json({ erro: 'Apenas admin' });
  const { itemId } = req.params;
  // Remove respostas e itens de clientes que referenciam este catálogo
  const { data: clienteItens } = await supabase
    .from('onboarding_itens_cliente').select('id').eq('catalogo_id', itemId);
  for (const ci of (clienteItens || [])) {
    await supabase.from('onboarding_respostas').delete().eq('item_id', ci.id);
    await supabase.from('onboarding_itens_cliente').delete().eq('id', ci.id);
  }
  const { error } = await supabase.from('onboarding_itens_catalogo').delete().eq('id', itemId);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

// PATCH /api/onboarding/categorias/:id
router.patch('/categorias/:id', auth, async (req, res) => {
  if (req.usuario.papel !== 'admin') return res.status(403).json({ erro: 'Apenas admin' });
  const { nome, descricao, ordem } = req.body;
  const { data: atual } = await supabase.from('onboarding_categorias')
    .select('nome').eq('id', req.params.id).single();
  const updates = {};
  if (nome !== undefined) updates.nome = nome.trim();
  if (descricao !== undefined) updates.descricao = descricao;
  if (ordem !== undefined) updates.ordem = ordem;
  const { data, error } = await supabase.from('onboarding_categorias')
    .update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  if (nome && atual && nome.trim() !== atual.nome) {
    await supabase.from('onboarding_itens_catalogo')
      .update({ categoria: nome.trim() }).eq('categoria', atual.nome);
  }
  res.json(data);
});

// DELETE /api/onboarding/categorias/:id
router.delete('/categorias/:id', auth, async (req, res) => {
  if (req.usuario.papel !== 'admin') return res.status(403).json({ erro: 'Apenas admin' });
  const { data: cat } = await supabase.from('onboarding_categorias')
    .select('nome').eq('id', req.params.id).single();
  if (cat?.nome) {
    const { data: itensCat } = await supabase
      .from('onboarding_itens_catalogo').select('id').eq('categoria', cat.nome);
    for (const item of (itensCat || [])) {
      const { data: clienteItens } = await supabase
        .from('onboarding_itens_cliente').select('id').eq('catalogo_id', item.id);
      for (const ci of (clienteItens || [])) {
        await supabase.from('onboarding_respostas').delete().eq('item_id', ci.id);
        await supabase.from('onboarding_itens_cliente').delete().eq('id', ci.id);
      }
      await supabase.from('onboarding_itens_catalogo').delete().eq('id', item.id);
    }
  }
  const { error } = await supabase.from('onboarding_categorias').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

// PATCH /api/onboarding/itens/:itemId
router.patch('/itens/:itemId', auth, async (req, res) => {
  const { status, observacao_interna, obrigatorio } = req.body;
  const updates = {};
  if (status !== undefined) updates.status = status;
  if (observacao_interna !== undefined) updates.observacao_interna = observacao_interna;
  if (obrigatorio !== undefined) updates.obrigatorio = obrigatorio;
  const { data, error } = await supabase.from('onboarding_itens_cliente')
    .update(updates).eq('id', req.params.itemId).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// POST /api/onboarding/cliente/:clienteId/enviar
router.post('/cliente/:clienteId/enviar', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('onboarding_clientes')
    .update({ data_envio: new Date().toISOString(), status: 'aguardando_cliente', atualizado_em: new Date().toISOString() })
    .eq('cliente_id', req.params.clienteId)
    .select('token_publico').single();
  if (error) return res.status(400).json({ erro: error.message });
  const url = `${req.protocol}://${req.get('host')}/onboarding/${data.token_publico}`;
  res.json({ url, token: data.token_publico });
});

// PATCH /api/onboarding/cliente/:clienteId/itens
router.patch('/cliente/:clienteId/itens', auth, async (req, res) => {
  const { itens } = req.body;
  const { data: ob } = await supabase.from('onboarding_clientes')
    .select('id').eq('cliente_id', req.params.clienteId).single();
  if (!ob) return res.status(404).json({ erro: 'Onboarding não encontrado' });

  const { data: existing } = await supabase.from('onboarding_itens_cliente')
    .select('id, catalogo_id').eq('onboarding_id', ob.id);
  const existingMap = new Map((existing || []).map(i => [i.catalogo_id, i.id]));

  for (const i of (itens || [])) {
    if (i.ativo === false) {
      if (existingMap.has(i.catalogo_id))
        await supabase.from('onboarding_itens_cliente').delete().eq('id', existingMap.get(i.catalogo_id));
    } else if (existingMap.has(i.catalogo_id)) {
      await supabase.from('onboarding_itens_cliente')
        .update({ obrigatorio: i.obrigatorio ?? true }).eq('id', existingMap.get(i.catalogo_id));
    } else {
      await supabase.from('onboarding_itens_cliente')
        .insert([{ onboarding_id: ob.id, catalogo_id: i.catalogo_id, obrigatorio: i.obrigatorio ?? true }]);
    }
  }
  res.json({ ok: true });
});

// PATCH /api/onboarding/cliente/:clienteId/status
router.patch('/cliente/:clienteId/status', auth, async (req, res) => {
  const { status, observacoes } = req.body;
  const updates = { atualizado_em: new Date().toISOString() };
  if (status) updates.status = status;
  if (observacoes !== undefined) updates.observacoes = observacoes;
  if (status === 'concluido') updates.data_conclusao = new Date().toISOString();
  const { data, error } = await supabase.from('onboarding_clientes')
    .update(updates).eq('cliente_id', req.params.clienteId).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// GET /api/onboarding/cliente/:clienteId
router.get('/cliente/:clienteId', auth, async (req, res) => {
  const { data: ob, error } = await supabase
    .from('onboarding_clientes')
    .select(`*, itens:onboarding_itens_cliente(
      id, obrigatorio, status, observacao_interna, criado_em,
      catalogo:onboarding_itens_catalogo(id, categoria, label, descricao, tipo, ordem),
      respostas:onboarding_respostas(tipo_resposta, valor_texto, valor_checkbox, arquivo_url, arquivo_nome, respondido_em)
    )`)
    .eq('cliente_id', req.params.clienteId)
    .single();
  if (error && error.code !== 'PGRST116') return res.status(400).json({ erro: error.message });
  if (!ob) return res.json(null);

  const itens = (ob.itens || []).sort((a, b) => (a.catalogo?.ordem || 0) - (b.catalogo?.ordem || 0));
  const total = itens.length;
  const resp = itens.filter(i => ['recebido', 'aprovado'].includes(i.status)).length;
  res.json({ ...ob, itens, progresso: total > 0 ? Math.round(resp / total * 100) : 0, total_itens: total, itens_respondidos: resp });
});

// DELETE /api/onboarding/cliente/:clienteId
router.delete('/cliente/:clienteId', auth, async (req, res) => {
  const { clienteId } = req.params;
  const { data: ob, error: getErr } = await supabase
    .from('onboarding_clientes')
    .select('id, token_publico')
    .eq('cliente_id', clienteId)
    .single();
  if (getErr) return res.status(400).json({ erro: getErr.message });
  if (!ob) return res.status(404).json({ erro: 'Onboarding não encontrado' });

  // Remove arquivos do Storage
  const { data: respostas } = await supabase
    .from('onboarding_respostas')
    .select('arquivo_storage_path')
    .not('arquivo_storage_path', 'is', null);
  const paths = (respostas || []).map(r => r.arquivo_storage_path).filter(Boolean);
  if (paths.length) await supabase.storage.from('onboarding').remove(paths);

  // Cascade deleta itens e respostas via FK
  const { error } = await supabase.from('onboarding_clientes').delete().eq('id', ob.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

// POST /api/onboarding/cliente/:clienteId
router.post('/cliente/:clienteId', auth, async (req, res) => {
  const { clienteId } = req.params;
  const { itens } = req.body;
  if (!itens?.length) return res.status(400).json({ erro: 'Selecione ao menos um item' });

  const { data: ob, error: obErr } = await supabase.from('onboarding_clientes')
    .insert([{ cliente_id: clienteId, criado_por: req.usuario.id }])
    .select().single();
  if (obErr) return res.status(400).json({ erro: obErr.message });

  const { error: itemsErr } = await supabase.from('onboarding_itens_cliente')
    .insert(itens.map(i => ({ onboarding_id: ob.id, catalogo_id: i.catalogo_id, obrigatorio: i.obrigatorio ?? true })));
  if (itemsErr) return res.status(400).json({ erro: itemsErr.message });
  res.status(201).json(ob);
});

module.exports = router;
