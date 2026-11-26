import { Check, CheckCircle2, Copy, HardDrive, RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { configured, setupDevice, type DeviceStatus } from '../ai/firebase'
import { Loading, Notice, useAction } from '../ui'

type EnvironmentKind = 'mobile' | 'non-chrome' | 'chrome'

const STATUS_LABELS: Record<DeviceStatus, string> = {
  available: 'Ready',
  downloadable: 'Download available',
  downloading: 'Downloading…',
  unavailable: 'Unavailable in this browser',
}

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
        {copied ? <><Check size={14} aria-hidden="true" />Copied</> : <><Copy size={14} aria-hidden="true" />Copy</>}
      </button>
    </div>
  )
}

export function DeviceAiHelper({
  text,
  image,
  refresh,
  compact = false,
  showStatusRows = false,
}: {
  text: DeviceStatus
  image: DeviceStatus
  refresh: () => Promise<void>
  compact?: boolean
  showStatusRows?: boolean
}) {
  const [progress, setProgress] = useState<number>()
  const [stage, setStage] = useState('')
  const { run, busy, error } = useAction()
  const env = detectEnvironment()
  const textReady = configured && text === 'available'
  const imageReady = configured && image === 'available'
  const bothReady = textReady && imageReady
  const canDownloadText = configured && text === 'downloadable'
  const canDownloadImage = configured && image === 'downloadable'
  const canDownloadAny = canDownloadText || canDownloadImage
  const isDownloading = text === 'downloading' || image === 'downloading'

  function downloadModel(target: 'all' | 'text' | 'image') {
    void run(async (active) => {
      setProgress(0)
      try {
        if ((target === 'all' || target === 'text') && text === 'downloadable') {
          setStage('Downloading on-device text model…')
          await setupDevice(false, (value) => { if (active()) setProgress(Math.min(1, Math.max(0, value))) })
        }
        if (active() && (target === 'all' || target === 'image') && image === 'downloadable') {
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

  // In compact inline slots (e.g. typed review), once text AI is ready, don't show a setup wall.
  if (compact && textReady) return null

  const needsTextFlag = !textReady && !canDownloadText && text !== 'downloading'
  const needsPhotoFlagOnly = textReady && !imageReady && !canDownloadImage && image !== 'downloading'

  return (
    <div className={compact ? 'device-helper compact' : 'device-helper'}>
      {canDownloadAny && (
        <div className="helper-cta">
          <div>
            <strong>
              <Sparkles size={16} className="inline-icon" aria-hidden="true" />
              {canDownloadText ? 'On-device AI is ready to download' : 'Handwriting photo AI is ready to download'}
            </strong>
            <p className="muted">
              {canDownloadText
                ? 'One click downloads Chrome’s local model so private marking works offline with 0 bytes sent to cloud AI.'
                : 'Text marking is already ready. Add the photo model if you want on-device handwriting transcription.'}
            </p>
          </div>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => downloadModel('all')}
          >
            <HardDrive size={16} aria-hidden="true" />
            {busy ? 'Downloading…' : canDownloadText ? 'Enable on-device AI' : 'Download photo AI'}
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

      {showStatusRows && (
        <div className="device-status-list">
          <div className="settings-row">
            <div>
              <strong>Text marking &amp; feedback</strong>
              <p>{textReady ? 'Ready — works privately offline in this browser.' : STATUS_LABELS[text]}</p>
            </div>
            {textReady ? (
              <span className="badge badge-device"><CheckCircle2 size={14} aria-hidden="true" />Ready</span>
            ) : canDownloadText ? (
              <button type="button" className="button secondary compact-btn" disabled={busy} onClick={() => downloadModel('text')}>
                Download text AI
              </button>
            ) : (
              <span className="badge neutral">{STATUS_LABELS[text]}</span>
            )}
          </div>
          <div className="settings-row">
            <div>
              <strong>Handwriting photo OCR <small className="muted">(optional)</small></strong>
              <p>{imageReady ? 'Ready — transcribes script photos locally.' : 'Needed only for automatic photo transcription; typed, PDF, DOCX, and TXT work with Text AI.'}</p>
            </div>
            {imageReady ? (
              <span className="badge badge-device"><CheckCircle2 size={14} aria-hidden="true" />Ready</span>
            ) : canDownloadImage ? (
              <button type="button" className="button secondary compact-btn" disabled={busy} onClick={() => downloadModel('image')}>
                Download photo AI
              </button>
            ) : (
              <span className="badge neutral">{STATUS_LABELS[image]}</span>
            )}
          </div>
        </div>
      )}

      {error && <Notice error>{error}</Notice>}

      {!bothReady && !isDownloading && (needsTextFlag || needsPhotoFlagOnly) && (
        env === 'mobile' ? (
          !textReady && (
            <Notice>
              On-device AI marking requires desktop Google Chrome. You can capture photos, import files, mark manually, and use Cloud/Hybrid AI on the sample workspace from this device.
            </Notice>
          )
        ) : env === 'non-chrome' ? (
          !textReady && (
            <Notice>
              On-device AI marking requires desktop Google Chrome. You can still mark manually or allow Cloud AI for rubrics, class teaching plans, and the fictional sample.
            </Notice>
          )
        ) : (
          <details className="scoring-details" open={!compact && needsTextFlag}>
            <summary>
              {needsPhotoFlagOnly
                ? 'Optional: enable handwriting photo AI in Chrome'
                : 'How to enable Gemini Nano 4 in Chrome (1-minute setup)'}
            </summary>
            <div className="helper-steps">
              <p className="muted">
                {needsPhotoFlagOnly
                  ? 'Text marking already works privately offline. To also transcribe photos of handwritten pages locally, enable the multimodal flag in Chrome:'
                  : 'Chrome’s built-in Prompt API runs Gemini Nano 4 on current desktop Chrome (22 GB free disk space; GPU > 4 GB VRAM or 16 GB RAM + 4 CPU cores). Update Chrome first; if it still shows unavailable, enable these flags once:'}
              </p>
              <ol className="helper-ol">
                <li>Open <code>chrome://flags</code> in a new tab (paste the address below).</li>
                <li>Set {needsPhotoFlagOnly ? 'the multimodal flag' : 'the flags below'} to <strong>Enabled</strong> and click <strong>Relaunch</strong>.</li>
                <li>Return to this tab — it re-checks automatically, or click <strong>Re-check Chrome AI</strong>.</li>
              </ol>
              <div className="copy-flag-list">
                {!needsPhotoFlagOnly && (
                  <>
                    <CopyRow label="1. Open Chrome flags" value="chrome://flags" />
                    <CopyRow label="2. Gemini Nano 4 model flag (search in flags)" value="Gemma 4 for Built-in AI" />
                    <CopyRow label="3. Prompt API flag (search in flags)" value="Prompt API for Gemini Nano" />
                  </>
                )}
                <CopyRow
                  label={needsPhotoFlagOnly ? '1. Multimodal photo flag (paste in address bar)' : '4. Photo / handwriting flag (paste in address bar)'}
                  value="chrome://flags/#prompt-api-for-gemini-nano-multimodal-input"
                />
                <CopyRow label="Diagnostics (check model download)" value="chrome://on-device-internals" />
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button secondary compact-btn"
                  disabled={busy}
                  onClick={() => { void run(async () => refresh()) }}
                >
                  <RefreshCw size={15} aria-hidden="true" />Re-check Chrome AI
                </button>
              </div>
            </div>
          </details>
        )
      )}
    </div>
  )
}
