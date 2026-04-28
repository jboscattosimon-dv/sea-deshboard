const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, papel, permissoes, criado_em');
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, papel, permissoes, criado_em')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ erro: 'Usuário não encontrado' });
  res.json(data);
});

router.put('/:id', async (req, res) => {
  const { permissoes } = req.body;
  const { data, error } = await supabase
    .from('usuarios')
    .update({ permissoes })
    .eq('id', req.params.id)
    .select('id, nome, email, papel, permissoes')
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('usuarios').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Usuário excluído' });
});

module.exports = router;
