export const MAX_PHOTO_BYTES = 20 * 1024 * 1024
export const BLUR_VARIANCE_THRESHOLD = 45
export type Crop = { top: number; right: number; bottom: number; left: number }
export const noCrop: Crop = { top: 0, right: 0, bottom: 0, left: 0 }
export type PhotoPrepOptions = { enhance?: boolean }
export type PreparedPhoto = { blob: Blob; sharpness: number; blurry: boolean }

/**
 * Computes the variance of the discrete 4-neighbor Laplacian over the interior
 * of a grayscale image. Low variance indicates out-of-focus or motion blur.
 */
export function computeLaplacianVariance(luma: Float32Array | Uint8Array, width: number, height: number): number {
  if (width < 5 || height < 5) return 0
  const marginX = Math.max(1, Math.floor(width * 0.08))
  const marginY = Math.max(1, Math.floor(height * 0.08))
  const startX = Math.min(marginX, width - 3)
  const endX = Math.max(startX + 1, width - marginX)
  const startY = Math.min(marginY, height - 3)
  const endY = Math.max(startY + 1, height - marginY)

  let count = 0
  let sum = 0
  let sumSq = 0
  for (let y = startY; y < endY; y++) {
    const row = y * width
    for (let x = startX; x < endX; x++) {
      const idx = row + x
      const lap = 4 * luma[idx] - luma[idx - 1] - luma[idx + 1] - luma[idx - width] - luma[idx + width]
      sum += lap
      sumSq += lap * lap
      count++
    }
  }
  if (!count) return 0
  const mean = sum / count
  return Math.max(0, sumSq / count - mean * mean)
}

function clampByte(value: number): number {
  return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value)
}

/**
 * Pure Canvas 2D document scan enhancement:
 * 1. Estimates local paper illumination with an O(W*H) integral image box mean
 *    to flatten shadows and uneven desk lighting.
 * 2. Stretches ink-to-paper contrast softly (preserving faint pencil and ink hue)
 *    without harsh 1-bit binary speckling.
 * 3. Applies a light 3x3 unsharp mask to crisp handwritten edges for OCR.
 */
export function enhanceScanPixels(rgba: Uint8ClampedArray, width: number, height: number): void {
  const total = width * height
  if (total === 0) return

  const luma = new Float32Array(total)
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    luma[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
  }

  // Summed-area table with 1-pixel zero border for O(1) window means
  const stride = width + 1
  const integral = new Float64Array(stride * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    const lumaRow = y * width
    const prevRow = y * stride
    const currRow = (y + 1) * stride
    for (let x = 0; x < width; x++) {
      rowSum += luma[lumaRow + x]
      integral[currRow + x + 1] = integral[prevRow + x + 1] + rowSum
    }
  }

  const radius = Math.max(8, Math.min(44, Math.round(Math.max(width, height) * 0.025)))
  const normalized = new Float32Array(total)

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(height, y + radius + 1)
    const topRow = y0 * stride
    const botRow = y1 * stride
    const outRow = y * width

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width, x + radius + 1)
      const area = (x1 - x0) * (y1 - y0)
      const localMean = (integral[botRow + x1] - integral[topRow + x1] - integral[botRow + x0] + integral[topRow + x0]) / area

      // Normalize pixel brightness against local paper background
      const bg = Math.max(36, localMean * 1.04)
      const ratio = luma[outRow + x] / bg

      // Pull clean paper softly to bright white while deepening faint ink strokes
      let target: number
      if (ratio >= 0.96) {
        target = 252
      } else if (ratio <= 0.45) {
        target = Math.max(12, ratio * 150)
      } else {
        const t = (ratio - 0.45) / (0.96 - 0.45)
        const shaped = Math.pow(t, 1.38)
        target = 68 + shaped * (252 - 68)
      }
      normalized[outRow + x] = target
    }
  }

  // Light 3x3 unsharp mask to crisp handwriting strokes
  const crisp = new Float32Array(normalized)
  const amount = 0.42
  for (let y = 1; y < height - 1; y++) {
    const row = y * width
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x
      const blur = (
        normalized[idx - width - 1] + normalized[idx - width] + normalized[idx - width + 1] +
        normalized[idx - 1] + normalized[idx] + normalized[idx + 1] +
        normalized[idx + width - 1] + normalized[idx + width] + normalized[idx + width + 1]
      ) / 9
      crisp[idx] = normalized[idx] + amount * (normalized[idx] - blur)
    }
  }

  // Reapply enhanced luminance with gentle hue preservation (keeps blue/red ink readable on white paper)
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const enhancedLuma = crisp[i]
    const origLuma = Math.max(1, luma[i])
    const scale = enhancedLuma / origLuma
    const tintR = rgba[p] * scale
    const tintG = rgba[p + 1] * scale
    const tintB = rgba[p + 2] * scale
    rgba[p] = clampByte(enhancedLuma * 0.72 + tintR * 0.28)
    rgba[p + 1] = clampByte(enhancedLuma * 0.72 + tintG * 0.28)
    rgba[p + 2] = clampByte(enhancedLuma * 0.72 + tintB * 0.28)
    rgba[p + 3] = 255
  }
}

function measureCanvasSharpness(canvas: HTMLCanvasElement): number {
  const maxDim = 640
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height))
  const width = Math.max(1, Math.round(canvas.width * scale))
  const height = Math.max(1, Math.round(canvas.height * scale))
  const probe = document.createElement('canvas')
  probe.width = width
  probe.height = height
  const ctx = probe.getContext('2d', { willReadFrequently: true })
  if (!ctx) return BLUR_VARIANCE_THRESHOLD
  ctx.drawImage(canvas, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  const luma = new Float32Array(width * height)
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  return computeLaplacianVariance(luma, width, height)
}

export async function preparePhotoWithMetrics(
  file: Blob,
  turns = 0,
  crop: Crop = noCrop,
  options: PhotoPrepOptions = {},
): Promise<PreparedPhoto> {
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error('Choose a photo up to 20 MB.')
  let image: ImageBitmap
  try {
    image = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('This photo could not be opened. Try the camera or choose a JPEG or PNG.')
  }

  try {
    const scale = Math.min(1, 2000 / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const page = document.createElement('canvas')
    page.width = turns % 2 ? height : width
    page.height = turns % 2 ? width : height
    const context = page.getContext('2d', { alpha: false })
    if (!context) throw new Error('Photo editing is unavailable in this browser.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, page.width, page.height)
    context.translate(page.width / 2, page.height / 2)
    context.rotate(turns * Math.PI / 2)
    context.drawImage(image, -width / 2, -height / 2, width, height)

    const left = Math.round(page.width * crop.left / 100)
    const top = Math.round(page.height * crop.top / 100)
    const cropped = document.createElement('canvas')
    cropped.width = Math.max(1, page.width - left - Math.round(page.width * crop.right / 100))
    cropped.height = Math.max(1, page.height - top - Math.round(page.height * crop.bottom / 100))
    const output = cropped.getContext('2d', { willReadFrequently: Boolean(options.enhance) })
    if (!output) throw new Error('Photo editing is unavailable in this browser.')
    output.drawImage(page, -left, -top)

    // Measure optical sharpness before any scan enhancement so sharpening cannot mask real blur.
    const sharpness = measureCanvasSharpness(cropped)
    const blurry = sharpness < BLUR_VARIANCE_THRESHOLD

    if (options.enhance) {
      const pixels = output.getImageData(0, 0, cropped.width, cropped.height)
      enhanceScanPixels(pixels.data, cropped.width, cropped.height)
      output.putImageData(pixels, 0, 0)
    }

    const blob = await new Promise<Blob>((resolve, reject) => cropped.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Could not prepare the photo.')),
      'image/jpeg', 0.91,
    ))
    return { blob, sharpness, blurry }
  } finally {
    image.close()
  }
}

export async function preparePhoto(file: Blob, turns = 0, crop: Crop = noCrop, options: PhotoPrepOptions = {}): Promise<Blob> {
  const { blob } = await preparePhotoWithMetrics(file, turns, crop, options)
  return blob
}

export async function hashPhoto(file: Blob) {
  const bytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}
