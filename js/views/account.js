// Sign in · Create account · Forgot password · Set a new password

import { h, icon, orb, toast, sheet, section } from '../ui.js';
import { configured, signIn, signUp, sendPasswordReset, resendConfirmation, updatePassword, validatePassword, cooldownUntil, MIN_PASSWORD } from '../auth.js';

let mode = 'signin';
let notice = null; // { kind: 'ok'|'error', text }

export function setAccountNotice(n) { notice = n; }

export function renderAccount(nextMode) {
  if (nextMode) mode = nextMode;
  document.body.classList.add('no-tabs');
  const view = document.getElementById('view');

  if (!configured()) {
    view.replaceChildren(shell(
      h('div', { class: 'auth-card' },
        h('h2', { class: 'auth-title' }, 'Almost ready'),
        h('p', { class: 'auth-sub' }, 'Jarvis needs its account server. Add your Supabase project URL and publishable key to js/config.js, then reload.'))));
    return;
  }

  const field = (label, attrs) => {
    const input = h('input', { class: 'auth-input', required: true, ...attrs });
    if (attrs.type !== 'password') return { input, el: h('label', { class: 'auth-field' }, h('span', {}, label), input) };
    const toggle = h('button', {
      class: 'auth-reveal', type: 'button', 'aria-label': 'Show password', 'aria-pressed': 'false',
      onclick: () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Hide' : 'Show';
        toggle.setAttribute('aria-pressed', String(show));
        toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      },
    }, 'Show');
    return { input, el: h('label', { class: 'auth-field' }, h('span', {}, label), h('div', { class: 'auth-pw' }, input, toggle)) };
  };

  const banner = notice ? h('p', { class: `auth-notice ${notice.kind}`, role: notice.kind === 'error' ? 'alert' : 'status' }, notice.text) : null;
  notice = null;
  const error = h('p', { class: 'auth-error', role: 'alert', hidden: true });
  const showError = (msg) => { error.textContent = msg; error.hidden = false; };

  let card;
  if (mode === 'signup') {
    const name = field('Name', { name: 'name', type: 'text', autocomplete: 'name', autocapitalize: 'words', placeholder: 'What should Jarvis call you?', maxlength: 80 });
    const email = field('Email', { name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', placeholder: 'you@example.com' });
    const pw = field('Password', { name: 'new-password', type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, placeholder: `At least ${MIN_PASSWORD} characters` });
    const hint = h('p', { class: 'auth-hint' }, `At least ${MIN_PASSWORD} characters, with letters and numbers.`);
    pw.input.addEventListener('input', () => {
      const problem = pw.input.value ? validatePassword(pw.input.value) : null;
      hint.textContent = problem || 'Strong enough ✓';
      hint.classList.toggle('good', !problem && !!pw.input.value);
    });
    const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Create Account');
    card = form('Create your account', 'Your reminders, notes and updates — private to you, on all your devices.',
      [name.el, email.el, pw.el, hint, error, submit], async () => {
        const res = await signUp({ name: name.input.value, email: email.input.value, password: pw.input.value });
        if (res.needsConfirmation) {
          notice = { kind: 'ok', text: `We sent a confirmation link to ${email.input.value.trim()}. Open it on this device, then sign in.` };
          renderAccount('signin');
        }
      }, submit, showError,
      h('p', { class: 'auth-switch' }, 'Already have an account? ', link('Sign in', 'signin')));
  } else if (mode === 'forgot') {
    const email = field('Email', { name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', placeholder: 'you@example.com' });
    const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Send Reset Link');
    card = form('Reset your password', 'We’ll email you a link to choose a new one.',
      [email.el, error, submit], async () => {
        await sendPasswordReset(email.input.value);
        // Same message whether or not the account exists, so emails can't be probed.
        notice = { kind: 'ok', text: 'If that email has an account, a reset link is on its way. Open it on this device.' };
        renderAccount('signin');
      }, submit, showError,
      h('p', { class: 'auth-switch' }, link('Back to sign in', 'signin')));
  } else {
    const email = field('Email', { name: 'email', type: 'email', autocomplete: 'username', inputmode: 'email', autocapitalize: 'off', placeholder: 'you@example.com' });
    const pw = field('Password', { name: 'password', type: 'password', autocomplete: 'current-password', placeholder: 'Your password' });
    const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Sign In');
    const resend = h('button', { class: 'btn btn-tinted btn-block', type: 'button', hidden: true }, 'Resend confirmation email');
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      try {
        await resendConfirmation(email.input.value);
        showError('');
        error.hidden = true;
        notice = { kind: 'ok', text: `A new confirmation link is on its way to ${email.input.value.trim()}. Open it on this device, then sign in.` };
        renderAccount('signin');
      } catch (err) {
        showError(err.message);
        if (err.retryAt) countdown(resend, err.retryAt, 'Resend confirmation email');
        else resend.disabled = false;
      }
    });
    card = form('Welcome back', 'Sign in to your Jarvis.',
      [email.el, pw.el, error, submit, resend, h('p', { class: 'auth-forgot' }, link('Forgot password?', 'forgot'))], async () => {
        resend.hidden = true;
        try {
          await signIn({ email: email.input.value, password: pw.input.value });
        } catch (err) {
          if (err.code === 'email_not_confirmed') resend.hidden = false;
          throw err;
        }
        // app.js picks up the SIGNED_IN event and opens Today.
      }, submit, showError,
      h('p', { class: 'auth-switch' }, 'New here? ', link('Create an account', 'signup')));
  }

  view.replaceChildren(shell(banner, card));
  const submitBtn = card.querySelector('button[type=submit]');
  const until = mode === 'signin' ? cooldownUntil('signin') : (mode === 'signup' || mode === 'forgot') ? cooldownUntil('email') : 0;
  if (submitBtn && until) countdown(submitBtn, until);
  setTimeout(() => view.querySelector('.auth-input')?.focus({ preventScroll: true }), 350);
}

function shell(...kids) {
  return h('div', { class: 'welcome auth' },
    h('div', { class: 'welcome-hero' },
      orb('xl'),
      h('h1', { class: 'display' }, 'Meet ', h('em', {}, 'Jarvis')),
      h('p', {}, 'A private assistant that remembers what matters to you.')),
    ...kids,
    h('p', { class: 'welcome-foot' }, icon('lock', { size: 14 }), 'Your data is private to your account. Free — no hidden costs.'));
}

function form(title, sub, fields, action, submit, showError, footer) {
  const el = h('form', {
    class: 'auth-card', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      const invalid = [...el.querySelectorAll('input')].find((i) => !i.checkValidity());
      if (invalid) { showError(invalid.type === 'email' ? 'Enter a valid email address.' : `Please fill in ${invalid.closest('label')?.firstChild?.textContent?.toLowerCase() || 'every field'}.`); invalid.focus(); return; }
      submit.disabled = true;
      submit.classList.add('loading');
      let retryAt = 0;
      try { await action(); } catch (err) { showError(err.message); retryAt = err.retryAt || 0; } finally {
        submit.classList.remove('loading');
        if (retryAt) countdown(submit, retryAt); else submit.disabled = false;
      }
    },
  }, h('h2', { class: 'auth-title' }, title), h('p', { class: 'auth-sub' }, sub), ...fields, footer);
  return el;
}

/** Keeps a button disabled with a live "Try again in 4:59" until a limit resets. */
function countdown(btn, until, label = btn.dataset.label || btn.textContent) {
  btn.dataset.label = label;
  btn.disabled = true;
  const tick = () => {
    const left = Math.max(0, until - Date.now());
    if (!left || !btn.isConnected) { btn.disabled = false; btn.textContent = label; return; }
    const s = Math.ceil(left / 1000);
    btn.textContent = `Try again in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    setTimeout(tick, 1000);
  };
  tick();
}

const link = (text, target) => h('button', { class: 'auth-link', type: 'button', onclick: () => renderAccount(target) }, text);

/** Shown after opening a password-reset link. */
export function openNewPassword() {
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: `New password (at least ${MIN_PASSWORD} characters)`, 'aria-label': 'New password' });
  const pw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Repeat new password', 'aria-label': 'Repeat new password' });
  sheet({
    title: 'Choose a New Password',
    primary: {
      label: 'Save',
      onClick: async () => {
        if (pw.value !== pw2.value) { toast('Those passwords don’t match.', 'error'); return true; }
        await updatePassword(pw.value);
        toast('Password updated');
      },
    },
    body: [section(null, [h('div', { class: 'field-row' }, pw), h('div', { class: 'field-row' }, pw2)],
      { footnote: 'Use letters and numbers. You’ll stay signed in on this device.' })],
  });
}

