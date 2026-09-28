import { h, icon, iconButton, mountPage, section, empty, orb, richText, plainText, toast } from '../ui.js';
import { settings, local, firstName } from '../store.js';
import * as D from '../data.js';
import { whenLabel } from '../when.js';
import { aiReady, needsBrainHere, modelInfo, loadLocal, onStatus } from '../ai.js';
import { briefing, localBriefing } from '../brain.js';
import { greeting, startOfDay, addDays, fmtTime, ymd, isIOS, isStandalone } from '../util.js';
import { openCapture, openReminder, openNote, openUpdate } from './capture.js';
import { openDraft } from './draft.js';
import { reminderRow } from './reminders.js';
import { speak, openJarvisMode } from './voice.js';

export function renderToday() {
  const now = new Date();
  const name = firstName();
  const addBtn = iconButton('plus', 'New reminder, note or update', () => openCapture());

  // "Good *afternoon*, Carean" — the time of day set in italic serif.
  const [lead, part] = greeting().split(' ');
  const title = h('span', {}, `${lead} `, h('em', {}, part), name ? `, ${name}` : '');
  const content = mountPage({
    title, navTitle: 'Today', display: true,
    eyebrow: now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }),
    subtitle: ' ',
    actions: [addBtn],
  });
  const summary = document.querySelector('.hero .subtitle');

  const slot = (cls) => h('div', { class: `slot ${cls}` });
  const slots = { today: slot('t-today'), upcoming: slot('t-upcoming'), someday: slot('t-someday'), notes: slot('t-notes'), updates: slot('t-updates') };
  const rail = h('div', { class: 'slot t-rail' });

  if (isIOS() && !isStandalone() && !local.get('installHintDismissed')) rail.append(installCard());
  const brief = briefingCard();
  if (needsBrainHere() && !local.get('brainCardDismissed')) rail.append(brainCard());
  rail.append(brief.el, captureBar());

  content.append(h('div', { class: 'today-grid' },
    h('div', { class: 'col col-main' }, slots.today, slots.upcoming, slots.someday),
    h('div', { class: 'col col-side' }, rail, slots.notes, slots.updates)));

  function fill() {
    const out = renderSections();
    for (const k of Object.keys(slots)) slots[k].replaceChildren(...(out[k] ? [out[k]] : []));
    summary.textContent = out.summary;
    brief.refreshLocal();
  }
  fill();

  // Live: anything you add from chat, voice or a sheet shows up immediately.
  const unsubscribe = D.subscribe(() => {
    if (!content.isConnected) { unsubscribe(); return; }
    fill();
  });
}

/* ---------- Sections ---------- */

function renderSections() {
  const now = new Date();
  const today = ymd(now);
  const open = D.openReminders();
  const overdue = open.filter((r) => r.date && (r.date < today || (r.date === today && r.time && D.dueAt(r) < now)));
  const todays = open.filter((r) => r.date === today && !overdue.includes(r));
  const horizon = ymd(addDays(now, 14));
  const later = open.filter((r) => r.date && r.date > today && r.date <= horizon);
  const someday = open.filter((r) => !r.date);
  const doneToday = D.all('reminders').filter((r) => r.done && r.doneAt && r.doneAt >= startOfDay(now).getTime());

  const out = {};
  const todayRows = [...overdue.map((r, i) => reminderRow(r, i, { overdue: true })), ...todays.map((r, i) => reminderRow(r, i + overdue.length))];
  out.today = section('Today', todayRows.length ? todayRows
    : empty('check', doneToday.length ? 'All done for today' : 'Nothing due today', doneToday.length ? `${doneToday.length} checked off. Nice work.` : 'Say “Remind me to…” or tap + to add something.'),
  { aside: h('a', { class: 'see-all', href: '#/reminders' }, 'All reminders', icon('chevron', { size: 14 })) });

  if (later.length) {
    const byDay = new Map();
    for (const r of later) {
      if (!byDay.has(r.date)) byDay.set(r.date, []);
      byDay.get(r.date).push(r);
    }
    out.upcoming = h('section', { class: 'section', style: 'gap:16px' },
      h('h2', { class: 'section-title' }, 'Coming up'),
      [...byDay.entries()].map(([date, list]) => h('div', { class: 'section', style: 'gap:6px' },
        h('p', { class: 'section-caption' }, whenLabel(date)),
        h('div', { class: 'group' }, list.map((r, i) => reminderRow(r, i, { hideDay: true }))))));
  }

  if (someday.length) {
    out.someday = section('Anytime', someday.map((r, i) => reminderRow(r, i)), { aside: `${someday.length}` });
  }

  const pinned = D.all('notes').filter((n) => n.pinned);
  if (pinned.length) {
    out.notes = section('Pinned notes', pinned.slice(0, 4).map((n, i) =>
      h('button', { class: 'row note-row reveal', style: `--i:${i}`, type: 'button', onclick: () => openNote(n) },
        icon('note', { size: 20 }),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, h('span', {}, n.title)),
          D.noteExtra(n) ? h('div', { class: 'row-sub' }, h('span', {}, D.noteExtra(n).replace(/\s+/g, ' ').slice(0, 90))) : null))),
    { aside: h('a', { class: 'see-all', href: '#/notes' }, 'All notes', icon('chevron', { size: 14 })) });
  } else {
    const recent = [...D.all('notes')].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
    out.notes = section('Notes', recent.length
      ? recent.map((n, i) => h('button', { class: 'row note-row reveal', style: `--i:${i}`, type: 'button', onclick: () => openNote(n) },
          icon('note', { size: 20 }), h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, h('span', {}, n.title)))))
      : empty('note', 'No notes yet', 'Say “Note: …” to Jarvis.'),
    { aside: h('a', { class: 'see-all', href: '#/notes' }, 'All notes', icon('chevron', { size: 14 })) });
  }

  const updates = D.all('updates').slice(0, 5);
  out.updates = h('section', { class: 'section' },
    h('h2', { class: 'section-title' }, h('span', {}, 'Latest updates'),
      h('button', { class: 'text-btn small', type: 'button', onclick: () => openCapture({ kind: 'update' }) }, 'Post')),
    updates.length
      ? h('ol', { class: 'timeline' }, updates.map((u, i) =>
          h('li', { class: 'reveal', style: `--i:${i}` },
            h('button', { type: 'button', onclick: () => openUpdate(u) },
              h('time', {}, relTime(u.at)), h('span', {}, u.text)))))
      : empty('pulse', 'No updates yet', 'Log what’s happening — “Update: sent the report”.'));

  // Summary line under the greeting
  const next = [...overdue, ...todays].find((r) => r.time && D.dueAt(r) > now);
  const bits = [];
  if (next) bits.push(`Next: ${next.title} at ${fmtTime(D.dueAt(next))}`);
  if (overdue.length) bits.push(`${overdue.length} overdue`);
  if (todays.length || overdue.length) bits.push(`${todays.length + overdue.length} to do today`);
  else bits.push(doneToday.length ? 'All clear for today' : 'A clear day');
  out.summary = bits.join('  ·  ');
  return out;
}

const relTime = (ts) => {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

/* ---------- Briefing ---------- */

function briefingCard() {
  const theOrb = h('button', { class: 'orb-button', type: 'button', 'aria-label': 'Open Jarvis Mode', onclick: () => openJarvisMode() }, orb('sm'));
  const orbEl = theOrb.firstChild;
  const sub = h('div', { class: 'brief-sub' }, 'Your briefing');
  const text = h('div', { class: 'brief-text' });
  let aiText = null;

  const saved = local.get('briefing');
  if (saved?.day === ymd(new Date())) aiText = saved.text;

  function refreshLocal() {
    if (aiText) return;
    text.replaceChildren(richText(localBriefing()));
  }
  if (aiText) { text.replaceChildren(richText(aiText)); sub.textContent = `Briefed at ${fmtTime(new Date(saved.at))}`; }

  const btn = h('button', { class: 'btn btn-tinted btn-sm', type: 'button' }, icon('sparkles'), h('span', {}, aiText ? 'Refresh' : 'Brief me'));
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    orbEl.classList.add('thinking');
    sub.textContent = 'Thinking on-device…';
    try {
      const out = await briefing({ onToken: (t) => text.replaceChildren(richText(t)) });
      aiText = out;
      local.set('briefing', { day: ymd(new Date()), at: Date.now(), text: out });
      text.replaceChildren(richText(out));
      sub.textContent = `Briefed at ${fmtTime(new Date())}`;
      btn.lastChild.textContent = 'Refresh';
      if (settings.speak) speak(plainText(out));
    } catch (e) {
      toast(e.message, 'error');
      sub.textContent = 'Your briefing';
    } finally {
      btn.disabled = false;
      orbEl.classList.remove('thinking');
    }
  });

  const el = h('section', { class: 'card brief', 'aria-label': 'Jarvis briefing' },
    h('div', { class: 'brief-head' }, theOrb, h('div', {}, h('div', { class: 'brief-name' }, 'Jarvis'), sub)),
    text,
    h('div', { class: 'actions' }, aiReady() ? btn : h('a', { class: 'btn btn-plain btn-sm', href: '#/settings' }, icon('chip'), 'Turn on AI brain')));
  refreshLocal();
  return { el, refreshLocal };
}

function captureBar() {
  const chip = (ico, label, onclick) => h('button', { class: 'quick-chip', type: 'button', onclick }, icon(ico), h('span', {}, label));
  return h('div', { class: 'capture' },
    h('button', { class: 'field-btn', type: 'button', onclick: () => openCapture() },
      icon('sparkles'), h('span', { style: 'flex:1' }, 'Tell Jarvis something to remember…'), h('kbd', { class: 'desk' }, 'N')),
    h('div', { class: 'quick-chips' },
      chip('bell', 'Reminder', () => openCapture({ kind: 'reminder' })),
      chip('note', 'Note', () => openCapture({ kind: 'note' })),
      chip('pulse', 'Update', () => openCapture({ kind: 'update' })),
      chip('mail', 'Reply help', () => openDraft())));
}

/** Your account uses the on-device brain, but it isn't on this device yet. */
function brainCard() {
  const m = modelInfo();
  const bar = h('div', { class: 'progress', hidden: true }, h('i'));
  const text = h('p', { class: 'card-text' }, `Your account uses the ${m.name} brain. Download it once on this device (${m.size}, free, best on Wi-Fi) and Jarvis can chat, brief you and draft replies here too.`);
  const go = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, icon('download'), `Download ${m.size}`);
  const later = h('button', { class: 'btn btn-plain btn-sm', type: 'button', onclick: () => { local.set('brainCardDismissed', true); card.remove(); } }, 'Not now');
  const card = h('div', { class: 'card note brain-card' },
    icon('chip'),
    h('div', { style: 'flex:1;min-width:0' },
      h('div', { class: 'card-title' }, 'Set up your AI brain on this device'),
      text, bar,
      h('div', { class: 'actions' }, go, later)));
  go.addEventListener('click', async () => {
    go.disabled = true; later.hidden = true; bar.hidden = false;
    const off = onStatus((st) => {
      bar.firstChild.style.transform = `scaleX(${Math.max(0.02, st.progress || 0)})`;
      text.textContent = st.state === 'error' ? st.text : `Downloading… ${Math.round((st.progress || 0) * 100)}%`;
    });
    try {
      await loadLocal();
      toast(`${m.name} brain ready on this device`);
      card.remove();
      location.hash === '#/today' && renderToday();
    } catch (e) {
      toast(e.message, 'error');
      go.disabled = false; later.hidden = false;
    } finally {
      off();
    }
  });
  return card;
}

function installCard() {
  const card = h('div', { class: 'card note' },
    icon('share'),
    h('div', { style: 'flex:1;min-width:0' },
      h('div', { class: 'card-title' }, 'Install Jarvis on your iPhone'),
      h('p', { class: 'card-text' }, 'Tap the Share button in Safari, then “Add to Home Screen”. Jarvis opens full-screen like a native app.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-plain btn-sm', type: 'button', onclick: () => { local.set('installHintDismissed', true); card.remove(); } }, 'Got it'))));
  return card;
}
