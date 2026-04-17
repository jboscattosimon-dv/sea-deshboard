const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// Listar todas
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('demandas')
    .select('*, usuarios(nome), status(nome)')
    .order('criado_em', { ascending: false });

  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

// Buscar por ID
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('demandas')
    .select('*, usuarios(nome), status(nome)')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ erro: 'Demanda não encontrada' });
  res.json(data);
});

// Criar
router.post('/', async (req, res) => {
  const { titulo, descricao, status_id } = req.body;
  const { data, error } = await supabase
    .from('demandas')
    .insert([{ titulo, descricao, status_id, criado_por: req.usuario.id }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

// Atualizar
router.put('/:id', async (req, res) => {
  const { titulo, descricao, status_id } = req.body;
  const { data, error } = await supabase
    .from('demandas')
    .update({ titulo, descricao, status_id })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// Deletar
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('demandas')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Demanda removida' });
});

module.exports = router;
