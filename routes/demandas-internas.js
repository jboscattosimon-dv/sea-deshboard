const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('demandas_internas')
    .select('*')
    .order('prazo', { ascending: true });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { responsavel_id, responsavel_nome, cliente_id, descricao, anexo_b64, anexo_nome, prazo, status } = req.body;
  const id = 'di_' + Math.random().toString(36).slice(2, 10);
  const { data, error } = await supabase
    .from('demandas_internas')
    .insert([{ id, responsavel_id, responsavel_nome, cliente_id, descricao, anexo_b64: anexo_b64 || null, anexo_nome: anexo_nome || null, prazo, status: status || 'pendente', criado_por: req.usuario.id }])
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { responsavel_id, responsavel_nome, cliente_id, descricao, anexo_b64, anexo_nome, prazo, status } = req.body;
  const updates = {};
  if (responsavel_id   !== undefined) updates.responsavel_id   = responsavel_id;
  if (responsavel_nome !== undefined) updates.responsavel_nome = responsavel_nome;
  if (cliente_id       !== undefined) updates.cliente_id       = cliente_id;
  if (descricao        !== undefined) updates.descricao        = descricao;
  if (anexo_b64        !== undefined) updates.anexo_b64        = anexo_b64;
  if (anexo_nome       !== undefined) updates.anexo_nome       = anexo_nome;
  if (prazo            !== undefined) updates.prazo            = prazo;
  if (status           !== undefined) updates.status           = status;
  const { data, error } = await supabase
    .from('demandas_internas')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('demandas_internas').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Demanda interna removida' });
});

module.exports = router;
