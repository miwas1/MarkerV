import { Camera, RefreshCw, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Notice } from '../ui'

export function CameraModal({
  title = 'Take a photo',
  onCapture,
  onClose,
}: {
  title?: string
  onCapture: (file: File) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackInput = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [ready, setReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [capturing, setCapturing] = useState(false)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    let active = true
    setReady(false)
    setCameraError('')
    stopStream()

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Live camera access is unavailable in this browser. Use the device camera button below instead.')
        return
      }
      try {
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        }
        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
        if (active) setReady(true)
      } catch {
        if (active) {
          setCameraError('Could not access the camera. Allow camera permission in your browser, or use the device camera picker below.')
        }
      }
    }

    void start()
    return () => {
      active = false
      stopStream()
    }
  }, [facingMode, stopStream])

  function handleClose() {
    stopStream()
    onClose()
  }

  function snap() {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight || capturing) return
    setCapturing(true)
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) {
      setCapturing(false)
      setCameraError('Could not capture a frame in this browser.')
      return
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        setCapturing(false)
        if (!blob) {
          setCameraError('Could not save the captured image. Try again.')
          return
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const file = new File([blob], `photo-${stamp}.jpg`, { type: 'image/jpeg' })
        stopStream()
        onCapture(file)
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <Modal title={title} onClose={handleClose}>
      <input
        ref={fallbackInput}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Device camera photo input"
        className="visually-hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) {
            stopStream()
            onCapture(file)
          }
        }}
      />
      {cameraError ? (
        <Notice error>{cameraError}</Notice>
      ) : (
        <div className="camera-stage">
          <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
          {!ready && <span className="camera-status">Starting camera…</span>}
        </div>
      )}
      <div className="button-row">
        {!cameraError && (
          <>
            <button type="button" className="button primary" disabled={!ready || capturing} onClick={snap}>
              <Camera size={17} />
              {capturing ? 'Capturing…' : 'Capture photo'}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!ready || capturing}
              onClick={() => setFacingMode((mode) => (mode === 'environment' ? 'user' : 'environment'))}
            >
              <RefreshCw size={16} />
              Switch camera
            </button>
          </>
        )}
        <button type="button" className="button secondary" onClick={() => fallbackInput.current?.click()}>
          <Upload size={16} />
          {cameraError ? 'Open device camera / files' : 'Use device camera app'}
        </button>
      </div>
    </Modal>
  )
}
