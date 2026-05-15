const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

function checkSdrEdit(req) {
  const u = req.usuario;
  if (!u) return false;
  if (u.papel === 'admin') return true;
  const p = (u.permissoes || {})['sdr_topicos'] || (u.permissoes || {})['sdr'] || {};
  return p.editar !== false;
}

// ── TÓPICOS ──────────────────────────────────────────────────────────

router.get('/topicos', async (req, res) => {
  const { data, error } = await supabase
    .from('sdr_topicos')
    .select('*')
    .order('ordem', { ascending: true });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/topicos', async (req, res) => {
  if (!checkSdrEdit(req)) return res.status(403).json({ erro: 'Sem permissão para editar' });
  const { label, icone, ordem } = req.body;
  if (!label) return res.status(400).json({ erro: 'label é obrigatório' });
  const { data, error } = await supabase
    .from('sdr_topicos')
    .insert([{ label, icone: icone || '', ordem: ordem || 0 }])
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/topicos/:id', async (req, res) => {
  if (!checkSdrEdit(req)) return res.status(403).json({ erro: 'Sem permissão para editar' });
  const { label, icone, ordem } = req.body;
  const updates = {};
  if (label !== undefined) updates.label = label;
  if (icone !== undefined) updates.icone = icone || '';
  if (ordem !== undefined) updates.ordem = parseInt(ordem) || 0;
  const { data, error } = await supabase
    .from('sdr_topicos').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/topicos/:id', async (req, res) => {
  if (!checkSdrEdit(req)) return res.status(403).json({ erro: 'Sem permissão para editar' });
  const { error } = await supabase.from('sdr_topicos').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Tópico removido' });
});

// ── CONTEÚDOS ─────────────────────────────────────────────────────────

router.get('/conteudos', async (req, res) => {
  const { topico } = req.query;
  let query = supabase
    .from('sdr_conteudos')
    .select('*')
    .order('ordem', { ascending: true })
    .order('criado_em', { ascending: true });
  if (topico) query = query.eq('topico_id', topico);
  const { data, error } = await query;
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/conteudos', async (req, res) => {
  if (!checkSdrEdit(req)) return res.status(403).json({ erro: 'Sem permissão para editar' });
  const { topico_id, titulo, conteudo, ordem } = req.body;
  if (!topico_id || !titulo) return res.status(400).json({ erro: 'topico_id e titulo são obrigatórios' });
  const { data, error } = await supabase
    .from('sdr_conteudos')
    .insert([{ topico_id, titulo, conteudo: conteudo || null, ordem: ordem || 0, criado_por: req.usuario.id }])
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/conteudos/:id', async (req, res) => {
  if (!checkSdrEdit(req)) return res.status(403).json({ erro: 'Sem permissão para editar' });
  const { titulo, conteudo, ordem } = req.body;
  const updates = { atualizado_em: new Date().toISOString() };
  if (titulo   !== undefined) updates.titulo   = titulo;
  if (conteudo !== undefined) updates.conteudo = conteudo || null;
  if (ordem    !== undefined) updates.ordem    = ordem;
  const { data, error } = await supabase
    .from('sdr_conteudos')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/conteudos/:id', async (req, res) => {
  if (!checkSdrEdit(req)) return res.status(403).json({ erro: 'Sem permissão para editar' });
  const { error } = await supabase.from('sdr_conteudos').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Conteúdo removido' });
});

// ── ANEXOS ───────────────────────────────────────────────────────────

router.get('/anexos', async (req, res) => {
  const { conteudo_id } = req.query;
  if (!conteudo_id) return res.status(400).json({ erro: 'conteudo_id é obrigatório' });
  const { data, error } = await supabase
    .from('sdr_anexos')
    .select('*')
    .eq('conteudo_id', conteudo_id)
    .order('criado_em', { ascending: true });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/anexos', async (req, res) => {
  if (!checkSdrEdit(req)) return res.status(403).json({ erro: 'Sem permissão para editar' });
  const { conteudo_id, nome, tipo, tamanho, data: base64Data } = req.body;
  if (!conteudo_id || !nome || !base64Data) {
    return res.status(400).json({ erro: 'conteudo_id, nome e data são obrigatórios' });
  }
  const safeName = nome.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${conteudo_id}/${Date.now()}_${safeName}`;
  const buffer = Buffer.from(base64Data, 'base64');

  const { error: upErr } = await supabase.storage
    .from('sdr-anexos')
    .upload(storagePath, buffer, { contentType: tipo || 'application/octet-stream', upsert: false });
  if (upErr) return res.status(400).json({ erro: upErr.message });

  const { data: urlData } = supabase.storage.from('sdr-anexos').getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('sdr_anexos')
    .insert([{
      conteudo_id, nome, url: urlData.publicUrl, storage_path: storagePath,
      tipo: tipo || null, tamanho: tamanho || null, criado_por: req.usuario.id
    }])
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.delete('/anexos/:id', async (req, res) => {
  if (!checkSdrEdit(req)) return res.status(403).json({ erro: 'Sem permissão para editar' });
  const { data: anexo } = await supabase
    .from('sdr_anexos').select('storage_path').eq('id', req.params.id).single();
  if (anexo?.storage_path) {
    await supabase.storage.from('sdr-anexos').remove([anexo.storage_path]);
  }
  const { error } = await supabase.from('sdr_anexos').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Arquivo removido' });
});

module.exports = router;
