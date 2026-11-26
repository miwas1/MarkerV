import { Camera, CheckCircle2, ChevronRight, ClipboardCheck, FileImage, FilePlus2, Files, FileText, FileUp, Flag, FlaskConical, HardDrive, Link2, ListChecks, PencilLine, Search, Sparkles, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { configured, setupDevice, type DeviceStatus } from '../ai/firebase'
import { CameraModal } from '../components/CameraModal'
import { DOCUMENT_ACCEPT } from '../domain/document'
import { createRubricFromTemplate } from '../domain/onboarding'
import { activeProjectOf, earned, latestRubrics, projectRubrics, projectScripts, scriptName, scriptSourceLabel, statusOf, total, type Workspace } from '../domain/workspace'
import { Loading, Notice, useAction, type Commit } from '../ui'

export function Dashboard({
  workspace,
  commit,
  onFile,
  textStatus,
  imageStatus,
  refreshDevice,
  online = true,
  base = '/workspace',
  sample = false,
}: {
  workspace: Workspace
  commit?: Commit
  onFile?: (file: File) => void
  textStatus?: DeviceStatus
  imageStatus?: DeviceStatus
  refreshDevice?: () => Promise<void>
  online?: boolean
  base?: string
  sample?: boolean
}) {
  const photoPicker = useRef<HTMLInputElement>(null)
  const docPicker = useRef<HTMLInputElement>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [filter, setFilter] = useState('All scripts')
  const [search, setSearch] = useState('')
  const [quickstartDismissed, setQuickstartDismissed] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number>()
  const [starterNotice, setStarterNotice] = useState('')
  const quickAction = useAction()
  const project = activeProjectOf(workspace)
  const scripts = projectScripts(workspace, project.id)
  const rubrics = projectRubrics(workspace, project.id)
  const activeRubrics = latestRubrics(workspace, project.id)
  const count = scripts.length
  const finalised = scripts.filter((script) => script.finalisedAt).length
  const pending = count - finalised
  const items = scripts.filter((script) => {
    const rubric = rubrics.find((row) => row.id === script.rubricId)
    const matchesGroup = filter === 'All scripts' || (filter === 'Flagged' ? script.secondReview : filter === 'Finalised' ? script.finalisedAt : !script.finalisedAt)
    const matchesQuery = (scriptName(script) + ' ' + (rubric?.title ?? '') + ' ' + (script.sourceFile?.name ?? '')).toLowerCase().includes(search.trim().toLowerCase())
    return matchesGroup && matchesQuery
  })
  const stats = [
    { label: 'Total scripts', value: count, icon: Files, tone: 'mint' },
    { label: 'Awaiting review', value: pending, icon: ListChecks, tone: 'sand' },
    { label: 'Finalised', value: finalised, icon: ClipboardCheck, tone: 'blue' },
  ]
  const selectFile = (input: HTMLInputElement) => {
    const file = input.files?.[0]
    input.value = ''
    if (file) onFile?.(file)
  }
  const recent = scripts.find((script) => !script.finalisedAt)
  const textReady = configured && textStatus === 'available'
  const canDownloadText = configured && textStatus === 'downloadable' && online
  const isDownloadingAi = textStatus === 'downloading' || imageStatus === 'downloading'
  const hasRubric = activeRubrics.length > 0
  const hasScripts = count > 0
  const showQuickstart = !sample && !quickstartDismissed && (!hasRubric || !hasScripts)

  function enableDeviceTextAi() {
    void quickAction.run(async (active) => {
      setDownloadProgress(0)
      try {
        await setupDevice(false, (value) => { if (active()) setDownloadProgress(Math.min(1, Math.max(0, value))) })
      } catch {
        throw new Error('Could not download Chrome’s on-device model. Ensure you have at least 22 GB free storage and a stable connection.')
      } finally {
        if (active()) {
          setDownloadProgress(undefined)
          await refreshDevice?.()
        }
      }
    })
  }

  function loadStarterRubric() {
    if (!commit) return
    void quickAction.run(async () => {
      const starter = createRubricFromTemplate('short-answer', project.id)
      await commit((current) => ({ ...current, rubrics: [...current.rubrics, starter] }))
      setStarterNotice(`Loaded starter rubric "${starter.title}" in ${project.name}. You can edit it anytime under Rubrics.`)
    })
  }

  return <div className="dashboard">
    <header className="page-heading dashboard-heading">
      <div><h1>{sample ? 'Sample workspace' : project.name}</h1>
        <p>{sample ? 'Review a fictional assessment with preloaded scripts.' : (project.description || 'Capture scripts, review marks and prepare student feedback for this project.')}</p></div>
      {!sample && recent && <Link className="button secondary desktop-action" to={base + '/scripts/' + recent.id}><PencilLine size={17} />Continue marking</Link>}
      {sample && <Link className="button secondary" to={base + '/practice'}>Open sample feedback</Link>}
    </header>
    {starterNotice && <Notice>{starterNotice}</Notice>}
    {showQuickstart && (
      <section className="panel form-panel quickstart-card" aria-labelledby="quickstart-title">
        <div className="section-heading">
          <div>
            <h2 id="quickstart-title">Quick setup for {project.name}</h2>
            <p>Three steps to start marking privately in this browser — or explore the preloaded sample first.</p>
          </div>
          <div className="button-row">
            <Link className="button subtle compact-btn" to="/sample"><FlaskConical size={15} aria-hidden="true" />Try live sample</Link>
            <button
              type="button"
              className="icon-button compact-icon-btn"
              aria-label="Dismiss quick setup"
              onClick={() => setQuickstartDismissed(true)}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </div>

        <ol className="quickstart-steps">
          <li className={'quickstart-step' + (textReady ? ' done' : '')}>
            <span className="quickstart-marker" aria-hidden="true">
              {textReady ? <CheckCircle2 size={18} /> : '1'}
            </span>
            <div className="quickstart-body">
              <strong>{textReady ? 'On-device AI ready' : 'Check AI setup'}</strong>
              <p>
                {textReady
                  ? 'Gemini Nano is ready in this browser. Private script marking works offline with 0 bytes sent to cloud AI.'
                  : canDownloadText
                    ? 'Chrome’s local text model is available for a one-click download so private marking runs offline.'
                    : isDownloadingAi
                      ? 'Chrome is downloading the local AI model in the background…'
                      : 'Manual marking works now. Use desktop Chrome for private on-device AI, or try Cloud/Hybrid AI in the live sample.'}
              </p>
              {downloadProgress !== undefined && (
                <>
                  <Loading>Downloading on-device text model…</Loading>
                  <progress value={downloadProgress} max={1} aria-label="On-device text model download" />
                </>
              )}
              {!textReady && downloadProgress === undefined && (
                <div className="button-row">
                  {canDownloadText ? (
                    <button type="button" className="button primary compact-btn" disabled={quickAction.busy} onClick={enableDeviceTextAi}>
                      <HardDrive size={15} aria-hidden="true" />Enable on-device AI
                    </button>
                  ) : (
                    <Link className="button secondary compact-btn" to="/settings">Open AI setup</Link>
                  )}
                </div>
              )}
            </div>
          </li>

          <li className={'quickstart-step' + (hasRubric ? ' done' : '')}>
            <span className="quickstart-marker" aria-hidden="true">
              {hasRubric ? <CheckCircle2 size={18} /> : '2'}
            </span>
            <div className="quickstart-body">
              <strong>{hasRubric ? 'Rubric ready' : 'Create or load a rubric'}</strong>
              <p>
                {hasRubric
                  ? `${activeRubrics.length} ${activeRubrics.length === 1 ? 'rubric' : 'rubrics'} ready in ${project.name}. New scripts will select it automatically.`
                  : 'Define your marking criteria first, import a mark scheme file, or load a ready-made starter rubric.'}
              </p>
              {!hasRubric && (
                <div className="button-row">
                  <Link className="button primary compact-btn" to={base + '/rubric'}>Create rubric</Link>
                  {commit && (
                    <button type="button" className="button secondary compact-btn" disabled={quickAction.busy} onClick={loadStarterRubric}>
                      <Sparkles size={15} aria-hidden="true" />Load starter rubric
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>

          <li className={'quickstart-step' + (hasScripts ? ' done' : '')}>
            <span className="quickstart-marker" aria-hidden="true">
              {hasScripts ? <CheckCircle2 size={18} /> : '3'}
            </span>
            <div className="quickstart-body">
              <strong>{hasScripts ? 'Scripts added' : 'Add your first script'}</strong>
              <p>
                {hasScripts
                  ? `${count} ${count === 1 ? 'script' : 'scripts'} ready to review in ${project.name}.`
                  : 'Paste a typed answer, upload a PDF/DOCX/TXT file, photograph a handwritten page, or publish a submission link.'}
              </p>
              {!hasScripts && (
                <div className="button-row">
                  <Link className="button secondary compact-btn" to={base + '/capture?input=text'}>
                    <PencilLine size={15} aria-hidden="true" />Paste answer
                  </Link>
                  <button type="button" className="button secondary compact-btn" onClick={() => docPicker.current?.click()}>
                    <FileUp size={15} aria-hidden="true" />Upload file
                  </button>
                  <button type="button" className="button secondary compact-btn" onClick={() => setCameraOpen(true)}>
                    <Camera size={15} aria-hidden="true" />Take photo
                  </button>
                </div>
              )}
            </div>
          </li>
        </ol>
        {quickAction.error && <Notice error>{quickAction.error}</Notice>}
      </section>
    )}
    {!sample && <>
      <input ref={photoPicker} className="visually-hidden" tabIndex={-1} aria-label="Photo file input" type="file" accept="image/*"
        onChange={(event) => selectFile(event.currentTarget)} />
      <input ref={docPicker} className="visually-hidden" tabIndex={-1} aria-label="Document file input" type="file" accept={DOCUMENT_ACCEPT}
        onChange={(event) => selectFile(event.currentTarget)} />
      <section className="capture-hero" aria-labelledby="capture-title">
        <div className="hero-content">
          <span className="hero-icon"><Camera size={21} /></span>
          <h2 id="capture-title">Capture or collect scripts</h2>
          <p>Take a photo, upload a PDF/DOCX/TXT file, generate a unique student submission link, or paste a typed response.</p>
          <div className="hero-actions">
            <button type="button" className="button primary" onClick={() => setCameraOpen(true)}><Camera size={18} />Take photo</button>
            <Link className="button secondary" to={base + '/links'}><Link2 size={17} />Submission links</Link>
            <button type="button" className="button secondary" onClick={() => photoPicker.current?.click()}><FileImage size={17} />Choose photo</button>
            <button type="button" className="button secondary" onClick={() => docPicker.current?.click()}><FileUp size={17} />Upload PDF / DOCX / TXT</button>
            <Link className="button secondary" to={base + '/capture?input=text'}><PencilLine size={17} />Paste answer</Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="art-paper-back" />
          <div className="art-paper">
            <span className="art-paper-title" />
            <span className="art-writing one" /><span className="art-writing two" /><span className="art-writing three" />
            <span className="art-writing four" /><span className="art-writing five" /><span className="art-writing six" />
            <span className="art-check"><ClipboardCheck size={19} strokeWidth={1.65} /></span>
          </div>
          <div className="art-frame"><i /><i /><i /><i /></div>
        </div>
      </section>
      {cameraOpen && <CameraModal title="Take a script photo" onClose={() => setCameraOpen(false)} onCapture={(file) => {
        setCameraOpen(false)
        onFile?.(file)
      }} />}
    </>}
    <section className="stats" aria-label="Workspace totals">
      {stats.map(({ label, value, icon: Icon, tone }) => <div className="stat panel" key={label}>
        <span className={'stat-icon ' + tone}><Icon size={20} strokeWidth={1.8} /></span>
        <div><span>{label}</span><strong>{value}</strong></div>
      </div>)}
    </section>
    <section className="panel queue">
      <div className="queue-header">
        <div><h2>Scripts</h2><p>{count ? count + (count === 1 ? ' script in ' : ' scripts in ') + project.name : 'No scripts in ' + project.name + ' yet'}</p></div>
        {!!count && <label className="search"><Search size={17} /><input aria-label="Search scripts" value={search} placeholder="Search scripts" onChange={(event) => setSearch(event.target.value)} /></label>}
      </div>
      {!!count && <div className="queue-filters" aria-label="Filter scripts">
        {['All scripts', 'Awaiting review', 'Finalised', ...(scripts.some((script) => script.secondReview) || filter === 'Flagged' ? ['Flagged'] : [])].map((value) => <button type="button" key={value} aria-pressed={filter === value}
          onClick={() => setFilter(value)}>{value}</button>)}
      </div>}
      {items.length ? <ul className="script-list">
        {items.map((script) => {
          const rubric = rubrics.find((item) => item.id === script.rubricId)
          const status = statusOf(script)
          const Icon = script.photo ? FileImage : FileText
          return <li key={script.id}><Link className="list-row script-row" to={base + '/scripts/' + script.id}>
            <span className="row-icon"><Icon size={20} /></span>
            <span className="row-name"><strong>{scriptName(script)}</strong><small>{rubric?.title ?? 'Unassigned'} · {scriptSourceLabel(script)}{script.sourceFile?.name ? ' · ' + script.sourceFile.name : ''}</small></span>
            <span className={'badge ' + (script.finalisedAt ? 'badge-device' : 'neutral')}>{status}</span>
            {script.secondReview && <span className="flag-indicator" aria-label="Flagged for second review" title="Flagged for second review"><Flag size={16} /></span>}
            {script.finalisedAt && rubric && <span className="queue-mark">{earned(script, rubric)} / {total(rubric)}</span>}
            <ChevronRight className="row-chevron" size={17} />
          </Link></li>
        })}
      </ul> : <div className="empty-state queue-empty">
        <span className="empty-icon"><FilePlus2 size={25} strokeWidth={1.65} /></span>
        <h3>{count ? 'No matching scripts' : 'No scripts in this project yet'}</h3>
        <p>{count ? 'Change the filter or search to see more scripts.' : 'Take a photo, upload a PDF/DOCX/TXT, share a student submission link, or paste a typed answer.'}</p>
        {!count && !sample && <Link className="text-link" to={base + '/rubric'}>Set up a rubric for {project.name}</Link>}
      </div>}
    </section>
  </div>
}
