// Your reminders, notes and updates.
//
// Stored in your Jarvis account (Supabase) and cached on this device so the app
// is instant and works offline:
//   • Changes apply immediately, then sync in the background.
//   • Offline changes wait in a queue and send when you're back online.
//   • Changes from your other devices arrive live.
// Each account has its own cache; signing out removes it from this device.

import { supabase } from './auth.js';
import { toast } from './ui.js';

const KINDS = ['reminders', 'notes', 'updates'];
const empty = () => ({ reminders: [], notes: [], updates: [] });
const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

let userId = null;
let db = empty();
let queue = [];             // pending writes: { op: 'upsert'|'delete', kind, id, item? }
let channel = null;
let pullTimer = null;
const listeners = new Set();
const statusListeners = new Set();
let status = 'offline';     // 'synced' | 'syncing' | 'offline' | 'error'

const cacheKey = () => `jarvis.u.${userId}.data`;
const queueKey = () => `jarvis.u.${userId}.queue`;

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full / private mode */ }
}

function persist() {
  if (!userId) return;
  writeJSON(cacheKey(), db);
  writeJSON(queueKey(), queue);
}
const emit = () => listeners.forEach((fn) => fn(db));
function setStatus(s) { status = s; statusListeners.forEach((fn) => fn(s)); }

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const onSyncStatus = (fn) => { statusListeners.add(fn); fn(status); return () => statusListeners.delete(fn); };
export const syncStatus = () => status;
export const all = (kind) => db[kind];
export const get = (kind, id) => db[kind].find((x) => x.id === id);

/* ---------- Row mapping (app ↔ database) ---------- */

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const ms = (ts) => (ts == null ? null : Date.parse(ts));

function toRow(kind, x) {
  const base = { id: x.id, user_id: userId, sample: !!x.sample, created_at: iso(x.createdAt), updated_at: iso(x.updatedAt) };
  if (kind === 'reminders') {
    return { ...base, title: x.title, date: x.date || null, time: x.date ? x.time || null : null, notes: x.notes || '', alert: x.alert ?? null, done: !!x.done, done_at: iso(x.doneAt) };
  }
  if (kind === 'notes') return { ...base, title: x.title || '', body: x.body || '', pinned: !!x.pinned };
  return { ...base, text: x.text, at: iso(x.at) };
}

function fromRow(kind, r) {
  const base = { id: r.id, sample: r.sample, createdAt: ms(r.created_at), updatedAt: ms(r.updated_at) };
  if (kind === 'reminders') {
    return { ...base, title: r.title, date: r.date, time: r.time, notes: r.notes, alert: r.alert, done: r.done, doneAt: ms(r.done_at) };
  }
  if (kind === 'notes') return { ...base, title: r.title, body: r.body, pinned: r.pinned };
  return { ...base, text: r.text, at: ms(r.at) };
}

/* ---------- Writes (optimistic, queued) ---------- */

function enqueue(entry) {
  // Keep only the latest pending write per item.
  queue = queue.filter((q) => !(q.kind === entry.kind && q.id === entry.id));
  queue.push(entry);
  persist();
  scheduleFlush();
}

export function add(kind, item) {
  const now = Date.now();
  const record = { id: uid(), createdAt: now, updatedAt: now, ...item };
  db[kind] = [record, ...db[kind]];
  persist();
  emit();
  enqueue({ op: 'upsert', kind, id: record.id, item: record });
  return record;
}

export function update(kind, id, patch) {
  let next = null;
  db[kind] = db[kind].map((x) => (x.id === id ? (next = { ...x, ...patch, updatedAt: Date.now() }) : x));
  if (!next) return null;
  persist();
  emit();
  enqueue({ op: 'upsert', kind, id, item: next });
  return next;
}

export function remove(kind, id) {
  const item = get(kind, id);
  db[kind] = db[kind].filter((x) => x.id !== id);
  persist();
  emit();
  enqueue({ op: 'delete', kind, id });
  return item;
}

/** Put back something that was just removed (for Undo). */
export function restore(kind, item) {
  if (!item || get(kind, item.id)) return;
  db[kind] = [item, ...db[kind]];
  persist();
  emit();
  enqueue({ op: 'upsert', kind, id: item.id, item });
}

/* ---------- Sync engine ---------- */

let flushTimer = null;
let flushing = false;
function scheduleFlush(delay = 250) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, delay);
}

async function flush() {
  if (!userId || !supabase || flushing || !queue.length) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  flushing = true;
  setStatus('syncing');
  try {
    while (queue.length && userId) {
      const entry = queue[0];
      const res = entry.op === 'delete'
        ? await supabase.from(entry.kind).delete().eq('id', entry.id)
        : await supabase.from(entry.kind).upsert(toRow(entry.kind, entry.item));
      if (res.error) {
        const network = !res.status || res.status >= 500 || /fetch|network/i.test(res.error.message);
        if (network) { setStatus('offline'); scheduleFlush(15_000); return; }
        // Rejected by the server (e.g. too long) — drop it so the queue can't jam.
        toast(`Couldn’t save a change: ${res.error.message}`, 'error');
      }
      queue.shift();
      persist();
    }
    setStatus('synced');
  } finally {
    flushing = false;
  }
}

/** Replace the cache with the server's copy, keeping any not-yet-sent local changes on top. */
async function pull() {
  if (!userId || !supabase || !navigator.onLine) return;
  const results = await Promise.all(KINDS.map((k) => supabase.from(k).select('*').order('created_at', { ascending: false }).limit(5000)));
  if (results.some((r) => r.error)) { setStatus('error'); return; }
  const next = empty();
  KINDS.forEach((k, i) => { next[k] = results[i].data.map((r) => fromRow(k, r)); });
  for (const q of queue) {
    next[q.kind] = next[q.kind].filter((x) => x.id !== q.id);
    if (q.op === 'upsert') next[q.kind].unshift(q.item);
  }
  db = next;
  persist();
  emit();
  if (!queue.length) setStatus('synced');
}

function subscribeLive() {
  channel?.unsubscribe();
  channel = supabase.channel(`jarvis-${userId}`);
  for (const kind of KINDS) {
    // Inserts and updates for this user only (RLS applies to Realtime too).
    // Deletes are picked up by the periodic refresh, so no deleted-row ids are broadcast.
    for (const event of ['INSERT', 'UPDATE']) {
      channel.on('postgres_changes', { event, schema: 'public', table: kind, filter: `user_id=eq.${userId}` }, ({ new: row }) => {
        if (queue.some((q) => q.kind === kind && q.id === row.id)) return; // our own pending edit wins
        const item = fromRow(kind, row);
        const exists = db[kind].some((x) => x.id === item.id);
        db[kind] = exists ? db[kind].map((x) => (x.id === item.id ? item : x)) : [item, ...db[kind]];
        persist();
        emit();
      });
    }
  }
  channel.subscribe();
}

const onOnline = () => { flush().then(pull); };
const onVisible = () => { if (document.visibilityState === 'visible') flush().then(pull); };

/** Called after sign-in. Loads this user's cache instantly, then syncs. */
export async function startSync(user) {
  if (userId === user.id) return;
  stopSync();
  userId = user.id;
  db = readJSON(cacheKey(), empty());
  for (const k of KINDS) if (!Array.isArray(db[k])) db[k] = [];
  queue = readJSON(queueKey(), []);
  emit();
  importLegacyOnce();
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  pullTimer = setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 60_000);
  subscribeLive();
  await flush();
  await pull();
}

/** Called on sign-out. `wipe` removes this account's cached data from the device. */
export function stopSync({ wipe = false } = {}) {
  channel?.unsubscribe();
  channel = null;
  clearInterval(pullTimer);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
  if (wipe && userId) {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(`jarvis.u.${userId}.`)).forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }
  userId = null;
  db = empty();
  queue = [];
  setStatus('offline');
  emit();
}

/** Anything saved by the earlier device-only version of Jarvis moves into the first account used here. */
function importLegacyOnce() {
  const legacy = readJSON('jarvis.data', null);
  if (!legacy) return;
  let count = 0;
  for (const k of KINDS) {
    for (const item of Array.isArray(legacy[k]) ? legacy[k] : []) {
      if (!item?.id || get(k, item.id)) continue;
      const { notifiedAt, ...clean } = item;
      db[k].push(clean);
      queue.push({ op: 'upsert', kind: k, id: clean.id, item: clean });
      count++;
    }
  }
  localStorage.removeItem('jarvis.data');
  persist();
  emit();
  if (count) setTimeout(() => toast(`Moved ${count} saved item${count === 1 ? '' : 's'} into your account`), 1200);
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

/** Note body with the title removed when the body merely repeats it. */
export function noteExtra(n) {
  const norm = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const body = (n.body || '').trim();
  const title = (n.title || '').replace(/…$/, '');
  return norm(body) === norm(title) || (norm(body).startsWith(norm(title)) && body.length <= title.length + 2) ? '' : body;
}

/* ---------- Backup ---------- */

export function exportData() {
  return JSON.stringify({ app: 'jarvis', version: 2, exportedAt: new Date().toISOString(), ...db }, null, 2);
}

/** Merges a backup into your account. Returns counts. */
export function importData(json) {
  const incoming = typeof json === 'string' ? JSON.parse(json) : json;
  if (!incoming || !KINDS.some((k) => Array.isArray(incoming[k]))) throw new Error('That file isn’t a Jarvis backup.');
  const counts = {};
  for (const k of KINDS) {
    const list = (Array.isArray(incoming[k]) ? incoming[k] : []).filter((x) => x && typeof x === 'object');
    for (const raw of list) {
      const { notifiedAt, ...item } = raw;
      // Backups from other accounts get fresh ids so they can never collide.
      const exists = item.id && get(k, item.id);
      const clean = { ...item, id: exists ? item.id : uid(), createdAt: item.createdAt || Date.now(), updatedAt: Date.now() };
      db[k] = [clean, ...db[k].filter((x) => x.id !== clean.id)];
      queue = queue.filter((q) => !(q.kind === k && q.id === clean.id));
      queue.push({ op: 'upsert', kind: k, id: clean.id, item: clean });
    }
    counts[k] = list.length;
  }
  persist();
  emit();
  scheduleFlush();
  return counts;
}

export const hasSample = () => KINDS.some((k) => db[k].some((x) => x.sample));
export function removeSample() {
  for (const k of KINDS) for (const x of db[k].filter((y) => y.sample)) remove(k, x.id);
}

/* ---------- Sample data (so Jarvis can be explored straight away) ---------- */

export function addSample() {
  const pad = (n) => String(n).padStart(2, '0');
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const ago = (mins) => Date.now() - mins * 60000;
  const s = { sample: true };

  [
    { title: 'Pay credit card', date: day(-1), time: null },
    { title: 'Renew passport', date: null, time: null },
    { title: 'Dentist', date: day(5), time: '15:30', notes: 'Allen Dental, 2nd floor.' },
    { title: 'Dinner at Lucia’s', date: day(3), time: '19:00' },
    { title: 'Gym', date: day(2), time: '17:30' },
    { title: 'Design review with Priya', date: day(1), time: '10:00', notes: 'Bring the onboarding mockups.' },
    { title: 'Send invoice to Northwind', date: day(0), time: null },
    { title: 'Call Mom', date: day(0), time: '18:00', notes: 'Ask about the weekend plans.' },
  ].forEach((r) => add('reminders', { done: false, notes: '', ...r, ...s }));

  [
    { title: 'Onboarding redesign — thoughts', body: 'Cut the sign-up to two screens. Move permissions to first use. Priya wants a progress indicator; I think a checklist is clearer.', pinned: false },
    { title: 'Gift ideas for Mom', body: '- Pottery class voucher\n- The new Kazuo Ishiguro book\n- Orchid for the kitchen window', pinned: false },
    { title: 'Wi-Fi & door codes', body: 'Home Wi-Fi: Jarvis-5G / password on the router.\nBuilding door code: 4821\nGarage: 1966#', pinned: true },
  ].forEach((n) => add('notes', { ...n, ...s }));

  [
    { text: 'Booked dinner at Lucia’s for Saturday, 4 people.', at: ago(60 * 26) },
    { text: 'Sent the Q3 report to the team.', at: ago(60 * 5) },
    { text: 'Priya moved the design review to tomorrow at 10.', at: ago(40) },
  ].forEach((u) => add('updates', { ...u, ...s }));
}

/* ---------- Profile (name, sign-off, reply tone, default alert) ---------- */

export async function loadProfile() {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from('profiles').select('name, signature, tone, alert_minutes').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return { name: data.name, signature: data.signature, tone: data.tone, alertMinutes: data.alert_minutes };
}

export async function saveProfile(patch) {
  if (!supabase || !userId) return;
  const row = {};
  if ('name' in patch) row.name = String(patch.name).slice(0, 80);
  if ('signature' in patch) row.signature = String(patch.signature).slice(0, 500);
  if ('tone' in patch) row.tone = patch.tone;
  if ('alertMinutes' in patch) row.alert_minutes = patch.alertMinutes;
  if (!Object.keys(row).length) return;
  const { error } = await supabase.from('profiles').update(row).eq('id', userId);
  if (error) toast(`Couldn’t save your profile: ${error.message}`, 'error');
}
