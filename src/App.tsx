import { Activity, BarChart3, BookOpen, CheckCircle2, ChevronRight, ClipboardList, Download, Files, FileSpreadsheet, FlaskConical, FolderKanban, Link2, LockKeyhole, LogIn, Settings2, ShieldCheck, UserCircle2, UserPlus, WifiOff, type LucideIcon } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { checkDevice, cloudConfigured, configured, type DeviceStatus } from './ai/firebase'
import { useAuth } from './auth/auth'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProjectBar } from './components/ProjectBar'
import { ProjectSwitcher } from './components/ProjectSwitcher'
import { isDemoPath, isProtectedWorkspacePath } from './domain/authGuard'
import { summariseAiReadiness } from './domain/onboarding'
import { activeProjectOf } from './domain/workspace'
import { AuthPage } from './features/Auth'
import { Capture } from './features/Capture'
import { ClassPicture } from './features/ClassPicture'
import { Dashboard } from './features/Dashboard'
import { FeedbackRoute } from './features/Feedback'
import { Landing } from './features/Landing'
import { Practice } from './features/Practice'
import { Projects } from './features/Projects'
import { ReviewRoute } from './features/Review'
import { Rubrics } from './features/Rubrics'
import { Settings } from './features/Settings'
import { StudentSubmit } from './features/StudentSubmit'
import { SubmissionLinks } from './features/SubmissionLinks'
import { useWorkspace } from './storage/useWorkspace'
import { Loading, Notice } from './ui'

const Sample = lazy(() => import('./demo/Sample'))
const Inspector = lazy(() => import('./features/Inspector'))
const Results = lazy(() => import('./features/Results'))

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

const workspaceMobileLinks: NavItem[] = [
  { to: '/workspace', label: 'Scripts', icon: Files, end: true },
  { to: '/workspace/links', label: 'Links', icon: Link2 },
  { to: '/workspace/rubric', label: 'Rubrics', icon: ClipboardList },
  { to: '/workspace/class', label: 'Class', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]
const publicMobileLinks: NavItem[] = [
  { to: '/sample', label: 'Demo', icon: FlaskConical },
  { to: '/practice', label: 'Practice', icon: BookOpen },
  { to: '/inspector', label: 'Inspector', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings2 },
  { to: '/login', label: 'Sign in', icon: LogIn },
]
const workspaceSideLinks: NavItem[] = [
  { to: '/workspace/projects', label: 'Projects', icon: FolderKanban },
  { to: '/workspace', label: 'Scripts', icon: Files, end: true },
  { to: '/workspace/links', label: 'Submission links', icon: Link2 },
  { to: '/workspace/rubric', label: 'Rubrics', icon: ClipboardList },
  { to: '/workspace/class', label: 'Class picture', icon: BarChart3 },
  { to: '/workspace/results', label: 'Results & export', icon: FileSpreadsheet },
  { to: '/practice', label: 'Practice', icon: BookOpen },
  { to: '/inspector', label: 'AI inspector', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]
const publicSideLinks: NavItem[] = [
  { to: '/sample', label: 'Live demo', icon: FlaskConical },
  { to: '/practice', label: 'Practice', icon: BookOpen },
  { to: '/inspector', label: 'AI inspector', icon: Activity },
  { to: '/settings', label: 'AI & settings', icon: Settings2 },
]

export function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { workspace, commit, error, reload } = useWorkspace()
  const [pendingFile, setPendingFile] = useState<File>()
  const [text, setText] = useState<DeviceStatus>('unavailable')
  const [image, setImage] = useState<DeviceStatus>('unavailable')
  const [online, setOnline] = useState(navigator.onLine)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const deviceReady = configured && text === 'available'
  const imageReady = configured && image === 'available'
  const readiness = summariseAiReadiness({
    configured,
    text,
    image,
    online,
    allowCloud: workspace?.allowCloud ?? false,
    cloudConfigured,
  })
  const allowCloudNow = workspace ? () => commit((current) => ({ ...current, allowCloud: true })) : undefined
  const isSignedIn = Boolean(user)
  const sideLinks = isSignedIn ? workspaceSideLinks : publicSideLinks
  const mobileLinks = isSignedIn ? workspaceMobileLinks : publicMobileLinks
  const active = sideLinks.find((item) => item.to !== '/workspace' && location.pathname.startsWith(item.to))
  const inSample = isDemoPath(location.pathname)
  const inAuth = location.pathname === '/login' || location.pathname === '/signup'
  const inWorkspace = isProtectedWorkspacePath(location.pathname)
  const currentProject = workspace ? activeProjectOf(workspace) : undefined

  const refresh = useCallback(async () => {
    const [textStatus, imageStatus] = await Promise.all([checkDevice(), checkDevice(true)])
    setText(textStatus)
    setImage(imageStatus)
  }, [])

  useEffect(() => {
    const onNetwork = () => setOnline(navigator.onLine)
    void refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('online', onNetwork)
    window.addEventListener('offline', onNetwork)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', onNetwork)
      window.removeEventListener('offline', onNetwork)
    }
  }, [refresh])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  const pageName = location.pathname === '/' ? ''
    : location.pathname.startsWith('/submit/') ? 'Submit your work'
      : inSample ? 'Interactive demo'
        : inAuth ? (location.pathname === '/signup' ? 'Create account' : 'Sign in')
          : active?.label ?? (inWorkspace ? 'Scripts' : 'Demo')
  useEffect(() => {
    document.title = pageName ? pageName + ' · Marking Assistant' : 'Marking Assistant'
  }, [pageName])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const resize = () => setKeyboardOpen(viewport.scale <= 1.05 && window.innerHeight - viewport.height > 140)
    viewport.addEventListener('resize', resize)
    return () => viewport.removeEventListener('resize', resize)
  }, [])

  if (location.pathname === '/') {
    return <Landing deviceReady={deviceReady} />
  }

  if (location.pathname === '/demo' || location.pathname.startsWith('/demo/')) {
    const suffix = location.pathname.slice('/demo'.length)
    return <Navigate to={'/sample' + suffix + location.search} replace />
  }

  if (location.pathname.startsWith('/submit/')) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/submit/:linkId" element={<StudentSubmit />} />
        </Routes>
      </ErrorBoundary>
    )
  }

  // Standalone email/password auth view when signed out (no workspace chrome exposed).
  if (inAuth && !user) {
    return (
      <div className="auth-page">
        <a className="skip-link" href="#auth-main">Skip to content</a>
        <header className="submit-topbar">
          <div className="submit-topbar-inner">
            <Link to="/" className="brand">
              <img src="/mark.svg" alt="" width={34} height={34} /><span>Marking Assistant</span>
            </Link>
            <div className="button-row">
              <Link to="/sample" className="button secondary compact-btn">
                <FlaskConical size={15} aria-hidden="true" />Try demo
              </Link>
            </div>
          </div>
        </header>
        <main id="auth-main" className="auth-container">
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={<AuthPage />} />
              <Route path="/signup" element={<AuthPage />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    )
  }

  // Strictly gate /workspace and /workspace/* behind email/password auth.
  if (inWorkspace && !authLoading && !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <div className={'app-shell' + (keyboardOpen ? ' keyboard-open' : '')}>
    <a className="skip-link" href="#content">Skip to content</a>
    <aside className="sidebar" aria-label="Main navigation">
      <Link to="/" className="brand">
        <img src="/mark.svg" alt="" width={40} height={40} /><span>Marking Assistant</span>
      </Link>
      {isSignedIn && workspace && !inSample && (
        <ProjectSwitcher workspace={workspace} commit={commit} />
      )}
      <nav className="side-nav">
        <small>{isSignedIn ? 'Workspace' : 'Demo & tools'}</small>
        {sideLinks.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) =>
          'nav-link' + (isActive || (to === '/workspace' && isSignedIn && !active && !inSample && !inAuth) ? ' selected' : '')}>
          <Icon size={19} strokeWidth={1.8} />{label}
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        {isSignedIn ? (
          <>
            <NavLink to="/login" className={({ isActive }) => 'nav-link' + (isActive ? ' selected' : '')}>
              <UserCircle2 size={18} />
              <span className="truncate-label">{user?.displayName || user?.email || 'Account'}</span>
            </NavLink>
            <NavLink to="/sample" className="nav-link sample-link"><FlaskConical size={18} />Try demo</NavLink>
            <div className="privacy-card">
              <span><ShieldCheck size={18} />Private workspace</span>
              <p>Your workspace is saved in this browser. Submission links keep student answers in your Firestore dropbox.</p>
            </div>
          </>
        ) : (
          <>
            <NavLink to="/login" className="nav-link"><LogIn size={18} />Sign in to workspace</NavLink>
            <NavLink to="/signup" className="nav-link"><UserPlus size={18} />Create account</NavLink>
            <div className="privacy-card">
              <span><ShieldCheck size={18} />Demo mode</span>
              <p>Sign in with email and password to unlock your private marking workspace and submission links.</p>
            </div>
          </>
        )}
      </div>
    </aside>
    <div className="app-body">
      <header className="topbar">
        <Link to="/" className="brand mobile-brand"><img src="/mark.svg" alt="" width={33} height={33} /><span>Marking Assistant</span></Link>
        <div className="breadcrumbs">
          <span>{inWorkspace && currentProject ? currentProject.name : inSample ? 'Demo' : isSignedIn ? 'Workspace' : 'Marking Assistant'}</span>
          <ChevronRight size={15} aria-hidden="true" />
          <strong>{inSample ? 'Interactive demo' : inAuth ? 'Account' : active?.label ?? 'Scripts'}</strong>
        </div>
        <div className="topbar-actions">
          <Link to="/settings" className={'privacy-pill pill-' + readiness.topbarTone} title="Open AI and privacy settings">
            {!online ? <WifiOff size={15} aria-hidden="true" />
              : readiness.textReady ? <CheckCircle2 size={14} aria-hidden="true" />
              : readiness.canDownload || readiness.downloading ? <Download size={14} aria-hidden="true" />
              : <LockKeyhole size={14} aria-hidden="true" />}
            {readiness.topbarLabel}
          </Link>
          <Link to="/login" className="account-chip" aria-label={user ? 'Manage account' : 'Sign in'}>
            {user ? <UserCircle2 size={16} /> : <LogIn size={15} />}
            <span>{user ? (user.displayName?.split(' ')[0] || 'Account') : 'Sign in'}</span>
          </Link>
        </div>
      </header>
      <p className="visually-hidden" role="status" aria-live="polite">{pageName} page</p>
      <main id="content" className="content">
        {isSignedIn && workspace && inWorkspace && location.pathname !== '/workspace/projects' && (
          <ProjectBar workspace={workspace} commit={commit} />
        )}
        {inSample ? <Suspense fallback={<Loading>Opening the interactive demo…</Loading>}><Sample
          deviceReady={deviceReady}
          imageReady={imageReady}
          allowCloud={workspace?.allowCloud ?? false}
          onAllowCloud={allowCloudNow}
        /></Suspense> :
          inAuth ? <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage />} />
          </Routes> :
          inWorkspace && authLoading ? <Loading>Checking your account…</Loading> :
          error ? <div className="panel form-panel"><Notice error>{error}</Notice><button type="button" className="button secondary" onClick={reload}>Retry local storage</button></div> :
            !workspace ? <Loading>Opening your workspace…</Loading> :
              <ErrorBoundary>
                <Routes>
                  <Route path="/workspace" element={<Dashboard workspace={workspace} commit={commit} textStatus={text} imageStatus={image} refreshDevice={refresh} online={online} onFile={(file) => {
                    setPendingFile(file)
                    navigate('/workspace/capture')
                  }} />} />
                  <Route path="/workspace/projects" element={<Projects workspace={workspace} commit={commit} base="/workspace" />} />
                  <Route path="/workspace/links" element={<SubmissionLinks workspace={workspace} commit={commit} deviceReady={deviceReady} />} />
                  <Route path="/workspace/capture" element={<Capture key={location.search} initialFile={pendingFile}
                    consumeFile={() => setPendingFile(undefined)} workspace={workspace} commit={commit} />} />
                  <Route path="/workspace/rubric" element={<Rubrics workspace={workspace} commit={commit} deviceReady={deviceReady} imageReady={imageReady} onAllowCloud={allowCloudNow} />} />
                  <Route path="/workspace/scripts/:id" element={<ReviewRoute workspace={workspace} commit={commit} deviceReady={deviceReady} imageReady={imageReady} textStatus={text} imageStatus={image} refreshDevice={refresh} base="/workspace" />} />
                  <Route path="/workspace/scripts/:id/feedback" element={<FeedbackRoute workspace={workspace} commit={commit} deviceReady={deviceReady} base="/workspace" />} />
                  <Route path="/workspace/class" element={<ClassPicture workspace={workspace} base="/workspace" onAllowCloud={allowCloudNow} />} />
                  <Route path="/workspace/results" element={<Suspense fallback={<Loading>Opening results &amp; export…</Loading>}>
                    <Results workspace={workspace} commit={commit} base="/workspace" />
                  </Suspense>} />
                  <Route path="/practice" element={<Practice deviceReady={deviceReady} allowCloud={workspace.allowCloud} />} />
                  <Route path="/inspector" element={<Suspense fallback={<Loading>Opening the inspector…</Loading>}>
                    <Inspector deviceReady={deviceReady} allowCloud={workspace.allowCloud} online={online} onAllowCloud={allowCloudNow} />
                  </Suspense>} />
                  <Route path="/settings" element={<Settings workspace={workspace} commit={commit} text={text} image={image} refresh={refresh} />} />
                  <Route path="*" element={<Navigate to={isSignedIn ? '/workspace' : '/sample'} replace />} />
                </Routes>
              </ErrorBoundary>}
        {isSignedIn && <footer className="mobile-footer"><Link to="/sample"><FlaskConical size={16} />Try interactive demo</Link></footer>}
      </main>
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {mobileLinks.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) =>
        isActive || (to === '/workspace' && isSignedIn && !active && !inSample && !inAuth) ? 'selected' : ''}>
        <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
      </NavLink>)}
    </nav>
  </div>
}
