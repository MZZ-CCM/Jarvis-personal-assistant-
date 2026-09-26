// Reminders — the full list, on its own page.

import { h, icon, iconButton, mountPage, section, empty, segmented, toast, noteCard } from '../ui.js';
import * as D from '../data.js';
import { whenLabel } from '../when.js';
import { fmtTime, ymd, addDays } from '../util.js';
import { openCapture, openReminder } from './capture.js';
import { notificationState, requestNotifications, alertAt, ALERT_OPTIONS } from '../notify.js';
import { settings } from '../store.js';

let tab = 'upcoming';
let query = '';

/** One reminder row — shared by this page and the Today dashboard. */
export function reminderRow(r, i, { overdue = false, hideDay = false } = {}) {
  const now = new Date();
  const due = D.dueAt(r);
  const soon = !r.done && r.time && due - now < 60 * 60000 && due > now;
  const sub = r.done
    ? `Done${r.doneAt ? ` · ${whenLabel(ymd(new Date(r.doneAt)))}` : ''}`
    : overdue ? `Overdue · ${whenLabel(r.date, r.time)}`
      : r.time ? (hideDay ? fmtTime(due) : whenLabel(r.date, r.time).replace(/^Today · /, ''))
        : r.date && !hideDay ? whenLabel(r.date) : '';
  const alerting = !r.done && alertAt(r) && alertAt(r) > now;
  const minutes = r.alert ?? settings.alertMinutes ?? 0;
  const alertText = r.time && minutes > 0 ? ALERT_OPTIONS.find(([m]) => m === minutes)?.[1].replace(' before', '') : '';

  const row = h('div', { class: `row task-row reveal ${soon ? 'soon' : ''} ${r.done ? 'done' : ''}`, style: `--i:${i}` },
    h('button', {
      class: 'check', type: 'button', 'aria-label': r.done ? `Mark ${r.title} as not done` : `Complete ${r.title}`,
      onclick: (e) => {
        e.stopPropagation();
        if (r.done) {
          D.update('reminders', r.id, { done: false, doneAt: null });
          return;
        }
        row.classList.add('done', 'leaving');
        setTimeout(() => {
          D.update('reminders', r.id, { done: true, doneAt: Date.now() });
          toast('Checked off', 'ok', { action: 'Undo', onAction: () => D.update('reminders', r.id, { done: false, doneAt: null }) });
        }, 520);
      },
    }, icon('check')),
    h('button', { class: 'row-main row-open', type: 'button', onclick: () => openReminder(r) },
      h('div', { class: 'row-title' }, h('span', {}, r.title)),
      sub || r.notes ? h('div', { class: `row-sub ${overdue ? 'overdue' : ''}` },
        sub ? h('span', {}, sub) : null,
        r.notes ? h('span', { class: 'row-note' }, `${sub ? ' · ' : ''}${r.notes}`) : null) : null),
    alerting ? h('span', { class: 'alert-mark', title: alertText ? `Alert ${alertText} before` : 'Alert on' }, icon('bell', { size: 15 }), alertText ? h('small', {}, alertText) : null) : null,
    soon ? h('span', { class: 'badge' }, 'Soon') : null);
  return row;
}

export function renderReminders() {
  const addBtn = iconButton('plus', 'New reminder', () => openCapture({ kind: 'reminder' }));
  const content = mountPage({ title: 'Reminders', actions: [addBtn] });

  const search = h('input', {
    id: 'reminders-search', type: 'search', placeholder: 'Search reminders', value: query, autocomplete: 'off', 'aria-label': 'Search reminders',
    oninput: () => { query = search.value; draw(); },
  });
  const seg = segmented([['upcoming', 'Upcoming'], ['completed', 'Completed']], tab, (t) => { tab = t; draw(); }, 'Show');
  const notice = h('div');
  const list = h('div', { class: 'stack', style: 'margin-top:20px' });
  content.append(notice, h('div', { class: 'inbox-tools' }, h('label', { class: 'search' }, icon('search'), search, h('kbd', { class: 'desk' }, '/')), seg), list);

  const match = (r) => !query.trim() || query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => `${r.title} ${r.notes || ''}`.toLowerCase().includes(w));

  function drawNotice() {
    const state = notificationState();
    if (state === 'granted' || state === 'unsupported' || !D.openReminders().some((r) => r.date)) { notice.replaceChildren(); return; }
    notice.replaceChildren(state === 'needs-install'
      ? noteCard('bell', 'Get notified on your iPhone', 'Add Jarvis to your Home Screen (Share › Add to Home Screen), open it from there, then turn on notifications.', [], 'notify-card')
      : state === 'denied'
        ? noteCard('bell', 'Notifications are blocked', 'Allow notifications for this site in your browser settings so Jarvis can alert you.', [], 'notify-card')
        : noteCard('bell', 'Turn on notifications', 'Jarvis will alert you when reminders are due — with Done and Snooze right on the notification.',
            [h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async () => { const r = await requestNotifications(); toast(r === 'granted' ? 'Notifications on' : 'Not allowed', r === 'granted' ? 'ok' : 'error'); drawNotice(); } }, 'Turn On')], 'notify-card'));
  }

  function draw() {
    drawNotice();
    if (tab === 'completed') {
      const done = D.all('reminders').filter((r) => r.done && match(r)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 100);
      list.replaceChildren(done.length
        ? section(null, done.map((r, i) => reminderRow(r, i)), {
            footnote: h('button', {
              class: 'text-btn small', type: 'button', style: 'padding:0',
              onclick: () => {
                if (!confirm(`Delete ${done.length} completed reminder${done.length === 1 ? '' : 's'}?`)) return;
                done.forEach((r) => D.remove('reminders', r.id));
                toast('Completed reminders cleared');
              },
            }, 'Clear completed'),
          })
        : empty('check', query ? 'No matches' : 'Nothing completed yet', query ? '' : 'Checked-off reminders show up here.'));
      return;
    }

    const now = new Date();
    const today = ymd(now);
    const tomorrow = ymd(addDays(now, 1));
    const weekEnd = ymd(addDays(now, 7));
    const open = D.openReminders().filter(match);
    const groups = [
      ['Overdue', open.filter((r) => r.date && (r.date < today || (r.date === today && r.time && D.dueAt(r) < now))), { overdue: true }],
      ['Today', open.filter((r) => r.date === today && !(r.time && D.dueAt(r) < now)), { hideDay: true }],
      ['Tomorrow', open.filter((r) => r.date === tomorrow), { hideDay: true }],
      ['This week', open.filter((r) => r.date > tomorrow && r.date <= weekEnd), {}],
      ['Later', open.filter((r) => r.date > weekEnd), {}],
      ['No date', open.filter((r) => !r.date), {}],
    ].filter(([, items]) => items.length);

    list.replaceChildren(...(groups.length
      ? groups.map(([title, items, opts]) => section(title, items.map((r, i) => reminderRow(r, i, opts)), { aside: `${items.length}` }))
      : [query ? empty('search', 'No matches', `Nothing matched “${query}”.`)
        : h('div', { class: 'empty-hero' },
            icon('bell'),
            h('p', { class: 'display' }, 'All clear.'),
            h('span', {}, 'Say “Remind me to…” to Jarvis, or tap + to add one.'),
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openCapture({ kind: 'reminder' }) }, icon('plus'), 'New reminder'))]));
  }

  draw();
  const unsubscribe = D.subscribe(() => {
    if (!list.isConnected) { unsubscribe(); return; }
    draw();
  });
}
