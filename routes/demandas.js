const express = require('express');
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');
const trello = require('../trello');
const router = express.Router();

router.use(authMiddleware);

function gerarId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 10);
}

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('demandas')
    .select('*, clientes(nome), status(nome, cor), formatos(nome)')
    .order('data', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const {
    data: date, cliente_id, status_id, formato_id, descricao, observacao,
    titulo, prioridade, prazo, categoria, responsavel_id, responsavel_nome, trello_card_id
  } = req.body;

  const { data, error } = await supabase
    .from('demandas')
    .insert([{
      data: date, cliente_id, status_id, formato_id: formato_id || null,
      descricao, observacao, criado_por: req.usuario.id,
      titulo: titulo || null, prioridade: prioridade || null, prazo: prazo || null,
      categoria: categoria || null, responsavel_id: responsavel_id || null,
      responsavel_nome: responsavel_nome || null,
      trello_card_id: trello_card_id || null
    }])
    .select()
    .single();

  if (error) return res.status(400).json({ erro: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const {
    data: date, cliente_id, status_id, formato_id, descricao, observacao, postado,
    titulo, prioridade, prazo, categoria, responsavel_id, responsavel_nome, trello_card_id
  } = req.body;

  // Fetch current demand to detect status change and get client_id
  const { data: atual } = await supabase
    .from('demandas')
    .select('status_id, cliente_id, trello_card_id, titulo, descricao')
    .eq('id', req.params.id)
    .single();

  const updates = {};
  if (date !== undefined)             updates.data             = date;
  if (cliente_id !== undefined)       updates.cliente_id       = cliente_id;
  if (status_id !== undefined)        updates.status_id        = status_id;
  if (formato_id !== undefined)       updates.formato_id       = formato_id || null;
  if (descricao !== undefined)        updates.descricao        = descricao;
  if (observacao !== undefined)       updates.observacao       = observacao;
  if (postado !== undefined)          updates.postado          = postado;
  if (titulo !== undefined)           updates.titulo           = titulo || null;
  if (prioridade !== undefined)       updates.prioridade       = prioridade || null;
  if (prazo !== undefined)            updates.prazo            = prazo || null;
  if (categoria !== undefined)        updates.categoria        = categoria || null;
  if (responsavel_id !== undefined)   updates.responsavel_id   = responsavel_id || null;
  if (responsavel_nome !== undefined) updates.responsavel_nome = responsavel_nome || null;
  if (trello_card_id !== undefined)   updates.trello_card_id   = trello_card_id || null;

  const { data, error } = await supabase
    .from('demandas')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ erro: error.message });

  // When team marks demand as "Aguardando Aprovação do Cliente", notify the client
  if (status_id === 's_awcli' && atual && atual.status_id !== 's_awcli') {
    const clienteId = atual.cliente_id;
    const demandaTitulo = atual.titulo || atual.descricao?.slice(0, 60) || 'demanda';

    await supabase.from('portal_notificacoes').insert([{
      id: gerarId('ntf_'),
      cliente_id: clienteId,
      tipo: 'aprovacao_pendente',
      titulo: 'Demanda aguardando sua aprovação',
      mensagem: `A demanda "${demandaTitulo}" está pronta e aguarda sua aprovação.`,
      entidade: 'demanda',
      entidade_id: req.params.id
    }]);

    const cardId = trello_card_id || atual.trello_card_id;
    if (cardId) {
      trello.postComment(cardId, '⏳ Demanda enviada para aprovação do cliente.').catch(e => console.error('[Trello]', e.message));
    }
  }

  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('demandas').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ mensagem: 'Demanda removida' });
});

module.exports = router;
