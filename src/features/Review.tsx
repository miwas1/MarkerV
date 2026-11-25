import { ArrowDownToLine, Camera, Check, FileText, Flag, LockKeyhole, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { canRunAi, cloudConfigured, mark, transcribe, type DeviceStatus } from '../ai/firebase'
import { DeviceAiHelper } from '../components/DeviceAiHelper'
import { downloadFile } from '../domain/photo'
import { canAccept, earned, latestOf, latestRubrics, levelText, MAX_ANSWER, resetReview, reviewedCount, scriptName, scriptSourceLabel, statusOf, total, updateScript, type Evidence, type Provenance, type Rubric, type Script, type Workspace } from '../domain/workspace'
import { Loading, Modal, Notice, Source, useAction, useObjectUrl, type Commit } from '../ui'

export function ReviewRoute(props: {
  workspace: Workspace
  commit: Commit
  deviceReady: boolean
  imageReady: boolean
  textStatus?: DeviceStatus
  imageStatus?: DeviceStatus
  refreshDevice?: () => Promise<void>
  base: string
  comparison?: ReactNode
  sample?: boolean
}) {
  const { id } = useParams()
  const script = props.workspace.scripts.find((row) => row.id === id)
  if (!script) return <Notice error>Script unavailable. <Link to={props.base}>Return to scripts</Link></Notice>
  return <Review key={script.id} script={script} {...props} />
}

function Review({ script, workspace, commit, deviceReady, imageReady, textStatus, imageStatus, refreshDevice, base, comparison, sample = false }: {
  script: Script
  workspace: Workspace
  commit: Commit
  deviceReady: boolean
  imageReady: boolean
  textStatus?: DeviceStatus
  imageStatus?: DeviceStatus
  refreshDevice?: () => Promise<void>
  base: string
  comparison?: ReactNode
  sample?: boolean
}) {
  const navigate = useNavigate()
  const [text, setText] = useState(script.transcript)
  const [answerView, setAnswerView] = useState<'transcript' | 'photo'>('transcript')
  const [mobileView, setMobileView] = useState<'answer' | 'review'>('answer')
  const [provenance, setProvenance] = useState<Provenance>()
  const [evidence, setEvidence] = useState<Evidence>()
  const [selection, setSelection] = useState<Evidence>()
  const [dialog, setDialog] = useState<
    | 'export'
    | 'delete'
    | 'reopen'
    | 'change-assignment'
    | 'upgrade-rubric'
    | 'confirm-save-transcript'
    | 'confirm-replace-transcript'
    | 'confirm-edit-transcript'
  >()
  const [pendingConfirmTranscript, setPendingConfirmTranscript] = useState(false)
  const [nextAssignment, setNextAssignment] = useState('')
  const [pendingMark, setPendingMark] = useState<{ criterionId: string; score: number }>()
  const [generating, setGenerating] = useState(false)
  const [markProgress, setMarkProgress] = useState<{ current: number; total: number }>()
  const { busy, error, run, cancel } = useAction()
  const highlight = useRef<HTMLElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const viewScroll = useRef({ answer: 0, review: 0 })
  const photo = useObjectUrl(script.photo)
  const scriptProjectId = script.projectId ?? workspace.activeProjectId
  const scriptProject = workspace.projects.find((p) => p.id === scriptProjectId)
  const latestScopedRubrics = latestRubrics(workspace, scriptProjectId)
  const rubric = workspace.rubrics.find((row) => row.id === script.rubricId)
  const latestRubricVersion = rubric ? latestOf(workspace, rubric) : undefined
  const newerVersionAvailable = Boolean(
    rubric && !script.finalisedAt && latestRubricVersion && latestRubricVersion.id !== rubric.id,
  )
  const currentRubricMissingFromPicker = Boolean(
    rubric && !latestScopedRubrics.some((item) => item.id === rubric.id),
  )
  const reviewed = rubric ? reviewedCount(script, rubric) : 0
  const textChanged = text.trim() !== script.transcript
  const canEdit = !script.finalisedAt
  const confirmed = script.confirmed && !textChanged
  const feedbackPath = base + '/scripts/' + script.id + '/feedback'
  const sampleCloudReady = sample && workspace.allowCloud && cloudConfigured
  const canTranscribe = canRunAi('transcribe', { isSample: sample, deviceAvailable: imageReady, allowCloud: workspace.allowCloud })
  const canSuggestMarks = canRunAi('mark', { isSample: sample, deviceAvailable: deviceReady, allowCloud: workspace.allowCloud })
  const isHeuristicProvenance = script.provenance?.source === 'heuristic'

  useEffect(() => {
    setText(script.transcript)
    setEvidence(undefined)
    setSelection(undefined)
    setProvenance(undefined)
  }, [script.transcript])

  useEffect(() => {
    if (!evidence || answerView !== 'transcript' || mobileView !== 'answer') return
    highlight.current?.focus({ preventScroll: true })
    highlight.current?.scrollIntoView({ block: 'center' })
  }, [evidence, answerView, mobileView])

  useEffect(() => {
    if (!confirmed || !canEdit) return
    function selectPassage() {
      const current = window.getSelection()
      const container = transcript.current
      if (!container || !current || current.rangeCount !== 1 || current.isCollapsed) return
      const range = current.getRangeAt(0)
      if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return
      const quote = range.toString()
      if (!quote.trim() || quote.length > 600) return
      const preceding = range.cloneRange()
      preceding.selectNodeContents(container)
      preceding.setEnd(range.startContainer, range.startOffset)
      const start = preceding.toString().length
      if (script.transcript.slice(start, start + quote.length) === quote) setSelection({ start, quote })
    }
    document.addEventListener('selectionchange', selectPassage)
    return () => document.removeEventListener('selectionchange', selectPassage)
  }, [confirmed, canEdit, script.transcript])

  async function change(update: (current: Script) => Script) {
    await commit((current) => updateScript(current, script.id, script.revision, update))
  }

  function commitTranscript(confirm: boolean) {
    void run(async () => {
      if (!text.trim() && confirm) throw new Error('Enter a transcript before confirming it.')
      await change((current) => textChanged
        ? { ...resetReview(current, { transcript: text.trim(), confirmed: confirm }), transcriptSource: provenance }
        : { ...current, confirmed: confirm || current.confirmed })
      setDialog(undefined)
      if (confirm) setMobileView('review')
    })
  }

  function saveTranscript(confirm: boolean) {
    if (!text.trim() && confirm) {
      commitTranscript(confirm)
      return
    }
    if (textChanged && (reviewed > 0 || script.suggestions)) {
      setPendingConfirmTranscript(confirm)
      setDialog('confirm-save-transcript')
      return
    }
    commitTranscript(confirm)
  }

  function runTranscribeDraft() {
    setDialog(undefined)
    startGeneration(async (active) => {
      if (!script.photo) return
      const result = await transcribe(script.photo, active, { allowCloudFallback: sample })
      if (active()) { setText(result.transcript); setProvenance(result.provenance) }
    })
  }

  function enterTranscriptEdit() {
    setDialog(undefined)
    void run(async () => {
      await change((current) => resetReview(current, { confirmed: false }))
      setEvidence(undefined)
      setSelection(undefined)
    })
  }

  function assign(rubricId: string) {
    void run(async () => {
      await change((current) => resetReview(current, { rubricId: rubricId || undefined }))
      setDialog(undefined)
    })
  }

  function saveMark(criterionId: string, score: number) {
    void run(async () => {
      setPendingMark({ criterionId, score })
      try {
        await change((current) => ({ ...current, marks: { ...current.marks, [criterionId]: score } }))
      } finally {
        setPendingMark(undefined)
      }
    })
  }

  function startGeneration(action: (active: () => boolean) => Promise<void>) {
    void run(async (active) => {
      setGenerating(true)
      setMarkProgress(undefined)
      try { await action(active) } finally { if (active()) { setGenerating(false); setMarkProgress(undefined) } }
    })
  }

  function showEvidence(start: number, quote: string) {
    setEvidence({ start, quote })
    setAnswerView('transcript')
    setMobileView('answer')
  }

  function switchView(view: 'answer' | 'review') {
    if (view === mobileView) return
    viewScroll.current[mobileView] = window.scrollY
    setMobileView(view)
    requestAnimationFrame(() => window.scrollTo(0, viewScroll.current[view]))
  }

  function actionHeading(assessment: Rubric) {
    return <div className="section-heading"><div><h2>Review marks</h2><p>{assessment.title} · Version {assessment.version}</p></div>
      {script.provenance && <Source value={script.provenance} />}
    </div>
  }

  return <>
    <Link className="back-link" to={base}>Scripts</Link>
    <header className="page-heading review-heading"><div><h1>{scriptName(script)}</h1>
      <p>{scriptProject ? scriptProject.name + ' · ' : ''}{scriptSourceLabel(script)}{script.sourceFile?.name ? ' (' + script.sourceFile.name + ')' : ''} · {statusOf(script)}</p></div>
      <div className="button-row">
        {script.photo && <button className="button secondary" onClick={() => setDialog('export')}><ArrowDownToLine size={17} />Export photo for desktop</button>}
        <button className="icon-button danger-icon" aria-label="Delete script" onClick={() => setDialog('delete')}><Trash2 size={19} /></button>
      </div>
    </header>
    <div className="panel assignment-strip">
      <label className="field"><span>Rubric</span>
        <select aria-label="Rubric" disabled={busy || !canEdit} value={script.rubricId ?? ''} onChange={(event) => {
          if (reviewed || script.suggestions) { setNextAssignment(event.target.value); setDialog('change-assignment') }
          else assign(event.target.value)
        }}>
          <option value="">Choose a rubric</option>
          {currentRubricMissingFromPicker && rubric && (
            <option value={rubric.id}>
              {rubric.title} · v{rubric.version} ({rubric.archivedAt ? 'archived' : 'older'})
            </option>
          )}
          {latestScopedRubrics.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}
        </select>
      </label>
      {!rubric && <Link className="button secondary" to={base + '/rubric'}>Create rubric</Link>}
    </div>
    <div className="mobile-review-tabs segmented" aria-label="Review view">
      <button aria-pressed={mobileView === 'answer'} onClick={() => switchView('answer')}>Answer</button>
      <button aria-pressed={mobileView === 'review'} onClick={() => switchView('review')}>Review</button>
    </div>
    {sampleCloudReady && (
      <Notice>
        Cloud AI is on. Text you type in this sample can be sent to Cloud Gemini. Do not paste real student work.
      </Notice>
    )}
    {error && <Notice error>{error}</Notice>}
    <div className="review-grid">
      <section className={'panel form-panel answer-pane' + (mobileView === 'answer' ? ' mobile-selected' : '')}>
        <div className="section-heading"><h2>Answer</h2>{script.photo && <div className="segmented" aria-label="Answer source">
          <button aria-pressed={answerView === 'transcript'} onClick={() => setAnswerView('transcript')}><FileText size={16} />Transcript</button>
          <button aria-pressed={answerView === 'photo'} onClick={() => setAnswerView('photo')}><Camera size={16} />Photo</button>
        </div>}</div>
        {answerView === 'photo' && photo ? <div className="photo-preview"><img src={photo} alt="Original saved script" /></div> : <>
          {script.photo && canEdit && !confirmed && <>
            {canTranscribe ? <button className="button secondary" disabled={busy || textChanged} onClick={() => {
              if (script.transcript) {
                setDialog('confirm-replace-transcript')
                return
              }
              runTranscribeDraft()
            }}><Sparkles size={17} />{imageReady ? 'Transcribe on this device' : 'Transcribe (Hybrid AI · sample)'}</button> :
              <Notice>
                {sample
                  ? <>Transcribe manually, prepare desktop Chrome for on-device AI, or <Link to="/settings">allow Cloud AI in Settings</Link> to try hybrid transcription on this fictional script.</>
                  : <>Transcribe manually, or prepare desktop Chrome for assisted transcription. <Link to="/settings">AI settings</Link></>}
              </Notice>}
          </>}
          {(provenance ?? script.transcriptSource) && <Source value={(provenance ?? script.transcriptSource)!} />}
          {confirmed && !textChanged ? <div className="answer-text" ref={transcript}>
            {evidence ? <>{text.slice(0, evidence.start)}<mark ref={highlight} tabIndex={-1}>{evidence.quote}</mark>{text.slice(evidence.start + evidence.quote.length)}</> : text}
          </div> : <label className="field"><span>Transcript</span><textarea rows={10} className="transcript-input"
            value={text} maxLength={MAX_ANSWER} disabled={!canEdit || busy} onChange={(event) => setText(event.target.value)}
            placeholder="Type the answer as written. Remove identifying details before confirming." /></label>}
          {canEdit && <div className="button-row">
            {confirmed ? <button className="button secondary" disabled={busy} onClick={() => {
              if (reviewed > 0 || script.suggestions) {
                setDialog('confirm-edit-transcript')
                return
              }
              enterTranscriptEdit()
            }}>Edit transcript</button> : <>
              <button className="button secondary" disabled={busy || !textChanged} onClick={() => saveTranscript(false)}>Save transcript draft</button>
              <button className="button primary" disabled={busy || !text.trim()} onClick={() => saveTranscript(true)}><Check size={17} />Confirm transcript</button>
            </>}
          </div>}
        </>}
        {busy && <div className="button-row"><Loading>{generating ? (markProgress ? `Marking criterion ${markProgress.current} of ${markProgress.total}…` : (sample && !deviceReady ? 'Running hybrid AI on fictional sample…' : 'Working on this device…')) : 'Saving…'}</Loading></div>}
      </section>
      <section className={'panel form-panel criterion-pane' + (mobileView === 'review' ? ' mobile-selected' : '')}>
        {rubric ? <>
          {actionHeading(rubric)}
          {newerVersionAvailable && latestRubricVersion && (
            <Notice>
              <div className="inline-confirm">
                <span>Version {latestRubricVersion.version} of this rubric is available.</span>
                <button
                  type="button"
                  className="button secondary compact-btn"
                  disabled={busy}
                  onClick={() => setDialog('upgrade-rubric')}
                >
                  Use version {latestRubricVersion.version}
                </button>
              </div>
            </Notice>
          )}
          {confirmed && canEdit && canSuggestMarks && <button className="button secondary" disabled={busy} onClick={() => {
            startGeneration(async (active) => {
              const result = await mark(
                rubric,
                script.transcript,
                active,
                (current, totalCount) => {
                  if (active()) setMarkProgress({ current, total: totalCount })
                },
                { allowCloudFallback: sample },
              )
              if (active()) await change((current) => ({ ...current, ...result }))
            })
          }}><Sparkles size={17} />{script.suggestions
            ? (deviceReady ? 'Refresh suggestions' : 'Refresh suggestions (Hybrid AI · sample)')
            : (deviceReady ? 'Suggest marks on this device' : 'Suggest marks (Hybrid AI · sample)')}</button>}
          {confirmed && canEdit && !canSuggestMarks && (
            textStatus && imageStatus && refreshDevice
              ? <DeviceAiHelper text={textStatus} image={imageStatus} refresh={refreshDevice} compact />
              : <Notice>
                {sample
                  ? <>Review manually, or <Link to="/settings">allow Cloud AI in Settings</Link> to run hybrid suggestions on this fictional script.</>
                  : <>Review each criterion manually. <Link to="/settings">Set up desktop AI</Link></>}
              </Notice>
          )}
          {!confirmed && <Notice>Confirm the transcript before entering marks.</Notice>}
          {confirmed && selection && canEdit && <Notice>Passage selected. Attach it to a criterion below.</Notice>}
          {rubric.criteria.map((criterion, index) => {
            const suggestion = script.suggestions?.[criterion.id]
            const manualEvidence = script.evidence?.[criterion.id]
            const selected = pendingMark?.criterionId === criterion.id ? pendingMark.score : script.marks[criterion.id]
            return <article className="criterion-card" key={criterion.id}>
              <div className="section-heading"><h3><small>C{index + 1}</small> {criterion.title}</h3><span className="badge neutral">{selected ?? '–'} / {criterion.max}</span></div>
              {suggestion && <div className="suggestion">
                <strong>{suggestion.score === null ? 'Manual review' : 'Suggested ' + suggestion.score + ' / ' + criterion.max}</strong>
                {suggestion.start !== null ? <button className="evidence-button" onClick={() => showEvidence(suggestion.start!, suggestion.quote)}>
                  <span>“{suggestion.quote}”</span><small>Find in transcript</small>
                </button> : <p className="muted">{suggestion.score === 0 && !suggestion.quote ? 'No evidence found' : 'Evidence needs review'}</p>}
                {suggestion.reason && <p>{suggestion.reason}</p>}
                {canEdit && confirmed && !isHeuristicProvenance && canAccept(suggestion) && selected !== suggestion.score && <button className="button secondary"
                  disabled={busy} onClick={() => saveMark(criterion.id, suggestion.score!)}>Accept {suggestion.score}</button>}
                {canEdit && confirmed && isHeuristicProvenance && (
                  <p className="muted">Keyword-match suggestion (not AI). Select the final mark manually below.</p>
                )}
              </div>}
              {manualEvidence && <button className="evidence-button" onClick={() => showEvidence(manualEvidence.start, manualEvidence.quote)}>
                <span>“{manualEvidence.quote}”</span><small>Lecturer evidence · Find in transcript</small>
              </button>}
              {selection && canEdit && confirmed && <button className="button secondary evidence-attach" disabled={busy} onClick={() => {
                const passage = selection
                void run(async () => {
                  await change((current) => ({ ...current, evidence: { ...current.evidence, [criterion.id]: passage } }))
                  setSelection(undefined)
                })
              }}>Attach selected passage</button>}
              <fieldset className="score-field" disabled={busy || !canEdit || !confirmed}>
                <legend>Final mark for {criterion.title}</legend>
                <div className="score-options">{criterion.levels.map((_, score) => {
                  const description = levelText(criterion, score)
                  return <label key={score} className="score-option"><input type="radio" name={'score-' + criterion.id} checked={selected === score}
                    onChange={() => saveMark(criterion.id, score)} aria-label={score + ' – ' + description} /><span>{score}</span></label>
                })}</div>
              </fieldset>
              {selected !== undefined && <p className="muted">{levelText(criterion, selected)}</p>}
              <details className="scoring-details"><summary>Scoring levels</summary><dl>{criterion.levels.map((_, score) =>
                <div key={score}><dt>{score}</dt><dd>{levelText(criterion, score)}</dd></div>)}</dl></details>
            </article>
          })}
          {!canEdit && <button className="button secondary" onClick={() => setDialog('reopen')}><RotateCcw size={16} />Reopen marks</button>}
          {comparison}
          <button className="button subtle" aria-pressed={Boolean(script.secondReview)} disabled={busy} onClick={() => {
            void run(async () => change((current) => ({ ...current, secondReview: !current.secondReview })))
          }}><Flag size={16} />{script.secondReview ? 'Flagged for second review' : 'Flag for second review'}</button>
        </> : <><h2>Review marks</h2><Notice>Assign a rubric to see scoring criteria and finalise marks.</Notice></>}
      </section>
    </div>
    <footer className="review-footer">
      <div><small>{rubric ? reviewed + ' of ' + rubric.criteria.length + ' reviewed' : 'No rubric assigned'}</small>
        <strong>{rubric ? earned(script, rubric) + ' / ' + total(rubric) : '–'} <span>marks</span></strong></div>
      {generating ? <button className="button secondary" onClick={() => { cancel(); setGenerating(false) }}>Cancel generation</button> :
        script.finalisedAt ? <Link className="button primary" to={feedbackPath}>Prepare feedback</Link> :
        <button className="button primary" disabled={busy || !rubric || !confirmed || reviewed !== rubric.criteria.length}
          onClick={() => { if (!rubric) return; void run(async () => {
            await change((current) => {
              if (!current.confirmed || reviewedCount(current, rubric) !== rubric.criteria.length) throw new Error('Review every criterion first.')
              return { ...current, finalisedAt: Date.now() }
            })
            navigate(feedbackPath)
          }) }}><LockKeyhole size={17} />Finalise marks</button>}
    </footer>
    {dialog === 'export' && script.photo && <Modal title="Export photo for desktop" onClose={() => setDialog(undefined)}>
      <p>Save the cleaned JPEG to a local folder. Move it using a direct transfer such as USB or AirDrop, then choose <strong>Import captured photo</strong> in the desktop workspace.</p>
      {photo && <div className="photo-preview transfer-preview"><img src={photo} alt="Cleaned photo to export" /></div>}
      <button className="button primary" onClick={() => { if (script.photo) downloadFile(script.photo, scriptName(script).toLowerCase().replace(' ', '-') + '.jpg'); setDialog(undefined) }}>
        <ArrowDownToLine size={17} />Download JPEG
      </button>
    </Modal>}
    {dialog === 'delete' && <Modal title={'Delete ' + scriptName(script).toLowerCase() + '?'} onClose={() => setDialog(undefined)}>
      <p>This deletes its saved photo, transcript, marks and feedback from this browser.</p>
      {error && <Notice error>{error}</Notice>}
      <button className="button destructive" disabled={busy} onClick={() => { void run(async () => {
        await commit((current) => {
          if (current.scripts.find((row) => row.id === script.id)?.revision !== script.revision) throw new Error('The script changed. Review it again before deleting.')
          return { ...current, scripts: current.scripts.filter((row) => row.id !== script.id) }
        })
        navigate(base)
      }) }}>Delete script</button>
    </Modal>}
    {dialog === 'reopen' && <Modal title="Reopen marks?" onClose={() => setDialog(undefined)}>
      <p>The current feedback and oral drafts will be cleared. Existing marks stay available for review.</p>
      {error && <Notice error>{error}</Notice>}
      <button className="button primary" disabled={busy} onClick={() => { void run(async () => {
        await change((current) => ({ ...current, finalisedAt: undefined, feedback: {}, oral: undefined, feedbackSource: undefined }))
        setDialog(undefined)
      }) }}>Reopen marks</button>
    </Modal>}
    {dialog === 'change-assignment' && <Modal title="Change rubric?" onClose={() => setDialog(undefined)}>
      <p>Changing the rubric clears suggestions and reviewed marks. Your photo and transcript remain available.</p>
      {error && <Notice error>{error}</Notice>}
      <button className="button primary" disabled={busy} onClick={() => assign(nextAssignment)}>Change rubric</button>
    </Modal>}
    {dialog === 'upgrade-rubric' && latestRubricVersion && <Modal title={`Use version ${latestRubricVersion.version}?`} onClose={() => setDialog(undefined)}>
      <p>Suggestions and marks for this script will be cleared. Your photo and transcript remain available.</p>
      {error && <Notice error>{error}</Notice>}
      <button className="button primary" disabled={busy} onClick={() => assign(latestRubricVersion.id)}>Use version {latestRubricVersion.version}</button>
    </Modal>}
    {dialog === 'confirm-save-transcript' && <Modal title="Clear current review?" onClose={() => setDialog(undefined)}>
      <p>Changing the transcript clears the current suggestions and reviewed marks for this script.</p>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={() => setDialog(undefined)}>Cancel</button>
        <button type="button" className="button primary" disabled={busy} onClick={() => commitTranscript(pendingConfirmTranscript)}>Continue</button>
      </div>
    </Modal>}
    {dialog === 'confirm-replace-transcript' && <Modal title="Replace transcript?" onClose={() => setDialog(undefined)}>
      <p>Replace the current transcript with a newly generated draft?</p>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={() => setDialog(undefined)}>Cancel</button>
        <button type="button" className="button primary" disabled={busy} onClick={runTranscribeDraft}>Replace draft</button>
      </div>
    </Modal>}
    {dialog === 'confirm-edit-transcript' && <Modal title="Edit transcript?" onClose={() => setDialog(undefined)}>
      <p>Editing the transcript clears the current suggestions and reviewed marks for this script.</p>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={() => setDialog(undefined)}>Cancel</button>
        <button type="button" className="button primary" disabled={busy} onClick={enterTranscriptEdit}>Continue</button>
      </div>
    </Modal>}
  </>
}
