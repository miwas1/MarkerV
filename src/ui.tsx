import { AlertCircle, Cloud, HardDrive, Info, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Provenance, Workspace } from './domain/workspace'
import { errorMessage } from './storage/useWorkspace'

export type Commit = (change: (workspace: Workspace) => Workspace) => Promise<void>

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const Icon = error ? AlertCircle : Info
  return <div className={'notice' + (error ? ' notice-error' : '')} role={error ? 'alert' : 'status'}>
    <Icon size={17} aria-hidden="true" /><div>{children}</div>
  </div>
}

export function Loading({ children }: { children: ReactNode }) {
  return <p className="loading" role="status"><LoaderCircle className="spin" size={17} aria-hidden="true" />{children}</p>
}

export function Source({ value }: { value: Provenance }) {
  const Icon = value.source === 'cloud' ? Cloud : value.source === 'device' ? HardDrive : Info
  const label = {
    device: 'On this device',
    cloud: 'Cloud',
    sample: 'Sample result',
    heuristic: 'Keyword match · not AI',
    unknown: 'Source unavailable',
  }[value.source]
  return <span className={'badge badge-' + value.source}>
    <Icon size={14} aria-hidden="true" />{label}{value.ms === undefined ? '' : ' · ' + (value.ms / 1000).toFixed(1) + ' s'}
  </span>
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useRef(crypto.randomUUID())
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={ref} className="modal" aria-labelledby={id.current} onCancel={(event) => { event.preventDefault(); onClose() }}>
    <div className="modal-heading">
      <h2 id={id.current}>{title}</h2>
      <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
    </div>
    {children}
  </dialog>
}

export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [])
  const run = async (action: (active: () => boolean) => Promise<void>) => {
    if (running.current) return
    running.current = true
    const version = ++generation.current
    const active = () => version === generation.current
    setBusy(true)
    setError('')
    try {
      await action(active)
    } catch (failure) {
      if (active()) setError(errorMessage(failure))
    } finally {
      if (active()) {
        running.current = false
        setBusy(false)
      }
    }
  }
  return {
    busy, error, run, setError,
    cancel: () => {
      generation.current++
      running.current = false
      setBusy(false)
    },
  }
}

export function AllowCloudButton({ onAllowCloud, label = 'Allow cloud AI' }: {
  onAllowCloud?: () => Promise<void>
  label?: string
}) {
  const { run, busy } = useAction()
  if (!onAllowCloud) return null
  return (
    <button
      type="button"
      className="button secondary compact-btn nowrap-btn"
      disabled={busy}
      onClick={() => { void run(async () => onAllowCloud()) }}
    >
      <Cloud size={15} aria-hidden="true" />{busy ? 'Enabling…' : label}
    </button>
  )
}

export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!blob) { setUrl(''); return }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}
