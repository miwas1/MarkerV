import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { clearAiLog, formatBytes, percentile, readAiLog, recordAiCall, subscribeAiLog, summariseCalls } from '../src/domain/aiLog.ts'
import { selectAiRoute } from '../src/domain/aiRouting.ts'
import { briefKeyPoints, isCloudFormatError, markingBriefPayload } from '../src/domain/aiSchemas.ts'
import {
  benchmarkMarkdown, benchmarkRows, failedOutcome, outcomeFromSuggestions, summariseBenchmark, type BenchmarkItem,
} from '../src/domain/benchmark.ts'
import { MAX_ANSWER, MAX_CRITERIA, MAX_KEY_POINTS, validateSuggestions, type Rubric } from '../src/domain/workspace.ts'

test('session log records where each request ran without holding content', () => {
  clearAiLog()
  let notified = 0
  const unsubscribe = subscribeAiLog(() => { notified++ })

  const local = recordAiCall({ task: 'mark', mode: 'ONLY_ON_DEVICE', source: 'device', ms: 4200, ok: true, cloudBytes: 999, fictional: false })
  recordAiCall({ task: 'auditRubric', mode: 'ONLY_IN_CLOUD', source: 'cloud', ms: 900, ok: true, cloudBytes: 1500, fictional: false })
  recordAiCall({ task: 'mark', mode: 'PREFER_ON_DEVICE', source: 'cloud', ms: 1100, ok: true, cloudBytes: 2500, fictional: true, fallback: 'device-unavailable' })
  recordAiCall({ task: 'transcribe', mode: 'ONLY_ON_DEVICE', source: 'device', ms: 300, ok: false, cloudBytes: 0, fictional: false })

  // A request that ran on the device can never report bytes sent to the cloud.
  assert.equal(local.cloudBytes, 0)
  assert.deepEqual(Object.keys(local).sort(), ['at', 'cloudBytes', 'fictional', 'id', 'mode', 'ms', 'ok', 'source', 'task'])
  assert.equal(notified, 4)

  const summary = summariseCalls(readAiLog())
  assert.equal(summary.total, 4)
  assert.equal(summary.device, 1)
  assert.equal(summary.cloud, 2)
  assert.equal(summary.failed, 1)
  assert.equal(summary.onDeviceShare, 1 / 3)
  assert.equal(summary.cloudBytes, 4000)
  assert.equal(summary.deviceMedianMs, 4200)
  assert.equal(summary.cloudMedianMs, 900)

  unsubscribe()
  for (let index = 0; index < 250; index++) {
    recordAiCall({ task: 'mark', mode: 'ONLY_ON_DEVICE', source: 'device', ms: 1, ok: true, cloudBytes: 0, fictional: true })
  }
  assert.equal(readAiLog().length, 200)
  assert.equal(notified, 4)
  clearAiLog()
  assert.equal(readAiLog().length, 0)
  assert.equal(summariseCalls([]).onDeviceShare, undefined)

  assert.equal(percentile([], 50), undefined)
  assert.equal(percentile([5, 1, 3], 50), 3)
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10)
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(31_400), '31.4 kB')
})

test('benchmark scoring compares suggestions with reference marks and evidence checks', () => {
  const rubric: Rubric = {
    id: 'r', series: 'r', version: 1, title: 'Threads', question: 'Describe a thread.',
    criteria: [
      { id: 'c1', title: 'Definition', max: 2, levels: ['Missing', 'Partial', 'Full'], practice: '' },
      { id: 'c2', title: 'Memory', max: 2, levels: ['Missing', 'Partial', 'Full'], practice: '' },
    ],
  }
  const item = (id: string, kind: BenchmarkItem['kind'], reference: number[]): BenchmarkItem =>
    ({ id, kind, reference, criterionIds: ['c1', 'c2'] })
  const transcript = 'A thread runs inside a process. Threads share memory.'
  const suggest = (marks: Array<{ id: string; score: number | null; quote: string }>) =>
    validateSuggestions(marks.map((row) => ({ ...row, reason: 'r' })), rubric, transcript)

  const outcomes = [
    // Matches the reference exactly, with both quotes verified.
    outcomeFromSuggestions(item('a', 'typed', [2, 1]), suggest([
      { id: 'c1', score: 2, quote: 'A thread runs inside a process.' },
      { id: 'c2', score: 1, quote: 'Threads share memory.' },
    ]), 4000, 0),
    // One mark out on c1 with an invented quote; declines to score c2.
    outcomeFromSuggestions(item('b', 'borderline', [2, 2]), suggest([
      { id: 'c1', score: 1, quote: 'This sentence is not in the answer.' },
      { id: 'c2', score: null, quote: '' },
    ]), 6000, 0),
    // Injection answer correctly held at zero with no evidence.
    outcomeFromSuggestions(item('c', 'injection', [0, 0]), suggest([
      { id: 'c1', score: 0, quote: '' },
      { id: 'c2', score: 0, quote: '' },
    ]), 2000, 0),
    // Off-topic answer wrongly given a mark.
    outcomeFromSuggestions(item('d', 'off-topic', [0, 0]), suggest([
      { id: 'c1', score: 1, quote: 'Threads share memory.' },
      { id: 'c2', score: 0, quote: '' },
    ]), 8000, 0),
    failedOutcome(item('e', 'short', [1, 1]), 500),
  ]

  const summary = summariseBenchmark(outcomes)
  assert.equal(summary.attempted, 5)
  assert.equal(summary.completed, 4)
  assert.equal(summary.criteria, 8)
  assert.equal(summary.exact, 5)
  assert.equal(summary.withinOne, 7)
  assert.equal(summary.abstained, 1)
  assert.equal(summary.acceptable, 6)
  assert.equal(summary.scriptsWithinOne, 3)
  assert.deepEqual([summary.injectionHeld, summary.injectionTotal], [1, 1])
  assert.deepEqual([summary.offTopicZero, summary.offTopicTotal], [0, 1])
  assert.equal(summary.medianMs, 4000)
  assert.equal(summary.p95Ms, 8000)

  const rows = Object.fromEntries(benchmarkRows(summary).map((row) => [row.label, row.value]))
  assert.equal(rows['Scripts marked'], '4 of 5')
  assert.equal(rows['Criterion marks matching the reference'], '63%')
  assert.equal(rows['Student answers sent to the cloud'], '0 of 5')
  assert.equal(rows['Data sent to the cloud'], '0 B')

  // A brief run sends rubric-only setup requests but no answers; a cloud run sends every answer.
  const withBrief = summariseBenchmark(outcomes, 1200)
  assert.deepEqual([withBrief.answersSent, withBrief.cloudBytes], [0, 1200])
  const cloudRun = summariseBenchmark(outcomes.map((outcome) => ({ ...outcome, cloudBytes: 800 })))
  assert.deepEqual([cloudRun.answersSent, cloudRun.cloudBytes], [5, 4000])
  assert.equal(benchmarkRows(summariseBenchmark([]))[1].value, '–')

  const markdown = benchmarkMarkdown([{ heading: 'On this device', summary }, { heading: 'Cloud', summary }])
  assert.match(markdown, /^\| Measure \| On this device \| Cloud \|\n\| --- \| --- \| --- \|\n/)
  assert.match(markdown, /\| Scripts marked \| 4 of 5 \| 4 of 5 \|/)
  assert.equal(benchmarkMarkdown([]), '')
})

test('benchmark fixture and routing keep the cloud baseline to bundled fictional answers', () => {
  const pack = JSON.parse(readFileSync(new URL('../src/benchmark/pack.json', import.meta.url), 'utf8')) as {
    projects: Array<{ id: string; rubric: { question: string; criteria: Array<{ id: string; max: number; levels: string[] }> } }>
    cases: Array<{ id: string; projectId: string; transcript: string; reference: number[] }>
  }
  assert.equal(pack.projects.length, 5)
  assert.equal(pack.cases.length, 25)
  assert.equal(new Set(pack.cases.map((item) => item.id)).size, 25)
  for (const project of pack.projects) {
    assert.ok(project.rubric.question.length > 20)
    assert.ok(project.rubric.criteria.length >= 1 && project.rubric.criteria.length <= MAX_CRITERIA)
    for (const criterion of project.rubric.criteria) assert.equal(criterion.levels.length, criterion.max + 1)
  }
  for (const item of pack.cases) {
    const criteria = pack.projects.find((project) => project.id === item.projectId)!.rubric.criteria
    assert.ok(item.transcript.length > 0 && item.transcript.length <= MAX_ANSWER)
    assert.equal(item.reference.length, criteria.length)
    item.reference.forEach((score, index) => assert.ok(Number.isInteger(score) && score >= 0 && score <= criteria[index].max))
  }

  // The cloud baseline is cloud-only: it never runs, or falls back, without the lecturer's cloud opt-in.
  const ready = selectAiRoute({ task: 'benchmark', isSample: true, deviceAvailable: true, allowCloud: true, cloudConfigured: true, online: true })
  assert.deepEqual([ready.mode, ready.canRun, ready.tryDeviceFirst], ['ONLY_IN_CLOUD', true, false])
  for (const blocked of [{ allowCloud: false }, { cloudConfigured: false }, { online: false }]) {
    const route = selectAiRoute({ task: 'benchmark', isSample: true, deviceAvailable: true, allowCloud: true, cloudConfigured: true, online: true, ...blocked })
    assert.equal(route.canRun, false)
    assert.ok(route.blockedReason)
  }
})

test('marking brief is cloud-first with a device fallback and never carries private fields', () => {
  const base = { task: 'draftMarkingBrief' as const, isSample: false, deviceAvailable: true, allowCloud: true, cloudConfigured: true, online: true }

  const cloudFirst = selectAiRoute(base)
  assert.deepEqual(
    [cloudFirst.mode, cloudFirst.canRun, cloudFirst.tryDeviceFirst, cloudFirst.allowCloudFallback, cloudFirst.allowDeviceFallback],
    ['PREFER_IN_CLOUD', true, false, true, true],
  )
  // No device model: the cloud still runs, but nothing can take over if it fails.
  assert.equal(selectAiRoute({ ...base, deviceAvailable: false }).allowDeviceFallback, false)
  // Cloud AI off, App Check missing or offline: the request goes straight to the device and never to the cloud.
  for (const change of [{ allowCloud: false }, { cloudConfigured: false }, { online: false }]) {
    const local = selectAiRoute({ ...base, ...change })
    assert.deepEqual([local.mode, local.canRun, local.tryDeviceFirst, local.allowCloudFallback], ['PREFER_IN_CLOUD', true, true, false])
    const blocked = selectAiRoute({ ...base, ...change, deviceAvailable: false })
    assert.equal(blocked.canRun, false)
    assert.ok(blocked.blockedReason)
  }

  const rubric: Pick<Rubric, 'title' | 'question' | 'criteria'> = {
    title: '  Threads  ', question: 'Describe a thread.',
    criteria: [
      { id: 'private-id-1', title: 'Definition', max: 2, levels: ['Missing', 'Partial', 'Full'], practice: 'Secret practice', keyPoints: 'Lecturer-only notes' },
      { id: 'private-id-2', title: 'Memory', max: 1, levels: ['Missing', 'Shares memory'], practice: '' },
    ],
  }
  const payload = markingBriefPayload(rubric)
  assert.equal(payload.title, 'Threads')
  assert.deepEqual(payload.criteria.map((criterion) => criterion.criterion), [1, 2])
  assert.deepEqual(Object.keys(payload.criteria[0]).sort(), ['criterion', 'levels', 'max', 'title'])
  assert.doesNotMatch(JSON.stringify(payload), /private-id|Secret practice|Lecturer-only/)

  assert.deepEqual(
    briefKeyPoints({ briefs: [{ criterion: 2, keyPoints: ' Shares the address space. ' }, { criterion: 1, keyPoints: 'Runs inside a process.' }] }, 2),
    ['Runs inside a process.', 'Shares the address space.'],
  )
  assert.equal(briefKeyPoints({ briefs: [{ criterion: 1, keyPoints: 'x'.repeat(2000) }] }, 1)[0].length, MAX_KEY_POINTS)
  for (const bad of [
    { briefs: [{ criterion: 1, keyPoints: 'Only one.' }] },
    { briefs: [{ criterion: 1, keyPoints: 'A' }, { criterion: 1, keyPoints: 'B' }] },
    { briefs: [{ criterion: 1, keyPoints: 'A' }, { criterion: 3, keyPoints: 'B' }] },
    { briefs: [{ criterion: 1, keyPoints: 'A' }, { criterion: 2, keyPoints: '   ' }] },
    { notes: 'wrong shape' },
  ]) {
    assert.throws(() => briefKeyPoints(bad, 2), (error: unknown) => isCloudFormatError(error))
  }
})
