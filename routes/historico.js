const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('historico')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { tipo, entidade, entidade_id, descricao } = req.body;
  const id = 'h_' + Math.random().toString(36).slice(2, 10);
  const { data, error } = await supabase
    .from('historico')
    .insert([{
      id,
      tipo,
      entidade,
      entidade_id: entidade_id || null,
      descricao: descricao || null,
      usuario_nome: req.usuario.nome
    }])
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

module.exports = router;
