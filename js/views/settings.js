import { h, icon, mountPage, section, toggle, toast, sheet, setLoading } from '../ui.js';
import { settings, save, local } from '../store.js';
import { signOut, signOutEverywhere, deleteAccount, updatePassword, MIN_PASSWORD } from '../auth.js';
import { getUser } from '../app.js';
import * as D from '../data.js';
import { TONES } from '../brain.js';
import { MODELS, modelInfo, webgpuSupported, loadLocal, deleteLocal, getStatus, onStatus, testOllama, aiReady } from '../ai.js';
import { requestNotifications, notificationState, sendTestNotification, ALERT_OPTIONS } from '../notify.js';
import { pushSupported, pushActive, enablePush, disablePush, listDevices, removeDevice } from '../push.js';
import { debounce } from '../util.js';

const savedToast = debounce(() => toast('Saved'), 900);

function textField(label, key, { placeholder = '', multiline = false, onSaved, ...attrs } = {}) {
  const commit = (value) => {
    if (settings[key] === value) return;
    save({ [key]: value });
    savedToast();
    onSaved?.(value);
  };
  const input = multiline
    ? h('textarea', { class: 'textarea', rows: 3, placeholder, value: settings[key] || '', 'aria-label': label, onchange: (e) => commit(e.target.value) })
    : h('input', { class: 'input', type: 'text', placeholder, value: settings[key] || '', 'aria-label': label, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', onchange: (e) => commit(e.target.value.trim()), ...attrs });
  return h('div', { class: 'field-stack' }, h('label', {}, label), input);
}

function selectRow(label, key, options, { cast = String, onChange } = {}) {
  const select = h('select', {
    class: 'select', 'aria-label': label,
    onchange: (e) => { save({ [key]: cast(e.target.value) }); savedToast(); onChange?.(); },
  }, options.map(([v, t]) => h('option', { value: v, selected: String(settings[key]) === String(v) }, t)));
  return h('div', { class: 'field-row' }, h('label', { style: 'flex:1;width:auto;min-width:0' }, label), select);
}

function switchRow(label, key, onChange) {
  return h('div', { class: 'field-row' },
    h('span', { style: 'flex:1' }, label),
    toggle(!!settings[key], (on) => { save({ [key]: on }); onChange?.(on); }, label));
}

export function renderSettings() {
  const content = mountPage({ title: 'Settings' });
  const user = getUser();

  /* ---------- Account ---------- */
  const syncLabel = h('div', { class: 'row-sub' });
  const offSync = D.onSyncStatus((st) => {
    if (!syncLabel.isConnected && content.isConnected === false) { offSync(); return; }
    syncLabel.textContent = { synced: 'Synced ✓', syncing: 'Syncing…', offline: 'Offline — changes will sync when you’re back online', error: 'Sync problem — retrying' }[st] || '';
  });
  content.append(section('Account', [
    h('div', { class: 'row' }, h('div', { class: 'avatar', 'aria-hidden': 'true' }, (settings.name || user?.email || '?').charAt(0).toUpperCase()),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, h('span', {}, settings.name || 'Your account')),
        h('div', { class: 'row-sub' }, user?.email || ''),
        syncLabel)),
    h('button', { class: 'row accent', type: 'button', onclick: openChangePassword }, icon('lock', { size: 20 }), h('span', { class: 'row-main' }, 'Change password')),
    h('button', { class: 'row accent', type: 'button', onclick: async () => { if (confirm('Sign out of Jarvis on this device?')) await signOut(); } }, icon('external', { size: 20 }), h('span', { class: 'row-main' }, 'Sign out')),
    h('button', { class: 'row accent', type: 'button', onclick: async () => { if (confirm('Sign out on every device where you use Jarvis?')) await signOutEverywhere(); } }, icon('refresh', { size: 20 }), h('span', { class: 'row-main' }, 'Sign out of all devices')),
  ], { footnote: 'Your reminders, notes and updates are private to your account and sync across your devices. Signing out removes them from this device (they stay safe in your account).' }));

  /* ---------- You ---------- */
  content.append(section('You', [
    textField('Your name', 'name', { placeholder: 'e.g. Carean Moyo', autocapitalize: 'words' }),
    textField('Email sign-off', 'signature', { placeholder: 'e.g. Best,\nCarean', multiline: true }),
    selectRow('Default reply tone', 'tone', TONES),
  ], { footnote: 'Jarvis greets you by name and signs drafted replies with this.' }));

  /* ---------- AI brain ---------- */
  content.append(brainSection());

  /* ---------- Notifications ---------- */
  const perm = notificationState();
  const permText = {
    granted: 'On — Jarvis can notify you',
    default: 'Off — tap Turn On',
    denied: 'Blocked in your browser settings',
    'needs-install': 'Add Jarvis to your Home Screen first',
    unsupported: 'Not supported in this browser',
  }[perm];
  const testBtn = h('button', {
    class: 'row accent', type: 'button',
    onclick: async () => {
      setLoading(testBtn, true);
      try { await sendTestNotification(); toast('Test sent'); } catch (e) { toast(e.message, 'error'); }
      finally { setLoading(testBtn, false); if (notificationState() !== perm) renderSettings(); }
    },
  }, icon('bell', { size: 20 }), h('span', { class: 'row-main' }, 'Send a test notification'));
  content.append(section('Notifications', [
    h('div', { class: 'row' },
      icon('bell', { size: 20 }),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, h('span', {}, 'Notifications')),
        h('div', { class: 'row-sub' }, permText)),
      perm === 'default' ? h('button', {
        class: 'btn btn-primary btn-sm', type: 'button',
        onclick: async () => { const r = await requestNotifications(); toast(r === 'granted' ? 'Notifications on' : 'Notifications not allowed', r === 'granted' ? 'ok' : 'error'); renderSettings(); },
      }, 'Turn On') : null),
    backgroundRow(perm),
    testBtn,
    selectRow('Default alert', 'alertMinutes', ALERT_OPTIONS, { cast: Number }),
    switchRow('Remind me while Jarvis is open', 'notify'),
    switchRow('Chime', 'sound'),
  ], {
    footnote: perm === 'needs-install'
      ? 'iPhone only allows notifications from Home Screen apps: tap Share › Add to Home Screen in Safari, open Jarvis from there, then turn notifications on.'
      : 'Jarvis notifies you while it’s open or running in the background — keep a tab open, or install it as an app. For alerts when it’s fully closed, open a reminder › Add to Calendar and your device’s Calendar will ring. No servers or accounts involved.',
  }));

  /* ---------- Jarvis ---------- */
  content.append(section('Voice', [switchRow('Speak replies aloud', 'speak')]));

  /* ---------- Your data ---------- */
  const counts = `${D.all('reminders').filter((r) => !r.done).length} reminders · ${D.all('notes').length} notes · ${D.all('updates').length} updates`;
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const c = D.importData(await file.text());
        toast(`Imported ${c.reminders} reminders, ${c.notes} notes, ${c.updates} updates`);
        renderSettings();
      } catch (err) { toast(err.message || 'Couldn’t read that file.', 'error'); }
    },
  });
  content.append(section('Your data', [
    h('div', { class: 'row' }, icon('lock', { size: 20 }), h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('span', {}, 'Private to your account')), h('div', { class: 'row-sub' }, counts))),
    h('button', { class: 'row accent', type: 'button', onclick: exportBackup }, icon('download', { size: 20 }), h('span', { class: 'row-main' }, 'Export backup')),
    h('button', { class: 'row accent', type: 'button', onclick: () => fileInput.click() }, icon('upload', { size: 20 }), h('span', { class: 'row-main' }, 'Import backup'), fileInput),
    D.hasSample()
      ? h('button', { class: 'row accent', type: 'button', onclick: () => { D.removeSample(); toast('Sample data removed'); renderSettings(); } }, icon('trash', { size: 20 }), h('span', { class: 'row-main' }, 'Remove sample data'))
      : h('button', { class: 'row accent', type: 'button', onclick: () => { D.addSample(); toast('Sample data added'); renderSettings(); } }, icon('sparkles', { size: 20 }), h('span', { class: 'row-main' }, 'Add sample data')),
  ], { footnote: 'Your data syncs to every device you sign in on. Export a backup any time to keep your own copy.' }));

  /* ---------- Help ---------- */
  content.append(section(null, [
    h('button', { class: 'row', type: 'button', onclick: openHowItWorks }, icon('book', { size: 22 }), h('span', { class: 'row-main' }, 'How Jarvis works'), icon('chevron')),
  ]));

  content.append(section(null, [
    h('button', { class: 'row accent', type: 'button', style: 'justify-content:center', onclick: () => { if (confirm('Clear your chat history with Jarvis?')) { local.remove('chat'); toast('Chat cleared'); } } }, 'Clear Chat History'),
    h('button', { class: 'row destructive', type: 'button', onclick: openDeleteAccount }, 'Delete Account'),
  ], { footnote: 'Deleting your account permanently erases it and everything in it. Downloaded AI brains stay on this device until you remove them above.' }));

  content.querySelectorAll('.row > .icon:last-child').forEach((n) => n.classList.add('chev'));
}

function exportBackup() {
  const blob = new Blob([D.exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `jarvis-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast('Backup saved');
}

/* ---------- AI brain section ---------- */

function brainSection() {
  const wrap = h('div', { class: 'section brain-section' });

  function draw() {
    const rows = [];
    rows.push(selectRow('Engine', 'engine', [
      ['local', 'On this device'],
      ['ollama', 'Ollama'],
      ['off', 'Off'],
    ], { onChange: draw }));

    let footnote = '';
    if (settings.engine === 'local') {
      if (!webgpuSupported()) {
        rows.push(h('div', { class: 'row' }, icon('alert', { size: 20 }), h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, h('span', {}, 'This browser can’t run on-device AI')),
          h('div', { class: 'row-sub', style: 'white-space:normal' }, 'Use Safari on iOS 26 or later, or Chrome / Edge on a computer. Reminders, notes and updates still work.'))));
      }
      for (const m of MODELS) {
        const on = settings.localModel === m.key;
        const downloaded = !!settings.downloaded?.[m.key];
        rows.push(h('button', {
          class: `row model-row ${on ? 'selected' : ''}`, type: 'button', 'aria-pressed': String(on),
          onclick: () => { save({ localModel: m.key }); draw(); },
        },
        h('span', { class: 'radio', 'aria-hidden': 'true' }),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, h('span', {}, `${m.name}`), h('span', { class: 'size' }, m.size)),
          h('div', { class: 'row-sub', style: 'white-space:normal' }, m.blurb)),
        downloaded ? h('span', { class: 'badge' }, 'On device') : null));
      }
      rows.push(downloadRow());
      footnote = 'Your choice follows your account (separately for phones and computers). The brain itself downloads once per device — free, best on Wi-Fi — then runs entirely on that device and works offline. Nothing you type is sent anywhere.';
    } else if (settings.engine === 'ollama') {
      const result = h('div', { class: 'row-sub', style: 'white-space:normal' });
      rows.push(textField('Ollama address', 'ollamaUrl', { placeholder: 'http://localhost:11434' }));
      rows.push(textField('Model', 'ollamaModel', { placeholder: 'e.g. llama3.2 or qwen2.5:7b' }));
      const testBtn = h('button', {
        class: 'row accent', type: 'button',
        onclick: async () => {
          setLoading(testBtn, true);
          try {
            const models = await testOllama();
            result.textContent = models.length ? `Connected. Installed: ${models.join(', ')}` : 'Connected, but no models installed yet (run: ollama pull llama3.2).';
          } catch (e) { result.textContent = e.message; }
          finally { setLoading(testBtn, false); }
        },
      }, icon('sparkles', { size: 20 }), h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, h('span', {}, 'Test connection')), result));
      rows.push(testBtn);
      footnote = 'Ollama is free and runs bigger models on your own computer. Start it with OLLAMA_ORIGINS set to this page’s address (see How Jarvis works).';
    } else {
      footnote = 'Jarvis still understands “Remind me…”, “Note: …”, “Update: …” and answers questions about your day from your own data.';
    }

    wrap.replaceChildren(
      h('h2', { class: 'section-title' }, h('span', {}, 'AI brain'), h('small', {}, aiReady() ? 'Ready' : settings.engine === 'off' ? 'Off' : 'Not set up')),
      h('div', { class: 'group' }, rows),
      h('p', { class: 'footnote' }, footnote));
  }

  function downloadRow() {
    const m = modelInfo();
    const downloaded = !!settings.downloaded?.[m.key];
    const bar = h('div', { class: 'progress', hidden: true }, h('i'));
    const label = h('div', { class: 'row-sub', style: 'white-space:normal' });
    const btn = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, downloaded ? 'Start' : `Download ${m.size}`);
    const removeBtn = downloaded ? h('button', {
      class: 'btn btn-plain btn-sm', type: 'button',
      onclick: async () => {
        if (!confirm(`Remove the ${m.name} brain from this device? You can download it again any time.`)) return;
        try { await deleteLocal(m.key); toast('Removed'); } catch (e) { toast(e.message, 'error'); }
        draw();
      },
    }, 'Remove') : null;

    const show = (s) => {
      if (s.key && s.key !== m.key) return;
      if (s.state === 'downloading' || s.state === 'starting') {
        bar.hidden = false;
        bar.firstChild.style.transform = `scaleX(${Math.max(0.02, s.progress || 0)})`;
        label.textContent = `${Math.round((s.progress || 0) * 100)}% · ${s.text.replace(/\[.*?\]\s*/g, '').slice(0, 90)}`;
        btn.disabled = true;
      } else if (s.state === 'ready') {
        bar.hidden = true;
        label.textContent = `${m.name} is awake and ready.`;
        btn.hidden = true;
      } else if (s.state === 'error') {
        bar.hidden = true;
        label.textContent = s.text;
        btn.disabled = false;
      }
    };

    btn.addEventListener('click', async () => {
      if (!downloaded && !confirm(`Download the ${m.name} brain (${m.size})? It’s free and happens once — best on Wi-Fi.`)) return;
      try {
        await loadLocal(m.key);
        toast(`${m.name} brain ready`);
        draw();
      } catch (e) { toast(e.message, 'error'); }
    });

    label.textContent = downloaded ? 'Downloaded. Starts automatically when you ask something.' : 'Not downloaded yet.';
    const st = getStatus();
    if (st.key === m.key && st.state !== 'idle') show(st);
    const off = onStatus((s) => { if (!btn.isConnected) { off(); return; } show(s); });

    return h('div', { class: 'row download-row' },
      icon('chip', { size: 22 }),
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, h('span', {}, `${m.name} brain`)), label, bar),
      h('div', { class: 'btn-pair' }, removeBtn, webgpuSupported() ? btn : null));
  }

  draw();
  return wrap;
}

/* ---------- How it works ---------- */

export function openHowItWorks() {
  const code = (t) => h('code', {}, t);
  sheet({
    title: 'How Jarvis works',
    cancelLabel: 'Done',
    body: [
      h('p', { class: 'card-text', style: 'margin:0' }, 'Jarvis is completely free: no accounts, no subscriptions, no servers, no hidden costs. Everything lives on your device.'),
      h('div', { class: 'section' },
        h('p', { class: 'section-caption' }, 'Talking to Jarvis'),
        h('ol', { class: 'steps' },
          h('li', {}, h('span', {}, h('b', {}, '“Remind me to call Mom tomorrow at 6”'), ' — sets a reminder. Also: ', code('todo: buy milk'), ', “in 20 minutes”, “Friday 9am”, “Oct 12”.')),
          h('li', {}, h('span', {}, h('b', {}, '“Note: gate code is 4821”'), ' — saves a note you can ask about later.')),
          h('li', {}, h('span', {}, h('b', {}, '“Update: sent the Q3 report”'), ' — logs what’s happening. Jarvis uses it in your briefing.')),
          h('li', {}, h('span', {}, h('b', {}, '“Done with the invoice”'), ' checks something off. ', h('b', {}, '“What’s on today?”'), ' — ask anything about your stuff.')))),
      h('div', { class: 'section' },
        h('p', { class: 'section-caption' }, 'The AI brain'),
        h('ol', { class: 'steps' },
          h('li', {}, h('span', {}, 'Runs an open model ', h('b', {}, 'on your device'), ' (WebLLM + WebGPU). Pick Light for iPhone, Smart for a computer. It downloads once from a free public mirror and is cached.')),
          h('li', {}, h('span', {}, 'Needs Safari on iOS 26+ or Chrome / Edge on a computer. Without it, commands and answers from your data still work.')),
          h('li', {}, h('span', {}, 'Have ', h('b', {}, 'Ollama'), ' on your computer? Choose it as the engine and start Ollama with ', code(`OLLAMA_ORIGINS=${location.origin} ollama serve`), '.')))),
      h('div', { class: 'section' },
        h('p', { class: 'section-caption' }, 'Reminders & your data'),
        h('ol', { class: 'steps' },
          h('li', {}, h('span', {}, 'Jarvis alerts you while it’s open. For lock-screen alerts, open a reminder › ', h('b', {}, 'Add to Calendar'), ' — your phone’s Calendar handles it.')),
          h('li', {}, h('span', {}, 'Data never leaves this device. Use ', h('b', {}, 'Export backup'), ' / ', h('b', {}, 'Import backup'), ' to move it between phone and computer.')))),
    ],
  });
}

/* ---------- Account actions ---------- */

function openChangePassword() {
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: `New password (at least ${MIN_PASSWORD} characters)`, 'aria-label': 'New password' });
  const pw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Repeat new password', 'aria-label': 'Repeat new password' });
  sheet({
    title: 'Change Password',
    primary: {
      label: 'Save',
      onClick: async () => {
        if (pw.value !== pw2.value) { toast('Those passwords don’t match.', 'error'); return true; }
        await updatePassword(pw.value);
        toast('Password changed');
      },
    },
    body: [section(null, [h('div', { class: 'field-row' }, pw), h('div', { class: 'field-row' }, pw2)], { footnote: 'Use letters and numbers.' })],
  });
}

function openDeleteAccount() {
  const confirmInput = h('input', { class: 'input', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'Type DELETE', 'aria-label': 'Type DELETE to confirm' });
  const s = sheet({
    title: 'Delete Account',
    primary: {
      label: 'Delete',
      disabled: true,
      onClick: async () => {
        await deleteAccount();
        toast('Your account and all its data have been deleted');
      },
    },
    body: [
      h('p', { class: 'card-text', style: 'margin:0' }, 'This permanently deletes your Jarvis account and every reminder, note and update in it, on all devices. It can’t be undone.'),
      h('div', { class: 'button-row' }, h('button', { class: 'btn btn-plain', type: 'button', onclick: exportBackup }, icon('download'), 'Export a backup first')),
      section(null, h('div', { class: 'field-row' }, confirmInput), { footnote: 'Type DELETE to confirm.' }),
    ],
  });
  confirmInput.addEventListener('input', () => s.setPrimaryEnabled(confirmInput.value.trim() === 'DELETE'));
}

/* ---------- Background notifications (Web Push) ---------- */

function backgroundRow(perm) {
  const sub = h('div', { class: 'row-sub', style: 'white-space:normal' });
  const btn = h('button', { class: 'btn btn-sm', type: 'button' });
  const devices = h('div', { class: 'device-list' });

  const draw = () => {
    const on = pushActive();
    sub.textContent = !pushSupported()
      ? 'Not available in this browser. On iPhone, add Jarvis to your Home Screen first.'
      : on ? 'On — reminders arrive even when Jarvis is closed.' : 'Off — reminders only alert while Jarvis is open.';
    btn.className = `btn btn-sm ${on ? 'btn-plain' : 'btn-primary'}`;
    btn.textContent = on ? 'Turn off' : 'Turn on';
    btn.hidden = !pushSupported() || perm === 'denied';
    if (on) drawDevices();
    else devices.replaceChildren();
  };

  const drawDevices = async () => {
    const list = await listDevices().catch(() => []);
    devices.replaceChildren(...list.map((d) => h('div', { class: 'device' },
      h('span', {}, d.device || 'Device', d.thisDevice ? h('small', {}, ' · this device') : null),
      d.thisDevice ? null : h('button', { class: 'text-btn small', type: 'button', onclick: async () => { await removeDevice(d.id); drawDevices(); } }, 'Remove'))));
  };

  btn.addEventListener('click', async () => {
    setLoading(btn, true);
    try {
      if (pushActive()) { await disablePush(); toast('Background notifications off for this device'); }
      else {
        if (notificationState() !== 'granted' && (await requestNotifications()) !== 'granted') throw new Error('Notifications weren’t allowed.');
        await enablePush();
        toast('Background notifications on');
      }
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(btn, false); draw(); }
  });

  draw();
  return h('div', { class: 'row', style: 'flex-wrap:wrap' },
    icon('bell', { size: 20 }),
    h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, h('span', {}, 'When Jarvis is closed')), sub, devices),
    btn);
}
