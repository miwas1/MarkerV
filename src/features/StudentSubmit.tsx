import { CheckCircle2, FileImage, FileText, FileUp, Lock, Send, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ensureAppCheck } from '../ai/firebase'
import { detectFileKind, extractDocument } from '../domain/document'
import {
  compressImageToDataUrl,
  fieldAcceptAttr,
  fieldAcceptSummary,
  MAX_FILE_BYTES,
  MAX_SUBMISSION_TEXT,
  type FieldResponseValue,
  type SubmissionFieldDef,
  type SubmissionLinkDoc,
} from '../domain/submissionLink'
import {
  formatFriendlyFirestoreError,
  getSubmissionLinkPublic,
  submitStudentWork,
  testConnection,
  type StudentSubmitReceipt,
} from '../storage/submissionLinks'
import { Loading, Notice } from '../ui'

type FileUploadState = {
  fileName: string
  fileType: string
  fileSize: number
  extractedText: string
  imageDataUrl: string
  loading: boolean
  error: string
}

const emptyFileState = (): FileUploadState => ({
  fileName: '',
  fileType: '',
  fileSize: 0,
  extractedText: '',
  imageDataUrl: '',
  loading: false,
  error: '',
})

export function StudentSubmit() {
  const { linkId } = useParams()
  const [link, setLink] = useState<SubmissionLinkDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [textValues, setTextValues] = useState<Record<string, string>>({})
  const [fileValues, setFileValues] = useState<Record<string, FileUploadState>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [receipt, setReceipt] = useState<StudentSubmitReceipt | null>(null)

  useEffect(() => {
    let active = true
    ensureAppCheck()
    void testConnection()
    if (!linkId) {
      setLoading(false)
      setLoadError('Invalid submission link.')
      return
    }
    setLoading(true)
    setLoadError('')
    void getSubmissionLinkPublic(linkId).then(
      (result) => {
        if (!active) return
        setLink(result)
        setLoading(false)
      },
      (err) => {
        if (!active) return
        setLoadError(formatFriendlyFirestoreError(err, 'Could not load this submission page.'))
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [linkId])

  async function handleFileSelect(field: SubmissionFieldDef, file: File | undefined) {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setFileValues((prev) => ({
        ...prev,
        [field.id]: { ...emptyFileState(), error: 'File must be 20 MB or smaller.' },
      }))
      return
    }

    const kind = detectFileKind(file)
    if (field.accept === 'documents' && kind !== 'pdf' && kind !== 'docx' && kind !== 'txt') {
      setFileValues((prev) => ({
        ...prev,
        [field.id]: { ...emptyFileState(), error: 'Please choose a PDF, DOCX, or TXT document.' },
      }))
      return
    }
    if (field.accept === 'images' && kind !== 'image') {
      setFileValues((prev) => ({
        ...prev,
        [field.id]: { ...emptyFileState(), error: 'Please choose an image file (JPEG, PNG, or WebP).' },
      }))
      return
    }
    if (kind === 'unsupported') {
      setFileValues((prev) => ({
        ...prev,
        [field.id]: { ...emptyFileState(), error: 'Unsupported file type. Upload a PDF, DOCX, TXT, or image.' },
      }))
      return
    }

    setFileValues((prev) => ({
      ...prev,
      [field.id]: {
        ...emptyFileState(),
        fileName: file.name,
        fileType: file.type || kind,
        fileSize: file.size,
        loading: true,
      },
    }))

    try {
      if (kind === 'image') {
        const dataUrl = await compressImageToDataUrl(file)
        setFileValues((prev) => ({
          ...prev,
          [field.id]: {
            fileName: file.name,
            fileType: file.type || 'image/jpeg',
            fileSize: file.size,
            extractedText: '',
            imageDataUrl: dataUrl,
            loading: false,
            error: '',
          },
        }))
        return
      }

      const extracted = await extractDocument(file)
      let previewDataUrl = ''
      if (!extracted.text && extracted.previewImage) {
        previewDataUrl = await compressImageToDataUrl(extracted.previewImage)
      }
      setFileValues((prev) => ({
        ...prev,
        [field.id]: {
          fileName: extracted.filename,
          fileType: file.type || extracted.format,
          fileSize: file.size,
          extractedText: extracted.text.slice(0, MAX_SUBMISSION_TEXT),
          imageDataUrl: previewDataUrl,
          loading: false,
          error: '',
        },
      }))
    } catch (err) {
      setFileValues((prev) => ({
        ...prev,
        [field.id]: {
          ...emptyFileState(),
          error: err instanceof Error ? err.message : 'Could not read this file.',
        },
      }))
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!link) return
    setSubmitError('')

    const anyFileLoading = Object.values(fileValues).some((f) => f.loading)
    if (anyFileLoading) {
      setSubmitError('Wait for your attached file to finish processing before submitting.')
      return
    }

    for (const field of link.fields) {
      if (!field.required) continue
      if (field.type === 'file') {
        const state = fileValues[field.id]
        if (!state?.fileName || state.error) {
          setSubmitError(`Please attach a file for "${field.label}".`)
          return
        }
      } else {
        const val = (textValues[field.id] ?? '').trim()
        if (!val) {
          setSubmitError(`Please fill in "${field.label}".`)
          return
        }
      }
    }

    // Ensure at least one marking/answer field has content if the lecturer left both written & upload optional
    const answerFields = link.fields.filter((f) => f.type === 'long_text' || f.type === 'file')
    if (answerFields.length > 0) {
      const hasAnyAnswer = answerFields.some((f) =>
        f.type === 'file'
          ? Boolean(fileValues[f.id]?.fileName && !fileValues[f.id]?.error)
          : Boolean((textValues[f.id] ?? '').trim()),
      )
      if (!hasAnyAnswer) {
        setSubmitError('Provide a written answer or attach your script file before submitting.')
        return
      }
    }

    const responses: FieldResponseValue[] = link.fields.map((field) => {
      if (field.type === 'file') {
        const fileState = fileValues[field.id] ?? emptyFileState()
        return {
          fieldId: field.id,
          label: field.label,
          type: field.type,
          textValue: '',
          fileName: fileState.fileName,
          fileType: fileState.fileType,
          fileSize: fileState.fileSize,
          extractedText: fileState.extractedText,
        }
      }
      return {
        fieldId: field.id,
        label: field.label,
        type: field.type,
        textValue: (textValues[field.id] ?? '').trim(),
        fileName: '',
        fileType: '',
        fileSize: 0,
        extractedText: '',
      }
    })

    const primaryFileField = link.fields.find((f) => f.type === 'file' && fileValues[f.id]?.fileName)
    const primaryImageField = link.fields.find((f) => f.type === 'file' && fileValues[f.id]?.imageDataUrl)

    setSubmitting(true)
    try {
      ensureAppCheck()
      const result = await submitStudentWork(link, {
        fieldValues: responses,
        attachmentImageDataUrl: primaryImageField ? fileValues[primaryImageField.id].imageDataUrl : '',
        attachmentFileName: primaryFileField ? fileValues[primaryFileField.id].fileName : '',
      })
      setReceipt(result)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setSubmitError(formatFriendlyFirestoreError(err, 'Submission failed. Please check your connection and try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="submit-page">
      <header className="submit-topbar">
        <div className="submit-topbar-inner">
          <Link to="/" className="lp-brand">Marking Assistant</Link>
          <span className="submit-topbar-meta">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>Private lecturer dropbox</span>
          </span>
        </div>
      </header>

      <main className="submit-container">
        {loading ? (
          <section className="panel form-panel submit-card">
            <Loading>Loading submission portal…</Loading>
          </section>
        ) : loadError ? (
          <section className="panel form-panel submit-card">
            <h1>Could not open submission page</h1>
            <Notice error>{loadError}</Notice>
          </section>
        ) : !link ? (
          <section className="panel form-panel submit-card">
            <div className="empty-state">
              <span className="empty-icon"><Lock size={24} /></span>
              <h1>Submission link not found</h1>
              <p>
                This link may have been removed or mistyped. Ask your lecturer to confirm the exact submission URL.
              </p>
            </div>
          </section>
        ) : receipt ? (
          <section className="panel form-panel submit-card">
            <div className="submit-receipt-header">
              <span className="empty-icon"><CheckCircle2 size={26} /></span>
              <div>
                <h1>Submission received</h1>
                <p className="muted">
                  Recorded for <strong>{link.title}</strong> · {link.projectName}
                </p>
              </div>
            </div>

            <dl className="receipt-meta-grid">
              <div>
                <dt>Submitted by</dt>
                <dd>{receipt.submitterLabel}</dd>
              </div>
              <div>
                <dt>Reference ID</dt>
                <dd className="tabular-num">{receipt.submissionId.slice(0, 12).toUpperCase()}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {receipt.autoMarkStatus === 'pending'
                    ? 'Submitted · queued for lecturer marking'
                    : 'Submitted for lecturer review'}
                </dd>
              </div>
            </dl>

            {link.showScoreToStudent && receipt.selfCheck && link.rubricSnapshot && (
              <div className="receipt-score-box">
                <div className="section-heading">
                  <div>
                    <h2>Local self-check estimate (not official)</h2>
                    <p className="muted">
                      Computed locally in your browser for self-reflection only. This estimate is not saved; your lecturer runs official marking on their own device.
                    </p>
                  </div>
                  <strong className="receipt-total-score tabular-num">
                    {receipt.selfCheck.totalEarned} / {receipt.selfCheck.totalPossible}
                  </strong>
                </div>
                <div className="submission-criteria-list">
                  {link.rubricSnapshot.criteria.map((criterion, idx) => {
                    const score = receipt.selfCheck!.marks[criterion.id] ?? 0
                    const sug = receipt.selfCheck!.suggestions[criterion.id]
                    return (
                      <div className="submission-criterion-row" key={criterion.id}>
                        <div className="submission-criterion-head">
                          <strong>C{idx + 1}. {criterion.title}</strong>
                          <span className="tabular-num">{score} / {criterion.max}</span>
                        </div>
                        {sug?.reason && <p className="muted">{sug.reason}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <Notice>
              Your submission has been delivered securely to {link.ownerName}. You may close this tab or submit another response if permitted.
            </Notice>

            <div className="button-row">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setReceipt(null)
                  setTextValues({})
                  setFileValues({})
                  setSubmitError('')
                }}
              >
                Submit another response
              </button>
            </div>
          </section>
        ) : !link.isOpen ? (
          <section className="panel form-panel submit-card">
            <div className="empty-state">
              <span className="empty-icon"><Lock size={24} /></span>
              <h1>Submissions are closed</h1>
              <p>
                <strong>{link.title}</strong> ({link.projectName}) is no longer accepting new responses. Contact{' '}
                {link.ownerName} if you need an extension.
              </p>
            </div>
          </section>
        ) : (
          <section className="panel form-panel submit-card">
            <header className="submit-portal-header">
              <p className="portal-meta-text">
                <span>{link.projectName}</span>
                <span aria-hidden="true">·</span>
                <span>{link.ownerName}</span>
                {link.autoMark && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Auto-marking enabled</span>
                  </>
                )}
              </p>
              <h1>{link.title}</h1>
              {link.instructions && <p className="submit-instructions">{link.instructions}</p>}
            </header>

            <form className="submit-form" onSubmit={(event) => { void handleSubmit(event) }}>
              {link.fields.map((field) => {
                if (field.type === 'short_text') {
                  return (
                    <label className="field" key={field.id}>
                      <span>
                        {field.label}
                        {field.required && <strong className="required-mark" aria-hidden="true"> *</strong>}
                      </span>
                      <input
                        type="text"
                        required={field.required}
                        maxLength={200}
                        value={textValues[field.id] ?? ''}
                        placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                        onChange={(e) => setTextValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      />
                    </label>
                  )
                }

                if (field.type === 'long_text') {
                  const currentVal = textValues[field.id] ?? ''
                  return (
                    <label className="field" key={field.id}>
                      <span>
                        {field.label}
                        {field.required && <strong className="required-mark" aria-hidden="true"> *</strong>}
                        <small className="tabular-num">
                          {currentVal.length.toLocaleString()} / {MAX_SUBMISSION_TEXT.toLocaleString()}
                        </small>
                      </span>
                      <textarea
                        className="transcript-input"
                        rows={8}
                        required={field.required}
                        maxLength={MAX_SUBMISSION_TEXT}
                        value={currentVal}
                        placeholder={field.placeholder || 'Type or paste your full answer here…'}
                        onChange={(e) => setTextValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      />
                    </label>
                  )
                }

                const fileState = fileValues[field.id] ?? emptyFileState()
                return (
                  <div className="field" key={field.id}>
                    <span>
                      {field.label}
                      {field.required && <strong className="required-mark" aria-hidden="true"> *</strong>}
                      <small>{fieldAcceptSummary(field.accept)}</small>
                    </span>

                    {!fileState.fileName ? (
                      <label className="student-upload-box">
                        <input
                          type="file"
                          className="visually-hidden"
                          accept={fieldAcceptAttr(field.accept)}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            e.target.value = ''
                            void handleFileSelect(field, f)
                          }}
                        />
                        <FileUp size={20} aria-hidden="true" />
                        <strong>Choose a file to upload</strong>
                        <span className="muted">
                          {field.placeholder || `${fieldAcceptSummary(field.accept)} · up to 20 MB`}
                        </span>
                      </label>
                    ) : (
                      <div className="student-file-attached">
                        <div className="student-file-attached-row">
                          <span className="row-icon">
                            {fileState.imageDataUrl ? <FileImage size={18} /> : <FileText size={18} />}
                          </span>
                          <div className="row-name">
                            <strong>{fileState.fileName}</strong>
                            <small className="tabular-num">
                              {Math.max(1, Math.round(fileState.fileSize / 1024))} KB
                              {fileState.extractedText
                                ? ` · ${fileState.extractedText.length.toLocaleString()} characters extracted`
                                : fileState.imageDataUrl
                                  ? ' · Image ready'
                                  : ''}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="icon-button compact-icon-btn"
                            aria-label={`Remove ${fileState.fileName}`}
                            onClick={() =>
                              setFileValues((prev) => {
                                const next = { ...prev }
                                delete next[field.id]
                                return next
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                        {fileState.loading && <Loading>Reading file…</Loading>}
                        {fileState.imageDataUrl && !fileState.loading && (
                          <div className="photo-preview transfer-preview">
                            <img src={fileState.imageDataUrl} alt="Uploaded script preview" />
                          </div>
                        )}
                      </div>
                    )}

                    {fileState.error && <Notice error>{fileState.error}</Notice>}
                  </div>
                )
              })}

              {submitError && <Notice error>{submitError}</Notice>}
              {submitting && (
                <Loading>Submitting your work…</Loading>
              )}

              <footer className="form-actions">
                <button type="submit" className="button primary" disabled={submitting}>
                  <Send size={16} />
                  {submitting ? 'Submitting…' : 'Submit work'}
                </button>
              </footer>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}
