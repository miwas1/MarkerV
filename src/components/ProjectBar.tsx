import { FolderKanban, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  activeProjectOf,
  createProject,
  DEFAULT_PROJECT_ID,
  projectRubrics,
  projectScripts,
  setActiveProject,
  type Workspace,
} from '../domain/workspace'
import { Modal, Notice, useAction, type Commit } from '../ui'

export function ProjectBar({
  workspace,
  commit,
  managePath = '/workspace/projects',
}: {
  workspace: Workspace
  commit: Commit
  managePath?: string
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { run, busy, error, setError } = useAction()
  const active = activeProjectOf(workspace)

  function handleCreate(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      await commit((current) => createProject(current, name, description))
      setName('')
      setDescription('')
      setCreating(false)
    })
  }

  return (
    <>
      <section className="panel project-bar" aria-label="Workspace projects">
        <div className="project-bar-top">
          <div className="project-bar-heading">
            <FolderKanban size={17} aria-hidden="true" />
            <strong>Projects</strong>
            <span className="muted" aria-hidden="true">·</span>
            <span className="muted project-bar-count">
              {workspace.projects.length} {workspace.projects.length === 1 ? 'project' : 'projects'}
            </span>
          </div>
          <div className="project-bar-actions">
            <Link className="text-link" to={managePath}>Manage all</Link>
            <button
              type="button"
              className="button primary compact-btn"
              disabled={busy}
              onClick={() => { setError(''); setCreating(true) }}
            >
              <Plus size={15} />New project
            </button>
          </div>
        </div>

        <div className="project-bar-tabs" role="group" aria-label="Switch active project">
          {workspace.projects.map((project) => {
            const scriptsCount = projectScripts(workspace, project.id).length
            const rubrics = projectRubrics(workspace, project.id)
            const rubricsCount = rubrics.filter(
              (r) => !rubrics.some((other) => other.series === r.series && other.version > r.version),
            ).length
            const isActive = project.id === active.id
            const isDefault = project.id === DEFAULT_PROJECT_ID

            return (
              <button
                key={project.id}
                type="button"
                className={`project-tab${isActive ? ' active' : ''}`}
                aria-pressed={isActive}
                disabled={busy}
                onClick={() => {
                  if (isActive) return
                  void run(async () => commit((current) => setActiveProject(current, project.id)))
                }}
              >
                <span className="project-tab-name">{project.name}</span>
                <span className="project-tab-meta">
                  {isDefault && workspace.projects.length > 1 ? 'Default · ' : ''}
                  {scriptsCount} {scriptsCount === 1 ? 'script' : 'scripts'} · {rubricsCount} {rubricsCount === 1 ? 'rubric' : 'rubrics'}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)}>
          <p>Create a project to keep scripts, rubrics, and class insights separated for a course, module, or exam.</p>
          <form className="form-panel embedded" onSubmit={handleCreate}>
            <label className="field">
              <span>Project name</span>
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. CS201 Midterm · Fall 2026"
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
                placeholder="Course code, cohort, or assessment notes."
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
    </>
  )
}
