const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const portalAuth = require('../middleware/portal-auth');

// POST /api/portal/auth/login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'E-mail e senha são obrigatórios' });
  }

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nome, email, senha_hash, acesso_portal, foto_url')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (error || !cliente) return res.status(401).json({ erro: 'Credenciais inválidas' });
  if (!cliente.acesso_portal) return res.status(403).json({ erro: 'Acesso ao portal não habilitado. Entre em contato com a agência.' });
  if (!cliente.senha_hash) return res.status(401).json({ erro: 'Credenciais inválidas' });

  const senhaValida = await bcrypt.compare(senha, cliente.senha_hash);
  if (!senhaValida) return res.status(401).json({ erro: 'Credenciais inválidas' });

  await supabase
    .from('clientes')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('id', cliente.id);

  const token = jwt.sign(
    { cliente_id: cliente.id, nome: cliente.nome, tipo: 'cliente' },
    process.env.JWT_SECRET || 'segredo',
    { expiresIn: '8h' }
  );

  res.json({
    token,
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      email: cliente.email,
      foto_url: cliente.foto_url || null
    }
  });
});

// GET /api/portal/auth/me
router.get('/me', portalAuth, async (req, res) => {
  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nome, email, telefone, foto_url, ultimo_acesso')
    .eq('id', req.cliente.cliente_id)
    .single();

  if (error || !cliente) return res.status(404).json({ erro: 'Cliente não encontrado' });
  res.json(cliente);
});

module.exports = router;
