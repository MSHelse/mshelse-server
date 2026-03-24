const BACKEND = 'https://mshelse-server.onrender.com';

export async function sendMelding(messages: any[]) {
  const res = await fetch(`${BACKEND}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error('Nettverksfeil');
  const data = await res.json();
  const text = data.content.map((b: any) => b.text || '').join('');
  return parseJSON(text);
}

function parseJSON(text: string) {
  let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Ingen JSON i svar');
  let raw = clean.slice(start, end + 1);
  raw = raw.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
  try {
    return JSON.parse(raw);
  } catch {
    raw = raw.replace(/[\u0000-\u001F\u007F]/g, ' ');
    return JSON.parse(raw);
  }
}
