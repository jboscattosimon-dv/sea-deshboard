const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

router.use(auth);

// ============================================================
// CADASTRO
// ============================================================

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('funcionarios')
    .select('*, usuario:usuario_id(id, nome, email)')
    .order('nome');

  if (error) return res.status(500).json({ erro: error.message });
  res.json(data || []);
});

router.post('/', async (req, res) => {
  const { nome, cargo, telefone, email, usuario_id, status, data_admissao } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });

  const { data, error } = await supabase
    .from('funcionarios')
    .insert([{
      nome: nome.trim(),
      cargo: cargo || null,
      telefone: telefone || null,
      email: email || null,
      usuario_id: usuario_id || null,
      status: status || 'ativo',
      data_admissao: data_admissao || null,
      criado_por: req.usuario.id
    }])
    .select('*, usuario:usuario_id(id, nome, email)')
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, cargo, telefone, email, usuario_id, status, data_admissao } = req.body;

  const updates = {};
  if (nome !== undefined) updates.nome = nome.trim();
  if (cargo !== undefined) updates.cargo = cargo || null;
  if (telefone !== undefined) updates.telefone = telefone || null;
  if (email !== undefined) updates.email = email || null;
  if (usuario_id !== undefined) updates.usuario_id = usuario_id || null;
  if (status !== undefined) updates.status = status;
  if (data_admissao !== undefined) updates.data_admissao = data_admissao || null;

  const { data, error } = await supabase
    .from('funcionarios')
    .update(updates)
    .eq('id', id)
    .select('*, usuario:usuario_id(id, nome, email)')
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('funcionarios').delete().eq('id', id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Funcionária removida' });
});

// ============================================================
// FINANCEIRO (salário + pagamentos)
// ============================================================

router.get('/:funcionarioId/financeiro', async (req, res) => {
  const { funcionarioId } = req.params;

  const { data: fin, error: finErr } = await supabase
    .from('funcionarios_financeiro')
    .select('*')
    .eq('funcionario_id', funcionarioId)
    .single();

  if (finErr && finErr.code !== 'PGRST116') return res.status(400).json({ erro: finErr.message });

  const anoAtual = new Date().getFullYear();
  const { data: pags, error: pagErr } = await supabase
    .from('funcionarios_pagamentos')
    .select('*')
    .eq('funcionario_id', funcionarioId)
    .gte('competencia', `${anoAtual}-01-01`)
    .lte('competencia', `${anoAtual}-12-31`)
    .order('competencia', { ascending: false });

  if (pagErr) return res.status(400).json({ erro: pagErr.message });

  res.json({ financeiro: fin || null, pagamentos: pags || [] });
});

router.post('/:funcionarioId/financeiro', async (req, res) => {
  const { funcionarioId } = req.params;
  const { valor_salario, dia_pagamento, observacoes } = req.body;

  const { data: existing } = await supabase
    .from('funcionarios_financeiro')
    .select('id')
    .eq('funcionario_id', funcionarioId)
    .single();

  let data, error;
  if (existing) {
    ({ data, error } = await supabase
      .from('funcionarios_financeiro')
      .update({
        valor_salario: valor_salario || 0,
        dia_pagamento: dia_pagamento || 5,
        observacoes: observacoes || null,
        atualizado_em: new Date().toISOString()
      })
      .eq('funcionario_id', funcionarioId)
      .select()
      .single());
  } else {
    ({ data, error } = await supabase
      .from('funcionarios_financeiro')
      .insert([{
        funcionario_id: funcionarioId,
        valor_salario: valor_salario || 0,
        dia_pagamento: dia_pagamento || 5,
        observacoes: observacoes || null,
        criado_por: req.usuario.id
      }])
      .select()
      .single());
  }

  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.get('/:funcionarioId/pagamentos', async (req, res) => {
  const { funcionarioId } = req.params;
  const { ano } = req.query;

  let q = supabase.from('funcionarios_pagamentos').select('*').eq('funcionario_id', funcionarioId);
  if (ano) q = q.gte('competencia', `${ano}-01-01`).lte('competencia', `${ano}-12-31`);
  q = q.order('competencia', { ascending: false });

  const { data, error } = await q;
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data || []);
});

async function uploadAnexoPagamento(funcionarioId, base64, nome, tipo) {
  const sanitized = nome.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `funcionarios/${funcionarioId}/pagamentos/${Date.now()}_${sanitized}`;
  const raw = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
  const buffer = Buffer.from(raw, 'base64');

  const { error } = await supabase.storage.from('Portal').upload(storagePath, buffer, { contentType: tipo || 'application/octet-stream' });
  if (error) { console.error('[funcionarios] erro ao subir anexo do pagamento:', error.message); return null; }

  const { data: urlData } = supabase.storage.from('Portal').getPublicUrl(storagePath);
  return { url: urlData.publicUrl, storagePath };
}

router.post('/:funcionarioId/pagamentos', async (req, res) => {
  const { funcionarioId } = req.params;
  const { competencia, valor, status, data_pagamento, forma_pagamento, observacao, anexo_b64, anexo_nome, anexo_tipo } = req.body;

  if (!competencia || !valor) return res.status(400).json({ erro: 'competencia e valor são obrigatórios' });

  const insert = {
    funcionario_id: funcionarioId,
    competencia,
    valor,
    status: status || 'pendente',
    data_pagamento: data_pagamento || null,
    forma_pagamento: forma_pagamento || null,
    observacao: observacao || null,
    criado_por: req.usuario.id
  };

  if (anexo_b64 && anexo_nome) {
    const up = await uploadAnexoPagamento(funcionarioId, anexo_b64, anexo_nome, anexo_tipo);
    if (!up) return res.status(500).json({ erro: 'Erro ao enviar anexo da folha de pagamento' });
    insert.anexo_url = up.url;
    insert.anexo_storage_path = up.storagePath;
    insert.anexo_nome = anexo_nome;
    insert.anexo_tipo = anexo_tipo || null;
  }

  const { data, error } = await supabase
    .from('funcionarios_pagamentos')
    .insert([insert])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.patch('/pagamentos/:pagamentoId', async (req, res) => {
  const { pagamentoId } = req.params;
  const { status, data_pagamento, forma_pagamento, observacao, valor, competencia, anexo_b64, anexo_nome, anexo_tipo } = req.body;

  const updates = {};
  if (status !== undefined) updates.status = status;
  if (data_pagamento !== undefined) updates.data_pagamento = data_pagamento || null;
  if (forma_pagamento !== undefined) updates.forma_pagamento = forma_pagamento || null;
  if (observacao !== undefined) updates.observacao = observacao || null;
  if (valor !== undefined) updates.valor = valor;
  if (competencia !== undefined) updates.competencia = competencia;

  if (anexo_b64 && anexo_nome) {
    const { data: pag } = await supabase.from('funcionarios_pagamentos').select('funcionario_id, anexo_storage_path').eq('id', pagamentoId).single();
    if (!pag) return res.status(404).json({ erro: 'Pagamento não encontrado' });

    const up = await uploadAnexoPagamento(pag.funcionario_id, anexo_b64, anexo_nome, anexo_tipo);
    if (!up) return res.status(500).json({ erro: 'Erro ao enviar anexo da folha de pagamento' });
    if (pag.anexo_storage_path) await supabase.storage.from('Portal').remove([pag.anexo_storage_path]);

    updates.anexo_url = up.url;
    updates.anexo_storage_path = up.storagePath;
    updates.anexo_nome = anexo_nome;
    updates.anexo_tipo = anexo_tipo || null;
  }

  const { data, error } = await supabase
    .from('funcionarios_pagamentos')
    .update(updates)
    .eq('id', pagamentoId)
    .select()
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

router.delete('/pagamentos/:pagamentoId', async (req, res) => {
  const { pagamentoId } = req.params;

  const { data: pag } = await supabase.from('funcionarios_pagamentos').select('anexo_storage_path').eq('id', pagamentoId).single();
  if (pag?.anexo_storage_path) await supabase.storage.from('Portal').remove([pag.anexo_storage_path]);

  const { error } = await supabase.from('funcionarios_pagamentos').delete().eq('id', pagamentoId);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

module.exports = router;
