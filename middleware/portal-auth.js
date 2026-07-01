const jwt = require('jsonwebtoken');

module.exports = function portalAuthMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'segredo');
    if (decoded.tipo !== 'cliente') {
      return res.status(403).json({ erro: 'Acesso restrito ao portal do cliente' });
    }
    req.cliente = decoded;
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
};
