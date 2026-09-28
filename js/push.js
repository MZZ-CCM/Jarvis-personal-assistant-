// Background notifications (Web Push).
// Registers this device with your account so reminders arrive even when Jarvis is
// closed. Messages are end-to-end encrypted for this device; Apple / Google /
// Mozilla's push services only relay them.

import { supabase } from './auth.js';
import { SUPABASE_URL } from './config.js';
import { local } from './store.js';
import { isIOS, isStandalone } from './util.js';

const FN = `${SUPABASE_URL}/functions/v1/push-reminders`;

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** True when this device is registered for background notifications. */
export const pushActive = () => !!local.get('pushEndpoint') && typeof Notification !== 'undefined' && Notification.permission === 'granted';

function toBytes(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function serverKey() {
  const res = await fetch(`${FN}/vapid`);
  if (!res.ok) throw new Error('The notification service didn’t respond.');
  return (await res.json()).publicKey;
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${browser}${isStandalone() ? ' (app)' : ''}`;
}

/**
 * Subscribes this device and registers it with the signed-in account.
 * Call after notification permission is granted (from a tap on iPhone).
 */
export async function enablePush() {
  if (!pushSupported()) {
    throw new Error(isIOS() && !isStandalone()
      ? 'On iPhone, add Jarvis to your Home Screen first, then turn on notifications from there.'
      : 'This browser can’t receive background notifications.');
  }
  if (Notification.permission !== 'granted') throw new Error('Allow notifications first.');
  const reg = await navigator.serviceWorker.ready;
  const key = toBytes(await serverKey());
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with a different server key can't be reused.
  if (sub && sub.options?.applicationServerKey) {
    const existing = new Uint8Array(sub.options.applicationServerKey);
    if (existing.length !== key.length || existing.some((b, i) => b !== key[i])) { await sub.unsubscribe(); sub = null; }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  const { error } = await supabase.rpc('register_push', {
    p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_device: deviceName(),
  });
  if (error) throw new Error(`Couldn’t register this device: ${error.message}`);
  local.set('pushEndpoint', json.endpoint);
  return true;
}

/** On sign-in: quietly refresh this device's registration if notifications are allowed. */
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try { return await enablePush(); } catch { return false; }
}

/** Stop background notifications on this device (and remove it from the account). */
export async function disablePush() {
  const endpoint = local.get('pushEndpoint');
  local.remove('pushEndpoint');
  try {
    const sub = await (await navigator.serviceWorker?.ready)?.pushManager.getSubscription();
    if (endpoint) await supabase?.from('push_subscriptions').delete().eq('endpoint', endpoint);
    await sub?.unsubscribe();
  } catch { /* offline — the server drops dead subscriptions automatically */ }
}

/** Your devices that receive notifications. */
export async function listDevices() {
  const { data } = await supabase.from('push_subscriptions').select('id, device, created_at, last_used_at, endpoint').order('created_at');
  return (data || []).map((d) => ({ ...d, thisDevice: d.endpoint === local.get('pushEndpoint') }));
}

export async function removeDevice(id) {
  await supabase.from('push_subscriptions').delete().eq('id', id);
}
