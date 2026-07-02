const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const bcrypt = require('bcryptjs');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

function gerarId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 10);
}

// ============================================================
// ACESSO AO PORTAL (configurado pela equipe)
// ============================================================

router.get('/clientes/:id/portal', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, email, acesso_portal, ultimo_acesso')
    .eq('id', id)
    .single();

  if (error || !data) return res.status(404).json({ erro: 'Cliente não encontrado' });
  res.json(data);
});

router.put('/clientes/:id/portal', async (req, res) => {
  const { id } = req.params;
  const { email, senha, acesso_portal } = req.body;

  const updates = {};
  if (email !== undefined) updates.email = email ? email.toLowerCase().trim() : null;
  if (acesso_portal !== undefined) updates.acesso_portal = acesso_portal;
  if (senha) {
    if (senha.length < 6) return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres' });
    updates.senha_hash = await bcrypt.hash(senha, 10);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ erro: 'Nenhum campo para atualizar' });
  }

  const { data, error } = await supabase
    .from('clientes')
    .update(updates)
    .eq('id', id)
    .select('id, nome, email, acesso_portal, ultimo_acesso')
    .single();

  if (error) return res.status(400).json({ erro: 'Erro ao atualizar acesso do portal' });
  res.json(data);
});

// ============================================================
// ARTES FINAIS (equipe envia para aprovação do cliente)
// ============================================================

router.get('/demandas/:id/artes', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('portal_artes')
    .select('*')
    .eq('demanda_id', id)
    .order('versao', { ascending: false });

  if (error) return res.status(500).json({ erro: 'Erro ao buscar artes' });
  res.json(data || []);
});

router.post('/demandas/:id/artes', async (req, res) => {
  const { id } = req.params;
  const { nome, arquivo_b64, tipo } = req.body;

  if (!nome || !arquivo_b64) {
    return res.status(400).json({ erro: 'Arquivo e nome são obrigatórios' });
  }

  const { data: demanda } = await supabase
    .from('demandas')
    .select('id, cliente_id')
    .eq('id', id)
    .single();

  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada' });

  const sanitized = nome.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `portal/artes/${id}/${Date.now()}_${sanitized}`;
  const base64 = arquivo_b64.includes('base64,') ? arquivo_b64.split('base64,')[1] : arquivo_b64;
  const buffer = Buffer.from(base64, 'base64');

  const { error: upErr } = await supabase.storage
    .from('Portal')
    .upload(storagePath, buffer, { contentType: tipo || 'application/octet-stream' });

  if (upErr) return res.status(500).json({ erro: 'Erro ao fazer upload da arte' });

  const { data: urlData } = supabase.storage.from('Portal').getPublicUrl(storagePath);

  const { data: ultimaArte } = await supabase
    .from('portal_artes')
    .select('versao')
    .eq('demanda_id', id)
    .order('versao', { ascending: false })
    .limit(1)
    .single();

  const proximaVersao = (ultimaArte?.versao || 0) + 1;

  const { data, error } = await supabase
    .from('portal_artes')
    .insert([{
      id: gerarId('art_'),
      demanda_id: id,
      versao: proximaVersao,
      nome,
      url: urlData.publicUrl,
      storage_path: storagePath,
      tipo: tipo || null,
      responsavel_id: req.usuario.id,
      responsavel_nome: req.usuario.nome
    }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: 'Erro ao salvar arte' });

  await supabase.from('demandas').update({ arte_pronta: true }).eq('id', id);

  await supabase.from('portal_notificacoes').insert([{
    id: gerarId('ntf_'),
    cliente_id: demanda.cliente_id,
    tipo: 'arte_disponivel',
    titulo: 'Arte disponível para revisão',
    mensagem: `Uma nova arte (v${proximaVersao}) está disponível para sua aprovação.`,
    entidade: 'demanda',
    entidade_id: id
  }]);

  await supabase.from('historico').insert([{
    id: gerarId('h_'),
    tipo: 'arte_enviada',
    entidade: 'demanda',
    entidade_id: id,
    descricao: `${req.usuario.nome} enviou a arte v${proximaVersao}: ${nome}`,
    usuario_nome: req.usuario.nome
  }]);

  res.status(201).json(data);
});

router.delete('/demandas/:id/artes/:artId', async (req, res) => {
  const { id, artId } = req.params;

  const { data: arte } = await supabase
    .from('portal_artes')
    .select('*')
    .eq('id', artId)
    .eq('demanda_id', id)
    .single();

  if (!arte) return res.status(404).json({ erro: 'Arte não encontrada' });

  await supabase.storage.from('Portal').remove([arte.storage_path]);
  await supabase.from('portal_artes').delete().eq('id', artId);

  const { count } = await supabase
    .from('portal_artes')
    .select('id', { count: 'exact', head: true })
    .eq('demanda_id', id);

  if (count === 0) {
    await supabase.from('demandas').update({ arte_pronta: false }).eq('id', id);
  }

  res.json({ mensagem: 'Arte excluída com sucesso' });
});

// ============================================================
// COMENTÁRIOS (visão da equipe — leitura e envio)
// ============================================================

router.get('/demandas/:id/comentarios', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('portal_comentarios')
    .select('*, anexos:portal_comentario_anexos(*)')
    .eq('demanda_id', id)
    .order('criado_em', { ascending: true });

  if (error) return res.status(500).json({ erro: 'Erro ao buscar comentários' });
  res.json(data || []);
});

router.post('/demandas/:id/comentarios', async (req, res) => {
  const { id } = req.params;
  const { mensagem } = req.body;

  if (!mensagem?.trim()) return res.status(400).json({ erro: 'Mensagem é obrigatória' });

  const { data: demanda } = await supabase
    .from('demandas')
    .select('id, cliente_id')
    .eq('id', id)
    .single();

  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada' });

  const comentId = gerarId('cmt_');
  const { data, error } = await supabase
    .from('portal_comentarios')
    .insert([{
      id: comentId,
      demanda_id: id,
      autor_tipo: 'equipe',
      autor_id: req.usuario.id,
      autor_nome: req.usuario.nome,
      mensagem: mensagem.trim(),
      tem_anexo: false
    }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: 'Erro ao enviar comentário' });

  await supabase.from('portal_notificacoes').insert([{
    id: gerarId('ntf_'),
    cliente_id: demanda.cliente_id,
    tipo: 'nova_mensagem',
    titulo: 'Nova mensagem da equipe',
    mensagem: `${req.usuario.nome} enviou uma mensagem.`,
    entidade: 'demanda',
    entidade_id: id
  }]);

  res.status(201).json(data);
});

// ============================================================
// APROVAÇÕES — arte (legado) e demanda
// ============================================================

router.get('/demandas/:id/aprovacoes', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('portal_aprovacoes')
    .select('*')
    .eq('demanda_id', id)
    .order('criado_em', { ascending: false });

  if (error) return res.status(500).json({ erro: 'Erro ao buscar aprovações' });
  res.json(data || []);
});

// ============================================================
// PASTAS DO PORTAL (criadas pela equipe para o cliente)
// ============================================================

router.get('/clientes/:id/pastas', async (req, res) => {
  const { id } = req.params;

  const { data: pastas, error } = await supabase
    .from('portal_pastas')
    .select('id, nome, ordem, criado_em')
    .eq('cliente_id', id)
    .order('ordem')
    .order('criado_em');

  if (error) return res.status(500).json({ erro: 'Erro ao buscar pastas' });

  const ids = (pastas || []).map(p => p.id);
  const counts = {};
  if (ids.length > 0) {
    const { data: arqs } = await supabase
      .from('portal_arquivos')
      .select('pasta_id')
      .in('pasta_id', ids);
    (arqs || []).forEach(a => { counts[a.pasta_id] = (counts[a.pasta_id] || 0) + 1; });
  }

  res.json((pastas || []).map(p => ({ ...p, total_arquivos: counts[p.id] || 0 })));
});

router.post('/clientes/:id/pastas', async (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });

  const { data, error } = await supabase
    .from('portal_pastas')
    .insert([{ id: gerarId('pst_'), cliente_id: id, nome: nome.trim() }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: 'Erro ao criar pasta' });
  res.status(201).json(data);
});

router.delete('/clientes/:id/pastas/:pastaId', async (req, res) => {
  const { id, pastaId } = req.params;

  const { data: pasta } = await supabase
    .from('portal_pastas')
    .select('id')
    .eq('id', pastaId)
    .eq('cliente_id', id)
    .single();

  if (!pasta) return res.status(404).json({ erro: 'Pasta não encontrada' });

  await supabase.from('portal_arquivos').update({ pasta_id: null }).eq('pasta_id', pastaId);
  await supabase.from('portal_pastas').delete().eq('id', pastaId);
  res.json({ mensagem: 'Pasta excluída' });
});

router.get('/demandas/:id/aprovacoes-demanda', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('portal_aprovacoes_demanda')
    .select('*')
    .eq('demanda_id', id)
    .order('criado_em', { ascending: false });

  if (error) return res.status(500).json({ erro: 'Erro ao buscar aprovações da demanda' });
  res.json(data || []);
});

module.exports = router;
