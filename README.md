# Jarvis

A private personal assistant for your **iPhone and computer**. You tell it your reminders, notes and updates, and it keeps track, notifies you, briefs you on your day, and helps you reply to emails.

**Multi-user.** Anyone can create their own account. Each person's data is private to them and syncs across their devices, stored in Supabase on the free plan.

**Free.** The Supabase free plan, free hosting and an AI that runs on your device. No API keys, subscriptions or card on file.

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

## Accounts & security (Supabase)

- **Sign up / sign in** with email + password. Email confirmation, **Forgot password**, **Change password**, **Sign out**, **Sign out of all devices**, and **Delete account** (type DELETE to confirm; it erases everything) are all built in.
- **Row Level Security on every table.** The database only lets a signed-in person read or change rows they own; signed-out visitors get nothing. That's why the app's *publishable* key can be public. Never put the secret / service_role key in the app.
- Rows can't be moved to another user, and text lengths are capped to prevent abuse.
- Email links use the PKCE flow, so no login tokens ever appear in the address bar.
- Each account's cached data, chat history and alerts are kept separate on the device, and **signing out wipes them from that device**.
- Changes sync instantly between your devices and keep working offline (queued until you're back online).
- The whole schema is in [`supabase/migrations/`](supabase/migrations/).

### Set up Supabase (about 5 minutes)
1. At [supabase.com/dashboard](https://supabase.com/dashboard), create a **new project** called `Jarvis` on the **Free** plan.
2. Run the SQL in `supabase/migrations/20260926000000_jarvis_accounts.sql` in **SQL Editor**, or have Claude apply it.
3. **Authentication › URL Configuration:** set **Site URL** to your Jarvis address, and add it (plus `http://localhost:8080/`) under **Redirect URLs**.
4. **Authentication › Sign In / Providers › Email:** keep **Confirm email** on. Set **minimum password length** to 8 or more.
5. **Project Settings › API:** copy the **Project URL** and **Publishable key** into `js/config.js`.

> Free-plan notes: projects pause after about a week of no activity (they wake when you open the dashboard), and the built-in email sender is rate-limited (a few emails per hour). That's fine for friends and family; for more users, add your own SMTP in Authentication settings.

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
- The AI runs on each person's own device. Nothing they ask it is sent to Supabase or anywhere else.

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

Then open http://localhost:8080, create an account, and add sample data from **Settings › Your data**.

## Put it on your phone and computer (free hosting)

**Vercel (recommended).** Import this folder into Vercel. `vercel.json` adds HTTPS-only security headers (CSP, HSTS, no framing), clean URLs (`/privacy`, `/terms`, `/support`) and the custom 404 page. After the first deploy, replace `YOUR-APP` with your address in `index.html`, `robots.txt` and `sitemap.xml`.

**Option A: Netlify Drop.** Drag the `Jarvis` folder onto https://app.netlify.com/drop. You get a free https address.

**Option B: GitHub Pages.** Push this folder to a repo, then **Settings › Pages › Deploy from branch**.

- **iPhone:** open the address in **Safari**, tap **Share › Add to Home Screen**, and open Jarvis from the icon.
- **Computer:** open it in Chrome or Edge and click **Install** in the address bar. In Safari on a Mac, use **File › Add to Dock**.

### Your data on every device
Sign in with the same account on your phone and computer, and everything syncs. Settings › Your data › **Export backup** saves your own copy any time.

### Sign-in emails
Supabase's built-in email sender allows only a few emails per hour. Before inviting people, add free custom SMTP (for example Brevo) in Supabase › Authentication › Emails › SMTP settings.

## Legal, privacy & app stores

- `privacy.html`, `terms.html` and `support.html` (including account deletion) are linked from the welcome screen, sign-up and Settings.
- There's no cookie banner because Jarvis uses no tracking or analytics, only strictly necessary storage.
- **Store listing answers, review notes and how to wrap Jarvis for the App Store and Google Play:** see [docs/STORE-COMPLIANCE.md](docs/STORE-COMPLIANCE.md).

## Keyboard shortcuts (computer)

| Keys | Action |
|---|---|
| ⌘K / Ctrl K | Jarvis Mode (speak with keyboard dictation) |
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
js/auth.js              Accounts: sign up, sign in, reset, delete (Supabase Auth)
js/config.js            Your Supabase project URL + publishable key
js/data.js              Reminders, notes & updates: synced to your account, cached, offline queue, live updates
js/when.js              Natural-language dates ("friday 9am", "in 20 minutes")
js/brain.js             Commands, answers from your data, briefing, reply drafting
js/ai.js, ai-worker.js  On-device AI (WebLLM in a background worker) or Ollama
js/notify.js            Reminder clock, notifications, Done/Snooze, calendar export
js/vendor/web-llm.js    WebLLM 0.2.85 (Apache-2.0), bundled
js/vendor/supabase.js   supabase-js 2.117.2 (MIT), bundled
supabase/migrations/    Database schema + Row Level Security
js/views/               Today, Reminders, Notes, Jarvis chat, Jarvis Mode, Settings…
sw.js                   Offline support, background push + notification buttons
privacy/terms/support   Legal & help pages (css/legal.css), 404.html, robots.txt, sitemap.xml
vercel.json             Security headers + caching for Vercel
```

**Privacy:** Jarvis only talks to your Supabase project (your data) and, once, the AI model mirror. The AI itself runs on your device. **Voice input uses your keyboard's own dictation.** Tap the mic on the iPhone keyboard, press Fn twice on a Mac, or Windows + H on a PC. No browser speech service is used, and spoken replies use your device's voices. Email text you paste is treated as untrusted, and Jarvis never sends email itself.
