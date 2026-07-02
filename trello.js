const BASE = 'https://api.trello.com/1';

async function postComment(cardId, text) {
  const key   = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token || !cardId) return;
  try {
    const res = await fetch(
      `${BASE}/cards/${cardId}/actions/comments?key=${key}&token=${token}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }
    );
    if (!res.ok) console.error('[Trello] status:', res.status, await res.text());
  } catch (e) {
    console.error('[Trello] erro:', e.message);
  }
}

module.exports = { postComment };
