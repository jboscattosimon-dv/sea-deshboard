// Envio de WhatsApp via Z-API (https://www.z-api.io).
// Se as variáveis de ambiente não estiverem configuradas, enviarWhatsApp()
// não faz nada e retorna false — igual ao padrão já usado em trello.js.

function normalizarTelefone(telefone) {
  const digits = String(telefone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('55') ? digits : '55' + digits;
}

async function enviarWhatsApp(telefone, mensagem) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instanceId || !token) return false;

  const phone = normalizarTelefone(telefone);
  if (!phone) return false;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (clientToken) headers['Client-Token'] = clientToken;

    const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, message: mensagem })
    });

    if (!res.ok) {
      console.error('[whatsapp] status:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[whatsapp] erro:', e.message);
    return false;
  }
}

module.exports = { enviarWhatsApp, normalizarTelefone };
