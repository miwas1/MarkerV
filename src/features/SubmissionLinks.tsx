import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileUp,
  Inbox,
  Link2,
  Lock,
  LockOpen,
  LogIn,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth'
import {
  buildSubmissionUrl,
  dataUrlToBlob,
  defaultSubmissionFields,
  FIELD_PRESETS,
  fieldAcceptSummary,
  MAX_FIELD_LABEL,
  MAX_FIELD_PLACEHOLDER,
  MAX_FIELDS,
  MAX_PORTAL_INSTRUCTIONS,
  MAX_PORTAL_TITLE,
  rubricSnapshotTotal,
  toRubricSnapshot,
  type FieldType,
  type FileAcceptKind,
  type StudentSubmissionDoc,
  type SubmissionFieldDef,
  type SubmissionLinkDoc,
} from '../domain/submissionLink'
import {
  activeProjectOf,
  addScript,
  latestRubrics,
  MAX_ANSWER,
  total,
  type Rubric,
  type Workspace,
} from '../domain/workspace'
import {
  createSubmissionLink,
  deleteStudentSubmission,
  deleteSubmissionLink,
  formatFriendlyFirestoreError,
  markSubmissionImported,
  runAutoMarkEngine,
  saveSubmissionAutoMarks,
  subscribeLecturerLinks,
  subscribeLinkSubmissions,
  testConnection,
  toggleSubmissionLinkOpen,
  updateSubmissionLinkConfig,
} from '../storage/submissionLinks'
import { Loading, Modal, Notice, useAction, type Commit } from '../ui'

type PortalMode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; link: SubmissionLinkDoc }
  | { kind: 'inbox'; linkId: string }

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fieldTypeLabel(type: FieldType): string {
  switch (type) {
    case 'short_text': return 'Short text'
    case 'long_text': return 'Large text'
    case 'file': return 'File upload'
  }
}

export function SubmissionLinks({
  workspace,
  commit,
  deviceReady,
}: {
  workspace: Workspace
  commit: Commit
  deviceReady: boolean
}) {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const [links, setLinks] = useState<SubmissionLinkDoc[]>([])
  const [linksLoading, setLinksLoading] = useState(true)
  const [linksError, setLinksError] = useState('')
  const [mode, setMode] = useState<PortalMode>({ kind: 'list' })
  const [copiedId, setCopiedId] = useState('')
  const [banner, setBanner] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<SubmissionLinkDoc | null>(null)
  const [projectScope, setProjectScope] = useState<'active' | 'all'>('active')
  const { run, busy, error: actionError, setError: setActionError } = useAction()

  const project = activeProjectOf(workspace)
  const scopedRubrics = useMemo(
    () => latestRubrics(workspace, project.id),
    [workspace, project.id],
  )

  useEffect(() => {
    if (!user) {
      setLinks([])
      setLinksLoading(false)
      setLinksError('')
      return
    }
    void testConnection()
    setLinksLoading(true)
    setLinksError('')
    const unsubscribe = subscribeLecturerLinks(
      user.uid,
      (next) => {
        setLinks(next)
        setLinksLoading(false)
      },
      (message) => {
        setLinksError(message)
        setLinksLoading(false)
      },
    )
    return unsubscribe
  }, [user])

  const visibleLinks = useMemo(() => {
    if (projectScope === 'all') return links
    return links.filter((link) => link.projectId === project.id)
  }, [links, projectScope, project.id])

  const selectedInboxLink = useMemo(() => {
    if (mode.kind !== 'inbox') return undefined
    return links.find((item) => item.id === mode.linkId)
  }, [links, mode])

  function copyLink(linkId: string) {
    const url = buildSubmissionUrl(linkId)
    void navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(linkId)
      window.setTimeout(() => setCopiedId((prev) => (prev === linkId ? '' : prev)), 2200)
    })
  }

  if (authLoading) {
    return (
      <section className="panel form-panel">
        <Loading>Checking lecturer account…</Loading>
      </section>
    )
  }

  if (!user) {
    return (
      <>
        <header className="page-heading">
          <div>
            <h1>Submission links</h1>
            <p>Generate unique pages where students submit written answers or files directly to your course.</p>
          </div>
        </header>
        <section className="panel form-panel portal-gate-card">
          <div className="empty-state">
            <span className="empty-icon"><Link2 size={24} /></span>
            <h2>Sign in to generate shareable student links</h2>
            <p>
              Creating a unique submission portal stores the form configuration and incoming student responses securely
              under your lecturer account so students can submit from any phone or computer.
            </p>
            <div className="button-row">
              <Link
                className="button primary"
                to="/login"
                state={{ from: location.pathname }}
              >
                <LogIn size={17} />Sign in with email
              </Link>
              <Link
                className="button secondary"
                to="/signup"
                state={{ from: location.pathname }}
              >
                Create lecturer account
              </Link>
            </div>
          </div>
        </section>
      </>
    )
  }

  if (mode.kind === 'create' || mode.kind === 'edit') {
    const editingLink = mode.kind === 'edit' ? mode.link : undefined
    return (
      <LinkBuilder
        user={user}
        project={project}
        rubrics={scopedRubrics}
        editingLink={editingLink}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={(linkId, created) => {
          setBanner(
            created
              ? 'Unique submission link generated. Copy and share it with your students.'
              : 'Submission link configuration updated.',
          )
          setMode({ kind: 'inbox', linkId })
        }}
      />
    )
  }

  if (mode.kind === 'inbox' && selectedInboxLink) {
    return (
      <SubmissionInbox
        link={selectedInboxLink}
        userId={user.uid}
        workspace={workspace}
        commit={commit}
        deviceReady={deviceReady}
        copied={copiedId === selectedInboxLink.id}
        onCopy={() => copyLink(selectedInboxLink.id)}
        onEdit={() => setMode({ kind: 'edit', link: selectedInboxLink })}
        onToggleOpen={() => {
          void run(async () => {
            await toggleSubmissionLinkOpen(selectedInboxLink.id, !selectedInboxLink.isOpen)
          })
        }}
        onBack={() => setMode({ kind: 'list' })}
      />
    )
  }

  const openCount = visibleLinks.filter((l) => l.isOpen).length
  const autoMarkCount = visibleLinks.filter((l) => l.autoMark).length

  return (
    <div className="dashboard">
      <header className="page-heading">
        <div>
          <h1>Submission links</h1>
          <p>
            Configure student submission fields, generate unique shareable links, and optionally auto-mark responses as they arrive.
          </p>
        </div>
        <button
          type="button"
          className="button primary nowrap-btn"
          onClick={() => {
            setBanner('')
            setActionError('')
            setMode({ kind: 'create' })
          }}
        >
          <Plus size={18} />Generate submission link
        </button>
      </header>

      {banner && <Notice>{banner}</Notice>}
      {linksError && <Notice error>{linksError}</Notice>}
      {actionError && <Notice error>{actionError}</Notice>}
      <Notice>
        Answers students send through a link are stored online in your own Firestore dropbox, with any suggested marks
        you save on them, until you delete them. They are never sent to cloud AI, and marking still runs on this device.
      </Notice>

      <section className="stats" aria-label="Submission link totals">
        <div className="stat panel">
          <span className="stat-icon mint"><Link2 size={20} strokeWidth={1.8} /></span>
          <div><span>Portals</span><strong>{visibleLinks.length}</strong></div>
        </div>
        <div className="stat panel">
          <span className="stat-icon blue"><LockOpen size={20} strokeWidth={1.8} /></span>
          <div><span>Accepting work</span><strong>{openCount}</strong></div>
        </div>
        <div className="stat panel">
          <span className="stat-icon sand"><Sparkles size={20} strokeWidth={1.8} /></span>
          <div><span>Auto-marking</span><strong>{autoMarkCount}</strong></div>
        </div>
      </section>

      <section className="panel queue">
        <div className="queue-header">
          <div>
            <h2>Generated links</h2>
            <p>
              {projectScope === 'active'
                ? `Showing portals in ${project.name}`
                : 'Showing portals across all projects'}
            </p>
          </div>
          {links.length > 0 && (
            <div className="segmented" role="tablist" aria-label="Filter portals by project">
              <button
                type="button"
                role="tab"
                aria-pressed={projectScope === 'active'}
                onClick={() => setProjectScope('active')}
              >
                This project
              </button>
              <button
                type="button"
                role="tab"
                aria-pressed={projectScope === 'all'}
                onClick={() => setProjectScope('all')}
              >
                All ({links.length})
              </button>
            </div>
          )}
        </div>

        {linksLoading ? (
          <div className="form-panel"><Loading>Loading submission links…</Loading></div>
        ) : visibleLinks.length === 0 ? (
          <div className="empty-state queue-empty">
            <span className="empty-icon"><Link2 size={24} /></span>
            <h3>
              {links.length > 0
                ? `No submission links in ${project.name} yet`
                : 'No submission links created yet'}
            </h3>
            <p>
              Create a unique portal with customizable fields like Full Name, Matric Number, written responses, and file uploads.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button primary"
                onClick={() => setMode({ kind: 'create' })}
              >
                <Plus size={17} />Generate submission link
              </button>
              {links.length > 0 && projectScope === 'active' && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setProjectScope('all')}
                >
                  Show all projects ({links.length})
                </button>
              )}
            </div>
          </div>
        ) : (
          <ul className="portal-list">
            {visibleLinks.map((item) => {
              const url = buildSubmissionUrl(item.id)
              const isCopied = copiedId === item.id
              return (
                <li key={item.id} className="portal-row">
                  <div className="portal-row-main">
                    <div className="portal-row-title-line">
                      <h3>{item.title}</h3>
                      <span className="portal-meta-text">
                        <span>{item.isOpen ? 'Open' : 'Closed'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.autoMark ? 'Auto-mark on submit' : 'Manual review'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-num">{item.fields.length} {item.fields.length === 1 ? 'field' : 'fields'}</span>
                        {item.rubricTitle && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{item.rubricTitle}</span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="portal-url-strip">
                      <code className="portal-url-code">{url}</code>
                      <button
                        type="button"
                        className="button subtle compact-btn nowrap-btn"
                        onClick={() => copyLink(item.id)}
                      >
                        {isCopied ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy link</>}
                      </button>
                      <Link
                        className="button subtle compact-btn nowrap-btn"
                        to={`/submit/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} />Open form
                      </Link>
                    </div>

                    <p className="portal-fields-summary">
                      Fields: {item.fields.map((f) => f.label).join(', ')}
                    </p>
                  </div>

                  <div className="portal-row-actions">
                    <button
                      type="button"
                      className="button primary compact-btn nowrap-btn"
                      onClick={() => setMode({ kind: 'inbox', linkId: item.id })}
                    >
                      <Inbox size={15} />Submissions
                    </button>
                    <button
                      type="button"
                      className="button secondary compact-btn nowrap-btn"
                      onClick={() => setMode({ kind: 'edit', link: item })}
                    >
                      <Pencil size={15} />Configure
                    </button>
                    <button
                      type="button"
                      className="button subtle compact-btn nowrap-btn"
                      disabled={busy}
                      onClick={() => {
                        void run(async () => {
                          await toggleSubmissionLinkOpen(item.id, !item.isOpen)
                        })
                      }}
                    >
                      {item.isOpen ? <><Lock size={14} />Close</> : <><LockOpen size={14} />Reopen</>}
                    </button>
                    <button
                      type="button"
                      className="icon-button compact-icon-btn danger-icon"
                      aria-label={`Delete ${item.title}`}
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {deleteTarget && (
        <Modal title="Delete submission link?" onClose={() => setDeleteTarget(null)}>
          <p>
            Deleting <strong>{deleteTarget.title}</strong> immediately disables its unique URL so students can no longer
            open or submit through it. It also permanently deletes every submission received through it from your Firestore
            dropbox. Scripts you already imported into your workspace stay saved in this browser.
          </p>
          {actionError && <Notice error>{actionError}</Notice>}
          <div className="button-row">
            <button type="button" className="button secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="button destructive"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  const removed = await deleteSubmissionLink(deleteTarget.id, deleteTarget.ownerId)
                  setDeleteTarget(null)
                  setBanner(removed
                    ? `Submission link deleted, with ${removed} received ${removed === 1 ? 'submission' : 'submissions'}.`
                    : 'Submission link deleted.')
                })
              }}
            >
              Delete link
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Configurable Form Builder + Live Student Preview
// ---------------------------------------------------------------------------

function LinkBuilder({
  user,
  project,
  rubrics,
  editingLink,
  onCancel,
  onSaved,
}: {
  user: { uid: string; displayName: string | null; email: string | null }
  project: { id: string; name: string }
  rubrics: Rubric[]
  editingLink?: SubmissionLinkDoc
  onCancel: () => void
  onSaved: (linkId: string, created: boolean) => void
}) {
  const [title, setTitle] = useState(
    editingLink?.title ?? `${project.name} Submission`,
  )
  const [instructions, setInstructions] = useState(
    editingLink?.instructions ??
      'Enter your details below and either write your response or upload your completed script before submitting.',
  )
  const [isOpen, setIsOpen] = useState(editingLink?.isOpen ?? true)
  const [autoMark, setAutoMark] = useState(editingLink?.autoMark ?? false)
  const [showScoreToStudent, setShowScoreToStudent] = useState(
    editingLink?.showScoreToStudent ?? false,
  )
  const [rubricId, setRubricId] = useState(
    editingLink?.rubricId ?? rubrics[0]?.id ?? '',
  )
  const [fields, setFields] = useState<SubmissionFieldDef[]>(() =>
    editingLink?.fields.length ? editingLink.fields : defaultSubmissionFields(),
  )
  const { run, busy, error, setError } = useAction()

  const selectedRubric = useMemo(
    () => rubrics.find((r) => r.id === rubricId),
    [rubrics, rubricId],
  )

  function updateField(id: string, patch: Partial<SubmissionFieldDef>) {
    setFields((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        // Sensible marking default when lecturer switches field type
        if (patch.type && patch.type !== item.type) {
          next.useForMarking = patch.type !== 'short_text'
          if (patch.type === 'file') next.accept = next.accept || 'any'
        }
        return next
      }),
    )
  }

  function moveField(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    setFields((current) => {
      const copy = [...current]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item)
      return copy
    })
  }

  function removeField(id: string) {
    if (fields.length <= 1) return
    setFields((current) => current.filter((item) => item.id !== id))
  }

  function addFieldFromPreset(presetFactory: () => SubmissionFieldDef) {
    if (fields.length >= MAX_FIELDS) {
      setError(`You can configure up to ${MAX_FIELDS} fields per submission page.`)
      return
    }
    setError('')
    setFields((current) => [...current, presetFactory()])
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      const rubricSnapshot = selectedRubric
        ? toRubricSnapshot(selectedRubric)
        : editingLink?.rubricSnapshot && editingLink.rubricId === rubricId
          ? editingLink.rubricSnapshot
          : undefined

      if (autoMark && !rubricSnapshot) {
        throw new Error('Select a rubric before enabling auto-marking, or turn auto-mark off.')
      }

      if (editingLink) {
        await updateSubmissionLinkConfig(editingLink.id, {
          title,
          instructions,
          isOpen,
          autoMark,
          showScoreToStudent: autoMark && showScoreToStudent,
          rubricId: rubricSnapshot?.id ?? '',
          rubricTitle: rubricSnapshot?.title ?? '',
          rubricSnapshot,
          fields,
        })
        onSaved(editingLink.id, false)
        return
      }

      const newId = await createSubmissionLink({
        ownerId: user.uid,
        ownerName: user.displayName || user.email || 'Lecturer',
        projectId: project.id,
        projectName: project.name,
        title,
        instructions,
        isOpen,
        autoMark,
        showScoreToStudent: autoMark && showScoreToStudent,
        rubricId: rubricSnapshot?.id ?? '',
        rubricTitle: rubricSnapshot?.title ?? '',
        rubricSnapshot,
        fields,
      })
      onSaved(newId, true)
    })
  }

  return (
    <div>
      <button type="button" className="button subtle compact-btn back-btn" onClick={onCancel}>
        <ArrowLeft size={16} />All submission links
      </button>

      <header className="page-heading">
        <div>
          <h1>{editingLink ? 'Configure submission link' : 'Generate submission link'}</h1>
          <p>
            Customize the fields students fill out, choose whether to auto-mark on submission, and preview the live page.
          </p>
        </div>
      </header>

      <div className="portal-builder-grid">
        <form className="editor" onSubmit={(event) => { void handleSubmit(event) }}>
          <section className="panel form-panel">
            <h2>1. Portal details</h2>
            <label className="field">
              <span>Assessment / page title</span>
              <input
                required
                maxLength={MAX_PORTAL_TITLE}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. CSC 301 · Operating Systems Assignment 2"
              />
            </label>
            <label className="field">
              <span>Student instructions <small>Optional</small></span>
              <textarea
                rows={3}
                maxLength={MAX_PORTAL_INSTRUCTIONS}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Add exam prompts, word limits, or file naming instructions."
              />
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={isOpen}
                onChange={(e) => setIsOpen(e.target.checked)}
              />
              <span>Accepting student submissions immediately</span>
            </label>
          </section>

          <section className="panel form-panel">
            <div className="section-heading">
              <div>
                <h2>2. Student submission fields</h2>
                <p>Rename any field, reorder, toggle required, or add text and file uploads.</p>
              </div>
              <span className="portal-meta-text tabular-num">
                {fields.length} / {MAX_FIELDS} fields
              </span>
            </div>

            <div className="field-builder-list">
              {fields.map((field, index) => (
                <div className="field-builder-card" key={field.id}>
                  <div className="field-builder-head">
                    <span className="field-index tabular-num">
                      {String(index + 1).padStart(2, '0')}. {fieldTypeLabel(field.type)}
                    </span>
                    <div className="field-order-controls">
                      <button
                        type="button"
                        className="icon-button compact-icon-btn"
                        aria-label={`Move ${field.label || 'field'} up`}
                        disabled={index === 0}
                        onClick={() => moveField(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button compact-icon-btn"
                        aria-label={`Move ${field.label || 'field'} down`}
                        disabled={index === fields.length - 1}
                        onClick={() => moveField(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button compact-icon-btn danger-icon"
                        aria-label={`Remove ${field.label || 'field'}`}
                        disabled={fields.length <= 1}
                        onClick={() => removeField(field.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="fields-inline-even">
                    <label className="field">
                      <span>Field name</span>
                      <input
                        required
                        maxLength={MAX_FIELD_LABEL}
                        value={field.label}
                        onChange={(e) => updateField(field.id, { label: e.target.value })}
                        placeholder="e.g. Matric Number"
                      />
                    </label>
                    <label className="field">
                      <span>Input type</span>
                      <select
                        value={field.type}
                        onChange={(e) => updateField(field.id, { type: e.target.value as FieldType })}
                      >
                        <option value="short_text">Short text (Name, Matric No.)</option>
                        <option value="long_text">Large text area (Essay / Answer)</option>
                        <option value="file">File upload (PDF, DOCX, TXT, Photo)</option>
                      </select>
                    </label>
                  </div>

                  <div className="fields-inline-even">
                    <label className="field">
                      <span>Helper hint / placeholder <small>Optional</small></span>
                      <input
                        maxLength={MAX_FIELD_PLACEHOLDER}
                        value={field.placeholder}
                        onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                        placeholder="Shown inside the input field"
                      />
                    </label>
                    {field.type === 'file' && (
                      <label className="field">
                        <span>Accepted file types</span>
                        <select
                          value={field.accept}
                          onChange={(e) => updateField(field.id, { accept: e.target.value as FileAcceptKind })}
                        >
                          <option value="any">PDF, DOCX, TXT, and Photos</option>
                          <option value="documents">Documents only (PDF, DOCX, TXT)</option>
                          <option value="images">Photos / images only</option>
                        </select>
                      </label>
                    )}
                  </div>

                  <div className="field-builder-toggles">
                    <label className="switch-row compact-switch">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(field.id, { required: e.target.checked })}
                      />
                      <span>Required</span>
                    </label>
                    {field.type !== 'short_text' && (
                      <label className="switch-row compact-switch">
                        <input
                          type="checkbox"
                          checked={field.useForMarking}
                          onChange={(e) => updateField(field.id, { useForMarking: e.target.checked })}
                        />
                        <span>Use content for marking</span>
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="preset-bar">
              <span className="preset-label">Add field:</span>
              <div className="button-row">
                {FIELD_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="button secondary compact-btn nowrap-btn"
                    disabled={fields.length >= MAX_FIELDS}
                    onClick={() => addFieldFromPreset(preset.template)}
                  >
                    <Plus size={14} />{preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="button subtle compact-btn nowrap-btn"
                  onClick={() => setFields(defaultSubmissionFields())}
                >
                  Reset defaults
                </button>
              </div>
            </div>
          </section>

          <section className="panel form-panel">
            <h2>3. Marking behavior</h2>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={autoMark}
                onChange={(e) => setAutoMark(e.target.checked)}
              />
              <span>Queue incoming submissions for lecturer-side auto-marking</span>
            </label>
            <p className="muted">
              {autoMark
                ? 'Incoming answers are queued so you can run quote-verified suggestions on your own device in the inbox. Suggestions you save are stored with the submission in your dropbox. Students can never write or alter saved marks.'
                : 'Submissions are collected ungraded so you can review and mark them manually or with on-device AI in your workspace.'}
            </p>

            <label className="field">
              <span>
                Rubric {autoMark ? <small>Required for auto-marking</small> : <small>Optional</small>}
              </span>
              <select
                value={rubricId}
                onChange={(e) => setRubricId(e.target.value)}
                required={autoMark}
              >
                <option value="">{autoMark ? 'Select a rubric…' : 'No rubric linked yet'}</option>
                {rubrics.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {item.criteria.length} criteria ({total(item)} marks)
                  </option>
                ))}
                {editingLink?.rubricSnapshot && !rubrics.some((r) => r.id === editingLink.rubricId) && (
                  <option value={editingLink.rubricId}>
                    {editingLink.rubricSnapshot.title} (saved snapshot)
                  </option>
                )}
              </select>
            </label>

            {rubrics.length === 0 && !editingLink?.rubricSnapshot && (
              <Notice>
                No rubrics in <strong>{project.name}</strong> yet.{' '}
                <Link to="/workspace/rubric">Create a rubric</Link> to attach one to this portal, or leave auto-mark
                turned off for now.
              </Notice>
            )}

            {autoMark && (
              <>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={showScoreToStudent}
                    onChange={(e) => setShowScoreToStudent(e.target.checked)}
                  />
                  <span>Show a local, non-official self-check estimate on the student’s receipt</span>
                </label>
                <p className="muted">
                  Warning: enabling the student self-check estimate makes the attached rubric’s scoring level descriptions
                  readable by anyone who has this submission link.
                </p>
              </>
            )}
          </section>

          {error && <Notice error>{formatFriendlyFirestoreError(error, error)}</Notice>}
          {busy && <Loading>{editingLink ? 'Saving changes…' : 'Generating unique link…'}</Loading>}

          <footer className="form-actions">
            <button type="button" className="button secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {editingLink ? <><Save size={17} />Save changes</> : <><Link2 size={17} />Generate unique link</>}
            </button>
          </footer>
        </form>

        <aside className="portal-preview-pane" aria-label="Live student page preview">
          <div className="panel form-panel portal-preview-card">
            <div className="portal-preview-header">
              <span className="portal-meta-text">
                <span>Student page preview</span>
                <span aria-hidden="true">·</span>
                <span>{autoMark ? 'Auto-mark ON' : 'Manual marking'}</span>
              </span>
              <h3>{title.trim() || 'Untitled submission page'}</h3>
              <p className="muted">
                {project.name} · {user.displayName || user.email || 'Lecturer'}
              </p>
              {instructions.trim() && (
                <p className="portal-preview-instructions">{instructions.trim()}</p>
              )}
            </div>

            <div className="portal-preview-fields">
              {fields.map((field) => (
                <div className="portal-preview-field" key={field.id}>
                  <span className="portal-preview-label">
                    {field.label.trim() || 'Untitled field'}
                    {field.required && <strong className="required-mark" aria-hidden="true"> *</strong>}
                  </span>
                  {field.type === 'short_text' && (
                    <div className="portal-preview-input">
                      {field.placeholder || 'Short answer text'}
                    </div>
                  )}
                  {field.type === 'long_text' && (
                    <div className="portal-preview-textarea">
                      {field.placeholder || 'Large text response area'}
                    </div>
                  )}
                  {field.type === 'file' && (
                    <div className="portal-preview-dropzone">
                      <FileUp size={16} aria-hidden="true" />
                      <span>{fieldAcceptSummary(field.accept)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="portal-preview-footer">
              <span className="portal-preview-btn">
                {autoMark ? 'Submit & auto-mark' : 'Submit work'}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lecturer Submissions Inbox for a Specific Unique Link
// ---------------------------------------------------------------------------

function SubmissionInbox({
  link,
  userId,
  workspace,
  commit,
  deviceReady,
  copied,
  onCopy,
  onEdit,
  onToggleOpen,
  onBack,
}: {
  link: SubmissionLinkDoc
  userId: string
  workspace: Workspace
  commit: Commit
  deviceReady: boolean
  copied: boolean
  onCopy: () => void
  onEdit: () => void
  onToggleOpen: () => void
  onBack: () => void
}) {
  const navigate = useNavigate()
  const [submissions, setSubmissions] = useState<StudentSubmissionDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [expandedId, setExpandedId] = useState<string>('')
  const [notice, setNotice] = useState('')
  const { run, busy, error, setError } = useAction()

  const shareUrl = buildSubmissionUrl(link.id)
  const totalPossible = rubricSnapshotTotal(link.rubricSnapshot)

  useEffect(() => {
    setLoading(true)
    setLoadError('')
    const unsubscribe = subscribeLinkSubmissions(
      link.id,
      userId,
      (items) => {
        setSubmissions(items)
        setLoading(false)
        if (items.length > 0) {
          setExpandedId((prev) => prev || items[0].id)
        }
      },
      (message) => {
        setLoadError(message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [link.id, userId])

  async function importSingleSubmission(sub: StudentSubmissionDoc): Promise<string> {
    const scriptId = sub.workspaceScriptId && workspace.scripts.some((s) => s.id === sub.workspaceScriptId)
      ? sub.workspaceScriptId
      : crypto.randomUUID()

    const matchingRubric = link.rubricId && workspace.rubrics.some((r) => r.id === link.rubricId)
      ? link.rubricId
      : undefined

    const photoBlob = sub.attachmentImageDataUrl ? dataUrlToBlob(sub.attachmentImageDataUrl) : undefined
    const headerLines = sub.fieldValues
      .filter((fv) => fv.type === 'short_text' && fv.textValue.trim())
      .map((fv) => `${fv.label}: ${fv.textValue.trim()}`)
    const fallbackBody = sub.fieldValues
      .map((fv) => {
        const val = fv.type === 'file' ? (fv.extractedText || fv.fileName) : fv.textValue
        return val ? `${fv.label}: ${val}` : ''
      })
      .filter(Boolean)
      .join('\n\n')
    const transcript = (sub.combinedAnswer.trim() || fallbackBody).slice(0, MAX_ANSWER)

    const sourceLabel = headerLines.length
      ? `${sub.submitterLabel}${sub.attachmentFileName ? ' · ' + sub.attachmentFileName : ''}`
      : sub.attachmentFileName || link.title

    await commit((current) => {
      const targetProjectId = current.projects.some((p) => p.id === link.projectId)
        ? link.projectId
        : current.activeProjectId
      return addScript(current, {
        id: scriptId,
        projectId: targetProjectId,
        rubricId: matchingRubric,
        candidateRef: sub.submitterLabel?.trim() || undefined,
        photo: photoBlob,
        sourceFile: { name: sourceLabel.slice(0, 140), kind: 'submission-link' },
        transcript,
        confirmed: Boolean(transcript.trim()),
        // Always import as suggestions only — lecturer reviews and confirms every final mark on their own device.
        marks: {},
        suggestions: matchingRubric && sub.autoMarkStatus === 'marked' ? sub.suggestions : undefined,
        provenance:
          sub.autoMarkStatus === 'marked'
            ? {
                source:
                  sub.autoMarkEngine === 'device-ai'
                    ? 'device'
                    : sub.autoMarkEngine === 'rubric-heuristic'
                      ? 'heuristic'
                      : 'unknown',
              }
            : undefined,
      })
    })

    if (!sub.importedToWorkspace && sub.status !== 'reviewed') {
      await markSubmissionImported(link.id, sub.id, scriptId)
    }

    return scriptId
  }

  async function handleImportAll() {
    const pending = submissions.filter((s) => !s.importedToWorkspace)
    if (!pending.length) return
    setNotice('')
    await run(async () => {
      for (const item of pending) {
        await importSingleSubmission(item)
      }
      setNotice(`Imported ${pending.length} ${pending.length === 1 ? 'submission' : 'submissions'} into your Scripts workspace.`)
    })
  }

  async function handleAutoMarkSubmission(sub: StudentSubmissionDoc) {
    if (!link.rubricSnapshot) {
      setError('Attach a rubric in Configure to auto-mark submissions.')
      return
    }
    if (!sub.combinedAnswer.trim()) {
      setError('This submission has no extracted text to auto-mark. Import it into your workspace to transcribe the photo.')
      return
    }
    setNotice('')
    await run(async () => {
      const outcome = await runAutoMarkEngine(link.rubricSnapshot!, sub.combinedAnswer)
      await saveSubmissionAutoMarks(link.id, sub.id, outcome)
      setNotice(
        `Auto-marked ${sub.submitterLabel}: ${outcome.totalEarned} / ${outcome.totalPossible} marks (${
          outcome.engine === 'device-ai' ? 'on-device AI' : 'rubric evidence matcher'
        }).`,
      )
    })
  }

  async function handleAutoMarkPending() {
    if (!link.rubricSnapshot) return
    const pendingText = submissions.filter(
      (s) => s.autoMarkStatus === 'pending' && s.combinedAnswer.trim().length > 0,
    )
    if (!pendingText.length) return
    setNotice('')
    await run(async () => {
      for (const item of pendingText) {
        const outcome = await runAutoMarkEngine(link.rubricSnapshot!, item.combinedAnswer)
        await saveSubmissionAutoMarks(link.id, item.id, outcome)
      }
      setNotice(
        `Generated suggestions on this device for ${pendingText.length} pending ${
          pendingText.length === 1 ? 'submission' : 'submissions'
        }. Review and confirm final marks inside Scripts.`,
      )
    })
  }

  const unimportedCount = submissions.filter((s) => !s.importedToWorkspace).length
  const pendingAutoMarkCount = link.rubricSnapshot
    ? submissions.filter((s) => s.autoMarkStatus === 'pending' && s.combinedAnswer.trim().length > 0).length
    : 0

  return (
    <div className="dashboard">
      <button type="button" className="button subtle compact-btn back-btn" onClick={onBack}>
        <ArrowLeft size={16} />All submission links
      </button>

      <header className="page-heading">
        <div>
          <h1>{link.title}</h1>
          <p className="portal-meta-text">
            <span>{link.isOpen ? 'Open for submissions' : 'Closed'}</span>
            <span aria-hidden="true">·</span>
            <span>{link.autoMark ? 'Auto-mark on submit' : 'Manual review'}</span>
            {link.rubricTitle && (
              <>
                <span aria-hidden="true">·</span>
                <span>Rubric: {link.rubricTitle} ({totalPossible} marks)</span>
              </>
            )}
          </p>
        </div>
        <div className="button-row">
          <button type="button" className="button secondary compact-btn nowrap-btn" onClick={onEdit}>
            <Pencil size={15} />Configure fields
          </button>
          <button type="button" className="button secondary compact-btn nowrap-btn" onClick={onToggleOpen}>
            {link.isOpen ? <><Lock size={15} />Close portal</> : <><LockOpen size={15} />Reopen portal</>}
          </button>
        </div>
      </header>

      <section className="panel form-panel share-link-banner">
        <div className="share-link-row">
          <div className="share-link-info">
            <span className="preset-label">Unique student submission link</span>
            <code className="portal-url-code large">{shareUrl}</code>
          </div>
          <div className="button-row">
            <button type="button" className="button primary compact-btn nowrap-btn" onClick={onCopy}>
              {copied ? <><Check size={15} />Copied link</> : <><Copy size={15} />Copy link</>}
            </button>
            <Link
              className="button secondary compact-btn nowrap-btn"
              to={`/submit/${link.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={15} />Open student page
            </Link>
          </div>
        </div>
      </section>

      {notice && <Notice>{notice}</Notice>}
      {loadError && <Notice error>{loadError}</Notice>}
      {error && <Notice error>{formatFriendlyFirestoreError(error, error)}</Notice>}

      <section className="panel queue">
        <div className="queue-header">
          <div>
            <h2>Student submissions</h2>
            <p className="tabular-num">
              {submissions.length} {submissions.length === 1 ? 'submission' : 'submissions'} received
            </p>
          </div>
          <div className="button-row">
            {pendingAutoMarkCount > 0 && (
              <button
                type="button"
                className="button secondary compact-btn nowrap-btn"
                disabled={busy}
                onClick={() => { void handleAutoMarkPending() }}
              >
                <Sparkles size={15} />Auto-mark pending on this device ({pendingAutoMarkCount})
              </button>
            )}
            {unimportedCount > 0 && (
              <button
                type="button"
                className="button primary compact-btn nowrap-btn"
                disabled={busy}
                onClick={() => { void handleImportAll() }}
              >
                <Download size={15} />Import all new ({unimportedCount})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="form-panel"><Loading>Loading incoming submissions…</Loading></div>
        ) : submissions.length === 0 ? (
          <div className="empty-state queue-empty">
            <span className="empty-icon"><Inbox size={24} /></span>
            <h3>Waiting for student submissions</h3>
            <p>
              Share the unique link above with your class. Responses will appear here live as students submit.
            </p>
          </div>
        ) : (
          <ul className="submission-inbox-list">
            {submissions.map((sub) => {
              const expanded = expandedId === sub.id
              const scriptExistsLocally = Boolean(
                sub.workspaceScriptId && workspace.scripts.some((s) => s.id === sub.workspaceScriptId),
              )
              return (
                <li key={sub.id} className="submission-inbox-item">
                  <div className="submission-inbox-summary">
                    <button
                      type="button"
                      className="submission-expand-btn"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? '' : sub.id)}
                    >
                      <span className="row-icon"><FileText size={19} /></span>
                      <span className="row-name">
                        <strong>{sub.submitterLabel}</strong>
                        <small className="tabular-num">
                          Submitted {formatDate(sub.createdAtMs)}
                          {sub.attachmentFileName ? ` · ${sub.attachmentFileName}` : ''}
                          {' · '}
                          {sub.importedToWorkspace ? 'Imported to workspace' : 'New'}
                        </small>
                      </span>
                      <span className="submission-score-cell tabular-num">
                        {sub.autoMarkStatus === 'marked'
                          ? `Suggested ${sub.totalEarned} / ${sub.totalPossible}`
                          : sub.autoMarkStatus === 'pending'
                            ? (sub.combinedAnswer.trim() ? 'Ready to auto-mark' : 'Pending transcription')
                            : 'Ungraded'}
                      </span>
                    </button>

                    <div className="submission-quick-actions">
                      {scriptExistsLocally ? (
                        <button
                          type="button"
                          className="button secondary compact-btn nowrap-btn"
                          onClick={() => navigate(`/workspace/scripts/${sub.workspaceScriptId}`)}
                        >
                          Open in review
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button primary compact-btn nowrap-btn"
                          disabled={busy}
                          onClick={() => {
                            void run(async () => {
                              const newScriptId = await importSingleSubmission(sub)
                              setNotice(`Imported "${sub.submitterLabel}" into Scripts.`)
                              navigate(`/workspace/scripts/${newScriptId}`)
                            })
                          }}
                        >
                          <Download size={15} />Import &amp; review
                        </button>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="submission-detail-body">
                      <dl className="submission-fields-dl">
                        {sub.fieldValues.map((fv) => (
                          <div key={fv.fieldId} className="submission-field-row">
                            <dt>{fv.label}</dt>
                            <dd>
                              {fv.type === 'file' ? (
                                fv.fileName ? (
                                  <div className="submission-file-meta">
                                    <strong>{fv.fileName}</strong>
                                    <span className="muted tabular-num">
                                      {fv.fileSize > 0 ? `${Math.max(1, Math.round(fv.fileSize / 1024))} KB` : ''}
                                    </span>
                                    {fv.extractedText && (
                                      <pre className="payload source-text-preview">{fv.extractedText}</pre>
                                    )}
                                  </div>
                                ) : (
                                  <span className="muted">No file attached</span>
                                )
                              ) : fv.type === 'long_text' ? (
                                fv.textValue ? (
                                  <div className="answer-text">{fv.textValue}</div>
                                ) : (
                                  <span className="muted">No text entered</span>
                                )
                              ) : (
                                <span>{fv.textValue || <em className="muted">Not provided</em>}</span>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      {sub.attachmentImageDataUrl && (
                        <div className="photo-preview transfer-preview">
                          <img src={sub.attachmentImageDataUrl} alt={`Submitted attachment from ${sub.submitterLabel}`} />
                        </div>
                      )}

                      {link.rubricSnapshot && (
                        <div className="submission-automark-box">
                          <div className="section-heading">
                            <div>
                              <h3>
                                {sub.autoMarkStatus === 'marked'
                                  ? `Auto-marked breakdown · ${sub.totalEarned} / ${sub.totalPossible} marks`
                                  : 'Rubric marking'}
                              </h3>
                              <p className="muted">
                                {sub.autoMarkStatus === 'marked'
                                  ? sub.autoMarkEngine === 'device-ai'
                                    ? 'Scored by Chrome on-device AI'
                                    : 'Scored automatically on submission using rubric keyword & evidence matching'
                                  : 'Not yet auto-marked.'}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="button secondary compact-btn nowrap-btn"
                              disabled={busy || !sub.combinedAnswer.trim()}
                              onClick={() => { void handleAutoMarkSubmission(sub) }}
                            >
                              <Sparkles size={15} />
                              {sub.autoMarkStatus === 'marked'
                                ? deviceReady ? 'Re-mark with on-device AI' : 'Re-run auto-mark'
                                : deviceReady ? 'Auto-mark with on-device AI' : 'Auto-mark now'}
                            </button>
                          </div>

                          {sub.autoMarkStatus === 'marked' && (
                            <div className="submission-criteria-list">
                              {link.rubricSnapshot.criteria.map((criterion, idx) => {
                                const score = sub.marks[criterion.id] ?? 0
                                const sug = sub.suggestions[criterion.id]
                                return (
                                  <div className="submission-criterion-row" key={criterion.id}>
                                    <div className="submission-criterion-head">
                                      <strong>C{idx + 1}. {criterion.title}</strong>
                                      <span className="tabular-num">{score} / {criterion.max}</span>
                                    </div>
                                    {sug?.quote && (
                                      <p className="submission-quote">“{sug.quote}”</p>
                                    )}
                                    {sug?.reason && <p className="muted">{sug.reason}</p>}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="submission-detail-footer">
                        <button
                          type="button"
                          className="button subtle compact-btn danger-text"
                          disabled={busy}
                          onClick={() => {
                            void run(async () => {
                              await deleteStudentSubmission(link.id, sub.id)
                              setNotice('Submission deleted.')
                            })
                          }}
                        >
                          <Trash2 size={15} />Delete submission
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
