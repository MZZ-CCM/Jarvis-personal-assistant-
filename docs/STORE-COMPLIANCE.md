# Store compliance: App Store & Google Play

Everything you need to submit Jarvis, and the answers to paste into each store's forms.

**Before you submit, replace `YOUR-APP`** with your real Vercel address (for example `jarvis-carean.vercel.app`) in:
`index.html` (canonical, og:url, og:image), `robots.txt` and `sitemap.xml`.

| Link | URL |
|---|---|
| Privacy Policy | `https://YOUR-APP.vercel.app/privacy` |
| Terms of Use | `https://YOUR-APP.vercel.app/terms` |
| Support | `https://YOUR-APP.vercel.app/support` |
| Account deletion (Google Play) | `https://YOUR-APP.vercel.app/support#delete-account` |
| Contact | careanmoyo1@gmail.com |

---

## 1. Launch checklist (the 20 items)

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Privacy policy | ✅ | `privacy.html`: UK GDPR, processors, retention, rights, ICO, under-13s |
| 2 | Terms | ✅ | `terms.html`; agreement shown at sign-up |
| 3 | Secrets off the frontend | ✅ | Only the Supabase **publishable** key is in `js/config.js`. The service-role key, VAPID private key and cron secret live only in Supabase |
| 4 | Force HTTPS | ✅ | Vercel redirects to HTTPS; HSTS + `upgrade-insecure-requests` in `vercel.json` |
| 5 | Cookie banner | ✅ Not needed | No cookies for tracking; only strictly necessary storage (sign-in session, offline cache). This is exempt under PECR, and the policy explains it (§ Cookies) |
| 6 | Meta titles & descriptions | ✅ | Every page has a unique `<title>` and description |
| 7 | Social preview image | ✅ | `icons/og-image.jpg` (1200×630) + Open Graph / Twitter tags |
| 8 | Favicon | ✅ | `icons/icon.svg`, PNGs, Apple touch icon, manifest icons |
| 9 | Sitemap & robots.txt | ✅ | `sitemap.xml`, `robots.txt` (replace `YOUR-APP`) |
| 10 | Alt text | ✅ | Images have alt text; decorative ones are hidden from screen readers |
| 11 | Compress images | ✅ | Preview image 86 KB; icons are SVG or small PNGs |
| 12 | Page speed | ✅ | No framework or build step; service worker caching; long cache on fonts and icons. The AI model downloads only when the user chooses to |
| 13 | Colour contrast | ✅ | Light accent darkened to `#0a716d` (5.2:1), gold to `#a36c0f` (4.5:1); passes WCAG AA |
| 14 | Mobile-friendly | ✅ | iPhone-first layout, safe areas, Dynamic Type, 44 pt tap targets |
| 15 | Custom 404 | ✅ | `404.html` (Vercel serves it automatically) |
| 16 | Broken links | ✅ | All internal links checked |
| 17 | Form validation | ✅ | Email and password checks with clear inline messages |
| 18 | Spam protection | ✅ | Email confirmation, Supabase Auth rate limits, sign-in cooldown on the device |
| 19 | Analytics | ✅ None, by design | This is a privacy promise. If you ever add analytics, update the privacy policy and store labels first |
| 20 | One clear call to action | ✅ | Welcome screen: **Create an account** / **Sign in** |

**Also in place:**
- Security headers: CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy.
- Account deletion in the app, plus a web/email route.
- Data export.

---

## 2. Apple: App Privacy ("nutrition label")

App Store Connect › App Privacy. **Tracking: No.** Jarvis doesn't track users or share data with data brokers.

| Data type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Contact info › Email address | Yes | Yes | No | App functionality (account) |
| Contact info › Name | Yes (optional) | Yes | No | App functionality |
| User content › Other user content (reminders, notes, updates) | Yes | Yes | No | App functionality |
| Identifiers › Device ID (push subscription) | Yes | Yes | No | App functionality (notifications) |
| Usage data, diagnostics, location, contacts, financial info, health, browsing history | **No** | | | |

Not collected (stays on the device): Jarvis chat, AI prompts, the Reply helper and voice (keyboard dictation).

**Age rating:** 4+. In the questionnaire, answer "None" to everything. There's no user-to-user contact and no unrestricted web access. The Terms require users to be 13+ to create an account; that is fine alongside a 4+ rating.

**Account deletion (Guideline 5.1.1(v)):** ✅ Settings › Delete Account deletes everything straight away.

## 3. Google Play: Data safety

Play Console › App content › Data safety.

- Does your app collect or share user data? **Yes, collects. Doesn't share.**
- Is all data encrypted in transit? **Yes.**
- Can users request data deletion? **Yes.** Deletion URL: `/support#delete-account`.

| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| Personal info › Email address | Yes | No | Required | Account management, app functionality |
| Personal info › Name | Yes | No | Optional | App functionality |
| App activity › Other user-generated content | Yes | No | Required | App functionality |
| Device or other IDs (push token) | Yes | No | Optional | App functionality |

Data is processed ephemerally? No. It is stored in the user's account.

**Other Play Console forms:**

| Form | Answer |
|---|---|
| Target audience | 13+ (not designed for children) |
| Ads | No |
| Content rating (IARC) | Everyone |
| App access | Provide a demo login (see below) |
| Government / financial / health apps | No |

---

## 4. Reviewer notes (both stores)

1. **Demo account.** Create one yourself (e.g. `review@…`), confirm its email, and add a few reminders and notes. Put the email and password in *App Review Information* (Apple) and *App access* (Google). Never reuse your real password.
2. **Notifications rationale.** "Jarvis sends only the reminder alerts you set. Permission is requested only when you turn on notifications in Settings."
3. **AI.** "The optional AI runs entirely on the device. It's downloaded once when the user chooses a brain in Settings, and no prompts leave the device."
4. **Custom SMTP.** Set this up before review. Supabase's built-in email sender is limited to a few emails per hour, which can stop reviewers from receiving the confirmation email. The free Brevo tier works: Supabase › Authentication › Emails › SMTP settings.

---

## 5. Getting a web app into the stores (read this)

Jarvis is a PWA. The stores need a native "wrapper" around it.

### Google Play: straightforward ✅
- Use **PWABuilder** (pwabuilder.com) › enter your URL › **Android** package. It creates a Trusted Web Activity (TWA).
- **Web push keeps working** in a TWA.
- Upload the `assetlinks.json` it gives you to `/.well-known/assetlinks.json` in this folder, then redeploy.
- **Cost:** $25, one-time, for a Google Play developer account.
- New personal developer accounts must run a **closed test with at least 12 testers for 14 days** before going to production.

### Apple App Store: possible, with caveats ⚠️
- **Cost:** $99 a year for the Apple Developer Program, plus a Mac with Xcode (PWABuilder's iOS package or Capacitor).
- **Guideline 4.2 (minimum functionality).** Apple rejects apps that are "just a website". Jarvis's case is its offline support, on-device AI, notifications and account features. Say so in the review notes.
- **Web Push doesn't work inside an iOS wrapper** (WKWebView). Background reminders in the App Store version would need native push through APNs (for example Capacitor's Push Notifications plugin, with the Edge Function sending to APNs). This is a separate piece of work.
- The WebLLM brain needs WebGPU. Recent iOS versions support it, but test the wrapped app on a real iPhone.
- **Free alternative that already works:** iPhone users can install from Safari › Share › Add to Home Screen, with full web push. No store needed.

---

## 6. When things change

- Any new data collected, new provider or analytics → update `privacy.html` (and its "Last updated" date) **and** both store labels.
- Any paid features → update `terms.html` and use Apple and Google in-app purchase for digital subscriptions sold inside the store apps.
