const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

const FASES_PADRAO = [
  {
    nome: 'Implementação',
    periodo_label: 'Semana 1',
    etapas: [
      { titulo: 'Contrato assinado', responsavel: 'Gabriela', prazo_label: 'Dia 1', prazo_dias: 1, visivel_cliente: true },
      { titulo: 'Grupo do cliente criado', responsavel: 'Gabriela', prazo_label: 'Dia 1', prazo_dias: 1, visivel_cliente: true },
      { titulo: 'Mensagem de boas-vindas enviada', responsavel: 'Gabriela', prazo_label: 'Dia 1', prazo_dias: 1, visivel_cliente: true,
        mensagem_modelo: 'Oi, {{cliente}}! 🎉 Seja muito bem-vindo(a) à SEA! Estamos muito felizes em começar essa parceria com você. Nos próximos dias vamos te apresentar toda a equipe e organizar os primeiros passos da sua jornada com a gente. Qualquer dúvida, é só chamar por aqui!' },
      { titulo: 'Vídeo artístico de boas-vindas enviado', responsavel: 'Gabriela', prazo_label: 'Dia 2', prazo_dias: 2, visivel_cliente: true,
        mensagem_modelo: '{{cliente}}, preparamos um vídeo especial pra te dar as boas-vindas à SEA! 🎬 [inserir link do vídeo]' },
      { titulo: 'Apresentação da responsável pelo atendimento', responsavel: 'Maitê', prazo_label: 'Dia 2', prazo_dias: 2, visivel_cliente: true,
        mensagem_modelo: '{{cliente}}, quero te apresentar a [nome], responsável pelo seu atendimento! Ela vai te acompanhar de perto durante toda a parceria e é quem você vai falar no dia a dia. 💙' },
      { titulo: 'Reunião de iniciação agendada', responsavel: 'Maitê', prazo_label: 'Dia 3', prazo_dias: 3, visivel_cliente: true,
        mensagem_modelo: '{{cliente}}, vamos agendar nossa reunião de iniciação pra alinhar tudo sobre a sua estratégia! Qual dia e horário funcionam melhor pra você essa semana?' },
      { titulo: 'Presente de boas-vindas enviado', responsavel: 'Gabriela', prazo_label: 'Semana 1', prazo_dias: 7, visivel_cliente: true },
    ],
  },
  {
    nome: 'Processos',
    periodo_label: 'Semana 2',
    etapas: [
      { titulo: 'Reunião de iniciação realizada', responsavel: 'Gabriela', prazo_label: 'Dia 8', prazo_dias: 8, visivel_cliente: true },
      { titulo: 'Trello e Drive criados, com acessos liberados', responsavel: 'Gabriela', prazo_label: 'Dia 8', prazo_dias: 8, visivel_cliente: false },
      { titulo: 'Plano de marketing construído', responsavel: 'Gabriela', prazo_label: 'Dia 10', prazo_dias: 10, visivel_cliente: false },
      { titulo: 'Mapa de iniciação enviado', responsavel: 'Maitê', prazo_label: 'Dia 9', prazo_dias: 9, visivel_cliente: true,
        mensagem_modelo: '{{cliente}}, segue o mapa de iniciação com tudo que vamos precisar pra montar sua estratégia! Dá uma olhada com calma e qualquer dúvida me chama. 📋' },
      { titulo: 'Formulário de dados enviado e preenchido', responsavel: 'Maitê', prazo_label: 'Dia 9', prazo_dias: 9, visivel_cliente: true,
        acao_label: 'Preencher formulário' },
      { titulo: 'Reunião de entrega do plano de estratégia realizada', responsavel: 'Maitê', prazo_label: 'Dia 14', prazo_dias: 14, visivel_cliente: true },
    ],
  },
  {
    nome: 'Ambientação',
    periodo_label: 'Semana 3',
    etapas: [
      { titulo: 'Reunião de Jornada de Implementação realizada', responsavel: 'Maitê', prazo_label: 'Dia 17', prazo_dias: 17, visivel_cliente: true },
      { titulo: 'Vídeo de apresentação pós-reunião enviado', responsavel: 'Maitê', prazo_label: 'Dia 17', prazo_dias: 17, visivel_cliente: true,
        mensagem_modelo: '{{cliente}}, preparamos um vídeo recapitulando tudo o que conversamos na nossa reunião! Assim fica mais fácil revisitar sempre que precisar. 🎥' },
      { titulo: 'Mensagem de reestruturação de perfil enviada', responsavel: 'Maitê', prazo_label: 'Quando aplicável', prazo_dias: null, visivel_cliente: true,
        mensagem_modelo: '{{cliente}}, chegou a hora de reestruturarmos seu perfil pra deixá-lo alinhado com a nova estratégia! Vamos te guiar em cada passo.' },
    ],
  },
  {
    nome: 'Finalização',
    periodo_label: 'Semana 4',
    etapas: [
      { titulo: 'Calendário de conteúdo entregue', responsavel: 'Laura', prazo_label: 'Dia 25', prazo_dias: 25, visivel_cliente: true,
        mensagem_modelo: '{{cliente}}, seu primeiro calendário de conteúdo está pronto! 🗓️ Dá uma olhada e nos conta o que achou — qualquer ajuste, é só sinalizar.' },
      { titulo: 'Áudio explicando a construção da estratégia', responsavel: 'Laura', prazo_label: 'Dia 25', prazo_dias: 25, visivel_cliente: true,
        mensagem_modelo: '{{cliente}}, gravamos um áudio explicando como construímos sua estratégia e o raciocínio por trás de cada escolha. Vale a pena ouvir com calma! 🎧' },
      { titulo: 'Orientação sobre prazos enviada', responsavel: 'Maitê', prazo_label: 'Dia 26', prazo_dias: 26, visivel_cliente: true,
        mensagem_modelo: '{{cliente}}, passando aqui pra alinhar os prazos e responsabilidades da nossa parceria — assim fica tudo claro sobre o que esperar de cada lado. ⏰' },
      { titulo: 'Conferência final das entregas do mês', responsavel: 'Maitê', prazo_label: 'Dia 30', prazo_dias: 30, visivel_cliente: false },
      { titulo: 'Primeira postagem realizada', responsavel: 'Maitê', prazo_label: 'Dia 1 (mês seguinte)', prazo_dias: 31, visivel_cliente: true },
      { titulo: 'Mensagem de comemoração enviada', responsavel: 'Maitê', prazo_label: 'Dia 1 (mês seguinte)', prazo_dias: 31, visivel_cliente: true,
        mensagem_modelo: '{{cliente}}, chegamos ao fim do seu onboarding! 🎉 Estamos muito animados com tudo que vem por aí. Obrigado pela confiança — bora pra cima!' },
    ],
  },
];

const CHECKLIST_PADRAO = [
  { grupo: 'contrato_estrutura', itens: [
    'Contrato assinado',
    'Grupo do cliente criado e configurado',
    'Trello/ambiente do cliente criado e acessos funcionando',
    'Drive criado e acessos funcionando',
    'Todos os acessos necessários à equipe estão funcionando',
  ]},
  { grupo: 'estrategia', itens: [
    'Informações e formulário do cliente recebidos',
    'Plano de Marketing finalizado, apresentado e aprovado',
    'Equipe alinhada sobre a estratégia aprovada',
  ]},
  { grupo: 'ambientacao', itens: [
    'Jornada de Implementação realizada',
    'Cliente sabe utilizar o ambiente de aprovação e o Drive',
    'Cliente conhece prazos e responsabilidades',
    'Acesso ao Instagram realizado e validado',
  ]},
  { grupo: 'primeiro_calendario', itens: [
    'Primeiro calendário editorial finalizado, entregue, explicado e aprovado',
    'Materiais e vídeos necessários recebidos',
    'Primeiros conteúdos prontos/programados',
  ]},
  { grupo: 'conferencia_final', itens: [
    'Nenhuma pendência interna ou do cliente em aberto',
    'Primeira postagem realizada',
    'Mensagem de comemoração enviada',
  ]},
];

// ── ROTA PÚBLICA (sem auth, só valida token) ────────────────

// GET /api/jornada/publica/:token
router.get('/publica/:token', async (req, res) => {
  const { token } = req.params;
  const { data: jornada, error } = await supabase
    .from('jornada_onboarding')
    .select('id, status, criado_em, clientes(nome)')
    .eq('token_publico', token)
    .single();
  if (error || !jornada) return res.status(404).json({ erro: 'Jornada não encontrada' });

  const { data: fases, error: fasesErr } = await supabase
    .from('jornada_fases')
    .select('id, nome, periodo_label, ordem, etapas:jornada_etapas(id, titulo, status, prazo_label, acao_url, acao_label, visivel_cliente, ordem)')
    .eq('jornada_id', jornada.id)
    .order('ordem');
  if (fasesErr) return res.status(400).json({ erro: fasesErr.message });

  const fasesVisiveis = (fases || [])
    .sort((a, b) => a.ordem - b.ordem)
    .map((f) => {
      const etapas = (f.etapas || [])
        .filter((e) => e.visivel_cliente)
        .sort((a, b) => a.ordem - b.ordem)
        .map((e) => ({
          id: e.id,
          titulo: e.titulo,
          status: e.status,
          prazo_label: e.prazo_label,
          acao_url: e.acao_url,
          acao_label: e.acao_label,
        }));
      const total = etapas.length;
      const done = etapas.filter((e) => e.status === 'concluido').length;
      return { id: f.id, nome: f.nome, periodo_label: f.periodo_label, etapas, pct: total ? Math.round((done / total) * 100) : 100 };
    });

  res.json({
    cliente_nome: jornada.clientes?.nome || '',
    status: jornada.status,
    fases: fasesVisiveis,
  });
});

// ── ROTAS AUTENTICADAS ───────────────────────────────────────
// (só o necessário para criar e conferir a jornada nesta etapa;
// edição inline, checklist de encerramento e listagem geral entram
// no painel interno, na próxima etapa do projeto)

// POST /api/jornada/cliente/:clienteId — cria a jornada e semeia fases/etapas/checklist padrão
router.post('/cliente/:clienteId', auth, async (req, res) => {
  const { clienteId } = req.params;

  const { data: existente } = await supabase
    .from('jornada_onboarding').select('id').eq('cliente_id', clienteId).single();
  if (existente) return res.status(400).json({ erro: 'Este cliente já tem uma jornada de onboarding' });

  const { data: jornada, error: jErr } = await supabase
    .from('jornada_onboarding')
    .insert([{ cliente_id: clienteId, criado_por: req.usuario.id }])
    .select().single();
  if (jErr) return res.status(400).json({ erro: jErr.message });

  for (let i = 0; i < FASES_PADRAO.length; i++) {
    const faseDef = FASES_PADRAO[i];
    const { data: fase, error: fErr } = await supabase
      .from('jornada_fases')
      .insert([{ jornada_id: jornada.id, nome: faseDef.nome, periodo_label: faseDef.periodo_label, ordem: i }])
      .select().single();
    if (fErr) return res.status(400).json({ erro: fErr.message });

    const etapasInsert = faseDef.etapas.map((e, idx) => ({
      fase_id: fase.id,
      titulo: e.titulo,
      responsavel: e.responsavel,
      status: 'pendente',
      prazo_label: e.prazo_label || null,
      prazo_dias: e.prazo_dias ?? null,
      mensagem_modelo: e.mensagem_modelo || null,
      acao_url: e.acao_url || null,
      acao_label: e.acao_label || null,
      visivel_cliente: e.visivel_cliente,
      ordem: idx,
    }));
    const { error: eErr } = await supabase.from('jornada_etapas').insert(etapasInsert);
    if (eErr) return res.status(400).json({ erro: eErr.message });
  }

  const checklistInsert = [];
  let ordem = 0;
  for (const grupoDef of CHECKLIST_PADRAO) {
    for (const label of grupoDef.itens) {
      checklistInsert.push({ jornada_id: jornada.id, grupo: grupoDef.grupo, label, ordem: ordem++ });
    }
  }
  const { error: cErr } = await supabase.from('jornada_checklist').insert(checklistInsert);
  if (cErr) return res.status(400).json({ erro: cErr.message });

  res.status(201).json({ ...jornada, url: `${req.protocol}://${req.get('host')}/jornada/${jornada.token_publico}` });
});

// GET /api/jornada/cliente/:clienteId — detalhe completo (uso interno)
router.get('/cliente/:clienteId', auth, async (req, res) => {
  const { data: jornada, error } = await supabase
    .from('jornada_onboarding')
    .select('*, clientes(nome), fases:jornada_fases(*, etapas:jornada_etapas(*)), checklist:jornada_checklist(*)')
    .eq('cliente_id', req.params.clienteId)
    .single();
  if (error && error.code !== 'PGRST116') return res.status(400).json({ erro: error.message });
  if (!jornada) return res.json(null);

  jornada.fases = (jornada.fases || [])
    .sort((a, b) => a.ordem - b.ordem)
    .map((f) => ({ ...f, etapas: (f.etapas || []).sort((a, b) => a.ordem - b.ordem) }));
  jornada.checklist = (jornada.checklist || []).sort((a, b) => a.ordem - b.ordem);

  res.json(jornada);
});

// GET /api/jornada — lista todos os clientes com jornada ativa (painel interno)
router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('jornada_onboarding')
    .select('id, cliente_id, status, criado_em, clientes(nome), fases:jornada_fases(id, nome, ordem, etapas:jornada_etapas(id, titulo, status, prazo_dias, ordem))')
    .order('criado_em', { ascending: false });
  if (error) return res.status(400).json({ erro: error.message });

  const agora = Date.now();
  res.json((data || []).map((j) => {
    const fases = (j.fases || [])
      .sort((a, b) => a.ordem - b.ordem)
      .map((f) => ({ ...f, etapas: (f.etapas || []).sort((a, b) => a.ordem - b.ordem) }));
    const todasEtapas = fases.flatMap((f) => f.etapas);
    const total = todasEtapas.length;
    const done = todasEtapas.filter((e) => e.status === 'concluido').length;
    const atrasadas = todasEtapas.filter((e) => {
      if (e.status === 'concluido' || e.prazo_dias == null) return false;
      const limite = new Date(j.criado_em).getTime() + e.prazo_dias * 86400000;
      return agora > limite;
    }).length;
    let faseAtual = '';
    for (const f of fases) {
      if (f.etapas.some((e) => e.status !== 'concluido')) { faseAtual = f.nome; break; }
    }
    if (!faseAtual && fases.length) faseAtual = fases[fases.length - 1].nome;
    const fasesConcluidas = fases.filter((f) => f.etapas.length && f.etapas.every((e) => e.status === 'concluido')).length;
    const pendentes = todasEtapas.filter((e) => e.status !== 'concluido').map((e) => e.titulo);
    return {
      id: j.id,
      cliente_id: j.cliente_id,
      cliente_nome: j.clientes?.nome || '',
      status: j.status,
      fase_atual: faseAtual,
      total_fases: fases.length,
      fases_concluidas: fasesConcluidas,
      progresso: total ? Math.round((done / total) * 100) : 0,
      etapas_atrasadas: atrasadas,
      proximas_etapas: pendentes.slice(0, 2),
      total_pendentes: pendentes.length,
    };
  }));
});

// PATCH /api/jornada/etapas/:etapaId — edição inline
router.patch('/etapas/:etapaId', auth, async (req, res) => {
  const cols = ['titulo', 'responsavel', 'status', 'prazo_label', 'prazo_dias', 'notas', 'mensagem_modelo', 'mensagem_enviada', 'acao_url', 'acao_label', 'visivel_cliente'];
  const updates = {};
  cols.forEach((c) => { if (req.body[c] !== undefined) updates[c] = req.body[c]; });
  if (updates.status === 'concluido') {
    updates.concluido_por = req.usuario.id;
    updates.concluido_em = new Date().toISOString();
  } else if (updates.status) {
    updates.concluido_por = null;
    updates.concluido_em = null;
  }
  const { data, error } = await supabase.from('jornada_etapas').update(updates).eq('id', req.params.etapaId).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// DELETE /api/jornada/etapas/:etapaId
router.delete('/etapas/:etapaId', auth, async (req, res) => {
  const { error } = await supabase.from('jornada_etapas').delete().eq('id', req.params.etapaId);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

// POST /api/jornada/fases/:faseId/etapas — nova etapa
router.post('/fases/:faseId/etapas', auth, async (req, res) => {
  const { faseId } = req.params;
  const { data: ultima } = await supabase
    .from('jornada_etapas').select('ordem').eq('fase_id', faseId).order('ordem', { ascending: false }).limit(1);
  const novaOrdem = ultima?.length ? ultima[0].ordem + 1 : 0;
  const { data, error } = await supabase.from('jornada_etapas').insert([{
    fase_id: faseId,
    titulo: req.body.titulo || 'Nova etapa',
    responsavel: req.body.responsavel || 'Gabriela',
    status: 'pendente',
    prazo_label: req.body.prazo_label || null,
    ordem: novaOrdem,
  }]).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

// PATCH /api/jornada/checklist/:itemId — marcar/desmarcar item de encerramento
router.patch('/checklist/:itemId', auth, async (req, res) => {
  const concluido = !!req.body.concluido;
  const updates = {
    concluido,
    concluido_por: concluido ? req.usuario.id : null,
    concluido_em: concluido ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase.from('jornada_checklist').update(updates).eq('id', req.params.itemId).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// PATCH /api/jornada/:jornadaId/status — concluir (valida checklist) ou reabrir
router.patch('/:jornadaId/status', auth, async (req, res) => {
  const { jornadaId } = req.params;
  const { status } = req.body;
  if (status === 'concluido') {
    const { data: itens, error: itensErr } = await supabase
      .from('jornada_checklist').select('concluido').eq('jornada_id', jornadaId);
    if (itensErr) return res.status(400).json({ erro: itensErr.message });
    const pendentes = (itens || []).filter((i) => !i.concluido).length;
    if (pendentes > 0) return res.status(400).json({ erro: `Ainda faltam ${pendentes} itens do checklist de encerramento` });
  }
  const updates = { status };
  if (status === 'concluido') {
    updates.concluido_em = new Date().toISOString();
    updates.concluido_por = req.usuario.id;
  } else {
    updates.concluido_em = null;
    updates.concluido_por = null;
  }
  const { data, error } = await supabase.from('jornada_onboarding').update(updates).eq('id', jornadaId).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// DELETE /api/jornada/cliente/:clienteId — exclui a jornada inteira
router.delete('/cliente/:clienteId', auth, async (req, res) => {
  const { data: jornada } = await supabase
    .from('jornada_onboarding').select('id').eq('cliente_id', req.params.clienteId).single();
  if (!jornada) return res.status(404).json({ erro: 'Jornada não encontrada' });
  const { error } = await supabase.from('jornada_onboarding').delete().eq('id', jornada.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

module.exports = router;
