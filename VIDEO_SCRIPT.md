# Demo video: script and shot list

Target length **2:55**. The limit is 3:00, and the video must be public on YouTube, in English, and show on-device AI and cloud AI both working. Judges may score from the video alone, so every claim in the narration has to be visible on screen.

The narration is about 340 words, which leaves room to pause while the app works.

## Before recording

1. **Check the live URL serves this build.** The submitted URL is <https://gen-lang-client-0769662723.web.app>. Redeploy with the command in [HACKATHON_SETUP_GUIDE.md](HACKATHON_SETUP_GUIDE.md) after any change. The older AI Studio URL serves an earlier build, so do not show it.
2. **Finish Cloud AI setup** in the Firebase project (AI Logic, App Check, `allow_cloud_ai = true` in Remote Config) and turn **Allow cloud AI** on in Settings.
3. **Check on-device AI.** In `chrome://flags`, **Gemma 4 for Built-in AI** is enabled, which is how the hackathon FAQ says to turn on Gemini Nano 4, and `chrome://on-device-internals` shows the model. Settings → On-device AI shows **Ready** for text marking. The script below uses typed answers, so photo AI is not required.
4. **Sign in and build the demo project** from `marking-test-pack/1-BIO101-cell-biology/`:
   - Import `rubric/rubric.txt` and save it. Leave the key points empty for scene 4.
   - Add `scripts/09-paste-me.txt` (borderline answer) and `scripts/07-answer.docx` (prompt injection), and assign the rubric to both.
5. **Run all three benchmarks** in the AI inspector with **Full run** selected, so the results table is ready for scene 6. Each on-device run takes several minutes.
6. **Fill in the three blanks** in scene 6 from that table, and paste the table into the README.
7. **Load the app once online**, so the offline copy is cached before you turn the network off.
8. **Screen:** 1080p, browser zoom 110–125%, bookmarks bar hidden, one tab. Reload the page before recording so the AI inspector log starts empty.

## Script

| Time | On screen | Narration |
| --- | --- | --- |
| **0:00–0:15** Problem | A text card: "Do not upload student work to AI tools", with "University AI marking policies: York, Liverpool, KCL, UCL, Melbourne" beneath it. Then a pile of handwritten scripts. | "Lecturers have hundreds of scripts to mark, and AI could help. But many universities do not allow student work to be uploaded to AI tools. The tools that could save the most time are off-limits." |
| **0:15–0:30** Solution | The landing page, then the workspace with the BIO101 scripts listed. | "Marking Assistant keeps the marking on the lecturer's own computer. Gemini Nano 4, inside Chrome, reads and marks each script. The cloud model only sees requests with no student work in them. Firebase AI Logic routes every request." |
| **0:30–1:15** On-device, offline | Turn Wi-Fi off in the system tray. The top bar changes to **Offline**. Open the borderline script. Press **Suggest marks on this device**. Marks appear. Click one quote: **Find in transcript** highlights it. Change one mark. Point at the **On this device** badge and its time. Press **Finalise marks**. | "I'm turning the Wi-Fi off. This is a fictional student answer. I ask for suggested marks, and Gemini Nano marks it on this laptop. Each mark quotes the exact words that earned it, and the app refuses any quote it cannot find in the answer. I disagree with this one, so I change it. The final mark is always mine. The badge shows where it ran and how long it took." |
| **1:15–1:50** Cloud brief and fallback | Wi-Fi back on. Open **Rubrics**. Press **Draft key points**. The payload preview shows the rubric and nothing else. Send. Key points fill in, with a **Cloud** badge. Then turn Wi-Fi off, clear one key point and press **Draft key points** again: the notice now says on-device AI can draft them, and the badge reads **On this device**. | "Back online. A small model needs to know what to look for. So the cloud model writes key points for the marker, from the rubric alone. I see exactly what will be sent before it goes, and there is no student work in it. If the cloud is switched off or unreachable, the same button falls back to the device model." |
| **1:50–2:15** Routing and safeguards | Wi-Fi back on. **Settings → Hybrid AI routing**, showing the four modes. Then **Try interactive demo → Sample class picture → Draft teaching plan (Cloud AI)**: the payload preview shows counts only. | "Four Firebase AI Logic modes, chosen by what the request contains. Student work is device-only. For the class picture, only counts go to the cloud, and small groups are left out. App Check protects every cloud call, and a department can switch cloud AI off remotely with Remote Config." |
| **2:15–2:42** Evidence | **AI inspector**. First the session table: each request from this recording, its routing policy, where it ran, bytes sent. Scroll to the benchmark table with all three columns. | "The AI inspector logs every request: the policy, where it actually ran, and how many bytes left the device. It also benchmarks marking on 25 fictional scripts with reference marks. On this device alone, **[A]** of criterion marks matched. With the cloud brief, **[B]**. Cloud only, **[C]**. Student answers sent to the cloud in the hybrid run: zero." |
| **2:42–2:55** Close | The README routing diagram, then the app name and the repository URL. | "Marking Assistant. AI help with marking, without sending student work to cloud AI. Open source, built on Firebase AI Logic." |

## Lines that depend on your results

- **Scene 2, "Gemini Nano 4".** Say this only if `chrome://on-device-internals` shows Gemini Nano 4 on the recording machine. Otherwise say "Gemini Nano".
- **Scene 6, [A], [B], [C].** Read them from the row "Criterion marks matching the reference". If the cloud brief did not beat the plain on-device run, do not imply that it did. Say instead: "With the cloud brief, [B]. Cloud only, [C]. The on-device runs sent no student answers to the cloud."
- **Scene 4, "A small model needs to know what to look for."** Keep this line only if [B] is higher than [A]. Otherwise say: "The cloud model can also write key points for the marker, from the rubric alone."
- **Lecturer feedback.** If a lecturer or teaching assistant has tried the app before you record, add one sentence to the close with their role and what they said, and trim scene 5 to keep the length. Leave it out if no one has.

## Recording notes

- **Show the waits honestly.** On-device marking takes about 20 seconds per script. Record in real time, then speed the wait up in editing with a visible "sped up" label. Do not cut it silently.
- **The offline shot is the strongest moment.** Keep the Wi-Fi icon and the app's **Offline** pill in frame while the marks appear.
- **If the pill does not change to Offline.** On Windows, virtual network adapters can keep Chrome "online" with Wi-Fi off. Marking still runs on the device. To show it clearly, use airplane mode, or keep DevTools → Network → **Offline** in frame beside the Wi-Fi icon.
- **Scene 4 fallback.** Switching **Allow cloud AI** off in Settings triggers the same fallback as turning Wi-Fi off. Save the rubric first if you leave the page.
- **Prompt injection, optional.** If scene 3 runs short, open `07-answer.docx` and show the suggested mark staying low despite the line telling the AI to award full marks. Check the result before you rely on it.
- **Remote Config switch, optional.** To show the switch live, publish `allow_cloud_ai = false` and wait five minutes before recording: the app reuses a fetched value for up to five minutes. Publish `true` again afterwards, or judges will not be able to use cloud AI.
- **Only fictional scripts.** Never show real student work, real names or your email address. Sign out, or crop the account chip in the top bar.
- **Add captions.** Paste the narration into YouTube's subtitle editor.

## If something is not ready

| Problem | What to do |
| --- | --- |
| Cloud AI is not set up | Fix this first. The rules require the video to show cloud AI working, and scenes 4 to 6 depend on it. |
| The offline run fails | Record scene 3 online and say so, then tell me what the error was. Do not claim an offline run you did not record. |
| Photo AI is not ready | Nothing changes. The script uses typed answers. |
| The benchmark numbers are poor | Report them as they are. Lead scene 6 with the privacy result (zero student answers sent) and the evidence check pass rate. |

## Upload checklist

- [ ] 3:00 or shorter, in English, with captions
- [ ] Public on YouTube, checked in a signed-out window
- [ ] Uploaded by Sunday 29 November, since YouTube processing can take hours
- [ ] Link added to the Devpost submission and to the README (the `VIDEO` comment marks the place)
- [ ] `allow_cloud_ai` is back to `true` in Remote Config
