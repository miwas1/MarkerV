import { Camera, Contrast, Crop as CropIcon, FileImage, FileText, FileUp, RotateCw, Save, ZoomIn } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CameraModal } from '../components/CameraModal'
import { detectFileKind, DOCUMENT_ACCEPT, extractDocument, type DocumentFormat } from '../domain/document'
import { defaultRubricForCapture } from '../domain/onboarding'
import { hashPhoto, noCrop, preparePhotoWithMetrics, type Crop } from '../domain/photo'
import { addScript, latestRubrics, MAX_ANSWER, scriptName, setActiveProject, type ScriptSource, type Workspace } from '../domain/workspace'
import { Loading, Modal, Notice, useAction, useObjectUrl, type Commit } from '../ui'

type CaptureMode = 'photo' | 'document' | 'text'

function initialModeFor(search: string, file?: File): CaptureMode {
  if (file) {
    const kind = detectFileKind(file)
    if (kind === 'pdf' || kind === 'docx' || kind === 'txt') return 'document'
    return 'photo'
  }
  const param = new URLSearchParams(search).get('input')
  if (param === 'text') return 'text'
  if (param === 'document') return 'document'
  return 'photo'
}

export function Capture({ workspace, commit, initialFile, consumeFile }: {
  workspace: Workspace
  commit: Commit
  initialFile?: File
  consumeFile: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<CaptureMode>(() => initialModeFor(location.search, initialFile))
  const [photoSource, setPhotoSource] = useState<Blob | undefined>(() =>
    initialFile && detectFileKind(initialFile) === 'image' ? initialFile : undefined,
  )
  const [sourceFile, setSourceFile] = useState<ScriptSource | undefined>(() => {
    if (!initialFile) return undefined
    const kind = detectFileKind(initialFile)
    if (kind === 'image') return { name: initialFile.name, kind: 'photo' }
    if (kind === 'pdf' || kind === 'docx' || kind === 'txt') return { name: initialFile.name, kind }
    return undefined
  })
  const [docMeta, setDocMeta] = useState<{ filename: string; format: DocumentFormat; pageCount?: number; scannedPdf?: boolean; truncated?: boolean }>()
  const [docLoading, setDocLoading] = useState(false)
  const [turns, setTurns] = useState(0)
  const [crop, setCrop] = useState<Crop>(noCrop)
  const [cropOpen, setCropOpen] = useState(false)
  const [enhanceScan, setEnhanceScan] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [image, setImage] = useState<Blob>()
  const [photoQuality, setPhotoQuality] = useState<{ sharpness: number; blurry: boolean }>()
  const [previewError, setPreviewError] = useState('')
  const [saved, setSaved] = useState('')
  const [duplicate, setDuplicate] = useState('')
  const [projectId, setProjectId] = useState(workspace.activeProjectId)
  const [assignment, setAssignment] = useState(() => defaultRubricForCapture(workspace, workspace.activeProjectId))
  const [confirmNow, setConfirmNow] = useState(true)
  const [text, setText] = useState('')
  const confirmHelpId = useId()
  const [cameraOpen, setCameraOpen] = useState(false)
  const { busy, error, run } = useAction()
  const photoInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)
  const url = useObjectUrl(image)
  const initialRef = useRef({ consumeFile, initialFile })
  const importId = useRef(0)
  const availableRubrics = latestRubrics(workspace, projectId)

  useEffect(() => {
    setProjectId(workspace.activeProjectId)
    setAssignment(defaultRubricForCapture(workspace, workspace.activeProjectId))
  }, [workspace.activeProjectId])

  const handleSelectedFile = (next: File | undefined, sourceOverride?: ScriptSource) => {
    if (!next) return
    const kind = detectFileKind(next)
    setPreviewError('')
    setSaved('')
    setZoom(false)
    setCropOpen(false)

    if (kind === 'image') {
      importId.current++
      setMode('photo')
      setDocLoading(false)
      setDocMeta(undefined)
      setImage(undefined)
      setPhotoQuality(undefined)
      setTurns(0)
      setCrop(noCrop)
      setEnhanceScan(false)
      setPhotoSource(next)
      setSourceFile(sourceOverride ?? { name: next.name, kind: 'photo' })
      return
    }

    if (kind === 'pdf' || kind === 'docx' || kind === 'txt') {
      const token = ++importId.current
      setMode('document')
      setPhotoSource(undefined)
      setImage(undefined)
      setPhotoQuality(undefined)
      setTurns(0)
      setCrop(noCrop)
      setEnhanceScan(false)
      setDocMeta(undefined)
      setDocLoading(true)
      setSourceFile(sourceOverride ?? { name: next.name, kind })

      void extractDocument(next).then(
        (extracted) => {
          if (importId.current !== token) return
          setDocLoading(false)
          if (extracted.text) {
            const truncated = extracted.text.length > MAX_ANSWER
            setText(extracted.text.slice(0, MAX_ANSWER))
            setDocMeta({
              filename: extracted.filename,
              format: extracted.format,
              pageCount: extracted.pageCount,
              truncated,
            })
          } else if (extracted.previewImage) {
            setText('')
            setPhotoSource(extracted.previewImage)
            setDocMeta({
              filename: extracted.filename,
              format: extracted.format,
              pageCount: extracted.pageCount,
              scannedPdf: true,
            })
          }
        },
        (failure: unknown) => {
          if (importId.current !== token) return
          setDocLoading(false)
          setPreviewError(failure instanceof Error ? failure.message : 'Could not read this file.')
        },
      )
      return
    }

    setPreviewError('Unsupported file format. Choose an image (JPEG, PNG, WebP) or a PDF, DOCX, or TXT document.')
  }

  useEffect(() => {
    const { consumeFile: consume, initialFile: initial } = initialRef.current
    consume()
    if (initial) {
      const kind = detectFileKind(initial)
      if (kind === 'pdf' || kind === 'docx' || kind === 'txt') {
        handleSelectedFile(initial)
      }
    }
  }, [])

  useEffect(() => {
    if (!photoSource) {
      setImage(undefined)
      setPhotoQuality(undefined)
      return
    }
    let current = true
    void preparePhotoWithMetrics(photoSource, turns, crop, { enhance: enhanceScan }).then((prepared) => {
      if (!current) return
      setImage(prepared.blob)
      setPhotoQuality({ sharpness: prepared.sharpness, blurry: prepared.blurry })
    }, (failure: Error) => {
      if (current) setPreviewError(failure.message)
    })
    return () => { current = false }
  }, [photoSource, turns, crop, enhanceScan])

  const hasPhotoDraft = Boolean(photoSource) && (mode === 'photo' || Boolean(docMeta?.scannedPdf))

  async function save(allowDuplicate = false) {
    await run(async (active) => {
      if (hasPhotoDraft) {
        if (!image || !photoSource) throw new Error('Choose a readable photo before saving.')
      } else {
        if (!text.trim()) throw new Error('Enter or import an answer before saving.')
      }

      const id = crypto.randomUUID()
      const hash = hasPhotoDraft && photoSource ? await hashPhoto(photoSource) : undefined
      if (!active()) return
      let found = ''
      await commit((current) => {
        const existing = hash && current.scripts.find((script) =>
          script.projectId === projectId &&
          script.rubricId === (assignment || undefined) &&
          script.photoHash === hash,
        )
        if (existing && !allowDuplicate) {
          found = existing.id
          return current
        }
        const switched = setActiveProject(current, projectId)
        return addScript(switched, {
          id,
          projectId,
          photo: hasPhotoDraft ? image : undefined,
          photoHash: hash,
          sourceFile: sourceFile,
          transcript: hasPhotoDraft ? '' : text.trim(),
          rubricId: assignment || undefined,
          confirmed: !hasPhotoDraft && confirmNow,
        })
      })
      if (!active()) return
      if (found) setDuplicate(found)
      else if (!hasPhotoDraft) navigate('/workspace/scripts/' + id)
      else setSaved(id)
    })
  }

  const scriptsPath = '/workspace'
  if (saved) {
    const script = workspace.scripts.find((row) => row.id === saved)
    return <section className="panel centered success-panel">
      <input ref={docInput} type="file" accept={DOCUMENT_ACCEPT} aria-label="Upload another file input" className="visually-hidden" tabIndex={-1}
        onChange={(event) => { handleSelectedFile(event.target.files?.[0]); event.target.value = '' }} />
      <span className="empty-icon"><Save size={26} /></span>
      <h1>Draft saved on this device</h1>
      <p>{script ? scriptName(script) : 'Your script'} is ready to open or assign to a rubric.</p>
      <div className="button-row">
        <button className="button primary" onClick={() => setCameraOpen(true)}>
          <Camera size={18} />Take another photo
        </button>
        <button className="button secondary" onClick={() => docInput.current?.click()}>
          <FileUp size={17} />Upload another file
        </button>
        <Link className="button secondary" to={'/workspace/scripts/' + saved}>Open draft</Link>
      </div>
      {cameraOpen && <CameraModal title="Take a script photo" onClose={() => setCameraOpen(false)} onCapture={(next) => {
        setCameraOpen(false)
        handleSelectedFile(next)
      }} />}
    </section>
  }

  const headingTitle = mode === 'text' ? 'Paste an answer' : mode === 'document' ? 'Import a script file' : 'Capture script photo'
  const headingSubtitle = mode === 'text'
    ? 'Add a typed answer and save it as a private draft.'
    : mode === 'document'
      ? 'Upload a PDF, DOCX, or TXT file. Text is extracted locally in this browser.'
      : 'Take a photo or choose an image, then check that every line is readable before saving.'

  return <>
    <Link className="back-link" to={scriptsPath}>Scripts</Link>
    <header className="page-heading"><div><h1>{headingTitle}</h1><p>{headingSubtitle}</p></div></header>
    <section className="panel form-panel">
      <div className="button-row">
        <div className="segmented" role="group" aria-label="Script input method">
          <button type="button" aria-pressed={mode === 'photo'} onClick={() => { setMode('photo'); setPreviewError('') }}>
            <Camera size={16} />Photo
          </button>
          <button type="button" aria-pressed={mode === 'document'} onClick={() => { setMode('document'); setPreviewError('') }}>
            <FileUp size={16} />PDF / DOCX / TXT
          </button>
          <button type="button" aria-pressed={mode === 'text'} onClick={() => { setMode('text'); setPreviewError('') }}>
            <FileText size={16} />Typed
          </button>
        </div>
      </div>

      <input ref={photoInput} type="file" accept="image/*" aria-label="Choose photo" className="visually-hidden" tabIndex={-1}
        onChange={(event) => { handleSelectedFile(event.target.files?.[0]); event.target.value = '' }} />
      <input ref={docInput} type="file" accept={DOCUMENT_ACCEPT} aria-label="Upload PDF, DOCX, or TXT file" className="visually-hidden" tabIndex={-1}
        onChange={(event) => { handleSelectedFile(event.target.files?.[0]); event.target.value = '' }} />

      {mode === 'document' && <>
        <div className="button-row tool-row">
          <button type="button" className="button secondary" disabled={docLoading} onClick={() => docInput.current?.click()}>
            <FileUp size={17} />{docMeta ? 'Choose another file' : 'Choose PDF, DOCX, or TXT'}
          </button>
        </div>
        {docLoading && <Loading>Extracting text from document…</Loading>}
        {docMeta && <div className="doc-summary">
          <span className="badge badge-device">{docMeta.format.toUpperCase()}</span>
          <strong>{docMeta.filename}</strong>
          {docMeta.pageCount ? <small>{docMeta.pageCount} {docMeta.pageCount === 1 ? 'page' : 'pages'}</small> : null}
        </div>}
        {docMeta?.scannedPdf && <Notice>No selectable text was found in this PDF, so page 1 was imported as an image for transcription.</Notice>}
        {docMeta?.truncated && <Notice>This document exceeded the {MAX_ANSWER.toLocaleString()}-character answer limit and was trimmed. Review the text below before saving.</Notice>}
        {!docMeta && !docLoading && !previewError && <div className="capture-empty">
          <span className="empty-icon"><FileUp size={27} /></span>
          <h2>Upload a script document</h2>
          <p>Select a PDF, Word (.docx), or plain text (.txt) file up to 20 MB. Everything stays in this browser.</p>
        </div>}
      </>}

      {(mode === 'photo' || (mode === 'document' && docMeta?.scannedPdf)) && <>
        {url ? <div className={'photo-preview' + (zoom ? ' zoomed' : '')} tabIndex={zoom ? 0 : undefined}>
          <img src={url} alt="Captured script page" />
        </div> : mode === 'photo' ? <div className="capture-empty"><span className="empty-icon"><Camera size={28} /></span>
          <h2>Add a script photo</h2><p>Take a live photo with your camera, or choose a saved image.</p>
        </div> : null}
        {photoSource && !image && !previewError && <Loading>{enhanceScan ? 'Enhancing scan legibility…' : 'Preparing your image…'}</Loading>}
        {mode === 'photo' && photoQuality?.blurry && !previewError && (
          <Notice error>
            <div className="inline-confirm">
              <span>This photo looks slightly blurry and may reduce handwriting accuracy. Retake in steady light, or keep it if every line is readable.</span>
              <div className="button-row">
                <button type="button" className="button secondary compact-btn" onClick={() => setCameraOpen(true)}>
                  <Camera size={15} />Retake photo
                </button>
                {!enhanceScan && (
                  <button type="button" className="button subtle compact-btn" onClick={() => { setImage(undefined); setEnhanceScan(true) }}>
                    <Contrast size={15} />Try enhance scan
                  </button>
                )}
              </div>
            </div>
          </Notice>
        )}
        <div className="button-row tool-row">
          {mode === 'photo' && <>
            <button type="button" className="button secondary" onClick={() => setCameraOpen(true)}>
              <Camera size={17} />{photoSource ? 'Retake photo' : 'Take photo'}
            </button>
            <button type="button" className="button secondary" onClick={() => photoInput.current?.click()}>
              <FileImage size={17} />Choose photo
            </button>
          </>}
          {photoSource && !previewError && <>
            <button
              type="button"
              className="button subtle"
              aria-pressed={enhanceScan}
              title="Flatten uneven shadows and sharpen faint ink for cleaner OCR"
              onClick={() => { setImage(undefined); setEnhanceScan((value) => !value) }}
            >
              <Contrast size={17} />{enhanceScan ? 'Enhanced scan' : 'Enhance scan'}
            </button>
            <button type="button" className="button subtle" onClick={() => { setImage(undefined); setTurns((value) => (value + 1) % 4); setCrop(noCrop) }}><RotateCw size={17} />Rotate</button>
            <button type="button" className="button subtle" aria-expanded={cropOpen} onClick={() => {
              if (cropOpen && crop !== noCrop) { setImage(undefined); setCrop(noCrop) }
              setCropOpen(!cropOpen)
            }}><CropIcon size={17} />{cropOpen ? 'Reset crop' : 'Crop'}</button>
            <button type="button" className="button subtle" aria-pressed={zoom} onClick={() => setZoom(!zoom)}><ZoomIn size={17} />{zoom ? 'Fit photo' : 'Zoom'}</button>
          </>}
        </div>
        {cropOpen && !previewError && <div className="crop-settings">
          {(Object.keys(crop) as Array<keyof Crop>).map((side) => <label key={side} className="field">
            <span>Trim {side} · {crop[side]}%</span><input type="range" min={0} max={30} value={crop[side]}
              onChange={(event) => { setImage(undefined); setCrop({ ...crop, [side]: Number(event.target.value) }) }} />
          </label>)}
        </div>}
      </>}

      {(mode === 'text' || (mode === 'document' && docMeta && !docMeta.scannedPdf)) && <label className="field">
        <span>Answer <small>{text.length.toLocaleString()} / {MAX_ANSWER.toLocaleString()}</small></span>
        <textarea className="transcript-input" rows={9} maxLength={MAX_ANSWER} value={text}
          onChange={(event) => setText(event.target.value)} placeholder="Paste the answer without student names or identifiers." />
      </label>}

      {previewError && <Notice error>{previewError}</Notice>}

      <div className="fields-inline-even">
        <label className="field"><span>Project</span><select aria-label="Project" value={projectId} onChange={(event) => {
          const nextProjectId = event.target.value
          setProjectId(nextProjectId)
          setAssignment(defaultRubricForCapture(workspace, nextProjectId))
        }}>
          {workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        <label className="field"><span>Rubric</span><select aria-label="Rubric" value={assignment} onChange={(event) => setAssignment(event.target.value)}>
          <option value="">Assign later</option>
          {availableRubrics.map((rubric) => <option key={rubric.id} value={rubric.id}>{rubric.title} · v{rubric.version}</option>)}
        </select>
        {availableRubrics.length === 0 && (
          <span className="field-hint">
            No rubric in this project yet. <Link to="/workspace/rubric">Create or load a rubric</Link>
          </span>
        )}
        </label>
      </div>
      {!hasPhotoDraft && (
        <div className="capture-confirm-option">
          <label className="switch-row compact-switch">
            <input
              type="checkbox"
              checked={confirmNow}
              aria-describedby={confirmHelpId}
              onChange={(event) => setConfirmNow(event.target.checked)}
            />
            <span>Ready to mark immediately (student identifiers removed)</span>
          </label>
          <p id={confirmHelpId} className="muted field-hint">
            Skip the extra transcript-confirmation step so you can suggest or enter marks right away.
          </p>
        </div>
      )}
      {error && <Notice error>{error}</Notice>}
      <footer className="form-actions">
        <Link className="button secondary" to={scriptsPath}>Cancel</Link>
        <button type="button" className="button primary" disabled={busy || docLoading || (hasPhotoDraft ? !image : !text.trim())} onClick={() => { void save() }}>
          <Save size={17} />{busy ? 'Saving…' : !hasPhotoDraft && confirmNow ? 'Save & start marking' : 'Save draft'}
        </button>
      </footer>
    </section>
    {cameraOpen && <CameraModal title="Take a script photo" onClose={() => setCameraOpen(false)} onCapture={(next) => {
      setCameraOpen(false)
      handleSelectedFile(next)
    }} />}
    {duplicate && <Modal title="Photo already imported" onClose={() => setDuplicate('')}>
      <p>This exact file is already in the selected queue. Open its draft or intentionally save a second copy.</p>
      <div className="button-row">
        <Link className="button primary" to={'/workspace/scripts/' + duplicate}>Open existing draft</Link>
        <button className="button secondary" onClick={() => { setDuplicate(''); void save(true) }}>Save another copy</button>
      </div>
    </Modal>}
  </>
}
