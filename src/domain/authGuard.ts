/**
 * Pure route-access and safe redirect helpers for the email/password auth boundary.
 *
 * - `/workspace` and `/workspace/*` require a signed-in lecturer account.
 * - `/`, `/sample` (and `/demo`), `/practice`, `/inspector`, `/settings`, `/submit/*`,
 *   `/login`, and `/signup` remain accessible outside the private workspace.
 */

export function isProtectedWorkspacePath(pathname: string): boolean {
  return pathname === '/workspace' || pathname.startsWith('/workspace/')
}

export function isDemoPath(pathname: string): boolean {
  return (
    pathname === '/sample' ||
    pathname.startsWith('/sample/') ||
    pathname === '/demo' ||
    pathname.startsWith('/demo/')
  )
}

/**
 * Validates the post-auth redirect target so login/signup can never open-redirect
 * to an external URL or loop back to an auth page.
 */
export function resolvePostAuthPath(from: unknown): string {
  if (typeof from !== 'string') return '/workspace'
  const trimmed = from.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return '/workspace'
  }
  if (trimmed === '/login' || trimmed.startsWith('/login?') || trimmed === '/signup' || trimmed.startsWith('/signup?')) {
    return '/workspace'
  }
  return trimmed
}
