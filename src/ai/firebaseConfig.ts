export type FirebaseEnv = {
  VITE_FIREBASE_API_KEY?: string
  VITE_FIREBASE_PROJECT_ID?: string
  VITE_FIREBASE_APP_ID?: string
  VITE_FIREBASE_AUTH_DOMAIN?: string
  VITE_FIREBASE_STORAGE_BUCKET?: string
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  VITE_FIREBASE_APP_CHECK_SITE_KEY?: string
  VITE_FIREBASE_CLOUD_MODEL?: string
}

export type FirebaseAppletConfig = {
  apiKey?: string
  projectId?: string
  appId?: string
  authDomain?: string
  storageBucket?: string
  messagingSenderId?: string
  recaptchaSiteKey?: string
}

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function senderIdFromAppId(appId: string | undefined): string | undefined {
  if (!appId) return undefined
  const parts = appId.split(':')
  return parts.length >= 2 && /^\d+$/.test(parts[1]) ? parts[1] : undefined
}

/**
 * Resolves Firebase Web SDK config from Vite environment variables with fallback to
 * `firebase-applet-config.json`.
 *
 * When `VITE_FIREBASE_PROJECT_ID` targets a different project than `firebase-applet-config.json`,
 * fields from the applet config file are intentionally ignored so `authDomain`, `storageBucket`,
 * `messagingSenderId`, and App Check keys can never drift across projects.
 */
export function resolveFirebaseConfig(env: FirebaseEnv, appletConfig: FirebaseAppletConfig) {
  const envProjectId = clean(env.VITE_FIREBASE_PROJECT_ID)
  const fileProjectId = clean(appletConfig.projectId)
  const projectId = envProjectId ?? fileProjectId
  const sameProjectAsFile = Boolean(projectId && fileProjectId && projectId === fileProjectId)

  const apiKey = clean(env.VITE_FIREBASE_API_KEY) ?? (sameProjectAsFile ? clean(appletConfig.apiKey) : undefined)
  const appId = clean(env.VITE_FIREBASE_APP_ID) ?? (sameProjectAsFile ? clean(appletConfig.appId) : undefined)
  const authDomain =
    clean(env.VITE_FIREBASE_AUTH_DOMAIN) ??
    (sameProjectAsFile ? clean(appletConfig.authDomain) : undefined) ??
    (projectId ? `${projectId}.firebaseapp.com` : undefined)
  const storageBucket =
    clean(env.VITE_FIREBASE_STORAGE_BUCKET) ??
    (sameProjectAsFile ? clean(appletConfig.storageBucket) : undefined) ??
    (projectId ? `${projectId}.firebasestorage.app` : undefined)
  const messagingSenderId =
    clean(env.VITE_FIREBASE_MESSAGING_SENDER_ID) ??
    (sameProjectAsFile ? clean(appletConfig.messagingSenderId) : undefined) ??
    senderIdFromAppId(appId)
  const siteKey =
    clean(env.VITE_FIREBASE_APP_CHECK_SITE_KEY) ??
    (sameProjectAsFile ? clean(appletConfig.recaptchaSiteKey) : undefined)
  const cloudModel = clean(env.VITE_FIREBASE_CLOUD_MODEL) ?? 'gemini-3.5-flash-lite'

  return {
    config: {
      apiKey,
      projectId,
      appId,
      authDomain,
      storageBucket,
      messagingSenderId,
    },
    siteKey,
    cloudModel,
  }
}
