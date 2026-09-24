// One shared conversation with Jarvis, used by both the chat screen and
// full-screen Jarvis Mode, so they see the same history.

import { local } from './store.js';
import { respond } from './brain.js';

let messages = local.get('chat', []); // [{ role: 'user'|'jarvis', text, actions?, error? }]
let busy = false;
const listeners = new Set();

const persist = () => local.set('chat', messages.slice(-60));
const emit = () => listeners.forEach((fn) => fn(messages));

export const getMessages = () => messages;
export const isBusy = () => busy;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function clearConversation() {
  messages = [];
  persist();
  emit();
}

/**
 * Sends one message. Resolves with the Jarvis message that was appended.
 * onStep: progress label; onToken: streamed partial reply (on-device AI).
 */
export async function send(text, { onStep, onToken } = {}) {
  if (busy) throw new Error('Jarvis is still thinking about the last one.');
  busy = true;
  const history = messages.slice(-8);
  messages.push({ role: 'user', text });
  persist();
  emit();
  let reply;
  try {
    const out = await respond(text, { history, onStep, onToken });
    reply = { role: 'jarvis', text: out.text, actions: out.actions || [], error: !!out.error };
  } catch (e) {
    reply = { role: 'jarvis', text: e.message || 'Something went wrong.', error: true };
  } finally {
    busy = false;
  }
  messages.push(reply);
  persist();
  emit();
  return reply;
}
