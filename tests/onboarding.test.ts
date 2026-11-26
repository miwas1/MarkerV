import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createRubricFromTemplate,
  defaultRubricForCapture,
  STARTER_RUBRICS,
  summariseAiReadiness,
} from '../src/domain/onboarding.ts'
import { addScript, createProject, newWorkspace, validateRubric, type Rubric } from '../src/domain/workspace.ts'

test('summariseAiReadiness reports clear labels for offline, ready, downloadable, and cloud states', () => {
  const ready = summariseAiReadiness({
    configured: true,
    text: 'available',
    image: 'unavailable',
    online: true,
    allowCloud: false,
    cloudConfigured: true,
  })
  assert.equal(ready.textReady, true)
  assert.equal(ready.imageReady, false)
  assert.equal(ready.topbarLabel, 'On-device AI ready')
  assert.equal(ready.topbarTone, 'ready')

  const offlineReady = summariseAiReadiness({
    configured: true,
    text: 'available',
    image: 'available',
    online: false,
    allowCloud: false,
    cloudConfigured: true,
  })
  assert.equal(offlineReady.topbarLabel, 'Offline · Local AI ready')
  assert.equal(offlineReady.topbarTone, 'offline')

  const downloadable = summariseAiReadiness({
    configured: true,
    text: 'downloadable',
    image: 'unavailable',
    online: true,
    allowCloud: false,
    cloudConfigured: true,
  })
  assert.equal(downloadable.canDownload, true)
  assert.equal(downloadable.topbarLabel, 'Set up AI (1 click)')
  assert.equal(downloadable.topbarTone, 'action')

  const cloudOnly = summariseAiReadiness({
    configured: true,
    text: 'unavailable',
    image: 'unavailable',
    online: true,
    allowCloud: true,
    cloudConfigured: true,
  })
  assert.equal(cloudOnly.topbarLabel, 'Cloud AI on')
  assert.equal(cloudOnly.topbarTone, 'neutral')
})

test('defaultRubricForCapture auto-selects single active rubric or most recently used active rubric', () => {
  let ws = newWorkspace()
  const projectId = ws.activeProjectId

  // No rubrics -> empty
  assert.equal(defaultRubricForCapture(ws, projectId), '')

  // Single active rubric -> auto-selected
  const r1 = createRubricFromTemplate('short-answer', projectId)
  ws = { ...ws, rubrics: [r1] }
  assert.equal(defaultRubricForCapture(ws, projectId), r1.id)

  // Two active rubrics and no scripts yet -> leave unassigned so lecturer chooses
  const r2 = createRubricFromTemplate('case-analysis', projectId)
  ws = { ...ws, rubrics: [r1, r2] }
  assert.equal(defaultRubricForCapture(ws, projectId), '')

  // After adding a script on r2, default follows the most recent script's active rubric
  ws = addScript(ws, {
    id: 'script-1',
    projectId,
    transcript: 'Sample answer',
    rubricId: r2.id,
  })
  assert.equal(defaultRubricForCapture(ws, projectId), r2.id)

  // Archived rubric is ignored when only one active rubric remains
  const archivedR2: Rubric = { ...r2, archivedAt: Date.now() }
  ws = { ...ws, rubrics: [r1, archivedR2] }
  assert.equal(defaultRubricForCapture(ws, projectId), r1.id)

  // Another project with no rubrics does not inherit rubrics from the first project
  ws = createProject(ws, 'BIO101')
  assert.equal(defaultRubricForCapture(ws, ws.activeProjectId), '')
})

test('all starter rubric templates create valid rubrics with fresh unique IDs', () => {
  assert.ok(STARTER_RUBRICS.length >= 3)
  for (const template of STARTER_RUBRICS) {
    const first = createRubricFromTemplate(template.id, 'project-a')
    const second = createRubricFromTemplate(template.id, 'project-a')
    assert.doesNotThrow(() => validateRubric(first))
    assert.notEqual(first.id, second.id)
    assert.notEqual(first.criteria[0].id, second.criteria[0].id)
    assert.equal(first.projectId, 'project-a')
  }
})
