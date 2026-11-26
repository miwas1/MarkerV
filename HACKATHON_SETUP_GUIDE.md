# Marking Assistant — #BuildHybridAI 2026 Setup & Submission Guide

Everything automated in code is aligned to the committed Firebase project (`gen-lang-client-0769662723`) and default cloud model (`gemini-3.5-flash-lite`):
- **All four Firebase AI Logic inference modes** (`src/domain/aiRouting.ts` + `src/ai/firebase.ts`):
  - `ONLY_ON_DEVICE`: Private student transcription, quote-verified marking, feedback drafts, and real student practice replies (zero cloud fallback).
  - `PREFER_ON_DEVICE`: Rubric drafting, rubric photo OCR, and end-to-end **fictional sample workspace** marking/transcription/feedback/practice. Runs Gemini Nano locally first with zero network calls and retries once in Cloud Gemini on unavailability or local error when Cloud AI is enabled.
  - `PREFER_IN_CLOUD`: Key points for the marker, drafted from the rubric alone. Cloud Gemini writes them when Cloud AI is enabled; on-device Gemini Nano takes over when Cloud AI is off, offline or the request fails.
  - `ONLY_IN_CLOUD`: Rubric reliability audits, aggregate cohort re-teaching plans, and fictional second-opinion comparisons—always preceded by an exact JSON payload preview, small-cohort suppression, App Check (`useLimitedUseAppCheckTokens: true`), and fresh Remote Config (`allow_cloud_ai`).
- **Hardened Submission Links (`firestore.rules`):** Optional lecturer-owned `/submit/:linkId` dropboxes initialize App Check and strictly forbid unauthenticated student writes from setting marks, suggestions, or scores. Marking runs on the lecturer's device and imports as suggestions only.
- **Zero eager Firestore traffic:** Normal landing and private workspace visits make zero Firestore requests.

---

## 1. Verify Firebase Project Config (`gen-lang-client-0769662723`)

1. Open [Firebase Console](https://console.firebase.google.com/) → project **`gen-lang-client-0769662723`** → **Project settings → Your apps**.
2. Confirm **`firebase-applet-config.json`** contains the Web App config AND your **reCAPTCHA Enterprise site key** in `"recaptchaSiteKey"` (or set `VITE_FIREBASE_APP_CHECK_SITE_KEY` in `.env.local` for local dev). Without a site key, Cloud AI stays intentionally disabled.
3. Verify **Build → AI Logic** is enabled with **Gemini Developer API** (matching `new GoogleAIBackend()` in `src/ai/firebase.ts`).
4. The default cloud model is pinned to **`gemini-3.5-flash-lite`** (`src/ai/firebaseConfig.ts`). You can override it anytime via `VITE_FIREBASE_CLOUD_MODEL`.

---

## 2. Configure Firebase Authentication (Email/Password)

1. In Firebase Console for **`gen-lang-client-0769662723`**, go to **Build → Authentication → Sign-in method** and ensure **Email/Password** is enabled.
2. Go to **Authentication → Settings → Authorized domains** and verify your hosting origins are listed:
   - `gen-lang-client-0769662723.web.app`
   - `gen-lang-client-0769662723.firebaseapp.com`
   - `localhost` (for local development)

---

## 3. Configure Firebase App Check (reCAPTCHA Enterprise)

Cloud AI (`ONLY_IN_CLOUD` and `PREFER_ON_DEVICE` fallback) and public student submission writes (`/submit/:linkId`) use Firebase App Check with reCAPTCHA Enterprise and `useLimitedUseAppCheckTokens: true`.

1. In Firebase Console for **`gen-lang-client-0769662723`**, go to **Build → App Check → Apps** and register your Web App with a reCAPTCHA Enterprise site key.
2. Copy that site key into `firebase-applet-config.json` (`"recaptchaSiteKey"`) or `.env.local` (`VITE_FIREBASE_APP_CHECK_SITE_KEY`).
3. In Google Cloud Console → **Security → reCAPTCHA**, verify your key allows `gen-lang-client-0769662723.web.app`, `gen-lang-client-0769662723.firebaseapp.com`, and `localhost`.
4. Under **App Check → APIs**, confirm **Firebase AI Logic** enforcement is enabled.

### Local testing with App Check Debug Token (optional)
If reCAPTCHA blocks `localhost` during local testing:
1. In Chrome DevTools Console on `localhost`, run:
   ```js
   self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
   ```
   and reload to print a debug token.
2. Register that token in Firebase Console → **App Check → Apps → (⋮) Manage debug tokens**.
3. **Never commit debug tokens** to git or production builds.

---

## 4. Publish Firebase Remote Config (`allow_cloud_ai`)

The app requires a fresh Remote Config fetch before every cloud AI call (cached defaults are rejected).

1. In Firebase Console for **`gen-lang-client-0769662723`**, go to **Run → Remote Config**.
2. Publish parameter `allow_cloud_ai` (Boolean) as `true` for live judging. `remoteconfig.template.json` holds `true`, so a Firebase CLI deploy that includes Remote Config keeps cloud AI on. Check the template before deploying if you change it.
3. During your demo video, you can flip `allow_cloud_ai` to `false` to demonstrate the institutional kill-switch blocking cloud requests while on-device marking keeps working offline—then flip it back to `true` before judging.

---

## 5. Verify Chrome Built-in AI

1. Use **current desktop Google Chrome** on hardware meeting Chrome's on-device AI requirements (≥ 22 GB free disk space; GPU > 4 GB VRAM or ≥ 16 GB RAM + ≥ 4 CPU cores).
2. Enable Gemini Nano 4: in `chrome://flags`, search for **Gemma 4 for Built-in AI**, enable it and relaunch Chrome (this is the step the hackathon FAQ gives). `chrome://on-device-internals` shows which model is installed.
3. Open DevTools Console and verify:
   ```js
   await LanguageModel.availability({ expectedInputs: [{ type: 'image' }] })
   ```
   Use **Settings → On-device AI** to download the text and photo models if `"downloadable"`.

---

## 6. Build, Publish & Verify

The submitted live URL is Firebase Hosting: **`https://gen-lang-client-0769662723.web.app`**. The older AI Studio URL (`marking-assistant-1.ai.studio`) serves an earlier build and is not the one to submit. Redeploy after every change that should reach judges:

```bash
npm ci
npm test
npm run lint
npm run build
# Deploy only what changed. A bare `firebase deploy` also publishes remoteconfig.template.json.
npx firebase-tools deploy --only hosting,firestore:rules --project gen-lang-client-0769662723
```

Verify your live URL (`https://gen-lang-client-0769662723.web.app`):
- Open **Settings**, toggle **Allow cloud AI** ON, and confirm **Hybrid AI routing** shows `gemini-3.5-flash-lite` and project `gen-lang-client-0769662723`.
- Open **Try interactive demo** on a device without Gemini Nano (or a phone) and test **Suggest marks (Hybrid AI · sample)**, **Draft (Hybrid AI · sample)**, **Audit rubric quality**, **Draft teaching plan**, and **Sample practice** — confirm real `Cloud` provenance badges.
- On desktop Chrome with Gemini Nano ready, reload once online so `sw.js` activates, toggle **Offline** in DevTools Network panel, and verify **Transcribe on this device**, **Suggest marks on this device**, and **Draft with on-device AI** succeed with `On device` badges and **0 outbound requests**.

---

## 7. Final Submission Checklist

- [ ] `recaptchaSiteKey` populated in `firebase-applet-config.json` (or `VITE_FIREBASE_APP_CHECK_SITE_KEY` set) so judges on clean clones and the live URL can toggle **Allow cloud AI**
- [ ] `allow_cloud_ai = true` published in Firebase Remote Config for `gen-lang-client-0769662723`
- [ ] Live hosted URL (`https://gen-lang-client-0769662723.web.app`) verified in an incognito window, signed out
- [ ] Clean git repo with `package-lock.json` committed so `npm ci` works on clean clones, and every local change pushed (commits after the deadline are not evaluated)
- [ ] All three benchmarks run with **Full run** on one machine and the table pasted into the README (the `RESULTS` comment marks the place)
- [ ] GitHub repository **About** filled in: description, the live URL as the website, and topics
- [ ] Devpost form filled in from [DEVPOST_SUBMISSION.md](DEVPOST_SUBMISSION.md), including what was built during the submission period and the testing instructions
- [ ] Demo video (≤ 3 min) highlighting: quote-exactness verification, small-cohort suppression, exact payload previews, fresh Remote Config gate, and offline `ONLY_ON_DEVICE` vs `PREFER_ON_DEVICE` / `ONLY_IN_CLOUD`
- [ ] Submit before **Monday, 30 November 2026, 2:00 PM PT**
