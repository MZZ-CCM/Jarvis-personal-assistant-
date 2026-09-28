import { h, icon, orb, sheet, sheetOpen, toast } from './ui.js';
import { settings, save, setScope, forgetPerson, onProfileChange } from './store.js';
import { configured, getSession, onAuthChange } from './auth.js';
import * as D from './data.js';
import { reloadConversation } from './conversation.js';
import { renderToday } from './views/today.js';
import { renderNotes } from './views/notes.js';
import { renderReminders } from './views/reminders.js';
import { renderJarvis } from './views/jarvis.js';
import { renderSettings } from './views/settings.js';
import { renderAccount, setAccountNotice, openNewPassword } from './views/account.js';
import { openJarvisMode } from './views/voice.js';
import { openCapture } from './views/capture.js';
import { openDraft } from './views/draft.js';
import { startReminderClock, handleAction } from './notify.js';
import { loadLocal, verifyDownloads } from './ai.js';
import { syncPush, disablePush } from './push.js';

const TABS = [
  ['today', 'Today', 'calendar', '1'],
  ['reminders', 'Reminders', 'bell', '2'],
  ['notes', 'Notes', 'note', '3'],
  ['jarvis', 'Jarvis', 'sparkles', '4'],
  ['settings', 'Settings', 'gear', '5'],
];
const isWide = () => window.matchMedia('(min-width: 960px)').matches;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

/* ---------- Chrome: phone tab bar + computer sidebar ---------- */

function buildChrome() {
  document.getElementById('tabbar').replaceChildren(...TABS.map(([id, label, ico]) =>
    h('a', { class: 'tab', href: `#/${id}`, 'data-tab': id }, icon(ico), h('span', {}, label))));

  const side = h('aside', { class: 'sidebar', 'aria-label': 'Main' },
    h('div', { class: 'side-brand' }, orb('sm'), h('span', { class: 'wordmark' }, 'Jarvis')),
    h('nav', { class: 'side-nav' }, TABS.map(([id, label, ico, key]) =>
      h('a', { class: 'side-link', href: `#/${id}`, 'data-tab': id }, icon(ico), h('span', {}, label), h('kbd', {}, key)))),
    h('button', { class: 'side-talk', type: 'button', onclick: () => openJarvisMode() },
      orb('md'),
      h('span', { class: 'side-talk-text' }, h('strong', {}, 'Talk to Jarvis'), h('span', {}, `${MOD} K`))),
    h('button', { class: 'side-help', type: 'button', onclick: openShortcuts }, 'Keyboard shortcuts', h('kbd', {}, '?')));
  document.getElementById('app').prepend(side);
}

/* ---------- Atmosphere: aurora that follows the time of day ---------- */

const PHASES = [
  // [fromHour, aura1, aura2, aura3]
  [0, '#0f3d4a', '#1d2a5e', '#3a2a14'],    // night: deep teal, indigo, ember
  [5, '#f2b544', '#e98a5b', '#37d3cf'],    // dawn: gold, apricot, arc cyan
  [10, '#37d3cf', '#2f8fd0', '#9fe9c9'],   // day: cyan, sky, mint
  [17, '#f08a4b', '#37d3cf', '#6b4fd8'],   // dusk: ember, cyan, violet
  [21, '#14606b', '#2c3c8c', '#f2b544'],   // evening: teal, indigo, gold spark
];

function setAtmosphere() {
  const hr = new Date().getHours();
  const phase = [...PHASES].reverse().find(([from]) => hr >= from);
  const root = document.documentElement.style;
  root.setProperty('--aura-1', phase[1]);
  root.setProperty('--aura-2', phase[2]);
  root.setProperty('--aura-3', phase[3]);
}

function buildAtmosphere() {
  document.body.prepend(h('div', { class: 'atmosphere', 'aria-hidden': 'true' },
    h('i', { class: 'aura a1' }), h('i', { class: 'aura a2' }), h('i', { class: 'aura a3' }), h('i', { class: 'grain' })));
  setAtmosphere();
  setInterval(setAtmosphere, 10 * 60_000);
}

/* ---------- Routing ---------- */

/** Navigate, re-rendering even if we're already on that route. */
export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

let lastSeg = null;
let currentUser = null;
export const getUser = () => currentUser;
const isSetUp = () => !!currentUser;

function route() {
  const [, rawSeg = 'today'] = location.hash.split('/');
  const seg = rawSeg.split('?')[0];
  const render = () => {
    document.body.classList.remove('no-tabs');
    document.body.classList.toggle('chat', seg === 'jarvis');

    if (!currentUser) return renderAccount();

    document.querySelectorAll('.tab, .side-link').forEach((t) => {
      if (t.dataset.tab === seg) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });

    switch (seg) {
      case 'reminders': return renderReminders();
      case 'notes': return renderNotes();
      case 'jarvis': return renderJarvis();
      case 'settings': return renderSettings();
      default: return renderToday();
    }
  };

  // Morph between sections where the browser supports View Transitions.
  const sameSection = seg === lastSeg;
  lastSeg = seg;
  if (document.startViewTransition && !sameSection && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t = document.startViewTransition(render);
    t.ready.catch(() => {}); // aborted when the tab is hidden — the page still renders
    t.finished.catch(() => {});
  } else {
    render();
  }
}

/* ---------- Keyboard (computer) ---------- */

function openShortcuts() {
  const row = (keys, label) => h('div', { class: 'row' }, h('span', { class: 'row-main' }, label), h('span', { class: 'keys' }, keys.map((k) => h('kbd', {}, k))));
  sheet({
    title: 'Keyboard shortcuts',
    cancelLabel: 'Done',
    body: [
      h('div', { class: 'group' },
        row([MOD, 'K'], 'Talk to Jarvis (Jarvis Mode)'),
        row(['N'], 'New reminder'),
        row(['U'], 'Post an update'),
        row(['W'], 'Write a note'),
        row(['R'], 'Reply helper (draft an email reply)'),
        row(['1', '2', '3', '4', '5'], 'Today · Reminders · Notes · Jarvis · Settings'),
        row(['/'], 'Search this page'),
        row(['Esc'], 'Close')),
    ],
  });
}

function onKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (isSetUp() && !document.body.classList.contains('jm-open')) openJarvisMode();
    return;
  }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (typing || e.metaKey || e.ctrlKey || e.altKey || sheetOpen() || document.body.classList.contains('jm-open') || !isSetUp()) return;

  const k = e.key.toLowerCase();
  const tab = TABS.find(([, , , key]) => key === k);
  if (tab) { e.preventDefault(); go(`#/${tab[0]}`); return; }
  const actions = {
    n: () => openCapture({ kind: 'reminder' }),
    u: () => openCapture({ kind: 'update' }),
    w: () => openCapture({ kind: 'note' }),
    r: () => openDraft(),
    '?': () => openShortcuts(),
    '/': () => {
      const onReminders = location.hash.startsWith('#/reminders');
      if (!onReminders && !location.hash.startsWith('#/notes')) go('#/notes');
      setTimeout(() => document.getElementById(onReminders ? 'reminders-search' : 'notes-search')?.focus(), 80);
    },
  };
  if (actions[k]) { e.preventDefault(); actions[k](); }
}

/** Hide the tab bar while the on-screen keyboard is up (iOS keeps fixed bars under it). */
function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => document.body.classList.toggle('kbd-open', !isWide() && window.innerHeight - vv.height > 150);
  vv.addEventListener('resize', update);
}

/* ---------- Boot ---------- */

function ignite() {
  // The orb lights up, then the interface rises in — once per session.
  try {
    if (sessionStorage.getItem('jarvis.ignited')) return;
    sessionStorage.setItem('jarvis.ignited', '1');
  } catch { return; }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const splash = h('div', { class: 'ignition', 'aria-hidden': 'true' }, orb('xl'));
  document.body.append(splash);
  document.body.classList.add('igniting');
  setTimeout(() => splash.classList.add('out'), 700);
  setTimeout(() => { document.body.classList.remove('igniting'); splash.remove(); }, 1400);
}

/* ---------- Accounts ---------- */

async function enter(user) {
  if (currentUser?.id === user.id) return;
  currentUser = user;
  setScope(user.id);
  reloadConversation();
  onProfileChange((patch) => D.saveProfile(patch));
  D.startSync(user).catch(() => {});
  const profile = await D.loadProfile().catch(() => null);
  if (profile) save(profile, { fromServer: true });
  syncPush(); // keep this device registered for background notifications
  // Your brain choice came with your account; check whether this device already has it.
  if (settings.engine === 'local') await verifyDownloads();
  lastSeg = null;
  route();
  if (isWide() && settings.engine === 'local' && settings.downloaded?.[settings.localModel]) {
    setTimeout(() => loadLocal().catch(() => {}), 2500);
  }
}

function leave() {
  if (!currentUser) return;
  disablePush();                    // this device stops receiving the previous person's reminders
  D.stopSync({ wipe: true });        // this person's cached data leaves the device
  forgetPerson();
  setScope(null);
  reloadConversation();
  onProfileChange(null);
  currentUser = null;
  document.querySelector('.reminder-banner')?.remove();
  lastSeg = null;
  route();
}

async function initAccounts() {
  if (!configured()) return;
  // Email links (confirm / password reset) return here with ?code=… — supabase-js
  // exchanges it for a session automatically; then we tidy the address bar.
  const params = new URLSearchParams(location.search);
  const hadCode = params.has('code');
  const linkError = params.get('error_description');
  const session = await getSession().catch(() => null);
  if (location.search) history.replaceState(null, '', `${location.pathname}${location.hash || '#/today'}`);
  if (linkError) setAccountNotice({ kind: 'error', text: linkError.replace(/\+/g, ' ') });
  else if (hadCode && !session) setAccountNotice({ kind: 'ok', text: 'Your email is confirmed. Sign in to continue.' });

  onAuthChange((event, s) => {
    if (event === 'PASSWORD_RECOVERY') { if (s?.user) enter(s.user); setTimeout(openNewPassword, 600); return; }
    if (event === 'SIGNED_OUT') { leave(); return; }
    if (s?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) {
      if (event === 'SIGNED_IN' && !currentUser) setTimeout(() => toast(`Welcome${settings.name ? `, ${settings.name.split(' ')[0]}` : ''}`), 800);
      enter(s.user);
    }
  });
  if (session?.user) await enter(session.user);
}

async function boot() {
  buildAtmosphere();
  buildChrome();
  watchKeyboard();
  ignite();

  // A notification's Done / Snooze tapped while Jarvis was closed arrives as #/reminders?act=…&id=…
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('act') && q.get('id')) {
    setTimeout(() => handleAction(q.get('act'), q.get('id')), 400);
    history.replaceState(null, '', '#/reminders');
  }

  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', onKey);
  if (!location.hash) history.replaceState(null, '', '#/today');
  await initAccounts();
  route();

  // Crossing the phone/computer breakpoint swaps layouts (tab bar ↔ sidebar).
  window.matchMedia('(min-width: 960px)').addEventListener('change', () => {
    if (!sheetOpen()) { lastSeg = null; route(); }
  });

  startReminderClock();


  // The service worker powers offline use and notification buttons (localhost counts as secure).
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
