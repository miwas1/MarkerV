# Devpost submission text

Text for the #BuildHybridAI 2026 form. Paste each section into the matching field.

**Confirm before pasting:**

- The "Built during the submission period" section says no code existed before 11 November 2026. Change it if any did.
- The tools list names Google AI Studio, Google Antigravity and Claude Code. Add or remove tools so it matches what was used.
- State where the three landing-page illustrations in `src/assets/images/` came from.
- Replace the benchmark sentence under "What it does" once the full run is in the README.
- "Limits" says no lecturer outside the team has trialled it. If one has, replace that line with their role and what they said.

## Short fields

| Field | Text |
| --- | --- |
| Name | Marking Assistant |
| Tagline | AI help with marking, without sending student work to cloud AI. |
| Platform | Web (Chrome) |
| Live URL | <https://gen-lang-client-0769662723.web.app> |
| Repository | <https://github.com/miwas1/MarkerV> (Apache 2.0) |
| Video | Add the YouTube link |

## About the project

### The problem

Lecturers have hundreds of scripts to mark, and AI could help. But universities including York, Liverpool, King's College London, UCL and Melbourne restrict or forbid uploading student work to AI tools, for data protection and because students own their work. The tools that could save the most marking time are off-limits. The policy links are in `PROJECT.md` in the repository.

### What it does

Marking Assistant is a marking workspace for university lecturers. Gemini Nano 4, running inside the lecturer's own Chrome, reads each student script and suggests a mark for every rubric criterion. Each suggestion quotes the words in the answer that earned it, and the lecturer accepts or changes every mark.

- **Rubrics.** Paste one, upload a TXT, DOCX or PDF file, or photograph a printed mark scheme.
- **Scripts.** Phone photos of handwritten pages, PDF, DOCX or TXT files, pasted answers, or an optional submission link for students.
- **Suggested marks with evidence.** A mark can be accepted only when its quote appears word for word, exactly once, in the answer.
- **Feedback and practice.** Per-criterion feedback and oral follow-up questions, exported as a file the student opens to practise the criteria where they lost marks.
- **Class picture.** Which criteria the class missed most, with an optional teaching plan drafted from counts alone.
- **Results and export.** A marksheet CSV, a moderation and audit log, a ZIP of every student's feedback and an oral viva sheet.
- **AI inspector.** A session log of every AI request (routing policy, where it actually ran, time, bytes sent to the cloud) and a marking benchmark on 25 fictional answers with reference marks.

On a 10-script quick run of the benchmark, the cloud baseline matched the reference mark on 83% of criteria. The on-device run marked all 10 scripts with 0 bytes sent to cloud AI, at a median of 18.8 seconds per script.

### How Firebase AI Logic is used

Every AI call in the app goes through the Firebase AI Logic Web SDK (`firebase/ai`). The inference mode is chosen by what the request contains, not only by whether a device model is available.

| Mode | Used for |
| --- | --- |
| `ONLY_ON_DEVICE` | Anything that contains student work: transcribing a script, suggesting marks, drafting feedback, replying to a practice answer. There is no cloud fallback. Without a device model the lecturer marks by hand. |
| `PREFER_ON_DEVICE` | Drafting a rubric, reading a photographed mark scheme, and everything in the fictional demo. |
| `PREFER_IN_CLOUD` | Key points for the marker, written from the rubric alone. The device model takes over when cloud AI is off, offline or fails. |
| `ONLY_IN_CLOUD` | Rubric audit, class teaching plan from counts, a second opinion on a fictional script, and the benchmark's cloud baseline. The exact JSON payload is shown before it is sent. |

The part that goes beyond the standard fallback pattern is the direction of travel. The cloud model reads only the rubric and writes key points for each criterion. The on-device model then marks private scripts with those key points beside it. Capability moves down to the device, and no student data moves up.

The routing policy is a pure function with tests (`src/domain/aiRouting.ts`). A second set of tests drives the orchestration with fake models and checks that private student work never reaches the cloud model, even when the device run fails. The app reads `response.inferenceSource` on every reply to record where the request actually ran.

Other Firebase services:

- **App Check** with reCAPTCHA Enterprise and limited-use tokens on every cloud AI call and on the public submission page.
- **Remote Config** as a remote switch: each cloud request needs `allow_cloud_ai = true` fetched within the last five minutes, and a failed fetch blocks the request.
- **Authentication** (email and password) for the lecturer workspace.
- **Cloud Firestore** for the optional submission dropbox, locked down by security rules.

### Value

A lecturer gets a second reader for every script that shows its evidence, without breaking the university's rule on student work. A department gets a remote switch for cloud AI. Students get feedback tied to the criteria and a way to practise them.

### Limits

- Private AI marking needs desktop Chrome with Gemini Nano 4. On phones and other browsers the lecturer can capture, mark by hand and export, and can try the AI on the fictional demo through the cloud.
- On-device marking is slower per script than a cloud call.
- Suggested marks can be wrong, which is why each one carries its evidence and the lecturer sets the final mark.
- Web only. There is no Android or iOS build.
- No lecturer outside the team has trialled it yet.

## Built during the submission period

The whole project was built during the submission period. The project brief (`PROJECT.md`) is dated 23 November 2026 and the first commit is dated 25 November 2026. No code existed before 11 November 2026.

- **Tools:** Google AI Studio for the first scaffold and the Firebase project, and the AI coding assistants Google Antigravity and Claude Code for implementation, tests and documentation.
- **Open-source libraries:** Firebase JS SDK, React, React Router, Vite, TypeScript, zod, pdf.js, JSZip and lucide-react. The Inter and Source Serif 4 fonts are self-hosted with their licences in `public/licenses`.
- **Test data:** every script, name and mark in `marking-test-pack/` and in the demo is fictional and was written for this project.

## Testing instructions

**Any browser or phone, about two minutes, no account:**

1. Open <https://gen-lang-client-0769662723.web.app> and choose **Try interactive demo**. Every script is fictional.
2. In the banner at the top of the demo, press **Allow cloud AI**.
3. Open **Script 001** and press **Refresh suggestions (Hybrid AI · sample)**. A badge shows where it ran and how long it took. The first cloud request can take 10 to 20 seconds while App Check verifies the browser.
4. Press **Compare second opinion** to see the payload preview before a cloud-only request.
5. Open **AI inspector** to see each request, its routing policy, where it ran and the bytes sent to the cloud.

**The lecturer workspace** needs a sign-in. Choose **Sign in to workspace**, then **Create an account**, with any email address and a password of at least 6 characters. No verification email is sent.

**The private on-device path** needs desktop Chrome with 22 GB of free disk space, and either a GPU with more than 4 GB of memory or 16 GB of RAM and 4 CPU cores:

1. In `chrome://flags`, enable **Gemma 4 for Built-in AI** and relaunch Chrome.
2. Open **Settings → On-device AI** and press **Enable on-device AI**.
3. Sign in, add a rubric and an answer from `marking-test-pack/`, turn the network off and press **Suggest marks on this device**.
4. Open **AI inspector** and press **Run on this device** to mark the benchmark set offline.
