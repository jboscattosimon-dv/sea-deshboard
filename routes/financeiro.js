const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

router.use(auth);

// GET /api/financeiro/resumo/inadimplencia
router.get('/resumo/inadimplencia', async (req, res) => {
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('clientes_pagamentos')
    .select('*, clientes(id, nome)')
    .in('status', ['atrasado', 'pendente'])
    .lte('competencia', mesAtual)
    .order('competencia', { ascending: true });

  if (error) return res.status(400).json({ erro: error.message });

  const byClient = {};
  (data || []).forEach(p => {
    const cid = p.cliente_id;
    if (!byClient[cid]) {
      byClient[cid] = {
        cliente_id: cid,
        cliente_nome: p.clientes?.nome || cid,
        total_aberto: 0,
        pagamentos: []
      };
    }
    byClient[cid].total_aberto += Number(p.valor);
    byClient[cid].pagamentos.push(p);
  });

  res.json(Object.values(byClient));
});

// PATCH /api/financeiro/pagamentos/:pagamentoId
router.patch('/pagamentos/:pagamentoId', async (req, res) => {
  const { pagamentoId } = req.params;
  const { status, data_pagamento, forma_pagamento, observacao, valor, competencia } = req.body;

  const updates = {};
  if (status !== undefined) updates.status = status;
  if (data_pagamento !== undefined) updates.data_pagamento = data_pagamento || null;
  if (forma_pagamento !== undefined) updates.forma_pagamento = forma_pagamento || null;
  if (observacao !== undefined) updates.observacao = observacao || null;
  if (valor !== undefined) updates.valor = valor;
  if (competencia !== undefined) updates.competencia = competencia;

  const { data, error } = await supabase
    .from('clientes_pagamentos')
    .update(updates)
    .eq('id', pagamentoId)
    .select()
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// DELETE /api/financeiro/pagamentos/:pagamentoId
router.delete('/pagamentos/:pagamentoId', async (req, res) => {
  const { pagamentoId } = req.params;

  const { error } = await supabase
    .from('clientes_pagamentos')
    .delete()
    .eq('id', pagamentoId);

  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

// GET /api/financeiro/:clienteId/pagamentos
router.get('/:clienteId/pagamentos', async (req, res) => {
  const { clienteId } = req.params;
  const { ano } = req.query;

  let q = supabase.from('clientes_pagamentos').select('*').eq('cliente_id', clienteId);
  if (ano) {
    q = q.gte('competencia', `${ano}-01-01`).lte('competencia', `${ano}-12-31`);
  }
  q = q.order('competencia', { ascending: false });

  const { data, error } = await q;
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data || []);
});

// POST /api/financeiro/:clienteId/pagamentos
router.post('/:clienteId/pagamentos', async (req, res) => {
  const { clienteId } = req.params;
  const { competencia, valor, status, data_pagamento, forma_pagamento, observacao } = req.body;

  if (!competencia || !valor) return res.status(400).json({ erro: 'competencia e valor são obrigatórios' });

  const { data, error } = await supabase
    .from('clientes_pagamentos')
    .insert([{
      cliente_id: clienteId,
      competencia,
      valor,
      status: status || 'pendente',
      data_pagamento: data_pagamento || null,
      forma_pagamento: forma_pagamento || null,
      observacao: observacao || null,
      criado_por: req.usuario.id
    }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

// POST /api/financeiro/:clienteId/contrato
router.post('/:clienteId/contrato', async (req, res) => {
  const { clienteId } = req.params;
  const { nome, tipo, data: base64Data } = req.body;

  if (!nome || !base64Data) return res.status(400).json({ erro: 'nome e data são obrigatórios' });

  const safeName = nome.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${clienteId}/${Date.now()}_${safeName}`;
  const b64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buffer = Buffer.from(b64, 'base64');

  const { error: upErr } = await supabase.storage
    .from('contratos')
    .upload(storagePath, buffer, { contentType: tipo || 'application/octet-stream', upsert: false });

  if (upErr) return res.status(400).json({ erro: upErr.message });

  const { data: urlData } = supabase.storage.from('contratos').getPublicUrl(storagePath);

  // Remove old contrato if exists
  const { data: existing } = await supabase
    .from('clientes_financeiro')
    .select('contrato_storage_path')
    .eq('cliente_id', clienteId)
    .single();

  if (existing?.contrato_storage_path) {
    await supabase.storage.from('contratos').remove([existing.contrato_storage_path]);
  }

  // Upsert: update if exists, insert if not
  const { data: hasFin } = await supabase
    .from('clientes_financeiro')
    .select('id')
    .eq('cliente_id', clienteId)
    .single();

  let data, error;
  if (hasFin) {
    ({ data, error } = await supabase
      .from('clientes_financeiro')
      .update({ contrato_url: urlData.publicUrl, contrato_storage_path: storagePath, contrato_nome: nome, atualizado_em: new Date().toISOString() })
      .eq('cliente_id', clienteId)
      .select()
      .single());
  } else {
    ({ data, error } = await supabase
      .from('clientes_financeiro')
      .insert([{ cliente_id: clienteId, contrato_url: urlData.publicUrl, contrato_storage_path: storagePath, contrato_nome: nome, criado_por: req.usuario.id }])
      .select()
      .single());
  }

  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// DELETE /api/financeiro/:clienteId/contrato
router.delete('/:clienteId/contrato', async (req, res) => {
  const { clienteId } = req.params;

  const { data: existing, error: getErr } = await supabase
    .from('clientes_financeiro')
    .select('contrato_storage_path')
    .eq('cliente_id', clienteId)
    .single();

  if (getErr) return res.status(400).json({ erro: getErr.message });

  if (existing?.contrato_storage_path) {
    await supabase.storage.from('contratos').remove([existing.contrato_storage_path]);
  }

  const { error } = await supabase
    .from('clientes_financeiro')
    .update({ contrato_url: null, contrato_storage_path: null, contrato_nome: null, atualizado_em: new Date().toISOString() })
    .eq('cliente_id', clienteId);

  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

// GET /api/financeiro/:clienteId
router.get('/:clienteId', async (req, res) => {
  const { clienteId } = req.params;

  const { data: fin, error: finErr } = await supabase
    .from('clientes_financeiro')
    .select('*')
    .eq('cliente_id', clienteId)
    .single();

  if (finErr && finErr.code !== 'PGRST116') return res.status(400).json({ erro: finErr.message });

  const anoAtual = new Date().getFullYear();
  const { data: pags, error: pagErr } = await supabase
    .from('clientes_pagamentos')
    .select('*')
    .eq('cliente_id', clienteId)
    .gte('competencia', `${anoAtual}-01-01`)
    .lte('competencia', `${anoAtual}-12-31`)
    .order('competencia', { ascending: false });

  if (pagErr) return res.status(400).json({ erro: pagErr.message });

  res.json({ financeiro: fin || null, pagamentos: pags || [] });
});

// POST /api/financeiro/:clienteId
router.post('/:clienteId', async (req, res) => {
  const { clienteId } = req.params;
  const { valor_mensalidade, dia_vencimento, data_inicio, observacoes } = req.body;

  const { data: existing } = await supabase
    .from('clientes_financeiro')
    .select('id')
    .eq('cliente_id', clienteId)
    .single();

  let data, error;
  if (existing) {
    ({ data, error } = await supabase
      .from('clientes_financeiro')
      .update({ valor_mensalidade: valor_mensalidade || 0, dia_vencimento: dia_vencimento || 10, data_inicio: data_inicio || null, observacoes: observacoes || null, atualizado_em: new Date().toISOString() })
      .eq('cliente_id', clienteId)
      .select()
      .single());
  } else {
    ({ data, error } = await supabase
      .from('clientes_financeiro')
      .insert([{ cliente_id: clienteId, valor_mensalidade: valor_mensalidade || 0, dia_vencimento: dia_vencimento || 10, data_inicio: data_inicio || null, observacoes: observacoes || null, criado_por: req.usuario.id }])
      .select()
      .single());
  }

  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

module.exports = router;
