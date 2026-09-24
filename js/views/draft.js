// Reply helper: paste an email, pick a tone, Jarvis drafts the reply on-device.
// Then copy it, or open it straight in your Mail app. Nothing is sent by Jarvis.

import { h, icon, sheet, section, chipGroup, toast, setLoading } from '../ui.js';
import { settings, local } from '../store.js';
import * as D from '../data.js';
import { aiReady } from '../ai.js';
import { draftReply, TONES } from '../brain.js';

export function openDraft({ email: initial = '' } = {}) {
  let tone = settings.tone || 'friendly';
  const saved = local.get('draft', {});

  const email = h('textarea', {
    class: 'textarea', rows: 6, 'aria-label': 'The email you received',
    placeholder: 'Paste the email you received…',
    value: initial || saved.email || '',
    oninput: () => { local.set('draft', { ...local.get('draft', {}), email: email.value }); sync(); },
  });
  const pasteBtn = navigator.clipboard?.readText ? h('button', {
    class: 'text-btn small', type: 'button',
    onclick: async () => {
      try { email.value = await navigator.clipboard.readText(); email.dispatchEvent(new Event('input')); } catch { toast('Paste with the keyboard instead.', 'error'); }
    },
  }, 'Paste') : null;
  const instructions = h('textarea', {
    class: 'textarea', rows: 2, 'aria-label': 'What should the reply say?',
    placeholder: 'What should it say? e.g. “Yes to Friday 10am, I’ll bring the mockups”',
  });
  const reply = h('textarea', {
    class: 'textarea draft', rows: 10, 'aria-label': 'Your reply',
    placeholder: aiReady() ? 'Your reply appears here — edit it however you like.' : 'Write your reply…',
    value: saved.reply || '',
    oninput: () => { local.set('draft', { ...local.get('draft', {}), reply: reply.value }); sync(); },
  });

  const writeBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => write() },
    icon('sparkles'), h('span', {}, reply.value ? 'Rewrite with Jarvis' : 'Write with Jarvis'));

  async function write() {
    if (!email.value.trim()) { toast('Paste the email first.', 'error'); email.focus(); return; }
    setLoading(writeBtn, true, 'Writing on-device…');
    reply.value = '';
    try {
      const text = await draftReply({
        email: email.value, tone, instructions: instructions.value.trim(),
        onToken: (t) => { reply.value = t; },
      });
      reply.value = text;
      local.set('draft', { email: email.value, reply: text });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(writeBtn, false, 'Rewrite with Jarvis');
      sync();
    }
  }

  // Recipient + subject, pulled from the pasted email when present
  const recipient = () => email.value.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || '';
  const subject = () => {
    const m = email.value.match(/^\s*subject:\s*(.+)$/im);
    return m ? (/^re:/i.test(m[1]) ? m[1].trim() : `Re: ${m[1].trim()}`) : '';
  };

  const copyBtn = h('button', {
    class: 'btn btn-plain', type: 'button',
    onclick: async () => {
      try { await navigator.clipboard.writeText(reply.value); toast('Copied — paste it into your reply'); } catch { toast('Couldn’t copy', 'error'); }
    },
  }, icon('copy'), 'Copy');
  const mailBtn = h('button', {
    class: 'btn btn-plain', type: 'button',
    onclick: () => {
      const q = new URLSearchParams();
      if (subject()) q.set('subject', subject());
      q.set('body', reply.value);
      location.href = `mailto:${encodeURIComponent(recipient())}?${q.toString().replace(/\+/g, '%20')}`;
    },
  }, icon('mail'), 'Open in Mail');
  const noteBtn = h('button', {
    class: 'btn btn-plain', type: 'button',
    onclick: () => {
      D.add('notes', { title: `Reply draft${subject() ? ` — ${subject().replace(/^re:\s*/i, '')}` : ''}`, body: reply.value.trim(), pinned: false });
      toast('Saved to Notes');
    },
  }, icon('note'), 'Save');

  function sync() {
    const has = !!reply.value.trim();
    [copyBtn, mailBtn, noteBtn].forEach((b) => { b.disabled = !has; });
  }

  sheet({
    title: 'Reply Helper',
    cancelLabel: 'Close',
    body: [
      h('div', { class: 'section' },
        h('div', { class: 'section-caption', style: 'display:flex;justify-content:space-between;align-items:center' }, h('span', {}, 'Email you received'), pasteBtn),
        section(null, h('div', { class: 'field-stack' }, email))),
      aiReady() ? h('div', { class: 'section' },
        h('p', { class: 'section-caption', style: 'padding:0 4px' }, 'Tone'),
        chipGroup(TONES, tone, (t) => { tone = t; }, 'Tone')) : null,
      aiReady() ? section(null, h('div', { class: 'field-stack' }, instructions)) : null,
      aiReady() ? writeBtn : h('div', { class: 'card note' }, icon('chip'),
        h('div', {}, h('div', { class: 'card-title' }, 'Turn on the AI brain to draft replies'),
          h('p', { class: 'card-text' }, 'It runs on your device, free. Settings › AI brain.'))),
      section(null, h('div', { class: 'field-stack' }, reply),
        { footnote: 'Jarvis never sends anything. Copy the reply or open it in your Mail app to send.' }),
      h('div', { class: 'button-row' }, copyBtn, mailBtn, noteBtn),
    ],
  });
  sync();
}
