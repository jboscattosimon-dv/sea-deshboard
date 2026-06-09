// Rode: node scripts/reset-senha.js
require('dotenv').config();
const bcrypt  = require('bcryptjs');
const supabase = require('../supabase');

(async () => {
  const email = 'admin@dev.com';
  const novaSenha = '123456';
  const hash = await bcrypt.hash(novaSenha, 10);

  const { error } = await supabase
    .from('usuarios')
    .update({ senha_hash: hash })
    .eq('email', email);

  if (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }
  console.log(`Senha de ${email} alterada com sucesso.`);
  process.exit(0);
})();
