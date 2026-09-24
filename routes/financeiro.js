const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const whatsapp = require('../whatsapp');

router.use(auth);

// ============================================================
// COBRANÇA AUTOMÁTICA POR WHATSAPP (pagamentos atrasados)
// ============================================================

// competencia é sempre o dia 1 do mês (ex: '2026-09-01'); o vencimento real
// é o dia_vencimento configurado no financeiro do cliente, dentro desse mês.
function calcularVencimento(competencia, diaVencimento) {
  const [ano, mes] = competencia.split('-').map(Number);
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
  const dia = Math.min(diaVencimento || 10, ultimoDiaDoMes);
  return new Date(ano, mes - 1, dia);
}

function montarMensagemAtraso(clienteNome, pagamento) {
  const valorFmt = Number(pagamento.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const mesFmt = new Date(pagamento.competencia + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return `Olá, ${clienteNome || ''}! 👋\n\nIdentificamos que o pagamento referente a ${mesFmt} (${valorFmt}) está em atraso.\n\nSe você já efetuou o pagamento, pode desconsiderar esta mensagem. Qualquer dúvida, estamos à disposição!`;
}

// Roda 1x ao dia (agendada em server.js). Verifica pagamentos ainda "pendente"
// cujo vencimento já passou, manda o aviso por WhatsApp e marca como "atrasado"
// — assim, uma vez processado, não entra de novo nessa varredura.
async function verificarPagamentosAtrasados() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const { data: pendentes, error } = await supabase
    .from('clientes_pagamentos')
    .select('*, clientes(id, nome, telefone)')
    .eq('status', 'pendente');

  if (error) { console.error('[cobranca] erro ao buscar pagamentos pendentes:', error.message); return; }

  for (const pag of pendentes || []) {
    const { data: fin } = await supabase
      .from('clientes_financeiro')
      .select('dia_vencimento')
      .eq('cliente_id', pag.cliente_id)
      .single();

    const vencimento = calcularVencimento(pag.competencia, fin?.dia_vencimento);
    if (vencimento >= hoje) continue; // ainda não venceu

    const cliente = pag.clientes;
    const mensagem = montarMensagemAtraso(cliente?.nome, pag);
    const enviado = cliente?.telefone ? await whatsapp.enviarWhatsApp(cliente.telefone, mensagem) : false;

    const updates = { status: 'atrasado' };
    if (enviado) updates.aviso_atraso_enviado_em = new Date().toISOString();
    await supabase.from('clientes_pagamentos').update(updates).eq('id', pag.id);

    console.log(enviado
      ? `[cobranca] aviso de atraso enviado — cliente: ${cliente?.nome}, pagamento: ${pag.id}`
      : `[cobranca] pagamento marcado atrasado mas aviso NÃO enviado (sem telefone ou WhatsApp não configurado) — cliente: ${cliente?.nome}, pagamento: ${pag.id}`);
  }
}

// Disparo manual (admin), útil pra testar sem esperar o horário do job diário.
router.post('/verificar-atrasos', async (req, res) => {
  try {
    await verificarPagamentosAtrasados();
    res.json({ mensagem: 'Verificação de pagamentos atrasados concluída.' });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Reenvia o aviso de um pagamento específico (ex.: telefone foi cadastrado depois).
router.post('/pagamentos/:pagamentoId/reenviar-aviso', async (req, res) => {
  const { pagamentoId } = req.params;

  const { data: pag, error } = await supabase
    .from('clientes_pagamentos')
    .select('*, clientes(id, nome, telefone)')
    .eq('id', pagamentoId)
    .single();

  if (error || !pag) return res.status(404).json({ erro: 'Pagamento não encontrado' });
  if (!pag.clientes?.telefone) return res.status(400).json({ erro: 'Cliente sem telefone cadastrado' });

  const mensagem = montarMensagemAtraso(pag.clientes.nome, pag);
  const enviado = await whatsapp.enviarWhatsApp(pag.clientes.telefone, mensagem);
  if (!enviado) return res.status(500).json({ erro: 'Erro ao enviar WhatsApp. Confira a configuração do Z-API.' });

  const { data: atualizado } = await supabase
    .from('clientes_pagamentos')
    .update({ aviso_atraso_enviado_em: new Date().toISOString() })
    .eq('id', pagamentoId)
    .select()
    .single();

  res.json(atualizado);
});

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
module.exports.verificarPagamentosAtrasados = verificarPagamentosAtrasados;
