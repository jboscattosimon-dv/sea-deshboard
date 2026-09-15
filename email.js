// Envio de e-mail via Resend (https://resend.com). Usa fetch (Node 18+), sem dependência extra.
// Se RESEND_API_KEY não estiver configurada, o erro é logado e reportado ao chamador —
// diferente do trello.js, aqui o e-mail É o próprio objetivo da operação, não um efeito colateral.

async function enviarEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('[email] RESEND_API_KEY não configurada — e-mail não enviado');
    return { erro: 'Serviço de e-mail não configurado' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'SEA Dashboard <onboarding@resend.dev>',
        to,
        subject,
        html,
      }),
    });
    if (!r.ok) {
      const erro = await r.text();
      console.error('[email] Erro ao enviar:', erro);
      return { erro };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email] Erro ao enviar:', e.message);
    return { erro: e.message };
  }
}

function enviarEmailRecuperacaoSenha(destinatario, nome, link) {
  return enviarEmail({
    to: destinatario,
    subject: 'Recuperação de senha — Dashboard SEA',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#081542">Recuperação de senha</h2>
        <p>Oi, ${nome}! Recebemos uma solicitação para redefinir sua senha no Dashboard da SEA.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#18170F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Redefinir minha senha
          </a>
        </p>
        <p style="font-size:13px;color:#666">Esse link expira em 1 hora. Se você não pediu essa alteração, pode ignorar este e-mail — sua senha continua a mesma.</p>
      </div>
    `,
  });
}

module.exports = { enviarEmail, enviarEmailRecuperacaoSenha };
