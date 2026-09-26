// Settings live only on this device (localStorage).

const KEY = 'jarvis.settings';
const isPhone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 700px), (pointer: coarse)').matches;

const defaults = {
  name: '',
  signature: '',
  tone: 'friendly',
  engine: 'local',                       // 'local' | 'ollama' | 'off'
  localModel: isPhone ? 'light' : 'smart',
  downloaded: {},                        // { light: true, … } once cached on this device
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: '',
  speak: false,
  notify: true,
  sound: true,
  alertMinutes: 0,                       // default alert: at the time of the reminder
  welcomed: false,
};

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export const settings = { ...defaults, ...load() };

// Name, sign-off, reply tone and default alert belong to your account and sync.
export const PROFILE_KEYS = ['name', 'signature', 'tone', 'alertMinutes'];
let profileHook = null;
export const onProfileChange = (fn) => { profileHook = fn; };

export function save(patch, { fromServer = false } = {}) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  if (!fromServer && profileHook) {
    const profile = Object.fromEntries(Object.entries(patch).filter(([k]) => PROFILE_KEYS.includes(k)));
    if (Object.keys(profile).length) profileHook(profile);
  }
}


export const firstName = () => (settings.name || '').trim().split(/\s+/)[0] || '';

// Small keyed cache for per-person conveniences (briefing, chat history, drafts).
// Scoped to the signed-in account so people sharing a device never see each other's.
let scope = 'guest';
export const setScope = (userId) => { scope = userId || 'guest'; };
const scoped = (key) => `jarvis.u.${scope}.${key}`;

export const local = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(scoped(key)); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(scoped(key), JSON.stringify(value)); } catch { /* ignore */ }
  },
  remove(key) {
    try { localStorage.removeItem(scoped(key)); } catch { /* ignore */ }
  },
};

/** Clears the signed-in person's details from this device (on sign-out). */
export function forgetPerson() {
  save({ name: '', signature: '', tone: 'friendly', alertMinutes: 0 }, { fromServer: true });
}

export function resetAll() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('jarvis.')).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
