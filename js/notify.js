// Notifications — no servers, no accounts.
//
//  • While Jarvis is open (or running in a background tab / installed app), a
//    reminder clock fires real system notifications at each reminder's alert
//    time, with Done / Snooze buttons where the platform supports them.
//  • Missed alerts (Jarvis was closed) are shown as soon as you open it again.
//  • For alerts when Jarvis is completely closed, "Add to Calendar" hands the
//    reminder to your device's own Calendar app, which rings reliably.

import * as D from './data.js';
import { settings, save, local } from './store.js';
import { h, icon, toast } from './ui.js';
import { fmtTime, isIOS, isStandalone } from './util.js';
import { whenLabel } from './when.js';
import { enablePush, pushActive } from './push.js';

export const ALERT_OPTIONS = [
  [-1, 'No alert'], [0, 'At time of event'], [5, '5 minutes before'], [10, '10 minutes before'],
  [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [1440, '1 day before'],
];

/** When a reminder should alert (null = never). All-day reminders alert at 9:00 that morning. */
export function alertAt(r) {
  if (!r.date || r.done) return null;
  const minutes = r.alert ?? settings.alertMinutes ?? 0;
  if (minutes < 0) return null;
  const [y, m, d] = r.date.split('-').map(Number);
  const base = r.time
    ? D.dueAt(r)
    : new Date(y, m - 1, d, 9, 0);
  return new Date(base.getTime() - (r.time ? minutes : 0) * 60000);
}

/* ---------- Permission ---------- */

export function notificationState() {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window)) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function requestNotifications() {
  if (!('Notification' in window)) return notificationState();
  if (Notification.permission !== 'default') return Notification.permission;
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    save({ notify: true });
    enablePush().catch(() => {}); // background notifications for this device
  }
  return result;
}

/** Gently offers to turn notifications on (after the first timed reminder). */
export function offerNotifications() {
  if (notificationState() !== 'default' || sessionStorage.getItem('jarvis.offeredNotify')) return;
  sessionStorage.setItem('jarvis.offeredNotify', '1');
  setTimeout(() => toast('Want Jarvis to notify you when it’s due?', 'ok', {
    action: 'Turn on',
    onAction: async () => {
      const r = await requestNotifications();
      toast(r === 'granted' ? 'Notifications on' : 'Notifications not allowed', r === 'granted' ? 'ok' : 'error');
    },
  }), 900);
}

/* ---------- Sending ---------- */

let chime = null;
function playChime() {
  try {
    chime ??= new (window.AudioContext || window.webkitAudioContext)();
    const t = chime.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const o = chime.createOscillator();
      const g = chime.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.9);
      o.connect(g).connect(chime.destination);
      o.start(t + i * 0.14);
      o.stop(t + i * 0.14 + 1);
    });
  } catch { /* audio not available */ }
}

async function systemNotify(title, { body, tag, data, actions = [] } = {}) {
  if (notificationState() !== 'granted') return false;
  const options = { body, tag, data, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: true, requireInteraction: !isIOS() };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { ...options, actions });
      return true;
    }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

/** A general-purpose alert (timers etc.): system notification + chime + toast. */
export async function alertNow(title, body, { tag = `jarvis-${Date.now()}` } = {}) {
  await systemNotify(title, { body, tag });
  if (settings.sound !== false) playChime();
  toast(`${title} · ${body}`);
}

export { playChime };

// Focus protocol: hold reminder alerts until a time, then deliver any that came due.
let pausedUntil = 0;
export const pauseAlerts = (untilMs) => { pausedUntil = untilMs; };
export const alertsPausedUntil = () => pausedUntil;

export async function sendTestNotification() {
  const state = notificationState();
  if (state === 'needs-install') throw new Error('On iPhone, add Jarvis to your Home Screen first (Share › Add to Home Screen), then turn on notifications from there.');
  if (state === 'unsupported') throw new Error('This browser doesn’t support notifications.');
  if (state === 'denied') throw new Error('Notifications are blocked. Allow them for this site in your browser settings.');
  if (state === 'default' && (await requestNotifications()) !== 'granted') throw new Error('Notifications weren’t allowed.');
  playChime();
  const ok = await systemNotify('Jarvis', { body: 'Notifications are working. I’ll ping you when reminders are due.', tag: 'jarvis-test' });
  if (!ok) throw new Error('Couldn’t show a notification here.');
}

function fire(r, { missed = false } = {}) {
  const due = r.time ? fmtTime(D.dueAt(r)) : 'Today';
  const body = missed ? `Missed · ${whenLabel(r.date, r.time)}` : r.time ? `${due}${r.notes ? ` · ${r.notes}` : ''}` : r.notes || 'Due today';
  // With background push on, the server sends the system notification — don't double up.
  if (!pushActive() || missed) {
    systemNotify(r.title, {
      body, tag: r.id, data: { id: r.id },
      actions: [{ action: 'done', title: 'Done' }, { action: 'snooze', title: 'Snooze 10 min' }],
    });
  }
  if (settings.sound !== false && document.visibilityState === 'visible') playChime();
  banner(r, missed);
  if (settings.speak && 'speechSynthesis' in window && document.visibilityState === 'visible') {
    speechSynthesis.speak(new SpeechSynthesisUtterance(`Reminder: ${r.title}`));
  }
}

/* ---------- The reminder clock ---------- */

let timer = null;

export function startReminderClock() {
  clearInterval(timer);
  // Missed while closed: catch up once on launch (quietly marks very old ones).
  setTimeout(() => check({ launch: true }), 1500);
  timer = setInterval(check, 15_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'reminder-action') handleAction(e.data.action, e.data.id);
  });
}

// Which alerts this device has already shown: { "<id>@<alertTime>": shownAt }.
// Kept per device (not synced) so each of your devices alerts you once; changing a
// reminder's time produces a new key, so it alerts again at the new time.
function shownAlerts() {
  const map = local.get('notified', {});
  const cutoff = Date.now() - 3 * 864e5;
  for (const [k, t] of Object.entries(map)) if (t < cutoff) delete map[k];
  return map;
}

function check({ launch = false } = {}) {
  if (!settings.notify || Date.now() < pausedUntil) return;
  const now = Date.now();
  const shown = shownAlerts();
  const due = [];
  for (const r of D.openReminders()) {
    const at = alertAt(r)?.getTime();
    if (!at || at > now) continue;
    const key = `${r.id}@${at}`;
    if (shown[key]) continue;
    shown[key] = now;
    if (now - at > 24 * 3600e3) continue; // long past — don't nag
    due.push({ r, missed: launch && now - at > 2 * 60000 });
  }
  local.set('notified', shown);
  due.slice(0, 4).forEach(({ r, missed }, i) => setTimeout(() => fire(r, { missed }), i * 1200));
}

/** Done / Snooze from a notification button or the in-app banner. */
export function handleAction(action, id) {
  const r = D.get('reminders', id);
  if (!r) return;
  if (action === 'done') {
    D.update('reminders', id, { done: true, doneAt: Date.now() });
    toast(`Checked off · ${r.title}`);
  } else if (action === 'snooze') {
    const t = new Date(Date.now() + 10 * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    D.update('reminders', id, { date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`, time: `${pad(t.getHours())}:${pad(t.getMinutes())}`, alert: 0 });
    toast('Snoozed for 10 minutes');
  }
  document.querySelector('.reminder-banner')?.remove();
}

function banner(r, missed) {
  document.querySelector('.reminder-banner')?.remove();
  const el = h('div', { class: 'reminder-banner', role: 'alert' },
    h('div', { class: 'orb sm', 'aria-hidden': 'true' }),
    h('div', { class: 'rb-text' }, h('strong', {}, r.title), h('span', {}, `${missed ? 'Missed' : 'Reminder'} · ${whenLabel(r.date, r.time)}`)),
    h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => handleAction('done', r.id) }, icon('check'), 'Done'),
    h('button', { class: 'btn btn-plain btn-sm', type: 'button', onclick: () => handleAction('snooze', r.id) }, 'Snooze'));
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 700); }, 60_000);
}

/* ---------- .ics export (Apple Calendar, Outlook, any calendar app) ---------- */

const esc = (s = '') => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function reminderICS(r) {
  const minutes = Math.max(0, r.alert ?? settings.alertMinutes ?? 0);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jarvis//Personal Assistant//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${r.id}@jarvis.local`, `DTSTAMP:${stamp(new Date())}`, `SUMMARY:${esc(r.title)}`];
  const ymd = r.date.replace(/-/g, '');
  if (r.time) lines.push(`DTSTART:${ymd}T${r.time.replace(':', '')}00`, 'DURATION:PT15M');
  else lines.push(`DTSTART;VALUE=DATE:${ymd}`, 'DURATION:P1D');
  if (r.notes) lines.push(`DESCRIPTION:${esc(r.notes)}`);
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(r.title)}`, `TRIGGER:${r.time ? `-PT${minutes}M` : 'PT9H'}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/** Opens the reminder in the device's calendar app ("Add to Calendar"). */
export function addToCalendar(r) {
  if (!r.date) { toast('Give it a date first.', 'error'); return; }
  const blob = new Blob([reminderICS(r)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `${r.title.replace(/[^\w\s-]/g, '').trim().slice(0, 40) || 'reminder'}.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast('Opening in your Calendar app…');
}
