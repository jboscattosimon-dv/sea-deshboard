const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const bcrypt = require('bcryptjs');
const portalAuth = require('../middleware/portal-auth');

router.use(portalAuth);

// ============================================================
// Helpers
// ============================================================

function gerarId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 10);
}

async function verificarDemandaDoCliente(demandaId, clienteId) {
  const { data } = await supabase
    .from('demandas')
    .select('id, arte_pronta, titulo, descricao, cliente_id, status_id, trello_card_id')
    .eq('id', demandaId)
    .eq('cliente_id', clienteId)
    .single();
  return data;
}

async function registrarHistorico(tipo, entidadeId, descricao, autorNome) {
  await supabase.from('historico').insert([{
    id: gerarId('h_'),
    tipo,
    entidade: 'demanda',
    entidade_id: entidadeId,
    descricao,
    usuario_nome: autorNome
  }]);
}

async function criarNotificacao(clienteId, tipo, titulo, mensagem, entidade, entidadeId) {
  await supabase.from('portal_notificacoes').insert([{
    id: gerarId('ntf_'),
    cliente_id: clienteId,
    tipo,
    titulo,
    mensagem,
    entidade,
    entidade_id: entidadeId
  }]);
}

// ============================================================
// DASHBOARD
// ============================================================

router.get('/dashboard', async (req, res) => {
  const clienteId = req.cliente.cliente_id;

  try {
    const { data: demandas } = await supabase
      .from('demandas')
      .select('id, arte_pronta, status:status_id(nome)')
      .eq('cliente_id', clienteId);

    const hoje = new Date();
    const dow = hoje.getDay();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - dow);
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6);

    const { data: postsSemanais } = await supabase
      .from('cal_conteudos')
      .select('id')
      .eq('cliente_id', clienteId)
      .gte('data_publicacao', inicioSemana.toISOString().split('T')[0])
      .lte('data_publicacao', fimSemana.toISOString().split('T')[0]);

    const ids = (demandas || []).map(d => d.id);

    let comentariosRecentes = [];
    let artesRecentes = [];
    let aprovacoesRecentes = [];

    if (ids.length > 0) {
      const { data: c } = await supabase
        .from('portal_comentarios')
        .select('autor_nome, mensagem, criado_em, demanda_id')
        .in('demanda_id', ids)
        .order('criado_em', { ascending: false })
        .limit(5);
      comentariosRecentes = c || [];

      const { data: a } = await supabase
        .from('portal_artes')
        .select('versao, nome, criado_em, demanda_id')
        .in('demanda_id', ids)
        .order('criado_em', { ascending: false })
        .limit(5);
      artesRecentes = a || [];
    }

    const { data: ap } = await supabase
      .from('portal_aprovacoes')
      .select('acao, motivo, criado_em, demanda_id')
      .eq('cliente_id', clienteId)
      .order('criado_em', { ascending: false })
      .limit(5);
    aprovacoesRecentes = ap || [];

    const statusConcluidoNomes = ['concluido', 'concluída', 'aprovado', 'entregue'];
    const emAndamento = (demandas || []).filter(d => {
      const nome = (d.status?.nome || '').toLowerCase();
      return !statusConcluidoNomes.includes(nome) && !d.arte_pronta;
    }).length;
    const aguardandoAprovacao = (demandas || []).filter(d => d.arte_pronta).length;
    const concluidas = (demandas || []).filter(d => {
      const nome = (d.status?.nome || '').toLowerCase();
      return statusConcluidoNomes.includes(nome);
    }).length;

    const atividades = [
      ...comentariosRecentes.map(c => ({
        tipo: 'comentario',
        icone: 'chat',
        descricao: `${c.autor_nome} enviou uma mensagem`,
        demanda_id: c.demanda_id,
        criado_em: c.criado_em
      })),
      ...artesRecentes.map(a => ({
        tipo: 'arte',
        icone: 'image',
        descricao: `Arte v${a.versao} disponível para revisão`,
        demanda_id: a.demanda_id,
        criado_em: a.criado_em
      })),
      ...aprovacoesRecentes.map(a => ({
        tipo: 'aprovacao',
        icone: a.acao === 'aprovado' ? 'check' : 'edit',
        descricao: a.acao === 'aprovado' ? 'Arte aprovada' :
                   a.acao === 'alteracao_solicitada' ? 'Alteração solicitada' : 'Arte rejeitada',
        demanda_id: a.demanda_id,
        criado_em: a.criado_em
      }))
    ].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)).slice(0, 10);

    res.json({
      stats: {
        emAndamento,
        aguardandoAprovacao,
        concluidas,
        postsSemanais: (postsSemanais || []).length
      },
      atividades
    });
  } catch {
    res.status(500).json({ erro: 'Erro ao carregar dashboard' });
  }
});

// ============================================================
// DEMANDAS
// ============================================================

router.get('/demandas', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { status_id, de, ate, responsavel_id, busca } = req.query;

  let query = supabase
    .from('demandas')
    .select(`
      id, titulo, descricao, data, prazo, prioridade, categoria,
      arte_pronta, responsavel_nome, criado_em,
      status:status_id(id, nome, cor),
      formato:formato_id(nome)
    `)
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false });

  if (status_id) query = query.eq('status_id', status_id);
  if (de) query = query.gte('data', de);
  if (ate) query = query.lte('data', ate);
  if (responsavel_id) query = query.eq('responsavel_id', responsavel_id);
  if (busca) query = query.or(`titulo.ilike.%${busca}%,descricao.ilike.%${busca}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ erro: 'Erro ao buscar demandas' });
  res.json(data || []);
});

router.get('/demandas/:id', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;

  const { data, error } = await supabase
    .from('demandas')
    .select(`
      id, titulo, descricao, observacao, data, prazo, prioridade,
      categoria, arte_pronta, responsavel_id, responsavel_nome, criado_em,
      status:status_id(id, nome, cor),
      formato:formato_id(nome)
    `)
    .eq('id', id)
    .eq('cliente_id', clienteId)
    .single();

  if (error || !data) return res.status(404).json({ erro: 'Demanda não encontrada' });
  res.json(data);
});

// Histórico visível ao cliente (apenas eventos relevantes)
router.get('/demandas/:id/historico', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;

  const demanda = await verificarDemandaDoCliente(id, clienteId);
  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada' });

  const { data, error } = await supabase
    .from('historico')
    .select('*')
    .eq('entidade', 'demanda')
    .eq('entidade_id', id)
    .in('tipo', ['arte_enviada', 'aprovado', 'alteracao_solicitada', 'rejeitado', 'comentario', 'upload', 'criado', 'atualizado'])
    .order('criado_em', { ascending: false });

  if (error) return res.status(500).json({ erro: 'Erro ao buscar histórico' });
  res.json(data || []);
});

// ============================================================
// COMENTÁRIOS
// ============================================================

router.get('/demandas/:id/comentarios', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;

  const demanda = await verificarDemandaDoCliente(id, clienteId);
  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada' });

  const { data, error } = await supabase
    .from('portal_comentarios')
    .select('*, anexos:portal_comentario_anexos(*)')
    .eq('demanda_id', id)
    .order('criado_em', { ascending: true });

  if (error) return res.status(500).json({ erro: 'Erro ao buscar comentários' });
  res.json(data || []);
});

router.post('/demandas/:id/comentarios', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;
  const { mensagem, arquivo_b64, arquivo_nome, arquivo_tipo, arquivo_tamanho } = req.body;

  if (!mensagem?.trim() && !arquivo_b64) {
    return res.status(400).json({ erro: 'Mensagem ou arquivo é obrigatório' });
  }

  const demanda = await verificarDemandaDoCliente(id, clienteId);
  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada' });

  let temAnexo = false;
  let storagePath = null;
  let publicUrl = null;

  if (arquivo_b64 && arquivo_nome) {
    const sanitized = arquivo_nome.replace(/[^a-zA-Z0-9._-]/g, '_');
    storagePath = `portal/${clienteId}/${id}/comentarios/${Date.now()}_${sanitized}`;
    const base64 = arquivo_b64.includes('base64,') ? arquivo_b64.split('base64,')[1] : arquivo_b64;
    const buffer = Buffer.from(base64, 'base64');

    const { error: upErr } = await supabase.storage
      .from('Portal')
      .upload(storagePath, buffer, { contentType: arquivo_tipo || 'application/octet-stream' });

    if (!upErr) {
      const { data: urlData } = supabase.storage.from('Portal').getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
      temAnexo = true;
    }
  }

  const comentId = gerarId('cmt_');
  const { data: coment, error: comentErr } = await supabase
    .from('portal_comentarios')
    .insert([{
      id: comentId,
      demanda_id: id,
      autor_tipo: 'cliente',
      autor_id: clienteId,
      autor_nome: req.cliente.nome,
      mensagem: mensagem?.trim() || '',
      tem_anexo: temAnexo
    }])
    .select()
    .single();

  if (comentErr) return res.status(400).json({ erro: 'Erro ao enviar comentário' });

  if (temAnexo && publicUrl) {
    await supabase.from('portal_comentario_anexos').insert([{
      id: gerarId('cma_'),
      comentario_id: comentId,
      nome: arquivo_nome,
      url: publicUrl,
      storage_path: storagePath,
      tipo: arquivo_tipo || null,
      tamanho: arquivo_tamanho || null
    }]);
  }

  await registrarHistorico('comentario', id, `Cliente ${req.cliente.nome} adicionou um comentário`, req.cliente.nome);

  const { data: comentFull } = await supabase
    .from('portal_comentarios')
    .select('*, anexos:portal_comentario_anexos(*)')
    .eq('id', comentId)
    .single();

  res.status(201).json(comentFull);
});

// ============================================================
// ARQUIVOS
// ============================================================

router.get('/demandas/:id/arquivos', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;

  const demanda = await verificarDemandaDoCliente(id, clienteId);
  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada' });

  const { data, error } = await supabase
    .from('portal_arquivos')
    .select('*')
    .eq('demanda_id', id)
    .order('criado_em', { ascending: false });

  if (error) return res.status(500).json({ erro: 'Erro ao buscar arquivos' });
  res.json(data || []);
});

router.post('/demandas/:id/arquivos', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;
  const { nome, arquivo_b64, tipo, tamanho } = req.body;

  if (!nome || !arquivo_b64) {
    return res.status(400).json({ erro: 'Arquivo e nome são obrigatórios' });
  }

  const demanda = await verificarDemandaDoCliente(id, clienteId);
  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada' });

  const sanitized = nome.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `portal/${clienteId}/${id}/${Date.now()}_${sanitized}`;
  const base64 = arquivo_b64.includes('base64,') ? arquivo_b64.split('base64,')[1] : arquivo_b64;
  const buffer = Buffer.from(base64, 'base64');

  const { error: upErr } = await supabase.storage
    .from('Portal')
    .upload(storagePath, buffer, { contentType: tipo || 'application/octet-stream' });

  if (upErr) return res.status(500).json({ erro: 'Erro ao fazer upload do arquivo' });

  const { data: urlData } = supabase.storage.from('Portal').getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('portal_arquivos')
    .insert([{
      id: gerarId('arq_'),
      demanda_id: id,
      cliente_id: clienteId,
      nome,
      url: urlData.publicUrl,
      storage_path: storagePath,
      tipo: tipo || null,
      tamanho: tamanho || null,
      enviado_por_tipo: 'cliente',
      enviado_por_id: clienteId,
      enviado_por_nome: req.cliente.nome
    }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: 'Erro ao salvar arquivo' });

  await registrarHistorico('upload', id, `Cliente ${req.cliente.nome} enviou o arquivo: ${nome}`, req.cliente.nome);

  res.status(201).json(data);
});

router.delete('/demandas/:id/arquivos/:arqId', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id, arqId } = req.params;

  const { data: arquivo } = await supabase
    .from('portal_arquivos')
    .select('*')
    .eq('id', arqId)
    .eq('demanda_id', id)
    .eq('cliente_id', clienteId)
    .eq('enviado_por_tipo', 'cliente')
    .single();

  if (!arquivo) return res.status(404).json({ erro: 'Arquivo não encontrado ou sem permissão' });

  await supabase.storage.from('Portal').remove([arquivo.storage_path]);

  const { error } = await supabase.from('portal_arquivos').delete().eq('id', arqId);
  if (error) return res.status(400).json({ erro: 'Erro ao excluir arquivo' });

  res.json({ mensagem: 'Arquivo excluído com sucesso' });
});

// ============================================================
// ARTES FINAIS
// ============================================================

router.get('/demandas/:id/artes', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;

  const demanda = await verificarDemandaDoCliente(id, clienteId);
  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada' });
  if (!demanda.arte_pronta) return res.status(404).json({ erro: 'Arte não disponível ainda' });

  const { data, error } = await supabase
    .from('portal_artes')
    .select('*')
    .eq('demanda_id', id)
    .order('versao', { ascending: false });

  if (error) return res.status(500).json({ erro: 'Erro ao buscar artes' });
  res.json(data || []);
});

// ============================================================
// APROVAÇÃO
// ============================================================

router.post('/demandas/:id/aprovacao', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;
  const { acao, motivo, arte_id } = req.body;

  const acoesValidas = ['aprovado', 'alteracao_solicitada', 'rejeitado'];
  if (!acoesValidas.includes(acao)) {
    return res.status(400).json({ erro: 'Ação inválida' });
  }
  if ((acao === 'alteracao_solicitada' || acao === 'rejeitado') && !motivo?.trim()) {
    return res.status(400).json({ erro: 'O motivo é obrigatório para esta ação' });
  }

  const demanda = await verificarDemandaDoCliente(id, clienteId);
  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada' });
  if (!demanda.arte_pronta) return res.status(400).json({ erro: 'Arte não disponível para aprovação' });

  const { data, error } = await supabase
    .from('portal_aprovacoes')
    .insert([{
      id: gerarId('apr_'),
      demanda_id: id,
      arte_id: arte_id || null,
      cliente_id: clienteId,
      cliente_nome: req.cliente.nome,
      acao,
      motivo: motivo?.trim() || null
    }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: 'Erro ao registrar aprovação' });

  if (arte_id) {
    await supabase.from('portal_artes').update({ status_arte: acao }).eq('id', arte_id);
  }

  const descAcao = acao === 'aprovado'
    ? `Cliente ${req.cliente.nome} aprovou a arte`
    : acao === 'alteracao_solicitada'
      ? `Cliente ${req.cliente.nome} solicitou alteração: ${motivo}`
      : `Cliente ${req.cliente.nome} rejeitou a arte: ${motivo}`;

  await registrarHistorico(acao, id, descAcao, req.cliente.nome);

  res.status(201).json(data);
});

// ============================================================
// CALENDÁRIO EDITORIAL
// ============================================================

router.get('/calendario', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { mes, ano } = req.query;

  let query = supabase
    .from('cal_conteudos')
    .select('id, titulo, data_publicacao, canal, status, descricao, legenda, hashtags, arte_url, responsavel_id')
    .eq('cliente_id', clienteId)
    .order('data_publicacao', { ascending: true });

  if (mes && ano) {
    const mesNum = mes.padStart(2, '0');
    const inicio = `${ano}-${mesNum}-01`;
    const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate();
    const fim = `${ano}-${mesNum}-${ultimoDia}`;
    query = query.gte('data_publicacao', inicio).lte('data_publicacao', fim);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ erro: 'Erro ao buscar calendário' });
  res.json(data || []);
});

// ============================================================
// BIBLIOTECA DE ARQUIVOS
// ============================================================

router.get('/biblioteca', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { categoria, pasta_id } = req.query;

  let query = supabase
    .from('portal_arquivos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false });

  if (pasta_id) query = query.eq('pasta_id', pasta_id);

  if (categoria === 'imagem') query = query.ilike('tipo', 'image/%');
  else if (categoria === 'video') query = query.ilike('tipo', 'video/%');
  else if (categoria === 'pdf') query = query.eq('tipo', 'application/pdf');
  else if (categoria === 'documento') {
    query = query.in('tipo', [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/x-zip-compressed'
    ]);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ erro: 'Erro ao buscar biblioteca' });
  res.json(data || []);
});

// ============================================================
// PERFIL
// ============================================================

router.get('/perfil', async (req, res) => {
  const clienteId = req.cliente.cliente_id;

  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, email, telefone, foto_url, ultimo_acesso')
    .eq('id', clienteId)
    .single();

  if (error || !data) return res.status(404).json({ erro: 'Perfil não encontrado' });
  res.json(data);
});

router.put('/perfil', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { email, telefone, senha_atual, nova_senha, foto_b64 } = req.body;

  const updates = {};

  if (email) updates.email = email.toLowerCase().trim();
  if (telefone !== undefined) updates.telefone = telefone || null;

  if (nova_senha) {
    if (!senha_atual) return res.status(400).json({ erro: 'Senha atual é obrigatória' });

    const { data: clienteDB } = await supabase
      .from('clientes')
      .select('senha_hash')
      .eq('id', clienteId)
      .single();

    if (!clienteDB?.senha_hash) return res.status(400).json({ erro: 'Nenhuma senha configurada' });

    const valida = await bcrypt.compare(senha_atual, clienteDB.senha_hash);
    if (!valida) return res.status(400).json({ erro: 'Senha atual incorreta' });

    if (nova_senha.length < 6) return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres' });
    updates.senha_hash = await bcrypt.hash(nova_senha, 10);
  }

  if (foto_b64) {
    const storagePath = `portal/fotos/${clienteId}/foto.jpg`;
    const base64 = foto_b64.includes('base64,') ? foto_b64.split('base64,')[1] : foto_b64;
    const buffer = Buffer.from(base64, 'base64');

    await supabase.storage.from('Portal').upload(storagePath, buffer, {
      contentType: 'image/jpeg',
      upsert: true
    });

    const { data: urlData } = supabase.storage.from('Portal').getPublicUrl(storagePath);
    updates.foto_url = urlData.publicUrl + '?t=' + Date.now();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ erro: 'Nenhum campo para atualizar' });
  }

  const { data, error } = await supabase
    .from('clientes')
    .update(updates)
    .eq('id', clienteId)
    .select('id, nome, email, telefone, foto_url')
    .single();

  if (error) return res.status(400).json({ erro: 'Erro ao atualizar perfil' });
  res.json(data);
});

// ============================================================
// NOTIFICAÇÕES
// ============================================================

router.get('/notificacoes', async (req, res) => {
  const clienteId = req.cliente.cliente_id;

  const { data, error } = await supabase
    .from('portal_notificacoes')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ erro: 'Erro ao buscar notificações' });
  res.json(data || []);
});

router.put('/notificacoes/todas-lidas', async (req, res) => {
  const clienteId = req.cliente.cliente_id;

  const { error } = await supabase
    .from('portal_notificacoes')
    .update({ lida: true })
    .eq('cliente_id', clienteId)
    .eq('lida', false);

  if (error) return res.status(400).json({ erro: 'Erro ao atualizar notificações' });
  res.json({ mensagem: 'Todas as notificações marcadas como lidas' });
});

router.put('/notificacoes/:id/lida', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;

  const { error } = await supabase
    .from('portal_notificacoes')
    .update({ lida: true })
    .eq('id', id)
    .eq('cliente_id', clienteId);

  if (error) return res.status(400).json({ erro: 'Erro ao marcar notificação' });
  res.json({ mensagem: 'Notificação marcada como lida' });
});

// ============================================================
// PASTAS (do cliente — criação e gestão livre pelo próprio cliente)
// ============================================================

router.get('/pastas', async (req, res) => {
  const clienteId = req.cliente.cliente_id;

  const { data: pastas } = await supabase
    .from('portal_pastas')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('ordem');

  const ids = (pastas || []).map(p => p.id);
  const counts = {};
  if (ids.length > 0) {
    const { data: arqs } = await supabase
      .from('portal_arquivos')
      .select('pasta_id')
      .in('pasta_id', ids);
    (arqs || []).forEach(a => { counts[a.pasta_id] = (counts[a.pasta_id] || 0) + 1; });
  }

  res.json((pastas || []).map(p => ({ ...p, total_arquivos: counts[p.id] || 0 })));
});

router.post('/pastas', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { nome } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });

  const { data, error } = await supabase
    .from('portal_pastas')
    .insert([{ id: gerarId('pst_'), cliente_id: clienteId, nome: nome.trim() }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: 'Erro ao criar pasta' });
  res.status(201).json(data);
});

router.put('/pastas/:id', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;
  const { nome } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });

  const { data, error } = await supabase
    .from('portal_pastas')
    .update({ nome: nome.trim(), atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('cliente_id', clienteId)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ erro: 'Pasta não encontrada' });
  res.json(data);
});

router.delete('/pastas/:id', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;

  const { data: pasta } = await supabase
    .from('portal_pastas')
    .select('id')
    .eq('id', id)
    .eq('cliente_id', clienteId)
    .single();

  if (!pasta) return res.status(404).json({ erro: 'Pasta não encontrada' });

  await supabase.from('portal_arquivos').update({ pasta_id: null }).eq('pasta_id', id);
  await supabase.from('portal_pastas').delete().eq('id', id);
  res.json({ mensagem: 'Pasta excluída' });
});

// Upload de arquivo diretamente para uma pasta (vai para biblioteca)
router.post('/pastas/:id/arquivos', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;
  const { nome, arquivo_b64, tipo, tamanho } = req.body;

  if (!nome || !arquivo_b64) return res.status(400).json({ erro: 'Arquivo e nome são obrigatórios' });

  const { data: pasta } = await supabase
    .from('portal_pastas')
    .select('id, nome')
    .eq('id', id)
    .eq('cliente_id', clienteId)
    .single();

  if (!pasta) return res.status(404).json({ erro: 'Pasta não encontrada' });

  const sanitized = nome.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `portal/${clienteId}/biblioteca/${id}/${Date.now()}_${sanitized}`;
  const base64 = arquivo_b64.includes('base64,') ? arquivo_b64.split('base64,')[1] : arquivo_b64;
  const buffer = Buffer.from(base64, 'base64');

  const { error: upErr } = await supabase.storage
    .from('Portal')
    .upload(storagePath, buffer, { contentType: tipo || 'application/octet-stream' });

  if (upErr) return res.status(500).json({ erro: 'Erro ao fazer upload' });

  const { data: urlData } = supabase.storage.from('Portal').getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('portal_arquivos')
    .insert([{
      id: gerarId('arq_'),
      demanda_id: null,
      cliente_id: clienteId,
      pasta_id: id,
      nome,
      url: urlData.publicUrl,
      storage_path: storagePath,
      tipo: tipo || null,
      tamanho: tamanho || null,
      enviado_por_tipo: 'cliente',
      enviado_por_id: clienteId,
      enviado_por_nome: req.cliente.nome
    }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: 'Erro ao salvar arquivo' });
  res.status(201).json(data);
});

// ============================================================
// ENTREGÁVEIS (arquivos entregues pela equipe ao cliente)
// ============================================================

router.get('/demandas/:id/entregaveis', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;

  const demanda = await verificarDemandaDoCliente(id, clienteId);
  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada' });

  const [{ data: arquivos }, { data: artes }] = await Promise.all([
    supabase.from('portal_arquivos').select('*').eq('demanda_id', id).eq('enviado_por_tipo', 'equipe').order('criado_em', { ascending: false }),
    supabase.from('portal_artes').select('*').eq('demanda_id', id).order('versao', { ascending: false })
  ]);

  res.json({ arquivos: arquivos || [], artes: artes || [] });
});

// ============================================================
// APROVAÇÃO DA DEMANDA (fluxo novo — nível demanda, não arte)
// ============================================================

router.get('/aprovacoes-pendentes', async (req, res) => {
  const clienteId = req.cliente.cliente_id;

  const { data, error } = await supabase
    .from('demandas')
    .select(`
      id, titulo, descricao, data, prazo, prioridade, criado_em,
      status:status_id(id, nome, cor)
    `)
    .eq('cliente_id', clienteId)
    .eq('status_id', 's_awcli')
    .order('criado_em', { ascending: false });

  if (error) return res.status(500).json({ erro: 'Erro ao buscar aprovações pendentes' });
  res.json(data || []);
});

router.post('/demandas/:id/aprovacao-demanda', async (req, res) => {
  const clienteId = req.cliente.cliente_id;
  const { id } = req.params;
  const { acao, motivo } = req.body;

  if (!['aprovado', 'alteracao_solicitada'].includes(acao)) {
    return res.status(400).json({ erro: 'Ação inválida. Use "aprovado" ou "alteracao_solicitada"' });
  }
  if (acao === 'alteracao_solicitada' && !motivo?.trim()) {
    return res.status(400).json({ erro: 'O motivo é obrigatório ao solicitar alterações' });
  }

  const { data: demanda } = await supabase
    .from('demandas')
    .select('id, titulo, descricao, status_id, trello_card_id, cliente_id')
    .eq('id', id)
    .eq('cliente_id', clienteId)
    .eq('status_id', 's_awcli')
    .single();

  if (!demanda) return res.status(404).json({ erro: 'Demanda não encontrada ou não está aguardando aprovação' });

  await supabase.from('portal_aprovacoes_demanda').insert([{
    id: gerarId('apd_'),
    demanda_id: id,
    cliente_id: clienteId,
    cliente_nome: req.cliente.nome,
    acao,
    motivo: motivo?.trim() || null
  }]);

  const novoStatusId = acao === 'aprovado' ? 's_concl' : 's_altso';
  const updates = { status_id: novoStatusId };
  if (acao === 'aprovado') updates.data_conclusao = new Date().toISOString().split('T')[0];

  await supabase.from('demandas').update(updates).eq('id', id);

  const demandaTitulo = demanda.titulo || demanda.descricao?.slice(0, 60) || 'demanda';
  const descHist = acao === 'aprovado'
    ? `Cliente ${req.cliente.nome} aprovou a demanda`
    : `Cliente ${req.cliente.nome} solicitou alterações: ${motivo}`;

  await registrarHistorico(acao, id, descHist, req.cliente.nome);

  if (demanda.trello_card_id) {
    const trello = require('../trello');
    const texto = acao === 'aprovado'
      ? `✅ Cliente aprovou a demanda.`
      : `✏️ Cliente solicitou alterações.\n\nMotivo:\n${motivo}`;
    trello.postComment(demanda.trello_card_id, texto).catch(e => console.error('[Trello]', e.message));
  }

  const msgCliente = acao === 'aprovado'
    ? `Você aprovou a demanda "${demandaTitulo}". Obrigado!`
    : `Sua solicitação de alteração foi registrada para "${demandaTitulo}".`;

  res.json({ mensagem: msgCliente });
});

module.exports = router;
