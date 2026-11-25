import { BarChart3, Cloud, Info } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cloudConfigured, teachingSummary, type TeachingContext } from '../ai/firebase'
import {
  activeProjectOf,
  classPictureEntries,
  cloudRows,
  cohort,
  formatMergedVersionsLabel,
  levelText,
  type Workspace,
} from '../domain/workspace'
import { Loading, Modal, Notice, Source, useAction } from '../ui'

export function ClassPicture({ workspace, base }: { workspace: Workspace; base: string }) {
  const [selection, setSelection] = useState('')
  const [preview, setPreview] = useState(false)
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof teachingSummary>>>()
  const [summaryFingerprint, setSummaryFingerprint] = useState('')
  const { run, busy, error, cancel } = useAction()
  const project = activeProjectOf(workspace)
  const entries = classPictureEntries(workspace, project.id)
  const selectedEntry = entries.find((entry) => entry.rubric.id === selection) ?? entries.at(-1)
  const rubric = selectedEntry?.rubric
  const mergedLabel = selectedEntry ? formatMergedVersionsLabel(selectedEntry.versions) : ''
  const rows = rubric ? cohort(workspace, rubric) : []
  const eligible = cloudRows(rows)
  const teachingContext: TeachingContext = rubric
    ? {
        title: rubric.title,
        question: rubric.question,
        criteria: rubric.criteria
          .map((criterion, index) => ({
            criterion: index + 1,
            title: criterion.title,
            target: levelText(criterion, criterion.max),
          }))
          .filter((item) => eligible.some((row) => row.criterion === item.criterion)),
      }
    : { title: '', question: '', criteria: [] }
  const payloadPreview = { counts: eligible, assessment: teachingContext }
  const fingerprint = JSON.stringify([rubric?.id, payloadPreview])
  const currentPolicy = useRef({ allow: workspace.allowCloud, fingerprint })
  currentPolicy.current = { allow: workspace.allowCloud, fingerprint }
  const visibleSummary = workspace.allowCloud && summaryFingerprint === fingerprint ? summary : undefined
  const sorted = [...rows].sort((a, b) => b.below - a.below)
  const count = rows[0]?.total ?? 0

  return <>
    <header className="page-heading"><div><h1>Class picture</h1><p>Project: <strong>{project.name}</strong> · See which criteria need more teaching time.</p></div></header>
    {!rubric ? <section className="panel empty-state"><span className="empty-icon"><BarChart3 size={27} /></span><h2>No assessments in {project.name} yet</h2>
      <p>Create a rubric and finalise scripts in this project to see class results.</p><Link className="button primary" to={base + '/rubric'}>Go to rubrics</Link>
    </section> : <>
      <section className="panel form-panel">
        <label className="field"><span>Assessment</span><select value={rubric.id} onChange={(event) => {
          cancel(); setSelection(event.target.value); setPreview(false); setSummary(undefined)
        }}>
          {entries.map((entry) => {
            const suffix = entry.hasMultipleGroupsInSeries
              ? ` · v${entry.rubric.version}${entry.versions.length > 1 ? ` (${entry.versions.map((v) => `v${v.version}`).join(', ')})` : ''}`
              : ''
            const archivedTag = entry.rubric.archivedAt ? ' · archived' : ''
            return (
              <option key={entry.rubric.id} value={entry.rubric.id}>
                {entry.rubric.title}{suffix}{archivedTag}
              </option>
            )
          })}
        </select></label>
        {mergedLabel && <p className="muted">{mergedLabel}</p>}
        <div className="section-heading"><h2>Below full marks</h2><span className="badge neutral">{count} finalised {count === 1 ? 'script' : 'scripts'}</span></div>
        {!count ? <Notice>Finalise scripts for this rubric to see results.</Notice> : <div className="class-bars">
          {sorted.map((row) => <div className="bar-row" key={row.criterion}>
            <div><strong>{row.title}</strong><span>{row.below} of {row.total} below full marks</span></div>
            <progress aria-label={row.title + ' below full marks'} value={row.below} max={row.total} />
          </div>)}
        </div>}
      </section>
      <section className="panel form-panel class-summary">
        <div className="section-heading"><h2>Teaching priorities</h2>{visibleSummary && <Source value={visibleSummary.provenance} />}</div>
        {visibleSummary ? <ol className="priority-cards">{visibleSummary.priorities.map((priority) => {
          const row = rows.find((item) => item.criterion === priority.criterion)
          return <li className="priority-card" key={priority.criterion}>
            <div className="priority-meta">
              <strong>{row?.title ?? 'Criterion ' + priority.criterion}</strong>
              {row && <span className="badge neutral">{row.below} of {row.total} below full marks</span>}
            </div>
            <p><b>Likely misconception:</b> {priority.misconception}</p>
            <p><b>Classroom activity:</b> {priority.activity}</p>
            <p><b>Check question:</b> {priority.checkPrompt}</p>
          </li>
        })}</ol> : sorted.some((row) => row.below) ? <ol className="priority-list">{sorted.filter((row) => row.below > 0).slice(0, 3).map((row) =>
          <li key={row.criterion}><strong>{row.title}</strong><p>Review the scoring levels and work through an example with the class.</p></li>
        )}</ol> : <p className="muted">When finalised scripts miss criteria, priorities will appear here.</p>}
        {error && <Notice error>{error}</Notice>}
        {!eligible.length ? <Notice>Cloud summaries require at least 10 finalised scripts, with at least 3 scripts in each score group for a criterion.</Notice> :
          !cloudConfigured ? <Notice>Set up Firebase App Check to enable cloud summaries. Your class counts stay available.</Notice> :
            !workspace.allowCloud ? <Notice>Cloud AI is off. <Link to="/settings">Open settings</Link></Notice> : null}
        {busy ? <div className="button-row"><Loading>Preparing teaching plan…</Loading>
          <button className="button subtle" onClick={cancel}>Cancel</button></div> :
          <button className="button secondary" disabled={!eligible.length || !workspace.allowCloud || !cloudConfigured}
            onClick={() => setPreview(true)}><Cloud size={17} />Draft teaching plan (Cloud AI)</button>}
      </section>
    </>}
    {preview && <Modal title="Review cloud payload" onClose={() => setPreview(false)}>
      <p><Info size={16} className="inline-icon" /> Firebase receives these aggregate counts and rubric criteria. Student names, answers and individual marks are not part of this request.</p>
      <pre className="payload">{JSON.stringify(payloadPreview, null, 2)}</pre>
      <button className="button primary" disabled={!workspace.allowCloud || !eligible.length} onClick={() => {
        setPreview(false)
        void run(async (active) => {
          const stillAllowed = () => active() && currentPolicy.current.allow && currentPolicy.current.fingerprint === fingerprint
          const result = await teachingSummary(eligible, teachingContext, stillAllowed)
          if (stillAllowed()) { setSummary(result); setSummaryFingerprint(fingerprint) }
        })
      }}><Cloud size={17} />Generate cloud teaching plan</button>
    </Modal>}
  </>
}
