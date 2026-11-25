import { BarChart3, BookOpen, ChevronRight, ClipboardList, Files, FlaskConical, FolderKanban, Link2, LockKeyhole, LogIn, Settings2, ShieldCheck, UserCircle2, WifiOff } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { checkDevice, configured, type DeviceStatus } from './ai/firebase'
import { useAuth } from './auth/auth'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProjectBar } from './components/ProjectBar'
import { ProjectSwitcher } from './components/ProjectSwitcher'
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
const mobileLinks = [
  { to: '/workspace', label: 'Scripts', icon: Files, end: true },
  { to: '/workspace/links', label: 'Links', icon: Link2 },
  { to: '/workspace/rubric', label: 'Rubrics', icon: ClipboardList },
  { to: '/workspace/class', label: 'Class picture', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]
const sideLinks = [
  { to: '/workspace/projects', label: 'Projects', icon: FolderKanban },
  { to: '/workspace', label: 'Scripts', icon: Files, end: true },
  { to: '/workspace/links', label: 'Submission links', icon: Link2 },
  { to: '/workspace/rubric', label: 'Rubrics', icon: ClipboardList },
  { to: '/workspace/class', label: 'Class picture', icon: BarChart3 },
  { to: '/practice', label: 'Practice', icon: BookOpen },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]

export function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { workspace, commit, error, reload } = useWorkspace()
  const [pendingFile, setPendingFile] = useState<File>()
  const [text, setText] = useState<DeviceStatus>('unavailable')
  const [image, setImage] = useState<DeviceStatus>('unavailable')
  const [online, setOnline] = useState(navigator.onLine)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const deviceReady = configured && text === 'available'
  const imageReady = configured && image === 'available'
  const active = sideLinks.find((item) => item.to !== '/workspace' && location.pathname.startsWith(item.to))
  const inSample = location.pathname.startsWith('/sample')
  const inAuth = location.pathname === '/login' || location.pathname === '/signup'
  const inWorkspace = !inSample && !inAuth && location.pathname.startsWith('/workspace')
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

  if (location.pathname.startsWith('/submit/')) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/submit/:linkId" element={<StudentSubmit />} />
        </Routes>
      </ErrorBoundary>
    )
  }

  return <div className={'app-shell' + (keyboardOpen ? ' keyboard-open' : '')}>
    <a className="skip-link" href="#content">Skip to content</a>
    <aside className="sidebar" aria-label="Main navigation">
      <Link to="/" className="brand">
        <img src="/mark.svg" alt="" width={40} height={40} /><span>Marking Assistant</span>
      </Link>
      {workspace && !inSample && (
        <ProjectSwitcher workspace={workspace} commit={commit} />
      )}
      <nav className="side-nav">
        <small>Workspace</small>
        {sideLinks.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) =>
          'nav-link' + (isActive || (to === '/workspace' && !active && !inSample && !inAuth) ? ' selected' : '')}>
          <Icon size={19} strokeWidth={1.8} />{label}
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/login" className={({ isActive }) => 'nav-link' + (isActive ? ' selected' : '')}>
          {user ? <UserCircle2 size={18} /> : <LogIn size={18} />}
          <span className="truncate-label">{user ? (user.displayName || user.email || 'Account') : 'Sign in'}</span>
        </NavLink>
        <NavLink to="/sample" className="nav-link sample-link"><FlaskConical size={18} />Try sample</NavLink>
        <div className="privacy-card"><span><ShieldCheck size={18} />Private workspace</span><p>Scripts and marks are saved in this browser.</p></div>
      </div>
    </aside>
    <div className="app-body">
      <header className="topbar">
        <Link to="/" className="brand mobile-brand"><img src="/mark.svg" alt="" width={33} height={33} /><span>Marking Assistant</span></Link>
        <div className="breadcrumbs">
          <span>{inWorkspace && currentProject ? currentProject.name : 'Workspace'}</span>
          <ChevronRight size={15} aria-hidden="true" />
          <strong>{inSample ? 'Sample' : inAuth ? 'Account' : active?.label ?? 'Scripts'}</strong>
        </div>
        <div className="topbar-actions">
          <Link to="/settings" className="privacy-pill">
            {online ? <LockKeyhole size={14} /> : <WifiOff size={15} />}
            {online ? 'Local workspace' : 'Offline'}
          </Link>
          <Link to="/login" className="account-chip" aria-label={user ? 'Manage account' : 'Sign in'}>
            {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : user ? <UserCircle2 size={16} /> : <LogIn size={15} />}
            <span>{user ? (user.displayName?.split(' ')[0] || 'Account') : 'Sign in'}</span>
          </Link>
        </div>
      </header>
      <main id="content" className="content">
        {workspace && inWorkspace && location.pathname !== '/workspace/projects' && (
          <ProjectBar workspace={workspace} commit={commit} />
        )}
        {inSample ? <Suspense fallback={<Loading>Opening the sample…</Loading>}><Sample
          deviceReady={deviceReady}
          imageReady={imageReady}
          allowCloud={workspace?.allowCloud ?? false}
          onAllowCloud={workspace ? () => commit((current) => ({ ...current, allowCloud: true })) : undefined}
        /></Suspense> :
          inAuth ? <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage />} />
          </Routes> :
          error ? <div className="panel form-panel"><Notice error>{error}</Notice><button className="button secondary" onClick={reload}>Retry local storage</button></div> :
            !workspace ? <Loading>Opening your workspace…</Loading> :
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Navigate to="/workspace" replace />} />
                  <Route path="/workspace" element={<Dashboard workspace={workspace} onFile={(file) => {
                    setPendingFile(file)
                    navigate('/workspace/capture')
                  }} />} />
                  <Route path="/workspace/projects" element={<Projects workspace={workspace} commit={commit} base="/workspace" />} />
                  <Route path="/workspace/links" element={<SubmissionLinks workspace={workspace} commit={commit} deviceReady={deviceReady} />} />
                  <Route path="/workspace/capture" element={<Capture key={location.search} initialFile={pendingFile}
                    consumeFile={() => setPendingFile(undefined)} workspace={workspace} commit={commit} />} />
                  <Route path="/workspace/rubric" element={<Rubrics workspace={workspace} commit={commit} deviceReady={deviceReady} imageReady={imageReady} />} />
                  <Route path="/workspace/scripts/:id" element={<ReviewRoute workspace={workspace} commit={commit} deviceReady={deviceReady} imageReady={imageReady} textStatus={text} imageStatus={image} refreshDevice={refresh} base="/workspace" />} />
                  <Route path="/workspace/scripts/:id/feedback" element={<FeedbackRoute workspace={workspace} commit={commit} deviceReady={deviceReady} base="/workspace" />} />
                  <Route path="/workspace/class" element={<ClassPicture workspace={workspace} base="/workspace" />} />
                  <Route path="/practice" element={<Practice deviceReady={deviceReady} allowCloud={workspace.allowCloud} />} />
                  <Route path="/settings" element={<Settings workspace={workspace} commit={commit} text={text} image={image} refresh={refresh} />} />
                  <Route path="*" element={<Navigate to="/workspace" replace />} />
                </Routes>
              </ErrorBoundary>}
        <footer className="mobile-footer"><Link to="/sample"><FlaskConical size={16} />Try sample</Link></footer>
      </main>
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {mobileLinks.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) =>
        isActive || (to === '/workspace' && !active && !inSample && !inAuth) ? 'selected' : ''}>
        <Icon size={19} strokeWidth={1.8} /><span>{label === 'Class picture' ? 'Class' : label}</span>
      </NavLink>)}
    </nav>
  </div>
}
