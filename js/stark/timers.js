// Timers — "set a timer for 10 minutes". They survive reloads (per device).

import { local } from '../store.js';
import { alertNow } from '../notify.js';

let timers = [];
const listeners = new Set();
let ticker = null;

const persist = () => local.set('timers', timers);
const emit = () => listeners.forEach((fn) => fn(timers));

export const onTimers = (fn) => { listeners.add(fn); fn(timers); return () => listeners.delete(fn); };
export const activeTimers = () => timers;

export function loadTimers() {
  timers = (local.get('timers', []) || []).filter((t) => t.endsAt > Date.now() - 60_000);
  tick();
}

export function startTimer(ms, label = 'Timer', { kind = 'timer', onDone } = {}) {
  const t = { id: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`, label, kind, startedAt: Date.now(), endsAt: Date.now() + ms };
  timers = [...timers, t];
  if (onDone) doneHandlers.set(t.id, onDone);
  persist();
  emit();
  tick();
  return t;
}

export function cancelTimer(id) {
  timers = timers.filter((t) => t.id !== id);
  doneHandlers.delete(id);
  persist();
  emit();
}

const doneHandlers = new Map();
let speakFn = null;
export const setTimerVoice = (fn) => { speakFn = fn; };

function tick() {
  clearInterval(ticker);
  if (!timers.length) return;
  ticker = setInterval(() => {
    const now = Date.now();
    const finished = timers.filter((t) => t.endsAt <= now);
    if (finished.length) {
      timers = timers.filter((t) => t.endsAt > now);
      persist();
      for (const t of finished) {
        alertNow(t.kind === 'focus' ? 'Focus session complete' : 'Timer done', t.label);
        speakFn?.(t.kind === 'focus' ? 'Focus session complete. Well done.' : `Your ${t.label.toLowerCase()} is up.`);
        doneHandlers.get(t.id)?.();
        doneHandlers.delete(t.id);
      }
    }
    emit();
    if (!timers.length) clearInterval(ticker);
  }, 500);
}

export function fmtRemaining(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** "10 minutes", "1h30m", "90 seconds", "an hour" → ms */
export function parseDuration(text) {
  let total = 0;
  const re = /(\d+(?:\.\d+)?|an?|half an?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = /^half/i.test(m[1]) ? 0.5 : /^an?$/i.test(m[1]) ? 1 : Number(m[1]);
    const u = m[2].toLowerCase();
    total += n * (u.startsWith('h') ? 3600e3 : u.startsWith('m') ? 60e3 : 1e3);
  }
  return total;
}
