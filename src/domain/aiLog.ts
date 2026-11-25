import type { AiRouteMode, AiTask } from './aiRouting.ts'

export type AiCallSource = 'device' | 'cloud' | 'unknown'

/**
 * One AI request as shown in the inspector. It records where the request ran and how long it
 * took. It never holds prompt text, answers, images or model replies.
 */
export type AiCallRecord = {
  id: number
  at: number
  task: AiTask
  /** The inference mode the routing policy assigned to this request. */
  mode: AiRouteMode
  /** Where the request actually ran, as reported by Firebase AI Logic. */
  source: AiCallSource
  ms: number
  ok: boolean
  /** Prompt text and image bytes sent to the cloud model. Always 0 when the request ran on this device. */
  cloudBytes: number
  /**
   * Set when a request ran somewhere other than its first choice: a device-first request that
   * ran in the cloud, or a cloud-first request that ran on the device.
   */
  fallback?: 'device-unavailable' | 'device-error' | 'cloud-unavailable' | 'cloud-error'
  /** True when the request used only bundled fictional material (sample workspace or benchmark). */
  fictional: boolean
}

const LIMIT = 200
let records: readonly AiCallRecord[] = []
let nextId = 1
const listeners = new Set<() => void>()

function publish(next: readonly AiCallRecord[]) {
  records = next
  for (const listener of listeners) listener()
}

/** Adds a request to the session log. The log lives in memory only and is cleared on reload. */
export function recordAiCall(entry: Omit<AiCallRecord, 'id' | 'at'> & { at?: number }): AiCallRecord {
  const record: AiCallRecord = {
    ...entry,
    id: nextId++,
    at: entry.at ?? Date.now(),
    ms: Math.max(0, entry.ms),
    cloudBytes: entry.source === 'device' ? 0 : Math.max(0, Math.round(entry.cloudBytes)),
  }
  publish([...records, record].slice(-LIMIT))
  return record
}

export function readAiLog(): readonly AiCallRecord[] {
  return records
}

export function subscribeAiLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function clearAiLog() {
  publish([])
}

/** Nearest-rank percentile. Returns undefined for an empty list. */
export function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
}

export type AiCallSummary = {
  total: number
  device: number
  cloud: number
  failed: number
  /** Share of completed requests that ran on this device; undefined before any request completes. */
  onDeviceShare?: number
  cloudBytes: number
  deviceMedianMs?: number
  cloudMedianMs?: number
}

export function summariseCalls(calls: readonly AiCallRecord[]): AiCallSummary {
  const completed = calls.filter((call) => call.ok)
  const device = completed.filter((call) => call.source === 'device')
  const cloud = completed.filter((call) => call.source === 'cloud')
  const located = device.length + cloud.length
  return {
    total: calls.length,
    device: device.length,
    cloud: cloud.length,
    failed: calls.length - completed.length,
    onDeviceShare: located ? device.length / located : undefined,
    cloudBytes: calls.reduce((sum, call) => sum + call.cloudBytes, 0),
    deviceMedianMs: percentile(device.map((call) => call.ms), 50),
    cloudMedianMs: percentile(cloud.map((call) => call.ms), 50),
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return Math.round(bytes) + ' B'
  if (bytes < 1_000_000) return (bytes / 1000).toFixed(1) + ' kB'
  return (bytes / 1_000_000).toFixed(1) + ' MB'
}

export function formatSeconds(ms: number | undefined): string {
  return ms === undefined ? '–' : (ms / 1000).toFixed(1) + ' s'
}
