import { ClipboardCopy, Cloud, Download, HardDrive, Layers, Trash2 } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { benchmarkCloudMark, canRunAi, cloudConfigured, cloudModel, draftMarkingBrief, mark, type AiTask } from '../ai/firebase'
import { benchmarkCases, quickBenchmarkCases } from '../benchmark/pack'
import { clearAiLog, formatBytes, formatSeconds, readAiLog, subscribeAiLog, summariseCalls, type AiCallRecord } from '../domain/aiLog'
import { markingBriefPayload } from '../domain/aiSchemas'
import {
  benchmarkMarkdown,
  benchmarkRows,
  failedOutcome,
  outcomeFromSuggestions,
  summariseBenchmark,
  type BenchmarkEngine,
  type BenchmarkOutcome,
} from '../domain/benchmark'
import { downloadFile } from '../domain/photo'
import { AllowCloudButton, Loading, Modal, Notice, Source, useAction } from '../ui'

const TASK_LABELS: Record<AiTask, string> = {
  transcribe: 'Transcribe script',
  mark: 'Suggest marks',
  draftFeedback: 'Draft feedback',
  followUp: 'Practice follow-up',
  draftRubric: 'Draft rubric',
  readRubricPhoto: 'Read rubric photo',
  draftPracticeQuestions: 'Draft practice questions',
  draftMarkingBrief: 'Draft key points',
  auditRubric: 'Audit rubric',
  teachingSummary: 'Teaching plan',
  compareSample: 'Second opinion (sample)',
  benchmark: 'Benchmark (cloud baseline)',
}

const MODE_BADGES: Record<AiCallRecord['mode'], string> = {
  ONLY_ON_DEVICE: 'badge badge-device',
  PREFER_ON_DEVICE: 'badge neutral',
  PREFER_IN_CLOUD: 'badge neutral',
  ONLY_IN_CLOUD: 'badge badge-cloud',
}

const FALLBACK_NOTES: Record<NonNullable<AiCallRecord['fallback']>, string> = {
  'device-unavailable': 'Cloud fallback: no device model',
  'device-error': 'Cloud retry after a device error',
  'cloud-unavailable': 'On device: cloud AI is off or offline',
  'cloud-error': 'On device after a cloud error',
}

const ENGINES: BenchmarkEngine[] = ['device', 'brief', 'cloud']
const ENGINE_HEADINGS: Record<BenchmarkEngine, string> = {
  device: 'On this device (Gemini Nano)',
  brief: 'On this device + cloud brief',
  cloud: `Cloud (${cloudModel})`,
}
const ENGINE_SHORT: Record<BenchmarkEngine, string> = { device: 'On this device', brief: 'Device + brief', cloud: 'Cloud' }

type Run = {
  at: number
  outcomes: BenchmarkOutcome[]
  /** Rubric-only cloud requests made before marking: the briefs, how long they took and their size. */
  setup?: { ms: number; cloudBytes: number; briefs: Record<string, Record<string, string>> }
}
type Runs = Partial<Record<BenchmarkEngine, Run>>
const STORE = 'marking-assistant-benchmark-v1'

function loadRuns(): Runs {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Runs
    const runs: Runs = {}
    for (const engine of ENGINES) {
      const run = saved?.[engine]
      if (run && typeof run.at === 'number' && Array.isArray(run.outcomes)) runs[engine] = run
    }
    return runs
  } catch {
    return {}
  }
}

function noteFor(call: AiCallRecord) {
  return [
    !call.ok && 'Failed',
    call.fallback && FALLBACK_NOTES[call.fallback],
    call.fictional && 'Fictional data',
  ].filter(Boolean).join(' · ')
}

export default function Inspector({ deviceReady, allowCloud, online, onAllowCloud }: {
  deviceReady: boolean; allowCloud: boolean; online: boolean; onAllowCloud?: () => Promise<void>
}) {
  const calls = useSyncExternalStore(subscribeAiLog, readAiLog)
  const session = summariseCalls(calls)
  const [runs, setRuns] = useState<Runs>(loadRuns)
  const [scope, setScope] = useState<'quick' | 'full'>('quick')
  const [progress, setProgress] = useState('')
  const [preview, setPreview] = useState<'brief' | 'cloud'>()
  const [copied, setCopied] = useState(false)
  const { run, busy, error, cancel } = useAction()
  const cases = scope === 'quick' ? quickBenchmarkCases : benchmarkCases
  const rubricCount = new Set(cases.map((item) => item.rubric.id)).size
  const cloudReady = canRunAi('benchmark', { deviceAvailable: false, allowCloud, online })
  const finished = ENGINES.filter((engine) => runs[engine])
  const columns = finished.map((engine) => ({
    heading: `${ENGINE_HEADINGS[engine]}, ${runs[engine]!.outcomes.length} scripts`,
    summary: summariseBenchmark(runs[engine]!.outcomes, runs[engine]!.setup?.cloudBytes),
  }))
  const measures = columns.length ? benchmarkRows(columns[0].summary).map((row) => row.label) : []

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(runs))
    } catch {
      // Results still show for this visit when browser storage is unavailable.
    }
  }, [runs])

  function start(engine: BenchmarkEngine) {
    const selected = cases
    void run(async (active) => {
      const outcomes: BenchmarkOutcome[] = []
      const rubrics = new Map(selected.map((item) => [item.rubric.id, item.rubric]))
      let setup: Run['setup']
      try {
        if (engine === 'brief') {
          setup = { ms: 0, cloudBytes: 0, briefs: {} }
          let written = 0
          for (const [id, rubric] of [...rubrics]) {
            if (!active()) return
            setProgress(`Writing marking brief ${++written} of ${rubrics.size} in the cloud…`)
            const brief = await draftMarkingBrief(rubric, active)
            if (brief.provenance.source !== 'cloud') {
              throw new Error('The cloud model did not write this brief, so the comparison would not be valid. Check Cloud AI in Settings and try again.')
            }
            rubrics.set(id, { ...rubric, criteria: rubric.criteria.map((criterion) => ({ ...criterion, keyPoints: brief.keyPoints[criterion.id] })) })
            setup.ms += brief.provenance.ms ?? 0
            setup.cloudBytes += brief.cloudBytes
            setup.briefs[id] = brief.keyPoints
          }
        }
        for (let index = 0; index < selected.length; index++) {
          if (!active()) return
          setProgress(`Marking script ${index + 1} of ${selected.length} ${engine === 'cloud' ? 'in the cloud' : 'on this device'}…`)
          const item = selected[index]
          const started = performance.now()
          try {
            if (engine === 'cloud') {
              const result = await benchmarkCloudMark(item.id, active)
              outcomes.push(outcomeFromSuggestions(item, result.suggestions, result.provenance.ms ?? performance.now() - started, result.cloudBytes))
            } else {
              // Both device runs use the private marking path, so no answer text leaves this browser.
              const result = await mark(rubrics.get(item.rubric.id)!, item.transcript, active)
              outcomes.push(outcomeFromSuggestions(item, result.suggestions, result.provenance.ms ?? performance.now() - started, 0))
            }
          } catch (failure) {
            if (!active()) return
            // Two failures in a row at the start mean the engine is not working, so stop and say why.
            if (index === 1 && !outcomes[0].ok) throw failure
            outcomes.push(failedOutcome(item, performance.now() - started))
          }
        }
        if (active()) setRuns((current) => ({ ...current, [engine]: { at: Date.now(), outcomes, setup } }))
      } finally {
        if (active()) setProgress('')
      }
    })
  }

  const markdown = () =>
    'Marking benchmark on fictional typed answers from `marking-test-pack/`. ' +
    'Reference marks are the pack author\'s guide, not ground truth. ' +
    'The cloud brief is written from each rubric alone, before any answer is marked.\n\n' +
    benchmarkMarkdown(columns)

  return <>
    <header className="page-heading"><div><h1>AI inspector</h1>
      <p>See where each AI request ran in this session, and measure on-device marking against cloud marking on fictional scripts.</p></div></header>

    <section className="panel form-panel">
      <div className="section-heading"><div><h2>This session</h2>
        <p>Timings and sizes only. Prompts, answers and replies are never logged, and the log clears when you reload.</p></div>
        {calls.length > 0 && <button className="button subtle" onClick={clearAiLog}><Trash2 size={16} />Clear log</button>}
      </div>
      <div className="inspector-stats">
        <div className="inspector-stat"><span>AI requests</span><strong>{session.total}</strong></div>
        <div className="inspector-stat"><span>Ran on this device</span>
          <strong>{session.onDeviceShare === undefined ? '–' : Math.round(session.onDeviceShare * 100) + '%'}</strong></div>
        <div className="inspector-stat"><span>Sent to cloud AI</span><strong>{formatBytes(session.cloudBytes)}</strong></div>
        <div className="inspector-stat"><span>Median time on device</span><strong>{formatSeconds(session.deviceMedianMs)}</strong></div>
        <div className="inspector-stat"><span>Median time in cloud</span><strong>{formatSeconds(session.cloudMedianMs)}</strong></div>
      </div>
      {!calls.length ? <Notice>No AI requests yet in this session. Run the benchmark below or use AI in the <Link to="/sample">sample workspace</Link>, and each request appears here with where it ran.</Notice> :
        <div className="table-scroll" role="region" aria-label="AI requests this session" tabIndex={0}>
          <table className="data-table">
            <thead><tr><th scope="col">Time</th><th scope="col">Request</th><th scope="col">Routing policy</th>
              <th scope="col">Ran on</th><th scope="col">Sent to cloud</th><th scope="col">Note</th></tr></thead>
            <tbody>{[...calls].reverse().map((call) => <tr key={call.id}>
              <td>{new Date(call.at).toLocaleTimeString()}</td>
              <th scope="row">{TASK_LABELS[call.task]}</th>
              <td><span className={MODE_BADGES[call.mode]}>{call.mode}</span></td>
              <td><Source value={{ source: call.source, ms: call.ms }} /></td>
              <td>{formatBytes(call.cloudBytes)}</td>
              <td>{noteFor(call)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>

    <section className="panel form-panel">
      <div className="section-heading"><div><h2>Marking benchmark</h2>
        <p>{benchmarkCases.length} fictional typed answers across 5 rubrics, each with reference marks. Device runs use the same private marking path as real scripts.</p></div></div>
      <p className="muted">The cloud brief run asks the cloud model for key points from each rubric alone, then marks every script on this device with them. No answer leaves the device in that run.</p>
      <label className="field"><span>Scripts to mark</span>
        <select value={scope} disabled={busy} onChange={(event) => setScope(event.target.value === 'full' ? 'full' : 'quick')}>
          <option value="quick">Quick run · {quickBenchmarkCases.length} scripts, 2 per rubric</option>
          <option value="full">Full run · all {benchmarkCases.length} scripts</option>
        </select>
      </label>
      {!deviceReady && <Notice>On-device AI is not ready in this browser. <Link to="/settings">Set it up in Settings</Link> to run the on-device benchmarks.</Notice>}
      {!cloudReady && <Notice>{online
        ? cloudConfigured && !allowCloud
          ? <div className="inline-confirm">
            <span>Cloud AI is off. Allow it to run the rubric-only cloud brief and fictional cloud baseline.</span>
            <div className="button-row">
              <AllowCloudButton onAllowCloud={onAllowCloud} />
              <Link className="text-link" to="/settings">Settings</Link>
            </div>
          </div>
          : <>Cloud AI is not configured. <Link to="/settings">Open settings</Link> to inspect Cloud AI configuration.</>
        : 'The cloud brief and the cloud baseline need a connection. The plain on-device run works offline.'}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {busy && progress ? <div className="button-row">
        <Loading>{progress}</Loading>
        <button className="button subtle" onClick={() => { cancel(); setProgress('') }}>Cancel</button>
      </div> : <div className="button-row">
        <button className="button primary" disabled={busy || !deviceReady} onClick={() => start('device')}><HardDrive size={17} />Run on this device</button>
        <button className="button secondary" disabled={busy || !deviceReady || !cloudReady} onClick={() => setPreview('brief')}><Layers size={17} />Run with cloud brief</button>
        <button className="button secondary" disabled={busy || !cloudReady} onClick={() => setPreview('cloud')}><Cloud size={17} />Run in cloud</button>
      </div>}

      {!columns.length ? <p className="muted">No results yet. Results stay in this browser until you clear them.</p> : <>
        <div className="table-scroll" role="region" aria-label="Benchmark results" tabIndex={0}>
          <table className="data-table">
            <thead><tr><th scope="col">Measure</th>{columns.map((column) => <th scope="col" key={column.heading}>{column.heading}</th>)}</tr></thead>
            <tbody>{measures.map((label, index) => <tr key={label}>
              <th scope="row">{label}</th>
              {columns.map((column) => <td key={column.heading}>{benchmarkRows(column.summary)[index].value}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <p className="muted">Reference marks are the test pack author’s guide, not ground truth.
          {finished.map((engine) => ` ${ENGINE_SHORT[engine]} run: ${new Date(runs[engine]!.at).toLocaleString()}.`)}
          {runs.brief?.setup && ` Writing the briefs took ${formatSeconds(runs.brief.setup.ms)} in the cloud.`}</p>
        <div className="button-row">
          <button className="button secondary" onClick={() => {
            void navigator.clipboard?.writeText(markdown()).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1800)
            })
          }}><ClipboardCopy size={16} />{copied ? 'Copied' : 'Copy as Markdown'}</button>
          <button className="button secondary" onClick={() => downloadFile(
            new Blob([JSON.stringify({ cloudModel, runs }, null, 2)], { type: 'application/json' }),
            'marking-benchmark.json',
          )}><Download size={16} />Download JSON</button>
          <button className="button subtle" disabled={busy} onClick={() => setRuns({})}><Trash2 size={16} />Clear results</button>
        </div>
        <details className="scoring-details"><summary>Results per script</summary>
          <div className="table-scroll" role="region" aria-label="Benchmark results per script" tabIndex={0}>
            <table className="data-table">
              <thead><tr><th scope="col">Script</th><th scope="col">What it tests</th><th scope="col">Reference</th>
                {finished.map((engine) => <th scope="col" key={engine}>{ENGINE_SHORT[engine]}</th>)}</tr></thead>
              <tbody>{benchmarkCases.filter((item) => finished.some((engine) => runs[engine]!.outcomes.some((outcome) => outcome.caseId === item.id)))
                .map((item) => <tr key={item.id}>
                  <th scope="row">{item.id}</th>
                  <td>{item.tests}</td>
                  <td>{item.reference.join(' · ')}</td>
                  {finished.map((engine) => {
                    const outcome = runs[engine]!.outcomes.find((row) => row.caseId === item.id)
                    return <td key={engine}>{!outcome ? '–' : !outcome.ok ? 'Failed'
                      : outcome.scores.map((score) => score ?? '?').join(' · ') + ' (' + formatSeconds(outcome.ms) + ')'}</td>
                  })}
                </tr>)}</tbody>
            </table>
          </div>
        </details>
      </>}
    </section>

    {preview === 'cloud' && <Modal title="Review cloud benchmark payload" onClose={() => setPreview(undefined)}>
      <p>Firebase receives {cases.length} bundled fictional answers with their rubrics, one request each. Nothing from your workspace is sent. This is the first request:</p>
      <pre className="payload">{JSON.stringify({ question: cases[0].rubric.question, criteria: cases[0].rubric.criteria.map(({ id, title, max, levels }) => ({ id, title, max, levels })), transcript: cases[0].transcript }, null, 2)}</pre>
      <button className="button primary" disabled={!cloudReady} onClick={() => { setPreview(undefined); start('cloud') }}>
        <Cloud size={17} />Send fictional scripts
      </button>
    </Modal>}
    {preview === 'brief' && <Modal title="Review cloud brief payload" onClose={() => setPreview(undefined)}>
      <p>Firebase receives {rubricCount} bundled fictional {rubricCount === 1 ? 'rubric' : 'rubrics'}, one request each, and no answers. The scripts are then marked on this device with the key points that come back. This is the first request:</p>
      <pre className="payload">{JSON.stringify(markingBriefPayload(cases[0].rubric), null, 2)}</pre>
      <button className="button primary" disabled={!cloudReady || !deviceReady} onClick={() => { setPreview(undefined); start('brief') }}>
        <Layers size={17} />Send fictional rubrics
      </button>
    </Modal>}
  </>
}
