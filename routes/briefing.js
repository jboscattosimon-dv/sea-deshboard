const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');

// Public: GET /api/briefing/:clienteId  (no auth — client fills form)
router.get('/:clienteId', async (req, res) => {
  const { data: cliente, error } = await supabase
    .from('clientes').select('id, nome').eq('id', req.params.clienteId).single();
  if (error || !cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });

  const { data: briefing } = await supabase
    .from('briefings').select('*').eq('cliente_id', req.params.clienteId)
    .order('preenchido_em', { ascending: false }).limit(1).maybeSingle();

  res.json({ cliente, briefing: briefing || null });
});

// Public: POST /api/briefing/:clienteId  (no auth — client submits form)
router.post('/:clienteId', async (req, res) => {
  const { razao_social, segmento, objetivos, publico_alvo, cores_preferidas,
          concorrentes, tom_comunicacao, links_referencia, observacoes } = req.body;

  const { data: existing } = await supabase
    .from('briefings').select('id').eq('cliente_id', req.params.clienteId).maybeSingle();

  const payload = {
    razao_social, segmento, objetivos, publico_alvo, cores_preferidas,
    concorrentes, tom_comunicacao, links_referencia, observacoes,
    preenchido_em: new Date().toISOString()
  };

  let data, error;
  if (existing) {
    ({ data, error } = await supabase.from('briefings').update(payload).eq('id', existing.id).select().single());
  } else {
    ({ data, error } = await supabase.from('briefings')
      .insert([{ ...payload, cliente_id: req.params.clienteId }]).select().single());
  }
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

// Protected: GET /api/briefing/admin/:clienteId  (auth required — agency views data)
router.get('/admin/:clienteId', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('briefings').select('*').eq('cliente_id', req.params.clienteId)
    .order('preenchido_em', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data || null);
});

module.exports = router;
