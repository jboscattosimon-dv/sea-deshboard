const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('demandas')
    .select('*, clientes(nome), status(nome, cor)')
    .order('data', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { data: date, cliente_id, status_id, descricao, observacao } = req.body;
  const { data, error } = await supabase
    .from('demandas')
    .insert([{ data: date, cliente_id, status_id, descricao, observacao, criado_por: req.usuario.id }])
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { data: date, cliente_id, status_id, descricao, observacao } = req.body;
  const { data, error } = await supabase
    .from('demandas')
    .update({ data: date, cliente_id, status_id, descricao, observacao })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('demandas').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Demanda removida' });
});

module.exports = router;
