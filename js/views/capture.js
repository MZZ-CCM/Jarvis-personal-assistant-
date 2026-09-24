// Capture + editors for reminders, notes and updates.
// Type naturally — "call mom tomorrow at 6" — and Jarvis reads the date as you go.

import { h, icon, sheet, section, segmented, toggle, toast } from '../ui.js';
import * as D from '../data.js';
import { parseWhen, whenLabel } from '../when.js';
import { addToCalendar, ALERT_OPTIONS, offerNotifications } from '../notify.js';
import { settings } from '../store.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fieldRow = (label, input) => h('div', { class: 'field-row' }, h('label', {}, label), input);
const alertSelect = (value) => h('select', { class: 'select', 'aria-label': 'Alert' },
  ALERT_OPTIONS.map(([m, label]) => h('option', { value: m, selected: m === (value ?? settings.alertMinutes ?? 0) }, label)));

/** Undo-able delete with a toast action. */
export function deleteWithUndo(kind, item, label) {
  D.remove(kind, item.id);
  toast(`${label} deleted`, 'ok', { action: 'Undo', onAction: () => D.restore(kind, item) });
}

/* ---------- New: reminder / note / update ---------- */

export function openCapture({ kind = 'reminder', text = '', onSaved } = {}) {
  let mode = kind;

  // Reminder
  let manual = false; // once the user edits date/time by hand, stop auto-parsing
  const rInput = h('textarea', {
    class: 'textarea capture-input', rows: 2, placeholder: 'e.g. Call Mom tomorrow at 6pm', 'aria-label': 'What should I remind you about?',
    oninput: () => { syncParse(); syncSave(); },
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSave()) s.save(); } },
  });
  const date = h('input', { class: 'input', type: 'date', 'aria-label': 'Date', oninput: () => { manual = true; syncPill(); } });
  const time = h('input', { class: 'input', type: 'time', 'aria-label': 'Time', oninput: () => { manual = true; syncPill(); } });
  const rNotes = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Notes (optional)', 'aria-label': 'Notes' });
  const rAlert = alertSelect();
  const alertRow = fieldRow('Alert', rAlert);
  const pill = h('button', { class: 'when-pill', type: 'button', onclick: () => date.showPicker?.() || date.focus() });
  const clearWhen = h('button', { class: 'text-btn small', type: 'button', onclick: () => { date.value = ''; time.value = ''; manual = true; syncPill(); } }, 'Clear');

  function syncParse() {
    if (manual) return;
    const { date: d, time: t } = parseWhen(rInput.value);
    date.value = d || '';
    time.value = t || '';
    syncPill();
  }
  function syncPill() {
    const has = !!date.value;
    pill.replaceChildren(icon(has ? 'calendar' : 'clock'), h('span', {}, has ? whenLabel(date.value, time.value || null) : 'No date — add one'));
    pill.classList.toggle('set', has);
    clearWhen.hidden = !has;
    alertRow.hidden = !has;
  }

  // Note
  const nTitle = h('input', { class: 'input', placeholder: 'Title', 'aria-label': 'Title', oninput: () => syncSave() });
  const nBody = h('textarea', { class: 'textarea note-body', rows: 8, placeholder: 'Write anything…', 'aria-label': 'Note', oninput: () => syncSave() });

  // Update
  const uText = h('textarea', {
    class: 'textarea capture-input', rows: 3, placeholder: 'What’s new? e.g. Priya moved the review to Friday', 'aria-label': 'Update',
    oninput: () => syncSave(),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSave()) s.save(); } },
  });

  const panes = {
    reminder: h('div', { class: 'form' },
      section(null, h('div', { class: 'field-stack' }, rInput)),
      h('div', { class: 'when-row' }, pill, clearWhen),
      section(null, [fieldRow('Date', date), fieldRow('Time', time), alertRow], { footnote: 'Jarvis reads dates as you type — “tonight”, “Friday 9am”, “in 20 minutes”, “Oct 12”. All-day reminders alert at 9:00 AM.' }),
      section(null, h('div', { class: 'field-stack' }, rNotes))),
    note: h('div', { class: 'form' },
      section(null, [h('div', { class: 'field-row' }, nTitle), h('div', { class: 'field-stack' }, nBody)])),
    update: h('div', { class: 'form' },
      section(null, h('div', { class: 'field-stack' }, uText),
        { footnote: 'Updates are a running log of what’s happening. Jarvis uses them to answer questions and brief you.' })),
  };

  const seg = segmented([['reminder', 'Reminder'], ['note', 'Note'], ['update', 'Update']], mode, (m) => { mode = m; syncMode(); }, 'Type');
  const body = h('div', { class: 'form' }, seg, panes.reminder, panes.note, panes.update);

  const canSave = () => (mode === 'reminder' ? !!rInput.value.trim() : mode === 'note' ? !!(nTitle.value.trim() || nBody.value.trim()) : !!uText.value.trim());
  const syncSave = () => s?.setPrimaryEnabled(canSave());

  function syncMode() {
    for (const [k, el] of Object.entries(panes)) el.hidden = k !== mode;
    s?.setTitle({ reminder: 'New Reminder', note: 'New Note', update: 'Post Update' }[mode]);
    syncSave();
    setTimeout(() => ({ reminder: rInput, note: nBody, update: uText }[mode]).focus(), 60);
  }

  function save() {
    if (!canSave()) return true;
    if (mode === 'reminder') {
      const { rest } = parseWhen(rInput.value);
      const title = cap((manual ? rInput.value.trim() : rest || rInput.value.trim()).replace(/^(?:remind me to|to)\s+/i, ''));
      const r = D.add('reminders', { title, date: date.value || null, time: date.value ? time.value || null : null, notes: rNotes.value.trim(), alert: Number(rAlert.value), done: false });
      toast(r.date ? `Reminder set · ${whenLabel(r.date, r.time)}` : 'Added to your list');
      if (r.date && r.alert >= 0) offerNotifications();
    } else if (mode === 'note') {
      const bodyText = nBody.value.trim();
      const title = nTitle.value.trim() || cap(bodyText.split('\n')[0].slice(0, 60));
      D.add('notes', { title, body: bodyText, pinned: false });
      toast('Note saved');
    } else {
      D.add('updates', { text: cap(uText.value.trim()), at: Date.now() });
      toast('Update posted');
    }
    onSaved?.();
  }

  const s = sheet({ title: 'New Reminder', primary: { label: 'Save', disabled: true, onClick: save }, body });
  s.save = () => s.panel.querySelector('.sheet-head .primary').click();

  if (text) {
    ({ reminder: rInput, note: nBody, update: uText }[mode]).value = text;
    syncParse();
  }
  syncPill();
  syncMode();
}

/* ---------- Edit a reminder ---------- */

export function openReminder(r) {
  const title = h('input', { class: 'input', value: r.title, 'aria-label': 'Title' });
  const date = h('input', { class: 'input', type: 'date', value: r.date || '', 'aria-label': 'Date' });
  const time = h('input', { class: 'input', type: 'time', value: r.time || '', 'aria-label': 'Time' });
  const notes = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Notes', value: r.notes || '', 'aria-label': 'Notes' });
  const alert = alertSelect(r.alert);

  const s = sheet({
    title: 'Reminder',
    primary: {
      label: 'Save',
      onClick: () => {
        if (!title.value.trim()) { toast('Give it a title.', 'error'); return true; }
        const newAlert = Number(alert.value);
        const changedTime = (date.value || null) !== r.date || (time.value || null) !== r.time || newAlert !== (r.alert ?? settings.alertMinutes ?? 0);
        D.update('reminders', r.id, {
          title: title.value.trim(), date: date.value || null, time: date.value ? time.value || null : null,
          notes: notes.value.trim(), alert: newAlert, ...(changedTime ? { notifiedAt: null } : {}),
        });
        if (date.value && newAlert >= 0) offerNotifications();
        toast('Saved');
      },
    },
    body: [
      section(null, [h('div', { class: 'field-row' }, title), h('div', { class: 'field-stack' }, notes)]),
      section(null, [fieldRow('Date', date), fieldRow('Time', time), fieldRow('Alert', alert)]),
      section(null, [
        h('button', {
          class: 'row accent', type: 'button',
          onclick: () => { D.update('reminders', r.id, { done: !r.done, doneAt: r.done ? null : Date.now() }); toast(r.done ? 'Marked as not done' : 'Checked off'); s.close(); },
        }, icon('check', { size: 20 }), h('span', { class: 'row-main' }, r.done ? 'Mark as not done' : 'Mark as done')),
        h('button', {
          class: 'row accent', type: 'button',
          onclick: () => addToCalendar({ ...r, title: title.value.trim() || r.title, date: date.value || null, time: time.value || null, notes: notes.value }),
        }, icon('calendar', { size: 20 }), h('span', { class: 'row-main' }, 'Add to Calendar'), h('span', { class: 'row-value' }, 'for lock-screen alerts')),
      ]),
      section(null, h('button', { class: 'row destructive', type: 'button', onclick: () => { s.close(); deleteWithUndo('reminders', r, 'Reminder'); } }, 'Delete Reminder')),
    ],
  });
}

/* ---------- Edit a note ---------- */

export function openNote(n) {
  const title = h('input', { class: 'input note-title display', value: n.title, placeholder: 'Title', 'aria-label': 'Title' });
  const body = h('textarea', { class: 'textarea note-body', rows: 14, value: n.body, placeholder: 'Write anything…', 'aria-label': 'Note' });
  let pinned = !!n.pinned;

  const commit = () => {
    const t = title.value.trim(), b = body.value.trim();
    if (!t && !b) return;
    if (t !== n.title || b !== n.body || pinned !== !!n.pinned) D.update('notes', n.id, { title: t || cap(b.split('\n')[0].slice(0, 60)), body: b, pinned });
  };

  const s = sheet({
    title: 'Note',
    cancelLabel: 'Close',
    primary: { label: 'Done', onClick: () => { commit(); } },
    onClose: commit,
    body: [
      h('div', { class: 'note-editor' }, title, body),
      section(null, [
        h('div', { class: 'field-row' }, h('span', { style: 'flex:1' }, 'Pin to Today'), toggle(pinned, (on) => { pinned = on; }, 'Pin to Today')),
      ], { footnote: `Edited ${new Date(n.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` }),
      section(null, h('button', { class: 'row destructive', type: 'button', onclick: () => { s.close(); deleteWithUndo('notes', n, 'Note'); } }, 'Delete Note')),
    ],
  });
}

/* ---------- Update actions ---------- */

export function openUpdate(u) {
  const text = h('textarea', { class: 'textarea', rows: 4, value: u.text, 'aria-label': 'Update' });
  const s = sheet({
    title: 'Update',
    primary: { label: 'Save', onClick: () => { if (text.value.trim()) D.update('updates', u.id, { text: text.value.trim() }); } },
    body: [
      h('p', { class: 'footnote', style: 'padding:0' }, new Date(u.at).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })),
      section(null, h('div', { class: 'field-stack' }, text)),
      section(null, h('button', { class: 'row destructive', type: 'button', onclick: () => { s.close(); deleteWithUndo('updates', u, 'Update'); } }, 'Delete Update')),
    ],
  });
}
