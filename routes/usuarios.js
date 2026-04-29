const express = require('express');
const bcrypt = require('bcryptjs');
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
  const { nome, email, papel, senha, permissoes } = req.body;
  const updates = {};
  if (permissoes !== undefined) updates.permissoes = permissoes;
  if (nome)  updates.nome  = nome;
  if (email) updates.email = email;
  if (papel) updates.papel = papel;
  if (senha) updates.senha_hash = await bcrypt.hash(senha, 10);

  const { data, error } = await supabase
    .from('usuarios')
    .update(updates)
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
