import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { configured, getFirebaseApp } from '../ai/firebase'

function getFirebaseAuth(): Auth {
  if (!configured) throw new Error('Firebase is not configured for authentication.')
  return getAuth(getFirebaseApp())
}

export function formatAuthError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''
  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.'
    case 'auth/weak-password':
      return 'Use a password with at least 6 characters.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.'
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled in Firebase Console yet. Enable Email/Password under Authentication → Sign-in method.'
    case 'auth/unauthorized-domain': {
      const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'This domain'
      return `${host} is not authorized in Firebase Authentication settings yet. Add it under Authentication → Settings → Authorized domains.`
    }
    case 'auth/network-request-failed':
      return 'Network error while signing in. Check your connection and try again.'
    default:
      return error instanceof Error ? error.message : 'Sign-in could not be completed. Try again.'
  }
}

type AuthContextValue = {
  user: User | null
  loading: boolean
  signInWithEmail: (email: string, password: string) => Promise<User>
  signUpWithEmail: (name: string, email: string, password: string) => Promise<User>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }
    const auth = getFirebaseAuth()
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth()
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password)
      setUser(result.user)
      return result.user
    } catch (error) {
      throw new Error(formatAuthError(error))
    }
  }, [])

  const signUpWithEmail = useCallback(async (name: string, email: string, password: string) => {
    const auth = getFirebaseAuth()
    try {
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password)
      if (name.trim()) {
        await updateProfile(result.user, { displayName: name.trim() })
      }
      setUser({ ...result.user, displayName: name.trim() || result.user.displayName } as User)
      return result.user
    } catch (error) {
      throw new Error(formatAuthError(error))
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const auth = getFirebaseAuth()
    try {
      await sendPasswordResetEmail(auth, email.trim())
    } catch (error) {
      throw new Error(formatAuthError(error))
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!configured) return
    const auth = getFirebaseAuth()
    await firebaseSignOut(auth)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    signOut,
  }), [user, loading, signInWithEmail, signUpWithEmail, resetPassword, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider.')
  return ctx
}
