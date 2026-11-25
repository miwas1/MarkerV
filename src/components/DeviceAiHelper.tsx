import { Check, Copy, HardDrive, RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { configured, setupDevice, type DeviceStatus } from '../ai/firebase'
import { Loading, Notice, useAction } from '../ui'

type EnvironmentKind = 'mobile' | 'non-chrome' | 'chrome'

function detectEnvironment(): EnvironmentKind {
  const ua = navigator.userAgent
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  if (mobile) return 'mobile'
  const isChrome = /Chrome\//.test(ua) && !/Edg\/|OPR\/|Brave/i.test(ua)
  return isChrome ? 'chrome' : 'non-chrome'
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="copy-flag-row">
      <div>
        <small className="muted">{label}</small>
        <code>{value}</code>
      </div>
      <button
        type="button"
        className="button subtle compact-btn"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1800)
          })
        }}
      >
        {copied ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy</>}
      </button>
    </div>
  )
}

export function DeviceAiHelper({
  text,
  image,
  refresh,
  compact = false,
}: {
  text: DeviceStatus
  image: DeviceStatus
  refresh: () => Promise<void>
  compact?: boolean
}) {
  const [progress, setProgress] = useState<number>()
  const [stage, setStage] = useState('')
  const { run, busy, error } = useAction()
  const env = detectEnvironment()
  const bothReady = text === 'available' && image === 'available'
  const canDownloadAny = configured && (text === 'downloadable' || image === 'downloadable')
  const isDownloading = text === 'downloading' || image === 'downloading'

  function enableAll() {
    void run(async (active) => {
      setProgress(0)
      try {
        if (text === 'downloadable') {
          setStage('Downloading on-device text model…')
          await setupDevice(false, (value) => { if (active()) setProgress(Math.min(1, Math.max(0, value))) })
        }
        if (active() && image === 'downloadable') {
          setStage('Downloading on-device photo model…')
          setProgress(0)
          await setupDevice(true, (value) => { if (active()) setProgress(Math.min(1, Math.max(0, value))) })
        }
      } catch {
        throw new Error('Could not download Chrome’s on-device model. Ensure you have at least 22 GB free storage and a stable connection.')
      } finally {
        if (active()) {
          setProgress(undefined)
          setStage('')
          await refresh()
        }
      }
    })
  }

  if (bothReady && compact) return null

  return (
    <div className={compact ? 'device-helper compact' : 'device-helper'}>
      {canDownloadAny && (
        <div className="helper-cta">
          <div>
            <strong><Sparkles size={16} className="inline-icon" />On-device AI is ready to download</strong>
            <p className="muted">One click downloads Chrome’s local model so handwriting transcription and marking work privately offline.</p>
          </div>
          <button type="button" className="button primary" disabled={busy} onClick={enableAll}>
            <HardDrive size={16} />{busy ? 'Setting up…' : 'Enable on-device AI'}
          </button>
        </div>
      )}

      {progress !== undefined && (
        <>
          <Loading>{stage || 'Preparing the device model…'}</Loading>
          <progress value={progress} max={1} aria-label="Device model download" />
        </>
      )}

      {isDownloading && progress === undefined && (
        <Loading>Chrome is downloading the on-device AI model in the background…</Loading>
      )}

      {error && <Notice error>{error}</Notice>}

      {!bothReady && !canDownloadAny && !isDownloading && (
        env === 'mobile' ? (
          <Notice>
            On-device AI marking requires desktop Google Chrome. You can capture photos, import files, and use Cloud/Hybrid AI on this device.
          </Notice>
        ) : env === 'non-chrome' ? (
          <Notice>
            On-device AI marking requires desktop Google Chrome. You can still mark manually or enable Cloud AI for rubric drafting, rubric audits, and class teaching plans.
          </Notice>
        ) : (
          <details className="scoring-details" open={!compact}>
            <summary>Enable Chrome Built-in AI</summary>
            <div className="helper-steps">
              <p className="muted">
                Chrome’s built-in Prompt API is available in current desktop Chrome without an origin trial token. Update Chrome first; if it still reports unavailable on your build, enable these flags once:
              </p>
              <ol className="helper-ol">
                <li>Update desktop Google Chrome to the latest version and reload this page.</li>
                <li>If still unavailable, open <code>chrome://flags</code>, set the flags below to <strong>Enabled</strong>, and click <strong>Relaunch</strong>.</li>
                <li>Return here and click <strong>Re-check Chrome AI</strong> (inspect <code>chrome://on-device-internals</code> if model download is pending).</li>
              </ol>
              <div className="copy-flag-list">
                <CopyRow label="1. Flags page" value="chrome://flags" />
                <CopyRow label="2. Text model flag" value="Gemma 4 for Built-in AI" />
                <CopyRow label="3. Photo / handwriting flag" value="Prompt API for Gemini Nano with Multimodal Input" />
                <CopyRow label="Diagnostics page" value="chrome://on-device-internals" />
              </div>
              <div className="button-row">
                <button type="button" className="button secondary" disabled={busy} onClick={() => { void run(async () => refresh()) }}>
                  <RefreshCw size={15} />Re-check Chrome AI
                </button>
              </div>
            </div>
          </details>
        )
      )}
    </div>
  )
}
