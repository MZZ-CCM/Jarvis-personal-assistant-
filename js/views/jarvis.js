// Chat with Jarvis (text). Shares its history with Jarvis Mode (voice).

import { h, icon, iconButton, mountPage, orb, richText, plainText, toast } from '../ui.js';
import { settings, firstName } from '../store.js';
import { dictationHint } from '../util.js';
import { openDraft } from './draft.js';
import { aiReady } from '../ai.js';
import { getMessages, send, isBusy, clearConversation, subscribe } from '../conversation.js';
import { openJarvisMode, speak } from './voice.js';

const SUGGESTIONS = [
  'What’s on today?',
  'Remind me to call Mom at 6pm',
  'Note: the spare key is under the blue pot',
  'Update: sent the Q3 report',
];

export function renderJarvis() {
  const clearBtn = iconButton('trash', 'Clear conversation', () => {
    if (!getMessages().length || !confirm('Clear this conversation?')) return;
    clearConversation();
  });
  const voiceBtn = h('button', { class: 'voice-pill', type: 'button', onclick: () => openJarvisMode(), 'aria-label': 'Open Jarvis Mode (voice)' },
    orb('xs'), h('span', {}, 'Voice'));
  const content = mountPage({ title: 'Jarvis', large: false, actions: [clearBtn, voiceBtn] });
  content.classList.add('chat-view');

  const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
  content.append(log);

  const textarea = h('textarea', {
    rows: 1, placeholder: 'Ask Jarvis…', 'aria-label': 'Message Jarvis', enterkeyhint: 'send',
    oninput: () => { autosize(); syncSend(); },
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    },
  });
  const autosize = () => { textarea.style.height = 'auto'; textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`; };
  const sendBtn = h('button', { class: 'send-btn', type: 'button', disabled: true, 'aria-label': 'Send', onclick: () => submit() }, icon('up'));
  const syncSend = () => { sendBtn.disabled = !textarea.value.trim() || isBusy(); };
  const micBtn = voiceButton(textarea);

  content.append(h('div', { class: 'composer' }, h('div', { class: 'composer-field' }, textarea, micBtn), sendBtn));

  let typing = null;

  function draw() {
    const messages = getMessages();
    clearBtn.hidden = !messages.length;
    if (!messages.length) {
      log.replaceChildren(h('div', { class: 'chat-empty' },
        h('button', { class: 'orb-button', type: 'button', onclick: () => openJarvisMode(), 'aria-label': 'Talk to Jarvis' }, orb('lg')),
        h('h2', { class: 'display' }, firstName() ? `How can I help, ${firstName()}?` : 'How can I help?'),
        h('p', {}, aiReady()
          ? 'Tell me things to remember, ask about your day, or get help with a reply. Tap the orb to talk.'
          : 'Tell me reminders, notes and updates — I’ll keep track. Turn on the AI brain in Settings for open conversation.'),
        h('div', { class: 'suggestions' }, SUGGESTIONS.map((s, i) =>
          h('button', { class: 'suggestion reveal', style: `--i:${i + 2}`, type: 'button', onclick: () => { textarea.value = s; submit(); } }, s)),
          h('button', { class: 'suggestion reveal accent', style: '--i:6', type: 'button', onclick: () => openDraft() }, icon('mail', { size: 18 }), 'Help me reply to an email'))));
      return;
    }
    log.replaceChildren(...messages.flatMap(bubble));
    if (typing) log.append(typing);
    scrollDown();
  }

  function bubble(m) {
    const out = [h('div', { class: `bubble ${m.role} ${m.error ? 'error' : ''}` }, m.role === 'jarvis' ? richText(m.text) : m.text)];
    if (m.actions?.length) {
      out.push(h('div', { class: 'action-chips' }, m.actions.map((a) => h('span', { class: 'action-chip' }, icon('check'), a))));
    }
    return out;
  }

  const scrollDown = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

  async function submit() {
    const text = textarea.value.trim();
    if (!text || isBusy()) return;
    textarea.value = '';
    autosize();
    const status = h('span', {}, 'Thinking…');
    typing = h('div', { class: 'typing' }, orb('sm', true), status);
    let live = null; // streamed reply bubble (on-device AI)
    const pending = send(text, {
      onStep: (s) => { status.textContent = s; },
      onToken: (t) => {
        if (!live) { live = h('div', { class: 'bubble jarvis' }); typing.before(live); }
        live.replaceChildren(richText(t));
        scrollDown();
      },
    });
    draw(); // user's bubble + typing indicator
    const reply = await pending;
    typing = null;
    if (!log.isConnected) return;
    draw();
    syncSend();
    if (settings.speak && !reply.error) speak(plainText(reply.text));
  }

  // Redraw when Jarvis Mode adds to the shared conversation.
  const unsubscribe = subscribe(() => {
    if (!log.isConnected) { unsubscribe(); return; }
    if (!typing) draw();
  });
  draw();
}

/** Mic button: hands off to the keyboard's own dictation (nothing sent to a speech service). */
function voiceButton(textarea) {
  return iconButton('mic', 'Dictate with your keyboard', () => {
    textarea.focus();
    toast(dictationHint());
  });
}
