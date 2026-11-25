# Marking Assistant

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)

A local-first marking workspace for university lecturers built with **Firebase AI Logic** hybrid inference. Capture handwritten scripts on a phone, upload local PDF/DOCX/TXT files, or collect responses via optional lecturer-owned submission links—then review quote-verified criterion marks, release portable feedback, and plan class re-teaching without ever sending real student scripts to cloud AI.

The original problem statement and research context are in [PROJECT.md](PROJECT.md). Detailed console configuration and deployment steps are in [HACKATHON_SETUP_GUIDE.md](HACKATHON_SETUP_GUIDE.md).

## Why this matters

Lecturers routinely grade mixed paper and digital cohorts under institutional privacy policies (FERPA/GDPR) that prohibit pasting identifiable student scripts into cloud chatbots. Marking Assistant routes every AI call by **data sensitivity**:

| Firebase AI Logic mode | Where it is used | Network & privacy contract |
| --- | --- | --- |
| `InferenceMode.ONLY_ON_DEVICE` | Private student transcription, quote-verified marking, feedback drafts, and real student practice replies | **0 bytes sent to cloud AI.** Runs inside compatible desktop Chrome via Gemini Nano; works fully offline. |
| `InferenceMode.PREFER_ON_DEVICE` | Rubric drafting, photographed mark-scheme reading, and the **fictional CS201 sample workspace** (transcription, marking, feedback, and sample practice) | Attempts Gemini Nano locally first with **zero** Remote Config / App Check network calls. Falls back (or retries once on local error) to Cloud Gemini only when unavailable or failing and Cloud AI is enabled. |
| `InferenceMode.ONLY_IN_CLOUD` | Rubric reliability audits, aggregate cohort re-teaching plans, and fictional second-opinion comparisons | Always shows the exact JSON payload before sending, suppresses small cohorts (< 10 scripts or < 3 per group), and enforces Firebase App Check (with limited-use tokens) + fresh Remote Config (`allow_cloud_ai`). |

Every AI mark suggestion is accepted only when its cited quote appears **verbatim and exactly once** in the transcript. Manual capture, local PDF/DOCX/TXT extraction, rubric scoring, feedback export, and offline storage work on every phone and desktop browser—even without Chrome Built-in AI.

### Privacy & optional submission dropbox disclosure

- **Local workspace (default):** Projects, rubrics, photos, transcripts, marks, and feedback live in browser IndexedDB. Opening the landing page or private workspace makes **zero** Firestore requests.
- **Optional Student Submission Links:** Lecturers who sign in with email/password can publish unique `/submit/:linkId` dropbox forms with configurable fields (e.g., Full Name, Matric Number, essay text, file uploads). Incoming student answers are stored in a private, lecturer-owned Firestore collection locked down by `firestore.rules`. Students can **never** write marks, suggestions, or scores to Firestore; official marking always runs on the lecturer's device and imports as suggestions only.

## Live Hosted URL

- **Live App URL:** <https://marking-assistant-1.ai.studio>

### Fast 3-step judge path (works on any phone, Safari, or desktop browser)

1. Open **<https://marking-assistant-1.ai.studio>** and click **Explore live sample** (or **Try sample** in the sidebar).
2. Click **Allow cloud AI** directly in the sample banner (or toggle it in **Settings**).
3. Open **Script 001** and run **Suggest marks (Hybrid AI · sample)**, **Compare second opinion**, **Sample rubric → Audit rubric**, or **Sample class picture → Draft teaching summary** to see live `On this device` or `Cloud` provenance badges with latency.

*(If you also deploy to Firebase Hosting alongside AI Studio, run `firebase deploy --only hosting,firestore:rules --project gen-lang-client-0769662723`.)*

## Run locally (clean clone)

Use Node.js 22+ and npm. Manual marking, local PDF/DOCX/TXT extraction, and the offline workspace work without configuring cloud keys.

```bash
npm ci
npm run dev
```

Run tests, typecheck + Firestore rules lint, and production build:

```bash
npm test
npm run lint
npm run build
npm run preview
```

Pure routing policy tests (`selectAiRoute` in `src/domain/aiRouting.ts`), evidence verification, cohort small-group suppression, rubric parsing, and Firebase config resolution are covered in `tests/workspace.test.ts`.

## Connect Firebase AI Logic & Cloud Fallback

The committed `firebase-applet-config.json` targets project `gen-lang-client-0769662723` with default cloud model **`gemini-3.5-flash-lite`**. To enable Cloud AI and hybrid fallback on a clean clone:

1. **Register App Check (reCAPTCHA Enterprise):** Set `VITE_FIREBASE_APP_CHECK_SITE_KEY` in `.env.local` (copy from `.env.example`) or populate `recaptchaSiteKey` in `firebase-applet-config.json`. Keep Firebase AI Logic App Check enforcement enabled; the SDK uses `useLimitedUseAppCheckTokens: true` for cloud AI calls and initializes App Check on public `/submit/:linkId` pages.
2. **Publish Remote Config:** In Firebase Console → **Remote Config**, publish Boolean parameter `allow_cloud_ai = true` (the bundled `remoteconfig.template.json` defaults to `false` as an institutional kill-switch). The client requires a fresh remote fetch—never a cached default.
3. **Enable Cloud AI in Settings:** Open `/settings` and toggle **Allow cloud AI** ON. Judges on phones, Safari, or low-spec laptops can now open **Try sample** (`/sample`) and run hybrid transcription, quote-verified marking, feedback drafting, practice follow-ups, rubric audits, and class teaching plans end-to-end with real `On device` or `Cloud` provenance badges.
4. **Optional on-device Chrome AI:** In compatible desktop Chrome, open **Settings → On-device AI** to download the local text and photo models. Disconnect Wi-Fi to verify offline on-device marking with zero outbound requests.
5. **Local App Check debug token (dev only):** Set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` in Chrome DevTools Console on `localhost` before your first cloud call and register the printed token in Firebase Console → App Check. Never commit debug tokens.

The two bundled fonts are self-hosted and their licences are under [public/licenses](public/licenses).
