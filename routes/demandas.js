const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('demandas')
    .select('*, clientes(nome), status(nome, cor), formatos(nome)')
    .order('data', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { data: date, cliente_id, status_id, formato_id, descricao, observacao } = req.body;
  const { data, error } = await supabase
    .from('demandas')
    .insert([{ data: date, cliente_id, status_id, formato_id: formato_id || null, descricao, observacao, criado_por: req.usuario.id }])
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { data: date, cliente_id, status_id, formato_id, descricao, observacao, postado } = req.body;
  const updates = {};
  if (date !== undefined)       updates.data        = date;
  if (cliente_id !== undefined) updates.cliente_id  = cliente_id;
  if (status_id !== undefined)  updates.status_id   = status_id;
  if (formato_id !== undefined) updates.formato_id  = formato_id || null;
  if (descricao !== undefined)  updates.descricao   = descricao;
  if (observacao !== undefined) updates.observacao  = observacao;
  if (postado !== undefined)    updates.postado     = postado;
  const { data, error } = await supabase
    .from('demandas')
    .update(updates)
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
