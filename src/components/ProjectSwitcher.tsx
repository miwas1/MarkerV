import { FolderKanban, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { activeProjectOf, createProject, setActiveProject, type Workspace } from '../domain/workspace'
import { Modal, Notice, useAction, type Commit } from '../ui'

export function ProjectSwitcher({
  workspace,
  commit,
  managePath = '/workspace/projects',
  compact = false,
}: {
  workspace: Workspace
  commit: Commit
  managePath?: string
  compact?: boolean
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
      <div className={compact ? 'project-switcher compact' : 'project-switcher'}>
        <div className="project-switcher-label">
          <FolderKanban size={15} aria-hidden="true" />
          <span>Project</span>
          {managePath && <Link className="project-manage-link" to={managePath}>Manage</Link>}
        </div>
        <div className="project-switcher-controls">
          <select
            aria-label="Active project"
            value={active.id}
            disabled={busy}
            onChange={(event) => {
              const nextId = event.target.value
              void run(async () => commit((current) => setActiveProject(current, nextId)))
            }}
          >
            {workspace.projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="button secondary compact-btn project-switcher-add"
          disabled={busy}
          onClick={() => { setError(''); setCreating(true) }}
        >
          <Plus size={15} />New project
        </button>
      </div>

      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)}>
          <p>Organise scripts, rubrics, and class insights separately for each course, module, or assessment.</p>
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
