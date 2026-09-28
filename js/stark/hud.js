// The HUD — Jarvis's holographic heads-up display.
// Always cinematic dark. Opens with H, the arc-reactor button, or "open HUD".

import { h, icon, toast } from '../ui.js';
import * as D from '../data.js';
import { settings, save, firstName } from '../store.js';
import { whenLabel } from '../when.js';
import { fmtTime, ymd, greeting } from '../util.js';
import { openJarvisMode, speak } from '../views/voice.js';
import { openCapture } from '../views/capture.js';
import { plainText } from '../ui.js';
import { getWeather, setCity } from './weather.js';
import { runDiagnostics, diagnosticsLine } from './diagnostics.js';
import { onTimers, cancelTimer, startTimer, fmtRemaining } from './timers.js';
import { PROTOCOLS, runProtocol, hon } from './skills.js';
import { armClap, disarmClap, clapArmed } from './clap.js';
import { local } from '../store.js';

let open = false;
export const hudOpen = () => open;

const panel = (title, ...kids) => h('section', { class: 'hud-panel' },
  h('i', { class: 'hud-corner tl' }), h('i', { class: 'hud-corner br' }),
  h('h3', { class: 'hud-panel-title' }, title), ...kids);

export function openHUD() {
  if (open) return;
  open = true;
  const cleanups = [];
  const lastFocus = document.activeElement;

  /* ---------- Core ---------- */
  const clock = h('div', { class: 'hud-clock' });
  const dateEl = h('div', { class: 'hud-date' });
  const status = h('div', { class: 'hud-status' }, 'Systems check in progress…');
  const tickClock = () => {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  };
  tickClock();
  const clockTimer = setInterval(tickClock, 1000);
  cleanups.push(() => clearInterval(clockTimer));

  const core = h('div', { class: 'hud-core' },
    h('div', { class: 'reactor', 'aria-hidden': 'true' },
      h('i', { class: 'ring r1' }), h('i', { class: 'ring r2' }), h('i', { class: 'ring r3' }), h('i', { class: 'ring r4' }), h('i', { class: 'reactor-glow' })),
    h('div', { class: 'hud-core-text' }, clock, dateEl),
    status,
    h('div', { class: 'hud-core-actions' },
      h('button', { class: 'hud-btn primary', type: 'button', onclick: () => { close(); openJarvisMode(); } }, icon('mic'), 'Talk to Jarvis'),
      h('button', { class: 'hud-btn', type: 'button', onclick: () => openCapture() }, icon('plus'), 'New')));

  /* ---------- Weather ---------- */
  const wBody = h('div', { class: 'hud-weather' }, h('p', { class: 'hud-muted' }, 'Acquiring atmospheric data…'));
  const drawWeather = async (force = false) => {
    try {
      const w = await getWeather({ force });
      wBody.replaceChildren(
        h('div', { class: 'hud-temp' }, `${w.temp}°`, h('small', {}, w.deg.slice(1))),
        h('div', { class: 'hud-sky' }, w.sky),
        h('div', { class: 'hud-kv' },
          kv('High / Low', `${w.high}° / ${w.low}°`), kv('Feels like', `${w.feels}°`),
          kv('Rain', `${w.rain}%`), kv('Wind', `${w.wind} ${w.windUnit}`)),
        h('div', { class: 'hud-foot' }, h('span', {}, w.place || 'Current location'),
          h('button', { class: 'hud-link', type: 'button', onclick: changeCity }, 'Change')));
    } catch (e) {
      wBody.replaceChildren(h('p', { class: 'hud-muted' }, e.message), h('button', { class: 'hud-link', type: 'button', onclick: changeCity }, 'Choose a city'));
    }
  };
  const changeCity = async () => {
    const name = prompt('City for weather reports?');
    if (!name) return;
    try { await setCity(name.trim()); drawWeather(true); } catch (e) { toast(e.message, 'error'); }
  };

  /* ---------- Objectives (today) ---------- */
  const objectives = h('div', { class: 'hud-list' });
  const drawObjectives = () => {
    const now = new Date();
    const today = ymd(now);
    const list = D.openReminders().filter((r) => r.date && r.date <= today).slice(0, 7);
    objectives.replaceChildren(...(list.length ? list.map((r) => {
      const overdue = r.date < today || (r.time && D.dueAt(r) < now);
      return h('div', { class: `hud-item ${overdue ? 'alert' : ''}` },
        h('button', { class: 'hud-check', type: 'button', 'aria-label': `Complete ${r.title}`, onclick: () => { D.update('reminders', r.id, { done: true, doneAt: Date.now() }); toast(`Objective complete · ${r.title}`); } }),
        h('span', { class: 'hud-item-title' }, r.title),
        h('span', { class: 'hud-item-meta' }, overdue ? 'OVERDUE' : r.time ? fmtTime(D.dueAt(r)) : 'TODAY'));
    }) : [h('p', { class: 'hud-muted' }, `No objectives outstanding${hon() ? `, ${hon()}` : ''}.`)]));
  };

  /* ---------- Intel (updates) ---------- */
  const intel = h('div', { class: 'hud-list' });
  const drawIntel = () => {
    const ups = D.all('updates').slice(0, 4);
    intel.replaceChildren(...(ups.length ? ups.map((u) => h('div', { class: 'hud-intel' },
      h('time', {}, new Date(u.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }).toUpperCase()),
      h('span', {}, u.text))) : [h('p', { class: 'hud-muted' }, 'No intel logged. Say “Update: …”.')]));
  };

  /* ---------- Diagnostics ---------- */
  const diag = h('div', { class: 'hud-gauges' });
  const drawDiag = async () => {
    const results = await runDiagnostics();
    diag.replaceChildren(...results.map((r) => h('div', { class: `gauge ${r.ok ? '' : 'warn'}` },
      h('div', { class: 'gauge-top' }, h('span', {}, r.label.toUpperCase()), h('b', {}, r.value)),
      h('div', { class: 'gauge-bar' }, h('i', { style: `transform:scaleX(${Math.max(0.03, r.invert ? 1 - r.level : r.level ?? 0)})` })))));
    status.textContent = diagnosticsLine(results, hon());
    status.classList.toggle('warn', results.some((r) => !r.ok));
  };
  const diagTimer = setInterval(drawDiag, 30_000);
  cleanups.push(() => clearInterval(diagTimer));

  /* ---------- Radar (next 12 hours on a clock face) ---------- */
  const radar = h('canvas', { class: 'hud-radar', 'aria-label': 'Radar of reminders in the next 12 hours', role: 'img' });
  const radarLegend = h('div', { class: 'hud-radar-legend' });
  let radarRaf = 0;
  const drawRadarLegend = (blips) => {
    radarLegend.replaceChildren(...(blips.length
      ? blips.slice(0, 3).map((b) => h('div', {}, h('i', { class: b.overdue ? 'alert' : '' }), `${b.r.title} · ${b.overdue ? 'overdue' : fmtTime(D.dueAt(b.r))}`))
      : [h('span', { class: 'hud-muted' }, 'No contacts in the next 12 hours.')]));
  };
  const startRadar = () => {
    const ctx = radar.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let blips = [];
    const computeBlips = () => {
      const now = new Date();
      blips = D.openReminders().filter((r) => r.date && r.time).map((r) => {
        const due = D.dueAt(r);
        const hrs = (due - now) / 3600e3;
        if (hrs > 12) return null;
        const overdue = hrs < 0;
        const clockAngle = ((due.getHours() % 12) + due.getMinutes() / 60) / 12 * Math.PI * 2 - Math.PI / 2;
        return { r, overdue, angle: clockAngle, dist: overdue ? 0.08 : 0.15 + (hrs / 12) * 0.8 };
      }).filter(Boolean);
      drawRadarLegend(blips);
    };
    computeBlips();
    const blipTimer = setInterval(computeBlips, 30_000);
    const unsub = D.subscribe(computeBlips);
    cleanups.push(() => { clearInterval(blipTimer); unsub(); });

    const frame = (t) => {
      const w = radar.clientWidth, hgt = radar.clientHeight;
      if (radar.width !== w * dpr) { radar.width = w * dpr; radar.height = hgt * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, hgt);
      const cx = w / 2, cy = hgt / 2, R = Math.min(w, hgt) / 2 - 6;
      ctx.strokeStyle = 'rgba(110,231,226,0.22)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 3, 0, Math.PI * 2); ctx.stroke(); }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
      }
      const sweep = ((t / 4000) % 1) * Math.PI * 2 - Math.PI / 2;
      const grad = ctx.createConicGradient ? ctx.createConicGradient(sweep - Math.PI / 3, cx, cy) : null;
      if (grad) {
        grad.addColorStop(0, 'rgba(55,211,207,0)');
        grad.addColorStop(1 / 6, 'rgba(55,211,207,0.28)');
        grad.addColorStop(1 / 6 + 0.001, 'rgba(55,211,207,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(110,231,226,0.8)';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); ctx.stroke();
      for (const b of blips) {
        const x = cx + Math.cos(b.angle) * R * b.dist, y = cy + Math.sin(b.angle) * R * b.dist;
        let since = (sweep - b.angle) % (Math.PI * 2);
        if (since < 0) since += Math.PI * 2;
        const glow = Math.max(0.35, 1 - since / (Math.PI * 2));
        ctx.fillStyle = b.overdue ? `rgba(255,90,79,${glow})` : `rgba(242,181,68,${glow})`;
        ctx.beginPath(); ctx.arc(x, y, 3.5 + glow * 2, 0, Math.PI * 2); ctx.fill();
      }
      radarRaf = requestAnimationFrame(frame);
    };
    radarRaf = requestAnimationFrame(frame);
    cleanups.push(() => cancelAnimationFrame(radarRaf));
  };

  /* ---------- Timers ---------- */
  const timersEl = h('div', { class: 'hud-list' });
  cleanups.push(onTimers((list) => {
    timersEl.replaceChildren(...(list.length ? list.map((t) => {
      const total = t.endsAt - t.startedAt;
      const left = Math.max(0, t.endsAt - Date.now());
      return h('div', { class: `hud-timer ${t.kind}` },
        h('div', { class: 'hud-timer-top' }, h('span', {}, t.label), h('b', {}, fmtRemaining(left)),
          h('button', { class: 'hud-x', type: 'button', 'aria-label': `Cancel ${t.label}`, onclick: () => cancelTimer(t.id) }, '×')),
        h('div', { class: 'gauge-bar' }, h('i', { style: `transform:scaleX(${Math.max(0.01, left / total)})` })));
    }) : [h('div', { class: 'hud-quick' },
      ...[5, 10, 25].map((m) => h('button', { class: 'hud-chip', type: 'button', onclick: () => startTimer(m * 60_000, `${m} minute timer`) }, `${m} min`)))]));
  }));

  /* ---------- Protocols & preferences ---------- */
  const output = h('div', { class: 'hud-output', 'aria-live': 'polite' });
  const protocolRow = h('div', { class: 'hud-protocols' }, PROTOCOLS.map((p) =>
    h('button', {
      class: `hud-protocol ${p.key}`, type: 'button', title: p.blurb,
      onclick: async () => {
        output.textContent = `Executing ${p.name} protocol…`;
        const res = await runProtocol(p.key);
        if (!res) return;
        output.textContent = plainText(res.text).split('\n').filter(Boolean).join(' ');
        speak(plainText(res.text));
        drawObjectives();
      },
    }, h('b', {}, p.name), h('small', {}, p.blurb))));

  const honorific = h('select', {
    class: 'hud-select', 'aria-label': 'How Jarvis addresses you',
    onchange: (e) => { save({ honorific: e.target.value }); toast('Noted'); },
  }, [['sir', 'Sir'], ['ma’am', 'Ma’am'], ['name', `By name${firstName() ? ` (${firstName()})` : ''}`], ['', 'Nothing']].map(([v, t]) =>
    h('option', { value: v, selected: (settings.honorific || '') === v }, t)));

  const clapToggle = h('button', {
    class: `hud-chip ${clapArmed() ? 'on' : ''}`, type: 'button', 'aria-pressed': String(clapArmed()),
    onclick: async () => {
      if (clapArmed()) {
        disarmClap(); local.set('clap', false);
      } else {
        try { await armClap(summon); local.set('clap', true); toast('Double-clap to summon me — audio stays on this device'); } catch { toast('Microphone permission is needed for clap detection.', 'error'); }
      }
      clapToggle.classList.toggle('on', clapArmed());
      clapToggle.setAttribute('aria-pressed', String(clapArmed()));
    },
  }, icon('mic', { size: 14 }), 'Double-clap to summon');

  /* ---------- Layout ---------- */
  const el = h('div', { class: 'hud', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Jarvis HUD', tabindex: '-1' },
    h('div', { class: 'hud-bg', 'aria-hidden': 'true' }),
    h('header', { class: 'hud-top' },
      h('span', { class: 'hud-brand' }, 'J.A.R.V.I.S.'),
      h('span', { class: 'hud-sub' }, `${greeting().toUpperCase()}${hon() ? `, ${hon().toUpperCase()}` : ''}`),
      h('button', { class: 'hud-close', type: 'button', onclick: () => close(), 'aria-label': 'Close HUD' }, 'Close', h('kbd', {}, 'esc'))),
    h('main', { class: 'hud-main' },
      h('div', { class: 'hud-col left' },
        panel('ATMOSPHERICS', wBody),
        panel('OBJECTIVES · TODAY', objectives),
        panel('INTEL', intel)),
      h('div', { class: 'hud-center' }, core, output, h('div', { class: 'hud-panel-title center' }, 'PROTOCOLS'), protocolRow),
      h('div', { class: 'hud-col right' },
        panel('DIAGNOSTICS', diag),
        panel('RADAR · NEXT 12 HOURS', radar, radarLegend),
        panel('TIMERS', timersEl))),
    h('footer', { class: 'hud-bottom' },
      h('label', { class: 'hud-pref' }, h('span', {}, 'Address me as'), honorific),
      clapToggle));

  document.body.append(el);
  document.body.classList.add('hud-open');
  requestAnimationFrame(() => { el.classList.add('in'); el.focus({ preventScroll: true }); });

  drawWeather();
  drawObjectives();
  drawIntel();
  drawDiag();
  startRadar();
  const unsub = D.subscribe(() => { drawObjectives(); drawIntel(); });
  cleanups.push(unsub);

  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));

  function close() {
    if (!open) return;
    open = false;
    cleanups.forEach((fn) => fn());
    el.classList.remove('in');
    el.classList.add('out');
    document.body.classList.remove('hud-open');
    setTimeout(() => { el.remove(); lastFocus?.focus?.(); }, 450);
  }
  el.closeHUD = close;
}

export function closeHUD() {
  document.querySelector('.hud')?.closeHUD?.();
}

let summonCooldown = 0;
export function summon() {
  if (Date.now() - summonCooldown < 2500 || document.body.classList.contains('jm-open')) return;
  summonCooldown = Date.now();
  closeHUD();
  openJarvisMode({ listen: true });
}

const kv = (k, v) => h('div', {}, h('span', {}, k.toUpperCase()), h('b', {}, v));
