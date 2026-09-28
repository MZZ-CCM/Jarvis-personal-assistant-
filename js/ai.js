// Jarvis's AI brain — free forever, no accounts, no API keys.
//
//  • On-device (default): an open model runs inside your browser with WebGPU
//    (via WebLLM). Downloaded once, cached, then works offline. Nothing you
//    type leaves the device.
//  • Ollama (optional): use a bigger model already running on your computer.
//  • Off: Jarvis still handles reminders, notes and updates with its built-in
//    commands; only open-ended chat and email drafting need a brain.

import { settings, save } from './store.js';

export const MODELS = [
  { key: 'light', name: 'Light', base: 'Llama-3.2-1B-Instruct', size: '0.9 GB', blurb: 'Quick and small — best for iPhone.' },
  { key: 'balanced', name: 'Balanced', base: 'Qwen2.5-1.5B-Instruct', size: '1.6 GB', blurb: 'Noticeably better answers; newer phones and laptops.' },
  { key: 'smart', name: 'Smart', base: 'Llama-3.2-3B-Instruct', size: '2.3 GB', blurb: 'The most thoughtful — best on a computer.' },
];
export const modelInfo = (key = settings.localModel) => MODELS.find((m) => m.key === key) || MODELS[0];

export class AIError extends Error {}

export const webgpuSupported = () => typeof navigator !== 'undefined' && 'gpu' in navigator;

/** Is a brain ready to answer right now (without a surprise download)? */
export function aiReady() {
  if (settings.engine === 'ollama') return !!settings.ollamaModel?.trim();
  if (settings.engine === 'local') return !!settings.downloaded?.[settings.localModel] && webgpuSupported();
  return false;
}

/* ---------- Status (for progress bars) ---------- */

let status = { state: 'idle', progress: 0, text: '' };
const listeners = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn(status));
}
export const getStatus = () => status;
export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/* ---------- On-device engine (WebLLM in a worker) ---------- */

let webllm = null;
const lib = async () => (webllm ??= await import('./vendor/web-llm.js'));

let f16 = null;
async function supportsF16() {
  if (f16 != null) return f16;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    f16 = !!adapter?.features.has('shader-f16');
  } catch { f16 = false; }
  return f16;
}

async function modelId(key) {
  return `${modelInfo(key).base}-${(await supportsF16()) ? 'q4f16_1' : 'q4f32_1'}-MLC`;
}

function friendly(e) {
  const msg = String(e?.message || e);
  if (/out of memory|OOM|allocation|Device was lost|device lost/i.test(msg)) {
    return 'This device ran out of memory for that brain size. Try the Light brain in Settings.';
  }
  if (/WebGPU|navigator\.gpu|adapter/i.test(msg)) {
    return 'This browser can’t run the on-device brain. Use Safari on iOS 26 or later, or Chrome / Edge on a computer.';
  }
  if (/quota|storage/i.test(msg)) return 'Not enough free storage to download the brain.';
  if (/fetch|network|Failed to fetch/i.test(msg)) return 'Couldn’t download the brain — check your connection and try again.';
  return msg;
}

let engine = null;
let loadedKey = null;
let loading = null;

/** Downloads (first time) and starts the on-device model. */
export function loadLocal(key = settings.localModel) {
  if (engine && loadedKey === key) return Promise.resolve(engine);
  if (loading) return loading;
  if (!webgpuSupported()) return Promise.reject(new AIError(friendly('WebGPU')));

  loading = (async () => {
    const { CreateWebWorkerMLCEngine } = await lib();
    const id = await modelId(key);
    if (engine) { try { await engine.unload(); } catch { /* ignore */ } engine = null; loadedKey = null; }
    navigator.storage?.persist?.().catch(() => {});
    const already = !!settings.downloaded?.[key];
    setStatus({ state: already ? 'starting' : 'downloading', progress: 0, text: already ? 'Waking up…' : 'Starting download…', key });
    const worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    const eng = await CreateWebWorkerMLCEngine(worker, id, {
      initProgressCallback: (p) => setStatus({ progress: p.progress ?? 0, text: p.text || '' }),
    });
    engine = eng;
    loadedKey = key;
    save({ downloaded: { ...(settings.downloaded || {}), [key]: true } }, { fromServer: true });
    setStatus({ state: 'ready', progress: 1, text: 'Ready' });
    return eng;
  })()
    .catch((e) => {
      const err = new AIError(friendly(e));
      setStatus({ state: 'error', text: err.message });
      throw err;
    })
    .finally(() => { loading = null; });
  return loading;
}

/**
 * Checks which brains are really downloaded in this browser (e.g. after signing in
 * on a new device, or if site data was cleared) and corrects the record.
 */
export async function verifyDownloads() {
  if (!webgpuSupported()) return settings.downloaded || {};
  try {
    const { hasModelInCache } = await lib();
    const found = {};
    for (const m of MODELS) if (await hasModelInCache(await modelId(m.key))) found[m.key] = true;
    save({ downloaded: found }, { fromServer: true });
    return found;
  } catch {
    return settings.downloaded || {};
  }
}

/** True when your account uses the on-device brain but this device doesn't have it yet. */
export const needsBrainHere = () =>
  settings.engine === 'local' && webgpuSupported() && !settings.downloaded?.[settings.localModel];

export async function deleteLocal(key) {
  const { deleteModelAllInfoInCache } = await lib();
  if (loadedKey === key && engine) { try { await engine.unload(); } catch { /* ignore */ } engine = null; loadedKey = null; }
  await deleteModelAllInfoInCache(await modelId(key));
  const downloaded = { ...(settings.downloaded || {}) };
  delete downloaded[key];
  save({ downloaded }, { fromServer: true });
  setStatus({ state: 'idle', progress: 0, text: '' });
}

/* ---------- Ollama (optional, on your own computer) ---------- */

async function ollamaChat(messages, { temperature }) {
  const base = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: settings.ollamaModel.trim(), messages, stream: false, options: { temperature } }),
    });
  } catch {
    throw new AIError(`Can’t reach Ollama at ${base}. Is it running, with OLLAMA_ORIGINS set? (See Settings › How it works.)`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(data.error || `Ollama error ${res.status}`);
  return data.message?.content?.trim() || '';
}

export async function testOllama() {
  const base = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/tags`).catch(() => null);
  if (!res?.ok) throw new AIError(`Can’t reach Ollama at ${base}.`);
  const { models = [] } = await res.json();
  return models.map((m) => m.name);
}

/* ---------- Chat (one request at a time) ---------- */

let queue = Promise.resolve();

/**
 * messages: [{ role: 'system'|'user'|'assistant', content }]
 * onToken(textSoFar) streams partial output (on-device only).
 */
export function chat(messages, { onToken, temperature = 0.6, maxTokens = 480 } = {}) {
  const run = async () => {
    if (settings.engine === 'ollama') {
      const out = await ollamaChat(messages, { temperature });
      onToken?.(out);
      return out;
    }
    if (settings.engine !== 'local') throw new AIError('Turn on the AI brain in Settings to use this.');
    const eng = await loadLocal();
    try {
      if (onToken) {
        const stream = await eng.chat.completions.create({ messages, stream: true, temperature, max_tokens: maxTokens });
        let out = '';
        for await (const chunk of stream) {
          out += chunk.choices?.[0]?.delta?.content || '';
          onToken(out);
        }
        return out.trim();
      }
      const reply = await eng.chat.completions.create({ messages, temperature, max_tokens: maxTokens });
      return reply.choices?.[0]?.message?.content?.trim() || '';
    } catch (e) {
      throw new AIError(friendly(e));
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
