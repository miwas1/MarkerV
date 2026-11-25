export type AiTask =
  | 'transcribe'
  | 'mark'
  | 'draftFeedback'
  | 'followUp'
  | 'draftRubric'
  | 'readRubricPhoto'
  | 'draftPracticeQuestions'
  | 'auditRubric'
  | 'teachingSummary'
  | 'compareSample'
  | 'benchmark'
  | 'draftMarkingBrief'

export type AiRouteMode = 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'ONLY_IN_CLOUD' | 'PREFER_IN_CLOUD'

export type AiRouteInput = {
  task: AiTask
  /** True only for the built-in fictional CS201 sample workspace. */
  isSample: boolean
  /** True when Chrome Built-in AI reports 'available' for the required modality. */
  deviceAvailable: boolean
  /** True when the lecturer toggled "Allow cloud AI" on in Settings. */
  allowCloud: boolean
  /** True when Firebase config + App Check site key are configured. */
  cloudConfigured: boolean
  /** True when navigator.onLine is true. */
  online: boolean
}

export type AiRouteDecision = {
  /** Firebase AI Logic InferenceMode tier assigned by data sensitivity policy. */
  mode: AiRouteMode
  /** Whether the request can execute right now under current browser/network state. */
  canRun: boolean
  /** Whether local on-device Gemini Nano should be attempted first (zero network calls). */
  tryDeviceFirst: boolean
  /** Whether Cloud Gemini fallback (or cloud-only execution) is permitted right now. */
  allowCloudFallback: boolean
  /** Whether a cloud call may retry if on-device execution throws or returns invalid JSON. */
  retryCloudOnDeviceError: boolean
  /** Cloud-first tasks only: whether the on-device model may take over if the cloud request fails. */
  allowDeviceFallback?: boolean
  /** Human-readable reason when canRun is false. */
  blockedReason?: string
}

const PRIVATE_ONLY_TASKS: ReadonlySet<AiTask> = new Set([
  'transcribe',
  'mark',
  'draftFeedback',
  'followUp',
])

const CLOUD_ONLY_TASKS: ReadonlySet<AiTask> = new Set([
  'auditRubric',
  'teachingSummary',
  'compareSample',
  // Cloud baseline for the benchmark. It accepts only the ID of a bundled fictional answer.
  'benchmark',
])

/** Tasks that carry no student data and are better written by the larger cloud model. */
const CLOUD_FIRST_TASKS: ReadonlySet<AiTask> = new Set([
  'draftMarkingBrief',
])

/**
 * Pure hybrid routing policy for Firebase AI Logic.
 *
 * 1. Real private student scripts, marks, feedback, and student practice replies
 *    always stay strictly `ONLY_ON_DEVICE` — zero cloud fallback, zero network calls.
 * 2. Fictional sample workspace tasks and non-student rubric authoring tasks use
 *    `PREFER_ON_DEVICE`: attempt on-device Gemini Nano first with zero network overhead,
 *    falling back (or retrying on local error) to Cloud Gemini only when cloud AI is
 *    configured, opted-in, and online.
 * 3. High-reasoning pedagogy tasks (rubric reliability audit, aggregate cohort teaching
 *    plans, fictional second-opinion comparison) use `ONLY_IN_CLOUD` behind explicit
 *    payload preview, App Check, and Remote Config.
 * 4. The marking brief (key points drafted from the rubric alone, never from student work)
 *    uses `PREFER_IN_CLOUD`: the cloud model writes it when the lecturer has opted in, and
 *    the on-device model takes over when cloud AI is off, offline, or the request fails.
 */
export function selectAiRoute(input: AiRouteInput): AiRouteDecision {
  const cloudReady = input.allowCloud && input.cloudConfigured && input.online

  if (CLOUD_ONLY_TASKS.has(input.task)) {
    if (cloudReady) {
      return {
        mode: 'ONLY_IN_CLOUD',
        canRun: true,
        tryDeviceFirst: false,
        allowCloudFallback: true,
        retryCloudOnDeviceError: false,
      }
    }
    return {
      mode: 'ONLY_IN_CLOUD',
      canRun: false,
      tryDeviceFirst: false,
      allowCloudFallback: false,
      retryCloudOnDeviceError: false,
      blockedReason: !input.online
        ? 'Cloud AI requires an internet connection.'
        : !input.cloudConfigured
          ? 'Firebase App Check is not configured for Cloud AI.'
          : 'Enable Cloud AI in Settings to run this cloud task.',
    }
  }

  if (CLOUD_FIRST_TASKS.has(input.task)) {
    const canRun = cloudReady || input.deviceAvailable
    return {
      mode: 'PREFER_IN_CLOUD',
      canRun,
      // Without cloud permission the request goes straight to the on-device model.
      tryDeviceFirst: !cloudReady && input.deviceAvailable,
      allowCloudFallback: cloudReady,
      retryCloudOnDeviceError: false,
      allowDeviceFallback: cloudReady && input.deviceAvailable,
      blockedReason: canRun
        ? undefined
        : !input.cloudConfigured
          ? 'Set up on-device AI in compatible desktop Chrome, or configure App Check for Cloud AI.'
          : !input.allowCloud
            ? 'Enable Cloud AI in Settings, or set up on-device AI in desktop Chrome.'
            : 'Connect to the internet, or set up on-device AI in desktop Chrome.',
    }
  }

  // Real student work & real student practice never fall back to cloud AI.
  if (PRIVATE_ONLY_TASKS.has(input.task) && !input.isSample) {
    return {
      mode: 'ONLY_ON_DEVICE',
      canRun: input.deviceAvailable,
      tryDeviceFirst: input.deviceAvailable,
      allowCloudFallback: false,
      retryCloudOnDeviceError: false,
      blockedReason: input.deviceAvailable
        ? undefined
        : 'Set up on-device AI in compatible desktop Chrome, or continue manually.',
    }
  }

  // Non-student rubric authoring + fictional sample workspace use local-first hybrid routing.
  const canRun = input.deviceAvailable || cloudReady
  return {
    mode: 'PREFER_ON_DEVICE',
    canRun,
    tryDeviceFirst: input.deviceAvailable,
    allowCloudFallback: cloudReady,
    retryCloudOnDeviceError: input.deviceAvailable && cloudReady,
    blockedReason: canRun
      ? undefined
      : !input.cloudConfigured
        ? 'Set up on-device AI in compatible desktop Chrome, or configure App Check for cloud fallback.'
        : !input.allowCloud
          ? 'Set up on-device AI in desktop Chrome, or enable Cloud AI in Settings to use hybrid fallback.'
          : 'Cloud fallback requires an internet connection when on-device AI is unavailable.',
  }
}

export function canRunAiRoute(input: AiRouteInput): boolean {
  return selectAiRoute(input).canRun
}
