require('dotenv').config();
const express = require('express');
const cors = require('cors');

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

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
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

// Serve briefing page at /briefing/:id
app.get('/briefing/:id', (req, res) => res.sendFile('briefing.html', { root: './' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));