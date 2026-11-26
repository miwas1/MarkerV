import { Cloud, FlaskConical, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { cloudConfigured, compareSample } from '../ai/firebase'
import type { Script } from '../domain/workspace'
import { ClassPicture } from '../features/ClassPicture'
import { Dashboard } from '../features/Dashboard'
import { FeedbackRoute } from '../features/Feedback'
import { Practice } from '../features/Practice'
import { Results } from '../features/Results'
import { ReviewRoute } from '../features/Review'
import { Rubrics } from '../features/Rubrics'
import { useWorkspace } from '../storage/useWorkspace'
import { AllowCloudButton, Loading, Modal, Notice, Source, useAction } from '../ui'
import { sampleFeedback, sampleId, sampleRubric, sampleTranscript, sampleWorkspace } from './fixtures'
import photoUrl from './sample-page.jpg'

const initial = () => sampleWorkspace()
const base = '/sample'

export default function Sample({
  deviceReady,
  imageReady,
  allowCloud,
  onAllowCloud,
}: {
  deviceReady: boolean
  imageReady: boolean
  allowCloud: boolean
  onAllowCloud?: () => Promise<void>
}) {
  const { workspace, commit, error, reload } = useWorkspace('sample', initial)
  const [photo, setPhoto] = useState<Blob>()
  const [reset, setReset] = useState(false)
  const action = useAction()

  useEffect(() => {
    const controller = new AbortController()
    void fetch(photoUrl, { signal: controller.signal }).then((response) => {
      if (response.ok) return response.blob()
    }).then((blob) => {
      if (!controller.signal.aborted && blob) setPhoto(blob)
    }).catch(() => { /* The sample text works even if its illustration is unavailable. */ })
    return () => controller.abort()
  }, [])

  if (error) return <div className="panel form-panel"><Notice error>{error}</Notice><button className="button secondary" onClick={reload}>Retry sample</button></div>
  if (!workspace) return <Loading>Opening fictional scripts…</Loading>

  const activeWorkspace = {
    ...workspace,
    allowCloud,
    scripts: workspace.scripts.map((script) => script.sequence === 1 && photo ? { ...script, photo } : script),
  }
  return <>
    <div className="sample-tools">
      <Link className="button secondary" to={base}><FlaskConical size={17} />Sample scripts</Link>
      <Link className="button secondary" to={base + '/rubric'}>Sample rubric</Link>
      <Link className="button secondary" to={base + '/class'}>Sample class picture</Link>
      <Link className="button secondary" to={base + '/results'}>Sample results &amp; export</Link>
      <Link className="button secondary" to={base + '/practice'}>Sample practice</Link>
      <button className="button subtle" onClick={() => setReset(true)}><RotateCcw size={16} />Reset sample</button>
    </div>
    <Notice>
      <div className="inline-confirm">
        <span>
          All scripts here are fictional. Changes stay separate from your workspace, and this sample supports hybrid AI fallback (on-device first, or Cloud Gemini when enabled).
        </span>
        {cloudConfigured && !allowCloud && onAllowCloud && (
          <button
            type="button"
            className="button secondary compact-btn nowrap-btn"
            disabled={action.busy}
            onClick={() => {
              void action.run(async () => {
                await onAllowCloud()
              })
            }}
          >
            <Cloud size={15} />Allow cloud AI
          </button>
        )}
      </div>
    </Notice>
    <Routes>
      <Route path="/sample" element={<Dashboard workspace={activeWorkspace} base={base} sample />} />
      <Route path="/sample/scripts/:id" element={<SampleReview workspace={activeWorkspace} commit={commit} deviceReady={deviceReady} imageReady={imageReady} base={base} sample onAllowCloud={onAllowCloud} />} />
      <Route path="/sample/scripts/:id/feedback" element={<FeedbackRoute workspace={activeWorkspace} commit={commit} deviceReady={deviceReady} base={base} sample />} />
      <Route path="/sample/rubric" element={<Rubrics workspace={activeWorkspace} commit={commit} deviceReady={deviceReady} imageReady={imageReady} onAllowCloud={onAllowCloud} />} />
      <Route path="/sample/class" element={<ClassPicture workspace={activeWorkspace} base={base} onAllowCloud={onAllowCloud} />} />
      <Route path="/sample/results" element={<Results workspace={activeWorkspace} commit={commit} base={base} />} />
      <Route path="/sample/practice" element={<Practice deviceReady={deviceReady} allowCloud={allowCloud} initial={sampleFeedback} sample />} />
      <Route path="*" element={<Navigate to={base} replace />} />
    </Routes>
    {reset && <Modal title="Reset sample?" onClose={() => setReset(false)}>
      <p>Restore the original fictional scripts and clear only changes made here.</p>
      {action.error && <Notice error>{action.error}</Notice>}
      <button className="button primary" disabled={action.busy} onClick={() => {
        void action.run(async () => { await commit(() => sampleWorkspace()); setReset(false) })
      }}>Reset sample workspace</button>
    </Modal>}
  </>
}

function SampleReview({ onAllowCloud, ...props }: Parameters<typeof ReviewRoute>[0] & { onAllowCloud?: () => Promise<void> }) {
  const { id } = useParams()
  const script = props.workspace.scripts.find((record) => record.id === id)
  const comparison = script?.id === sampleId && script.transcript === sampleTranscript && script.rubricId === sampleRubric.id
    ? <SecondOpinion script={script} allowCloud={props.workspace.allowCloud} onAllowCloud={onAllowCloud} /> : undefined
  return <ReviewRoute {...props} comparison={comparison} />
}

function SecondOpinion({ script, allowCloud, onAllowCloud }: {
  script: Script; allowCloud: boolean; onAllowCloud?: () => Promise<void>
}) {
  const [preview, setPreview] = useState(false)
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof compareSample>>>()
  const currentPermission = useRef(allowCloud)
  currentPermission.current = allowCloud
  const { busy, error, run, cancel } = useAction()

  return <div className="criterion-card">
    <div className="section-heading"><h3>Fictional second opinion</h3>{comparison && allowCloud && <Source value={comparison.provenance} />}</div>
    {comparison && allowCloud && comparison.marks.map((mark) => {
      const criterion = sampleRubric.criteria.find((row) => row.id === mark.id)!
      return <div className="release-row" key={mark.id}><strong>{criterion.title}</strong>
        <p>Your mark {script.marks[mark.id] ?? '–'} / {criterion.max} · Cloud {mark.score} / {criterion.max}</p><p>{mark.reason}</p>
      </div>
    })}
    {error && <Notice error>{error}</Notice>}
    {!allowCloud && cloudConfigured && <div className="inline-confirm">
      <span className="muted">Allow cloud AI to compare this fictional script with a cloud second reader.</span>
      <AllowCloudButton onAllowCloud={onAllowCloud} />
    </div>}
    {!allowCloud && !cloudConfigured && <p className="muted"><Link to="/settings">Configure Cloud AI in settings</Link> to compare this fictional script.</p>}
    {busy ? <div className="button-row"><Loading>Comparing the fictional script…</Loading><button className="button subtle" onClick={cancel}>Cancel</button></div> :
      <button className="button secondary" disabled={!allowCloud || !cloudConfigured} onClick={() => setPreview(true)}><Cloud size={17} />Compare second opinion</button>}
    {preview && <Modal title="Review fictional cloud payload" onClose={() => setPreview(false)}>
      <p>Firebase receives the bundled question, rubric and fictional answer shown here.</p>
      <pre className="payload">{JSON.stringify({ question: sampleRubric.question, rubric: sampleRubric.criteria, answer: sampleTranscript }, null, 2)}</pre>
      <button className="button primary" disabled={!allowCloud} onClick={() => {
        setPreview(false)
        void run(async (active) => {
          const permitted = () => active() && currentPermission.current
          const result = await compareSample(sampleId, permitted)
          if (permitted()) setComparison(result)
        })
      }}>Send fictional script</button>
    </Modal>}
  </div>
}
