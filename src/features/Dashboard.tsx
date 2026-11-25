import { Camera, ChevronRight, ClipboardCheck, FileImage, FilePlus2, Files, FileText, FileUp, Flag, Link2, ListChecks, PencilLine, Search } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CameraModal } from '../components/CameraModal'
import { DOCUMENT_ACCEPT } from '../domain/document'
import { activeProjectOf, earned, projectRubrics, projectScripts, scriptName, scriptSourceLabel, statusOf, total, type Workspace } from '../domain/workspace'

export function Dashboard({ workspace, onFile, base = '/workspace', sample = false }: {
  workspace: Workspace; onFile?: (file: File) => void; base?: string; sample?: boolean
}) {
  const photoPicker = useRef<HTMLInputElement>(null)
  const docPicker = useRef<HTMLInputElement>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [filter, setFilter] = useState('All scripts')
  const [search, setSearch] = useState('')
  const project = activeProjectOf(workspace)
  const scripts = projectScripts(workspace, project.id)
  const rubrics = projectRubrics(workspace, project.id)
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

  return <div className="dashboard">
    <header className="page-heading dashboard-heading">
      <div><h1>{sample ? 'Sample workspace' : project.name}</h1>
        <p>{sample ? 'Review a fictional assessment with preloaded scripts.' : (project.description || 'Capture scripts, review marks and prepare student feedback for this project.')}</p></div>
      {!sample && recent && <Link className="button secondary desktop-action" to={base + '/scripts/' + recent.id}><PencilLine size={17} />Continue marking</Link>}
      {sample && <Link className="button secondary" to={base + '/practice'}>Open sample feedback</Link>}
    </header>
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
            <button className="button primary" onClick={() => setCameraOpen(true)}><Camera size={18} />Take photo</button>
            <Link className="button secondary" to={base + '/links'}><Link2 size={17} />Submission links</Link>
            <button className="button secondary" onClick={() => photoPicker.current?.click()}><FileImage size={17} />Choose photo</button>
            <button className="button secondary" onClick={() => docPicker.current?.click()}><FileUp size={17} />Upload PDF / DOCX / TXT</button>
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
        {['All scripts', 'Awaiting review', 'Finalised', ...(scripts.some((script) => script.secondReview) || filter === 'Flagged' ? ['Flagged'] : [])].map((value) => <button key={value} aria-pressed={filter === value}
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
