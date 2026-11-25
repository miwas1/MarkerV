# Marking Assistant: project idea

*Working name. Entry for the #BuildHybridAI 2026 hackathon. Written 23 November 2026.*

## In one paragraph

Marking Assistant helps university lecturers mark students' work faster and more fairly, without sending the students' work to the internet. The lecturer photographs or pastes a student's answer, and the app suggests a mark for each part of the marking scheme. Each suggested mark comes with the exact words from the answer that earned it, and the lecturer accepts or changes every mark. Once a script is marked, the app writes short spoken follow-up questions (an oral exam) to check the student really understands their own answer. It also gives students private practice on the parts they lost marks on. The AI that reads student work runs on the lecturer's own computer, so the work stays private. A more powerful AI on Google's servers is used only for tasks that involve no names or student work.

---

## 1. The hackathon in brief

| | |
|---|---|
| **Name** | #BuildHybridAI 2026, run by Google Firebase on Devpost |
| **Deadline** | Monday 30 November 2026, 2:00 PM Pacific Time (11:00 PM in Nigeria). Fixed, no extensions. |
| **Prizes** | $30,000 total: $10,000 grand prize, $7,000 and $4,000 runners-up, $3,000 each for the best Web, Android and iOS app |
| **What must be built** | An AI app that uses **Firebase AI Logic** to run AI both **on the device** and **in the cloud** |
| **Platforms allowed** | Web (Chrome) or Android with Gemini Nano 4, or iOS with Apple's model. One platform is enough; more than one is favoured for the grand prize. |
| **Must submit** | A public GitHub or GitLab repository with an open-source licence, a demo video of 3 minutes or less on YouTube, and a written description. A live link is encouraged but optional. |

### Two words to understand: "on-device" and "cloud"

- **On-device AI** runs on the user's own laptop or phone. It is private (nothing leaves the device), free, works offline and responds quickly. It is a small model, so it is less capable, and it only works on newer devices. Here it is **Gemini Nano 4**, built into Chrome and some Android phones.
- **Cloud AI** runs on Google's servers. It is more capable and works on any device, but needs the internet, and the data leaves the device.
- **Hybrid** means the app uses both and picks the right one for each task. Firebase AI Logic does this switching for us: "use the on-device model if available, otherwise use the cloud", or "on-device only", per feature.

### How it is judged

Four criteria, equally weighted, each scored 1 to 5:

1. **Technological implementation:** how well it is built, and how well it uses on-device and cloud together. Ties are broken on this one first.
2. **Design:** whether it feels like a complete product, not a technical demo.
3. **Potential impact:** whether it solves a real problem for a real audience.
4. **Quality of the idea:** a creative, non-obvious use of hybrid AI, showing understanding of the problem.

Judges may score from the video alone, so the video must clearly show both kinds of AI working.

---

## 2. The problem

Marking is one of the heaviest and least loved parts of a lecturer's job, and students are often unhappy with the result. Research and university policies point to five specific problems.

1. **Lecturers are not allowed to paste student work into AI tools.** Universities including York, Liverpool, King's College London, UCL and Melbourne restrict or forbid uploading student work to AI systems. Their reasons are data protection and students' ownership of their work. So the AI tools that could save lecturers time are often off-limits for marking.
2. **Marking is inconsistent.** Marks drift as the marker tires, and a script is marked more harshly when it follows a very good one. Markers also tend to form an early opinion and then look for evidence to support it.
3. **Students don't understand how they are marked.** In the UK's 2025 National Student Survey, "clarity of marking criteria" scored lowest of the assessment questions (78.1% positive). Slow feedback is a recurring complaint.
4. **AI has made take-home work hard to trust.** Universities are bringing back oral exams and handwritten exams. Oral exams are hard to run for large classes because preparing good questions for each student takes time.
5. **Feedback often isn't used.** Feedback only helps if students understand it and act on it, and a mark with a comment rarely tells them what to practise next.

---

## 3. Who it is for

| User | What they get |
|---|---|
| **Lecturers and teaching assistants** | Faster, more consistent marking that respects their university's privacy rules, ready-made oral exam questions, and a view of what the whole class got wrong |
| **Students** | Clear feedback tied to each part of the marking scheme, and private practice on exactly what they lost marks on |
| **Departments and exam boards** (later) | A record of every AI suggestion and every human decision, for quality checks and appeals |

---

## 4. What the app does

### For the lecturer

1. **Set up the marking scheme.** Paste the question and the marking scheme, or a rough description. The app turns it into clear criteria, for example "C1: definition of osmosis, 2 marks", with what earns each mark.
2. **Add the students' answers.** Paste typed answers, or photograph handwritten scripts. Names are hidden while marking.
3. **Review suggested marks.** For each criterion the app shows a suggested mark, the exact words from the answer that justify it, and a one-line reason. The lecturer accepts or changes each one. The final mark is always the lecturer's.
4. **Get feedback drafts.** The app drafts short feedback for each student, linked to the criteria, for the lecturer to edit.
5. **Check borderline scripts.** For scripts near a grade boundary, a second opinion from the more powerful cloud AI is available, using the answer with the name and any identifying details removed.
6. **Prepare the oral exam.** For each marked script, the app writes three or four follow-up questions aimed at that student's weak or doubtful answers. During a real oral exam the lecturer asks them, taps a score, and the app drafts the record.
7. **See the class picture.** For example, "60% of the class missed criterion C2", so the lecturer knows what to re-teach.

### For the student

1. **Clear feedback page.** Their marks, criterion by criterion, with the reason for each.
2. **Oral practice.** The app asks questions on the criteria they lost marks on, then follows up on their answer, as a real examiner would. Typed answers by default; spoken answers where supported.

---

## 5. Where each part runs, and why

The rule is simple: **anything containing a student's work or name stays on the lecturer's computer.**

| Task | Runs on | Why |
|---|---|---|
| Reading and marking a student's answer | **Device only** | Student work never leaves the computer, which meets university privacy rules |
| Reading handwriting from a photo | **Device only** | Same reason |
| Hiding names | **Device only** | Same reason |
| Drafting feedback for a student | **Device only** | Contains the student's work |
| Writing oral exam questions for a student | **Device only** | Based on the student's script |
| Turning a rough marking scheme into clear criteria | **Device first, cloud if needed** | No student data involved |
| Second opinion on borderline scripts | **Cloud** | Needs the stronger model; only anonymised text is sent |
| Class-wide picture | **Cloud** | Only anonymised marks are sent, never answers |
| Student's own oral practice | **Student's device if possible, otherwise cloud** | It is the student's own choice to practise |

Two extra controls:

- **A "never use the cloud" switch** for universities with strict rules, which the department can turn on remotely (Firebase Remote Config).
- **A visible label on every action** showing whether it ran on the device or in the cloud, and how long it took. This shows judges the hybrid design working.

This split is the heart of the entry. The hackathon's own FAQ gives this exact pattern as its example: sensitive data on-device only, other features hybrid or cloud.

---

## 6. Features and the problems they solve

| Feature | Problem it solves |
|---|---|
| Student work stays on the lecturer's computer | Universities forbid uploading student work to AI tools |
| Marking scheme builder | Students find marking criteria unclear |
| Handwritten script reader | Universities are returning to handwritten exams |
| Suggested marks with quoted evidence | Markers form early opinions; quoted evidence keeps marks tied to what was actually written |
| Hidden names | Marks can be swayed by who the student is |
| Consistency check (flags a mark out of line with similar answers marked earlier) | Marks drift with tiredness and with the previous script |
| Second marker for borderline scripts | Borderline decisions are the least reliable, and moderation is slow |
| Feedback drafts per criterion | Feedback is slow |
| Class picture | Lecturers can't easily see what to re-teach |
| Oral follow-up questions per student | Oral exams are hard to scale; checks the student understands their own written answer |
| Student practice on weak criteria | Feedback is rarely acted on |
| Record of every suggestion and human decision | University policies that allow AI in marking require human oversight |

---

## 7. What we build for the hackathon, and what waits

Seven days is short, so the build is split into three tiers.

**Must have (the demo depends on these)**

- Marking scheme builder
- Typed answers and handwriting photos as input
- Suggested marks with quoted evidence, with names hidden
- Feedback drafts
- Oral follow-up questions for the lecturer
- Typed oral practice for the student
- Second marker (cloud) and class picture (cloud)
- On-device or cloud label on every action
- Sample-data mode, so judges without the on-device model can still try the app (cloud allowed, clearly labelled)

**If time allows**

- Spoken answers in oral practice
- Consistency check
- Record of suggestions and decisions

**After the hackathon**

- Checking a draft exam for badly written questions before it is set
- Several markers sharing one marking job
- An Android version

---

## 8. How it is built

| Part | Choice |
|---|---|
| Platform | Web app for **Chrome on desktop** (the on-device model is available there), which also opens on phones and other browsers using the cloud model |
| AI | **Firebase AI Logic** hybrid SDK: **Gemini Nano 4** on the device, a Gemini cloud model (default `gemini-3.5-flash-lite`) as the fallback |
| Security | **Firebase App Check** (required by the hackathon) |
| Sign-in | **Firebase Authentication** (lecturer and student accounts) |
| Data | **Firestore** for marking schemes, anonymised marks and class results; never answer text |
| Settings | **Firebase Remote Config** for the "never use the cloud" switch |
| Hosting | **Firebase Hosting** for the public demo link |
| Licence | Apache 2.0 open-source licence |

### Limits of the on-device model that shape the design

- It runs only in **Chrome on a desktop or laptop** (Windows, macOS, Linux, Chromebook Plus). It needs either a graphics card with more than 4 GB of memory, or 16 GB of RAM and 4 processor cores, plus 22 GB of free disk space.
- It handles **one request at a time with no memory of earlier ones**. For oral exams, the app resends the conversation so far with each question.
- It accepts **text and JPEG or PNG images**, not PDFs or audio. The app converts PDF pages to images, and spoken answers go to the cloud.
- Each request is limited to roughly **9,000 tokens** (about 6,000 to 7,000 words). One script or one question at a time fits easily.
- It can return **structured output** (JSON), so marks come back in a fixed format the app can check.

---

## 9. The 3-minute demo video

| Time | What it shows |
|---|---|
| 0:00–0:20 | The problem: a lecturer with a pile of scripts, and a university rule saying "do not upload student work to AI tools" |
| 0:20–1:10 | Marking a handwritten script with the internet switched off: suggested marks, quoted evidence, the lecturer changing one mark. The "on this computer" label is visible throughout. |
| 1:10–1:40 | A borderline script sent for a second opinion: the app shows the anonymised text that will be sent, and the label switches to "cloud" |
| 1:40–2:20 | Oral exam: follow-up questions generated for that student, and the student practising on a weak criterion |
| 2:20–2:45 | The class picture, and the "never use the cloud" switch |
| 2:45–3:00 | Who it is for and why it matters |

---

## 10. How it scores on each judging criterion

| Criterion | Why this entry is strong |
|---|---|
| Technological implementation | The on-device versus cloud split has a real reason (privacy rules), routing is visible on screen, and it works offline |
| Design | A complete flow from marking scheme to feedback to oral exam, for both lecturers and students |
| Potential impact | Universities everywhere mark; the privacy rules and student survey results are documented |
| Quality of the idea | Uses on-device AI as the answer to a real policy barrier, and connects marking to oral exams |

---

## 11. Competition and how we differ

- **Gradescope** (owned by Turnitin) already offers AI-assisted grading of handwritten work and is widely used. It runs in the cloud and is sold to institutions. We differ by keeping student work on the device, quoting evidence for each mark, and adding oral exams and student practice.
- **General chatbots** such as ChatGPT or Gemini can mark if a lecturer pastes work in, but that is exactly what many universities forbid.

The hackathon rules don't require a new kind of product. What counts is a good use of on-device and cloud AI together.

---

## 12. Risks and how we handle them

| Risk | How we handle it |
|---|---|
| **The on-device model is not yet running on our laptop.** Chrome reports it "unavailable", so we can't yet demo on-device marking. | First task: try the Chrome settings, or Chrome Canary, and check Chrome's diagnostics page. If it still won't run, borrow a newer laptop or a supported Android phone for the video. |
| Reading real handwriting may be poor | Test on real photos early. If needed, the demo uses neat handwriting and typed answers, and the app always lets the lecturer correct what it read. |
| AI marks could be wrong or biased | The app only suggests; the lecturer decides every mark, and every suggestion shows its evidence |
| Some universities ban AI in marking entirely | Present it as a marking aid with the lecturer in control, plus the "never use the cloud" switch |
| Seven days is tight | Build the "must have" list first and cut "if time allows" items without hesitation |
| Judges may not have the on-device model | Sample-data mode, a clear video, and the hosted link |

---

## 13. Plan to the deadline

| Day | Work |
|---|---|
| **Mon 23 Nov** (today) | Get the on-device model working on the laptop. Create the Firebase project. |
| **Tue 24 Nov** | App skeleton: sign-in, App Check, the hybrid AI connection, the on-device or cloud label |
| **Wed 25 Nov** | Marking scheme builder, answer input (typed and photo), suggested marks with evidence, hidden names |
| **Thu 26 Nov** | Feedback drafts, second marker, class picture |
| **Fri 27 Nov** | Oral follow-up questions and student practice |
| **Sat 28 Nov** | Design polish, sample-data mode, publish to Firebase Hosting |
| **Sun 29 Nov** | Record and upload the video (YouTube processing can take hours), write the description, tidy the repository |
| **Mon 30 Nov** | Submit by early afternoon Nigeria time, well before the 11:00 PM cut-off |

---

## 14. Before submitting

- [ ] Registered for the hackathon on Devpost
- [ ] Eligible: above the age of majority, not living in an excluded country, not a government employee; employer's consent if entering through Astrog Technologies
- [ ] Public repository with an Apache 2.0 licence visible on the repository page
- [ ] The code imports and calls Firebase AI Logic (naming it in the README is not enough)
- [ ] No App Check debug tokens, keys or `.env` files committed
- [ ] Demo video of 3 minutes or less, public on YouTube, in English, showing on-device and cloud working
- [ ] Description covering how Firebase AI Logic is used, the features and the value
- [ ] Only made-up student scripts in the demo and repository, never real students' work

---

## 15. Where we are now

- The idea, features and plan above are settled.
- A test page that measures what the on-device model can do on this laptop is built in [probe/](probe/). It has been checked with a fake model, but **the real model is not running in Chrome on this laptop yet**, so there are no real measurements.
- Next step: get the on-device model working, then run the test page, then start the app.

---

## Sources

- [Hackathon overview](https://firebasehybridaihackathon.devpost.com/), [official rules](https://firebasehybridaihackathon.devpost.com/rules), [FAQs](https://firebasehybridaihackathon.devpost.com/details/faqs) and [resources](https://firebasehybridaihackathon.devpost.com/resources)
- [Firebase AI Logic: hybrid inference on the web](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api) and [hardware requirements](https://developer.chrome.com/docs/ai/get-started)
- University AI marking policies: [York](https://www.york.ac.uk/about/ai/education/marking_and_feedback/), [Liverpool](https://www.liverpool.ac.uk/about/the-university/reports-policies-and-governance/ai-at-liverpool/policies-and-guidance/guidance-learning-teaching-and-assessment), [King's College London](https://www.kcl.ac.uk/about/strategy/learning-and-teaching/ai-guidance/ai-assisted-marking-and-feedback), [UCL](https://www.ucl.ac.uk/teaching-learning/generative-ai-hub/using-ai-tools-assessment), [Melbourne](https://www.unimelb.edu.au/ai/home/staff/teaching-and-learning/menu-items/assessment)
- [Loughborough: review of 16 UK university AI marking policies](https://blog.lboro.ac.uk/ai-education/?p=19)
- [Meadows and Billington: review of marking reliability](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/605569/0505_Meadows_and_Billington_CERP_RP.pdf)
- [University of Surrey: marking consistency](https://surrey.ac.uk/sites/default/files/2020-06/dhe-focus-marking-consistency.pdf)
- [QAA: National Student Survey 2025 insights](https://www.membershipresources.qaa.ac.uk/briefings/data-insights--nss-2025)
- Oral exams returning: [eWeek](https://www.eweek.com/news/colleges-turn-to-oral-exams-ai-disruption/), [WTOP](https://wtop.com/education/2026/04/perfect-homework-blank-stares-why-colleges-are-turning-to-oral-exams-to-combat-ai/), [EDUCAUSE 2026](https://library.educause.edu/resources/2026/6/2026-educause-the-impact-of-ai-on-learning-assessment-report), [Times Higher Education](https://www.timeshighereducation.com/node/745133)
- [Gradescope](https://turnitin.com/products/gradescope/)
