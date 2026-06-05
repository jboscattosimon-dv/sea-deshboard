const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

function checkCalEdit(req) {
  const u = req.usuario;
  if (!u) return false;
  if (u.papel === 'admin') return true;
  const p = (u.permissoes || {})['calendario'] || {};
  return p.editar !== false;
}

router.get('/', async (req, res) => {
  const { mes, ano, cliente_id, canal } = req.query;
  let query = supabase
    .from('cal_conteudos')
    .select('*')
    .order('data_publicacao', { ascending: true });
  if (mes && ano) {
    const m = String(mes).padStart(2,'0');
    const daysInMonth = new Date(parseInt(ano), parseInt(mes), 0).getDate();
    const end = String(daysInMonth).padStart(2,'0');
    query = query.gte('data_publicacao', `${ano}-${m}-01`).lte('data_publicacao', `${ano}-${m}-${end}`);
  }
  if (cliente_id) query = query.eq('cliente_id', cliente_id);
  if (canal) query = query.eq('canal', canal);
  const { data, error } = await query;
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  if (!checkCalEdit(req)) return res.status(403).json({ erro: 'Sem permissao' });
  const { titulo, cliente_id, canal, data_publicacao, status, responsavel_id, descricao } = req.body;
  if (!titulo || !data_publicacao) return res.status(400).json({ erro: 'titulo e data_publicacao sao obrigatorios' });
  const { data, error } = await supabase
    .from('cal_conteudos')
    .insert([{ titulo, cliente_id: cliente_id || null, canal: canal || null, data_publicacao, status: status || 'rascunho', responsavel_id: responsavel_id || null, descricao: descricao || null, criado_por: req.usuario.id }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  if (!checkCalEdit(req)) return res.status(403).json({ erro: 'Sem permissao' });
  const { titulo, cliente_id, canal, data_publicacao, status, responsavel_id, descricao } = req.body;
  const updates = {};
  if (titulo !== undefined)          updates.titulo = titulo;
  if (cliente_id !== undefined)      updates.cliente_id = cliente_id || null;
  if (canal !== undefined)           updates.canal = canal || null;
  if (data_publicacao !== undefined) updates.data_publicacao = data_publicacao;
  if (status !== undefined)          updates.status = status;
  if (responsavel_id !== undefined)  updates.responsavel_id = responsavel_id || null;
  if (descricao !== undefined)       updates.descricao = descricao || null;
  const { data, error } = await supabase
    .from('cal_conteudos').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  if (!checkCalEdit(req)) return res.status(403).json({ erro: 'Sem permissao' });
  const { error } = await supabase.from('cal_conteudos').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Item removido' });
});

module.exports = router;
