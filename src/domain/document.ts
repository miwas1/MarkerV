import { MAX_CRITERIA, MAX_SCORE, newCriterion, type Criterion } from './workspace.ts'

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
export const DOCUMENT_ACCEPT =
  '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'

export type DocumentFormat = 'txt' | 'docx' | 'pdf'
export type SupportedFileKind = 'image' | DocumentFormat | 'unsupported'

export type ExtractedDocument = {
  format: DocumentFormat
  filename: string
  text: string
  pageCount?: number
  previewImage?: Blob
}

export type ParsedRubricDraft = {
  title: string
  question: string
  criteria: Criterion[]
  parsedCriteriaCount: number
}

const MAX_PDF_PAGES = 25

export function detectFileKind(file: Pick<File, 'name' | 'type'>): SupportedFileKind {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/.test(name)) return 'image'
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return 'docx'
  }
  if (type === 'text/plain' || name.endsWith('.txt')) return 'txt'
  return 'unsupported'
}

export function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function readParagraphText(element: Element): string {
  const parts: string[] = []
  function walk(node: Node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const local = el.localName
    if (local === 't') {
      parts.push(el.textContent ?? '')
      return
    }
    if (local === 'tab') {
      parts.push('\t')
      return
    }
    if (local === 'br' || local === 'cr') {
      parts.push('\n')
      return
    }
    for (const child of Array.from(el.childNodes)) walk(child)
  }
  walk(element)
  return parts.join('').replace(/[ \t]+/g, ' ').trim()
}

async function extractDocx(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default
  let zip
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer())
  } catch {
    throw new Error('Could not open this DOCX file. Make sure it is a valid .docx document.')
  }
  const docEntry = zip.file('word/document.xml')
  if (!docEntry) {
    throw new Error('This DOCX file does not contain readable document text.')
  }
  const xml = await docEntry.async('string')
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    throw new Error('This DOCX file could not be parsed.')
  }
  const body = parsed.getElementsByTagNameNS('*', 'body')[0] ?? parsed.documentElement
  const blocks: string[] = []

  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as Element
    if (el.localName === 'p') {
      const line = readParagraphText(el)
      if (line) blocks.push(line)
    } else if (el.localName === 'tbl') {
      const rows = Array.from(el.childNodes).filter(
        (node): node is Element => node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === 'tr',
      )
      for (const row of rows) {
        const cells = Array.from(row.childNodes)
          .filter((node): node is Element => node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === 'tc')
          .map((cell) => {
            const paragraphs = Array.from(cell.getElementsByTagNameNS('*', 'p'))
              .map(readParagraphText)
              .filter(Boolean)
            return paragraphs.join('; ')
          })
        if (cells.some(Boolean)) blocks.push(cells.map((cell) => cell.replace(/\|/g, '\\|')).join(' | '))
      }
    }
  }

  return normalizeExtractedText(blocks.join('\n'))
}

/** The parts of a pdf.js text item that line joining needs. */
export type PdfTextItem = { str: string; transform?: number[]; width?: number; hasEOL?: boolean }

/**
 * Rebuilds the lines of one PDF page from pdf.js text items.
 *
 * pdf.js splits text into items at font changes, kerning and ligature glyphs, so "coffee"
 * set with an "ff" ligature arrives as "co", "ff", "ee" with no gap between them. A space is
 * added only where the page shows one: a horizontal gap wider than about an eighth of the
 * font size, or a jump back to the left (a new column on the same baseline). Items with
 * unknown geometry keep the old behaviour of a separating space.
 */
export function pdfTextItemsToLines(items: readonly PdfTextItem[]): string[] {
  const lines: string[] = []
  let currentLine = ''
  let lastY: number | undefined
  let lastEndX: number | undefined

  for (const item of items) {
    const t = Array.isArray(item.transform) && item.transform.length >= 6 ? item.transform : undefined
    const y = t ? Math.round(t[5]) : undefined
    if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 4 && currentLine.trim()) {
      lines.push(currentLine.trim())
      currentLine = ''
      lastEndX = undefined
    }
    if (currentLine && item.str && !currentLine.endsWith(' ') && !item.str.startsWith(' ')) {
      const fontSize = t ? Math.hypot(t[0], t[1]) : 0
      const gap = t && lastEndX !== undefined ? t[4] - lastEndX : undefined
      const wordGap = gap === undefined || !(fontSize > 0) || gap > fontSize * 0.12 || gap < -fontSize
      if (wordGap) currentLine += ' '
    }
    currentLine += item.str
    lastEndX = t && typeof item.width === 'number' && item.width > 0 ? t[4] + item.width : undefined
    if (item.hasEOL) {
      if (currentLine.trim()) lines.push(currentLine.trim())
      currentLine = ''
      lastY = undefined
      lastEndX = undefined
    } else if (y !== undefined) {
      lastY = y
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim())
  return lines
}

async function extractPdf(file: File): Promise<{ text: string; pageCount: number; previewImage?: Blob }> {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  if (pdfjs.GlobalWorkerOptions.workerSrc !== workerModule.default) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default
  }

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  let pdf
  try {
    pdf = await loadingTask.promise
  } catch {
    await loadingTask.destroy().catch(() => undefined)
    throw new Error('Could not open this PDF file. Check that it is not password-protected or corrupted.')
  }

  try {
    const pageCount = pdf.numPages
    const limit = Math.min(pageCount, MAX_PDF_PAGES)
    const pageTexts: string[] = []

    for (let pageNum = 1; pageNum <= limit; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      const joined = pdfTextItemsToLines(content.items.flatMap((item) => ('str' in item ? [item] : []))).join('\n').trim()
      if (joined) pageTexts.push(joined)
    }

    const text = normalizeExtractedText(pageTexts.join('\n\n'))
    let previewImage: Blob | undefined

    // If the PDF is scanned/image-only (minimal selectable text), render up to the first 2 pages
    // into a single clean JPEG so the user can view, crop/rotate, and transcribe it like a photo.
    if (text.replace(/\s+/g, '').length < 20 && pageCount >= 1) {
      const renderCount = Math.min(pageCount, 2)
      const renderedPages: HTMLCanvasElement[] = []
      for (let pageNum = 1; pageNum <= renderCount; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(2, 1600 / Math.max(baseViewport.width, baseViewport.height, 1))
        const viewport = page.getViewport({ scale })
        const pageCanvas = document.createElement('canvas')
        pageCanvas.width = Math.max(1, Math.round(viewport.width))
        pageCanvas.height = Math.max(1, Math.round(viewport.height))
        const pageCtx = pageCanvas.getContext('2d', { alpha: false })
        if (pageCtx) {
          pageCtx.fillStyle = '#ffffff'
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
        }
        await page.render({ canvas: pageCanvas, viewport }).promise
        renderedPages.push(pageCanvas)
      }

      const gap = renderCount > 1 ? 16 : 0
      const output = document.createElement('canvas')
      output.width = Math.max(...renderedPages.map((c) => c.width))
      output.height = renderedPages.reduce((sum, c) => sum + c.height, 0) + gap * (renderCount - 1)
      const outCtx = output.getContext('2d', { alpha: false })
      if (outCtx) {
        outCtx.fillStyle = '#e5ece8'
        outCtx.fillRect(0, 0, output.width, output.height)
        let offsetY = 0
        for (const pageCanvas of renderedPages) {
          const offsetX = Math.round((output.width - pageCanvas.width) / 2)
          outCtx.drawImage(pageCanvas, offsetX, offsetY)
          offsetY += pageCanvas.height + gap
        }
      }
      previewImage = await new Promise<Blob | undefined>((resolve) =>
        output.toBlob((blob) => resolve(blob ?? undefined), 'image/jpeg', 0.91),
      )
    }

    return { text, pageCount, previewImage }
  } finally {
    await loadingTask.destroy()
  }
}

export async function extractDocument(file: File): Promise<ExtractedDocument> {
  if (!file.size || file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Choose a PDF, DOCX, or TXT file up to 20 MB.')
  }
  const kind = detectFileKind(file)
  if (kind === 'txt') {
    const text = normalizeExtractedText(await file.text())
    if (!text) throw new Error('This TXT file is empty.')
    return { format: 'txt', filename: file.name, text }
  }
  if (kind === 'docx') {
    const text = await extractDocx(file)
    if (!text) throw new Error('No readable text was found in this DOCX file.')
    return { format: 'docx', filename: file.name, text }
  }
  if (kind === 'pdf') {
    const result = await extractPdf(file)
    if (!result.text && !result.previewImage) {
      throw new Error('No readable text or page image was found in this PDF.')
    }
    return {
      format: 'pdf',
      filename: file.name,
      text: result.text,
      pageCount: result.pageCount,
      previewImage: result.previewImage,
    }
  }
  throw new Error('Unsupported file format. Choose a PDF, DOCX, or TXT file.')
}

function cleanFilenameTitle(filename?: string): string {
  if (!filename) return ''
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

function clamp(text: string, max: number): string {
  return text.trim().slice(0, max)
}

function parseTableCriteria(lines: string[]): Criterion[] {
  const pipeLines = lines.filter((line) => /(?<!\\)\|/.test(line))
  if (pipeLines.length < 2) return []

  const splitRow = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/(?<!\\)\|$/, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.replace(/\\\|/g, '|').trim())

  const rows = pipeLines
    .map(splitRow)
    .filter((cells) => cells.length >= 3 && !cells.every((cell) => /^[-:\s]+$/.test(cell)))

  if (rows.length < 2) return []

  const header = rows[0]
  const headerNumbers = header.slice(1).map((cell) => {
    const match = cell.match(/\b(\d+)\b/)
    return match ? Number(match[1]) : null
  })
  const hasHeader =
    /criterion|criteria|category|dimension|aspect|rubric|item|skill/i.test(header[0]) ||
    headerNumbers.some((n) => n !== null)

  const dataRows = hasHeader ? rows.slice(1) : rows
  const descending =
    hasHeader &&
    headerNumbers[0] !== null &&
    headerNumbers[headerNumbers.length - 1] !== null &&
    headerNumbers[0]! > headerNumbers[headerNumbers.length - 1]!

  const criteria: Criterion[] = []
  for (const row of dataRows) {
    if (criteria.length >= MAX_CRITERIA) break
    const rawTitle = row[0]
    if (!rawTitle) continue
    let levelCells = row.slice(1).filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === ''))
    if (levelCells.length < 2) continue
    if (descending) levelCells = [...levelCells].reverse()

    // Ensure levels start at 0 marks through max marks inclusive (max between 1 and MAX_SCORE).
    const trimmed = levelCells.slice(0, MAX_SCORE + 1)
    const max = Math.min(MAX_SCORE, Math.max(1, trimmed.length - 1))
    const levels = Array.from({ length: max + 1 }, (_, i) => clamp(trimmed[i] ?? '', 600))
    const title = clamp(rawTitle.replace(/\s*\(\d+\s*(?:marks?|pts?|points?)\)\s*$/i, ''), 90)
    if (!title) continue
    criteria.push({
      id: crypto.randomUUID(),
      title,
      max,
      levels,
      practice: '',
      keyPoints: '',
    })
  }
  return criteria
}

function parseStructuredCriteria(lines: string[]): Criterion[] {
  const criteria: Criterion[] = []
  type Draft = {
    title: string
    explicitMax?: number
    levels: Map<number, string>
    practice: string
    keyPoints: string
  }
  type Target = { kind: 'level'; score: number } | { kind: 'practice' } | { kind: 'keyPoints' }
  let current: Draft | undefined
  let target: Target | undefined

  const flush = () => {
    if (!current || criteria.length >= MAX_CRITERIA) return
    const highestKey = current.levels.size ? Math.max(...current.levels.keys()) : 0
    const max = Math.min(MAX_SCORE, Math.max(1, current.explicitMax ?? (highestKey || 2)))
    const levels = Array.from({ length: max + 1 }, (_, score) => clamp(current!.levels.get(score) ?? '', 600))
    criteria.push({
      id: crypto.randomUUID(),
      title: clamp(current.title, 90),
      max,
      levels,
      practice: clamp(current.practice, 200),
      keyPoints: clamp(current.keyPoints, 600),
    })
    current = undefined
    target = undefined
  }

  const headerPattern = /^(?:criterion\s*\d+|c\d+|\d+[.)]|#{1,3})\s*[:.-]?\s*(.+)$/i
  const letterHeader = /^(?!e\.g\.|i\.e\.)[a-h][.)]\s+([A-Z].*)$/
  const levelPattern =
    /^(?:[-*•]\s*)?(?:level\s*)?(\d+)\s*(?:marks?|pts?|points?)?\s*[:\-–—]\s*(.+)$/i
  const practicePattern = /^(?:[-*•]\s*)?(?:practice(?:\s+(?:question|prompt))?)\s*[:\-–—]\s*(.+)$/i
  const keyPointsPattern = /^(?:[-*•]\s*)?(?:key\s+points?|marker\s+notes?|marking\s+points?)\s*[:\-–—]\s*(.+)$/i
  const skipMetaPattern = /^(?:title|assessment|rubric|question|prompt|task|total|notes?)\s*:/i

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (skipMetaPattern.test(line)) {
      if (current) flush()
      target = undefined
      continue
    }

    const practiceMatch = line.match(practicePattern)
    if (practiceMatch && current) {
      current.practice = practiceMatch[1].trim()
      target = { kind: 'practice' }
      continue
    }

    const keyPointsMatch = line.match(keyPointsPattern)
    if (keyPointsMatch && current) {
      current.keyPoints = keyPointsMatch[1].trim()
      target = { kind: 'keyPoints' }
      continue
    }

    const levelMatch = line.match(levelPattern)
    if (levelMatch && current) {
      const score = Number(levelMatch[1])
      if (Number.isInteger(score) && score >= 0 && score <= MAX_SCORE) {
        current.levels.set(score, levelMatch[2].trim())
        target = { kind: 'level', score }
        continue
      }
    }

    const headerMatch = line.match(headerPattern) ?? line.match(letterHeader)
    if (headerMatch) {
      // Avoid misreading a standalone "0. ..." level inside a criterion as a new criterion.
      const startsWithZero = /^0[.)]\s+/.test(line)
      if (startsWithZero && current) {
        current.levels.set(0, headerMatch[1].trim())
        target = { kind: 'level', score: 0 }
        continue
      }
      flush()
      const headingText = headerMatch[1].trim()
      const maxMatch = headingText.match(/(?:\(|\[|[-–—]\s*)(?:max\s*)?(\d+)\s*(?:marks?|pts?|points?)\s*(?:\)|\])?$/i)
      const explicitMax = maxMatch ? Math.min(MAX_SCORE, Math.max(1, Number(maxMatch[1]))) : undefined
      const title = maxMatch ? headingText.slice(0, maxMatch.index).trim() : headingText
      if (title) {
        current = { title, explicitMax, levels: new Map(), practice: '', keyPoints: '' }
      }
      target = undefined
      continue
    }

    // Standalone heading with explicit mark count, e.g. "Conceptual accuracy (3 marks)"
    const standaloneMax = line.match(/^([^:|]{3,85}?)\s*(?:\(|\[)\s*(?:max\s*)?(\d+)\s*(?:marks?|pts?|points?)\s*(?:\)|\])$/i)
    if (standaloneMax) {
      flush()
      current = {
        title: standaloneMax[1].trim(),
        explicitMax: Math.min(MAX_SCORE, Math.max(1, Number(standaloneMax[2]))),
        levels: new Map(),
        practice: '',
        keyPoints: '',
      }
      target = undefined
      continue
    }

    // Wrapped line continuation for PDFs and DOCX paragraphs.
    if (current && target) {
      if (target.kind === 'practice') {
        current.practice = (current.practice + ' ' + line).trim()
      } else if (target.kind === 'keyPoints') {
        current.keyPoints = (current.keyPoints + ' ' + line).trim()
      } else {
        current.levels.set(target.score, ((current.levels.get(target.score) ?? '') + ' ' + line).trim())
      }
    }
  }

  flush()
  return criteria
}

export function parseRubricText(rawText: string, filename?: string): ParsedRubricDraft {
  const normalized = normalizeExtractedText(rawText)
  const lines = normalized.split('\n').map((line) => line.trim())

  let title = ''
  let question = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const titleMatch = line.match(/^(?:assessment\s+title|title|assessment|rubric(?:\s+title)?)\s*[:\-–—]\s*(.+)$/i)
    if (titleMatch && !title) {
      title = clamp(titleMatch[1], 100)
      continue
    }
    const questionMatch = line.match(/^(?:question|prompt|task|assignment(?:\s+question)?)\s*[:\-–—]\s*(.+)$/i)
    if (questionMatch && !question) {
      const qParts = [questionMatch[1].trim()]
      while (
        i + 1 < lines.length &&
        lines[i + 1] &&
        !/^(?:criterion|c\d+|title|assessment|rubric|scoring|criteria|\d+[.)]|[-*•])/i.test(lines[i + 1]) &&
        !lines[i + 1].includes('|')
      ) {
        i++
        qParts.push(lines[i])
      }
      question = clamp(qParts.join(' '), 1000)
    }
  }

  if (!title) {
    const firstHeading = lines.find(
      (line) =>
        line.length >= 3 &&
        line.length <= 100 &&
        !line.includes('|') &&
        !/^(?:question|prompt|task|criterion\s*\d+|0\s*(?:marks?|:))/i.test(line),
    )
    title = clamp(firstHeading?.replace(/^#{1,3}\s*/, '') || cleanFilenameTitle(filename), 100)
  }

  const tableCriteria = parseTableCriteria(lines)
  const parsed = tableCriteria.length ? tableCriteria : parseStructuredCriteria(lines)

  if (!question) {
    const questionSentence = lines.find((line) => line.endsWith('?') && line.length >= 12 && !line.includes('|'))
    if (questionSentence) question = clamp(questionSentence, 1000)
  }

  return {
    title,
    question,
    criteria: parsed.length ? parsed : [newCriterion()],
    parsedCriteriaCount: parsed.length,
  }
}
