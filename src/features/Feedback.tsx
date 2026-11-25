import { ArrowDownToLine, ClipboardCheck, MessageSquare, Save, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { canRunAi, draftFeedback } from '../ai/firebase'
import { downloadFile } from '../domain/photo'
import { earned, makeFeedback, MAX_FEEDBACK, scriptName, total, updateScript, type FeedbackFile, type OralQuestion, type Provenance, type Rubric, type Script, type Workspace } from '../domain/workspace'
import { Loading, Modal, Notice, Source, useAction, type Commit } from '../ui'

export function FeedbackRoute({ workspace, sample = false, ...props }: { workspace: Workspace; commit: Commit; deviceReady: boolean; base: string; sample?: boolean }) {
  const { id } = useParams()
  const script = workspace.scripts.find((row) => row.id === id)
  const rubric = workspace.rubrics.find((row) => row.id === script?.rubricId)
  if (!script?.finalisedAt || !rubric) return <Notice>Finalise the script before preparing feedback. <Link to={props.base}>Return to scripts</Link></Notice>
  return <Feedback key={script.id} script={script} rubric={rubric} allowCloud={workspace.allowCloud} sample={sample} {...props} />
}

function defaultOral(script: Script, rubric: Rubric): OralQuestion[] {
  const criteria = [...rubric.criteria].sort((a, b) => (b.max - script.marks[b.id]) - (a.max - script.marks[a.id]))
  return Array.from({ length: 3 }, (_, index) => {
    const criterion = criteria[index % criteria.length]
    const prompt = [
      criterion.practice || 'Explain ' + criterion.title + ' in your own words.',
      'Give an example that demonstrates ' + criterion.title + '.',
      'What common mistake would you avoid when explaining ' + criterion.title + '?',
    ][index]
    return { prompt, cue: criterion.levels[criterion.max] }
  })
}

function Feedback({ script, rubric, base, commit, deviceReady, allowCloud, sample }: {
  script: Script; rubric: Rubric; base: string; commit: Commit; deviceReady: boolean; allowCloud: boolean; sample: boolean
}) {
  const [tab, setTab] = useState<'feedback' | 'oral'>('feedback')
  const [feedback, setFeedback] = useState(script.feedback)
  const [oral, setOral] = useState(script.oral ?? defaultOral(script, rubric))
  const [source, setSource] = useState<Provenance | undefined>(script.feedbackSource)
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState<FeedbackFile>()
  const [confirmDraft, setConfirmDraft] = useState(false)
  const { run, busy, error, cancel } = useAction()
  const dirty = JSON.stringify(feedback) !== JSON.stringify(script.feedback) || JSON.stringify(oral) !== JSON.stringify(script.oral ?? defaultOral(script, rubric))
  const [baseline, setBaseline] = useState(script.revision)
  const canDraft = canRunAi('draftFeedback', { isSample: sample, deviceAvailable: deviceReady, allowCloud })

  useEffect(() => {
    if (!dirty) setBaseline(script.revision)
  }, [script.revision, dirty])

  function save(openPreview: boolean) {
    void run(async () => {
      const released = { ...script, feedback, oral }
      await commit((current) => updateScript(current, script.id, baseline, (record) => {
        if (!record.finalisedAt) throw new Error('The marks were reopened. Finalise them before releasing feedback.')
        return { ...record, feedback, oral, feedbackSource: source }
      }))
      setBaseline(baseline + 1)
      setSaved(true)
      if (openPreview) setPreview(makeFeedback(released, rubric))
    })
  }

  function runAiDraft() {
    setConfirmDraft(false)
    void run(async (active) => {
      const draft = await draftFeedback(rubric, script.transcript, script.marks, active, { allowCloudFallback: sample })
      if (active()) {
        setFeedback(Object.fromEntries(draft.feedback.map((row) => [row.id, row.text])))
        setOral(draft.oral)
        setSource(draft.provenance)
        setSaved(false)
      }
    })
  }

  return <>
    <Link className="back-link" to={base + '/scripts/' + script.id}>{scriptName(script)}</Link>
    <header className="page-heading">
      <div><h1>Feedback & oral prep</h1><p>{rubric.title} · {scriptName(script)} · {earned(script, rubric)} / {total(rubric)} marks</p></div>
      {canDraft && <button className="button secondary" disabled={busy} onClick={() => {
        if (Object.values(feedback).some(Boolean) || dirty) {
          setConfirmDraft(true)
          return
        }
        runAiDraft()
      }}><Sparkles size={17} />{deviceReady ? 'Draft with on-device AI' : 'Draft (Hybrid AI · sample)'}</button>}
    </header>
    <section className="panel form-panel">
      <div className="section-heading"><div className="segmented" aria-label="Feedback view">
        <button aria-pressed={tab === 'feedback'} onClick={() => setTab('feedback')}><ClipboardCheck size={16} />Feedback</button>
        <button aria-pressed={tab === 'oral'} onClick={() => setTab('oral')}><MessageSquare size={16} />Oral follow-up</button>
      </div>{source && <Source value={source} />}</div>
      {tab === 'feedback' ? <>
        <p className="muted">Write practical next steps for each criterion. The student sees only the material in the release preview.</p>
        {rubric.criteria.map((criterion) => <label className="field" key={criterion.id}>
          <span>{criterion.title} <small>{script.marks[criterion.id]} / {criterion.max}</small></span>
          <textarea rows={3} value={feedback[criterion.id] ?? ''} maxLength={MAX_FEEDBACK} disabled={busy} placeholder="What should the student keep doing or practise?"
            onChange={(event) => { setSaved(false); setFeedback({ ...feedback, [criterion.id]: event.target.value }) }} />
        </label>)}
      </> : <>
        <p className="muted">Edit three questions and their examiner cues. These stay in the lecturer’s workspace.</p>
        {oral.map((row, index) => <article className="criterion-card oral-card" key={index}>
          <label className="field"><span>Question {index + 1}</span><input value={row.prompt} maxLength={240} disabled={busy}
            onChange={(event) => { setSaved(false); setOral(oral.map((item, number) => number === index ? { ...item, prompt: event.target.value } : item)) }} /></label>
          <label className="field"><span>Examiner cue</span><textarea rows={2} value={row.cue} maxLength={MAX_FEEDBACK} disabled={busy}
            onChange={(event) => { setSaved(false); setOral(oral.map((item, number) => number === index ? { ...item, cue: event.target.value } : item)) }} /></label>
        </article>)}
      </>}
      {error && <Notice error>{error}</Notice>}
      {saved && !dirty && <Notice>Feedback saved on this device.</Notice>}
      {busy && <div className="button-row"><Loading>Working on feedback…</Loading><button className="button subtle" onClick={cancel}>Dismiss progress</button></div>}
      <footer className="form-actions">
        <button className="button secondary" disabled={busy} onClick={() => save(false)}><Save size={17} />Save draft</button>
        <button className="button primary" disabled={busy} onClick={() => save(true)}>Preview student feedback</button>
      </footer>
    </section>
    {preview && <Modal title="Student feedback preview" onClose={() => setPreview(undefined)}>
      <p>Check the released text for identifying details or quoted work before downloading.</p>
      <h3>{preview.title}</h3>
      {preview.criteria.map((row, index) => <div className="release-row" key={index}>
        <strong>{row.title} · {row.score} / {row.max}</strong>
        {row.feedback && <p>{row.feedback}</p>}
        <p><small>Practice</small> {row.prompt}</p>
        <p><small>Self-check</small> {row.cue}</p>
      </div>)}
      <button className="button primary" onClick={() => {
        downloadFile(new Blob([JSON.stringify(preview, null, 2)], { type: 'application/json' }), 'marking-feedback.json')
        setPreview(undefined)
      }}><ArrowDownToLine size={17} />Export feedback</button>
    </Modal>}
    {confirmDraft && <Modal title="Replace current feedback?" onClose={() => setConfirmDraft(false)}>
      <p>Replace the current notes and oral follow-up questions with an AI draft?</p>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={() => setConfirmDraft(false)}>Cancel</button>
        <button type="button" className="button primary" disabled={busy} onClick={runAiDraft}>Replace with draft</button>
      </div>
    </Modal>}
  </>
}
