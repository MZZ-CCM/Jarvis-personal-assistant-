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

/* ---------- Errors & limits ---------- */

export class AuthProblem extends Error {
  constructor(message, { code = '', retryAt = 0 } = {}) {
    super(message);
    this.code = code;
    this.retryAt = retryAt; // ms timestamp when trying again makes sense
  }
}

// Cooldowns remembered on this device so people aren't told "try again" into a wall.
const COOLDOWN_KEY = 'jarvis.authCooldown'; // { email: until, request: until }
const readCooldowns = () => { try { return JSON.parse(localStorage.getItem(COOLDOWN_KEY)) || {}; } catch { return {}; } };
function setCooldown(kind, ms) {
  const c = readCooldowns();
  c[kind] = Math.max(c[kind] || 0, Date.now() + ms);
  try { localStorage.setItem(COOLDOWN_KEY, JSON.stringify(c)); } catch { /* ignore */ }
  return c[kind];
}
/** When the next email (confirm / reset) or sign-in request can be sent. */
export const cooldownUntil = (kind) => {
  const until = readCooldowns()[kind] || 0;
  return until > Date.now() ? until : 0;
};

// Wrong-password protection on this device: after 5 misses in 15 minutes, wait 30s, then 1m, 2m… (max 15m).
const FAIL_KEY = 'jarvis.authFails';
function recordFailure() {
  let fails = [];
  try { fails = JSON.parse(localStorage.getItem(FAIL_KEY)) || []; } catch { /* ignore */ }
  fails = [...fails.filter((t) => Date.now() - t < 15 * 60_000), Date.now()];
  try { localStorage.setItem(FAIL_KEY, JSON.stringify(fails)); } catch { /* ignore */ }
  if (fails.length >= 5) setCooldown('signin', Math.min(15 * 60_000, 30_000 * 2 ** (fails.length - 5)));
}
const clearFailures = () => { try { localStorage.removeItem(FAIL_KEY); } catch { /* ignore */ } };

function friendly(error, context = '') {
  const code = error?.code || '';
  const msg = error?.message || String(error);
  if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(msg)) {
    // Supabase's free built-in email sender allows only a few emails per hour for the whole app.
    const until = setCooldown('email', 20 * 60_000);
    return new AuthProblem('Jarvis has sent its hourly allowance of emails, so this one can’t go out right now. Please try again a little later — if you’ve already confirmed your email, you can sign in as normal.', { code: 'email_limit', retryAt: until });
  }
  if (code === 'over_request_rate_limit' || (error?.status === 429)) {
    const until = setCooldown(context === 'signin' ? 'signin' : 'request', 5 * 60_000);
    return new AuthProblem('Too many attempts from this network. Please wait a few minutes, then try again.', { code: 'request_limit', retryAt: until });
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return new AuthProblem('Your email isn’t confirmed yet. Open the link we emailed you — or send a new one below.', { code: 'email_not_confirmed' });
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return new AuthProblem('That email and password don’t match.', { code: 'invalid_credentials' });
  }
  if (code === 'user_already_exists' || /already registered|already been registered|user already exists/i.test(msg)) {
    return new AuthProblem('An account with that email already exists. Try signing in.', { code: 'exists' });
  }
  if (code === 'weak_password' || /password.*(at least|short|weak)/i.test(msg)) {
    return new AuthProblem(`Choose a stronger password (at least ${MIN_PASSWORD} characters, mixing letters and numbers).`, { code: 'weak_password' });
  }
  if (/failed to fetch|network/i.test(msg)) return new AuthProblem('Can’t reach the server — check your connection.', { code: 'network' });
  return new AuthProblem(msg);
}

function check(result, context) {
  if (result.error) throw friendly(result.error, context);
  return result.data;
}

function guard(kind) {
  const until = cooldownUntil(kind);
  if (until) {
    const msg = kind === 'email'
      ? 'Jarvis has sent its hourly allowance of emails. Please try again a little later.'
      : 'Too many attempts. Please wait a moment, then try again.';
    throw new AuthProblem(msg, { code: kind === 'email' ? 'email_limit' : 'request_limit', retryAt: until });
  }
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
  if (problem) throw new AuthProblem(problem);
  guard('email');
  const data = check(await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { name: name.trim().slice(0, 80) }, emailRedirectTo: appUrl() },
  }), 'signup');
  // With email confirmation on, there's no session until the link is clicked.
  return { needsConfirmation: !data.session };
}

export async function signIn({ email, password }) {
  guard('signin');
  const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (result.error) {
    if (result.error.code === 'invalid_credentials' || /invalid login credentials/i.test(result.error.message)) recordFailure();
    throw friendly(result.error, 'signin');
  }
  clearFailures();
  return result.data;
}

export async function sendPasswordReset(email) {
  guard('email');
  check(await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() }), 'email');
  setCooldown('resetSent', 60_000);
}

/** Sends the confirmation email again (for people who never got / lost it). */
export async function resendConfirmation(email) {
  guard('email');
  check(await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: appUrl() } }), 'email');
  setCooldown('resend', 60_000);
}

export async function updatePassword(password) {
  const problem = validatePassword(password);
  if (problem) throw new AuthProblem(problem);
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
