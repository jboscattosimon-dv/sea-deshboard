const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

router.use(auth);

// ── Helpers ──────────────────────────────────────────────────────────

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function somarDias(dataISO, dias) {
  const d = new Date(dataISO + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Resolve a data concreta de prazo de uma tarefa de modelo, a partir da data
// de início do onboarding. MVP: só 'sem_prazo' e 'dias_apos_inicio_onboarding'
// são resolvidos; os demais tipos ficam reservados para evolução futura.
function resolverPrazo(tarefaTemplate, dataInicio) {
  if (tarefaTemplate.prazo_tipo === 'dias_apos_inicio_onboarding' && tarefaTemplate.prazo_dias != null) {
    return somarDias(dataInicio, tarefaTemplate.prazo_dias);
  }
  return null;
}

function calcularProgresso(etapas) {
  const todasTarefas = etapas.flatMap((e) => e.tarefas || []);
  const total = todasTarefas.length;
  const concluidas = todasTarefas.filter((t) => t.status === 'concluida').length;
  const hoje = hojeISO();
  const atrasadas = todasTarefas.filter((t) => t.status !== 'concluida' && t.prazo && t.prazo < hoje).length;
  const etapasComProgresso = etapas.map((e) => {
    const t = e.tarefas || [];
    const c = t.filter((x) => x.status === 'concluida').length;
    return {
      ...e,
      total_tarefas: t.length,
      tarefas_concluidas: c,
      progresso: t.length ? Math.round((c / t.length) * 100) : 0,
    };
  });
  return {
    total_tarefas: total,
    tarefas_concluidas: concluidas,
    progresso: total ? Math.round((concluidas / total) * 100) : 0,
    tarefas_atrasadas: atrasadas,
    etapas: etapasComProgresso,
  };
}

async function logAtividade(onboardingId, usuario, tipo, descricao) {
  await supabase.from('onboarding_atividades').insert([{
    onboarding_id: onboardingId,
    usuario_id: usuario?.id || null,
    usuario_nome: usuario?.nome || null,
    tipo,
    descricao,
  }]);
}

async function proximaOrdem(tabela, coluna, valor) {
  const { data } = await supabase
    .from(tabela).select('ordem').eq(coluna, valor).order('ordem', { ascending: false }).limit(1);
  return data?.length ? data[0].ordem + 1 : 0;
}

// ══════════════════════════════════════════════════════════════════════
//  MODELOS
// ══════════════════════════════════════════════════════════════════════

// GET /api/onboarding/templates
router.get('/templates', async (req, res) => {
  const { data, error } = await supabase
    .from('onboarding_templates')
    .select('*, etapas:onboarding_template_etapas(id, tarefas:onboarding_template_tarefas(id))')
    .order('criado_em', { ascending: false });
  if (error) return res.status(400).json({ erro: error.message });

  res.json((data || []).map((t) => ({
    id: t.id,
    nome: t.nome,
    descricao: t.descricao,
    ativo: t.ativo,
    criado_em: t.criado_em,
    total_etapas: (t.etapas || []).length,
    total_tarefas: (t.etapas || []).reduce((acc, e) => acc + (e.tarefas || []).length, 0),
  })));
});

// GET /api/onboarding/templates/:id
router.get('/templates/:id', async (req, res) => {
  const { data: template, error } = await supabase
    .from('onboarding_templates').select('*').eq('id', req.params.id).single();
  if (error || !template) return res.status(404).json({ erro: 'Modelo não encontrado' });

  const { data: etapas, error: eErr } = await supabase
    .from('onboarding_template_etapas')
    .select('*, tarefas:onboarding_template_tarefas(*)')
    .eq('template_id', req.params.id)
    .order('ordem');
  if (eErr) return res.status(400).json({ erro: eErr.message });

  template.etapas = (etapas || [])
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => ({ ...e, tarefas: (e.tarefas || []).sort((a, b) => a.ordem - b.ordem) }));

  res.json(template);
});

// POST /api/onboarding/templates
router.post('/templates', async (req, res) => {
  const { nome, descricao } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: 'Informe o nome do modelo' });
  const { data, error } = await supabase
    .from('onboarding_templates')
    .insert([{ nome: nome.trim(), descricao: descricao || null, criado_por: req.usuario.id }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

// PATCH /api/onboarding/templates/:id
router.patch('/templates/:id', async (req, res) => {
  const cols = ['nome', 'descricao', 'ativo'];
  const updates = { atualizado_em: new Date().toISOString() };
  cols.forEach((c) => { if (req.body[c] !== undefined) updates[c] = req.body[c]; });
  const { data, error } = await supabase
    .from('onboarding_templates').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// POST /api/onboarding/templates/:id/duplicar
router.post('/templates/:id/duplicar', async (req, res) => {
  const { data: original, error } = await supabase
    .from('onboarding_templates').select('*').eq('id', req.params.id).single();
  if (error || !original) return res.status(404).json({ erro: 'Modelo não encontrado' });

  const { data: etapas, error: eErr } = await supabase
    .from('onboarding_template_etapas')
    .select('*, tarefas:onboarding_template_tarefas(*)')
    .eq('template_id', req.params.id)
    .order('ordem');
  if (eErr) return res.status(400).json({ erro: eErr.message });

  const { data: novoTemplate, error: nErr } = await supabase
    .from('onboarding_templates')
    .insert([{ nome: original.nome + ' (cópia)', descricao: original.descricao, ativo: true, criado_por: req.usuario.id }])
    .select().single();
  if (nErr) return res.status(400).json({ erro: nErr.message });

  for (const etapa of (etapas || []).sort((a, b) => a.ordem - b.ordem)) {
    const { data: novaEtapa, error: neErr } = await supabase
      .from('onboarding_template_etapas')
      .insert([{ template_id: novoTemplate.id, nome: etapa.nome, ordem: etapa.ordem }])
      .select().single();
    if (neErr) return res.status(400).json({ erro: neErr.message });

    const tarefas = (etapa.tarefas || []).sort((a, b) => a.ordem - b.ordem).map((t) => ({
      etapa_id: novaEtapa.id,
      titulo: t.titulo,
      descricao: t.descricao,
      tipo: t.tipo,
      responsavel_tipo: t.responsavel_tipo,
      responsavel_usuario_id: t.responsavel_usuario_id,
      obrigatoria: t.obrigatoria,
      prazo_tipo: t.prazo_tipo,
      prazo_dias: t.prazo_dias,
      ordem: t.ordem,
    }));
    if (tarefas.length) {
      const { error: ntErr } = await supabase.from('onboarding_template_tarefas').insert(tarefas);
      if (ntErr) return res.status(400).json({ erro: ntErr.message });
    }
  }

  res.status(201).json(novoTemplate);
});

// DELETE /api/onboarding/templates/:id
router.delete('/templates/:id', async (req, res) => {
  const { error } = await supabase.from('onboarding_templates').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Modelo excluído' });
});

// ── Etapas do modelo ────────────────────────────────────────────────

// POST /api/onboarding/templates/:templateId/etapas
router.post('/templates/:templateId/etapas', async (req, res) => {
  const { templateId } = req.params;
  const ordem = await proximaOrdem('onboarding_template_etapas', 'template_id', templateId);
  const { data, error } = await supabase
    .from('onboarding_template_etapas')
    .insert([{ template_id: templateId, nome: req.body.nome || 'Nova etapa', ordem }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

// PATCH /api/onboarding/template-etapas/:etapaId
router.patch('/template-etapas/:etapaId', async (req, res) => {
  const updates = {};
  if (req.body.nome !== undefined) updates.nome = req.body.nome;
  if (req.body.ordem !== undefined) updates.ordem = req.body.ordem;
  const { data, error } = await supabase
    .from('onboarding_template_etapas').update(updates).eq('id', req.params.etapaId).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// DELETE /api/onboarding/template-etapas/:etapaId
router.delete('/template-etapas/:etapaId', async (req, res) => {
  const { error } = await supabase.from('onboarding_template_etapas').delete().eq('id', req.params.etapaId);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Etapa excluída' });
});

// ── Tarefas do modelo ───────────────────────────────────────────────

// POST /api/onboarding/template-etapas/:etapaId/tarefas
router.post('/template-etapas/:etapaId/tarefas', async (req, res) => {
  const { etapaId } = req.params;
  const ordem = await proximaOrdem('onboarding_template_tarefas', 'etapa_id', etapaId);
  const {
    titulo, descricao, tipo, responsavel_tipo, responsavel_usuario_id,
    obrigatoria, prazo_tipo, prazo_dias,
  } = req.body;
  if (!titulo?.trim()) return res.status(400).json({ erro: 'Informe o título da tarefa' });
  const { data, error } = await supabase
    .from('onboarding_template_tarefas')
    .insert([{
      etapa_id: etapaId,
      titulo: titulo.trim(),
      descricao: descricao || null,
      tipo: tipo || 'tarefa',
      responsavel_tipo: responsavel_tipo || 'definir_depois',
      responsavel_usuario_id: responsavel_tipo === 'pessoa' ? (responsavel_usuario_id || null) : null,
      obrigatoria: obrigatoria !== false,
      prazo_tipo: prazo_tipo || 'sem_prazo',
      prazo_dias: prazo_dias ?? null,
      ordem,
    }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

// PATCH /api/onboarding/template-tarefas/:tarefaId
router.patch('/template-tarefas/:tarefaId', async (req, res) => {
  const cols = ['titulo', 'descricao', 'tipo', 'responsavel_tipo', 'responsavel_usuario_id',
    'obrigatoria', 'prazo_tipo', 'prazo_dias', 'ordem'];
  const updates = {};
  cols.forEach((c) => { if (req.body[c] !== undefined) updates[c] = req.body[c]; });
  if (updates.responsavel_tipo && updates.responsavel_tipo !== 'pessoa') updates.responsavel_usuario_id = null;
  const { data, error } = await supabase
    .from('onboarding_template_tarefas').update(updates).eq('id', req.params.tarefaId).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// DELETE /api/onboarding/template-tarefas/:tarefaId
router.delete('/template-tarefas/:tarefaId', async (req, res) => {
  const { error } = await supabase.from('onboarding_template_tarefas').delete().eq('id', req.params.tarefaId);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Tarefa excluída' });
});

// ══════════════════════════════════════════════════════════════════════
//  ONBOARDINGS DE CLIENTE
// ══════════════════════════════════════════════════════════════════════

// GET /api/onboarding — visão geral
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('onboardings')
    .select(`*, clientes(nome), responsavel:usuarios!onboardings_responsavel_id_fkey(id, nome),
      etapas:onboarding_etapas(id, ordem, tarefas:onboarding_tarefas(id, status, prazo))`)
    .order('criado_em', { ascending: false });
  if (error) return res.status(400).json({ erro: error.message });

  const hoje = hojeISO();
  res.json((data || []).map((o) => {
    const etapas = (o.etapas || []).sort((a, b) => a.ordem - b.ordem);
    const todasTarefas = etapas.flatMap((e) => e.tarefas || []);
    const total = todasTarefas.length;
    const concluidas = todasTarefas.filter((t) => t.status === 'concluida').length;
    const atrasadas = todasTarefas.filter((t) => t.status !== 'concluida' && t.prazo && t.prazo < hoje).length;
    return {
      id: o.id,
      cliente_id: o.cliente_id,
      cliente_nome: o.clientes?.nome || '',
      nome: o.nome,
      status: o.status,
      responsavel_id: o.responsavel_id,
      responsavel_nome: o.responsavel?.nome || null,
      data_inicio: o.data_inicio,
      previsao_conclusao: o.previsao_conclusao,
      total_tarefas: total,
      tarefas_concluidas: concluidas,
      progresso: total ? Math.round((concluidas / total) * 100) : 0,
      tarefas_atrasadas: atrasadas,
      atrasado: atrasadas > 0 || (o.status === 'em_andamento' && o.previsao_conclusao && o.previsao_conclusao < hoje),
    };
  }));
});

// POST /api/onboarding — cria a partir de um modelo (cópia independente)
router.post('/', async (req, res) => {
  const { cliente_id, template_id, responsavel_id, data_inicio, previsao_conclusao } = req.body;
  if (!cliente_id || !template_id) return res.status(400).json({ erro: 'Selecione o cliente e o modelo' });

  const { data: existente } = await supabase.from('onboardings').select('id').eq('cliente_id', cliente_id).single();
  if (existente) return res.status(400).json({ erro: 'Este cliente já tem um onboarding cadastrado' });

  const { data: template, error: tErr } = await supabase
    .from('onboarding_templates').select('*').eq('id', template_id).single();
  if (tErr || !template) return res.status(404).json({ erro: 'Modelo não encontrado' });

  const { data: cliente, error: cErr } = await supabase
    .from('clientes').select('id, nome, responsavel_id').eq('id', cliente_id).single();
  if (cErr || !cliente) return res.status(404).json({ erro: 'Cliente não encontrado' });

  const { data: etapasTemplate, error: eErr } = await supabase
    .from('onboarding_template_etapas')
    .select('*, tarefas:onboarding_template_tarefas(*)')
    .eq('template_id', template_id)
    .order('ordem');
  if (eErr) return res.status(400).json({ erro: eErr.message });

  const inicio = data_inicio || hojeISO();

  const { data: onboarding, error: oErr } = await supabase
    .from('onboardings')
    .insert([{
      cliente_id,
      template_id,
      nome: template.nome,
      responsavel_id: responsavel_id || null,
      data_inicio: inicio,
      previsao_conclusao: previsao_conclusao || null,
      criado_por: req.usuario.id,
    }])
    .select().single();
  if (oErr) return res.status(400).json({ erro: oErr.message });

  for (const etapa of (etapasTemplate || []).sort((a, b) => a.ordem - b.ordem)) {
    const { data: novaEtapa, error: neErr } = await supabase
      .from('onboarding_etapas')
      .insert([{ onboarding_id: onboarding.id, nome: etapa.nome, ordem: etapa.ordem }])
      .select().single();
    if (neErr) return res.status(400).json({ erro: neErr.message });

    const tarefas = (etapa.tarefas || []).sort((a, b) => a.ordem - b.ordem).map((t) => {
      let responsavel_usuario_id = null;
      if (t.responsavel_tipo === 'pessoa') responsavel_usuario_id = t.responsavel_usuario_id || null;
      if (t.responsavel_tipo === 'cliente_responsavel') responsavel_usuario_id = cliente.responsavel_id || null;
      return {
        etapa_id: novaEtapa.id,
        titulo: t.titulo,
        descricao: t.descricao,
        tipo: t.tipo,
        responsavel_usuario_id,
        obrigatoria: t.obrigatoria,
        prazo: resolverPrazo(t, inicio),
        ordem: t.ordem,
      };
    });
    if (tarefas.length) {
      const { error: ntErr } = await supabase.from('onboarding_tarefas').insert(tarefas);
      if (ntErr) return res.status(400).json({ erro: ntErr.message });
    }
  }

  await logAtividade(onboarding.id, req.usuario, 'onboarding_criado', `Onboarding criado a partir do modelo "${template.nome}"`);

  res.status(201).json(onboarding);
});

// GET /api/onboarding/:id — detalhe completo
router.get('/:id', async (req, res) => {
  const { data: onboarding, error } = await supabase
    .from('onboardings')
    .select(`*, clientes(nome), responsavel:usuarios!onboardings_responsavel_id_fkey(id, nome)`)
    .eq('id', req.params.id).single();
  if (error || !onboarding) return res.status(404).json({ erro: 'Onboarding não encontrado' });

  const { data: etapas, error: eErr } = await supabase
    .from('onboarding_etapas')
    .select(`*, tarefas:onboarding_tarefas(*, responsavel:usuarios!onboarding_tarefas_responsavel_usuario_id_fkey(id, nome))`)
    .eq('onboarding_id', req.params.id)
    .order('ordem');
  if (eErr) return res.status(400).json({ erro: eErr.message });

  const etapasOrdenadas = (etapas || [])
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => ({ ...e, tarefas: (e.tarefas || []).sort((a, b) => a.ordem - b.ordem) }));

  const progresso = calcularProgresso(etapasOrdenadas);

  const { data: atividades } = await supabase
    .from('onboarding_atividades').select('*').eq('onboarding_id', req.params.id)
    .order('criado_em', { ascending: false }).limit(30);

  res.json({
    ...onboarding,
    cliente_nome: onboarding.clientes?.nome || '',
    responsavel_nome: onboarding.responsavel?.nome || null,
    ...progresso,
    atividades: atividades || [],
  });
});

// PATCH /api/onboarding/:id
router.patch('/:id', async (req, res) => {
  const cols = ['responsavel_id', 'previsao_conclusao', 'status', 'nome'];
  const updates = { atualizado_em: new Date().toISOString() };
  cols.forEach((c) => { if (req.body[c] !== undefined) updates[c] = req.body[c]; });
  if (updates.status === 'concluido') updates.concluido_em = new Date().toISOString();

  const { data, error } = await supabase
    .from('onboardings').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ erro: error.message });

  if (req.body.status) {
    await logAtividade(req.params.id, req.usuario, 'status_alterado', `Status alterado para "${req.body.status}"`);
  }
  if (req.body.responsavel_id !== undefined) {
    await logAtividade(req.params.id, req.usuario, 'responsavel_alterado', 'Responsável pelo onboarding alterado');
  }
  res.json(data);
});

// DELETE /api/onboarding/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('onboardings').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Onboarding excluído' });
});

// ── Etapas do onboarding do cliente ─────────────────────────────────

// POST /api/onboarding/:onboardingId/etapas
router.post('/:onboardingId/etapas', async (req, res) => {
  const { onboardingId } = req.params;
  const ordem = await proximaOrdem('onboarding_etapas', 'onboarding_id', onboardingId);
  const { data, error } = await supabase
    .from('onboarding_etapas')
    .insert([{ onboarding_id: onboardingId, nome: req.body.nome || 'Nova etapa', ordem }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  await logAtividade(onboardingId, req.usuario, 'etapa_criada', `Etapa criada: "${data.nome}"`);
  res.status(201).json(data);
});

// PATCH /api/onboarding/etapas/:etapaId
router.patch('/etapas/:etapaId', async (req, res) => {
  const updates = {};
  if (req.body.nome !== undefined) updates.nome = req.body.nome;
  if (req.body.ordem !== undefined) updates.ordem = req.body.ordem;
  const { data, error } = await supabase
    .from('onboarding_etapas').update(updates).eq('id', req.params.etapaId).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// DELETE /api/onboarding/etapas/:etapaId
router.delete('/etapas/:etapaId', async (req, res) => {
  const { data: etapa } = await supabase.from('onboarding_etapas').select('*').eq('id', req.params.etapaId).single();
  const { error } = await supabase.from('onboarding_etapas').delete().eq('id', req.params.etapaId);
  if (error) return res.status(400).json({ erro: error.message });
  if (etapa) await logAtividade(etapa.onboarding_id, req.usuario, 'etapa_excluida', `Etapa excluída: "${etapa.nome}"`);
  res.json({ mensagem: 'Etapa excluída' });
});

// ── Tarefas do onboarding do cliente ────────────────────────────────

// POST /api/onboarding/etapas/:etapaId/tarefas
router.post('/etapas/:etapaId/tarefas', async (req, res) => {
  const { etapaId } = req.params;
  const { data: etapa } = await supabase.from('onboarding_etapas').select('*').eq('id', etapaId).single();
  if (!etapa) return res.status(404).json({ erro: 'Etapa não encontrada' });

  const ordem = await proximaOrdem('onboarding_tarefas', 'etapa_id', etapaId);
  const { titulo, descricao, tipo, responsavel_usuario_id, obrigatoria, prazo } = req.body;
  if (!titulo?.trim()) return res.status(400).json({ erro: 'Informe o título da tarefa' });

  const { data, error } = await supabase
    .from('onboarding_tarefas')
    .insert([{
      etapa_id: etapaId,
      titulo: titulo.trim(),
      descricao: descricao || null,
      tipo: tipo || 'tarefa',
      responsavel_usuario_id: responsavel_usuario_id || null,
      obrigatoria: obrigatoria !== false,
      prazo: prazo || null,
      ordem,
    }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  await logAtividade(etapa.onboarding_id, req.usuario, 'tarefa_criada', `Tarefa criada: "${data.titulo}"`);
  res.status(201).json(data);
});

// PATCH /api/onboarding/tarefas/:tarefaId
router.patch('/tarefas/:tarefaId', async (req, res) => {
  const { data: atual } = await supabase.from('onboarding_tarefas').select('*, etapa:onboarding_etapas(onboarding_id)').eq('id', req.params.tarefaId).single();
  if (!atual) return res.status(404).json({ erro: 'Tarefa não encontrada' });

  const cols = ['titulo', 'descricao', 'tipo', 'responsavel_usuario_id', 'obrigatoria', 'status', 'prazo', 'ordem'];
  const updates = { atualizado_em: new Date().toISOString() };
  cols.forEach((c) => { if (req.body[c] !== undefined) updates[c] = req.body[c]; });

  if (updates.status === 'concluida' && atual.status !== 'concluida') {
    updates.concluido_em = new Date().toISOString();
    updates.concluido_por = req.usuario.id;
  } else if (updates.status && updates.status !== 'concluida') {
    updates.concluido_em = null;
    updates.concluido_por = null;
  }

  const { data, error } = await supabase
    .from('onboarding_tarefas').update(updates).eq('id', req.params.tarefaId).select().single();
  if (error) return res.status(400).json({ erro: error.message });

  const onboardingId = atual.etapa?.onboarding_id;
  if (onboardingId) {
    if (updates.status === 'concluida' && atual.status !== 'concluida') {
      await logAtividade(onboardingId, req.usuario, 'tarefa_concluida', `Tarefa concluída: "${atual.titulo}"`);
    } else if (updates.status && updates.status !== 'concluida' && atual.status === 'concluida') {
      await logAtividade(onboardingId, req.usuario, 'tarefa_reaberta', `Tarefa reaberta: "${atual.titulo}"`);
    } else if (req.body.responsavel_usuario_id !== undefined) {
      await logAtividade(onboardingId, req.usuario, 'responsavel_alterado', `Responsável alterado na tarefa: "${atual.titulo}"`);
    }
  }

  res.json(data);
});

// DELETE /api/onboarding/tarefas/:tarefaId
router.delete('/tarefas/:tarefaId', async (req, res) => {
  const { data: atual } = await supabase.from('onboarding_tarefas').select('*, etapa:onboarding_etapas(onboarding_id)').eq('id', req.params.tarefaId).single();
  const { error } = await supabase.from('onboarding_tarefas').delete().eq('id', req.params.tarefaId);
  if (error) return res.status(400).json({ erro: error.message });
  if (atual?.etapa?.onboarding_id) {
    await logAtividade(atual.etapa.onboarding_id, req.usuario, 'tarefa_excluida', `Tarefa excluída: "${atual.titulo}"`);
  }
  res.json({ mensagem: 'Tarefa excluída' });
});

// GET /api/onboarding/:onboardingId/atividades
router.get('/:onboardingId/atividades', async (req, res) => {
  const { data, error } = await supabase
    .from('onboarding_atividades').select('*').eq('onboarding_id', req.params.onboardingId)
    .order('criado_em', { ascending: false }).limit(100);
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data || []);
});

module.exports = router;
