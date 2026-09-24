import { h, icon, orb } from '../ui.js';
import { save } from '../store.js';
import * as D from '../data.js';
import { go } from '../app.js';

export function renderWelcome() {
  document.body.classList.add('no-tabs');
  const view = document.getElementById('view');
  const feature = (name, title, text) => h('div', { class: 'feature reveal' }, icon(name), h('div', {}, h('strong', {}, title), h('span', {}, text)));

  const nameInput = h('input', {
    class: 'input boxed', placeholder: 'What should I call you?', autocomplete: 'given-name', autocapitalize: 'words',
    'aria-label': 'Your name', enterkeyhint: 'go',
    onkeydown: (e) => { if (e.key === 'Enter') start(false); },
  });

  function start(sample) {
    save({ welcomed: true, name: nameInput.value.trim() });
    if (sample) D.addSample();
    go('#/today');
  }

  view.replaceChildren(h('div', { class: 'welcome' },
    h('div', { class: 'welcome-hero' },
      orb('xl'),
      h('h1', { class: 'display' }, 'Meet ', h('em', {}, 'Jarvis')),
      h('p', {}, 'A private assistant that remembers what matters to you. Free, forever — and it all stays on your device.')),
    h('div', { class: 'features' },
      feature('bell', 'Just say it', '“Remind me to call Mom at 6” — done. Dates are understood as you type.'),
      feature('note', 'Notes & updates', 'Codes, ideas, what’s happening. Ask about any of it later.'),
      feature('mail', 'Reply help', 'Paste an email and Jarvis drafts your reply, on-device.')),
    h('div', { class: 'welcome-actions' },
      nameInput,
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => start(false) }, 'Get Started'),
      h('button', { class: 'btn btn-plain btn-block', type: 'button', onclick: () => start(true) }, 'Start with Sample Data')),
    h('p', { class: 'welcome-foot' }, icon('lock', { size: 14 }), 'No accounts. No servers. No hidden costs.')));
}
