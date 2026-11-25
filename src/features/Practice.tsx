import { BookOpen, CheckCircle2, FileUp, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { canRunAi, cloudConfigured, followUp } from '../ai/firebase'
import { FeedbackFile, type Provenance } from '../domain/workspace'
import { Loading, Notice, Source, useAction } from '../ui'

type Turn = { prompt: string; reply: string; cue: string }
export function Practice({ deviceReady, allowCloud = false, initial, sample = false }: {
  deviceReady: boolean; allowCloud?: boolean; initial?: FeedbackFile; sample?: boolean
}) {
  const [file, setFile] = useState<FeedbackFile | undefined>(initial)
  const [selected, setSelected] = useState<number>()
  const input = useRef<HTMLInputElement>(null)
  const { run, busy, error } = useAction()

  return <>
    <header className="page-heading">
      <div><h1>Student practice</h1><p>Open your feedback and work on one criterion at a time.</p></div>
      {file && <button className="button secondary" onClick={() => input.current?.click()}><FileUp size={17} />Open another file</button>}
    </header>
    <input className="visually-hidden" tabIndex={-1} ref={input} type="file" accept=".json,application/json" aria-label="Choose feedback file"
      onChange={(event) => {
        const document = event.target.files?.[0]
        event.target.value = ''
        if (document) void run(async () => {
          if (document.size > 64000) throw new Error('This file is too large to be a feedback export.')
          try {
            setFile(FeedbackFile.parse(JSON.parse(await document.text())))
            setSelected(undefined)
          } catch {
            throw new Error('Choose a valid Marking Assistant feedback file.')
          }
        })
      }} />
    {sample && allowCloud && cloudConfigured && (
      <Notice>
        Cloud AI is on. Text you type in this sample can be sent to Cloud Gemini. Do not paste real student work.
      </Notice>
    )}
    {error && <Notice error>{error}</Notice>}
    {!file ? <section className="panel empty-state">
      <span className="empty-icon"><BookOpen size={27} /></span><h2>Open your feedback</h2>
      <p>Choose the feedback file from your lecturer. It opens locally in this browser.</p>
      <button className="button primary" disabled={busy} onClick={() => input.current?.click()}><FileUp size={17} />Open feedback file</button>
    </section> : <>
      <section className="panel form-panel">
        <div className="section-heading"><h2>{file.title}</h2><span className="badge neutral">
          {file.criteria.reduce((sum, row) => sum + row.score, 0)} / {file.criteria.reduce((sum, row) => sum + row.max, 0)} marks
        </span></div>
        {file.criteria.map((row, index) => <div className="practice-row" key={index}>
          <div><h3>{row.title}</h3><p>{row.score} / {row.max}{row.feedback ? ' · ' + row.feedback : ''}</p></div>
          <button aria-pressed={selected === index} className={'button ' + (selected === index ? 'primary' : 'secondary')}
            onClick={() => setSelected(index)}>Practise</button>
        </div>)}
      </section>
      {selected !== undefined && <PracticeSession key={selected} criterion={file.criteria[selected]} deviceReady={deviceReady} allowCloud={allowCloud} sample={sample} />}
    </>}
  </>
}

function PracticeSession({ criterion, deviceReady, allowCloud, sample }: {
  criterion: FeedbackFile['criteria'][number]; deviceReady: boolean; allowCloud: boolean; sample: boolean
}) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [reply, setReply] = useState('')
  const [adaptive, setAdaptive] = useState(false)
  const [next, setNext] = useState<{ prompt: string; cue: string; provenance?: Provenance }>({ prompt: criterion.prompt, cue: criterion.cue })
  const { run, busy, error, cancel } = useAction()
  const complete = turns.length >= 3
  const sampleHybridAvailable = sample && allowCloud && cloudConfigured
  const canUseAdaptive = canRunAi('followUp', { isSample: sample, deviceAvailable: deviceReady, allowCloud })
  const fallback = [
    'Apply that idea to a concrete example. Walk through your reasoning.',
    'What might a learner get wrong about this idea? Explain how you would correct it.',
  ]
  async function advance(active: () => boolean, useAi: boolean) {
    if (!reply.trim()) return
    const newTurns = [...turns, { prompt: next.prompt, reply: reply.trim(), cue: next.cue }]
    const upcoming = newTurns.length < 3 && useAi
      ? await followUp(criterion.title, criterion.cue, newTurns, active, { allowCloudFallback: sample })
      : { prompt: fallback[newTurns.length - 1] ?? '', cue: criterion.cue }
    if (!active()) return
    setTurns(newTurns)
    setNext(upcoming)
    setReply('')
  }

  return <section className="panel form-panel practice-session">
    <div className="section-heading"><h2>{criterion.title}</h2>
      <span className="badge neutral">{complete ? 'Complete' : 'Turn ' + (turns.length + 1) + ' of 3'}</span>
    </div>
    {canUseAdaptive && !complete && <label className="switch-row"><input type="checkbox" checked={adaptive} disabled={busy}
      onChange={(event) => setAdaptive(event.target.checked)} /><span>{sampleHybridAvailable ? 'Adaptive follow-ups (Hybrid AI · fictional sample)' : 'Adaptive follow-ups on this device'}</span></label>}
    {!!turns.length && <details className="scoring-details"><summary>Previous answers and self-checks</summary>
      {turns.map((turn, index) => <div className="release-row" key={index}><strong>{turn.prompt}</strong><p>{turn.reply}</p><p>Self-check: {turn.cue}</p></div>)}
    </details>}
    {complete ? <>
      <Notice><CheckCircle2 size={17} /> You finished three practice turns. Compare your answers with the self-check and try explaining the idea again.</Notice>
      <button className="button secondary" onClick={() => { setTurns([]); setNext({ prompt: criterion.prompt, cue: criterion.cue }) }}>Practise again</button>
    </> : <form className="form-panel embedded" onSubmit={(event) => { event.preventDefault(); void run((active) => advance(active, adaptive)) }}>
      {next.provenance && <Source value={next.provenance} />}
      <label className="field"><span>{next.prompt}</span>
        <textarea rows={4} maxLength={1200} value={reply} disabled={busy} onChange={(event) => setReply(event.target.value)}
          placeholder="Type your answer in your own words." />
      </label>
      {error && <Notice error>{error}</Notice>}
      {busy && <Loading>Preparing a follow-up…</Loading>}
      <div className="button-row">
        <button className="button primary" disabled={busy || !reply.trim()} type="submit">
          {adaptive && <Sparkles size={17} />}{turns.length === 2 ? 'Finish practice' : 'Next question'}
        </button>
        {busy && <button className="button subtle" type="button" onClick={cancel}>Cancel follow-up</button>}
        {error && <button className="button secondary" type="button" disabled={busy} onClick={() => { void run((active) => advance(active, false)) }}>Continue with guided practice</button>}
      </div>
    </form>}
  </section>
}
