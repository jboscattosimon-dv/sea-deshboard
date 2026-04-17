require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const demandaRoutes = require('./routes/demandas');
const usuarioRoutes = require('./routes/usuarios');
const clienteRoutes = require('./routes/clientes');
const statusRoutes = require('./routes/status');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('./'));

app.use('/api/auth', authRoutes);
app.use('/api/demandas', demandaRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/status', statusRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
