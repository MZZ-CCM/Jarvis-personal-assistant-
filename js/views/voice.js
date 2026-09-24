// Jarvis Mode — the full-screen, voice-first experience.
// A living particle orb that breathes when idle, ripples as you speak,
// swirls while thinking and pulses as Jarvis talks back.

import { h, icon, plainText } from '../ui.js';
import { firstName } from '../store.js';
import { send, isBusy } from '../conversation.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Speech out ---------- */

let voiceCache = null;
function pickVoice() {
  if (voiceCache) return voiceCache;
  // On-device voices only (voice.localService) — nothing is streamed to a server.
  const voices = speechSynthesis.getVoices().filter((v) => v.localService);
  voiceCache =
    voices.find((v) => /\b(Daniel|Arthur|Oliver)\b/i.test(v.name) && v.lang.startsWith('en')) ||
    voices.find((v) => v.lang === navigator.language) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    null;
  return voiceCache;
}
if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', () => { voiceCache = null; });

/** Speaks text. Resolves when finished (or immediately if unsupported). */
export function speak(text, { onWord } = {}) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !text) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 900));
    u.voice = pickVoice();
    u.rate = 1.02;
    u.pitch = 0.95;
    u.onboundary = () => onWord?.();
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

/* ---------- The orb (canvas 2D particle sphere) ---------- */

function createOrb(canvas, anchor) {
  const ctx = canvas.getContext('2d');
  const small = Math.min(innerWidth, innerHeight) < 600;
  const N = small ? 280 : 460;
  const pts = Array.from({ length: N }, (_, i) => {
    // Fibonacci sphere for even coverage
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    return { x: Math.cos(phi) * r, y, z: Math.sin(phi) * r, gold: Math.random() < 0.09, seed: Math.random() * 6.28 };
  });

  const state = { mode: 'idle', energy: 0.05, target: 0.05, spin: 0, speed: 0.15, gold: 0.09 };
  const PRESETS = {
    idle: { target: 0.06, speed: 0.14 },
    listening: { target: 0.16, speed: 0.28 },
    thinking: { target: 0.28, speed: 1.1 },
    speaking: { target: 0.2, speed: 0.36 },
  };
  let w = 0, hgt = 0, dpr = 1, raf = 0, t0 = performance.now(), cx = 0, cy = 0, R = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; hgt = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = hgt * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** The orb lives in the free space above the text and glides as that space changes. */
  function place(first) {
    const box = anchor.getBoundingClientRect();
    const top = canvas.getBoundingClientRect().top;
    const tx = w / 2;
    const ty = box.top - top + box.height / 2;
    const tr = Math.max(46, Math.min(box.height * 0.3, w * 0.24, 190));
    const k = first ? 1 : 0.08;
    cx += (tx - cx) * k; cy += (ty - cy) * k; R += (tr - R) * k;
  }

  function frame(now) {
    const t = (now - t0) / 1000;
    place(false);
    const slow = reduceMotion() ? 0.25 : 1;
    const p = PRESETS[state.mode];
    state.target += (p.target - state.target) * 0.05;
    state.energy += (state.target - state.energy) * 0.08;
    state.speed += (p.speed - state.speed) * 0.04;
    state.spin += state.speed * 0.016 * slow;
    const e = state.energy + (state.mode === 'speaking' ? Math.abs(Math.sin(t * 7)) * 0.05 : 0) + Math.sin(t * 1.6) * 0.012;

    ctx.clearRect(0, 0, w, hgt);

    // Core glow
    const glowR = R * (1.7 + e * 1.2);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    g.addColorStop(0, `rgba(190, 255, 250, ${0.42 + e * 0.5})`);
    g.addColorStop(0.28, `rgba(55, 211, 207, ${0.22 + e * 0.3})`);
    g.addColorStop(0.65, 'rgba(18, 90, 110, 0.08)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);

    // Orbit rings
    ctx.save();
    ctx.translate(cx, cy);
    for (let k = 0; k < 2; k++) {
      ctx.save();
      ctx.rotate(state.spin * (k ? -0.6 : 0.4) + k * 1.1);
      ctx.scale(1, 0.28 + k * 0.1);
      ctx.beginPath();
      ctx.arc(0, 0, R * (1.55 + k * 0.28 + e * 0.3), 0, Math.PI * 2);
      ctx.strokeStyle = k ? `rgba(242, 181, 68, ${0.18 + e * 0.4})` : `rgba(110, 231, 226, ${0.16 + e * 0.3})`;
      ctx.lineWidth = 1;
      ctx.setLineDash(k ? [2, 10] : [1, 5]);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // Particles
    ctx.globalCompositeOperation = 'lighter';
    const cosA = Math.cos(state.spin), sinA = Math.sin(state.spin);
    const tilt = 0.35 + Math.sin(t * 0.3) * 0.08;
    const cosB = Math.cos(tilt), sinB = Math.sin(tilt);
    for (const pt of pts) {
      // rotate around Y then X
      let x = pt.x * cosA - pt.z * sinA;
      let z = pt.x * sinA + pt.z * cosA;
      let y = pt.y * cosB - z * sinB;
      z = pt.y * sinB + z * cosB;
      const wobble = 1 + e * 0.55 * Math.sin(pt.seed * 3 + t * (2 + e * 6)) * Math.cos(pt.y * 4 + t * 1.3);
      const persp = 1.9 / (2.6 - z);
      const sx = cx + x * R * wobble * persp;
      const sy = cy + y * R * wobble * persp;
      const depth = (z + 1) / 2; // 0 back, 1 front
      const size = (0.5 + depth * 1.6) * (1 + e * 0.8);
      const alpha = 0.15 + depth * 0.75;
      ctx.fillStyle = pt.gold
        ? `rgba(242, 181, 68, ${alpha * (state.mode === 'thinking' ? 1 : 0.7)})`
        : `rgba(${140 + depth * 90 | 0}, 240, 235, ${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(frame);
  }

  resize();
  place(true);
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);

  return {
    set mode(m) { state.mode = m; },
    get mode() { return state.mode; },
    pulse(amount = 0.12) { state.target = Math.min(0.9, state.target + amount); },
    hit(x, y) { return Math.hypot(x - cx, y - cy) < R * 1.6; },
    destroy() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); },
  };
}

/* ---------- Jarvis Mode overlay ---------- */

let open = false;

export function openJarvisMode({ listen = true } = {}) {
  if (open) return;
  open = true;
  const lastFocus = document.activeElement;

  const canvas = h('canvas', { class: 'jm-canvas', 'aria-hidden': 'true' });
  const stateLabel = h('span', { class: 'jm-state' }, 'Ready');
  const you = h('p', { class: 'jm-you' });
  const reply = h('div', { class: 'jm-reply', 'aria-live': 'polite' });
  const chips = h('div', { class: 'action-chips jm-chips' });
  const input = h('input', {
    class: 'jm-input', placeholder: SR ? 'Or type to Jarvis…' : 'Ask Jarvis anything…', autocomplete: 'off',
    enterkeyhint: 'send', 'aria-label': 'Message Jarvis',
  });
  const micBtn = SR
    ? h('button', { class: 'jm-mic', type: 'button', 'aria-label': 'Talk to Jarvis', onclick: () => toggleListen() }, icon('mic'))
    : null;
  const form = h('form', {
    class: 'jm-form',
    onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ''; input.blur(); ask(v); } },
  }, input, h('button', { class: 'jm-send', type: 'submit', 'aria-label': 'Send' }, icon('up')));

  const closeBtn = h('button', { class: 'jm-close', type: 'button', 'aria-label': 'Close Jarvis Mode', onclick: () => close() }, h('span', {}, 'Close'), h('kbd', {}, 'esc'));

  const stage = h('div', { class: 'jm-stage', 'aria-hidden': 'true' });
  const greetingText = firstName() ? `At your service, ${firstName()}.` : 'At your service.';
  reply.append(words(greetingText));

  const el = h('div', { class: 'jm', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Jarvis Mode' },
    canvas,
    h('header', { class: 'jm-top' }, h('span', { class: 'jm-brand' }, 'JARVIS'), stateLabel, closeBtn),
    stage,
    h('div', { class: 'jm-text' }, you, reply, chips),
    h('div', { class: 'jm-controls' }, micBtn, form,
      h('p', { class: 'jm-hint' }, SR ? h('span', {}, 'Tap the orb', h('span', { class: 'key-hint' }, ' or press ', h('kbd', {}, 'Space')), ' to talk') : 'Voice input isn’t supported in this browser — type instead.')));

  document.body.append(el);
  document.body.classList.add('jm-open');
  const orb = createOrb(canvas, stage);
  requestAnimationFrame(() => el.classList.add('in'));

  /* --- state --- */
  function setMode(mode, label) {
    orb.mode = mode;
    el.dataset.mode = mode;
    stateLabel.textContent = label;
  }
  setMode('idle', 'Ready');

  /* --- listening --- */
  let rec = null;
  let heard = '';
  function toggleListen() {
    if (rec) { rec.stop(); return; }
    if (!SR || isBusy()) return;
    speechSynthesis?.cancel();
    heard = '';
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      heard = [...e.results].map((r) => r[0].transcript).join('');
      you.textContent = heard;
      orb.pulse(0.1);
    };
    rec.onspeechstart = () => orb.pulse(0.15);
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stateLabel.textContent = 'Microphone blocked';
        input.focus();
      }
    };
    rec.onend = () => {
      rec = null;
      micBtn?.classList.remove('live');
      if (heard.trim()) ask(heard.trim());
      else setMode('idle', 'Ready');
    };
    try {
      rec.start();
      micBtn?.classList.add('live');
      you.textContent = '';
      setMode('listening', 'Listening');
    } catch { rec = null; }
  }

  /* --- asking --- */
  async function ask(text) {
    if (isBusy()) return;
    you.textContent = text;
    reply.replaceChildren();
    chips.replaceChildren();
    setMode('thinking', 'Thinking');
    const m = await send(text, {
      onStep: (s) => { stateLabel.textContent = s.replace(/…$/, ''); orb.pulse(0.1); },
      onToken: () => orb.pulse(0.02),
    });
    if (!open) return;
    if (m.actions?.length) {
      chips.append(...m.actions.map((a) => h('span', { class: 'action-chip' }, icon('check'), a)));
    }
    const spoken = plainText(m.text);
    reply.classList.toggle('long', spoken.split(/\s+/).length > 26);
    reply.append(words(spoken));
    setMode('speaking', 'Speaking');
    await speak(spoken, { onWord: () => orb.pulse(0.06) });
    if (open && orb.mode === 'speaking') setMode('idle', 'Ready');
  }

  /* --- input --- */
  canvas.addEventListener('click', (e) => { if (orb.hit(e.offsetX, e.offsetY)) toggleListen(); });
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.code === 'Space' && document.activeElement !== input) { e.preventDefault(); toggleListen(); }
  }
  document.addEventListener('keydown', onKey);

  function close() {
    if (!open) return;
    open = false;
    rec?.abort();
    speechSynthesis?.cancel();
    document.removeEventListener('keydown', onKey);
    el.classList.remove('in');
    el.classList.add('out');
    document.body.classList.remove('jm-open');
    setTimeout(() => { orb.destroy(); el.remove(); lastFocus?.focus?.(); }, 450);
    window.dispatchEvent(new CustomEvent('jarvis:conversation'));
  }

  if (listen && SR) toggleListen();
  else if (!SR) setTimeout(() => input.focus(), 350);
}

/** Wraps each word in a span so the reply can reveal word by word. */
function words(text) {
  const frag = document.createDocumentFragment();
  let i = 0;
  text.split(/(\n+)/).forEach((chunk) => {
    if (/^\n+$/.test(chunk)) { frag.append(h('br')); return; }
    chunk.split(/\s+/).filter(Boolean).forEach((word) => {
      frag.append(h('span', { class: 'w', style: `--i:${Math.min(i++, 80)}` }, `${word} `));
    });
  });
  return frag;
}
