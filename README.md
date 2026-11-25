# Marking Assistant

[![CI](https://github.com/miwas1/MarkerV/actions/workflows/ci.yml/badge.svg)](https://github.com/miwas1/MarkerV/actions/workflows/ci.yml)

**AI help with marking, without sending student work to cloud AI.**

Marking Assistant is a marking workspace for university lecturers. Gemini Nano, running inside the lecturer's own Chrome, reads each student script and suggests a mark for every rubric criterion. The cloud model only receives requests that contain no student work: the rubric, class-level counts and fictional samples. [Firebase AI Logic](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started) hybrid inference routes every request.

Built for #BuildHybridAI 2026.

- **Live app:** <https://marking-assistant-1.ai.studio>
- **Background, research and sources:** [PROJECT.md](PROJECT.md)
- **Firebase console setup:** [HACKATHON_SETUP_GUIDE.md](HACKATHON_SETUP_GUIDE.md)

<!-- VIDEO: add "- **Demo video (3 min):** <YouTube link>" to the list above once the video is uploaded. -->

## The problem

- **Lecturers are told not to upload student work to AI tools.** Universities including York, Liverpool, King's College London, UCL and Melbourne restrict or forbid it, for data protection and because students own their work. The tools that could save the most marking time are off-limits.
- **Marking is inconsistent.** Marks drift as the marker tires, and a script is marked more harshly after a very good one.
- **Students do not understand how they were marked.** In the UK's 2025 National Student Survey, clarity of marking criteria scored lowest of the assessment questions (78.1% positive).

Policy links and research sources are listed in [PROJECT.md](PROJECT.md#sources).

### Why this needs hybrid AI

| Design | What goes wrong |
| --- | --- |
| No AI | Every script is marked by hand, with no second view of the evidence. |
| Cloud only | Student work leaves the device, which is what the university rules forbid. Nothing works offline. |
| On-device only | The small model marks without help, and phones and older laptops get no AI at all. |
| **Hybrid (this app)** | Student work stays on the device. The cloud model does the work that involves no student data, and writes the brief that guides the on-device marker. |

## What a lecturer does

1. **Builds a rubric.** Pastes it, uploads a TXT, DOCX or PDF file, or photographs a printed mark scheme.
2. **Adds scripts.** Phone photos of handwritten pages, PDF, DOCX or TXT files, pasted answers, or an optional submission link.
3. **Reviews suggested marks.** Each suggestion quotes the words in the answer that earned it. The lecturer accepts or changes every mark.
4. **Prepares feedback.** Per-criterion feedback and oral follow-up questions, exported as a file for the student.
5. **Reads the class picture.** Which criteria the class missed most, with an optional teaching plan drafted from counts alone.

Students open their feedback file under **Practice** and work on the criteria where they lost marks.

Capture, manual marking, feedback export and the class picture work in any browser, including on phones. The AI steps depend on the routing below.

## How requests are routed

The route depends on what the request contains, not only on whether a device model is available.

```mermaid
flowchart TD
  request["AI request"] --> policy{"What does the request contain?"}
  policy -->|"A student's script, marks,<br/>feedback or practice reply"| onlyDevice["ONLY_ON_DEVICE"]
  policy -->|"Rubric drafting, or<br/>the fictional sample"| preferDevice["PREFER_ON_DEVICE"]
  policy -->|"The rubric alone:<br/>key points for the marker"| preferCloud["PREFER_IN_CLOUD"]
  policy -->|"Class counts, rubric audit,<br/>fictional second opinion"| onlyCloud["ONLY_IN_CLOUD"]
  onlyDevice --> nano["Gemini Nano in Chrome<br/>0 bytes to cloud AI"]
  preferDevice --> nano
  preferDevice -.->|"no device model,<br/>or it failed"| gate
  preferCloud --> gate
  preferCloud -.->|"cloud off, offline<br/>or failed"| nano
  onlyCloud --> gate
  gate["Cloud gate<br/>lecturer opt-in, App Check, Remote Config"] --> cloud["Gemini in the cloud"]
```

| Firebase AI Logic mode | Used for | What that means |
| --- | --- | --- |
| `InferenceMode.ONLY_ON_DEVICE` | Transcribing a script, suggesting marks, drafting feedback, replying to a student's practice answer | No cloud fallback exists for these tasks. If the device model is missing, the lecturer continues manually. |
| `InferenceMode.PREFER_ON_DEVICE` | Drafting a rubric, reading a photographed mark scheme, and everything in the fictional sample workspace | Tries Gemini Nano first with no network call. Uses cloud Gemini only when the device model is missing or fails, and only if cloud AI is allowed. |
| `InferenceMode.PREFER_IN_CLOUD` | Key points for the marker, written from the rubric alone | Cloud Gemini writes them after a payload preview. Gemini Nano takes over when cloud AI is off, offline or fails. |
| `InferenceMode.ONLY_IN_CLOUD` | Rubric audit, class teaching plan, second opinion on a fictional script, the benchmark's cloud baseline | Always shows the exact JSON payload before sending. |

Two parts of this go beyond the standard fallback pattern:

- **Capability moves down to the device, and no student data moves up.** The cloud model reads only the rubric and writes key points for each criterion. The on-device model then marks private scripts with those key points beside it.
- **The policy is code with tests.** `selectAiRoute` in [src/domain/aiRouting.ts](src/domain/aiRouting.ts) is a pure function. [tests/aiRun.test.ts](tests/aiRun.test.ts) drives the orchestration with fake models and checks that private student work never reaches the cloud model, even when the device run fails.

## Try it

### Any browser or phone, about two minutes

1. Open <https://marking-assistant-1.ai.studio> and choose **Explore live sample**. Every script in the sample is fictional.
2. In the sample banner, press **Allow cloud AI**.
3. Open **Script 001** and press **Suggest marks (Hybrid AI · sample)**. A badge shows whether it ran on this device or in the cloud, and how long it took.
4. Press **Compare second opinion**. The app shows the exact payload before anything is sent.
5. Open **Sample rubric** and run **Audit rubric quality (Cloud AI)**, or **Sample class picture** and run **Draft teaching plan (Cloud AI)**.
6. Open **AI inspector** (in the sidebar, or under **Settings** on a phone) to see each request, its routing policy, where it ran and how many bytes went to the cloud.

### Desktop Chrome with Gemini Nano: the private path

Chrome's on-device model needs a desktop or laptop with 22 GB of free disk space, and either a GPU with more than 4 GB of memory or 16 GB of RAM and 4 CPU cores.

1. Open **Settings → On-device AI** and press **Set up text AI**. Press **Set up photo AI** as well to transcribe handwriting.
2. Turn the network off. The top bar shows **Offline**.
3. Under **Scripts**, paste or upload an answer from [`marking-test-pack/`](marking-test-pack/), assign a rubric and press **Suggest marks on this device**.
4. Open **AI inspector** and press **Run on this device** to mark the benchmark set offline.

## Evidence: AI inspector and marking benchmark

The **AI inspector** lists every AI request in the session: the routing policy, where the request actually ran (from the SDK's `response.inferenceSource`), how long it took and how many bytes went to the cloud. It stores timings and sizes only. Prompts, answers and replies are never logged.

The same page runs a marking benchmark on 25 fictional typed answers across 5 rubrics from [`marking-test-pack/`](marking-test-pack/). Each answer has reference marks, and the set includes a prompt-injection answer and an off-topic answer for every rubric.

| Run | What it does | Student answers sent to the cloud |
| --- | --- | --- |
| **Run on this device** | Marks every script through the private `ONLY_ON_DEVICE` path | None |
| **Run with cloud brief** | The cloud model writes key points from each rubric alone, then every script is marked on the device | None |
| **Run in cloud** | Cloud-only baseline. It accepts only the IDs of bundled fictional answers | The fictional answers |

Each run reports criterion marks matching the reference, script totals within one mark, suggestions that pass the evidence check, prompt-injection answers held to 0–1 marks, off-topic answers given 0, median and 95th percentile time, and data sent to the cloud. Results can be copied as a Markdown table or downloaded as JSON.

### Results

<!-- RESULTS: run all three benchmarks in the AI inspector (Full run), press "Copy as Markdown", and replace the paragraph below with the table. Add the machine and Chrome version. -->

First Quick run on the development laptop (Chrome 157, 25 November 2026): all 10 scripts were marked on the device, with a median of 18.8 s per script and 0 B sent to cloud AI. The cloud-brief and cloud-only columns have not been published yet.

Reference marks are the test pack author's guide, not ground truth.

## Safeguards

- **Evidence check.** A suggested mark can be accepted only when its quote appears word for word, exactly once, in the transcript. The one exception is a zero with no quote to give. Anything else shows **Evidence needs review**, and the lecturer marks that criterion by hand.
- **The lecturer decides.** AI output is always a suggestion. Nothing is finalised without the lecturer.
- **Payload preview.** Every cloud-only request, and the marker key points request, shows the exact JSON before it is sent.
- **Small groups are left out.** A teaching plan needs at least 10 finalised scripts. A criterion is sent only when at least 3 students lost marks on it and at least 3 got full marks.
- **App Check.** Cloud AI calls use reCAPTCHA Enterprise with limited-use tokens.
- **Remote kill switch.** Before each cloud request the app needs `allow_cloud_ai = true` fetched from Firebase Remote Config within the last five minutes. The built-in default is off, and a failed fetch blocks the request.

## What is stored where

- **The workspace stays in the browser.** Projects, rubrics, photos, transcripts, marks and feedback are saved in IndexedDB. No account is needed.
- **Submission links are the exception.** A lecturer who signs in can publish a `/submit/:linkId` form. What students send through it (name, ID, answers, an attached image) is stored in the lecturer's own Firestore dropbox, locked down by [firestore.rules](firestore.rules), until the lecturer deletes it. Deleting a link deletes every submission received through it.
- **Importing a submission** copies it into the browser workspace and leaves the original in the dropbox. Suggested marks the lecturer saves on a submission are stored with it.
- **Nothing in the dropbox is sent to cloud AI.** Students cannot write marks, suggestions or scores. Marking runs on the lecturer's device.

More detail is in [security_spec.md](security_spec.md).

## Limits

- **Private AI marking needs desktop Chrome with Gemini Nano.** On phones and other browsers the lecturer can capture, mark manually and export feedback, and can try the AI on the fictional sample through the cloud.
- **On-device marking is slower per script than a cloud call.** The benchmark reports both.
- **Suggested marks can be wrong.** That is why every one carries its evidence and the lecturer sets the final mark.
- **Web only.** There is no Android or iOS build.

## Firebase services used

| Service | Role |
| --- | --- |
| Firebase AI Logic | Hybrid inference in all four modes, structured JSON output, `inferenceSource` for provenance |
| App Check | reCAPTCHA Enterprise with limited-use tokens on cloud AI calls and on the public submission page |
| Remote Config | `allow_cloud_ai`, the remote switch for all cloud AI |
| Authentication | Email and password sign-in, needed only to publish submission links |
| Cloud Firestore | The optional submission dropbox |

## Where to look in the code

| File | What it holds |
| --- | --- |
| [src/domain/aiRouting.ts](src/domain/aiRouting.ts) | The routing policy: which mode each task gets, and why a request is blocked |
| [src/domain/aiRun.ts](src/domain/aiRun.ts) | Device-first and cloud-first orchestration, with the fallback rules |
| [src/ai/firebase.ts](src/ai/firebase.ts) | Firebase AI Logic calls, App Check and the Remote Config gate |
| [src/domain/aiLog.ts](src/domain/aiLog.ts) | The session log behind the AI inspector |
| [src/domain/benchmark.ts](src/domain/benchmark.ts) | Benchmark scoring |
| [src/features/Inspector.tsx](src/features/Inspector.tsx) | The AI inspector page |
| [tests/](tests/) | Routing, privacy boundary, evidence check, small-group suppression and benchmark scoring |

## Run locally

Use Node.js 24 and npm. Manual marking, file import and the offline workspace work without any cloud keys.

```bash
npm ci
```

```bash
npm run dev
```

Tests, typecheck with Firestore rules lint, and the production build:

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build
```

`npm run benchmark:pack` rebuilds the benchmark fixture from the test pack.

### Connect your own Firebase project

The committed `firebase-applet-config.json` targets project `gen-lang-client-0769662723`. The default cloud model is `gemini-3.5-flash-lite`.

1. **App Check.** Register the web app with a reCAPTCHA Enterprise site key. Put the key in `VITE_FIREBASE_APP_CHECK_SITE_KEY` in `.env.local` (copy `.env.example`), or in `recaptchaSiteKey` in `firebase-applet-config.json`. Without a site key, cloud AI stays off.
2. **Remote Config.** Publish the Boolean parameter `allow_cloud_ai = true`.
3. **Settings.** Open `/settings` and turn **Allow cloud AI** on.
4. **Local App Check debug token.** On `localhost`, set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` in the DevTools console before the first cloud call, then register the printed token in the Firebase console. Never commit debug tokens.

Full steps are in [HACKATHON_SETUP_GUIDE.md](HACKATHON_SETUP_GUIDE.md).

## Licence

Apache 2.0. See [LICENSE](LICENSE). The two bundled fonts are self-hosted, and their licences are under [public/licenses](public/licenses).
