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

// ── LEADS ──────────────────────────────────────────────
router.get('/leads', async (req, res) => {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('*, crm_atividades(count)')
    .order('criado_em', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/leads', async (req, res) => {
  const { nome, telefone, email, origem, etapa } = req.body;
  if (!nome || !telefone) return res.status(400).json({ erro: 'Nome e telefone são obrigatórios' });
  const { data, error } = await supabase
    .from('crm_leads')
    .insert([{ nome, telefone, email: email || null, origem: origem || null, etapa: etapa || 'primeiro_contato', criado_por: req.usuario.id }])
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/leads/:id', async (req, res) => {
  const { nome, telefone, email, origem, etapa } = req.body;
  const updates = {};
  if (nome      !== undefined) updates.nome      = nome;
  if (telefone  !== undefined) updates.telefone  = telefone;
  if (email     !== undefined) updates.email     = email;
  if (origem    !== undefined) updates.origem    = origem;
  if (etapa     !== undefined) updates.etapa     = etapa;
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
  const { lead_id } = req.query;
  let query = supabase.from('crm_atividades').select('*, crm_leads(nome)').order('data', { ascending: true });
  if (lead_id) query = query.eq('lead_id', lead_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/atividades', async (req, res) => {
  const { lead_id, data: date, descricao } = req.body;
  if (!lead_id || !date || !descricao) return res.status(400).json({ erro: 'lead_id, data e descrição são obrigatórios' });
  const { data, error } = await supabase
    .from('crm_atividades')
    .insert([{ lead_id, data: date, descricao, concluida: false, criado_por: req.usuario.id }])
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/atividades/:id', async (req, res) => {
  const { data: date, descricao, concluida } = req.body;
  const updates = {};
  if (date      !== undefined) updates.data      = date;
  if (descricao !== undefined) updates.descricao = descricao;
  if (concluida !== undefined) updates.concluida = concluida;
  const { data, error } = await supabase
    .from('crm_atividades')
    .update(updates)
    .eq('id', req.params.id)
    .select()
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
    supabase.from('crm_leads').select('etapa, criado_em'),
    supabase.from('crm_atividades').select('concluida, data')
  ]);
  if (leadsRes.error) return res.status(500).json({ erro: leadsRes.error.message });

  const etapas = ['primeiro_contato', 'resposta_inicial', 'tem_interesse', 'reuniao_agendada', 'fechou'];
  const porEtapa = {};
  etapas.forEach(e => porEtapa[e] = 0);
  (leadsRes.data || []).forEach(l => { if (porEtapa[l.etapa] !== undefined) porEtapa[l.etapa]++; });

  const total   = leadsRes.data?.length || 0;
  const fechados = porEtapa['fechou'] || 0;
  const conversao = total > 0 ? ((fechados / total) * 100).toFixed(1) : '0.0';

  const atividadesPendentes = (atividadesRes.data || []).filter(a => !a.concluida).length;

  res.json({ porEtapa, total, fechados, conversao: parseFloat(conversao), atividadesPendentes });
});

module.exports = router;
