import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveFirebaseConfig } from '../src/ai/firebaseConfig.ts'
import { detectFileKind, parseRubricText } from '../src/domain/document.ts'
import { BLUR_VARIANCE_THRESHOLD, computeLaplacianVariance, enhanceScanPixels } from '../src/domain/photo.ts'
import {
  activeProjectOf, addScript, canAccept, cloudRows, cohort, createProject, deleteProject, earned, FeedbackFile,
  makeFeedback, newWorkspace, normalizeWorkspace, projectRubrics, projectScripts, resetReview, reviewedCount,
  scriptSourceLabel, setActiveProject, updateProject, updateScript, validateRubric, validateSuggestions,
  type Rubric, type Script, type Workspace,
} from '../src/domain/workspace.ts'

const rubric: Rubric = {
  id: 'rubric-1', series: 'rubric', version: 1, title: 'Processes and threads',
  question: 'Describe a thread.',
  criteria: [{ id: 'thread', title: 'Thread', max: 2, levels: ['Missing', 'Partial', 'Shares process memory'], practice: '' }],
}

function sampleScript(overrides: Partial<Script> = {}): Script {
  return {
    id: 'script-1', sequence: 1, revision: 0, createdAt: 1, rubricId: rubric.id,
    transcript: 'A thread shares process memory.', confirmed: true, marks: {}, feedback: {}, ...overrides,
  }
}

test('verifies unique exact evidence before offering acceptance of a positive AI suggestion', () => {
  const mark = { id: 'thread', score: 2, reason: 'Describes memory sharing.', quote: 'shares process memory' }
  const validated = (text: string) => validateSuggestions([mark], rubric, text).thread
  const single = validated('A thread shares process memory.')
  assert.equal(single.start, 9)
  assert.equal(canAccept(single), true)
  assert.equal(canAccept(validated('A thread has its own memory.')), false)
  assert.equal(canAccept(validated('shares process memory; shares process memory.')), false)
  assert.throws(() => validateSuggestions([{ ...mark, score: 3 }], rubric, 'shares process memory'))
  assert.throws(() => validateSuggestions([mark, mark], rubric, 'shares process memory'))
})

test('keeps human decisions separate and clears downstream drafts on transcript change', () => {
  const script = sampleScript({ marks: { thread: 1 }, finalisedAt: 2, feedback: { thread: 'Add a detail.' } })
  assert.equal(earned(script, rubric), 1)
  assert.equal(reviewedCount(script, rubric), 1)
  const reset = resetReview(script, { transcript: 'Revised text', confirmed: false })
  assert.equal(reviewedCount(reset, rubric), 0)
  assert.equal(reset.finalisedAt, undefined)
  assert.deepEqual(reset.feedback, {})
})

test('rejects stale writes and assigns a stable sequence for a repeated draft ID', () => {
  const initial = addScript(newWorkspace(), { id: 'new', transcript: 'An answer.' })
  const again = addScript(initial, { id: 'new', transcript: 'Duplicate.' })
  assert.equal(again.scripts.length, 1)
  assert.equal(again.nextSequence, 2)
  const updated = updateScript(initial, 'new', 0, (script) => ({ ...script, confirmed: true }))
  assert.equal(updated.scripts[0].revision, 1)
  assert.throws(() => updateScript(updated, 'new', 0, (script) => ({ ...script, transcript: 'Stale.' })), /changed/)
})

test('keeps rubric versions separate and suppresses small groups in cloud payloads', () => {
  const workspace: Workspace = { ...newWorkspace(), rubrics: [rubric], scripts: [
    ...Array.from({ length: 10 }, (_, index) => sampleScript({
      id: 'script-' + index, finalisedAt: 2, marks: { thread: index < 3 ? 1 : 2 },
    })),
    sampleScript({ id: 'draft', marks: { thread: 0 } }),
    sampleScript({ id: 'other-version', rubricId: 'rubric-2', finalisedAt: 2, marks: { thread: 0 } }),
    sampleScript({ id: 'incomplete', finalisedAt: 2 }),
  ] }
  assert.deepEqual(cohort(workspace, rubric), [{ criterion: 1, title: 'Thread', total: 10, below: 3 }])
  assert.deepEqual(cloudRows(cohort(workspace, rubric)), [{ criterion: 1, total: 10, below: 3 }])
  assert.deepEqual(cloudRows([
    { criterion: 1, title: 'Thread', total: 9, below: 3 },
    { criterion: 2, title: 'Processes', total: 10, below: 2 },
    { criterion: 3, title: 'Advantage', total: 10, below: 8 },
  ]), [])
})

test('exports only released feedback fields and rejects invalid scores', () => {
  validateRubric(rubric)
  const script = sampleScript({ transcript: 'Unique private text', marks: { thread: 1 }, finalisedAt: 2,
    photo: new Blob(['private photo']), oral: [{ prompt: 'Ask this privately', cue: 'Private cue' }] })
  const exported = makeFeedback(script, rubric)
  assert.deepEqual(Object.keys(exported), ['version', 'title', 'criteria'])
  assert.equal(exported.criteria[0].score, 1)
  assert.doesNotMatch(JSON.stringify(exported), /Unique private text|Private cue|private photo/)
  assert.equal(FeedbackFile.safeParse({ ...exported, criteria: [{ ...exported.criteria[0], score: 3 }] }).success, false)
  assert.throws(() => makeFeedback(sampleScript(), rubric), /Finalise/)
})

test('detects supported photo and document formats and labels script sources', () => {
  assert.equal(detectFileKind({ name: 'page.jpg', type: 'image/jpeg' }), 'image')
  assert.equal(detectFileKind({ name: 'rubric.pdf', type: 'application/pdf' }), 'pdf')
  assert.equal(detectFileKind({ name: 'essay.docx', type: '' }), 'docx')
  assert.equal(detectFileKind({ name: 'notes.txt', type: 'text/plain' }), 'txt')
  assert.equal(detectFileKind({ name: 'archive.zip', type: 'application/zip' }), 'unsupported')

  assert.equal(scriptSourceLabel(sampleScript({ sourceFile: { name: 'a.pdf', kind: 'pdf' } })), 'PDF')
  assert.equal(scriptSourceLabel(sampleScript({ photo: new Blob(['img']), sourceFile: { name: 'scan.pdf', kind: 'pdf' } })), 'Scanned PDF')
  assert.equal(scriptSourceLabel(sampleScript({ sourceFile: { name: 'a.docx', kind: 'docx' } })), 'DOCX')
  assert.equal(scriptSourceLabel(sampleScript({ sourceFile: { name: 'a.txt', kind: 'txt' } })), 'TXT')
  assert.equal(scriptSourceLabel(sampleScript({ sourceFile: { name: 'scan.pdf', kind: 'google-drive' } })), 'Google Drive')
  assert.equal(scriptSourceLabel(sampleScript({ sourceFile: { name: 'Essay', kind: 'google-docs' } })), 'Google Docs')
  assert.equal(scriptSourceLabel(sampleScript({ sourceFile: { name: 'Sheet · Row 2', kind: 'google-sheets' } })), 'Google Sheets')
  assert.equal(scriptSourceLabel(sampleScript({ sourceFile: { name: 'Homework', kind: 'gmail' } })), 'Gmail')
  assert.equal(scriptSourceLabel(sampleScript({ sourceFile: { name: 'Quiz · Response 1', kind: 'google-forms' } })), 'Google Forms')
  assert.equal(scriptSourceLabel(sampleScript({ photo: new Blob(['img']) })), 'Photo')
  assert.equal(scriptSourceLabel(sampleScript()), 'Typed')
})

test('parses structured text and pipe-table rubrics including descending mark columns', () => {
  const structured = parseRubricText([
    'Title: Operating Systems Quiz',
    'Question: Compare processes and threads in modern operating systems.',
    '',
    'Criterion 1: Memory isolation (2 marks)',
    '0 marks: No mention of address spaces.',
    '1 mark: Mentions shared or separate memory partially.',
    '2 marks: Clearly distinguishes isolated process memory and shared thread memory.',
    'Practice: Why does a thread crash affect sibling threads?',
    '',
    'Criterion 2: Context switching (1 mark)',
    '0: Missing or inaccurate.',
    '1: Explains lower overhead for thread switching.',
  ].join('\n'))

  assert.equal(structured.title, 'Operating Systems Quiz')
  assert.equal(structured.question, 'Compare processes and threads in modern operating systems.')
  assert.equal(structured.parsedCriteriaCount, 2)
  assert.equal(structured.criteria[0].title, 'Memory isolation')
  assert.equal(structured.criteria[0].max, 2)
  assert.equal(structured.criteria[0].levels[2], 'Clearly distinguishes isolated process memory and shared thread memory.')
  assert.equal(structured.criteria[0].practice, 'Why does a thread crash affect sibling threads?')
  assert.equal(structured.criteria[1].max, 1)

  const table = parseRubricText([
    'Title: Lab Report',
    'Question: Evaluate the experimental error.',
    'Criterion | 2 marks | 1 mark | 0 marks',
    'Methodology | Full control setup | Partial setup | Missing method',
    'Error analysis | Quantifies uncertainty | Mentions error only | None',
  ].join('\n'))

  assert.equal(table.parsedCriteriaCount, 2)
  assert.equal(table.criteria[0].title, 'Methodology')
  assert.deepEqual(table.criteria[0].levels, ['Missing method', 'Partial setup', 'Full control setup'])
  assert.deepEqual(table.criteria[1].levels, ['None', 'Mentions error only', 'Quantifies uncertainty'])
})

test('organises rubrics and scripts strictly by project and migrates legacy workspaces', () => {
  // Legacy workspace without projects array migrates cleanly into the default project
  const legacy = normalizeWorkspace({
    rubrics: [rubric],
    scripts: [sampleScript()],
    nextSequence: 2,
    allowCloud: false,
  })
  assert.equal(legacy.projects.length, 1)
  const firstProjectId = activeProjectOf(legacy).id
  assert.equal(projectRubrics(legacy, firstProjectId).length, 1)
  assert.equal(projectScripts(legacy, firstProjectId).length, 1)

  // Creating a second project isolates its scripts and rubrics
  let ws = createProject(legacy, 'BIO104 Lab 3', 'Microscopy lab')
  const bioProjectId = ws.activeProjectId
  assert.notEqual(bioProjectId, firstProjectId)
  assert.equal(projectRubrics(ws, bioProjectId).length, 0)
  assert.equal(projectScripts(ws, bioProjectId).length, 0)

  ws = {
    ...ws,
    rubrics: [...ws.rubrics, { ...rubric, id: 'bio-rubric', series: 'bio-series', projectId: bioProjectId, title: 'Cell Lab' }],
  }
  ws = addScript(ws, { id: 'bio-script', transcript: 'Observed mitosis.', rubricId: 'bio-rubric' })
  assert.equal(projectRubrics(ws, bioProjectId).length, 1)
  assert.equal(projectScripts(ws, bioProjectId).length, 1)
  assert.equal(projectScripts(ws, firstProjectId).length, 1)

  // Rename and switch back
  ws = updateProject(ws, bioProjectId, 'BIO104 · Lab 3')
  assert.equal(activeProjectOf(ws).name, 'BIO104 · Lab 3')
  ws = setActiveProject(ws, firstProjectId)
  assert.equal(ws.activeProjectId, firstProjectId)

  // Deleting a project removes only its own scripts and rubrics
  ws = deleteProject(ws, bioProjectId)
  assert.equal(ws.projects.length, 1)
  assert.equal(ws.rubrics.length, 1)
  assert.equal(ws.scripts.length, 1)
  assert.throws(() => deleteProject(ws, firstProjectId), /at least one project/i)
})

test('prevents authDomain and Firebase fields from drifting when env vars override projectId', () => {
  const staleFile = {
    projectId: 'gen-lang-client-0502601746',
    appId: '1:835307221595:web:7ef5a3bedd17f0c3d3857e',
    apiKey: 'AIzaOldKey',
    authDomain: 'gen-lang-client-0502601746.firebaseapp.com',
    storageBucket: 'gen-lang-client-0502601746.firebasestorage.app',
    messagingSenderId: '835307221595',
    recaptchaSiteKey: '6LdOldKey',
  }

  // Env vars target a new project: must derive authDomain/storageBucket/senderId cleanly and never leak stale file fields
  const overridden = resolveFirebaseConfig(
    {
      VITE_FIREBASE_PROJECT_ID: 'gen-lang-client-0769662723',
      VITE_FIREBASE_API_KEY: 'AIzaNewKey',
      VITE_FIREBASE_APP_ID: '1:999888777666:web:a7e977cbd5f884e60100db',
      VITE_FIREBASE_APP_CHECK_SITE_KEY: '6LdNewKey',
      VITE_FIREBASE_CLOUD_MODEL: 'gemini-3.5-flash-lite',
    },
    staleFile,
  )
  assert.equal(overridden.config.projectId, 'gen-lang-client-0769662723')
  assert.equal(overridden.config.apiKey, 'AIzaNewKey')
  assert.equal(overridden.config.appId, '1:999888777666:web:a7e977cbd5f884e60100db')
  assert.equal(overridden.config.authDomain, 'gen-lang-client-0769662723.firebaseapp.com')
  assert.equal(overridden.config.storageBucket, 'gen-lang-client-0769662723.firebasestorage.app')
  assert.equal(overridden.config.messagingSenderId, '999888777666')
  assert.equal(overridden.siteKey, '6LdNewKey')
  assert.equal(overridden.cloudModel, 'gemini-3.5-flash-lite')

  // Explicit VITE_FIREBASE_AUTH_DOMAIN overrides the default derived domain
  const customDomain = resolveFirebaseConfig(
    {
      VITE_FIREBASE_PROJECT_ID: 'gen-lang-client-0769662723',
      VITE_FIREBASE_AUTH_DOMAIN: 'auth.example.edu',
    },
    staleFile,
  )
  assert.equal(customDomain.config.authDomain, 'auth.example.edu')
  assert.equal(customDomain.siteKey, undefined)

  // No env override: falls back cleanly to firebase-applet-config.json
  const fromFile = resolveFirebaseConfig({}, staleFile)
  assert.equal(fromFile.config.projectId, 'gen-lang-client-0502601746')
  assert.equal(fromFile.config.authDomain, 'gen-lang-client-0502601746.firebaseapp.com')
  assert.equal(fromFile.config.messagingSenderId, '835307221595')
  assert.equal(fromFile.siteKey, '6LdOldKey')
  assert.equal(fromFile.cloudModel, 'gemini-3.5-flash-lite')
})

test('detects blurry vs sharp images and flattens shadows while boosting ink contrast', () => {
  const width = 40
  const height = 40

  // Smooth out-of-focus gradient -> low Laplacian variance (blurry)
  const blurryLuma = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      blurryLuma[y * width + x] = 120 + (x / width) * 40
    }
  }
  const blurryScore = computeLaplacianVariance(blurryLuma, width, height)
  assert.ok(blurryScore < BLUR_VARIANCE_THRESHOLD, `expected blurry score < ${BLUR_VARIANCE_THRESHOLD}, got ${blurryScore}`)

  // Crisp alternating text-like strokes -> high Laplacian variance (sharp)
  const sharpLuma = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      sharpLuma[y * width + x] = (x % 4 === 0 || y % 6 === 0) ? 30 : 235
    }
  }
  const sharpScore = computeLaplacianVariance(sharpLuma, width, height)
  assert.ok(sharpScore > BLUR_VARIANCE_THRESHOLD * 5, `expected sharp score >> threshold, got ${sharpScore}`)

  // Shadowed paper (left side bright 220, right side shaded 110) with faint ink strokes (-35 below local paper)
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const paper = x < width / 2 ? 220 : 110
      const isInk = y === 20 && (x === 10 || x === 30)
      const val = isInk ? paper - 35 : paper
      rgba[idx] = val
      rgba[idx + 1] = val
      rgba[idx + 2] = val
      rgba[idx + 3] = 255
    }
  }
  enhanceScanPixels(rgba, width, height)

  // Both left and right paper backgrounds should normalize near crisp white (> 235)
  const leftPaper = rgba[(10 * width + 10) * 4]
  const rightPaper = rgba[(10 * width + 30) * 4]
  assert.ok(leftPaper >= 235 && rightPaper >= 235, `expected flattened bright paper, got left=${leftPaper} right=${rightPaper}`)

  // Ink pixels in both bright and shadowed halves should have strong contrast against paper (> 60 delta)
  const leftInk = rgba[(20 * width + 10) * 4]
  const rightInk = rgba[(20 * width + 30) * 4]
  assert.ok(leftPaper - leftInk > 60, `expected strong left ink contrast, got delta=${leftPaper - leftInk}`)
  assert.ok(rightPaper - rightInk > 60, `expected strong right ink contrast, got delta=${rightPaper - rightInk}`)
})

test('generates unique submission links with configurable field defaults and validates drafts', async () => {
  const {
    autoMarkByRubric,
    buildCombinedAnswer,
    buildSubmitterLabel,
    defaultSubmissionFields,
    generateUniqueLinkId,
    ID_PATTERN,
    toRubricSnapshot,
    validateLinkDraft,
  } = await import('../src/domain/submissionLink.ts')

  // Reasonable default fields include Name, Matric Number, large text field, and file upload
  const defaults = defaultSubmissionFields()
  assert.equal(defaults.length, 4)
  assert.deepEqual(defaults.map((f) => f.type), ['short_text', 'short_text', 'long_text', 'file'])
  assert.match(defaults[0].label, /name/i)
  assert.match(defaults[1].label, /matric/i)

  // Unique link IDs match the Firestore ID regex and do not collide
  const ids = new Set(Array.from({ length: 25 }, () => generateUniqueLinkId()))
  assert.equal(ids.size, 25)
  for (const id of ids) {
    assert.ok(id.startsWith('sub-'))
    assert.match(id, ID_PATTERN)
  }

  // Script source label recognises submission links
  assert.equal(scriptSourceLabel(sampleScript({ sourceFile: { name: 'Portal', kind: 'submission-link' } })), 'Submission link')

  // Rejects auto-marking without a rubric snapshot
  assert.throws(() => validateLinkDraft({
    title: 'Week 4 Lab',
    instructions: 'Submit before Friday.',
    autoMark: true,
    fields: defaults,
  }), /rubric/i)

  // Accepts valid configurable draft with auto-marking and rubric snapshot
  const snapshot = toRubricSnapshot(rubric)
  const validatedFields = validateLinkDraft({
    title: 'OS Mid-Semester Submission',
    instructions: 'Include your matric number and answer.',
    autoMark: true,
    rubricSnapshot: snapshot,
    fields: defaults,
  })
  assert.equal(validatedFields.length, 4)
  assert.equal(validatedFields[0].label, defaults[0].label)

  // Submitter label & combined answer assembly
  const responses = [
    { fieldId: defaults[0].id, label: defaults[0].label, type: defaults[0].type, textValue: 'Ada Lovelace', fileName: '', fileMime: '', fileSize: 0, extractedText: '', imageDataUrl: '' },
    { fieldId: defaults[1].id, label: defaults[1].label, type: defaults[1].type, textValue: 'CSC/2026/041', fileName: '', fileMime: '', fileSize: 0, extractedText: '', imageDataUrl: '' },
    { fieldId: defaults[2].id, label: defaults[2].label, type: defaults[2].type, textValue: 'A thread shares process memory with sibling threads in the same address space.', fileName: '', fileMime: '', fileSize: 0, extractedText: '', imageDataUrl: '' },
  ]
  assert.equal(buildSubmitterLabel(defaults, responses), 'Ada Lovelace · CSC/2026/041')
  const combined = buildCombinedAnswer(defaults, responses)
  assert.match(combined, /shares process memory/i)

  // Evidence-backed auto-marking stays within rubric bounds and anchors exact quotes
  const result = autoMarkByRubric(snapshot, combined)
  assert.equal(result.totalPossible, 2)
  assert.ok(result.marks.thread >= 1 && result.marks.thread <= 2)
  assert.equal(result.totalEarned, result.marks.thread)
  const suggestion = result.suggestions.thread
  assert.ok(suggestion)
  if (suggestion.quote) {
    assert.ok(combined.includes(suggestion.quote), 'auto-mark quote must appear verbatim in answer')
  }

  // Empty answer scores 0 cleanly
  const emptyResult = autoMarkByRubric(snapshot, '')
  assert.equal(emptyResult.marks.thread, 0)
  assert.equal(emptyResult.totalEarned, 0)
})

test('A1 & C1: joins wrapped level, practice, and key points lines without splitting on e.g.', () => {
  const wrapped = parseRubricText([
    'Title: Data Structures Quiz',
    'Question: Compare arrays and linked lists.',
    '',
    'Criterion 1: Random access (2 marks)',
    '0: No comparison given.',
    '1: Mentions indexing briefly.',
    '2: Compares O(1) vs O(n) with a reason (index arithmetic',
    'versus traversal),',
    'e.g. frequent insertions in the middle favour linked lists.',
    'Key points: Must mention contiguous memory',
    'and pointer chasing.',
    'Practice: When would you pick an array over a linked list',
    'in a tight inner loop?',
  ].join('\n'))

  assert.equal(wrapped.parsedCriteriaCount, 1)
  assert.equal(wrapped.criteria[0].title, 'Random access')
  assert.equal(wrapped.criteria[0].max, 2)
  assert.match(wrapped.criteria[0].levels[2], /index arithmetic versus traversal/)
  assert.match(wrapped.criteria[0].levels[2], /e\.g\. frequent insertions/)
  assert.equal(wrapped.criteria[0].keyPoints, 'Must mention contiguous memory and pointer chasing.')
  assert.equal(wrapped.criteria[0].practice, 'When would you pick an array over a linked list in a tight inner loop?')

  // Case-sensitive letter headings still work for "a) Accuracy"
  const lettered = parseRubricText([
    'Title: Essay Rubric',
    'Question: Evaluate the argument.',
    'a) Accuracy (2 marks)',
    '0: Incorrect.',
    '2: Fully accurate.',
    'i.e. cites primary sources accurately.',
  ].join('\n'))
  assert.equal(lettered.parsedCriteriaCount, 1)
  assert.equal(lettered.criteria[0].title, 'Accuracy')
  assert.match(lettered.criteria[0].levels[2], /i\.e\. cites primary sources/)
})

test('A2: preserves escaped pipes inside table cells without adding phantom columns', () => {
  const table = parseRubricText([
    'Title: Elasticity',
    'Question: Classify price elasticity of demand.',
    'Criterion | 0 marks | 1 mark | 2 marks',
    'Thresholds | Missing | Mentions elasticity | Correctly applies \\|PED\\| > 1 for elastic and \\|PED\\| < 1 for inelastic',
  ].join('\n'))

  assert.equal(table.parsedCriteriaCount, 1)
  assert.equal(table.criteria[0].title, 'Thresholds')
  assert.equal(table.criteria[0].max, 2)
  assert.equal(table.criteria[0].levels.length, 3)
  assert.equal(table.criteria[0].levels[2], 'Correctly applies |PED| > 1 for elastic and |PED| < 1 for inelastic')
})

test('A3, A4, B1 & C2: repairs AI drafts, trims long cloud audits, classifies errors accurately, and estimates tokens', async () => {
  const {
    buildMarkingPromptCriteria,
    describeCloudErrorMessage,
    DraftFormatError,
    estimateMarkingTokens,
    ON_DEVICE_TOKEN_THRESHOLD,
    parseModelJson,
    repairDraft,
    RubricAuditSchema,
    TeachingPlanSchema,
  } = await import('../src/domain/aiSchemas.ts')

  // A3: 3 levels with max 3 -> repaired to max 2 with note; strips "1 - " prefix
  const repaired = repairDraft({
    criteria: [{
      title: 'Force equation',
      max: 3,
      levels: ['0 - Missing equation', '1 - Partially correct', '2: States F = ma with units'],
      practice: 'State Newton’s second law.',
    }],
  })
  assert.equal(repaired.criteria[0].max, 2)
  assert.equal(repaired.criteria[0].levels[1], 'Partially correct')
  assert.equal(repaired.criteria[0].levels[2], 'States F = ma with units')
  assert.equal(repaired.notes.length, 1)

  // A3: bare-digit levels rejected
  assert.throws(() => repairDraft({
    criteria: [{ title: 'Force', max: 2, levels: ['0', '1', '2'], practice: '' }],
  }), DraftFormatError)

  // A3: 12 levels rejected
  assert.throws(() => repairDraft({
    criteria: [{ title: 'Force', max: 11, levels: Array.from({ length: 12 }, (_, i) => `Level description ${i} text`), practice: '' }],
  }), DraftFormatError)

  // A4 & B1: 600-char audit summary trimmed to 400 and structured replacement parsed
  const longSummary = 'S'.repeat(600)
  const parsedAudit = RubricAuditSchema.parse({
    summary: longSummary,
    issues: [{
      criterionTitle: 'Thread',
      field: 'level',
      level: 2,
      issue: 'Too vague',
      replacement: 'Explains shared address space across sibling threads.',
      extraIgnoredField: true,
    }],
  })
  assert.equal(parsedAudit.summary.length, 400)
  assert.equal(parsedAudit.issues[0].field, 'level')
  assert.equal(parsedAudit.issues[0].level, 2)
  assert.equal(parsedAudit.issues[0].replacement, 'Explains shared address space across sibling threads.')

  // A4: TeachingPlan trims long strings instead of rejecting
  const plan = TeachingPlanSchema.parse({
    priorities: [{ criterion: 1, misconception: 'M'.repeat(400), activity: 'A'.repeat(500), checkPrompt: 'C'.repeat(300) }],
  })
  assert.equal(plan.priorities[0].misconception.length, 280)
  assert.equal(plan.priorities[0].activity.length, 360)
  assert.equal(plan.priorities[0].checkPrompt.length, 240)

  // A4: accurate error classification
  assert.match(describeCloudErrorMessage(new SyntaxError('Unexpected token'), 'fallback', 'gemini-2.5-flash').message, /expected format/i)
  assert.equal(
    describeCloudErrorMessage(new Error('Invalid model response payload'), 'The cloud request did not complete. Try again.', 'gemini-2.5-flash').message,
    'The cloud request did not complete. Try again.',
  )
  assert.match(
    describeCloudErrorMessage(new Error('404 models/gemini-2.5-flash is not found'), 'fallback', 'gemini-2.5-flash').message,
    /unavailable/i,
  )

  // Malformed model JSON stays a SyntaxError (so format retries still trigger) but never shows parser internals
  assert.deepEqual(parseModelJson('{"transcript":"ok"}'), { transcript: 'ok' })
  assert.throws(
    () => parseModelJson('{"transcript":"cut off'),
    (error: unknown) =>
      error instanceof SyntaxError &&
      /not in the expected format/i.test(error.message) &&
      !/JSON|token|position/i.test(error.message),
  )

  // C1 & C2: keyPoints included in prompt criteria, and token estimator triggers split above threshold
  const bigRubric: Rubric = {
    ...rubric,
    criteria: Array.from({ length: 6 }, (_, i) => ({
      id: `c-${i}`,
      title: `Criterion ${i + 1}`,
      max: 6,
      levels: Array.from({ length: 7 }, () => 'Detailed scoring descriptor '.repeat(20)),
      practice: '',
      keyPoints: 'Must mention equilibrium.',
    })),
  }
  const promptCriteria = buildMarkingPromptCriteria(bigRubric)
  assert.equal(promptCriteria[0].keyPoints, 'Must mention equilibrium.')
  assert.ok(estimateMarkingTokens(bigRubric, 'A'.repeat(4000)) > ON_DEVICE_TOKEN_THRESHOLD)
  assert.ok(estimateMarkingTokens(rubric, 'Short answer.') < ON_DEVICE_TOKEN_THRESHOLD)
})

test('A5, B2, B3, B4, C1 & C3: anchor levels, smart versioning, cohort merging, bulk move, keyPoints privacy, and archive/delete/copy', async () => {
  const {
    archiveRubricSeries,
    classPictureEntries,
    copyRubricToProject,
    deleteRubricSeries,
    expandedCriteria,
    formatMergedVersionsLabel,
    latestRubrics,
    levelText,
    moveUnfinalisedScriptsToLatest,
    rubricInUse,
    unfinalisedScriptsOnOlderVersions,
  } = await import('../src/domain/workspace.ts')

  // B2: 5-mark criterion with only levels 0 and 5 validates cleanly and interpolates middle levels
  const anchorRubric: Rubric = {
    id: 'r-anchor',
    series: 's-anchor',
    version: 1,
    projectId: 'default-project',
    title: 'Lab Report',
    question: 'Explain the experimental method.',
    criteria: [{
      id: 'method',
      title: 'Method',
      max: 5,
      levels: ['No method described', '', '', '', '', 'Complete reproducible method with controls'],
      practice: '',
      keyPoints: 'Secret marker key point',
    }],
  }
  validateRubric(anchorRubric)
  assert.match(levelText(anchorRubric.criteria[0], 2), /Between "No method described" \(0 marks\) and "Complete reproducible method with controls" \(5 marks\)\./)
  assert.equal(expandedCriteria(anchorRubric)[0].levels.every((lvl) => lvl.length > 0), true)

  // C1: keyPoints is never leaked into exported feedback
  const exported = makeFeedback(sampleScript({ rubricId: anchorRubric.id, marks: { method: 4 }, finalisedAt: 10 }), anchorRubric)
  assert.doesNotMatch(JSON.stringify(exported), /Secret marker key point/)

  // A5: rubricInUse is false for assigned-but-unmarked scripts, true once marked
  let ws: Workspace = {
    ...newWorkspace(),
    rubrics: [anchorRubric],
    scripts: [sampleScript({ id: 'unmarked', rubricId: anchorRubric.id, marks: {} })],
  }
  assert.equal(rubricInUse(ws, anchorRubric.id), false)
  ws = {
    ...ws,
    scripts: [sampleScript({ id: 'marked', rubricId: anchorRubric.id, marks: { method: 3 } })],
  }
  assert.equal(rubricInUse(ws, anchorRubric.id), true)

  // A5, B3, B4: wording-only v2 merges in class picture (5 on v1 + 5 on v2 => 10) and bulk moves unfinalised scripts
  const v2: Rubric = {
    ...anchorRubric,
    id: 'r-anchor-v2',
    version: 2,
    title: 'Lab Report (clarified)',
  }
  const mergedWs: Workspace = {
    ...newWorkspace(),
    rubrics: [anchorRubric, v2],
    scripts: [
      ...Array.from({ length: 5 }, (_, i) => sampleScript({ id: `v1-${i}`, rubricId: anchorRubric.id, marks: { method: i < 2 ? 3 : 5 }, finalisedAt: 5 })),
      ...Array.from({ length: 5 }, (_, i) => sampleScript({ id: `v2-${i}`, rubricId: v2.id, marks: { method: i < 2 ? 2 : 5 }, finalisedAt: 6 })),
      sampleScript({ id: 'unfinalised-v1', rubricId: anchorRubric.id, marks: { method: 2 } }),
    ],
  }
  assert.deepEqual(latestRubrics(mergedWs).map((r) => r.id), [v2.id])
  assert.deepEqual(cohort(mergedWs, v2), [{ criterion: 1, title: 'Method', total: 10, below: 4 }])

  const entries = classPictureEntries(mergedWs)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].rubric.id, v2.id)
  assert.equal(formatMergedVersionsLabel(entries[0].versions), 'Includes v1–v2 (same criteria)')

  // B3: bulk move unfinalised scripts to v2, leaving finalised scripts on v1 untouched
  assert.equal(unfinalisedScriptsOnOlderVersions(mergedWs, anchorRubric.series).length, 1)
  const movedWs = moveUnfinalisedScriptsToLatest(mergedWs, anchorRubric.series)
  const movedScript = movedWs.scripts.find((s) => s.id === 'unfinalised-v1')!
  assert.equal(movedScript.rubricId, v2.id)
  assert.deepEqual(movedScript.marks, {})
  assert.equal(movedWs.scripts.find((s) => s.id === 'v1-0')!.rubricId, anchorRubric.id)

  // C3: archive hides from latestRubrics but keeps in classPictureEntries; delete blocked when in use; copy creates fresh v1
  const archivedWs = archiveRubricSeries(movedWs, anchorRubric.series, true)
  assert.equal(latestRubrics(archivedWs).length, 0)
  assert.equal(classPictureEntries(archivedWs).length, 1)
  assert.throws(() => deleteRubricSeries(archivedWs, anchorRubric.series), /cannot be deleted/i)

  const withSecondProject = createProject(archivedWs, 'CHEM201')
  const chemId = withSecondProject.activeProjectId
  const copiedWs = copyRubricToProject(withSecondProject, v2.id, chemId)
  const chemRubrics = latestRubrics(copiedWs, chemId)
  assert.equal(chemRubrics.length, 1)
  assert.equal(chemRubrics[0].version, 1)
  assert.notEqual(chemRubrics[0].series, v2.series)
  assert.notEqual(chemRubrics[0].criteria[0].id, v2.criteria[0].id)
  assert.equal(chemRubrics[0].archivedAt, undefined)

  // Unused copied series can be deleted cleanly
  const afterDelete = deleteRubricSeries(copiedWs, chemRubrics[0].series)
  assert.equal(latestRubrics(afterDelete, chemId).length, 0)
})

test('hybrid AI routing policy enforces strict local isolation for private student work and hybrid fallback for rubrics & sample', async () => {
  const { canRunAiRoute, selectAiRoute } = await import('../src/domain/aiRouting.ts')

  type Case = {
    name: string
    input: Parameters<typeof selectAiRoute>[0]
    expected: {
      mode: 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'ONLY_IN_CLOUD'
      canRun: boolean
      tryDeviceFirst: boolean
      allowCloudFallback: boolean
      retryCloudOnDeviceError: boolean
    }
  }

  const cases: Case[] = [
    // Private student scripts & real student practice NEVER fall back to cloud even when allowCloud=true & online=true
    {
      name: 'private transcribe with device ready -> strictly local, no cloud fallback',
      input: { task: 'transcribe', isSample: false, deviceAvailable: true, allowCloud: true, cloudConfigured: true, online: true },
      expected: { mode: 'ONLY_ON_DEVICE', canRun: true, tryDeviceFirst: true, allowCloudFallback: false, retryCloudOnDeviceError: false },
    },
    {
      name: 'private mark without device -> blocked even when cloud is enabled',
      input: { task: 'mark', isSample: false, deviceAvailable: false, allowCloud: true, cloudConfigured: true, online: true },
      expected: { mode: 'ONLY_ON_DEVICE', canRun: false, tryDeviceFirst: false, allowCloudFallback: false, retryCloudOnDeviceError: false },
    },
    {
      name: 'private feedback without device -> blocked even when cloud is enabled',
      input: { task: 'draftFeedback', isSample: false, deviceAvailable: false, allowCloud: true, cloudConfigured: true, online: true },
      expected: { mode: 'ONLY_ON_DEVICE', canRun: false, tryDeviceFirst: false, allowCloudFallback: false, retryCloudOnDeviceError: false },
    },
    {
      name: 'real student practice follow-up without device -> blocked (zero cloud leak)',
      input: { task: 'followUp', isSample: false, deviceAvailable: false, allowCloud: true, cloudConfigured: true, online: true },
      expected: { mode: 'ONLY_ON_DEVICE', canRun: false, tryDeviceFirst: false, allowCloudFallback: false, retryCloudOnDeviceError: false },
    },
    // Fictional sample workspace runs hybrid end-to-end so judges on any device can test AI live
    {
      name: 'sample mark with device + cloud -> local first with one cloud retry on error',
      input: { task: 'mark', isSample: true, deviceAvailable: true, allowCloud: true, cloudConfigured: true, online: true },
      expected: { mode: 'PREFER_ON_DEVICE', canRun: true, tryDeviceFirst: true, allowCloudFallback: true, retryCloudOnDeviceError: true },
    },
    {
      name: 'sample transcribe on phone/Safari (no device AI) with cloud -> cloud fallback allowed',
      input: { task: 'transcribe', isSample: true, deviceAvailable: false, allowCloud: true, cloudConfigured: true, online: true },
      expected: { mode: 'PREFER_ON_DEVICE', canRun: true, tryDeviceFirst: false, allowCloudFallback: true, retryCloudOnDeviceError: false },
    },
    {
      name: 'sample practice follow-up without device with cloud -> hybrid fallback allowed',
      input: { task: 'followUp', isSample: true, deviceAvailable: false, allowCloud: true, cloudConfigured: true, online: true },
      expected: { mode: 'PREFER_ON_DEVICE', canRun: true, tryDeviceFirst: false, allowCloudFallback: true, retryCloudOnDeviceError: false },
    },
    {
      name: 'sample feedback offline with device ready -> runs locally without cloud',
      input: { task: 'draftFeedback', isSample: true, deviceAvailable: true, allowCloud: true, cloudConfigured: true, online: false },
      expected: { mode: 'PREFER_ON_DEVICE', canRun: true, tryDeviceFirst: true, allowCloudFallback: false, retryCloudOnDeviceError: false },
    },
    // Non-student rubric authoring tasks use PREFER_ON_DEVICE
    {
      name: 'draft rubric without device but with cloud -> falls back to cloud',
      input: { task: 'draftRubric', isSample: false, deviceAvailable: false, allowCloud: true, cloudConfigured: true, online: true },
      expected: { mode: 'PREFER_ON_DEVICE', canRun: true, tryDeviceFirst: false, allowCloudFallback: true, retryCloudOnDeviceError: false },
    },
    {
      name: 'read rubric photo with device ready and cloud off -> runs locally only',
      input: { task: 'readRubricPhoto', isSample: false, deviceAvailable: true, allowCloud: false, cloudConfigured: true, online: true },
      expected: { mode: 'PREFER_ON_DEVICE', canRun: true, tryDeviceFirst: true, allowCloudFallback: false, retryCloudOnDeviceError: false },
    },
    {
      name: 'draft practice questions offline without device -> blocked with reason',
      input: { task: 'draftPracticeQuestions', isSample: false, deviceAvailable: false, allowCloud: true, cloudConfigured: true, online: false },
      expected: { mode: 'PREFER_ON_DEVICE', canRun: false, tryDeviceFirst: false, allowCloudFallback: false, retryCloudOnDeviceError: false },
    },
    // Cloud-only tasks require allowCloud + cloudConfigured + online
    {
      name: 'rubric audit online with cloud allowed -> ONLY_IN_CLOUD',
      input: { task: 'auditRubric', isSample: false, deviceAvailable: true, allowCloud: true, cloudConfigured: true, online: true },
      expected: { mode: 'ONLY_IN_CLOUD', canRun: true, tryDeviceFirst: false, allowCloudFallback: true, retryCloudOnDeviceError: false },
    },
    {
      name: 'teaching summary without App Check -> blocked',
      input: { task: 'teachingSummary', isSample: false, deviceAvailable: true, allowCloud: true, cloudConfigured: false, online: true },
      expected: { mode: 'ONLY_IN_CLOUD', canRun: false, tryDeviceFirst: false, allowCloudFallback: false, retryCloudOnDeviceError: false },
    },
    {
      name: 'compare sample when allowCloud is false -> blocked',
      input: { task: 'compareSample', isSample: true, deviceAvailable: true, allowCloud: false, cloudConfigured: true, online: true },
      expected: { mode: 'ONLY_IN_CLOUD', canRun: false, tryDeviceFirst: false, allowCloudFallback: false, retryCloudOnDeviceError: false },
    },
  ]

  for (const tc of cases) {
    const decision = selectAiRoute(tc.input)
    assert.equal(decision.mode, tc.expected.mode, `${tc.name}: mode`)
    assert.equal(decision.canRun, tc.expected.canRun, `${tc.name}: canRun`)
    assert.equal(canRunAiRoute(tc.input), tc.expected.canRun, `${tc.name}: canRunAiRoute`)
    assert.equal(decision.tryDeviceFirst, tc.expected.tryDeviceFirst, `${tc.name}: tryDeviceFirst`)
    assert.equal(decision.allowCloudFallback, tc.expected.allowCloudFallback, `${tc.name}: allowCloudFallback`)
    assert.equal(decision.retryCloudOnDeviceError, tc.expected.retryCloudOnDeviceError, `${tc.name}: retryCloudOnDeviceError`)
    if (!decision.canRun) {
      assert.ok(decision.blockedReason && decision.blockedReason.length > 0, `${tc.name}: expected blockedReason`)
    }
  }
})



