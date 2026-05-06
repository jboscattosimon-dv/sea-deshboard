const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// ── Permissão CRM ──────────────────────────────────────
function checkCrmPerm(req, res, type) {
  const u = req.usuario;
  if (!u) return false;
  if (u.papel === 'admin') return true;
  const p = (u.permissoes || {});
  const perm = p['crm_' + type] || {};
  if (type === 'visualizar') return perm.visualizar !== false;
  if (type === 'editar')     return perm.editar !== false;
  return false;
}

// ── ETAPAS ────────────────────────────────────────────
router.get('/etapas', async (req, res) => {
  const { data, error } = await supabase.from('crm_etapas').select('*').order('ordem');
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/etapas', async (req, res) => {
  const { key, label, cor, ordem, pedir_motivo } = req.body;
  if (!key || !label) return res.status(400).json({ erro: 'key e label são obrigatórios' });
  const { data, error } = await supabase
    .from('crm_etapas')
    .insert([{ key: key.toLowerCase().replace(/\s+/g,'_'), label, cor: cor||'#999999', ordem: ordem||0, pedir_motivo: pedir_motivo||false }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/etapas/:id', async (req, res) => {
  const { label, cor, ordem, pedir_motivo } = req.body;
  const updates = {};
  if (label         !== undefined) updates.label         = label;
  if (cor           !== undefined) updates.cor           = cor;
  if (ordem         !== undefined) updates.ordem         = parseInt(ordem);
  if (pedir_motivo  !== undefined) updates.pedir_motivo  = pedir_motivo;
  const { data, error } = await supabase
    .from('crm_etapas').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/etapas/:id', async (req, res) => {
  const etapaRes = await supabase.from('crm_etapas').select('key').eq('id', req.params.id).single();
  if (etapaRes.data) {
    const { count } = await supabase
      .from('crm_leads').select('id', { count: 'exact', head: true }).eq('etapa', etapaRes.data.key);
    if (count > 0) return res.status(400).json({ erro: `${count} lead(s) estão nesta etapa. Mova-os antes de excluir.` });
  }
  const { error } = await supabase.from('crm_etapas').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Etapa removida' });
});

// ── LEADS ──────────────────────────────────────────────
router.get('/leads', async (req, res) => {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('*')
    .order('criado_em', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/leads', async (req, res) => {
  const { nome, telefone, instagram, area_atuacao, cidade, origem, etapa, informacoes } = req.body;
  if (!nome || !telefone) return res.status(400).json({ erro: 'Nome e telefone são obrigatórios' });
  const { data, error } = await supabase
    .from('crm_leads')
    .insert([{ nome, telefone, instagram: instagram || null, area_atuacao: area_atuacao || null, cidade: cidade || null, origem: origem || null, etapa: etapa || 'primeiro_contato', informacoes: informacoes || null, criado_por: req.usuario.id }])
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/leads/:id', async (req, res) => {
  const { nome, telefone, instagram, area_atuacao, cidade, origem, etapa, informacoes, motivo_etapa } = req.body;
  const updates = {};
  if (nome          !== undefined) updates.nome          = nome;
  if (telefone      !== undefined) updates.telefone      = telefone;
  if (instagram     !== undefined) updates.instagram     = instagram;
  if (area_atuacao  !== undefined) updates.area_atuacao  = area_atuacao;
  if (cidade        !== undefined) updates.cidade        = cidade;
  if (origem        !== undefined) updates.origem        = origem;
  if (etapa         !== undefined) updates.etapa         = etapa;
  if (informacoes   !== undefined) updates.informacoes   = informacoes;
  if (motivo_etapa  !== undefined) updates.motivo_etapa  = motivo_etapa;
  updates.atualizado_em = new Date().toISOString();
  const { data, error } = await supabase
    .from('crm_leads')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/leads/:id', async (req, res) => {
  const { error } = await supabase.from('crm_leads').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Lead removido' });
});

// ── ATIVIDADES ─────────────────────────────────────────
router.get('/atividades', async (req, res) => {
  const { lead_id, responsavel_id } = req.query;
  let query = supabase
    .from('crm_atividades')
    .select('*, crm_leads(nome)')
    .order('data', { ascending: true });
  if (lead_id)        query = query.eq('lead_id', lead_id);
  if (responsavel_id) query = query.eq('responsavel_id', responsavel_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/atividades', async (req, res) => {
  const { lead_id, data: date, descricao, responsavel_id } = req.body;
  if (!lead_id || !date || !descricao) return res.status(400).json({ erro: 'lead_id, data e descrição são obrigatórios' });
  const { data, error } = await supabase
    .from('crm_atividades')
    .insert([{ lead_id, data: date, descricao, concluida: false, responsavel_id: responsavel_id || null, criado_por: req.usuario.id }])
    .select('*, crm_leads(nome)')
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/atividades/:id', async (req, res) => {
  const { data: date, descricao, concluida, responsavel_id } = req.body;
  const updates = {};
  if (date           !== undefined) updates.data           = date;
  if (descricao      !== undefined) updates.descricao      = descricao;
  if (concluida      !== undefined) updates.concluida      = concluida;
  if (responsavel_id !== undefined) updates.responsavel_id = responsavel_id || null;
  const { data, error } = await supabase
    .from('crm_atividades')
    .update(updates)
    .eq('id', req.params.id)
    .select('*, crm_leads(nome)')
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/atividades/:id', async (req, res) => {
  const { error } = await supabase.from('crm_atividades').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Atividade removida' });
});

// ── RELATÓRIOS ─────────────────────────────────────────
router.get('/relatorios', async (req, res) => {
  const [leadsRes, atividadesRes] = await Promise.all([
    supabase.from('crm_leads').select('etapa, origem, criado_em'),
    supabase.from('crm_atividades').select('concluida, data')
  ]);
  if (leadsRes.error) return res.status(500).json({ erro: leadsRes.error.message });

  const etapas = ['primeiro_contato', 'resposta_inicial', 'tem_interesse', 'reuniao_agendada', 'fechou'];
  const porEtapa = {};
  etapas.forEach(e => porEtapa[e] = 0);

  const origens = ['instagram', 'google', 'indicacao', 'linkedin', 'site', 'outro'];
  const porOrigem = {};
  origens.forEach(o => porOrigem[o] = 0);

  // leads por mês (últimos 6 meses)
  const porMes = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    porMes[key] = 0;
  }

  (leadsRes.data || []).forEach(l => {
    if (porEtapa[l.etapa] !== undefined) porEtapa[l.etapa]++;
    if (l.origem && porOrigem[l.origem] !== undefined) porOrigem[l.origem]++;
    else if (l.origem) porOrigem['outro'] = (porOrigem['outro'] || 0) + 1;
    const mes = (l.criado_em || '').slice(0, 7);
    if (porMes[mes] !== undefined) porMes[mes]++;
  });

  const total   = leadsRes.data?.length || 0;
  const fechados = porEtapa['fechou'] || 0;
  const conversao = total > 0 ? ((fechados / total) * 100).toFixed(1) : '0.0';
  const atividadesPendentes = (atividadesRes.data || []).filter(a => !a.concluida).length;

  res.json({ porEtapa, porOrigem, porMes, total, fechados, conversao: parseFloat(conversao), atividadesPendentes });
});

module.exports = router;
