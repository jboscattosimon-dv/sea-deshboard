const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/contratos
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('contratos').select('*').order('data_renovacao', { ascending: true });
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// POST /api/contratos
router.post('/', async (req, res) => {
  const u = req.usuario;
  if (u.papel !== 'admin') return res.status(403).json({ erro: 'Sem permissão.' });
  const { cliente_id, valor_mensal, data_inicio, data_renovacao, descricao } = req.body;
  const { data, error } = await supabase.from('contratos')
    .insert([{ cliente_id, valor_mensal: parseFloat(valor_mensal) || 0, data_inicio, data_renovacao, descricao, ativo: true }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// PUT /api/contratos/:id
router.put('/:id', async (req, res) => {
  const u = req.usuario;
  if (u.papel !== 'admin') return res.status(403).json({ erro: 'Sem permissão.' });
  const { valor_mensal, data_inicio, data_renovacao, descricao, ativo } = req.body;
  const updates = {};
  if (valor_mensal  !== undefined) updates.valor_mensal  = parseFloat(valor_mensal) || 0;
  if (data_inicio   !== undefined) updates.data_inicio   = data_inicio;
  if (data_renovacao!== undefined) updates.data_renovacao= data_renovacao;
  if (descricao     !== undefined) updates.descricao     = descricao;
  if (ativo         !== undefined) updates.ativo         = ativo;
  const { data, error } = await supabase.from('contratos').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// DELETE /api/contratos/:id
router.delete('/:id', async (req, res) => {
  const u = req.usuario;
  if (u.papel !== 'admin') return res.status(403).json({ erro: 'Sem permissão.' });
  const { error } = await supabase.from('contratos').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

module.exports = router;
