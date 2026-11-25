import { z } from 'zod'
import {
  expandedCriteria,
  MAX_ANSWER,
  MAX_CRITERIA,
  MAX_KEY_POINTS,
  MAX_SCORE,
  type Criterion,
  type Rubric,
} from './workspace.ts'

export const ON_DEVICE_TOKEN_THRESHOLD = 6000

const LEVEL_PREFIX = /^\s*(?:level\s*)?\d+\s*(?:marks?|pts?|points?)?\s*[-–—:.)]\s*/i
const meaningful = (text: string) => /[a-z]{3,}/i.test(text)

export class DraftFormatError extends Error {
  constructor(message = 'The AI draft had invalid scoring levels.') {
    super(message)
    this.name = 'DraftFormatError'
  }
}

export function repairDraft(raw: unknown): { criteria: Criterion[]; notes: string[] } {
  let rows: Array<{ title: string; max: number; levels: string[]; practice: string }>
  try {
    rows = z
      .object({
        criteria: z
          .array(
            z.object({
              title: z.string(),
              max: z.number(),
              levels: z.array(z.string()),
              practice: z.string().optional().default(''),
            }),
          )
          .min(1),
      })
      .parse(raw)
      .criteria.slice(0, MAX_CRITERIA)
  } catch {
    throw new DraftFormatError()
  }

  const notes: string[] = []
  const criteria: Criterion[] = rows.map((row, index) => {
    const title = row.title.trim().slice(0, 90)
    if (!title || !meaningful(title)) throw new DraftFormatError()
    const levels = row.levels.map((level) => level.replace(LEVEL_PREFIX, '').trim().slice(0, 600))
    if (levels.length < 2 || levels.length > MAX_SCORE + 1 || !levels.every(meaningful)) {
      throw new DraftFormatError()
    }
    const max = levels.length - 1
    if (max !== row.max) {
      notes.push(`Adjusted C${index + 1} to ${max} ${max === 1 ? 'mark' : 'marks'} to match its ${levels.length} level descriptions.`)
    }
    return {
      id: crypto.randomUUID(),
      title,
      max,
      levels,
      practice: row.practice.trim().slice(0, 200),
      keyPoints: '',
    }
  })

  return { criteria, notes }
}

const clip = (n: number) => z.string().trim().min(1).transform((s) => s.slice(0, n))

export const TeachingPlanSchema = z.object({
  priorities: z
    .array(
      z.object({
        criterion: z.number().int(),
        misconception: clip(280),
        activity: clip(360),
        checkPrompt: clip(240),
      }),
    )
    .min(1)
    .transform((arr) => arr.slice(0, 3)),
})

const RawAuditIssue = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object') return value
    const record = value as Record<string, unknown>
    const replacement =
      typeof record.replacement === 'string' && record.replacement.trim()
        ? record.replacement
        : typeof record.suggestion === 'string'
          ? record.suggestion
          : ''
    return { ...record, replacement }
  },
  z.object({
    criterionTitle: clip(100),
    field: z.enum(['question', 'title', 'level']).catch('level'),
    level: z
      .union([z.number().int().min(0).max(MAX_SCORE), z.null()])
      .optional()
      .transform((val) => (typeof val === 'number' ? val : null)),
    issue: clip(260),
    replacement: clip(600),
  }),
)

export const RubricAuditSchema = z.object({
  summary: clip(400),
  issues: z.array(RawAuditIssue).transform((arr) => arr.slice(0, 6)),
})

export type AuditIssue = z.infer<typeof RawAuditIssue>
export type ParsedRubricAudit = z.infer<typeof RubricAuditSchema>

export const PracticeDraftSchema = z.object({
  practice: z.array(z.string().trim().min(1).transform((s) => s.slice(0, 200))).min(1),
})

/**
 * Parses a model reply as JSON. A truncated or malformed reply still throws a `SyntaxError`
 * (so format retries keep working), but with a message that is safe to show to a lecturer.
 */
export function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new SyntaxError('The AI reply was incomplete or not in the expected format. Try again or continue manually.')
  }
}

export function isCloudFormatError(error: unknown): boolean {
  return (
    error instanceof z.ZodError ||
    error instanceof SyntaxError ||
    error instanceof DraftFormatError ||
    (error instanceof Error && /^Invalid (teaching summary|comparison|practice draft)/.test(error.message))
  )
}

export function describeCloudErrorMessage(error: unknown, fallback: string, cloudModel: string): Error {
  if (isCloudFormatError(error)) {
    return new Error('The cloud reply was not in the expected format. Try again.')
  }
  const lower = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  if (/quota|429|resource_exhausted/.test(lower)) {
    return new Error('Cloud AI quota was exceeded. Wait a moment and try again, or continue locally.')
  }
  if (/app ?check|\b401\b|\b403\b/.test(lower)) {
    return new Error('Firebase App Check or API permissions blocked this cloud request.')
  }
  if (/\b404\b|models\/[^ ]+ (is )?not found|not supported for generatecontent/.test(lower)) {
    return new Error(`The configured cloud model (${cloudModel}) is unavailable in this Firebase project.`)
  }
  if (/has not been used|service_disabled/.test(lower)) {
    return new Error('Firebase AI Logic is not enabled in this Firebase project yet.')
  }
  return new Error(fallback)
}

export function buildMarkingPromptCriteria(rubric: Pick<Rubric, 'criteria'>) {
  return expandedCriteria(rubric).map((criterion) => ({
    id: criterion.id,
    title: criterion.title,
    max: criterion.max,
    levels: criterion.levels,
    ...(criterion.keyPoints?.trim() ? { keyPoints: criterion.keyPoints.trim().slice(0, MAX_KEY_POINTS) } : {}),
  }))
}

export function estimateMarkingTokens(
  rubric: Pick<Rubric, 'question' | 'criteria'>,
  transcript: string,
): number {
  const payload = {
    question: rubric.question,
    criteria: buildMarkingPromptCriteria(rubric),
    transcript: transcript.slice(0, MAX_ANSWER),
  }
  return Math.ceil(JSON.stringify(payload).length / 3.5)
}

export function estimateRubricTokens(rubric: Pick<Rubric, 'question' | 'criteria'>): number {
  const payload = {
    question: rubric.question,
    criteria: buildMarkingPromptCriteria(rubric),
  }
  return Math.ceil(JSON.stringify(payload).length / 3.5)
}
