// Accounts (Supabase Auth): email + password with email confirmation,
// password reset and self-service account deletion.

import { createClient } from './vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const configured = () => !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabase = configured()
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        flowType: 'pkce',          // email links return a one-time code, never raw tokens in the URL
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'jarvis.auth',
      },
    })
  : null;

/** Where email links (confirm / reset) should land: this app. */
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');

export const MIN_PASSWORD = 8;

function friendly(error) {
  const msg = error?.message || String(error);
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link.';
  if (/already registered|already been registered|user already exists/i.test(msg)) return 'An account with that email already exists. Try signing in.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/password.*(at least|short|weak)/i.test(msg)) return `Choose a stronger password (at least ${MIN_PASSWORD} characters, mixing letters and numbers).`;
  if (/failed to fetch|network/i.test(msg)) return 'Can’t reach the server — check your connection.';
  return msg;
}

function check(result) {
  if (result.error) throw new Error(friendly(result.error));
  return result.data;
}

export function validatePassword(pw) {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Mix letters and numbers.';
  return null;
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signUp({ email, password, name }) {
  const problem = validatePassword(password);
  if (problem) throw new Error(problem);
  const data = check(await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { name: name.trim().slice(0, 80) }, emailRedirectTo: appUrl() },
  }));
  // With email confirmation on, there's no session until the link is clicked.
  return { needsConfirmation: !data.session };
}

export async function signIn({ email, password }) {
  return check(await supabase.auth.signInWithPassword({ email: email.trim(), password }));
}

export async function sendPasswordReset(email) {
  check(await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() }));
}

export async function updatePassword(password) {
  const problem = validatePassword(password);
  if (problem) throw new Error(problem);
  check(await supabase.auth.updateUser({ password }));
}

export async function signOut() {
  await supabase?.auth.signOut({ scope: 'local' });
}

/** Signs out everywhere (all devices). */
export async function signOutEverywhere() {
  await supabase?.auth.signOut({ scope: 'global' });
}

export async function deleteAccount() {
  check(await supabase.rpc('delete_my_account'));
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

export function onAuthChange(fn) {
  return supabase?.auth.onAuthStateChange((event, session) => fn(event, session));
}
