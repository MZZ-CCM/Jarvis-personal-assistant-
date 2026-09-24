// Notes & Updates — everything you've told Jarvis to remember.

import { h, icon, iconButton, mountPage, section, empty, segmented, toast } from '../ui.js';
import * as D from '../data.js';
import { openCapture, openNote, openUpdate } from './capture.js';

let tab = 'notes';
let query = '';

export function renderNotes() {
  const addBtn = iconButton('plus', tab === 'notes' ? 'New note' : 'Post update', () => openCapture({ kind: tab === 'notes' ? 'note' : 'update' }));
  const content = mountPage({ title: 'Notes', actions: [addBtn] });

  const search = h('input', {
    id: 'notes-search', type: 'search', placeholder: 'Search notes and updates', value: query, autocomplete: 'off', 'aria-label': 'Search',
    oninput: () => { query = search.value; draw(); },
  });
  const seg = segmented([['notes', 'Notes'], ['updates', 'Updates']], tab, (t) => {
    tab = t;
    addBtn.setAttribute('aria-label', t === 'notes' ? 'New note' : 'Post update');
    draw();
  }, 'Show');
  const list = h('div', { class: 'notes-list' });
  content.append(h('div', { class: 'inbox-tools' }, h('label', { class: 'search' }, icon('search'), search, h('kbd', { class: 'desk' }, '/')), seg), list);

  const match = (text) => !query.trim() || query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.toLowerCase().includes(w));

  function draw() {
    if (tab === 'notes') {
      const notes = [...D.all('notes')].filter((n) => match(`${n.title} ${n.body}`))
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
      list.replaceChildren(notes.length
        ? h('div', { class: 'note-grid' }, notes.map((n, i) =>
            h('button', { class: `note-card reveal ${n.pinned ? 'pinned' : ''}`, style: `--i:${i}`, type: 'button', onclick: () => openNote(n) },
              h('div', { class: 'note-card-head' },
                h('h3', { class: 'display' }, n.title || 'Untitled'),
                n.pinned ? h('span', { class: 'pin-dot', 'aria-label': 'Pinned' }) : null),
              D.noteExtra(n) ? h('p', {}, D.noteExtra(n).slice(0, 280)) : null,
              h('time', {}, new Date(n.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })))))
        : query ? empty('search', 'No matching notes', `Nothing matched “${query}”.`)
          : h('div', { class: 'empty-hero' },
              icon('note'),
              h('p', { class: 'display' }, 'Your second memory.'),
              h('span', {}, 'Codes, ideas, lists, anything. Say “Note: …” to Jarvis or tap +.'),
              h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openCapture({ kind: 'note' }) }, icon('plus'), 'New note')));
    } else {
      const composer = h('form', {
        class: 'update-composer',
        onsubmit: (e) => {
          e.preventDefault();
          const v = input.value.trim();
          if (!v) return;
          D.add('updates', { text: v.charAt(0).toUpperCase() + v.slice(1), at: Date.now() });
          input.value = '';
          toast('Update posted');
        },
      });
      const input = h('input', { class: 'input', placeholder: 'What’s new?', 'aria-label': 'New update', autocomplete: 'off', enterkeyhint: 'send' });
      composer.append(icon('pulse'), input, h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Post'));

      const updates = D.all('updates').filter((u) => match(u.text));
      const byDay = new Map();
      for (const u of updates) {
        const key = new Date(u.at).toDateString();
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(u);
      }
      const dayLabel = (key) => {
        const d = new Date(key), t = new Date();
        const diff = Math.round((new Date(t.toDateString()) - d) / 864e5);
        return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      };
      list.replaceChildren(composer, updates.length
        ? h('div', { class: 'stack' }, [...byDay.entries()].map(([key, items]) =>
            h('div', { class: 'section' },
              h('p', { class: 'section-caption' }, dayLabel(key)),
              h('ol', { class: 'timeline' }, items.map((u, i) =>
                h('li', { class: 'reveal', style: `--i:${i}` },
                  h('button', { type: 'button', onclick: () => openUpdate(u) },
                    h('time', {}, new Date(u.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
                    h('span', {}, u.text))))))))
        : query ? empty('search', 'No matching updates', '') : empty('pulse', 'No updates yet', 'A running log of what’s happening. Jarvis uses it to brief you.'));
    }
  }

  draw();
  const unsubscribe = D.subscribe(() => {
    if (!list.isConnected) { unsubscribe(); return; }
    const focused = document.activeElement?.closest?.('.update-composer') ? document.activeElement : null;
    draw();
    if (focused) list.querySelector('.update-composer input')?.focus();
  });
}
