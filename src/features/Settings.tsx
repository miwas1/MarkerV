import { Cloud, HardDrive, Layers, LogIn, LogOut, ShieldCheck, Trash2, UserCircle2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cloudConfigured, cloudModel, configured, firebaseProjectId, setupDevice, type DeviceStatus } from '../ai/firebase'
import { useAuth } from '../auth/auth'
import { DeviceAiHelper } from '../components/DeviceAiHelper'
import { newWorkspace, type Workspace } from '../domain/workspace'
import { Loading, Modal, Notice, useAction, type Commit } from '../ui'

const statusText = {
  available: 'Ready',
  downloadable: 'Download available',
  downloading: 'Downloading',
  unavailable: 'Unavailable in this browser',
} satisfies Record<DeviceStatus, string>

export function Settings({ workspace, commit, text, image, refresh }: {
  workspace: Workspace; commit: Commit; text: DeviceStatus; image: DeviceStatus; refresh: () => Promise<void>
}) {
  const { user, signOut } = useAuth()
  const [progress, setProgress] = useState<number>()
  const [confirm, setConfirm] = useState(false)
  const { run, busy, error } = useAction()

  function setup(multimodal: boolean) {
    void run(async (active) => {
      setProgress(0)
      try {
        await setupDevice(multimodal, (value) => { if (active()) setProgress(Math.min(1, Math.max(0, value))) })
      } catch {
        throw new Error('Could not set up the model. Check Chrome’s current hardware, storage and network requirements.')
      } finally {
        if (active()) { setProgress(undefined); await refresh() }
      }
    })
  }

  return <>
    <header className="page-heading"><div><h1>Privacy & settings</h1><p>Manage account connections, local AI, cloud permissions and data saved in this browser.</p></div></header>
    <section className="panel form-panel">
      <div className="section-heading">
        <h2><UserCircle2 size={19} />Lecturer account</h2>
        <span className="lp-meta-line">
          {user ? 'Signed in' : 'Local only'}
        </span>
      </div>
      {user ? (
        <div className="settings-row">
          <div>
            <strong>{user.displayName || 'Signed-in lecturer'}</strong>
            <p>{user.email} · Ready to publish unique student submission links</p>
          </div>
          <div className="button-row">
            <Link className="button secondary" to="/login">Manage account</Link>
            <button className="button subtle" disabled={busy} onClick={() => { void run(async () => signOut()) }}>
              <LogOut size={16} />Sign out
            </button>
          </div>
        </div>
      ) : (
        <div className="settings-row">
          <div>
            <strong>Not signed in</strong>
            <p>Sign in with your email and password to generate unique student submission links and receive submissions across devices.</p>
          </div>
          <Link className="button primary" to="/login"><LogIn size={16} />Sign in / Sign up</Link>
        </div>
      )}
    </section>
    <section className="panel form-panel">
      <div className="section-heading"><h2><HardDrive size={19} />On-device AI</h2><span className="badge neutral">{configured && text === 'available' ? 'Ready' : 'Manual marking available'}</span></div>
      <p>Compatible desktop Chrome can transcribe photos and suggest marks locally. Phones support capture and manual review.</p>
      {!configured && <Notice>Set Firebase configuration in the app environment to connect AI. You can capture, mark and practise manually now.</Notice>}
      <DeviceAiHelper text={text} image={image} refresh={refresh} />
      <div className="settings-row"><div><strong>Text</strong><p>{statusText[text]}</p></div>
        <button className="button secondary" disabled={busy || !configured || text === 'unavailable'} onClick={() => setup(false)}>Set up text AI</button></div>
      <div className="settings-row"><div><strong>Photos</strong><p>{statusText[image]}</p></div>
        <button className="button secondary" disabled={busy || !configured || image === 'unavailable'} onClick={() => setup(true)}>Set up photo AI</button></div>
      {progress !== undefined && <><Loading>Preparing the device model…</Loading><progress value={progress} max={1} aria-label="Device model download" /></>}
    </section>
    <section className="panel form-panel">
      <div className="section-heading"><h2><Cloud size={19} />Cloud AI</h2></div>
      <p>Enables cloud teaching plans, rubric quality audits, hybrid fallback for rubric authoring, and end-to-end hybrid AI on the fictional sample workspace. Real private student scripts, marks, and real practice replies never go to cloud AI.</p>
      <label className="switch-row"><input type="checkbox" checked={workspace.allowCloud} disabled={busy || (!cloudConfigured && !workspace.allowCloud)}
        onChange={(event) => {
          const allow = event.target.checked
          void run(async () => commit((current) => ({ ...current, allowCloud: allow })))
        }} /><span>Allow cloud AI</span></label>
      {!cloudConfigured && <Notice>{configured
        ? 'Firebase is connected, but Cloud AI also requires a registered App Check (reCAPTCHA Enterprise) site key.'
        : 'Cloud AI requires Firebase configuration and a registered App Check site key.'}</Notice>}
      {workspace.allowCloud && <p className="muted">Firebase Remote Config must also allow each request. Turning cloud AI off blocks new requests. A previously sent request may finish.</p>}
    </section>
    <section className="panel form-panel">
      <div className="section-heading"><h2><Layers size={19} />Hybrid AI routing</h2></div>
      <div className="routing-list">
        <div className="routing-row">
          <div>
            <strong>Private student work &amp; real practice</strong>
            <p>Handwriting transcription, rubric marking suggestions, feedback drafts, and real student practice replies stay strictly on-device with zero cloud AI fallback.</p>
          </div>
          <span className="badge badge-device">ONLY_ON_DEVICE</span>
        </div>
        <div className="routing-row">
          <div>
            <strong>Rubrics &amp; fictional sample</strong>
            <p>Drafting rubrics, reading rubric photos, and running the fictional sample end-to-end try on-device AI first with zero network calls, falling back to Cloud Gemini only when unavailable or on error if enabled.</p>
          </div>
          <span className="badge neutral">PREFER_ON_DEVICE</span>
        </div>
        <div className="routing-row">
          <div>
            <strong>Class plans, rubric audit &amp; second opinion</strong>
            <p>Runs in the cloud with App Check (limited-use tokens), Remote Config policy enforcement, and an exact JSON payload preview before sending.</p>
          </div>
          <span className="badge badge-cloud">ONLY_IN_CLOUD</span>
        </div>
      </div>
      <p className="muted">Cloud model: <code>{cloudModel}</code>{firebaseProjectId ? <> · Project: <code>{firebaseProjectId}</code></> : null}</p>
    </section>
    <section className="panel form-panel">
      <div className="section-heading"><h2><ShieldCheck size={19} />Local data &amp; optional dropbox</h2></div>
      <p>Private workspaces are saved locally in this browser profile (IndexedDB). Optional student submission links store incoming student answers in an isolated, lecturer-owned Firestore dropbox until you import or delete them.</p>
      <button className="button secondary" disabled={busy || !(workspace.scripts.length || workspace.rubrics.length)} onClick={() => setConfirm(true)}><Trash2 size={17} />Clear workspace data</button>
    </section>
    {error && <Notice error>{error}</Notice>}
    {confirm && <Modal title="Clear workspace data?" onClose={() => setConfirm(false)}>
      <p>All private scripts, rubrics, marks and feedback in this browser will be deleted. Files you exported stay where you saved them.</p>
      {error && <Notice error>{error}</Notice>}
      <button className="button destructive" disabled={busy} onClick={() => { void run(async () => {
        await commit(() => newWorkspace())
        setConfirm(false)
      }) }}>Clear private workspace</button>
    </Modal>}
  </>
}
