# Jarvis

A private personal assistant for your **iPhone and computer**. You tell it your reminders, notes and updates, and it keeps track, notifies you, briefs you on your day, and helps you reply to emails.

**Completely free.** No accounts, no API keys, no servers, no subscriptions, no hidden costs. Your data never leaves your device.

## What it does

| | |
|---|---|
| **Today** (dashboard) | Your briefing, what's due today, what's coming up, pinned notes and latest updates, all on one screen. |
| **Reminders** (own page) | Everything grouped into Overdue, Today, Tomorrow, This week, Later and No date, plus a Completed history. Per-reminder alerts. |
| **Notes** (own page) | Notes (codes, lists, ideas) and your **Updates** log of what's happening. Searchable. |
| **Jarvis** | Chat or talk (Jarvis Mode, **⌘K**). Commands work instantly; questions are answered from *your* data. |
| **Reply helper** | Paste an email and Jarvis drafts a reply on-device. Copy it, or open it straight in your Mail app. |
| **Notifications** | System notifications when reminders are due, with **Done** and **Snooze** buttons. |

### Talk to it like this
- "Remind me to call Mom tomorrow at 6". Also: "in 20 minutes", "Friday 9am", "Oct 12", "on the 1st", "todo: buy milk".
- "Note: gate code is 4821"
- "Update: sent the Q3 report"
- "Done with the invoice" / "Delete reminder to buy milk"
- "What's on today?" / "Where's the spare key?" / "What's coming up this week?"

## The AI brain (free and on-device)

Jarvis runs an open AI model **inside your browser** using WebGPU (via [WebLLM](https://github.com/mlc-ai/web-llm), bundled with the app). Pick a size in **Settings › AI brain**:

| Brain | Download | Best for |
|---|---|---|
| Light | ~0.9 GB | iPhone |
| Balanced | ~1.6 GB | Newer phones & laptops |
| Smart | ~2.3 GB | Computers |

- It downloads once from a free public model mirror, then it's cached and works offline.
- It needs Safari on iOS 26+ or Chrome / Edge on a computer.
- **Optional:** if you run [Ollama](https://ollama.com) on your computer, pick it as the engine for bigger models. Start Ollama with `OLLAMA_ORIGINS=<your Jarvis address> ollama serve`.
- **No brain?** Reminders, notes, updates, notifications and questions about your data still work. Only open-ended chat and email drafting need the brain.

## Notifications

1. Open **Settings › Notifications**, tap **Turn On**, then **Send a test notification**.
2. Jarvis notifies you when each reminder's alert time arrives. It fires while Jarvis is open or running in the background (a browser tab, or the installed app). Notifications have **Done** / **Snooze 10 min** buttons on computers and Android.
3. Alerts you missed while Jarvis was closed show up as soon as you open it again.
4. **iPhone:** Apple only allows notifications from Home Screen apps. Install Jarvis first (below), then turn notifications on from inside it.
5. **Alerts when Jarvis is completely closed:** open a reminder and tap **Add to Calendar**. Your device's own Calendar app takes over the alarm. No accounts involved.

> Why not push notifications when fully closed? That needs a server running 24/7, which costs money or requires an account. Jarvis stays 100% free and on-device instead, and your phone's Calendar covers the closed-app case.

## Run it

```bash
cd ~/Jarvis
python3 serve.py
```

Then open http://localhost:8080 and choose **Start with Sample Data** to explore.

## Put it on your phone and computer (free hosting)

**Option A: Netlify Drop (easiest).** Drag the `Jarvis` folder onto https://app.netlify.com/drop. You get a free https address.

**Option B: GitHub Pages.** Push this folder to a repo, then **Settings › Pages › Deploy from branch**.

- **iPhone:** open the address in **Safari**, tap **Share › Add to Home Screen**, and open Jarvis from the icon.
- **Computer:** open it in Chrome or Edge and click **Install** in the address bar. In Safari on a Mac, use **File › Add to Dock**.

### Moving data between devices
Everything is stored on the device you're using. To move it, use **Settings › Your data › Export backup** on one device, then **Import backup** on the other.

## Keyboard shortcuts (computer)

| Keys | Action |
|---|---|
| ⌘K / Ctrl K | Jarvis Mode (voice) |
| N · W · U | New reminder · note · update |
| R | Reply helper |
| 1–5 | Today · Reminders · Notes · Jarvis · Settings |
| / | Search the current page |
| ? | All shortcuts |

## How it's built

```
index.html              App shell (installable web app)
css/                    Design system, atmosphere & motion, computer layout, features
fonts/                  Instrument Serif (bundled, SIL Open Font License)
js/data.js              Your reminders, notes & updates (on-device storage, backup/restore)
js/when.js              Natural-language dates ("friday 9am", "in 20 minutes")
js/brain.js             Commands, answers from your data, briefing, reply drafting
js/ai.js, ai-worker.js  On-device AI (WebLLM in a background worker) or Ollama
js/notify.js            Reminder clock, notifications, Done/Snooze, calendar export
js/vendor/web-llm.js    WebLLM 0.2.85 (Apache-2.0), bundled
js/views/               Today, Reminders, Notes, Jarvis chat, Jarvis Mode, Settings…
sw.js                   Offline support + notification buttons
```

**Privacy:** Jarvis makes no network requests except the one-time AI model download. Spoken replies use your device's own voices. Voice *input* uses the browser's built-in speech recognition. Safari handles that through Apple; Chrome sends the audio to Google's free speech service. If you'd rather avoid that, type, or use your keyboard's dictation mic. Email text you paste is treated as untrusted, and Jarvis never sends email itself.
