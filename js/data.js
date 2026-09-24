// Your reminders, notes and updates — stored only on this device (localStorage).
// Nothing is synced or sent anywhere. Use Export / Import in Settings to back up
// or move your data between phone and computer.

const KEY = 'jarvis.data';
const KINDS = ['reminders', 'notes', 'updates'];

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY)) || {};
    return Object.fromEntries(KINDS.map((k) => [k, Array.isArray(raw[k]) ? raw[k] : []]));
  } catch {
    return { reminders: [], notes: [], updates: [] };
  }
}

let db = load();
const listeners = new Set();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or private mode */ }
  listeners.forEach((fn) => fn(db));
}

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const all = (kind) => db[kind];
export const get = (kind, id) => db[kind].find((x) => x.id === id);

export function add(kind, item) {
  const now = Date.now();
  const record = { id: uid(), createdAt: now, updatedAt: now, ...item };
  db[kind] = [record, ...db[kind]];
  persist();
  return record;
}

export function update(kind, id, patch) {
  db[kind] = db[kind].map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x));
  persist();
  return get(kind, id);
}

export function remove(kind, id) {
  const item = get(kind, id);
  db[kind] = db[kind].filter((x) => x.id !== id);
  persist();
  return item;
}

/** Put back something that was just removed (for Undo). */
export function restore(kind, item) {
  if (!item || get(kind, item.id)) return;
  db[kind] = [item, ...db[kind]];
  persist();
}

/* ---------- Reminder helpers ---------- */

/** When a reminder is due as a Date (all-day reminders count as the end of that day). */
export function dueAt(r) {
  if (!r.date) return null;
  const [y, m, d] = r.date.split('-').map(Number);
  if (!r.time) return new Date(y, m - 1, d, 23, 59, 59);
  const [hh, mm] = r.time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function sortReminders(list) {
  return [...list].sort((a, b) => {
    const da = dueAt(a), dbb = dueAt(b);
    if (da && dbb) return da - dbb || (a.time ? 0 : 1) - (b.time ? 0 : 1);
    if (da) return -1;
    if (dbb) return 1;
    return b.createdAt - a.createdAt;
  });
}

export const openReminders = () => sortReminders(db.reminders.filter((r) => !r.done));

/** Simple relevance search across everything (used by Jarvis for context). */
const STOP = new Set('the and what whats when where who how are was were for you your with that this have has had from about did does can could tell show give any all get got need want know remind jarvis please there their them into out our not but its it\'s'.split(' '));

export function search(query, { limit = 6 } = {}) {
  const words = (String(query).toLowerCase().replace(/[’']/g, '').match(/[\p{L}\p{N}]{3,}/gu) || []).filter((w) => !STOP.has(w));
  if (!words.length) return [];
  const score = (text) => {
    const t = text.toLowerCase();
    return words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
  };
  const hits = [
    ...db.notes.map((n) => ({ kind: 'note', item: n, score: score(`${n.title} ${n.body}`) })),
    ...db.updates.map((u) => ({ kind: 'update', item: u, score: score(u.text) })),
    ...db.reminders.map((r) => ({ kind: 'reminder', item: r, score: score(`${r.title} ${r.notes || ''}`) })),
  ];
  return hits.filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ---------- Backup ---------- */

export function exportData() {
  return JSON.stringify({ app: 'jarvis', version: 1, exportedAt: new Date().toISOString(), ...db }, null, 2);
}

/** Merges a backup in (existing items with the same id are replaced). Returns counts. */
export function importData(json) {
  const incoming = typeof json === 'string' ? JSON.parse(json) : json;
  if (!incoming || !KINDS.some((k) => Array.isArray(incoming[k]))) throw new Error('That file isn’t a Jarvis backup.');
  const counts = {};
  for (const k of KINDS) {
    const list = Array.isArray(incoming[k]) ? incoming[k].filter((x) => x && x.id) : [];
    const ids = new Set(list.map((x) => x.id));
    db[k] = [...list, ...db[k].filter((x) => !ids.has(x.id))];
    counts[k] = list.length;
  }
  persist();
  return counts;
}

export function eraseAll() {
  db = { reminders: [], notes: [], updates: [] };
  persist();
}

export const hasSample = () => KINDS.some((k) => db[k].some((x) => x.sample));
export function removeSample() {
  for (const k of KINDS) db[k] = db[k].filter((x) => !x.sample);
  persist();
}

/* ---------- Sample data (so Jarvis can be explored straight away) ---------- */

export function addSample() {
  const pad = (n) => String(n).padStart(2, '0');
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const ago = (mins) => Date.now() - mins * 60000;
  const s = { sample: true };

  const reminders = [
    { title: 'Call Mom', date: day(0), time: '18:00', notes: 'Ask about the weekend plans.' },
    { title: 'Send invoice to Northwind', date: day(0), time: null },
    { title: 'Design review with Priya', date: day(1), time: '10:00', notes: 'Bring the onboarding mockups.' },
    { title: 'Gym', date: day(2), time: '17:30' },
    { title: 'Dinner at Lucia’s', date: day(3), time: '19:00' },
    { title: 'Dentist', date: day(5), time: '15:30', notes: 'Allen Dental, 2nd floor.' },
    { title: 'Renew passport', date: null, time: null },
    { title: 'Pay credit card', date: day(-1), time: null },
  ];
  const notes = [
    { title: 'Wi-Fi & door codes', body: 'Home Wi-Fi: Jarvis-5G / password on the router.\nBuilding door code: 4821\nGarage: 1966#', pinned: true },
    { title: 'Gift ideas for Mom', body: '- Pottery class voucher\n- The new Kazuo Ishiguro book\n- Orchid for the kitchen window', pinned: false },
    { title: 'Onboarding redesign — thoughts', body: 'Cut the sign-up to two screens. Move permissions to first use. Priya wants a progress indicator; I think a checklist is clearer.', pinned: false },
  ];
  const updates = [
    { text: 'Priya moved the design review to tomorrow at 10.', at: ago(40) },
    { text: 'Sent the Q3 report to the team.', at: ago(60 * 5) },
    { text: 'Booked dinner at Lucia’s for Saturday, 4 people.', at: ago(60 * 26) },
  ];

  const now = Date.now();
  db.reminders = [...reminders.map((r, i) => ({ id: uid(), done: false, createdAt: now - i, updatedAt: now, notes: '', ...r, ...s })), ...db.reminders];
  db.notes = [...notes.map((n, i) => ({ id: uid(), createdAt: now - i * 3600e3, updatedAt: now - i * 3600e3, ...n, ...s })), ...db.notes];
  db.updates = [...updates.map((u) => ({ id: uid(), createdAt: u.at, updatedAt: u.at, ...u, ...s })), ...db.updates];
  persist();
}

/** Note body with the title removed when the body merely repeats it. */
export function noteExtra(n) {
  const norm = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const body = (n.body || '').trim();
  const title = (n.title || '').replace(/…$/, '');
  return norm(body) === norm(title) || (norm(body).startsWith(norm(title)) && body.length <= title.length + 2) ? '' : body;
}
