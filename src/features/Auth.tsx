import { Eye, EyeOff, FlaskConical, KeyRound, Link2, LogIn, LogOut, Mail, ShieldCheck, UserPlus } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth'
import { isProtectedWorkspacePath, resolvePostAuthPath } from '../domain/authGuard'
import { Loading, Notice } from '../ui'

type AuthMode = 'signin' | 'signup' | 'reset'

export function AuthPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading, signInWithEmail, signUpWithEmail, resetPassword, signOut } = useAuth()
  const [mode, setMode] = useState<AuthMode>(() => location.pathname === '/signup' ? 'signup' : 'signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const passwordHintId = useId()

  useEffect(() => {
    setMode(location.pathname === '/signup' ? 'signup' : 'signin')
    setError('')
    setInfo('')
  }, [location.pathname])

  const requestedFrom = (location.state as { from?: unknown } | null)?.from
  const redirectedFromWorkspace = typeof requestedFrom === 'string' && isProtectedWorkspacePath(requestedFrom)
  const nextPath = resolvePostAuthPath(requestedFrom)

  function switchMode(next: AuthMode) {
    setMode(next)
    setError('')
    setInfo('')
    if (next === 'signup' && location.pathname !== '/signup') {
      navigate('/signup', { replace: true, state: location.state })
    } else if (next === 'signin' && location.pathname !== '/login') {
      navigate('/login', { replace: true, state: location.state })
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setInfo('')
    if (!email.trim()) {
      setError('Enter your email address.')
      return
    }
    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Use a password with at least 6 characters.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
        navigate(nextPath, { replace: true })
      } else if (mode === 'signup') {
        await signUpWithEmail(name, email, password)
        navigate(nextPath, { replace: true })
      } else {
        await resetPassword(email)
        setInfo('Password reset email sent. Check your inbox and spam folder.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete authentication.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <section className="panel form-panel auth-card"><Loading>Checking your account…</Loading></section>
  }

  if (user) {
    return (
      <section className="panel form-panel auth-card">
        <div className="section-heading">
          <div>
            <h1>Account</h1>
            <p className="muted">Signed in to Marking Assistant</p>
          </div>
          <span className="lp-meta-line">Lecturer account</span>
        </div>

        <div className="account-profile">
          <span className="empty-icon"><ShieldCheck size={24} aria-hidden="true" /></span>
          <div>
            <strong>{user.displayName || 'Lecturer'}</strong>
            <p className="muted">{user.email}</p>
          </div>
        </div>

        <Notice>
          Your lecturer account unlocks your private marking workspace in this browser and lets you publish student submission links.
        </Notice>

        {error && <Notice error>{error}</Notice>}

        <div className="button-row">
          <Link className="button primary" to="/workspace">Open workspace</Link>
          <Link className="button secondary" to="/workspace/links"><Link2 size={16} aria-hidden="true" />Submission links</Link>
          <Link className="button secondary" to="/sample"><FlaskConical size={16} aria-hidden="true" />Live demo</Link>
          <button
            type="button"
            className="button subtle"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void signOut().finally(() => setBusy(false))
            }}
          >
            <LogOut size={16} aria-hidden="true" />Sign out
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="panel form-panel auth-card">
      <div className="auth-header">
        <img src="/mark.svg" alt="" width={42} height={42} />
        <div>
          <h1>{mode === 'signup' ? 'Create lecturer account' : mode === 'reset' ? 'Reset password' : 'Sign in to workspace'}</h1>
          <p className="muted">
            {mode === 'signup'
              ? 'Create your account with email and password to open your private marking workspace.'
              : mode === 'reset'
                ? 'Enter your email address and we will send a password reset link.'
                : 'Sign in with your email and password to access your private marking workspace.'}
          </p>
        </div>
      </div>

      {redirectedFromWorkspace && mode !== 'reset' && (
        <Notice>
          Your marking workspace requires an email and password account. Want to look around first?{' '}
          <Link to="/sample">Try the interactive demo</Link> without signing in.
        </Notice>
      )}

      {mode !== 'reset' && (
        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-selected={mode === 'signin'} aria-pressed={mode === 'signin'} onClick={() => switchMode('signin')}>
            <LogIn size={15} aria-hidden="true" />Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} aria-pressed={mode === 'signup'} onClick={() => switchMode('signup')}>
            <UserPlus size={15} aria-hidden="true" />Create account
          </button>
        </div>
      )}

      <form className="form-panel embedded" onSubmit={(event) => { void handleSubmit(event) }}>
        {mode === 'signup' && (
          <label className="field">
            <span>Full name</span>
            <input
              type="text"
              name="name"
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Dr. Ada Lovelace"
              required
            />
          </label>
        )}

        <label className="field">
          <span>Email address</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@university.edu"
            required
          />
        </label>

        {mode !== 'reset' && (
          <div className="field">
            <div className="password-label-row">
              <label htmlFor="auth-password">Password</label>
              <button
                type="button"
                className="button subtle compact-btn password-toggle-btn"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <><EyeOff size={14} aria-hidden="true" />Hide</> : <><Eye size={14} aria-hidden="true" />Show</>}
              </button>
            </div>
            <input
              id="auth-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              aria-describedby={mode === 'signup' ? passwordHintId : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
              minLength={6}
              required
            />
            {mode === 'signup' && (
              <span id={passwordHintId} className="field-hint">Use at least 6 characters.</span>
            )}
          </div>
        )}

        {mode === 'signup' && (
          <label className="field">
            <span>Confirm password</span>
            <input
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your password"
              minLength={6}
              required
            />
          </label>
        )}

        {error && <Notice error>{error}</Notice>}
        {info && <Notice>{info}</Notice>}

        <div className="button-row">
          <button type="submit" className="button primary" disabled={busy}>
            {mode === 'signup' ? <><UserPlus size={16} aria-hidden="true" />Create account</> :
              mode === 'reset' ? <><Mail size={16} aria-hidden="true" />Send reset link</> :
                <><KeyRound size={16} aria-hidden="true" />Sign in with email</>}
          </button>
          {mode === 'signin' && (
            <button type="button" className="button subtle" disabled={busy} onClick={() => switchMode('reset')}>
              Forgot password?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="button subtle" disabled={busy} onClick={() => switchMode('signin')}>
              Back to sign in
            </button>
          )}
        </div>
      </form>

      <div className="auth-footer">
        <Link className="text-link" to="/sample">
          <FlaskConical size={15} aria-hidden="true" />Explore interactive demo without signing in
        </Link>
      </div>
    </section>
  )
}
