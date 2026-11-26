import { Archive, ClipboardCheck, FileSpreadsheet, FileText, Flag, MessageSquare, Printer, Search, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buildAuditLogCsv,
  buildFeedbackZip,
  buildMarksheetCsv,
  buildOralVivaMarkdown,
  collateAssessment,
  defaultOralQuestions,
  slugifyFilename,
  type CollatedRow,
} from '../domain/export'
import { downloadFile } from '../domain/photo'
import {
  activeProjectOf,
  classPictureEntries,
  formatMergedVersionsLabel,
  MAX_CANDIDATE_REF,
  updateScript,
  type Workspace,
} from '../domain/workspace'
import { Loading, Modal, Notice, useAction, type Commit } from '../ui'

type FilterKind = 'All' | 'Finalised' | 'Awaiting review' | 'Flagged'

function CandidateCell({ row, commit, onError }: {
  row: CollatedRow
  commit: Commit
  onError: (message: string) => void
}) {
  const [value, setValue] = useState(row.candidateRef)
  const [saving, setSaving] = useState(false)

  async function saveIfChanged() {
    const clean = value.trim().slice(0, MAX_CANDIDATE_REF)
    if (clean === row.candidateRef) return
    setSaving(true)
    onError('')
    try {
      await commit((current) =>
        updateScript(current, row.script.id, row.script.revision, (script) => ({
          ...script,
          candidateRef: clean || undefined,
        })),
      )
      setValue(clean)
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : 'Could not save candidate ID.')
      setValue(row.candidateRef)
    } finally {
      setSaving(false)
    }
  }

  return (
    <input
      type="text"
      className="candidate-input"
      aria-label={`Candidate ID for ${row.scriptLabel}`}
      placeholder="e.g. CAND-104"
      maxLength={MAX_CANDIDATE_REF}
      value={value}
      disabled={saving}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => { void saveIfChanged() }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function Results({ workspace, commit, base }: {
  workspace: Workspace
  commit: Commit
  base: string
}) {
  const [selection, setSelection] = useState('')
  const [filter, setFilter] = useState<FilterKind>('All')
  const [query, setQuery] = useState('')
  const [finalisedOnlyCsv, setFinalisedOnlyCsv] = useState(false)
  const [oralPreviewOpen, setOralPreviewOpen] = useState(false)
  const [rowError, setRowError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const { run, busy, error } = useAction()
  const tableCaptionId = useId()

  const project = activeProjectOf(workspace)
  const entries = classPictureEntries(workspace, project.id)
  const selectedEntry = entries.find((entry) => entry.rubric.id === selection) ?? entries.at(-1)
  const rubric = selectedEntry?.rubric
  const mergedLabel = selectedEntry ? formatMergedVersionsLabel(selectedEntry.versions) : ''
  const collated = rubric ? collateAssessment(workspace, rubric) : undefined
  const rubricSlug = rubric ? slugifyFilename(rubric.title, 'assessment') : 'assessment'

  const filteredRows = (collated?.rows ?? []).filter((row) => {
    const matchesFilter =
      filter === 'All' ||
      (filter === 'Finalised' ? row.finalised : filter === 'Flagged' ? row.flagged : !row.finalised)
    const needle = query.trim().toLowerCase()
    const matchesQuery =
      !needle ||
      row.scriptLabel.toLowerCase().includes(needle) ||
      row.candidateRef.toLowerCase().includes(needle) ||
      row.sourceLabel.toLowerCase().includes(needle)
    return matchesFilter && matchesQuery
  })

  const finalisedRows = (collated?.rows ?? []).filter((row) => row.finalised)

  function exportMarksheet() {
    if (!collated) return
    const csv = buildMarksheetCsv(collated, { finalisedOnly: finalisedOnlyCsv })
    const suffix = finalisedOnlyCsv ? 'marksheet-finalised' : 'marksheet'
    downloadFile(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `${rubricSlug}-${suffix}.csv`)
    setStatusMessage(`Downloaded ${rubricSlug}-${suffix}.csv locally.`)
  }

  function exportAuditLog() {
    if (!collated) return
    const csv = buildAuditLogCsv(collated)
    downloadFile(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `${rubricSlug}-moderation-audit.csv`)
    setStatusMessage(`Downloaded ${rubricSlug}-moderation-audit.csv locally.`)
  }

  function exportFeedbackBundle() {
    if (!collated || !finalisedRows.length) return
    void run(async () => {
      const bytes = await buildFeedbackZip(collated)
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      downloadFile(new Blob([buffer], { type: 'application/zip' }), `${rubricSlug}-feedback-bundle.zip`)
      setStatusMessage(`Downloaded ${rubricSlug}-feedback-bundle.zip (${finalisedRows.length} student feedback files + CSVs).`)
    })
  }

  function exportOralMarkdown() {
    if (!collated) return
    const md = buildOralVivaMarkdown(collated)
    downloadFile(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${rubricSlug}-oral-viva.md`)
    setStatusMessage(`Downloaded ${rubricSlug}-oral-viva.md locally.`)
  }

  return <>
    <header className="page-heading">
      <div>
        <h1>Results &amp; export</h1>
        <p>Project: <strong>{project.name}</strong> · Collate final marks, match candidate IDs after blind marking, and export locally.</p>
      </div>
      <span className="badge badge-device"><ShieldCheck size={14} aria-hidden="true" />100% local export · 0 B to cloud</span>
    </header>

    {!rubric || !collated ? (
      <section className="panel empty-state">
        <span className="empty-icon"><FileSpreadsheet size={26} aria-hidden="true" /></span>
        <h2>No assessments in {project.name} yet</h2>
        <p>Create a rubric and mark scripts in this project to collate marks and export results.</p>
        <Link className="button primary" to={base + '/rubric'}>Go to rubrics</Link>
      </section>
    ) : (
      <>
        <section className="panel form-panel">
          <label className="field">
            <span>Assessment</span>
            <select
              value={rubric.id}
              onChange={(event) => {
                setSelection(event.target.value)
                setStatusMessage('')
                setRowError('')
              }}
            >
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
            </select>
          </label>
          {mergedLabel && <p className="muted">{mergedLabel}</p>}

          <div className="inspector-stats">
            <div className="inspector-stat">
              <span>Finalised</span>
              <strong>{collated.summary.finalisedCount} / {collated.summary.totalScripts}</strong>
            </div>
            <div className="inspector-stat">
              <span>Mean mark</span>
              <strong>
                {collated.summary.meanEarned === null
                  ? '–'
                  : `${collated.summary.meanEarned} / ${collated.summary.maxMarks} (${collated.summary.meanPercent}%)`}
              </strong>
            </div>
            <div className="inspector-stat">
              <span>Median mark</span>
              <strong>
                {collated.summary.medianEarned === null
                  ? '–'
                  : `${collated.summary.medianEarned} / ${collated.summary.maxMarks}`}
              </strong>
            </div>
            <div className="inspector-stat">
              <span>Range</span>
              <strong>
                {collated.summary.minEarned === null
                  ? '–'
                  : `${collated.summary.minEarned} – ${collated.summary.maxEarned}`}
              </strong>
            </div>
            <div className="inspector-stat">
              <span>Flagged for review</span>
              <strong>{collated.summary.flaggedCount}</strong>
            </div>
            {collated.summary.aiSuggestedCriteria > 0 && (
              <div className="inspector-stat">
                <span>AI marks changed by lecturer</span>
                <strong>{collated.summary.lecturerChangedCriteria} / {collated.summary.aiSuggestedCriteria}</strong>
              </div>
            )}
          </div>
        </section>

        <section className="panel form-panel">
          <div className="section-heading">
            <div>
              <h2>Export pack</h2>
              <p>Generated directly in this browser for your LMS gradebook, exam board moderation, and student distribution.</p>
            </div>
          </div>

          <div className="results-export-grid">
            <article className="export-card">
              <h3><FileSpreadsheet size={17} aria-hidden="true" />Marksheet CSV</h3>
              <p>Excel, Canvas, Moodle, and Google Sheets compatible per-criterion scores, totals, percentages, and feedback summary.</p>
              <label className="switch-row compact-switch">
                <input
                  type="checkbox"
                  checked={finalisedOnlyCsv}
                  onChange={(event) => setFinalisedOnlyCsv(event.target.checked)}
                />
                <span>Finalised scripts only</span>
              </label>
              <button
                type="button"
                className="button primary compact-btn"
                disabled={!collated.rows.length || (finalisedOnlyCsv && !finalisedRows.length)}
                onClick={exportMarksheet}
              >
                Download marksheet (.csv)
              </button>
            </article>

            <article className="export-card">
              <h3><ClipboardCheck size={17} aria-hidden="true" />Moderation &amp; audit log</h3>
              <p>Per-criterion record of AI suggestions, verified verbatim quotes, lecturer final decisions, and inference source for quality checks and appeals.</p>
              <button
                type="button"
                className="button secondary compact-btn"
                disabled={!collated.rows.length}
                onClick={exportAuditLog}
              >
                Download audit log (.csv)
              </button>
            </article>

            <article className="export-card">
              <h3><Archive size={17} aria-hidden="true" />Class feedback bundle (ZIP)</h3>
              <p>Every finalised student’s individual <code>.json</code> practice file and readable <code>.txt</code> summary, plus marksheet and audit CSVs.</p>
              <button
                type="button"
                className="button secondary compact-btn"
                disabled={busy || !finalisedRows.length}
                onClick={exportFeedbackBundle}
              >
                {busy ? 'Building ZIP…' : `Download ZIP (${finalisedRows.length} ${finalisedRows.length === 1 ? 'student' : 'students'})`}
              </button>
            </article>

            <article className="export-card">
              <h3><MessageSquare size={17} aria-hidden="true" />Oral viva sheet</h3>
              <p>Collated oral follow-up questions and examiner cues for every finalised student, ready to print or save as Markdown.</p>
              <div className="button-row">
                <button
                  type="button"
                  className="button secondary compact-btn"
                  disabled={!finalisedRows.length}
                  onClick={() => setOralPreviewOpen(true)}
                >
                  <Printer size={15} aria-hidden="true" />Preview / print
                </button>
                <button
                  type="button"
                  className="button subtle compact-btn"
                  disabled={!finalisedRows.length}
                  onClick={exportOralMarkdown}
                >
                  <FileText size={15} aria-hidden="true" />Markdown (.md)
                </button>
              </div>
            </article>
          </div>

          {busy && <Loading>Preparing local export bundle…</Loading>}
          {error && <Notice error>{error}</Notice>}
          {statusMessage && <Notice>{statusMessage}</Notice>}
        </section>

        <section className="panel form-panel">
          <div className="section-heading">
            <div>
              <h2>Collated marksheet</h2>
              <p>Match optional Candidate IDs after blind marking. Candidate IDs stay in this browser, stay hidden during review, and are never sent to AI.</p>
            </div>
            <search>
              <label className="search">
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search marksheet by script or candidate ID"
                  placeholder="Search script or ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </search>
          </div>

          <div className="queue-filters results-filters" aria-label="Filter collated scripts">
            {(['All', 'Finalised', 'Awaiting review', 'Flagged'] as FilterKind[]).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value}
              </button>
            ))}
          </div>

          {rowError && <Notice error>{rowError}</Notice>}

          {!filteredRows.length ? (
            <Notice>
              {collated.rows.length
                ? 'No scripts match this filter.'
                : 'No scripts are assigned to this rubric yet. Assign scripts and review them to populate this marksheet.'}
            </Notice>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby={tableCaptionId}
              className="results-table-wrapper"
            >
              <table className="data-table results-table">
                <caption id={tableCaptionId} className="visually-hidden">
                  Collated marksheet for {rubric.title}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Script</th>
                    <th scope="col">Candidate ID (local)</th>
                    <th scope="col">Status</th>
                    {rubric.criteria.map((criterion, index) => (
                      <th scope="col" key={criterion.id} title={criterion.title}>
                        C{index + 1} (/{criterion.max})
                      </th>
                    ))}
                    <th scope="col">Total</th>
                    <th scope="col">%</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.script.id}>
                      <th scope="row">
                        <Link to={base + '/scripts/' + row.script.id}>{row.scriptLabel}</Link>
                        {row.flagged && (
                          <span className="flag-indicator inline-flag" title="Flagged for second review" aria-label="Flagged for second review">
                            <Flag size={14} aria-hidden="true" />
                          </span>
                        )}
                      </th>
                      <td data-label="Candidate ID">
                        <CandidateCell
                          key={`${row.script.id}:${row.script.revision}:${row.candidateRef}`}
                          row={row}
                          commit={commit}
                          onError={setRowError}
                        />
                      </td>
                      <td data-label="Status">
                        <span className={'badge ' + (row.finalised ? 'badge-device' : 'neutral')}>{row.status}</span>
                      </td>
                      {rubric.criteria.map((criterion, index) => (
                        <td key={criterion.id} data-label={`C${index + 1}: ${criterion.title}`}>
                          {row.scores[index] === null ? '–' : row.scores[index]}
                        </td>
                      ))}
                      <td data-label="Total">
                        <strong>{row.earned === null ? '–' : `${row.earned} / ${row.max}`}</strong>
                      </td>
                      <td data-label="Percent">{row.percent === null ? '–' : `${row.percent}%`}</td>
                      <td data-label="Actions">
                        <div className="button-row results-row-actions">
                          <Link className="text-link" to={base + '/scripts/' + row.script.id}>Review</Link>
                          {row.finalised && (
                            <Link className="text-link" to={base + '/scripts/' + row.script.id + '/feedback'}>Feedback</Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {oralPreviewOpen && (
          <Modal title={`Oral viva sheet · ${rubric.title}`} onClose={() => setOralPreviewOpen(false)}>
            <div className="oral-print-sheet">
              <p className="muted">
                {finalisedRows.length} finalised {finalisedRows.length === 1 ? 'script' : 'scripts'} · Examiner cues stay private to the lecturer.
              </p>
              <div className="oral-sheet-list">
                {finalisedRows.map((row) => {
                  const questions = row.script.oral?.length ? row.script.oral : defaultOralQuestions(row.script, rubric)
                  return (
                    <article className="oral-sheet-entry" key={row.script.id}>
                      <div className="section-heading">
                        <h3>{row.scriptLabel}{row.candidateRef ? ` · ${row.candidateRef}` : ''}</h3>
                        <span className="badge neutral">{row.earned} / {row.max}</span>
                      </div>
                      <ol className="helper-ol">
                        {questions.map((item, idx) => (
                          <li key={idx}>
                            <strong>{item.prompt}</strong>
                            <div className="muted">Examiner cue: {item.cue}</div>
                          </li>
                        ))}
                      </ol>
                    </article>
                  )
                })}
              </div>
            </div>
            <div className="button-row no-print">
              <button type="button" className="button primary" onClick={() => window.print()}>
                <Printer size={16} aria-hidden="true" />Print sheet
              </button>
              <button type="button" className="button secondary" onClick={exportOralMarkdown}>
                <FileText size={16} aria-hidden="true" />Download Markdown
              </button>
            </div>
          </Modal>
        )}
      </>
    )}
  </>
}

export default Results
