import type { AiCallRecord, AiCallSource } from './aiLog.ts'
import type { AiRouteDecision, AiTask } from './aiRouting.ts'

/**
 * The order in which a request tries the on-device and cloud models, with no Firebase or
 * browser dependency. `src/ai/firebase.ts` supplies the real model calls; the tests supply
 * fakes, which is how the privacy boundary is checked without a browser.
 */

export type AiAttempt = { value: unknown; source: AiCallSource; ms: number }
export type AiRunResult = AiAttempt & { cloudBytes: number }

export type AiRun = {
  task: AiTask
  route: AiRouteDecision
  /** True when the request uses only bundled fictional material. */
  fictional: boolean
  /** False once the lecturer cancels or the inputs change. */
  active: () => boolean
  /** Runs the on-device model. It must make no network request. */
  device: () => Promise<AiAttempt>
  /** Cloud policy checks (lecturer opt-in, Remote Config, App Check). Its errors are shown as they are. */
  cloudPreflight: () => Promise<void>
  /** Sends the request to the cloud model. `afterDeviceError` is true when it retries a failed device run. */
  cloud: (afterDeviceError: boolean) => Promise<AiAttempt>
  /** Prompt text and image bytes the cloud request carries. */
  cloudBytes: number
  /** Turns a failed cloud request into a message that is safe to show. */
  cloudError: (error: unknown) => Error
  record: (entry: Omit<AiCallRecord, 'id' | 'at'>) => void
}

const cancelled = () => new Error('Generation cancelled.')
const deviceFailure = () => new Error('On-device AI could not complete this request. Try again or continue manually.')

function assertRunnable(route: AiRouteDecision) {
  if (!route.canRun) throw new Error(route.blockedReason ?? 'AI is unavailable for this request.')
}

/** Runs the on-device model and refuses a reply that did not come from the device. */
async function deviceAttempt(run: AiRun, fallback?: AiCallRecord['fallback']): Promise<AiRunResult> {
  const { task, route, fictional } = run
  const started = performance.now()
  try {
    const attempt = await run.device()
    if (attempt.source === 'cloud') throw new Error('Unexpected inference source.')
    run.record({ task, mode: route.mode, source: attempt.source, ms: attempt.ms, ok: true, cloudBytes: 0, fictional, fallback })
    return { ...attempt, cloudBytes: 0 }
  } catch (error) {
    if (!run.active()) throw cancelled()
    run.record({ task, mode: route.mode, source: 'device', ms: performance.now() - started, ok: false, cloudBytes: 0, fictional })
    throw error
  }
}

/**
 * `ONLY_ON_DEVICE`, `PREFER_ON_DEVICE` and `ONLY_IN_CLOUD` requests.
 *
 * The device runs first whenever the route says so. The cloud is contacted only when the route
 * permits it: for private student work it never is, even when the device run fails.
 */
export async function runDeviceFirst(run: AiRun): Promise<AiRunResult> {
  const { task, route, fictional, cloudBytes } = run
  assertRunnable(route)

  let deviceFailed = false
  if (route.tryDeviceFirst) {
    try {
      return await deviceAttempt(run)
    } catch (error) {
      if (!run.active()) throw cancelled()
      if (!route.retryCloudOnDeviceError) {
        // A malformed reply keeps its type so callers can retry the format once.
        if (error instanceof SyntaxError) throw error
        throw deviceFailure()
      }
      deviceFailed = true
    }
  }

  if (!route.allowCloudFallback) {
    throw new Error(route.blockedReason ?? 'Cloud AI is not permitted for this request.')
  }
  await run.cloudPreflight()
  if (!run.active()) throw cancelled()

  const fallback = route.mode === 'PREFER_ON_DEVICE' ? (deviceFailed ? 'device-error' : 'device-unavailable') : undefined
  const started = performance.now()
  try {
    const attempt = await run.cloud(deviceFailed)
    run.record({ task, mode: route.mode, source: attempt.source, ms: attempt.ms, ok: true, cloudBytes, fictional, fallback })
    return { ...attempt, cloudBytes: attempt.source === 'device' ? 0 : cloudBytes }
  } catch (error) {
    run.record({ task, mode: route.mode, source: 'cloud', ms: performance.now() - started, ok: false, cloudBytes, fictional, fallback })
    if (error instanceof SyntaxError) throw error
    throw run.cloudError(error)
  }
}

/**
 * `PREFER_IN_CLOUD` requests, which carry no student data.
 *
 * The cloud runs first when the route permits it. When cloud AI is off or offline, or the
 * cloud request fails, the on-device model takes over if the route allows it.
 */
export async function runCloudFirst(run: AiRun): Promise<AiRunResult> {
  const { task, route, fictional, cloudBytes } = run
  assertRunnable(route)

  if (route.allowCloudFallback) {
    let sent = false
    const started = performance.now()
    try {
      await run.cloudPreflight()
      if (!run.active()) throw cancelled()
      sent = true
      const attempt = await run.cloud(false)
      // For some cloud errors the SDK itself hands the request to the on-device model.
      const onDevice = attempt.source === 'device'
      run.record({ task, mode: route.mode, source: attempt.source, ms: attempt.ms, ok: true, cloudBytes, fictional, fallback: onDevice ? 'cloud-error' : undefined })
      return { ...attempt, cloudBytes: onDevice ? 0 : cloudBytes }
    } catch (error) {
      if (!run.active()) throw cancelled()
      run.record({ task, mode: route.mode, source: 'cloud', ms: performance.now() - started, ok: false, cloudBytes: sent ? cloudBytes : 0, fictional })
      if (error instanceof SyntaxError) throw error
      // A policy check that fails before anything is sent already explains itself.
      if (!route.allowDeviceFallback) throw sent ? run.cloudError(error) : error
    }
  }

  try {
    return await deviceAttempt(run, route.allowCloudFallback ? 'cloud-error' : 'cloud-unavailable')
  } catch (error) {
    if (!run.active()) throw cancelled()
    if (error instanceof SyntaxError) throw error
    throw deviceFailure()
  }
}
