// J.A.R.V.I.S. — Stark edition. Loaded only by hud.html, on top of the normal app.

import { h, icon } from '../ui.js';
import { settings, save, local } from '../store.js';
import * as D from '../data.js';
import { registerSkill } from '../brain.js';
import { greeting, fmtTime, ymd } from '../util.js';
import { speak } from '../views/voice.js';
import { playChime } from '../notify.js';
import { getUser } from '../app.js';
import './skills.js';
import { hon, onHouseParty } from './skills.js';
import { openHUD, hudOpen, summon, closeHUD } from './hud.js';
import { loadTimers, setTimerVoice } from './timers.js';
import { armClap } from './clap.js';

document.body.classList.add('stark');

// Jarvis calls you "sir" in this edition unless you choose otherwise (in the HUD).
if (!local.get('starkInit')) {
  if (!settings.honorific) save({ honorific: 'sir' }, { fromServer: true });
  local.set('starkInit', true);
}

loadTimers();
setTimerVoice((line) => speak(`${line}${hon() ? ` ${cap(hon())}.` : ''}`));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- "Open the HUD" by voice or text ---------- */
registerSkill((text) => {
  if (/\b(open|show|bring up|display)\b.*\b(hud|heads[\s-]?up|display)\b/i.test(text)) {
    setTimeout(openHUD, 400);
    return { text: `Bringing up the HUD${hon() ? `, ${hon()}` : ''}.` };
  }
  return null;
});

/* ---------- Arc-reactor launcher ---------- */
const fab = h('button', { class: 'stark-fab', type: 'button', 'aria-label': 'Open HUD (H)', title: 'Open HUD (H)', onclick: () => openHUD() },
  h('i', { class: 'fab-ring' }), h('i', { class: 'fab-core' }));
document.body.append(fab);

function addSidebarLink() {
  const nav = document.querySelector('.side-nav');
  if (!nav) return setTimeout(addSidebarLink, 300);
  if (nav.querySelector('.side-hud')) return;
  nav.append(h('button', { class: 'side-link side-hud', type: 'button', onclick: () => openHUD() }, icon('chip'), h('span', {}, 'HUD'), h('kbd', {}, 'H')));
}
addSidebarLink();

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.toLowerCase() === 'h' && getUser() && !document.body.classList.contains('jm-open') && !document.querySelector('.sheet')) {
    e.preventDefault();
    hudOpen() ? closeHUD() : openHUD();
  }
});

/* ---------- Double-clap: re-arm on first interaction if it was on ---------- */
if (local.get('clap')) {
  const rearm = () => { armClap(summon).catch(() => local.set('clap', false)); };
  document.addEventListener('pointerdown', rearm, { once: true });
}

/* ---------- House Party protocol ---------- */
onHouseParty(() => {
  if (!hudOpen()) openHUD();
  document.body.classList.add('party');
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [261.6, 329.6, 392, 523.3, 392, 523.3, 659.3, 784];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.32);
    });
    setTimeout(() => ctx.close(), 3000);
  } catch { /* no audio */ }
  setTimeout(() => document.body.classList.remove('party'), 8000);
});

/* ---------- Boot sequence (once per session) ---------- */
function bootSequence() {
  try {
    if (sessionStorage.getItem('jarvis.starkBooted')) return;
    sessionStorage.setItem('jarvis.starkBooted', '1');
  } catch { return; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lines = [
    'J.A.R.V.I.S. — initialising',
    'Loading personality matrix',
    'Calibrating arc reactor output',
    'Establishing encrypted uplink',
    'Synchronising objectives',
    'All systems online',
  ];
  const log = h('ol', { class: 'boot-log' });
  const hint = h('p', { class: 'boot-hint' }, 'Tap anywhere to engage');
  const el = h('div', { class: 'stark-boot', role: 'presentation' },
    h('div', { class: 'reactor big', 'aria-hidden': 'true' },
      h('i', { class: 'ring r1' }), h('i', { class: 'ring r2' }), h('i', { class: 'ring r3' }), h('i', { class: 'ring r4' }), h('i', { class: 'reactor-glow' })),
    h('div', { class: 'boot-title' }, 'J.A.R.V.I.S.'),
    log, hint);
  document.body.append(el);

  lines.forEach((line, i) => setTimeout(() => {
    log.append(h('li', {}, h('span', {}, line), h('b', {}, i === lines.length - 1 ? 'ONLINE' : 'OK')));
  }, reduced ? 0 : 250 + i * 330));

  let done = false;
  const finish = (engaged) => {
    if (done) return;
    done = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), 700);
    if (engaged) {
      playChime();
      greet();
    }
  };
  el.addEventListener('pointerdown', () => finish(true));
  document.addEventListener('keydown', function k(e) { if (e.key === 'Enter' || e.key === ' ') { finish(true); document.removeEventListener('keydown', k); } });
  setTimeout(() => { hint.classList.add('show'); }, reduced ? 0 : 2400);
  setTimeout(() => finish(false), 9000);
}

/** "Good evening, sir. It's 9:40 PM. You have 2 objectives today…" */
async function greet() {
  const s = hon() ? `, ${hon()}` : '';
  const parts = [`${greeting()}${s}. It’s ${fmtTime(new Date())}.`];
  if (getUser()) {
    const today = ymd(new Date());
    const open = D.openReminders().filter((r) => r.date && r.date <= today);
    const next = open.find((r) => r.time && D.dueAt(r) > new Date());
    parts.push(open.length ? `You have ${open.length} objective${open.length === 1 ? '' : 's'} today${next ? `; next is ${next.title} at ${fmtTime(D.dueAt(next))}` : ''}.` : 'Your schedule is clear today.');
  } else {
    parts.push('Please sign in so I can bring up your day.');
  }
  speak(parts.join(' '));
}

bootSequence();

