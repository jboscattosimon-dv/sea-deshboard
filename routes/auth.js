const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !data) return res.status(401).json({ erro: 'Usuário não encontrado' });

  const senhaOk = await bcrypt.compare(senha, data.senha_hash);
  if (!senhaOk) return res.status(401).json({ erro: 'Senha incorreta' });

  const token = jwt.sign(
    { id: data.id, nome: data.nome, papel: data.papel },
    process.env.JWT_SECRET || 'segredo',
    { expiresIn: '8h' }
  );

  res.json({ token, usuario: { id: data.id, nome: data.nome, papel: data.papel } });
});

// Cadastro
router.post('/cadastro', async (req, res) => {
  const { nome, email, senha, papel } = req.body;
  const senha_hash = await bcrypt.hash(senha, 10);

  const { data, error } = await supabase
    .from('usuarios')
    .insert([{ nome, email, senha_hash, papel: papel || 'user' }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json({ mensagem: 'Usuário criado', id: data.id });
});

module.exports = router;
