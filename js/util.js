export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function parseYMD(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Local Date from "YYYY-MM-DD" and optional "HH:MM". */
export function atTime(dateStr, timeStr) {
  const d = parseYMD(dateStr);
  if (timeStr) {
    const [H, M] = String(timeStr).split(':').map(Number);
    d.setHours(H || 0, M || 0, 0, 0);
  }
  return d;
}

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const addMinutes = (d, n) => new Date(d.getTime() + n * 60000);
export const sameDay = (a, b) => ymd(a) === ymd(b);
const dayDiff = (d) => Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);

export const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function fmtDay(d) {
  const diff = dayDiff(d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Thu 3:00 PM" style used in chat and for the AI. */
export const fmtShort = (d, allDay = false) =>
  `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}${allDay ? ' (all day)' : ` ${fmtTime(d)}`}`;

export function fmtRelative(ts) {
  const d = new Date(ts);
  const diff = -dayDiff(d);
  if (diff === 0) return fmtTime(d);
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Human description of "now" for prompts. */
export function nowContext() {
  const d = new Date();
  return `${d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${fmtTime(d)} (ISO local ${ymd(d)}T${hm(d)}, timezone ${tz()})`;
}

export function initials(name = '') {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function colorFor(str = '') {
  let h = 0;
  for (const c of str) h = (h * 31 + c.codePointAt(0)) % 360;
  return `hsl(${h} 45% 50%)`;
}

export function decodeEntities(s = '') {
  return new DOMParser().parseFromString(s, 'text/html').documentElement.textContent || '';
}

export function debounce(fn, ms = 400) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** How to dictate with the device's own keyboard (no browser speech service involved). */
export function dictationHint() {
  const ua = navigator.userAgent;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (isIOS() || (touch && /Android/i.test(ua))) return 'Tap the mic on your keyboard to speak';
  if (/Mac/i.test(navigator.platform || ua)) return 'Press the Fn key twice to dictate';
  if (/Win/i.test(navigator.platform || ua)) return 'Press Windows + H to dictate';
  return 'Use your keyboard’s dictation to speak';
}
