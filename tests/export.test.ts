import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import {
  buildAuditLogCsv,
  buildFeedbackZip,
  buildMarksheetCsv,
  buildOralVivaMarkdown,
  collateAssessment,
  csvCell,
  feedbackDownloadName,
  formatStudentFeedbackText,
} from '../src/domain/export.ts'
import { createRubricFromTemplate } from '../src/domain/onboarding.ts'
import { addScript, makeFeedback, newWorkspace, validateSuggestions } from '../src/domain/workspace.ts'

test('csvCell escapes quotes, commas, newlines, and spreadsheet formula prefixes', () => {
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell('a, b'), '"a, b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('=SUM(A1:A5)'), "'=SUM(A1:A5)")
  assert.equal(csvCell('+cmd|calc'), "'+cmd|calc")
  assert.equal(csvCell('@evil'), "'@evil")
  assert.equal(csvCell(42), '42')
  assert.equal(csvCell(null), '')
})

test('collateAssessment computes cohort statistics, human overrides, and keeps candidateRef out of student feedback JSON', async () => {
  let ws = newWorkspace()
  const rubric = createRubricFromTemplate('short-answer', ws.activeProjectId)
  ws = { ...ws, rubrics: [rubric] }

  const transcript1 = 'Osmosis is water moving across a semipermeable membrane from dilute to concentrated solution.'
  const suggestions1 = validateSuggestions(
    rubric.criteria.map((c, idx) => ({
      id: c.id,
      score: idx === 0 ? 2 : 1,
      quote: 'Osmosis is water moving',
      reason: 'Good explanation.',
    })),
    rubric,
    transcript1,
  )

  ws = addScript(ws, {
    id: 's1',
    projectId: ws.activeProjectId,
    rubricId: rubric.id,
    candidateRef: 'CAND-2041',
    transcript: transcript1,
    confirmed: true,
    suggestions: suggestions1,
    provenance: { source: 'device', ms: 12000 },
    marks: {
      [rubric.criteria[0].id]: 2, // Accepted AI
      [rubric.criteria[1].id]: 2, // Changed by lecturer (AI suggested 1)
      [rubric.criteria[2].id]: 1, // Accepted AI
    },
  })
  ws.scripts[0].finalisedAt = 1764000000000
  ws.scripts[0].feedback = { [rubric.criteria[0].id]: 'Clear definition.' }

  ws = addScript(ws, {
    id: 's2',
    projectId: ws.activeProjectId,
    rubricId: rubric.id,
    candidateRef: '=BAD-FORMULA-ID',
    transcript: 'Brief draft answer.',
    confirmed: true,
    marks: {
      [rubric.criteria[0].id]: 1,
      [rubric.criteria[1].id]: 1,
      [rubric.criteria[2].id]: 0,
    },
  })
  ws.scripts[0].finalisedAt = 1764000100000
  ws.scripts[0].secondReview = true

  // Unfinalised draft script
  ws = addScript(ws, {
    id: 's3',
    projectId: ws.activeProjectId,
    rubricId: rubric.id,
    transcript: 'Unfinished draft.',
    confirmed: true,
    marks: {},
  })

  const collated = collateAssessment(ws, rubric)
  assert.equal(collated.summary.totalScripts, 3)
  assert.equal(collated.summary.finalisedCount, 2)
  assert.equal(collated.summary.awaitingCount, 1)
  assert.equal(collated.summary.flaggedCount, 1)
  assert.equal(collated.summary.maxMarks, 6)
  assert.equal(collated.summary.meanEarned, 3.5)
  assert.equal(collated.summary.medianEarned, 3.5)
  assert.equal(collated.summary.minEarned, 2)
  assert.equal(collated.summary.maxEarned, 5)
  assert.equal(collated.summary.aiSuggestedCriteria, 3)
  assert.equal(collated.summary.lecturerChangedCriteria, 1)

  // CandidateRef is never leaked into strict exported student FeedbackFile
  const exported = makeFeedback(collated.rows[0].script, rubric)
  assert.equal('candidateRef' in exported, false)

  // Unique download filenames include candidateRef or script sequence
  assert.equal(feedbackDownloadName(collated.rows[0].script, rubric, 'json'), 'concept-explanation-cand-2041-feedback.json')
  assert.equal(feedbackDownloadName(collated.rows[2].script, rubric, 'json'), 'concept-explanation-script-003-feedback.json')

  // Marksheet CSV neutralises formula prefix and supports finalisedOnly
  const fullCsv = buildMarksheetCsv(collated)
  assert.match(fullCsv, /Script 001,CAND-2041/)
  assert.match(fullCsv, /Script 002,'=BAD-FORMULA-ID/)
  assert.match(fullCsv, /Script 003/)
  const finalCsv = buildMarksheetCsv(collated, { finalisedOnly: true })
  assert.doesNotMatch(finalCsv, /Script 003/)

  // Moderation Audit Log CSV records Accepted AI vs Changed by lecturer & inference source
  const auditCsv = buildAuditLogCsv(collated)
  assert.match(auditCsv, /Accepted AI,On this device/)
  assert.match(auditCsv, /Changed by lecturer,On this device/)
  assert.match(auditCsv, /Marked manually,Manual/)
  assert.match(auditCsv, /Pending,Manual/)

  // Plain-text student feedback & oral sheet
  const txt = formatStudentFeedbackText(collated.rows[0].script, rubric)
  assert.match(txt, /Total: 5 \/ 6 marks/)
  assert.match(txt, /Clear definition\./)
  const oralMd = buildOralVivaMarkdown(collated)
  assert.match(oralMd, /## Script 001 \(CAND-2041\) — 5 \/ 6/)
  assert.match(oralMd, /Flagged for second review/)
  assert.doesNotMatch(oralMd, /Script 003/)

  // Bulk ZIP archive contains per-student JSON, TXT, marksheet, audit CSV, and oral sheet
  const zipBytes = await buildFeedbackZip(collated)
  const zip = await JSZip.loadAsync(zipBytes)
  const fileNames = Object.keys(zip.files)
  assert.ok(fileNames.includes('concept-explanation-marksheet.csv'))
  assert.ok(fileNames.includes('concept-explanation-moderation-audit.csv'))
  assert.ok(fileNames.includes('concept-explanation-oral-viva.md'))
  assert.ok(fileNames.includes('student-practice-json/concept-explanation-cand-2041-feedback.json'))
  assert.ok(fileNames.includes('student-feedback-txt/concept-explanation-cand-2041-feedback.txt'))
  assert.equal(fileNames.filter((name) => name.endsWith('-feedback.json')).length, 2)
})
