require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const demandaRoutes = require('./routes/demandas');
const usuarioRoutes = require('./routes/usuarios');
const clienteRoutes = require('./routes/clientes');
const statusRoutes = require('./routes/status');
const formatoRoutes = require('./routes/formatos');
const historicoRoutes = require('./routes/historico');
const demandasInternasRoutes = require('./routes/demandas-internas');
const crmRoutes = require('./routes/crm');
const sdrRoutes = require('./routes/sdr');
const calendarioRoutes = require('./routes/calendario');
const contratosRoutes  = require('./routes/contratos');
const briefingRoutes   = require('./routes/briefing');
const financeiroRoutes = require('./routes/financeiro');
const onboardingRoutes = require('./routes/onboarding');
const funcionariosRoutes = require('./routes/funcionarios');
const portalAuthRoutes  = require('./routes/portal-auth');
const portalRoutes      = require('./routes/portal');
const portalAdminRoutes = require('./routes/portal-admin');

const app = express();
app.use(cors());
app.use(express.json({ limit: '45mb' }));
app.use(express.static('./'));

app.use('/api/auth', authRoutes);
app.use('/api/demandas', demandaRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/formatos', formatoRoutes);
app.use('/api/historico', historicoRoutes);
app.use('/api/demandas-internas', demandasInternasRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/sdr', sdrRoutes);
app.use('/api/calendario', calendarioRoutes);
app.use('/api/contratos',  contratosRoutes);
app.use('/api/briefing',   briefingRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/funcionarios', funcionariosRoutes);
app.use('/api/portal/auth', portalAuthRoutes);
app.use('/api/portal',      portalRoutes);
app.use('/api/portal-admin', portalAdminRoutes);

app.get('/briefing/:id', (req, res) => res.sendFile('briefing.html', { root: './' }));
app.get('/portal', (req, res) => res.sendFile(path.join(__dirname, 'portal.html')));
app.get('/redefinir-senha/:token', (req, res) => res.sendFile(path.join(__dirname, 'redefinir-senha.html')));

// Erros do body-parser (ex.: arquivo/foto maior que o limite) chegam aqui como HTML puro,
// o que fazia o front mostrar so um erro generico sem explicar o motivo real.
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ erro: 'Arquivo muito grande para enviar. Tente uma imagem ou vídeo menor.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'Requisição inválida.' });
  }
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

// Cobrança automática por WhatsApp: todo dia às 9h (horário de Brasília),
// verifica pagamentos de clientes vencidos e ainda "pendente" e avisa.
// Sem efeito se o Z-API (whatsapp.js) não estiver configurado — só loga.
cron.schedule('0 9 * * *', () => {
  financeiroRoutes.verificarPagamentosAtrasados().catch(e => console.error('[cobranca] erro no job diário:', e.message));
}, { timezone: 'America/Sao_Paulo' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
