// Offline shell. Network-first so updates show up on the next open;
// the cache is only a fallback when there's no signal.
const VERSION = 'jarvis-v4';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/fonts.css', './css/app.css', './css/immersive.css', './css/desktop.css', './css/features.css',
  './js/app.js', './js/ui.js', './js/util.js', './js/store.js', './js/data.js', './js/when.js',
  './js/brain.js', './js/ai.js', './js/ai-worker.js', './js/notify.js', './js/conversation.js',
  './js/views/today.js', './js/views/reminders.js', './js/views/notes.js', './js/views/capture.js', './js/views/draft.js',
  './js/views/jarvis.js', './js/views/voice.js', './js/views/settings.js', './js/views/welcome.js',
  './fonts/instrument-serif-latin.woff2', './fonts/instrument-serif-italic-latin.woff2',
  './icons/icon.svg', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];
// js/vendor/web-llm.js (6.5 MB) is cached on first use rather than up front.

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only this app's own files; the AI model weights are cached by WebLLM itself.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});

// Tapping a reminder notification (or its Done / Snooze buttons).
self.addEventListener('notificationclick', (e) => {
  const { id } = e.notification.data || {};
  const action = e.action || 'open';
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = wins.find((c) => new URL(c.url).origin === self.location.origin);
    if (client) {
      if (id && action !== 'open') client.postMessage({ type: 'reminder-action', action, id });
      if (action === 'open' || !id) return client.focus();
      return undefined;
    }
    // Jarvis was closed: open it and let it apply the action on launch.
    const q = id && action !== 'open' ? `?act=${action}&id=${encodeURIComponent(id)}` : '';
    return self.clients.openWindow(`./#/reminders${q}`);
  })());
});
