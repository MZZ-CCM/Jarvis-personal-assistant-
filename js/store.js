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

export function save(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

export const isSetUp = () => settings.welcomed;

export const firstName = () => (settings.name || '').trim().split(/\s+/)[0] || '';

// Small keyed cache for per-device conveniences (briefing, chat history).
export const local = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(`jarvis.${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`jarvis.${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  },
  remove(key) {
    try { localStorage.removeItem(`jarvis.${key}`); } catch { /* ignore */ }
  },
};

export function resetAll() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('jarvis.')).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
