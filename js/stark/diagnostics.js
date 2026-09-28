// "Run diagnostics" — a real look at this device and Jarvis's systems.

import * as D from '../data.js';
import { settings } from '../store.js';
import { aiReady, modelInfo, webgpuSupported } from '../ai.js';
import { notificationState } from '../notify.js';

const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(bytes > 10 * 1024 ** 3 ? 0 : 1)} GB`;

/** Returns [{ key, label, value, level (0–1 or null), ok }] */
export async function runDiagnostics() {
  const out = [];

  try {
    const b = await navigator.getBattery?.();
    if (b) out.push({ key: 'power', label: 'Power', value: `${Math.round(b.level * 100)}%${b.charging ? ' · charging' : ''}`, level: b.level, ok: b.level > 0.2 || b.charging });
  } catch { /* not supported */ }

  const c = navigator.connection;
  out.push({
    key: 'network', label: 'Network',
    value: navigator.onLine ? (c?.effectiveType ? `${c.effectiveType.toUpperCase()}${c.downlink ? ` · ${c.downlink} Mb/s` : ''}` : 'Online') : 'Offline',
    level: navigator.onLine ? Math.min(1, (c?.downlink || 10) / 20) : 0,
    ok: navigator.onLine,
  });

  try {
    const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) || {};
    if (quota) out.push({ key: 'storage', label: 'Storage', value: `${gb(usage)} of ${gb(quota)}`, level: usage / quota, ok: usage / quota < 0.9, invert: true });
  } catch { /* not supported */ }

  if (navigator.hardwareConcurrency) {
    out.push({ key: 'cores', label: 'Processor', value: `${navigator.hardwareConcurrency} cores${navigator.deviceMemory ? ` · ${navigator.deviceMemory} GB+ memory` : ''}`, level: Math.min(1, navigator.hardwareConcurrency / 12), ok: true });
  }

  let gpu = 'Not available';
  if (webgpuSupported()) {
    try {
      const a = await navigator.gpu.requestAdapter();
      const info = a?.info || {};
      gpu = [info.vendor, info.architecture].filter(Boolean).join(' · ') || 'WebGPU ready';
    } catch { gpu = 'WebGPU ready'; }
  }
  out.push({ key: 'gpu', label: 'Graphics', value: gpu, level: webgpuSupported() ? 1 : 0, ok: webgpuSupported() });

  const brain = settings.engine === 'off' ? 'Off'
    : settings.engine === 'ollama' ? `Ollama · ${settings.ollamaModel || 'no model set'}`
      : `${modelInfo().name}${aiReady() ? ' · on device' : ' · not downloaded here'}`;
  out.push({ key: 'brain', label: 'AI brain', value: brain, level: aiReady() ? 1 : 0.15, ok: aiReady() });

  const sync = D.syncStatus();
  out.push({ key: 'sync', label: 'Account sync', value: { synced: 'Synced', syncing: 'Syncing', offline: 'Offline', error: 'Retrying' }[sync] || sync, level: sync === 'synced' ? 1 : 0.4, ok: sync === 'synced' || sync === 'syncing' });

  const n = notificationState();
  out.push({ key: 'alerts', label: 'Alerts', value: { granted: 'Enabled', default: 'Not enabled', denied: 'Blocked', 'needs-install': 'Install to enable', unsupported: 'Unsupported' }[n], level: n === 'granted' ? 1 : 0.2, ok: n === 'granted' });

  return out;
}

export function diagnosticsLine(results, hon = '') {
  const s = hon ? `, ${hon}` : '';
  const issues = results.filter((r) => !r.ok);
  if (!issues.length) return `All systems operational${s}.`;
  const list = issues.map((r) => `${r.label.toLowerCase()} (${r.value.toLowerCase()})`);
  return `Diagnostics complete${s}. ${results.length - issues.length} of ${results.length} systems nominal. Attention needed: ${list.join('; ')}.`;
}
