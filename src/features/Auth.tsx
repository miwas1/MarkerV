import { KeyRound, Link2, LogIn, LogOut, Mail, ShieldCheck, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const nextPath = (location.state as { from?: string } | null)?.from || '/workspace'

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
          {user.photoURL ? (
            <img className="account-avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="empty-icon"><ShieldCheck size={24} /></span>
          )}
          <div>
            <strong>{user.displayName || 'Lecturer'}</strong>
            <p className="muted">{user.email}</p>
          </div>
        </div>

        <Notice>
          Your lecturer account is ready to generate unique student submission links and receive submissions securely.
        </Notice>

        {error && <Notice error>{error}</Notice>}

        <div className="button-row">
          <Link className="button primary" to="/workspace/links"><Link2 size={16} />Submission links</Link>
          <Link className="button secondary" to="/workspace">Open workspace</Link>
          <button
            type="button"
            className="button subtle"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void signOut().finally(() => setBusy(false))
            }}
          >
            <LogOut size={16} />Sign out
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
          <h1>{mode === 'signup' ? 'Create lecturer account' : mode === 'reset' ? 'Reset password' : 'Lecturer sign in'}</h1>
          <p className="muted">
            {mode === 'signup'
              ? 'Create an account with your email and password to publish unique student submission links.'
              : mode === 'reset'
                ? 'Enter your email address and we will send a password reset link.'
                : 'Sign in with your email and password to manage submission links and review incoming student work.'}
          </p>
        </div>
      </div>

      {mode !== 'reset' && (
        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-pressed={mode === 'signin'} onClick={() => { setMode('signin'); setError(''); setInfo('') }}>
            <LogIn size={15} />Sign in
          </button>
          <button type="button" role="tab" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setError(''); setInfo('') }}>
            <UserPlus size={15} />Create account
          </button>
        </div>
      )}

      <form className="form-panel embedded" onSubmit={(event) => { void handleSubmit(event) }}>
        {mode === 'signup' && (
          <label className="field">
            <span>Full name</span>
            <input
              type="text"
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
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@university.edu"
            required
          />
        </label>

        {mode !== 'reset' && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
              minLength={6}
              required
            />
          </label>
        )}

        {mode === 'signup' && (
          <label className="field">
            <span>Confirm password</span>
            <input
              type="password"
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
            {mode === 'signup' ? <><UserPlus size={16} />Create account</> :
              mode === 'reset' ? <><Mail size={16} />Send reset link</> :
                <><KeyRound size={16} />Sign in with email</>}
          </button>
          {mode === 'signin' && (
            <button type="button" className="button subtle" disabled={busy} onClick={() => { setMode('reset'); setError(''); setInfo('') }}>
              Forgot password?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="button subtle" disabled={busy} onClick={() => { setMode('signin'); setError(''); setInfo('') }}>
              Back to sign in
            </button>
          )}
        </div>
      </form>

      <div className="auth-footer">
        <Link className="text-link" to="/workspace">Continue locally without signing in</Link>
      </div>
    </section>
  )
}
