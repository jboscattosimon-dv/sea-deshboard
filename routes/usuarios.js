const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// Listar todos
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, papel, criado_em');

  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

// Buscar por ID
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, papel, criado_em')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ erro: 'Usuário não encontrado' });
  res.json(data);
});

// Excluir
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('usuarios').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Usuário excluído' });
});

module.exports = router;
