import { ArrowRight, ArrowUpRight, BookOpen, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import heroDeskImg from '../assets/images/hero_marking_desk_1795516785867.webp'
import seminarNotesImg from '../assets/images/seminar_teaching_notes_1795516785982.webp'
import workflowCaptureImg from '../assets/images/workflow_handwritten_capture_1795516786416.webp'
import { useAuth } from '../auth/auth'

type RoutingModeId = 'device' | 'hybrid' | 'cloud'

type RoutingModeSpec = {
  id: RoutingModeId
  tabLabel: string
  sdkMode: string
  headline: string
  summary: string
  tasks: string[]
  boundaryNote: string
  actionLabel: string
  actionTo: string
  payloadTitle: string
  payloadPreview: string
}

const ROUTING_MODES: RoutingModeSpec[] = [
  {
    id: 'device',
    tabLabel: 'Private scripts',
    sdkMode: 'InferenceMode.ONLY_ON_DEVICE',
    headline: 'Student handwriting, marks, and practice replies never go to cloud AI.',
    summary:
      'Transcription, evidence-backed criterion scoring, individual feedback drafts, and real student practice replies run inside desktop Chrome via Gemini Nano with zero cloud AI fallback. Disconnect Wi-Fi and every local marking control continues working.',
    tasks: [
      'Handwritten script transcription from phone photos or scanned PDFs',
      'Criterion mark suggestions requiring an exact contiguous quote in the answer',
      'Per-student feedback notes, oral follow-ups, and on-device student practice replies',
    ],
    boundaryNote: 'Student scripts sent to cloud AI: 0 bytes. Optional submission links use a separate lecturer-owned Firestore dropbox.',
    actionLabel: 'Inspect handwritten sample script',
    actionTo: '/sample/scripts/fictional-processes-01',
    payloadTitle: 'Network boundary · Local AI only',
    payloadPreview: `{
  "inferenceMode": "ONLY_ON_DEVICE",
  "cloudAiFallback": false,
  "sentToCloudAiBytes": 0,
  "verifiedQuote": "A thread runs inside a process.",
  "workspaceStorage": "Browser IndexedDB (local profile)"
}`,
  },
  {
    id: 'hybrid',
    tabLabel: 'Rubrics & sample',
    sdkMode: 'InferenceMode.PREFER_ON_DEVICE',
    headline: 'Zero-network local execution first, with Cloud Gemini fallback when needed.',
    summary:
      'When drafting a rubric from an exam question, reading a printed mark scheme photo, or testing the fictional CS201 sample workspace end-to-end, Marking Assistant runs Gemini Nano locally first with zero network calls and falls back to Cloud Gemini only if unavailable or on error when Cloud AI is enabled.',
    tasks: [
      'Drafting structured scoring rubrics and practice questions from assessment prompts',
      'Extracting criteria from photographed mark schemes or uploaded DOCX/PDF files',
      'Testing transcription, marking, feedback, and adaptive practice on the fictional sample',
    ],
    boundaryNote: 'Contains assessment criteria or fictional sample data only — never real student scripts.',
    actionLabel: 'Open hybrid sample workspace',
    actionTo: '/sample/scripts/fictional-processes-01',
    payloadTitle: 'Hybrid boundary · Local-first + fallback',
    payloadPreview: `{
  "inferenceMode": "PREFER_ON_DEVICE",
  "primaryEngine": "Chrome Built-in AI (Gemini Nano)",
  "localNetworkCalls": 0,
  "fallbackCondition": "allowCloud && RemoteConfig(allow_cloud_ai)",
  "containsRealStudentScripts": false
}`,
  },
  {
    id: 'cloud',
    tabLabel: 'Class & audit',
    sdkMode: 'InferenceMode.ONLY_IN_CLOUD',
    headline: 'High-reasoning pedagogy gated by App Check, Remote Config, and payload preview.',
    summary:
      'Rubric reliability audits and cohort re-teaching plans use Cloud Gemini only after you inspect the exact JSON payload in a confirmation dialog. Small cohorts are automatically suppressed before anything leaves the browser.',
    tasks: [
      'Rubric quality audits flagging overlapping bands or ambiguous phrasing',
      'Class re-teaching plans from anonymous aggregate cohort counts',
      'Institutional kill-switch via Firebase Remote Config and App Check enforcement',
    ],
    boundaryNote: 'Exact JSON preview shown before every cloud request; cohort groups below threshold are suppressed.',
    actionLabel: 'Preview sample class picture',
    actionTo: '/sample/class',
    payloadTitle: 'Cloud payload · Anonymous aggregates only',
    payloadPreview: `{
  "inferenceMode": "ONLY_IN_CLOUD",
  "gates": ["AppCheck (reCAPTCHA Enterprise)", "RemoteConfig(allow_cloud_ai)"],
  "counts": [
    { "criterion": 1, "total": 11, "belowFullMarks": 5 },
    { "criterion": 2, "total": 11, "belowFullMarks": 6 }
  ],
  "studentNamesOrScripts": "excluded"
}`,
  },
]

const WORKFLOW_STEPS = [
  {
    index: '01.',
    title: 'Organize by project and rubric',
    body: 'Keep each module or assessment in its own local project. Author rubrics from scratch, photograph printed mark schemes, or upload local PDF, DOCX, and TXT files.',
  },
  {
    index: '02.',
    title: 'Capture or collect student scripts',
    body: 'Photograph handwritten exam books with crop and scan enhancement, extract text locally from PDF and Word uploads, paste typed answers, or share an optional lecturer-owned submission link.',
  },
  {
    index: '03.',
    title: 'Review evidence-backed marks',
    body: 'On-device AI proposes a criterion score only when it cites an exact contiguous passage appearing once in the transcript. Every score, edit, and finalisation remains a deliberate lecturer decision.',
  },
  {
    index: '04.',
    title: 'Release portable feedback & class insight',
    body: 'Export a self-contained feedback file students can open for guided on-device practice with self-check cues, then inspect aggregate cohort weaknesses in Class Picture.',
  },
]

const SAMPLE_ENTRIES = [
  {
    meta: 'Script 1 of 12 · Handwritten page',
    title: 'Inspect evidence-backed marking',
    body: 'Open a rendered handwritten Operating Systems answer with inline verified quotes, criterion scores, and a fictional second opinion.',
    to: '/sample/scripts/fictional-processes-01',
    cta: 'Open script',
  },
  {
    meta: '3 criteria · 6 total marks',
    title: 'Audit a marking rubric',
    body: 'Review the Processes and threads mark scheme and inspect the exact JSON payload before running a Cloud AI reliability audit.',
    to: '/sample/rubric',
    cta: 'Open rubric',
  },
  {
    meta: '11 finalised · Aggregate counts',
    title: 'Explore cohort class picture',
    body: 'See criterion performance distributions across the cohort and draft a 10-minute re-teaching plan without exposing any student script.',
    to: '/sample/class',
    cta: 'View class picture',
  },
  {
    meta: 'Portable JSON · Fictional sample',
    title: 'Try guided student practice',
    body: 'Step through a released sample feedback file with self-check cues and adaptive hybrid follow-ups (real student practice stays strictly on-device).',
    to: '/sample/practice',
    cta: 'Start practice',
  },
]

function EditorialFigure({
  src,
  alt,
  caption,
  fallbackTitle,
  className = '',
}: {
  src: string
  alt: string
  caption?: string
  fallbackTitle: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <figure className={`lp-figure ${className}`.trim()}>
      <div className="lp-figure-frame">
        {failed ? (
          <div className="lp-figure-fallback" role="img" aria-label={alt}>
            <BookOpen size={28} strokeWidth={1.6} aria-hidden="true" />
            <span>{fallbackTitle}</span>
          </div>
        ) : (
          <img
            src={src}
            alt={alt}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      {caption && <figcaption className="lp-figcaption">{caption}</figcaption>}
    </figure>
  )
}

export function Landing({ deviceReady }: { deviceReady: boolean }) {
  const { user } = useAuth()
  const [selectedMode, setSelectedMode] = useState<RoutingModeId>('device')
  const activeMode = ROUTING_MODES.find((mode) => mode.id === selectedMode) ?? ROUTING_MODES[0]

  return (
    <div className="lp-page">
      <a className="skip-link" href="#landing-main">Skip to content</a>

      <header className="lp-header">
        <div className="lp-header-inner">
          <Link to="/" className="lp-brand">Marking Assistant</Link>

          <nav className="lp-nav" aria-label="Landing navigation">
            <a href="#workflow" className="lp-nav-link">How it works</a>
            <a href="#architecture" className="lp-nav-link">Hybrid AI</a>
            <Link to="/sample" className="lp-nav-link">Live sample</Link>
            <Link to="/practice" className="lp-nav-link">Practice</Link>
          </nav>

          <div className="lp-header-action">
            <Link to="/workspace" className="button primary lp-cta-compact">
              Open workspace
            </Link>
          </div>
        </div>
      </header>

      <main id="landing-main">
        <section className="lp-section lp-hero-section">
          <div className="lp-container">
            <div className="lp-hero-grid">
              <div className="lp-hero-copy">
                <div className="lp-meta-line">
                  <span>On-device privacy</span>
                  <span aria-hidden="true">·</span>
                  <span>Hybrid Firebase AI Logic</span>
                  <span aria-hidden="true">·</span>
                  <span>{deviceReady ? 'Chrome AI ready on this browser' : 'Works offline in your browser'}</span>
                </div>

                <h1 className="lp-hero-title">
                  Grade handwritten scripts privately, without sending student work to cloud AI.
                </h1>

                <p className="lp-hero-lead">
                  Capture exam pages on a phone, upload local PDF or Word submissions, or publish an optional
                  submission link. Chrome’s on-device AI transcribes handwriting and suggests quote-verified criterion
                  marks locally, while Cloud Gemini handles rubric audits and cohort re-teaching plans with zero
                  student scripts.
                </p>

                <div className="lp-hero-actions">
                  <Link to="/workspace" className="button primary lp-primary-btn">
                    Open workspace<ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link to="/sample" className="button secondary lp-secondary-btn">
                    Explore live sample
                  </Link>
                </div>

                <p className="lp-hero-account-note">
                  {user ? (
                    <>
                      Signed in as <strong>{user.displayName || user.email}</strong>
                      <span aria-hidden="true"> · </span>
                      <Link to="/workspace/projects">Manage projects</Link>
                    </>
                  ) : (
                    <>
                      No account required for local marking.{' '}
                      <Link to="/login">Sign in with email</Link> to publish optional student submission links (stored in your private Firestore dropbox).
                    </>
                  )}
                </p>
              </div>

              <EditorialFigure
                src={heroDeskImg}
                alt="University lecturer desk in morning window light with handwritten examination scripts, a printed marking rubric, and a laptop"
                fallbackTitle="Private academic marking desk"
                className="lp-hero-figure"
              />
            </div>

            <dl className="lp-proof-strip" aria-label="Architecture guarantees">
              <div className="lp-proof-cell">
                <dt>Private scripts sent to cloud AI</dt>
                <dd>0 bytes</dd>
                <span>Real handwriting, transcripts, and marks are never sent to cloud AI models.</span>
              </div>
              <div className="lp-proof-cell">
                <dt>Firebase AI Logic modes</dt>
                <dd>3 tiers</dd>
                <span>Strict local, local-first hybrid, and audited cloud pedagogy.</span>
              </div>
              <div className="lp-proof-cell">
                <dt>Local capture &amp; upload inputs</dt>
                <dd>4 sources</dd>
                <span>Camera photo, PDF, DOCX, and TXT—plus optional Firestore submission links.</span>
              </div>
              <div className="lp-proof-cell">
                <dt>Workspace storage</dt>
                <dd>Local-first</dd>
                <span>Courses, rubrics, and marks live in IndexedDB; optional dropboxes use private Firestore.</span>
              </div>
            </dl>
          </div>
        </section>

        <section id="workflow" className="lp-section lp-section-alt">
          <div className="lp-container">
            <div className="lp-section-intro">
              <p className="lp-kicker">Workflow</p>
              <h2 className="lp-section-title">From handwritten stack to verified marks in four steps.</h2>
              <p className="lp-section-lead">
                Designed around how university lecturers actually mark: separate projects per module, fast capture,
                transparent criterion quotes, and portable feedback students can practise from.
              </p>
            </div>

            <div className="lp-workflow-grid">
              <ol className="lp-step-list">
                {WORKFLOW_STEPS.map((step) => (
                  <li key={step.index} className="lp-step-item">
                    <span className="lp-step-index">{step.index}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <EditorialFigure
                src={workflowCaptureImg}
                alt="Overhead view of a handwritten university biology exam sheet with diagrams alongside a printed marking rubric"
                caption="Capture handwritten scripts alongside printed mark schemes; every positive AI mark must cite an exact verbatim quote."
                fallbackTitle="Handwritten script and rubric sheet"
                className="lp-workflow-figure"
              />
            </div>
          </div>
        </section>

        <section id="architecture" className="lp-section">
          <div className="lp-container">
            <div className="lp-arch-head">
              <div>
                <p className="lp-kicker">Hybrid AI boundary</p>
                <h2 className="lp-section-title">Inspect what stays local and what can reach the cloud.</h2>
                <p className="lp-section-lead">
                  Privacy is enforced at the inference layer—not by policy text alone. Select a tier to inspect its
                  Firebase AI Logic routing mode and outbound data contract.
                </p>
              </div>

              <div className="lp-mode-tabs" role="tablist" aria-label="Firebase AI Logic inference modes">
                {ROUTING_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedMode === mode.id}
                    className={`lp-mode-tab${selectedMode === mode.id ? ' active' : ''}`}
                    onClick={() => setSelectedMode(mode.id)}
                  >
                    {mode.tabLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className="lp-arch-panel" role="tabpanel">
              <div className="lp-arch-detail">
                <p className="lp-code-meta">{activeMode.sdkMode}</p>
                <h3>{activeMode.headline}</h3>
                <p className="lp-arch-summary">{activeMode.summary}</p>
                <ul className="lp-plain-list">
                  {activeMode.tasks.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ul>
                <p className="lp-boundary-note">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>{activeMode.boundaryNote}</span>
                </p>
                <div className="lp-arch-link-row">
                  <Link to={activeMode.actionTo} className="lp-inline-cta">
                    {activeMode.actionLabel}<ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="lp-payload-pane">
                <div className="lp-payload-header">{activeMode.payloadTitle}</div>
                <pre className="lp-payload-code"><code>{activeMode.payloadPreview}</code></pre>
              </div>
            </div>
          </div>
        </section>

        <section id="sample-preview" className="lp-section lp-section-alt">
          <div className="lp-container">
            <div className="lp-sample-layout">
              <div className="lp-sample-visual">
                <p className="lp-kicker">Interactive sample</p>
                <h2 className="lp-section-title">Test the full workflow before uploading a single script.</h2>
                <p className="lp-section-lead">
                  Explore a self-contained fictional module—<strong>CS201 · Operating Systems</strong>—with 12 scripts,
                  a rendered handwritten exam page, a complete rubric, and class analytics stored separately from your own workspace.
                </p>
                <EditorialFigure
                  src={seminarNotesImg}
                  alt="Sunlit university seminar room wooden table with organized lecture notes and a dark green notebook"
                  caption="Changes in the sample workspace stay isolated and can be reset anytime."
                  fallbackTitle="University seminar review table"
                  className="lp-sample-figure"
                />
              </div>

              <div className="lp-sample-cards">
                {SAMPLE_ENTRIES.map((entry) => (
                  <Link key={entry.to} to={entry.to} className="lp-sample-card">
                    <span className="lp-sample-meta">{entry.meta}</span>
                    <h3>{entry.title}</h3>
                    <p>{entry.body}</p>
                    <span className="lp-sample-link">
                      {entry.cta}<ArrowUpRight size={15} aria-hidden="true" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-closing-section">
          <div className="lp-container">
            <div className="lp-closing-band">
              <div className="lp-closing-copy">
                <h2 className="lp-closing-title">Start marking in a private local workspace.</h2>
                <p>
                  Create your first project and rubric in seconds—stored locally in this browser, with optional
                  submission dropbox links and Cloud AI governance when you need them.
                </p>
              </div>
              <div className="lp-closing-actions">
                <Link to="/workspace" className="button primary lp-primary-btn">
                  Open workspace<ArrowRight size={16} aria-hidden="true" />
                </Link>
                <div className="lp-closing-links">
                  <Link to="/sample">Try live sample</Link>
                  <span aria-hidden="true">·</span>
                  <Link to={user ? '/settings' : '/signup'}>{user ? 'Privacy & settings' : 'Create account'}</Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand-col">
            <Link to="/" className="lp-brand">Marking Assistant</Link>
            <p className="lp-footer-note">
              Local-first assessment marking with hybrid Firebase AI Logic. Private student scripts are never sent to cloud AI.
            </p>
          </div>
          <nav className="lp-footer-links" aria-label="Footer navigation">
            <Link to="/workspace/projects">Projects</Link>
            <Link to="/workspace">Scripts</Link>
            <Link to="/workspace/rubric">Rubrics</Link>
            <Link to="/workspace/class">Class picture</Link>
            <Link to="/sample">Sample</Link>
            <Link to="/practice">Practice</Link>
            <Link to="/settings">Settings</Link>
            <Link to="/login">{user ? 'Account' : 'Sign in'}</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
