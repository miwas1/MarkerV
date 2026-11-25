# Marking Assistant implementation plan

> **Historical document:** This was the initial pre-build planning specification written before implementation. For the current architecture, 3-tier Firebase AI Logic routing policy, security model, and setup instructions, see [README.md](README.md), [HACKATHON_SETUP_GUIDE.md](HACKATHON_SETUP_GUIDE.md), and [security_spec.md](security_spec.md).

**Mobile-first web app · #BuildHybridAI 2026 · 23–30 November 2026**

Build a marking workspace for university lecturers that starts at the phone camera. A lecturer can photograph a handwritten script, check that it is readable, and save a private draft before setting up a rubric. On the phone they can transcribe and mark it manually, or move the photo to a compatible Chrome desktop for private AI transcription and evidence-backed marking. The lecturer decides each mark, edits the feedback, and prepares an oral follow-up. Students can open their released feedback and practise a weak criterion on their phones.

**Ship target:** Have the real phone-to-desktop workflow ready for rehearsal by Friday 27 November. Add the sample walkthrough and package the Web submission by Monday 30 November at **1:00 PM WAT**. Devpost closes at **11:00 PM WAT (2:00 PM PST)** that day. [Devpost overview](https://firebasehybridaihackathon.devpost.com/) · [Official rules](https://firebasehybridaihackathon.devpost.com/rules)

## 1. What ships

| Priority | Deliverable | Done when |
| --- | --- | --- |
| P0 | Mobile capture and private handoff | On a phone, a lecturer can take a photo, inspect and retake it, then save a draft locally and keep capturing. They can export a cleaned JPEG and import it on a desktop without a Marking Assistant account, cloud upload, or shared workspace. |
| P0 | Lecturer marking workflow | From phone or desktop, a lecturer can transcribe or paste an answer, attach a rubric, score each criterion and finalise the script. Compatible desktop Chrome adds private transcription and evidence-backed suggestions to the same review flow. |
| P0 | Rubric and feedback | The lecturer can draft or manually create a rubric, review each scoring level, lock a version, and edit criterion feedback before release. |
| P0 | Oral follow-up and student practice | The lecturer can edit three criterion-based questions, using desktop AI or rubric-authored prompts. The student can open released feedback on a phone and complete a short guided typed practice session. A compatible desktop adds adaptive follow-ups. |
| P0 | Class picture and privacy controls | Any device shows counts from its own finalised reviews. Where eligible, the lecturer can request an optional teaching summary from aggregate counts. The cloud switch and result provenance work throughout the private workspace. |
| P1 | Workflow extensions | A lightweight oral session record, a local decision-history view, batch export, and optional account-based rubric sync via Firebase Auth and Firestore. Start these after the product and submission gates. |
| Later | Institutional rollout | Spoken input, consistency checks across scripts, multi-marker collaboration, PDFs and multi-page import, paired device transfer, moderated feedback delivery, and native apps. |

### Decisions from the project brief

- Ship one Web app. The priority mobile targets are Android Chrome and iPhone Safari for capture, manual marking, and feedback. Firebase AI Logic’s current on-device Web SDK requires compatible desktop Chrome. Offer a desktop handoff at the point where the lecturer asks for AI assistance. [Firebase Web setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started) · [Chrome setup and hardware](https://developer.chrome.com/docs/ai/get-started)
- Keep student work out of cloud inference. Private borderline scripts get a local review flag and manual second review. The real product uses cloud AI for eligible class summaries. The separate sample can demonstrate a cloud second opinion on a repository-owned fictional script. [Project brief](PROJECT.md)
- Keep the MVP local-first and account-free. Firebase AI Logic, App Check, Hosting and Remote Config support the product. A student opens a feedback file shared through the lecturer’s approved channel. Defer Auth and Firestore sync to P1, starting with lecturer-owned rubrics.

## 2. UI specification

### Visual direction

Use a restrained academic workspace with ivory paper, deep navy text and one teal action colour. The transcript, rubric and marks carry the visual hierarchy. Use a single self-hosted Inter family for controls and body copy, a self-hosted Source Serif 4 for answer text, and tabular numerals for marks. Serve the fonts with the app shell, include their licence files, and provide system font fallbacks. Use a 4 px base spacing unit, 12–16 px panel radii, 1 px dividers, and a small shadow for floating controls and dialogs.

| Role | Starting value | Use |
| --- | --- | --- |
| Canvas / paper | `#F6F5F0` / `#FFFFFF` | Shell and reading surface |
| Ink / secondary text | `#172630` / `#4F606C` | Titles, body text, and supporting labels |
| Primary | `#115E59` on white or white on `#115E59` | Main actions, links and selected states |
| Borders / focus | `#D8DDD8` / `#0B6F9C` | Panel divisions and a 2 px focus ring with offset |
| Evidence | `#FFF1C2` with dark ink | Selected passage accompanied by the criterion label |
| Inference source | Teal for **On this device**, indigo for **Cloud**, neutral for **Sample result** | Icon and text together. Example `On this device · 2.4 s`. |

Use a 28–32 px page heading, 18–20 px panel headings, 16 px mobile controls and 17 px transcript text at about 1.6 line height. Keep reading lines near 65–75 characters on wider screens. Use plain operational copy and a single primary action per screen. Give the captured page most of the phone viewport, with inspection controls close to the photo and the primary action within thumb reach.

### Screen flow

| Screen | Layout and primary interaction | Required states |
| --- | --- | --- |
| Start `/` | Open the real workspace by default. On phones, lead with **Take photo** and offer **Choose photo** and **Paste answer**. Returning lecturers can resume their last draft. On desktop, surface **Import captured photo** next to the queue. Place **Try sample** as a secondary link. | Empty queue, saved drafts, storage errors and capability information shown where needed. Capture and manual work open directly. |
| Capture `/workspace/capture` | Open the system camera with one tap. After capture, show a full-width page preview with rotate, crop and zoom, plus **Retake** and **Save draft**. After save, offer **Take another photo** and **Open draft**. | Cancelled capture returns to intake. Handle permission denial with **Choose photo**, decode failure with a retake or file choice, low storage with retry or export, and blurry or clipped pages with a visual check before save. |
| Workspace `/workspace` | On phones show a list with script ID, status and final mark. Keep **Take photo** within easy reach. Desktop adds queue columns. Use **Scripts**, **Rubric** and **Class picture** navigation. | Unassigned capture, draft, ready to review and finalised. A capture can be saved first, then assigned to a rubric before review. Display local save status and a visible retry. |
| Rubric `/workspace/rubric` | Question and optional rough scheme above editable criterion cards. Each card shows title, maximum and the description for each possible mark. Use **Draft rubric** and then **Use this rubric** after validation. | Manual form, generating, invalid total, missing scoring levels and locked version. Show the impact of editing a rubric already in use. |
| Script `/workspace/scripts/:id` | On phone, use **Answer / Review** tabs and single-column criterion cards with touch-sized score controls. Keep the current total and **Finalise marks** in a sticky footer. A captured draft offers **Mark manually** and **Export photo for desktop**. Widen into a split view on desktop. | Import rejection, rubric unassigned, transcription needs review, generation failure, missing evidence, edited mark, save failure and finalised. Preserve draft inputs when switching views. |
| Desktop handoff | **Export photo for desktop** previews the cleaned image and saves it with an anonymous filename. Show how to move it using a supported direct transfer method, then open **Import captured photo** on desktop and assign its rubric. | Download cancelled, export saved, transfer pending outside the app, duplicate import and invalid file. Confirm successful import on the receiving device. |
| Feedback and oral prep `/workspace/scripts/:id/feedback` | Summary of final marks, editable feedback per criterion, and an **Oral follow-up** tab with three question cards, scoring cues and a regenerate action per set. **Preview student feedback** opens the release view, then **Export feedback** saves a file. | Generating, edited draft, source script or mark changed, preview and export error. Reopening marks invalidates the current feedback and oral draft until reconfirmed. |
| Class picture `/workspace/class` | Horizontal bars ranked by share below full marks. Each row shows count and denominator. **Draft teaching summary** previews the eligible aggregate payload, then requests a short commentary. | No finalised scripts, limited sample size, no eligible cloud rows, cloud off, quota error and ready. Local counts stay visible in every state. |
| Student `/practice` | Open a local feedback file or the built-in sample. Start with final marks and what to work on. Show one question at a time, a typed input, turn count and a short end summary with self-check guidance. | Invalid file, empty response, model unavailable with a rubric-guided mode, retry without lost input, and a complete session. |

### Phone capture and review

```text
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ ‹ Scripts      Review photo  │  │ ‹ Scripts         Script 003 │
│                              │  │ Answer     Review            │
│       [ Handwritten page ]   │  │                              │
│                              │  │ C2 · Thread                  │
│    Rotate     Crop     Zoom  │  │ Select marks                 │
│ Check that every line is     │  │  [ 0 ]   [ 1 ]   [ 2 ]       │
│ readable before saving.      │  │                              │
│                              │  │ 2 of 3 reviewed      2 / 6  │
│   Retake     [ Save draft ]  │  │      [ Finalise marks ]      │
└──────────────────────────────┘  └──────────────────────────────┘
```

- Build the single-column layout first. Keep the sticky footer clear of phone safe areas and the on-screen keyboard, and preserve the user’s scroll position across the photo, transcript and review views. On wide displays, show a flexible reading pane and a 380–420 px criteria pane. From 1280 px, add a roughly 200 px queue. An evidence quote opens or scrolls the transcript to the exact passage, with a clear return action on phones. Check 360, 390, 768, 1024 and 1440 px, plus 200% zoom on desktop.
- Use keyboard-operable tabs and score controls. Keep focus visible and restore it after dialogs and evidence jumps. Announce save status, generation completion and blocking errors through status regions. Meet WCAG AA contrast for text and meaningful controls, make key touch controls at least 44 px, and respect reduced motion.
- Confirm **Saved on this phone** or **Saved on this computer** only after the local write succeeds. Disable finalisation until all criterion scores have been reviewed. Show AI setup and progress next to the relevant action, keep work visible during generation, and provide cancellation and a manual fallback. For unavailable cloud actions, explain the reason beside the action and preserve the local result.

## 3. Technical architecture

Use React, TypeScript and Vite for the SPA, React Router for navigation, CSS custom properties for the design tokens, Zod for runtime payload validation, and IndexedDB for local records. Precache the versioned product shell with a service worker and load the sample route and its assets on demand. Deploy the SPA with Firebase Hosting rewrites and use a pinned Firebase JS SDK **13.x** release verified on day one. Pin the cloud model to `gemini-3.5-flash-lite` through `inCloudParams.model`. Use the Firebase AI Logic Gemini Developer API backend with App Check enforced. [Firebase Web setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started) · [Inference configuration](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options) · [Supported models](https://firebase.google.com/docs/ai-logic/models) · [Hosting configuration](https://firebase.google.com/docs/hosting/full-config)

| Module | Responsibility |
| --- | --- |
| `src/ai/` | Single Firebase AI Logic adapter, purpose-specific request builders and schemas, local queue, cloud policy and result provenance. |
| `src/domain/` | Capture validation, rubric versions, transcript revisions, evidence anchoring, marking state transitions, totals, class aggregation and feedback export contracts. |
| `src/storage/` | Versioned IndexedDB stores, private and sample namespaces, transactional saves, export/import, and deletion. |
| `src/features/` | Camera intake and transfer, assessment queue, rubric, review, feedback and oral prep, class picture, and student practice. |
| `src/ui/` | Shared shell, tabs, dialogs, evidence panel, score control, source label and status messages. |
| `src/demo/` | Optional sample route using the product screens, with fictional source material and labelled bundled outputs in a separate session. |
| `probe/` | Existing direct Chrome diagnostics for model availability, input quality, latency and schema behaviour. All application inference goes through `firebase/ai`. [Probe instructions](README.md#running-the-probe) |

### Mobile capture and offline handoff

1. Start with a native file input using `accept="image/*"` and `capture="environment"` for **Take photo** and a separate file input for **Choose photo**. Treat rear-camera launch as a browser hint and verify the actual picker on Android Chrome and iPhone Safari. Keep the intake screen intact if capture is cancelled. [W3C HTML Media Capture](https://www.w3.org/TR/html-media-capture/)
2. Decode locally, correct the displayed orientation, allow crop and rotation, and re-encode the reviewed image as JPEG to strip source metadata. Use 20 MB as the initial input limit and a 2,000 px maximum long edge for the output. Check that typical handwriting remains readable after compression and allow retakes. When the browser cannot decode a format such as HEIC, offer direct capture or a JPEG/PNG from the picker. Store the processed photo in IndexedDB and free temporary preview URLs when leaving the screen.
3. **Export photo for desktop** saves only the processed JPEG with an anonymous filename. The phone draft remains available. Document a tested direct transfer method for each supported device pair, such as USB file transfer or AirDrop where supported. Ask the lecturer to choose a local, non-synced file destination. The app saves a file and confirms import only after the receiver opens it. The MVP uses one-way photo handoff. Rubrics, transcripts and marks stay in the browser where they were created. Complete the review on the device where it starts.
4. On desktop, validate the image before saving and let the lecturer attach it to an assignment. Detect an identical file already imported into that assignment and offer to open the existing draft, with an explicit choice to create another when intended. Preserve the phone copy during failed or cancelled imports. Once the product shell is cached, capture, export, import and manual review remain available offline. Device AI also needs its initial model download.

### Inference and data routing

| Action | Firebase AI Logic mode | Request data and fallback |
| --- | --- | --- |
| Camera, local save, photo handoff, manual grading and guided practice | Browser only | All input stays in the active browser profile or an explicitly exported local file. These actions require neither model availability nor sign-in. |
| Private rubric draft | `ONLY_ON_DEVICE` on supported desktop Chrome | Question and lecturer-entered scheme. Keep the full manual editor on phones and other unsupported devices. |
| Photo transcription, marking suggestions, feedback drafts, oral questions and adaptive practice | `ONLY_ON_DEVICE` on supported desktop Chrome | Only the relevant image, confirmed transcript, rubric, marks or bounded practice turns. Phone users can do manual transcript and grading, write feedback, and use criterion prompts and self-checks. |
| Class teaching summary | `ONLY_IN_CLOUD` | Send only approved whole-cohort rows with criterion ordinals and aggregate counts. Join criterion titles locally. With cloud off, keep the chart and show a locally computed priority list. |

- On app setup, check text and image availability independently. From an explicit **Set up on-device AI** click, run `initializeDeviceModel()` and expose download progress. Run text-only `generateContent()` separately from the multimodal path. Use inline JPEG/PNG input, structured output and single-turn calls. Record `result.response.inferenceSource` and elapsed time measured around generation. If source metadata is absent, display **Source unavailable** and flag the run for verification. [Firebase Web setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started) · [Chrome setup and hardware](https://developer.chrome.com/docs/ai/get-started)
- The cloud adapter exposes named operations with no generic free-text argument. The class action builds its payload from validated finalised reviews. Before every eligible cloud action, require cloud enabled locally and a fresh permitting `allow_cloud_ai` Remote Config value. Default to off until a valid config is activated. Refresh at cloud entry using a bounded TTL and deny calls when offline, stale or unconfirmed. Turning cloud off immediately stops new dispatches and discards late results. The settings copy explains that the toggle controls AI requests and a previously dispatched request may finish. [Remote Config Web setup](https://firebase.google.com/docs/remote-config/web/get-started)
- Register the hosted domain with the reCAPTCHA Enterprise App Check provider. Use registered debug tokens from a private local setup, outside source, hosted builds and video. Defer App Check provider loading to cloud entry where feasible and confirm in the spike that private calls work without network after setup. Disable analytics, remote error capture and request-body logging for the MVP. [Firebase App Check for AI Logic](https://firebase.google.com/docs/ai-logic/app-check)
- Keep script text, photo bytes, source evidence, student identifiers, feedback, and practice replies in the active browser unless the lecturer explicitly exports a photo or feedback file. Use generated script IDs in the queue and offer local redaction before transcript confirmation. Show the photo intentionally through the **Photo** tab during review because the page may contain a name.
- For real cohorts, enable cloud commentary only for the whole assignment after at least 10 finalised scripts. Suppress rows when either full-mark or below-full-mark group has fewer than 3 scripts. Send criterion ordinals, eligible totals and below-full-mark counts. Validate numeric ranges and prohibit subgroup filters, labels, individual marks and previous snapshots in requests. Show the exact payload before each send. Treat this as data minimisation, with no claim of formal anonymisation. A lecturer can always use the local chart.
- Host versioned static assets and fonts. The service worker caches a scoped list of same-origin app assets and skips AI, config and user-data requests. Persist the private workspace within its browser profile. Give users a way to delete an individual script or clear all local data. If P1 sync ships, validate ownership and allowed rubric fields in Firestore Rules and test denial of cross-account access. [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

### Data and marking contracts

| Record | Invariants |
| --- | --- |
| `RubricVersion` | Stable assignment and criterion IDs, question, ordered criteria, integer maxima, and a description for every possible score. The total is derived. The first attached review freezes its version. |
| `Script` | Opaque local ID, input type, optional cleaned local photo, optional rubric assignment until intake is complete, transcript revisions and review state. Preserve photo drafts on reload. Confirming an edited transcript creates a new revision. |
| `MarkSuggestion` | One record per known criterion, nullable integer score, bounded reason, optional exact quote, and provenance scoped to the confirmed transcript revision and rubric version. |
| `Review` | Separate suggested and final marks per criterion. Each final mark requires a human decision. The review total is computed from integer criterion marks. Reopening or switching versions invalidates downstream drafts and requires review before release. |
| `FeedbackExportV1` | Versioned local file containing the assignment title, approved final criterion marks, released feedback and practice cues. Default to omitting names, original answers, quotes, photos and examiner-only cues. Preview the full export and allow editing of copied text before release. Validate imports and render strings as plain text. |

**Model output handling.** Start with single-question assessments, up to six criteria, a 5,500-character transcript and one processed image per script. Adjust scope using real tests. Send prompts with the transcript in a clearly delimited data field and disallow following instructions found inside it. Validate the model JSON, criterion completeness, score bounds and quote matches against the confirmed transcript. Map exact quote matches to source offsets in app code. A missing or ambiguous quote gets a visible **Evidence needs review** state with manual scoring and passage selection. Show **No evidence found** when a valid response explicitly identifies an absent criterion. Never make a positive AI suggestion one-click acceptable without a verified quote. Quote validity establishes where text came from. The lecturer checks whether it merits the score.

**Review lifecycle.** Use `draft → ready for review → in review → finalised`. Queue one device request at a time and snapshot the transcript and rubric revisions when work starts. Discard results if the user cancels, edits the input or moves on and changes the relevant revision. On invalid output, allow one explicit retry on the same route. Keep accepted marks intact during retries. Save decisions and computed totals in one transaction, block duplicate finalisation, and confirm save success before navigating. Finalisation requires all criterion scores. Store fixed-size provenance metadata and keep generated content out of diagnostics. For interactive oral practice, replay a bounded transcript in each single-turn request and cap the session at three exchanges.

## 4. Delivery schedule

| Date (WAT) | Build sequence | Exit check |
| --- | --- | --- |
| **Mon 23** | Test camera intake on a real phone and start the mobile workspace shell. Start the desktop model download in parallel, run the probe, and reserve a compatible backup desktop if needed. | Phone opens its camera and shows a readable preview. Record desktop text and image readiness, Chrome version and hardware. |
| **Tue 24** | Build capture review, local draft save, photo export and desktop import. Start Firebase and spike `ONLY_ON_DEVICE` text and image calls with a phone-captured page. | Save, transfer and reopen a real capture on desktop. Confirm one real on-device result and repeat with the network disconnected after setup. |
| **Wed 25** | Complete mobile manual rubric and criterion review, then connect desktop transcription and suggestions to the same review code. Add evidence linking and offline shell support. | A lecturer can finalise a phone-only script and a desktop-assisted script. Both reopen after reload. A bad quote or stale result never appears as verified evidence. |
| **Thu 26** | Add feedback release, oral follow-ups, phone practice, local class aggregates and cloud commentary. Set up Remote Config and App Check on the Hosting preview. | Open released feedback on a phone and finish guided practice. Confirm cloud commentary on eligible test counts and inspect the request for permitted fields only. |
| **Fri 27** | Rehearse the real product on Android Chrome, iPhone Safari and compatible desktop Chrome. Polish camera recovery, touch controls, keyboard use, save states and the desktop reading view. | Product gate passes. Capture, transfer and mark a newly handwritten page in the normal workspace. Verify offline recovery and the real cloud summary. |
| **Sat 28** | Add the isolated `/sample` walkthrough using the shipped product screens. Include fixture results and the sample-only cloud comparison if time allows. Finish accessibility and privacy regression checks and deploy. | Main entry still opens the real workspace. A new visitor can complete the sample on a phone without a model or account. |
| **Sun 29** | Record and publish the video early. Finish the public repository, screenshots, README, Apache 2.0 licence, testing instructions and Devpost draft. | External viewer can open links, play the public video and launch the sample. Review the exact commit used in the recording. |
| **Mon 30** | Run the submission checklist and submit by 1:00 PM WAT. | Devpost confirms submission. Keep the judged build and access available through the judging period, 10–16 December PT. |

**Schedule fallback.** Keep building and testing phone capture and manual review while securing a compatible desktop. Treat genuine local AI runs as a requirement for the AI-assisted workflow and the hackathon submission. If time runs short, trim the walkthrough and sample-only second opinion first, followed by optional image controls. Protect camera capture, preview and retake, local drafts, photo handoff, manual marking, and the real desktop and cloud AI paths.

## 5. Verification and acceptance

| Test | Pass condition |
| --- | --- |
| Phone capture | On Android Chrome and iPhone Safari, launch the camera from the real workspace, capture a portrait and landscape page, retake, check orientation and readability, save, reload, and capture again. Test cancel, unavailable camera, picker fallback, large or undecodable files, and full local storage. Repeat capture after caching the app and going offline. |
| Private handoff | Export a processed JPEG from each tested phone, verify the anonymous filename and stripped metadata, and transfer it directly to a compatible desktop. Import it offline. Confirm repeated import, invalid file and cancelled transfer preserve the correct local draft state. |
| Phone-only review | From the real workspace, attach a rubric to a new photo, write a transcript, score all criteria and finalise on a phone with the network disabled. Reopen the draft during the process and confirm the final mark after reload. |
| Real hybrid inference | Chrome desktop runs genuine local AI marking through Firebase AI Logic on a photo from the phone. A live class-summary request succeeds with App Check and displays its observed cloud source. Repeat local marking with the network disconnected and the app prepared. |
| Privacy boundary | With a distinctive token in a fictional private script, photo, rubric and practice reply, inspect requests through capture, export, import, marking, reload, model errors and retry. Zero private payloads in requests, URL, remote logs or service-worker caches. Editing a sample or importing a file cannot reach the cloud adapter as free text. |
| Cloud switch | Local off and Remote Config off each block cloud routes. Expired config, offline, App Check rejection and quota errors produce actionable messages. Device-only actions remain available. |
| Review integrity | Test malformed JSON, duplicate IDs, out-of-range or missing scores, mismatched and repeated quotes, rapid double clicks, and edits while generation runs. Only the lecturer can set final scores, and reload restores committed totals and reviewed states. |
| Handwriting | Test at least three real photos of original fictional handwriting in varied lighting. Reviewers can correct transcripts before marking and recover from invalid and unreadable photos. Confirm anchors point into the edited transcript. |
| Model quality | Reuse the eight probe answers as developer references. Record parse validity, quote validity, per-criterion agreement, median/P90 latency and repeatability for two runs per answer. Report the sample size and who set the references. Release requires zero invalid quotes rendered as verified. Downgrade weak suggestions to manual review. |
| Feedback and practice | Import the exported file on a different browser profile. Verify approved content matches the final review, the learner can complete three practice turns or guided self-checks, and private text stays local. Reject corrupt or unsupported files safely. |
| Cohort results | Use fixed fixtures to assert exact counts, denominator, ordering and privacy suppression at boundaries. Verify drafts are excluded and a finalised script is counted once. Reject cloud commentary that changes or invents counts. |
| Usability | Ask two reviewers to capture a page, move it to desktop, locate evidence, override a mark and open feedback without guidance. Check touch targets with the keyboard open on phones, and keyboard-only review and 200% zoom on desktop. Fix blockers before recording. |
| Operational checks | Run typechecking, tests on validation and policy, a production build, and browser smoke tests for the real workspace. Verify setup instructions, recoverability on reload and hosted App Check. Then verify `/sample` from a clean browser profile and that it cannot read private records. |

## 6. Sample and submission

After the product passes rehearsal, add **Try sample** as a secondary link to `/sample`. Reuse the working screens with a preloaded queue of 12 fictional scripts and an original handwritten page. Keep all sample edits in a separate IndexedDB store and offer a reset. The sample works without sign-in or a model download. Bundled results say **Sample result** and show no inference time. Live actions show the source returned by Firebase AI Logic. [Probe fixtures](probe/samples.js)

If time allows, include **Compare second opinion** for one predefined borderline case. The cloud adapter accepts a known fixture ID and builds the request from the immutable question, rubric and answer. Preview the fictional payload before sending under the same cloud policy as the product. Show the differences alongside the reviewed marks. This comparison has no route from user-entered answers and cannot set final marks.

| Video time | Show |
| --- | --- |
| **0:00–0:30** | Open the real workspace on a phone, take a photo of a fictional handwritten script, verify the page and save the draft. Show the phone-to-desktop workflow in a short cut. |
| **0:30–1:25** | Import the exported photo on prepared desktop Chrome and use Firebase AI Logic with the network disconnected. Confirm the transcript, jump to evidence, change one score and finalise. |
| **1:25–1:55** | On an eligible class in the real workspace, preview the aggregate payload, run the cloud summary, and show that switching cloud AI off leaves the local chart available. |
| **1:55–2:35** | Show the lecturer’s oral follow-up questions, then open the released feedback on a phone and complete one guided practice turn. |
| **2:35–2:55** | Show the hosted workspace and the secondary sample link for visitors who want preloaded material. |

The recording covers all four judging criteria. Show the distinct source badges and real network-off run for **Technological Implementation**, a coherent end-to-end review for **Design**, a specific lecturer and student task for **Potential Impact**, and criterion-based oral follow-up for **Quality of the Idea**. Report timings as observations from the demo device if included. [Official judging criteria](https://firebasehybridaihackathon.devpost.com/rules) · [Devpost FAQ](https://firebasehybridaihackathon.devpost.com/details/faqs)

- [ ] Register on Devpost, check eligibility and employer consent if entering on behalf of an organisation, and add eligible teammates and the representative if applicable.
- [ ] Select **Web** and write the English description covering Firebase AI Logic, the marking workflow and the value for lecturers and students. Summarise work completed during the contest and disclose any incorporated pre-contest work where applicable.
- [ ] Publish the public GitHub or GitLab repository with an Apache 2.0 `LICENSE`, all source and assets, reproducible setup, and real calls to `firebase/ai`. Include the judged commit and any asset licences. Check the source, instructions, screenshots and video for secrets, debug tokens, production API keys and real student data.
- [ ] Publish the English video (or add English subtitles) on YouTube with public visibility and under three minutes. Link the tested real workspace, the optional sample route, and instructions for phone capture, direct photo transfer and desktop Chrome setup. Keep free judging access available through the end of judging. [Official submission requirements](https://firebasehybridaihackathon.devpost.com/rules) · [Build Session and resources](https://firebasehybridaihackathon.devpost.com/resources)
