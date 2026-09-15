const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const supabase = require('../supabase');
const { enviarEmailRecuperacaoSenha } = require('../email');
const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .single();

  if (error) console.error('[Supabase erro]', error);
  if (error || !data) return res.status(401).json({ erro: 'Usuário não encontrado' });

  const senhaOk = await bcrypt.compare(senha, data.senha_hash);
  if (!senhaOk) return res.status(401).json({ erro: 'Senha incorreta' });

  const token = jwt.sign(
    { id: data.id, nome: data.nome, papel: data.papel },
    process.env.JWT_SECRET || 'segredo',
    { expiresIn: '8h' }
  );

  res.json({ token, usuario: { id: data.id, nome: data.nome, papel: data.papel, permissoes: data.permissoes || {} } });
});

// Cadastro
router.post('/cadastro', async (req, res) => {
  const { nome, email, senha, papel, permissoes } = req.body;
  const senha_hash = await bcrypt.hash(senha, 10);

  const { data, error } = await supabase
    .from('usuarios')
    .insert([{ nome, email, senha_hash, papel: papel || 'user', permissoes: permissoes || {} }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json({ mensagem: 'Usuário criado', id: data.id });
});

// Esqueci minha senha — gera um token e envia o link por e-mail.
// Sempre responde a mesma mensagem genérica, exista o e-mail ou não (evita confirmar
// pra quem está tentando se um e-mail está cadastrado no sistema).
router.post('/esqueci-senha', async (req, res) => {
  const { email } = req.body;
  const mensagem = 'Se esse e-mail estiver cadastrado, enviaremos um link de recuperação.';
  if (!email) return res.status(400).json({ erro: 'Informe o e-mail' });

  const { data: usuario } = await supabase
    .from('usuarios').select('id, nome, email').eq('email', email).single();

  if (usuario) {
    const token = crypto.randomBytes(32).toString('hex');
    const expira_em = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h

    const { error } = await supabase
      .from('password_reset_tokens')
      .insert([{ usuario_id: usuario.id, token, expira_em }]);

    if (!error) {
      const link = `${req.protocol}://${req.get('host')}/redefinir-senha/${token}`;
      const envio = await enviarEmailRecuperacaoSenha(usuario.email, usuario.nome, link);
      if (envio.erro) console.error('[esqueci-senha] Falha ao enviar e-mail:', envio.erro);
    } else {
      console.error('[esqueci-senha] Falha ao gerar token:', error.message);
    }
  }

  res.json({ mensagem });
});

// Verifica se um token de redefinição ainda é válido (usado pela página redefinir-senha.html)
router.get('/verificar-token-senha/:token', async (req, res) => {
  const { data } = await supabase
    .from('password_reset_tokens')
    .select('expira_em, usado_em')
    .eq('token', req.params.token)
    .single();

  const valido = !!data && !data.usado_em && new Date(data.expira_em) > new Date();
  res.json({ valido });
});

// Redefine a senha a partir de um token válido
router.post('/redefinir-senha', async (req, res) => {
  const { token, novaSenha } = req.body;
  if (!token || !novaSenha || novaSenha.length < 6) {
    return res.status(400).json({ erro: 'Informe uma senha com pelo menos 6 caracteres' });
  }

  const { data: registro } = await supabase
    .from('password_reset_tokens')
    .select('id, usuario_id, expira_em, usado_em')
    .eq('token', token)
    .single();

  if (!registro || registro.usado_em || new Date(registro.expira_em) < new Date()) {
    return res.status(400).json({ erro: 'Link inválido ou expirado. Solicite um novo.' });
  }

  const senha_hash = await bcrypt.hash(novaSenha, 10);
  const { error: updErro } = await supabase
    .from('usuarios').update({ senha_hash }).eq('id', registro.usuario_id);
  if (updErro) return res.status(400).json({ erro: updErro.message });

  await supabase
    .from('password_reset_tokens')
    .update({ usado_em: new Date().toISOString() })
    .eq('id', registro.id);

  res.json({ mensagem: 'Senha redefinida com sucesso' });
});

module.exports = router;
