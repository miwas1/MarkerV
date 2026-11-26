import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  Camera,
  Check,
  ClipboardList,
  Cloud,
  Contrast,
  Copy,
  FileImage,
  FileUp,
  Info,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  auditRubric,
  canRunAi,
  cloudConfigured,
  draftMarkingBrief,
  draftPracticeQuestions,
  draftRubric,
  readRubricPhoto,
  type AuditIssue,
  type RubricAuditResult,
} from '../ai/firebase'
import { CameraModal } from '../components/CameraModal'
import { estimateRubricTokens, markingBriefPayload, ON_DEVICE_TOKEN_THRESHOLD } from '../domain/aiSchemas'
import { detectFileKind, DOCUMENT_ACCEPT, extractDocument, parseRubricText, type ParsedRubricDraft } from '../domain/document'
import { createRubricFromTemplate, STARTER_RUBRICS } from '../domain/onboarding'
import { noCrop, preparePhotoWithMetrics } from '../domain/photo'
import {
  activeProjectOf,
  archiveRubricSeries,
  copyRubricToProject,
  deleteRubricSeries,
  expandedCriteria,
  latestRubrics,
  markedScriptsCount,
  MAX_CRITERIA,
  MAX_KEY_POINTS,
  MAX_SCORE,
  moveUnfinalisedScriptsToLatest,
  newCriterion,
  rubricInUse,
  seriesInUse,
  total,
  unfinalisedScriptsOnOlderVersions,
  validateRubric,
  type Criterion,
  type Provenance,
  type Rubric,
  type Workspace,
} from '../domain/workspace'
import { AllowCloudButton, Loading, Modal, Notice, Source, useAction, useObjectUrl, type Commit } from '../ui'

function freshRubric(projectId: string): Rubric {
  const id = crypto.randomUUID()
  return { id, series: id, version: 1, projectId, title: '', question: '', criteria: [newCriterion()] }
}

function hasFilledCriteria(rubric: Rubric): boolean {
  return rubric.criteria.some((criterion) => criterion.title.trim() || criterion.levels.some((level) => level.trim()))
}

function auditTargetDescription(issue: AuditIssue): string {
  if (issue.field === 'question') return 'Question'
  if (issue.field === 'title') return 'Criterion title'
  if (issue.field === 'level' && issue.level !== null) {
    return `${issue.level} ${issue.level === 1 ? 'mark' : 'marks'} level`
  }
  return 'Scoring level'
}

export function Rubrics({ workspace, commit, deviceReady, imageReady = false, onAllowCloud }: {
  workspace: Workspace; commit: Commit; deviceReady: boolean; imageReady?: boolean; onAllowCloud?: () => Promise<void>
}) {
  const [editing, setEditing] = useState<{ rubric: Rubric; initialFile?: File }>()
  const [notice, setNotice] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [bulkMoveTarget, setBulkMoveTarget] = useState<{ rubric: Rubric; count: number }>()
  const [copyTarget, setCopyTarget] = useState<Rubric>()
  const [copyProjectId, setCopyProjectId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Rubric>()
  const { run: runListAction, busy: listBusy, error: listError, setError: setListError } = useAction()
  const photoPicker = useRef<HTMLInputElement>(null)
  const docPicker = useRef<HTMLInputElement>(null)
  const project = activeProjectOf(workspace)
  const activeLatest = latestRubrics(workspace, project.id, false)
  const archivedLatest = latestRubrics(workspace, project.id, true).filter((r) => Boolean(r.archivedAt))
  const visibleRubrics = showArchived ? archivedLatest : activeLatest

  function startFromFile(file: File | undefined) {
    if (!file) return
    setNotice('')
    setEditing({ rubric: freshRubric(project.id), initialFile: file })
  }

  function openCopyDialog(rubric: Rubric) {
    setListError('')
    const other = workspace.projects.find((p) => p.id !== project.id)
    setCopyProjectId(other?.id ?? project.id)
    setCopyTarget(rubric)
  }

  return <>
    <input ref={photoPicker} type="file" accept="image/*" aria-label="Choose rubric photo" className="visually-hidden" tabIndex={-1}
      onChange={(event) => { startFromFile(event.target.files?.[0]); event.target.value = '' }} />
    <input ref={docPicker} type="file" accept={DOCUMENT_ACCEPT} aria-label="Upload rubric PDF, DOCX, or TXT" className="visually-hidden" tabIndex={-1}
      onChange={(event) => { startFromFile(event.target.files?.[0]); event.target.value = '' }} />

    <header className="page-heading">
      <div><h1>Rubrics</h1><p>Project: <strong>{project.name}</strong> · Define what earns each mark, or import from a photo or file.</p></div>
      {!editing && <div className="button-row">
        <button className="button secondary" onClick={() => setCameraOpen(true)}><Camera size={17} />Take photo</button>
        <button className="button secondary" onClick={() => photoPicker.current?.click()}><FileImage size={17} />Choose photo</button>
        <button className="button secondary" onClick={() => docPicker.current?.click()}><FileUp size={17} />Upload file</button>
        <button className="button primary" onClick={() => { setNotice(''); setEditing({ rubric: freshRubric(project.id) }) }}><Plus size={18} />Create rubric</button>
      </div>}
    </header>
    {notice && <Notice>{notice}</Notice>}
    {listError && <Notice error>{listError}</Notice>}
    {editing ? <RubricEditor key={editing.rubric.id} original={editing.rubric} initialFile={editing.initialFile}
      workspace={workspace} commit={commit} deviceReady={deviceReady} imageReady={imageReady} onAllowCloud={onAllowCloud}
      close={(savedMessage) => { setEditing(undefined); if (savedMessage) setNotice(savedMessage) }} />
      : <>
        {archivedLatest.length > 0 && (
          <div className="button-row">
            <div className="segmented" role="group" aria-label="Rubric view">
              <button type="button" aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>
                Active ({activeLatest.length})
              </button>
              <button type="button" aria-pressed={showArchived} onClick={() => setShowArchived(true)}>
                Archived ({archivedLatest.length})
              </button>
            </div>
          </div>
        )}
        <section className="panel list-panel">
          {!visibleRubrics.length ? <div className="empty-state"><span className="empty-icon"><ClipboardList size={24} /></span>
            <h2>{showArchived ? `No archived rubrics in ${project.name}` : `No rubrics in ${project.name} yet`}</h2>
            <p>{showArchived
              ? 'Archived rubrics stay hidden from script pickers while remaining available in the class picture and history.'
              : 'Create a rubric manually, photograph a printed mark scheme, or upload a PDF, DOCX, or TXT file.'}</p>
            {!showArchived && <div className="button-row">
              <button type="button" className="button primary" onClick={() => setEditing({ rubric: freshRubric(project.id) })}><Plus size={18} />Create rubric</button>
              <button type="button" className="button secondary" onClick={() => setCameraOpen(true)}><Camera size={17} />Take photo</button>
              <button type="button" className="button secondary" onClick={() => docPicker.current?.click()}><FileUp size={17} />Upload PDF / DOCX / TXT</button>
            </div>}
            {!showArchived && (
              <div className="template-bar">
                <span className="preset-label">Or start from a template</span>
                <div className="template-chips">
                  {STARTER_RUBRICS.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="button secondary compact-btn"
                      onClick={() => {
                        setNotice('')
                        setEditing({ rubric: createRubricFromTemplate(template.id, project.id) })
                      }}
                    >
                      {template.label} <small className="muted">· {template.summary}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div> : visibleRubrics.map((rubric) => {
            const olderScripts = unfinalisedScriptsOnOlderVersions(workspace, rubric.series)
            const inSeriesUse = seriesInUse(workspace, rubric.series)
            return <div className="list-row rubric-list-row" key={rubric.id}>
              <span className="row-icon"><ClipboardList size={21} /></span>
              <div className="row-name">
                <strong>{rubric.title}</strong>
                <small>
                  {rubric.criteria.length} {rubric.criteria.length === 1 ? 'criterion' : 'criteria'} · {total(rubric)} marks · Version {rubric.version}
                  {rubric.archivedAt ? ' · Archived' : ''}
                </small>
              </div>
              <div className="button-row rubric-row-actions">
                {olderScripts.length > 0 && !rubric.archivedAt && (
                  <button
                    type="button"
                    className="button secondary compact-btn"
                    disabled={listBusy}
                    onClick={() => setBulkMoveTarget({ rubric, count: olderScripts.length })}
                  >
                    <ArrowRightLeft size={15} />Move {olderScripts.length} {olderScripts.length === 1 ? 'script' : 'scripts'} to v{rubric.version}
                  </button>
                )}
                {!rubric.archivedAt && (
                  <button
                    type="button"
                    className="button secondary compact-btn"
                    disabled={listBusy}
                    onClick={() => { setNotice(''); setEditing({ rubric }) }}
                  >
                    Edit rubric
                  </button>
                )}
                <button
                  type="button"
                  className="button subtle compact-btn"
                  disabled={listBusy}
                  title="Copy this rubric to a project"
                  onClick={() => openCopyDialog(rubric)}
                >
                  <Copy size={15} />Copy
                </button>
                <button
                  type="button"
                  className="button subtle compact-btn"
                  disabled={listBusy}
                  onClick={() => {
                    const nextArchived = !rubric.archivedAt
                    void runListAction(async () => {
                      await commit((current) => archiveRubricSeries(current, rubric.series, nextArchived))
                      setNotice(nextArchived
                        ? `Archived "${rubric.title}". It stays available in the class picture and script history.`
                        : `Restored "${rubric.title}" to active rubrics.`)
                      if (!nextArchived && archivedLatest.length <= 1) setShowArchived(false)
                    })
                  }}
                >
                  {rubric.archivedAt ? <><ArchiveRestore size={15} />Restore</> : <><Archive size={15} />Archive</>}
                </button>
                <button
                  type="button"
                  className="icon-button danger-icon"
                  disabled={listBusy || inSeriesUse}
                  aria-label={'Delete ' + rubric.title}
                  title={inSeriesUse ? 'Cannot delete while scripts reference this rubric. Archive it instead.' : 'Delete rubric'}
                  onClick={() => { setListError(''); setDeleteTarget(rubric) }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          })}
        </section>
      </>}
    {cameraOpen && <CameraModal title="Photograph a rubric" onClose={() => setCameraOpen(false)} onCapture={(file) => {
      setCameraOpen(false)
      startFromFile(file)
    }} />}
    {bulkMoveTarget && (
      <Modal
        title={`Move ${bulkMoveTarget.count} ${bulkMoveTarget.count === 1 ? 'script' : 'scripts'} to v${bulkMoveTarget.rubric.version}?`}
        onClose={() => setBulkMoveTarget(undefined)}
      >
        <p>
          Unfinalised scripts currently assigned to older versions of <strong>{bulkMoveTarget.rubric.title}</strong> will switch to version {bulkMoveTarget.rubric.version}. Suggestions and unfinalised marks on those scripts will be cleared; finalised scripts remain untouched.
        </p>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={() => setBulkMoveTarget(undefined)}>Cancel</button>
          <button
            type="button"
            className="button primary"
            disabled={listBusy}
            onClick={() => {
              const target = bulkMoveTarget
              void runListAction(async () => {
                await commit((current) => moveUnfinalisedScriptsToLatest(current, target.rubric.series))
                setBulkMoveTarget(undefined)
                setNotice(`Moved ${target.count} unfinalised ${target.count === 1 ? 'script' : 'scripts'} to "${target.rubric.title}" v${target.rubric.version}.`)
              })
            }}
          >
            Move {bulkMoveTarget.count} {bulkMoveTarget.count === 1 ? 'script' : 'scripts'}
          </button>
        </div>
      </Modal>
    )}
    {copyTarget && (
      <Modal title="Copy rubric to project" onClose={() => setCopyTarget(undefined)}>
        <p>
          Create a fresh version 1 copy of <strong>{copyTarget.title}</strong> with independent criterion IDs.
        </p>
        <label className="field">
          <span>Destination project</span>
          <select value={copyProjectId} onChange={(event) => setCopyProjectId(event.target.value)}>
            {workspace.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}{item.id === project.id ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={() => setCopyTarget(undefined)}>Cancel</button>
          <button
            type="button"
            className="button primary"
            disabled={listBusy || !copyProjectId}
            onClick={() => {
              const source = copyTarget
              const destId = copyProjectId
              const destName = workspace.projects.find((p) => p.id === destId)?.name ?? 'project'
              void runListAction(async () => {
                await commit((current) => copyRubricToProject(current, source.id, destId))
                setCopyTarget(undefined)
                setNotice(`Copied "${source.title}" to "${destName}" as version 1.`)
              })
            }}
          >
            <Copy size={16} />Copy rubric
          </button>
        </div>
      </Modal>
    )}
    {deleteTarget && (
      <Modal title={`Delete "${deleteTarget.title}"?`} onClose={() => setDeleteTarget(undefined)}>
        <p>This permanently deletes every version of this rubric because no scripts reference it.</p>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={() => setDeleteTarget(undefined)}>Cancel</button>
          <button
            type="button"
            className="button destructive"
            disabled={listBusy}
            onClick={() => {
              const target = deleteTarget
              void runListAction(async () => {
                await commit((current) => deleteRubricSeries(current, target.series))
                setDeleteTarget(undefined)
                setNotice(`Deleted "${target.title}".`)
              })
            }}
          >
            Delete rubric
          </button>
        </div>
      </Modal>
    )}
  </>
}

function RubricEditor({ original, initialFile, workspace, commit, deviceReady, imageReady, onAllowCloud, close }: {
  original: Rubric
  initialFile?: File
  workspace: Workspace
  commit: Commit
  deviceReady: boolean
  imageReady: boolean
  onAllowCloud?: () => Promise<void>
  close: (savedMessage?: string) => void
}) {
  const [rubric, setRubric] = useState(original)
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState<Provenance>()
  const [cameraOpen, setCameraOpen] = useState(false)
  const [refPhotoSource, setRefPhotoSource] = useState<Blob>()
  const [refPhoto, setRefPhoto] = useState<Blob>()
  const [refEnhance, setRefEnhance] = useState(false)
  const [refBlurry, setRefBlurry] = useState(false)
  const [refZoom, setRefZoom] = useState(false)
  const [importedName, setImportedName] = useState('')
  const [importedText, setImportedText] = useState('')
  const [importNotice, setImportNotice] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [pendingDraft, setPendingDraft] = useState<{ draft: ParsedRubricDraft; summary: string }>()
  const [pendingAiDraft, setPendingAiDraft] = useState(false)
  const [auditPreview, setAuditPreview] = useState(false)
  const [briefPreview, setBriefPreview] = useState(false)
  const [audit, setAudit] = useState<RubricAuditResult>()
  const [appliedIssues, setAppliedIssues] = useState<Record<number, boolean>>({})
  const { run, setError, error, busy, cancel } = useAction()
  const photoInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)
  const initialHandled = useRef(false)
  const photoUrl = useObjectUrl(refPhoto)

  const project = activeProjectOf(workspace)
  const editingExisting = workspace.rubrics.some((row) => row.id === original.id)
  const inUse = editingExisting && rubricInUse(workspace, original.id)
  const markedCount = inUse ? markedScriptsCount(workspace, original.id) : 0
  const cloudFallbackReady = canRunAi('auditRubric', { deviceAvailable: false, allowCloud: workspace.allowCloud })
  const hybridTextReady = canRunAi('draftRubric', { deviceAvailable: deviceReady, allowCloud: workspace.allowCloud })
  const hybridImageReady = canRunAi('readRubricPhoto', { deviceAvailable: imageReady, allowCloud: workspace.allowCloud })
  const canAudit = Boolean(
    rubric.title.trim() &&
    rubric.question.trim() &&
    rubric.criteria.some((criterion) => criterion.title.trim() && criterion.levels[0]?.trim() && criterion.levels[criterion.max]?.trim()),
  )
  // Key points are drafted cloud-first from the rubric alone; the on-device model takes over when cloud AI is off.
  const briefReady = canRunAi('draftMarkingBrief', { deviceAvailable: deviceReady, allowCloud: workspace.allowCloud })
  const missingKeyPointsCount = rubric.criteria.filter((c) => !(c.keyPoints ?? '').trim()).length
  const missingPracticeCount = rubric.criteria.filter((c) => !c.practice.trim()).length
  const hasNamedCriteria = rubric.criteria.some((c) => c.title.trim().length > 0)
  const estimatedTokens = estimateRubricTokens(rubric)

  const auditPayload = {
    title: rubric.title.trim(),
    question: rubric.question.trim(),
    criteria: expandedCriteria(rubric).map((criterion) => ({
      title: criterion.title.trim(),
      max: criterion.max,
      levels: criterion.levels.map((level) => level.trim()),
    })),
  }

  function setCriterion(id: string, change: Partial<Criterion>) {
    setRubric((current) => ({ ...current, criteria: current.criteria.map((row) => row.id === id ? { ...row, ...change } : row) }))
  }

  function findAuditTarget(issue: AuditIssue): { canApply: boolean; criterion?: Criterion } {
    if (issue.field === 'question') return { canApply: true }
    const needle = issue.criterionTitle.trim().toLowerCase()
    const match = rubric.criteria.find((c) => c.title.trim().toLowerCase() === needle)
    if (!match) return { canApply: false }
    if (issue.field === 'title') return { canApply: true, criterion: match }
    if (issue.field === 'level') {
      if (issue.level !== null && Number.isInteger(issue.level) && issue.level >= 0 && issue.level <= match.max) {
        return { canApply: true, criterion: match }
      }
      return { canApply: false, criterion: match }
    }
    return { canApply: false }
  }

  function applyAuditIssue(issue: AuditIssue, idx: number) {
    const target = findAuditTarget(issue)
    if (!target.canApply) return
    if (issue.field === 'question') {
      setRubric((current) => ({ ...current, question: issue.replacement.slice(0, 1000) }))
    } else if (target.criterion) {
      if (issue.field === 'title') {
        setCriterion(target.criterion.id, { title: issue.replacement.slice(0, 90) })
      } else if (issue.field === 'level' && issue.level !== null) {
        const levelIndex = issue.level
        setRubric((current) => ({
          ...current,
          criteria: current.criteria.map((row) =>
            row.id === target.criterion!.id
              ? {
                  ...row,
                  levels: row.levels.map((lvl, i) => (i === levelIndex ? issue.replacement.slice(0, 600) : lvl)),
                }
              : row,
          ),
        }))
      }
    }
    setAppliedIssues((prev) => ({ ...prev, [idx]: true }))
  }

  function applyParsedDraft(draft: ParsedRubricDraft, summary: string, force = false) {
    if (!force && draft.parsedCriteriaCount > 0 && hasFilledCriteria(rubric)) {
      setPendingDraft({ draft, summary })
      return
    }
    setRubric((current) => ({
      ...current,
      title: current.title.trim() ? current.title : draft.title,
      question: current.question.trim() ? current.question : draft.question,
      criteria: draft.parsedCriteriaCount > 0 ? draft.criteria : current.criteria,
    }))
    setPendingDraft(undefined)
    setImportNotice(summary)
  }

  async function importFile(file: File) {
    setError('')
    setImportNotice('')
    setPendingDraft(undefined)
    const kind = detectFileKind(file)

    if (kind === 'image') {
      setImportLoading(true)
      try {
        const prepared = await preparePhotoWithMetrics(file)
        setRefPhotoSource(file)
        setRefPhoto(prepared.blob)
        setRefEnhance(false)
        setRefBlurry(prepared.blurry)
        setRefZoom(false)
        setImportedName(file.name)
        setImportNotice(
          hybridImageReady
            ? `Photo "${file.name}" attached. Click "Read rubric from photo" to extract criteria, or enter them manually.`
            : `Photo "${file.name}" attached as a visual reference while you enter or edit criteria below.`,
        )
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Could not open this photo.')
      } finally {
        setImportLoading(false)
      }
      return
    }

    if (kind === 'pdf' || kind === 'docx' || kind === 'txt') {
      setImportLoading(true)
      try {
        const extracted = await extractDocument(file)
        setImportedName(extracted.filename)
        if (extracted.text) {
          setRefPhotoSource(undefined)
          setRefPhoto(undefined)
          setRefEnhance(false)
          setRefBlurry(false)
          setImportedText(extracted.text)
          setNotes(extracted.text.slice(0, 1800))
          const draft = parseRubricText(extracted.text, extracted.filename)
          const summary = draft.parsedCriteriaCount > 0
            ? `Imported ${draft.parsedCriteriaCount} ${draft.parsedCriteriaCount === 1 ? 'criterion' : 'criteria'} from "${extracted.filename}". Review the titles, marks, and level descriptions before saving.`
            : `Extracted text from "${extracted.filename}". Fill in the criteria below or use AI to draft them from the notes.`
          applyParsedDraft(draft, summary)
        } else if (extracted.previewImage) {
          const prepared = await preparePhotoWithMetrics(extracted.previewImage)
          setRefPhotoSource(extracted.previewImage)
          setRefPhoto(prepared.blob)
          setRefEnhance(false)
          setRefBlurry(false)
          setRefZoom(false)
          setImportedText('')
          setImportNotice(
            hybridImageReady
              ? `No selectable text was found in "${extracted.filename}", so it was attached as an image. Click "Read rubric from photo" or enter criteria manually.`
              : `No selectable text was found in "${extracted.filename}", so it was attached as a visual reference below.`,
          )
        }
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Could not import this file.')
      } finally {
        setImportLoading(false)
      }
      return
    }

    setError('Unsupported file format. Choose an image, PDF, DOCX, or TXT file.')
  }

  useEffect(() => {
    if (!initialHandled.current && initialFile) {
      initialHandled.current = true
      void importFile(initialFile)
    }
  }, [initialFile])

  function runAiDraft() {
    setPendingAiDraft(false)
    void run(async (active) => {
      const draft = await draftRubric(rubric.question, notes, active)
      if (active()) {
        setRubric((current) => ({ ...current, criteria: draft.criteria }))
        setSource(draft.provenance)
        if (draft.notes.length > 0) {
          setImportNotice(`${draft.notes.join(' ')} Check before saving.`)
        }
      }
    })
  }

  function runPracticeDraft() {
    void run(async (active) => {
      const result = await draftPracticeQuestions(rubric, active)
      if (!active()) return
      setRubric((current) => ({
        ...current,
        criteria: current.criteria.map((criterion, idx) =>
          criterion.practice.trim()
            ? criterion
            : { ...criterion, practice: result.practice[idx] ?? criterion.practice },
        ),
      }))
      setSource(result.provenance)
      setImportNotice('Drafted missing practice questions. Review them before saving.')
    })
  }

  function runBriefDraft() {
    setBriefPreview(false)
    void run(async (active) => {
      const result = await draftMarkingBrief(rubric, active)
      if (!active()) return
      setRubric((current) => ({
        ...current,
        criteria: current.criteria.map((criterion) =>
          (criterion.keyPoints ?? '').trim()
            ? criterion
            : { ...criterion, keyPoints: result.keyPoints[criterion.id] ?? criterion.keyPoints },
        ),
      }))
      setSource(result.provenance)
      setImportNotice('Drafted key points for the marker. Review them before saving.')
    })
  }

  return <form className="editor" onSubmit={(event) => {
    event.preventDefault()
    void run(async () => {
      const cleaned: Rubric = {
        ...rubric,
        projectId: original.projectId ?? workspace.activeProjectId,
        title: rubric.title.trim(),
        question: rubric.question.trim(),
        criteria: rubric.criteria.map((row) => ({
          ...row,
          title: row.title.trim(),
          levels: row.levels.map((level) => level.trim()),
          practice: row.practice.trim(),
          keyPoints: (row.keyPoints ?? '').trim().slice(0, MAX_KEY_POINTS),
        })),
      }
      validateRubric(cleaned)
      let savedVersion = cleaned.version
      await commit((current) => {
        if (!editingExisting) return { ...current, rubrics: [...current.rubrics, cleaned] }
        if (current.rubrics.some((row) => row.series === original.series && row.version > original.version)) {
          throw new Error('A newer version already exists. Open it before making changes.')
        }
        if (!rubricInUse(current, original.id)) {
          const inPlace: Rubric = { ...cleaned, id: original.id, series: original.series, version: original.version }
          savedVersion = original.version
          return { ...current, rubrics: current.rubrics.map((row) => (row.id === original.id ? inPlace : row)) }
        }
        const next: Rubric = { ...cleaned, id: crypto.randomUUID(), version: original.version + 1 }
        savedVersion = next.version
        return { ...current, rubrics: [...current.rubrics, next] }
      })
      close(`Rubric saved in "${project.name}" (v${savedVersion}).`)
    })
  }}>
    <section className="panel form-panel">
      <div className="section-heading"><h2>{editingExisting ? `Edit rubric · v${original.version}` : 'New rubric'}</h2>{source && <Source value={source} />}</div>
      {inUse && (
        <Notice>
          {markedCount} marked {markedCount === 1 ? 'script uses' : 'scripts use'} version {original.version}. Saving creates version {original.version + 1}; they keep version {original.version}.
        </Notice>
      )}

      <input ref={photoInput} type="file" accept="image/*" aria-label="Choose rubric photo" className="visually-hidden" tabIndex={-1}
        onChange={(event) => { const f = event.target.files?.[0]; event.target.value = ''; if (f) void importFile(f) }} />
      <input ref={docInput} type="file" accept={DOCUMENT_ACCEPT} aria-label="Upload rubric PDF, DOCX, or TXT" className="visually-hidden" tabIndex={-1}
        onChange={(event) => { const f = event.target.files?.[0]; event.target.value = ''; if (f) void importFile(f) }} />

      <div className="import-bar">
        <div>
          <strong>Import rubric from photo or file</strong>
          <p className="muted">Photograph a printed mark scheme or upload a PDF, DOCX, or TXT file.</p>
        </div>
        <div className="button-row tool-row">
          <button type="button" className="button secondary" disabled={busy || importLoading} onClick={() => setCameraOpen(true)}>
            <Camera size={16} />Take photo
          </button>
          <button type="button" className="button secondary" disabled={busy || importLoading} onClick={() => photoInput.current?.click()}>
            <FileImage size={16} />Choose photo
          </button>
          <button type="button" className="button secondary" disabled={busy || importLoading} onClick={() => docInput.current?.click()}>
            <FileUp size={16} />Upload PDF / DOCX / TXT
          </button>
        </div>
        {!editingExisting && !hasFilledCriteria(rubric) && !rubric.title.trim() && (
          <div className="template-bar inline">
            <span className="preset-label">Quick starter templates</span>
            <div className="template-chips">
              {STARTER_RUBRICS.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="button subtle compact-btn"
                  disabled={busy || importLoading}
                  onClick={() => {
                    const loaded = createRubricFromTemplate(template.id, project.id)
                    setRubric((current) => ({ ...loaded, id: current.id, series: current.series, version: current.version }))
                    setImportNotice(`Loaded "${template.label}" starter template. Customise the title, question, and criteria below.`)
                  }}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {importLoading && <Loading>Reading imported rubric…</Loading>}
      {importNotice && <Notice>{importNotice}</Notice>}

      {pendingDraft && <Notice>
        <div className="inline-confirm">
          <span>Replace your current criteria with {pendingDraft.draft.parsedCriteriaCount} parsed criteria from this file?</span>
          <div className="button-row">
            <button type="button" className="button primary" onClick={() => applyParsedDraft(pendingDraft.draft, pendingDraft.summary, true)}>Replace criteria</button>
            <button type="button" className="button secondary" onClick={() => { setPendingDraft(undefined); setImportNotice('Kept your existing criteria. Imported text is available below for reference.') }}>Keep current</button>
          </div>
        </div>
      </Notice>}

      {photoUrl && <div className="rubric-photo-box">
        <div className="section-heading">
          <h3>Rubric photo reference {importedName ? <small className="muted">· {importedName}</small> : null}</h3>
          <div className="button-row">
            {hybridImageReady && <button type="button" className="button secondary" disabled={busy} onClick={() => {
              void run(async (active) => {
                if (!refPhoto) return
                const result = await readRubricPhoto(refPhoto, active)
                if (!active()) return
                setImportedText(result.text)
                setNotes(result.text.slice(0, 1800))
                setSource(result.provenance)
                const draft = parseRubricText(result.text, importedName)
                const summary = draft.parsedCriteriaCount > 0
                  ? `Read ${draft.parsedCriteriaCount} ${draft.parsedCriteriaCount === 1 ? 'criterion' : 'criteria'} from the rubric photo. Review before saving.`
                  : 'Read text from the rubric photo. Review the text below and fill in or refine the criteria.'
                applyParsedDraft(draft, summary)
              })
            }}><Sparkles size={16} />{cloudFallbackReady ? 'Read rubric from photo (Hybrid AI)' : 'Read rubric from photo'}</button>}
            <button
              type="button"
              className="button subtle"
              aria-pressed={refEnhance}
              disabled={busy || importLoading || !refPhotoSource}
              onClick={() => {
                if (!refPhotoSource) return
                const nextEnhance = !refEnhance
                setRefEnhance(nextEnhance)
                setImportLoading(true)
                void preparePhotoWithMetrics(refPhotoSource, 0, noCrop, { enhance: nextEnhance }).then(
                  (prepared) => { setRefPhoto(prepared.blob); setImportLoading(false) },
                  () => { setImportLoading(false) },
                )
              }}
            >
              <Contrast size={16} />{refEnhance ? 'Enhanced' : 'Enhance scan'}
            </button>
            <button type="button" className="button subtle" aria-pressed={refZoom} onClick={() => setRefZoom(!refZoom)}>
              <ZoomIn size={16} />{refZoom ? 'Fit' : 'Zoom'}
            </button>
            <button type="button" className="icon-button" aria-label="Remove reference photo" onClick={() => {
              setRefPhotoSource(undefined)
              setRefPhoto(undefined)
              setRefEnhance(false)
              setRefBlurry(false)
              setRefZoom(false)
            }}>
              <X size={18} />
            </button>
          </div>
        </div>
        {refBlurry && <Notice error>This rubric photo looks slightly blurry. Retake in steady light or try Enhance scan for cleaner criteria extraction.</Notice>}
        <div className={'photo-preview transfer-preview' + (refZoom ? ' zoomed' : '')} tabIndex={refZoom ? 0 : undefined}>
          <img src={photoUrl} alt="Imported rubric reference" />
        </div>
      </div>}

      {importedText && <details className="scoring-details">
        <summary>View imported document text ({importedName || 'source'})</summary>
        <pre className="payload source-text-preview">{importedText}</pre>
      </details>}

      <label className="field"><span>Assessment title</span><input maxLength={100} value={rubric.title} required
        placeholder="e.g. Processes and threads" onChange={(event) => setRubric({ ...rubric, title: event.target.value })} /></label>
      <label className="field"><span>Question</span><textarea required rows={3} maxLength={1000} value={rubric.question}
        placeholder="Enter the question students answered." onChange={(event) => setRubric({ ...rubric, question: event.target.value })} /></label>
      {hybridTextReady && <>
        <label className="field"><span>Draft notes for AI <small>Optional · prefers on-device AI</small></span><textarea rows={3} maxLength={1800}
          value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="button-row">
          <button type="button" className="button secondary" disabled={busy || !rubric.question.trim()} onClick={() => {
            if (hasFilledCriteria(rubric)) setPendingAiDraft(true)
            else runAiDraft()
          }}><Sparkles size={17} />{cloudFallbackReady ? 'Draft rubric (Hybrid AI)' : 'Draft rubric on this device'}</button>
          <button type="button" className="button secondary" disabled={busy || !canAudit || !cloudFallbackReady}
            onClick={() => setAuditPreview(true)}><Cloud size={17} />Audit rubric quality (Cloud AI)</button>
        </div>
        {pendingAiDraft && <Notice>
          <div className="inline-confirm">
            <span>Replace the current criteria with an AI draft?</span>
            <div className="button-row">
              <button type="button" className="button primary" onClick={runAiDraft}>Replace criteria</button>
              <button type="button" className="button secondary" onClick={() => setPendingAiDraft(false)}>Cancel</button>
            </div>
          </div>
        </Notice>}
      </>}
      {!hybridTextReady && canAudit && <div className="button-row">
        <button type="button" className="button secondary" disabled={busy || !cloudFallbackReady}
          onClick={() => setAuditPreview(true)}><Cloud size={17} />Audit rubric quality (Cloud AI)</button>
      </div>}
      {!workspace.allowCloud && cloudConfigured && onAllowCloud && (
        <Notice>
          <div className="inline-confirm">
            <span>Cloud AI is off. Allow it to audit rubric quality, draft cloud key points, or draft rubrics without on-device AI (only rubric text is sent — never student scripts).</span>
            <AllowCloudButton onAllowCloud={onAllowCloud} />
          </div>
        </Notice>
      )}
      {audit && workspace.allowCloud && <div className="audit-card">
        <div className="section-heading">
          <h3>Rubric quality audit</h3>
          <Source value={audit.provenance} />
        </div>
        <p>{audit.summary}</p>
        {audit.issues.length > 0 ? <div className="audit-issues">
          {audit.issues.map((item, idx) => {
            const target = findAuditTarget(item)
            const applied = Boolean(appliedIssues[idx])
            return <div className="audit-issue" key={idx}>
              <div className="audit-issue-head">
                <div>
                  <strong>{item.criterionTitle}</strong>
                  <span className="audit-field-tag">{auditTargetDescription(item)}</span>
                </div>
                <button
                  type="button"
                  className={applied ? 'button subtle compact-btn' : 'button secondary compact-btn'}
                  disabled={!target.canApply || applied}
                  title={target.canApply ? 'Replace this field in the editor below' : 'No matching criterion or level found in the editor'}
                  onClick={() => applyAuditIssue(item, idx)}
                >
                  {applied ? <><Check size={14} />Applied</> : 'Apply'}
                </button>
              </div>
              <p><b>Issue:</b> {item.issue}</p>
              <p><b>Suggested rewrite:</b> {item.replacement}</p>
            </div>
          })}
        </div> : <p className="muted">No major reliability issues found in this rubric.</p>}
      </div>}
    </section>
    <div className="section-heading">
      <h2>Scoring criteria</h2>
      <div className="button-row">
        {estimatedTokens > ON_DEVICE_TOKEN_THRESHOLD && (
          <span className="badge neutral" title="Long rubrics are automatically marked one criterion at a time on-device.">
            On-device size: ~{estimatedTokens.toLocaleString()} tokens
          </span>
        )}
        <span className="badge neutral">{total(rubric)} marks total</span>
      </div>
    </div>
    {rubric.criteria.map((criterion, index) => <section className="panel form-panel criterion-editor" key={criterion.id}>
      <div className="section-heading"><h3>Criterion {index + 1}</h3>
        {rubric.criteria.length > 1 && <button className="icon-button" type="button" aria-label={'Remove criterion ' + (index + 1)}
          onClick={() => setRubric({ ...rubric, criteria: rubric.criteria.filter((row) => row.id !== criterion.id) })}><Trash2 size={18} /></button>}
      </div>
      <div className="fields-inline">
        <label className="field"><span>Criterion title</span><input value={criterion.title} maxLength={90} required
          onChange={(event) => setCriterion(criterion.id, { title: event.target.value })} /></label>
        <label className="field"><span>Max marks</span><select value={criterion.max} onChange={(event) => {
          const max = Number(event.target.value)
          setCriterion(criterion.id, { max, levels: Array.from({ length: max + 1 }, (_, level) => criterion.levels[level] ?? '') })
        }}>{Array.from({ length: MAX_SCORE }, (_, score) => <option key={score + 1}>{score + 1}</option>)}</select></label>
      </div>
      {criterion.max > 5 && (
        <p className="muted">Small on-device models mark more consistently on 0–3 scales. Consider splitting this criterion.</p>
      )}
      {criterion.levels.map((level, mark) => {
        const isAnchor = mark === 0 || mark === criterion.max
        return <label className="field mark-level" key={mark}>
          <span>{mark} {mark === 1 ? 'mark' : 'marks'} {!isAnchor && <small>Optional</small>}</span>
          <input
            required={isAnchor}
            maxLength={600}
            value={level}
            placeholder={isAnchor ? 'What earns ' + mark + '?' : `Optional: between 0 and ${criterion.max} marks`}
            onChange={(event) => setCriterion(criterion.id, { levels: criterion.levels.map((value, idx) => idx === mark ? event.target.value : value) })}
          />
        </label>
      })}
      <label className="field"><span>Key points for the marker <small>Optional · never shown to students</small></span><textarea
        rows={2}
        maxLength={MAX_KEY_POINTS}
        value={criterion.keyPoints ?? ''}
        placeholder="Specific formulas, terms, or pitfalls the marker should look for."
        onChange={(event) => setCriterion(criterion.id, { keyPoints: event.target.value })}
      /></label>
      <label className="field"><span>Practice question <small>Optional · shared in student feedback</small></span><input maxLength={200} value={criterion.practice}
        placeholder="e.g. Give one example where this concept applies."
        onChange={(event) => setCriterion(criterion.id, { practice: event.target.value })} /></label>
    </section>)}
    {rubric.criteria.length < MAX_CRITERIA && <button type="button" className="button secondary" onClick={() => {
      setError('')
      setRubric({ ...rubric, criteria: [...rubric.criteria, newCriterion()] })
    }}><Plus size={17} />Add criterion</button>}
    {missingKeyPointsCount > 0 && canAudit && briefReady && (
      <Notice>
        <div className="inline-confirm">
          <span>
            {missingKeyPointsCount} {missingKeyPointsCount === 1 ? 'criterion has' : 'criteria have'} no key points for the marker.
            {cloudFallbackReady ? ' Cloud AI can draft them from this rubric alone.' : ' On-device AI can draft them.'}
          </span>
          <button type="button" className="button secondary compact-btn" disabled={busy}
            onClick={() => { if (cloudFallbackReady) setBriefPreview(true); else runBriefDraft() }}>
            {cloudFallbackReady ? <Cloud size={15} /> : <Sparkles size={15} />}Draft key points
          </button>
        </div>
      </Notice>
    )}
    {missingPracticeCount > 0 && hasNamedCriteria && (
      <Notice>
        <div className="inline-confirm">
          <span>
            {missingPracticeCount} {missingPracticeCount === 1 ? 'criterion has' : 'criteria have'} no practice question.
          </span>
          {hybridTextReady && (
            <button type="button" className="button secondary compact-btn" disabled={busy} onClick={runPracticeDraft}>
              <Sparkles size={15} />Draft practice questions
            </button>
          )}
        </div>
      </Notice>
    )}
    {error && <Notice error>{error}</Notice>}
    {busy && <Loading>Working on your rubric…</Loading>}
    <footer className="form-actions">
      <button type="button" className="button secondary" onClick={() => { cancel(); close() }}>Cancel</button>
      <button type="submit" className="button primary" disabled={busy}><Save size={17} />Save rubric</button>
    </footer>
    {cameraOpen && <CameraModal title="Photograph a rubric" onClose={() => setCameraOpen(false)} onCapture={(file) => {
      setCameraOpen(false)
      void importFile(file)
    }} />}
    {auditPreview && <Modal title="Review cloud payload" onClose={() => setAuditPreview(false)}>
      <p><Info size={16} className="inline-icon" /> Firebase receives only this rubric’s title, question, and scoring criteria. No student data or private marker key points are sent.</p>
      <pre className="payload">{JSON.stringify(auditPayload, null, 2)}</pre>
      <button type="button" className="button primary" disabled={!cloudFallbackReady || !canAudit} onClick={() => {
        setAuditPreview(false)
        void run(async (active) => {
          const result = await auditRubric(rubric, active)
          if (active()) {
            setAudit(result)
            setAppliedIssues({})
          }
        })
      }}><Cloud size={17} />Run cloud rubric audit</button>
    </Modal>}
    {briefPreview && <Modal title="Review cloud payload" onClose={() => setBriefPreview(false)}>
      <p><Info size={16} className="inline-icon" /> Firebase receives only this rubric’s title, question, and scoring criteria. No student data or existing key points are sent.
        {deviceReady && ' If the cloud request fails, on-device AI drafts the key points instead.'}</p>
      <pre className="payload">{JSON.stringify(markingBriefPayload(rubric), null, 2)}</pre>
      <button type="button" className="button primary" disabled={!briefReady || !canAudit} onClick={runBriefDraft}>
        <Cloud size={17} />Draft key points
      </button>
    </Modal>}
  </form>
}
