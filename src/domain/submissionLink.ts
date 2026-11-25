import { z } from 'zod'
import {
  levelText,
  MAX_ANSWER,
  MAX_CRITERIA,
  MAX_SCORE,
  validateSuggestions,
  type Criterion,
  type Rubric,
  type Suggestion,
} from './workspace.ts'

// Blueprint-synchronized volumetric limits & regex patterns (matching firebase-blueprint.json & firestore.rules)
export const ID_PATTERN = /^[a-zA-Z0-9_-]+$/
export const OPTIONAL_ID_PATTERN = /^[a-zA-Z0-9_-]*$/
export const MAX_FIELDS = 12
export const MAX_FIELD_LABEL = 80
export const MAX_FIELD_PLACEHOLDER = 160
export const MAX_PORTAL_TITLE = 140
export const MAX_PORTAL_INSTRUCTIONS = 2000
export const MAX_OWNER_NAME = 100
export const MAX_PROJECT_NAME = 100
export const MAX_SUBMISSION_TEXT = 6000
export const MAX_IMAGE_DATA_URL = 235000
export const MAX_FILE_NAME = 160
export const MAX_FILE_BYTES = 20 * 1024 * 1024

export type FieldType = 'short_text' | 'long_text' | 'file'
export type FileAcceptKind = 'any' | 'documents' | 'images'

export type SubmissionFieldDef = {
  id: string
  label: string
  type: FieldType
  required: boolean
  placeholder: string
  accept: FileAcceptKind
  useForMarking: boolean
}

export type RubricSnapshot = {
  id: string
  title: string
  question: string
  criteria: Criterion[]
}

export type SubmissionLinkDoc = {
  id: string
  ownerId: string
  ownerName: string
  projectId: string
  projectName: string
  title: string
  instructions: string
  isOpen: boolean
  autoMark: boolean
  showScoreToStudent: boolean
  rubricId: string
  rubricTitle: string
  rubricSnapshot?: RubricSnapshot
  fields: SubmissionFieldDef[]
  createdAtMs: number
  updatedAtMs: number
}

export type FieldResponseValue = {
  fieldId: string
  label: string
  type: FieldType
  textValue: string
  fileName: string
  fileType: string
  fileSize: number
  extractedText: string
}

export type AutoMarkStatus = 'not_requested' | 'marked' | 'pending'
export type AutoMarkEngine = 'none' | 'device-ai' | 'rubric-heuristic'
export type SubmissionLifecycleStatus = 'submitted' | 'imported' | 'reviewed'

export type StudentSubmissionDoc = {
  id: string
  linkId: string
  ownerId: string
  status: SubmissionLifecycleStatus
  submitterLabel: string
  fieldValues: FieldResponseValue[]
  combinedAnswer: string
  attachmentImageDataUrl: string
  attachmentFileName: string
  autoMarkStatus: AutoMarkStatus
  autoMarkEngine: AutoMarkEngine
  marks: Record<string, number>
  suggestions: Record<string, Suggestion>
  totalEarned: number
  totalPossible: number
  importedToWorkspace: boolean
  workspaceScriptId: string
  createdAtMs: number
  updatedAtMs: number
}

const FIELD_TYPES: readonly FieldType[] = ['short_text', 'long_text', 'file']
const clippedText = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '')

/**
 * Field responses as read from Firestore. Security rules bound the array's length but can check
 * the structure of its first element only, so every element is checked again here before the
 * lecturer's screens use it. Malformed elements are dropped and oversized strings are clipped.
 */
export function sanitizeFieldValues(raw: unknown): FieldResponseValue[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_FIELDS).flatMap((item): FieldResponseValue[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    if (!FIELD_TYPES.includes(row.type as FieldType)) return []
    const size = typeof row.fileSize === 'number' && Number.isFinite(row.fileSize) ? row.fileSize : 0
    return [{
      fieldId: clippedText(row.fieldId, 128),
      label: clippedText(row.label, MAX_FIELD_LABEL) || 'Field',
      type: row.type as FieldType,
      textValue: clippedText(row.textValue, MAX_SUBMISSION_TEXT),
      fileName: clippedText(row.fileName, MAX_FILE_NAME),
      fileType: clippedText(row.fileType, 120),
      fileSize: Math.min(MAX_FILE_BYTES, Math.max(0, Math.round(size))),
      extractedText: clippedText(row.extractedText, MAX_SUBMISSION_TEXT),
    }]
  })
}

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function generateUniqueLinkId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let body = ''
  for (let i = 0; i < bytes.length; i++) {
    body += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length]
  }
  return `sub-${body}`
}

export function generateFieldId(prefix = 'fld'): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let body = ''
  for (let i = 0; i < bytes.length; i++) {
    body += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length]
  }
  return `${prefix}_${body}`
}

export function buildSubmissionUrl(linkId: string): string {
  if (typeof window === 'undefined') return `/submit/${linkId}`
  return `${window.location.origin}/submit/${linkId}`
}

export function defaultSubmissionFields(): SubmissionFieldDef[] {
  return [
    {
      id: 'fld_full_name',
      label: 'Full Name',
      type: 'short_text',
      required: true,
      placeholder: 'e.g. Amina Bello',
      accept: 'any',
      useForMarking: false,
    },
    {
      id: 'fld_matric_number',
      label: 'Matric Number',
      type: 'short_text',
      required: true,
      placeholder: 'e.g. CSC/2023/041',
      accept: 'any',
      useForMarking: false,
    },
    {
      id: 'fld_written_answer',
      label: 'Written Answer',
      type: 'long_text',
      required: false,
      placeholder: 'Type or paste your answer here…',
      accept: 'any',
      useForMarking: true,
    },
    {
      id: 'fld_script_upload',
      label: 'Upload Script (PDF, DOCX, TXT, or Photo)',
      type: 'file',
      required: false,
      placeholder: 'Attach your completed document or a clear photo of handwritten work',
      accept: 'any',
      useForMarking: true,
    },
  ]
}

export const FIELD_PRESETS: Array<{ label: string; template: () => SubmissionFieldDef }> = [
  {
    label: 'Short text',
    template: () => ({
      id: generateFieldId('fld'),
      label: 'Student Detail',
      type: 'short_text',
      required: true,
      placeholder: 'Enter value…',
      accept: 'any',
      useForMarking: false,
    }),
  },
  {
    label: 'Large text',
    template: () => ({
      id: generateFieldId('fld'),
      label: 'Essay / Response',
      type: 'long_text',
      required: true,
      placeholder: 'Write your detailed response…',
      accept: 'any',
      useForMarking: true,
    }),
  },
  {
    label: 'File upload',
    template: () => ({
      id: generateFieldId('fld'),
      label: 'Attachment Upload',
      type: 'file',
      required: false,
      placeholder: 'Upload PDF, DOCX, TXT, or image',
      accept: 'any',
      useForMarking: true,
    }),
  },
  {
    label: 'Email address',
    template: () => ({
      id: generateFieldId('fld'),
      label: 'University Email',
      type: 'short_text',
      required: true,
      placeholder: 'student@university.edu',
      accept: 'any',
      useForMarking: false,
    }),
  },
  {
    label: 'Department / Level',
    template: () => ({
      id: generateFieldId('fld'),
      label: 'Department / Level',
      type: 'short_text',
      required: false,
      placeholder: 'e.g. Computer Science · 300 Level',
      accept: 'any',
      useForMarking: false,
    }),
  },
]

export function toRubricSnapshot(rubric: Rubric): RubricSnapshot {
  return {
    id: rubric.id.slice(0, 128),
    title: rubric.title.trim().slice(0, 120),
    question: rubric.question.trim().slice(0, 1200),
    criteria: rubric.criteria.slice(0, MAX_CRITERIA).map((criterion) => {
      const max = Math.min(MAX_SCORE, Math.max(1, Math.round(criterion.max)))
      return {
        id: criterion.id.slice(0, 128),
        title: criterion.title.trim().slice(0, 90),
        max,
        levels: Array.from({ length: max + 1 }, (_, score) => levelText(criterion, score).slice(0, 600)),
        practice: (criterion.practice ?? '').trim().slice(0, 200),
      }
    }),
  }
}

export function rubricSnapshotTotal(snapshot?: RubricSnapshot): number {
  if (!snapshot) return 0
  return snapshot.criteria.reduce((sum, c) => sum + Math.round(c.max), 0)
}

export function fieldAcceptAttr(accept: FileAcceptKind): string {
  switch (accept) {
    case 'documents':
      return '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
    case 'images':
      return 'image/*'
    default:
      return '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*'
  }
}

export function fieldAcceptSummary(accept: FileAcceptKind): string {
  switch (accept) {
    case 'documents':
      return 'PDF, DOCX, or TXT'
    case 'images':
      return 'JPEG, PNG, or WebP photo'
    default:
      return 'PDF, DOCX, TXT, or photo'
  }
}

export const SubmissionFieldSchema = z.object({
  id: z.string().min(1).max(128).regex(ID_PATTERN),
  label: z.string().trim().min(1, 'Every field needs a label.').max(MAX_FIELD_LABEL),
  type: z.enum(['short_text', 'long_text', 'file']),
  required: z.boolean(),
  placeholder: z.string().trim().max(MAX_FIELD_PLACEHOLDER),
  accept: z.enum(['any', 'documents', 'images']),
  useForMarking: z.boolean(),
})

export function validateLinkDraft(input: {
  title: string
  instructions: string
  fields: SubmissionFieldDef[]
  autoMark: boolean
  rubricSnapshot?: RubricSnapshot
}): SubmissionFieldDef[] {
  const title = input.title.trim()
  if (!title) throw new Error('Enter a title for this submission link.')
  if (title.length > MAX_PORTAL_TITLE) throw new Error(`Title must be ${MAX_PORTAL_TITLE} characters or fewer.`)
  if (input.instructions.trim().length > MAX_PORTAL_INSTRUCTIONS) {
    throw new Error(`Instructions must be ${MAX_PORTAL_INSTRUCTIONS} characters or fewer.`)
  }
  if (!input.fields.length || input.fields.length > MAX_FIELDS) {
    throw new Error(`Configure between 1 and ${MAX_FIELDS} submission fields.`)
  }
  const seenIds = new Set<string>()
  const cleanedFields: SubmissionFieldDef[] = input.fields.map((field) => {
    const id = ID_PATTERN.test(field.id) ? field.id : generateFieldId('fld')
    if (seenIds.has(id)) {
      throw new Error('Each submission field must have a unique identifier.')
    }
    seenIds.add(id)
    const parsed = SubmissionFieldSchema.safeParse({
      ...field,
      id,
      label: field.label.trim().slice(0, MAX_FIELD_LABEL),
      placeholder: field.placeholder.trim().slice(0, MAX_FIELD_PLACEHOLDER),
    })
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message || 'Check your configured field names.')
    }
    return parsed.data
  })

  if (input.autoMark && !input.rubricSnapshot) {
    throw new Error('Select a rubric to enable automatic marking on submission.')
  }

  return cleanedFields
}

export function buildSubmitterLabel(fields: SubmissionFieldDef[], responses: FieldResponseValue[]): string {
  const shortParts: string[] = []
  for (const field of fields) {
    if (field.type !== 'short_text') continue
    const match = responses.find((r) => r.fieldId === field.id)
    const value = match?.textValue.trim()
    if (value) shortParts.push(value)
    if (shortParts.length >= 2) break
  }
  if (shortParts.length > 0) {
    return shortParts.join(' · ').slice(0, 160)
  }
  const firstNonEmpty = responses.find((r) => r.textValue.trim() || r.fileName.trim())
  if (firstNonEmpty?.fileName.trim()) return firstNonEmpty.fileName.trim().slice(0, 160)
  if (firstNonEmpty?.textValue.trim()) return firstNonEmpty.textValue.trim().slice(0, 60)
  return 'Student submission'
}

export function buildCombinedAnswer(fields: SubmissionFieldDef[], responses: FieldResponseValue[]): string {
  const sections: string[] = []
  const markingFields = fields.filter((f) => f.useForMarking)
  const targetFields = markingFields.length > 0
    ? markingFields
    : fields.filter((f) => f.type === 'long_text' || f.type === 'file')

  for (const field of targetFields) {
    const response = responses.find((r) => r.fieldId === field.id)
    if (!response) continue
    if (field.type === 'file') {
      const extracted = response.extractedText.trim()
      if (extracted) {
        sections.push(
          targetFields.length > 1
            ? `${field.label} (${response.fileName}):\n${extracted}`
            : extracted,
        )
      }
    } else {
      const text = response.textValue.trim()
      if (text) {
        sections.push(targetFields.length > 1 ? `${field.label}:\n${text}` : text)
      }
    }
  }

  return sections.join('\n\n').trim().slice(0, MAX_ANSWER)
}

export async function compressImageToDataUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  try {
    const maxDim = 1100
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height, 1))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Could not prepare the image attachment.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)

    for (const quality of [0.78, 0.65, 0.52, 0.4]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      if (dataUrl.length <= MAX_IMAGE_DATA_URL) return dataUrl
    }

    // Final downscale pass if still large
    const smallCanvas = document.createElement('canvas')
    smallCanvas.width = Math.max(1, Math.round(width * 0.65))
    smallCanvas.height = Math.max(1, Math.round(height * 0.65))
    const smallCtx = smallCanvas.getContext('2d', { alpha: false })
    if (!smallCtx) throw new Error('Could not compress the image attachment.')
    smallCtx.fillStyle = '#ffffff'
    smallCtx.fillRect(0, 0, smallCanvas.width, smallCanvas.height)
    smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height)
    const compact = smallCanvas.toDataURL('image/jpeg', 0.5)
    if (compact.length > MAX_IMAGE_DATA_URL) {
      throw new Error('This image is too detailed to upload directly. Try a closer crop or lower resolution photo.')
    }
    return compact
  } finally {
    bitmap.close()
  }
}

export function dataUrlToBlob(dataUrl: string): Blob | undefined {
  if (!dataUrl || !dataUrl.startsWith('data:')) return undefined
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return undefined
  const header = dataUrl.slice(5, comma)
  const mime = header.split(';')[0] || 'image/jpeg'
  const base64 = dataUrl.slice(comma + 1)
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: mime })
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Transparent, evidence-backed rubric auto-marking fallback
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'onto', 'over', 'under',
  'about', 'above', 'below', 'between', 'through', 'during', 'before', 'after', 'without',
  'within', 'while', 'where', 'which', 'their', 'there', 'these', 'those', 'they', 'them',
  'have', 'has', 'had', 'were', 'been', 'being', 'will', 'would', 'could', 'should', 'must',
  'also', 'only', 'just', 'very', 'more', 'most', 'some', 'such', 'than', 'then', 'when',
  'what', 'does', 'doing', 'done', 'make', 'makes', 'made', 'using', 'used', 'uses', 'each',
  'both', 'other', 'same', 'well', 'clear', 'clearly', 'good', 'shows', 'show', 'give', 'gives',
  'given', 'answer', 'student', 'response', 'criterion', 'mark', 'marks', 'level', 'score',
  'full', 'partial', 'none', 'missing', 'incorrect', 'correct', 'accurate', 'accurately',
  'explain', 'explains', 'explanation', 'describe', 'describes', 'description', 'mentions',
  'mention', 'identifies', 'identify', 'includes', 'include', 'provides', 'provide', 'states',
  'state', 'demonstrates', 'demonstrate', 'discusses', 'discuss', 'presents', 'present',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ''))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
}

function stemMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 5 && b.length >= 5 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5)))) {
    return true
  }
  return false
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
}

export type AutoMarkOutcome = {
  marks: Record<string, number>
  suggestions: Record<string, Suggestion>
  totalEarned: number
  totalPossible: number
  engine: AutoMarkEngine
}

export function autoMarkByRubric(rubricSnapshot: RubricSnapshot, transcript: string): AutoMarkOutcome {
  const cleanTranscript = transcript.trim().slice(0, MAX_ANSWER)
  const sentences = splitSentences(cleanTranscript)
  const answerTokens = tokenize(cleanTranscript)
  const rubricAsFull: Rubric = {
    id: rubricSnapshot.id,
    series: rubricSnapshot.id,
    version: 1,
    title: rubricSnapshot.title,
    question: rubricSnapshot.question,
    criteria: rubricSnapshot.criteria,
  }

  const rawRows = rubricSnapshot.criteria.map((criterion) => {
    const topDescriptor = criterion.levels[criterion.max] ?? ''
    const midDescriptors = criterion.levels.slice(1, criterion.max).join(' ')
    const targetKeywords = Array.from(
      new Set([...tokenize(criterion.title), ...tokenize(topDescriptor), ...tokenize(midDescriptors)]),
    )

    if (!cleanTranscript || answerTokens.length < 3) {
      return {
        id: criterion.id,
        score: 0,
        reason: 'No written text was available to evaluate against this criterion.',
        quote: '',
      }
    }

    // Score each sentence in the student's answer for relevance to this criterion
    let bestSentence = ''
    let bestSentenceHits = 0
    for (const sentence of sentences) {
      const sentTokens = tokenize(sentence)
      let hits = 0
      for (const kw of targetKeywords) {
        if (sentTokens.some((tok) => stemMatch(tok, kw))) hits++
      }
      if (hits > bestSentenceHits) {
        bestSentenceHits = hits
        bestSentence = sentence
      }
    }

    // Compute overall unique keyword coverage across the answer
    const matchedKeywords = targetKeywords.filter((kw) =>
      answerTokens.some((tok) => stemMatch(tok, kw)),
    )
    const coverage = targetKeywords.length > 0 ? matchedKeywords.length / targetKeywords.length : 0

    // Calibrate integer score 0..criterion.max based on keyword coverage + answer substance
    let score = 0
    if (matchedKeywords.length === 0) {
      score = 0
    } else {
      const substanceBonus = answerTokens.length >= 25 ? 0.12 : answerTokens.length >= 12 ? 0.06 : 0
      const ratio = Math.min(1, coverage * 1.45 + substanceBonus)
      score = Math.min(criterion.max, Math.max(1, Math.round(ratio * criterion.max)))
    }

    // Pick a uniquely anchored contiguous quote from the transcript (max 240 chars)
    let quote = ''
    if (score > 0 && bestSentence) {
      const candidate = bestSentence.slice(0, 240).trim()
      const first = cleanTranscript.indexOf(candidate)
      if (first >= 0 && cleanTranscript.indexOf(candidate, first + 1) === -1) {
        quote = candidate
      }
    }

    const levelSummary = criterion.levels[score] ?? ''
    const reason = score === 0
      ? `No clear evidence found for "${criterion.title}".`
      : `Matched key concepts (${matchedKeywords.slice(0, 4).join(', ')}). Aligns with ${score}/${criterion.max}: ${levelSummary}`.slice(0, 380)

    return {
      id: criterion.id,
      score,
      reason,
      quote,
    }
  })

  const suggestions = validateSuggestions(rawRows, rubricAsFull, cleanTranscript)
  const marks: Record<string, number> = {}
  let totalEarned = 0
  let totalPossible = 0

  for (const criterion of rubricSnapshot.criteria) {
    const suggested = suggestions[criterion.id]?.score ?? 0
    const safeScore = Math.min(criterion.max, Math.max(0, Math.round(suggested)))
    marks[criterion.id] = safeScore
    totalEarned += safeScore
    totalPossible += Math.round(criterion.max)
  }

  return {
    marks,
    suggestions,
    totalEarned,
    totalPossible,
    engine: 'rubric-heuristic',
  }
}
