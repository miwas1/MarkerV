import { BarChart3, Check, ClipboardList, Files, FolderKanban, PencilLine, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  activeProjectOf,
  createProject,
  DEFAULT_PROJECT_ID,
  deleteProject,
  projectRubrics,
  projectScripts,
  setActiveProject,
  updateProject,
  type Project,
  type Workspace,
} from '../domain/workspace'
import { Modal, Notice, useAction, type Commit } from '../ui'

export function Projects({ workspace, commit, base = '/workspace' }: { workspace: Workspace; commit: Commit; base?: string }) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Project>()
  const [deleting, setDeleting] = useState<Project>()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { run, busy, error, setError } = useAction()
  const active = activeProjectOf(workspace)

  function openCreate() {
    setError('')
    setName('')
    setDescription('')
    setCreating(true)
  }

  function openEdit(project: Project) {
    setError('')
    setName(project.name)
    setDescription(project.description ?? '')
    setEditing(project)
  }

  function openProjectRoute(projectId: string, path: string) {
    void run(async () => {
      if (workspace.activeProjectId !== projectId) {
        await commit((current) => setActiveProject(current, projectId))
      }
      navigate(path)
    })
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      await commit((current) => createProject(current, name, description))
      setCreating(false)
      setName('')
      setDescription('')
    })
  }

  function handleEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    void run(async () => {
      await commit((current) => updateProject(current, editing.id, name, description))
      setEditing(undefined)
    })
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Projects</h1>
          <p>Each project keeps its own rubrics, student scripts, and class picture cleanly separated.</p>
        </div>
        <button className="button primary" onClick={openCreate}>
          <Plus size={18} />New project
        </button>
      </header>

      {error && !creating && !editing && !deleting && <Notice error>{error}</Notice>}

      <section className="project-grid">
        {workspace.projects.map((project) => {
          const rubrics = projectRubrics(workspace, project.id)
          const latestRubrics = rubrics.filter((r) => !rubrics.some((other) => other.series === r.series && other.version > r.version))
          const scripts = projectScripts(workspace, project.id)
          const finalised = scripts.filter((s) => s.finalisedAt).length
          const isActive = project.id === active.id
          const isDefault = project.id === DEFAULT_PROJECT_ID

          return (
            <article className={'panel form-panel project-card' + (isActive ? ' active-project-card' : '')} key={project.id}>
              <div className="section-heading">
                <div className="project-title-row">
                  <span className="row-icon"><FolderKanban size={20} /></span>
                  <div>
                    <h2>{project.name}</h2>
                    <p className="project-meta-line">
                      {isActive && <strong className="project-active-label"><Check size={14} aria-hidden="true" />Active</strong>}
                      {isActive && isDefault && <span aria-hidden="true">·</span>}
                      {isDefault && <span>Default project</span>}
                      {(isActive || isDefault) && <span aria-hidden="true">·</span>}
                      <span>{latestRubrics.length} {latestRubrics.length === 1 ? 'rubric' : 'rubrics'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{scripts.length} {scripts.length === 1 ? 'script' : 'scripts'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{finalised} finalised</span>
                    </p>
                    {project.description && <p className="project-desc">{project.description}</p>}
                  </div>
                </div>
              </div>

              <div className="button-row">
                <button
                  type="button"
                  className={isActive ? 'button secondary' : 'button primary'}
                  disabled={busy}
                  onClick={() => openProjectRoute(project.id, base)}
                >
                  <Files size={16} />{isActive ? 'View scripts' : 'Open project'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => openProjectRoute(project.id, base + '/rubric')}
                >
                  <ClipboardList size={16} />Rubrics
                </button>
                <button
                  type="button"
                  className="button subtle"
                  disabled={busy}
                  onClick={() => openProjectRoute(project.id, base + '/class')}
                >
                  <BarChart3 size={16} />Class
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={'Edit ' + project.name}
                  disabled={busy}
                  onClick={() => openEdit(project)}
                >
                  <PencilLine size={17} />
                </button>
                {workspace.projects.length > 1 && (
                  <button
                    type="button"
                    className="icon-button danger-icon"
                    aria-label={'Delete ' + project.name}
                    disabled={busy}
                    onClick={() => { setError(''); setDeleting(project) }}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </article>
          )
        })}

        <button type="button" className="panel project-create-card" onClick={openCreate}>
          <span className="empty-icon"><Plus size={22} /></span>
          <strong>Create another project</strong>
          <span>Keep each course, module, or exam’s rubrics and scripts cleanly separated.</span>
        </button>
      </section>

      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)}>
          <p>Create a project to keep its rubrics, scripts, and class analytics grouped together.</p>
          <form className="form-panel embedded" onSubmit={handleCreate}>
            <label className="field">
              <span>Project name</span>
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. BIO104 Lab 3 · Spring 2026"
                autoFocus
              />
            </label>
            <label className="field">
              <span>Description <small>Optional</small></span>
              <textarea
                rows={2}
                maxLength={240}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Cohort, module, or exam details."
              />
            </label>
            {error && <Notice error>{error}</Notice>}
            <div className="button-row">
              <button type="submit" className="button primary" disabled={busy || !name.trim()}>
                <Plus size={16} />Create project
              </button>
              <button type="button" className="button secondary" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit project" onClose={() => setEditing(undefined)}>
          <form className="form-panel embedded" onSubmit={handleEdit}>
            <label className="field">
              <span>Project name</span>
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </label>
            <label className="field">
              <span>Description <small>Optional</small></span>
              <textarea
                rows={2}
                maxLength={240}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {error && <Notice error>{error}</Notice>}
            <div className="button-row">
              <button type="submit" className="button primary" disabled={busy || !name.trim()}>Save changes</button>
              <button type="button" className="button secondary" onClick={() => setEditing(undefined)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title={`Delete "${deleting.name}"?`} onClose={() => setDeleting(undefined)}>
          <p>
            This permanently deletes <strong>{projectRubrics(workspace, deleting.id).length} rubric version(s)</strong> and{' '}
            <strong>{projectScripts(workspace, deleting.id).length} script(s)</strong> inside this project from this browser.
          </p>
          {error && <Notice error>{error}</Notice>}
          <div className="button-row">
            <button
              type="button"
              className="button destructive"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  await commit((current) => deleteProject(current, deleting.id))
                  setDeleting(undefined)
                })
              }}
            >
              Delete project
            </button>
            <button type="button" className="button secondary" onClick={() => setDeleting(undefined)}>Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}
