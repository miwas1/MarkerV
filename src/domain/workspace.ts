import { z } from 'zod'

export const MAX_CRITERIA = 6
export const MAX_SCORE = 10
export const MAX_ANSWER = 5500
export const MAX_FEEDBACK = 600
export const MAX_KEY_POINTS = 600
export const MAX_CANDIDATE_REF = 100
export const DEFAULT_PROJECT_ID = 'default-project'

export type Project = { id: string; name: string; description?: string; createdAt: number }
export type Criterion = {
  id: string
  title: string
  max: number
  levels: string[]
  practice: string
  keyPoints?: string
}
export type Rubric = {
  id: string
  series: string
  version: number
  projectId?: string
  title: string
  question: string
  criteria: Criterion[]
  archivedAt?: number
}
export type Provenance = { source: 'device' | 'cloud' | 'unknown' | 'sample' | 'heuristic'; ms?: number }
export type Suggestion = { score: number | null; reason: string; quote: string; start: number | null }
export type Evidence = { start: number; quote: string }
export type OralQuestion = { prompt: string; cue: string }
export type ScriptSourceKind =
  | 'photo'
  | 'pdf'
  | 'docx'
  | 'txt'
  | 'google-drive'
  | 'google-docs'
  | 'google-sheets'
  | 'gmail'
  | 'google-forms'
  | 'submission-link'
export type ScriptSource = { name: string; kind: ScriptSourceKind }
export type Script = {
  id: string
  sequence: number
  revision: number
  createdAt: number
  projectId?: string
  rubricId?: string
  /** Optional local-only candidate/student identifier for post-marking collation. Hidden during blind marking and never sent to AI. */
  candidateRef?: string
  photo?: Blob
  photoHash?: string
  sourceFile?: ScriptSource
  transcript: string
  confirmed: boolean
  marks: Record<string, number>
  evidence?: Record<string, Evidence>
  suggestions?: Record<string, Suggestion>
  provenance?: Provenance
  transcriptSource?: Provenance
  finalisedAt?: number
  secondReview?: boolean
  feedback: Record<string, string>
  oral?: OralQuestion[]
  feedbackSource?: Provenance
}
export type Workspace = {
  projects: Project[]
  activeProjectId: string
  rubrics: Rubric[]
  scripts: Script[]
  nextSequence: number
  allowCloud: boolean
}

export const defaultProject = (): Project => ({
  id: DEFAULT_PROJECT_ID,
  name: 'Default project',
  description: 'Default workspace project. Create more projects to keep each course, module, or exam separate.',
  createdAt: 0,
})

export const newWorkspace = (): Workspace => ({
  projects: [defaultProject()],
  activeProjectId: DEFAULT_PROJECT_ID,
  rubrics: [],
  scripts: [],
  nextSequence: 1,
  allowCloud: false,
})

export function normalizeWorkspace(raw: Partial<Workspace> | undefined): Workspace {
  if (!raw) return newWorkspace()
  const projects = Array.isArray(raw.projects) && raw.projects.length > 0
    ? raw.projects
    : [defaultProject()]
  const fallbackId = projects[0].id
  const activeProjectId = raw.activeProjectId && projects.some((p) => p.id === raw.activeProjectId)
    ? raw.activeProjectId
    : fallbackId
  const rubrics = (raw.rubrics ?? []).map((rubric) => {
    const projectId = rubric.projectId && projects.some((p) => p.id === rubric.projectId)
      ? rubric.projectId
      : fallbackId
    const criteria = (rubric.criteria ?? []).map((criterion) => ({
      ...criterion,
      keyPoints: criterion.keyPoints ?? '',
    }))
    return { ...rubric, projectId, criteria }
  })
  const rubricProjectById = new Map(rubrics.map((rubric) => [rubric.id, rubric.projectId ?? fallbackId]))
  const scripts = (raw.scripts ?? []).map((script) => {
    if (script.projectId && projects.some((p) => p.id === script.projectId)) return script
    const inferred = (script.rubricId && rubricProjectById.get(script.rubricId)) || fallbackId
    return { ...script, projectId: inferred }
  })
  return {
    projects,
    activeProjectId,
    rubrics,
    scripts,
    nextSequence: typeof raw.nextSequence === 'number' && raw.nextSequence >= 1 ? raw.nextSequence : scripts.length + 1,
    allowCloud: Boolean(raw.allowCloud),
  }
}

export function activeProjectOf(workspace: Workspace): Project {
  return workspace.projects.find((p) => p.id === workspace.activeProjectId) ?? workspace.projects[0] ?? defaultProject()
}

export function projectRubrics(workspace: Workspace, projectId = workspace.activeProjectId): Rubric[] {
  return workspace.rubrics.filter((rubric) => (rubric.projectId ?? workspace.projects[0]?.id ?? DEFAULT_PROJECT_ID) === projectId)
}

export function latestRubrics(
  workspace: Workspace,
  projectId = workspace.activeProjectId,
  includeArchived = false,
): Rubric[] {
  const rows = projectRubrics(workspace, projectId)
  return rows.filter(
    (rubric) =>
      !rows.some((other) => other.series === rubric.series && other.version > rubric.version) &&
      (includeArchived || !rubric.archivedAt),
  )
}

export function latestOf(workspace: Workspace, rubric: Rubric): Rubric {
  return workspace.rubrics
    .filter((row) => row.series === rubric.series)
    .reduce((best, candidate) => (candidate.version > best.version ? candidate : best), rubric)
}

export function rubricInUse(workspace: Workspace, rubricId: string): boolean {
  return workspace.scripts.some(
    (script) =>
      script.rubricId === rubricId &&
      (Boolean(script.finalisedAt) ||
        Boolean(script.suggestions) ||
        Object.keys(script.marks ?? {}).length > 0 ||
        Object.keys(script.evidence ?? {}).length > 0),
  )
}

export function markedScriptsCount(workspace: Workspace, rubricId: string): number {
  return workspace.scripts.filter(
    (script) =>
      script.rubricId === rubricId &&
      (Boolean(script.finalisedAt) ||
        Boolean(script.suggestions) ||
        Object.keys(script.marks ?? {}).length > 0 ||
        Object.keys(script.evidence ?? {}).length > 0),
  ).length
}

export function seriesInUse(workspace: Workspace, series: string): boolean {
  const ids = new Set(workspace.rubrics.filter((r) => r.series === series).map((r) => r.id))
  return workspace.scripts.some((script) => Boolean(script.rubricId && ids.has(script.rubricId)))
}

export function unfinalisedScriptsOnOlderVersions(workspace: Workspace, series: string): Script[] {
  const versions = workspace.rubrics.filter((r) => r.series === series)
  if (versions.length < 2) return []
  const latest = versions.reduce((a, b) => (b.version > a.version ? b : a))
  const olderIds = new Set(versions.filter((r) => r.id !== latest.id).map((r) => r.id))
  return workspace.scripts.filter((script) => !script.finalisedAt && Boolean(script.rubricId && olderIds.has(script.rubricId)))
}

export function moveUnfinalisedScriptsToLatest(workspace: Workspace, series: string): Workspace {
  const versions = workspace.rubrics.filter((r) => r.series === series)
  if (versions.length < 2) return workspace
  const latest = versions.reduce((a, b) => (b.version > a.version ? b : a))
  const olderIds = new Set(versions.filter((r) => r.id !== latest.id).map((r) => r.id))
  let changed = false
  const scripts = workspace.scripts.map((script) => {
    if (!script.finalisedAt && script.rubricId && olderIds.has(script.rubricId)) {
      changed = true
      return { ...resetReview(script, { rubricId: latest.id }), revision: script.revision + 1 }
    }
    return script
  })
  return changed ? { ...workspace, scripts } : workspace
}

export function archiveRubricSeries(workspace: Workspace, series: string, archived: boolean): Workspace {
  const stamp = archived ? Date.now() : undefined
  return {
    ...workspace,
    rubrics: workspace.rubrics.map((rubric) =>
      rubric.series === series ? { ...rubric, archivedAt: stamp } : rubric,
    ),
  }
}

export function deleteRubricSeries(workspace: Workspace, series: string): Workspace {
  if (seriesInUse(workspace, series)) {
    throw new Error('This rubric cannot be deleted while scripts reference it. Archive it instead.')
  }
  return {
    ...workspace,
    rubrics: workspace.rubrics.filter((rubric) => rubric.series !== series),
  }
}

export function copyRubricToProject(workspace: Workspace, rubricId: string, targetProjectId: string): Workspace {
  const source = workspace.rubrics.find((rubric) => rubric.id === rubricId)
  if (!source) throw new Error('Source rubric not found.')
  if (!workspace.projects.some((project) => project.id === targetProjectId)) {
    throw new Error('Target project not found.')
  }
  const newId = crypto.randomUUID()
  const copy: Rubric = {
    ...source,
    id: newId,
    series: newId,
    version: 1,
    projectId: targetProjectId,
    archivedAt: undefined,
    criteria: source.criteria.map((criterion) => ({
      ...criterion,
      id: crypto.randomUUID(),
      levels: [...criterion.levels],
      keyPoints: criterion.keyPoints ?? '',
    })),
  }
  return {
    ...workspace,
    rubrics: [...workspace.rubrics, copy],
  }
}

export function projectScripts(workspace: Workspace, projectId = workspace.activeProjectId): Script[] {
  return workspace.scripts.filter((script) => (script.projectId ?? workspace.projects[0]?.id ?? DEFAULT_PROJECT_ID) === projectId)
}

export function createProject(workspace: Workspace, name: string, description = ''): Workspace {
  const cleanName = name.trim().slice(0, 80)
  if (!cleanName) throw new Error('Enter a project name.')
  if (workspace.projects.some((p) => p.name.trim().toLowerCase() === cleanName.toLowerCase())) {
    throw new Error('A project with this name already exists.')
  }
  const project: Project = {
    id: crypto.randomUUID(),
    name: cleanName,
    description: description.trim().slice(0, 240),
    createdAt: Date.now(),
  }
  return {
    ...workspace,
    projects: [...workspace.projects, project],
    activeProjectId: project.id,
  }
}

export function updateProject(workspace: Workspace, projectId: string, name: string, description = ''): Workspace {
  const cleanName = name.trim().slice(0, 80)
  if (!cleanName) throw new Error('Enter a project name.')
  if (workspace.projects.some((p) => p.id !== projectId && p.name.trim().toLowerCase() === cleanName.toLowerCase())) {
    throw new Error('Another project already uses this name.')
  }
  return {
    ...workspace,
    projects: workspace.projects.map((project) =>
      project.id === projectId ? { ...project, name: cleanName, description: description.trim().slice(0, 240) } : project,
    ),
  }
}

export function deleteProject(workspace: Workspace, projectId: string): Workspace {
  if (workspace.projects.length <= 1) {
    throw new Error('Keep at least one project in your workspace.')
  }
  const remaining = workspace.projects.filter((project) => project.id !== projectId)
  if (remaining.length === workspace.projects.length) return workspace
  const nextActive = workspace.activeProjectId === projectId ? remaining[0].id : workspace.activeProjectId
  return {
    ...workspace,
    projects: remaining,
    activeProjectId: nextActive,
    rubrics: workspace.rubrics.filter((rubric) => rubric.projectId !== projectId),
    scripts: workspace.scripts.filter((script) => script.projectId !== projectId),
  }
}

export function setActiveProject(workspace: Workspace, projectId: string): Workspace {
  if (!workspace.projects.some((project) => project.id === projectId)) return workspace
  return { ...workspace, activeProjectId: projectId }
}

export const newCriterion = (): Criterion => ({
  id: crypto.randomUUID(),
  title: '',
  max: 2,
  levels: ['', '', ''],
  practice: '',
  keyPoints: '',
})
export const scriptName = (script: Script) => 'Script ' + String(script.sequence).padStart(3, '0')
export function scriptSourceLabel(script: Script): string {
  switch (script.sourceFile?.kind) {
    case 'pdf': return script.photo ? 'Scanned PDF' : 'PDF'
    case 'docx': return 'DOCX'
    case 'txt': return 'TXT'
    case 'google-drive': return 'Google Drive'
    case 'google-docs': return 'Google Docs'
    case 'google-sheets': return 'Google Sheets'
    case 'gmail': return 'Gmail'
    case 'google-forms': return 'Google Forms'
    case 'submission-link': return 'Submission link'
    default: return script.photo ? 'Photo' : 'Typed'
  }
}
export const total = (rubric: Rubric) => rubric.criteria.reduce((sum, criterion) => sum + criterion.max, 0)
export const earned = (script: Script, rubric: Rubric) =>
  rubric.criteria.reduce((sum, criterion) => sum + (script.marks[criterion.id] ?? 0), 0)

export function isScore(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
}

export function reviewedCount(script: Script, rubric: Rubric) {
  return rubric.criteria.filter((criterion) => isScore(script.marks[criterion.id], criterion.max)).length
}

export function statusOf(script: Script) {
  if (script.finalisedAt) return 'Finalised'
  if (Object.keys(script.marks).length) return 'In review'
  if (script.confirmed) return 'Ready to review'
  return 'Draft'
}

export function levelText(criterion: Criterion, score: number): string {
  const own = criterion.levels[score]?.trim()
  if (own) return own
  let lo = score - 1
  while (lo > 0 && !criterion.levels[lo]?.trim()) lo--
  let hi = score + 1
  while (hi < criterion.max && !criterion.levels[hi]?.trim()) hi++
  const lowDesc = criterion.levels[lo]?.trim() ?? ''
  const highDesc = criterion.levels[hi]?.trim() ?? ''
  if (lowDesc && highDesc) {
    return `Between "${lowDesc}" (${lo} ${lo === 1 ? 'mark' : 'marks'}) and "${highDesc}" (${hi} ${hi === 1 ? 'mark' : 'marks'}).`
  }
  return lowDesc || highDesc || `Partial credit (${score} of ${criterion.max} marks).`
}

export function expandedCriteria(rubric: Pick<Rubric, 'criteria'>): Criterion[] {
  return rubric.criteria.map((criterion) => ({
    ...criterion,
    levels: criterion.levels.map((_, score) => levelText(criterion, score)),
  }))
}

export function validateRubric(rubric: Rubric) {
  if (!rubric.title.trim() || !rubric.question.trim()) throw new Error('Add an assessment title and question.')
  if (!rubric.criteria.length || rubric.criteria.length > MAX_CRITERIA) throw new Error('Use one to six criteria.')
  if (new Set(rubric.criteria.map((criterion) => criterion.id)).size !== rubric.criteria.length) {
    throw new Error('Each criterion needs a unique ID.')
  }
  for (const criterion of rubric.criteria) {
    if (
      !criterion.title.trim() ||
      !isScore(criterion.max, MAX_SCORE) ||
      criterion.max < 1 ||
      criterion.levels.length !== criterion.max + 1 ||
      !criterion.levels[0]?.trim() ||
      !criterion.levels[criterion.max]?.trim()
    ) {
      throw new Error('Give every criterion a title and describe at least 0 marks and full marks.')
    }
  }
}

const rawSuggestions = z.array(z.object({
  id: z.string(), score: z.number().int().nullable(), reason: z.string().max(400), quote: z.string().max(600),
})).max(MAX_CRITERIA)

export function validateSuggestions(value: unknown, rubric: Rubric, transcript: string): Record<string, Suggestion> {
  const rows = rawSuggestions.parse(value)
  if (rows.length !== rubric.criteria.length || new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error('The response did not cover every criterion once. Try again or mark manually.')
  }
  return Object.fromEntries(rubric.criteria.map((criterion) => {
    const row = rows.find((candidate) => candidate.id === criterion.id)
    if (!row || (row.score !== null && !isScore(row.score, criterion.max))) {
      throw new Error('A suggested mark is outside the rubric. Try again or mark manually.')
    }
    const quote = row.quote.trim()
    const first = quote ? transcript.indexOf(quote) : -1
    const anchored = first >= 0 && transcript.indexOf(quote, first + 1) === -1
    return [criterion.id, { score: row.score, reason: row.reason, quote, start: anchored ? first : null }]
  }))
}

export function canAccept(suggestion: Suggestion) {
  return suggestion.score !== null && (suggestion.start !== null || (suggestion.score === 0 && !suggestion.quote))
}

export function updateScript(workspace: Workspace, id: string, revision: number, update: (script: Script) => Script): Workspace {
  const current = workspace.scripts.find((script) => script.id === id)
  if (!current || current.revision !== revision) throw new Error('This script changed. Reload it and try again.')
  const edited = { ...update(current), revision: current.revision + 1 }
  return { ...workspace, scripts: workspace.scripts.map((script) => script.id === id ? edited : script) }
}

export function addScript(
  workspace: Workspace,
  draft: Pick<Script, 'id' | 'projectId' | 'photo' | 'photoHash' | 'sourceFile' | 'transcript' | 'rubricId'> &
    Partial<Pick<Script, 'confirmed' | 'marks' | 'suggestions' | 'provenance' | 'candidateRef'>>,
): Workspace {
  if (workspace.scripts.some((script) => script.id === draft.id)) return workspace
  const projectId = draft.projectId ?? workspace.activeProjectId ?? DEFAULT_PROJECT_ID
  const cleanCandidate = draft.candidateRef?.trim().slice(0, MAX_CANDIDATE_REF)
  const script: Script = {
    ...draft,
    projectId,
    candidateRef: cleanCandidate || undefined,
    sequence: workspace.nextSequence,
    revision: 0,
    createdAt: Date.now(),
    confirmed: draft.confirmed ?? false,
    marks: draft.marks ?? {},
    feedback: {},
  }
  return { ...workspace, nextSequence: workspace.nextSequence + 1, scripts: [script, ...workspace.scripts] }
}

export function resetReview(script: Script, changes: Partial<Pick<Script, 'rubricId' | 'transcript' | 'confirmed'>>): Script {
  return {
    ...script, ...changes, marks: {}, evidence: undefined, suggestions: undefined, provenance: undefined, finalisedAt: undefined,
    feedback: {}, oral: undefined, feedbackSource: undefined, secondReview: undefined,
  }
}

const rubricSignature = (rubric: Rubric) =>
  rubric.criteria.map((criterion) => `${criterion.id}:${criterion.max}`).join('|')

export function compatibleVersions(workspace: Workspace, rubric: Rubric): Rubric[] {
  const sig = rubricSignature(rubric)
  return workspace.rubrics
    .filter((candidate) => candidate.series === rubric.series && rubricSignature(candidate) === sig)
    .sort((a, b) => a.version - b.version)
}

export type ClassPictureEntry = {
  rubric: Rubric
  versions: Rubric[]
  hasMultipleGroupsInSeries: boolean
}

export function classPictureEntries(
  workspace: Workspace,
  projectId = workspace.activeProjectId,
): ClassPictureEntry[] {
  const rows = projectRubrics(workspace, projectId)
  const groups = new Map<string, Rubric[]>()
  const seriesGroupCount = new Map<string, Set<string>>()

  for (const row of rows) {
    const sig = rubricSignature(row)
    const key = `${row.series}::${sig}`
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
    const sigs = seriesGroupCount.get(row.series) ?? new Set<string>()
    sigs.add(sig)
    seriesGroupCount.set(row.series, sigs)
  }

  return Array.from(groups.values()).map((bucket) => {
    const sorted = [...bucket].sort((a, b) => a.version - b.version)
    const latest = sorted[sorted.length - 1]
    return {
      rubric: latest,
      versions: sorted,
      hasMultipleGroupsInSeries: (seriesGroupCount.get(latest.series)?.size ?? 1) > 1,
    }
  })
}

export function formatMergedVersionsLabel(versions: Rubric[]): string {
  if (versions.length <= 1) return ''
  const nums = versions.map((v) => v.version).sort((a, b) => a - b)
  const contiguous = nums.every((num, idx) => idx === 0 || num === nums[idx - 1] + 1)
  if (contiguous) {
    return `Includes v${nums[0]}–v${nums[nums.length - 1]} (same criteria)`
  }
  return `Includes ${nums.map((n) => `v${n}`).join(', ')} (same criteria)`
}

export function cohort(workspace: Workspace, rubric: Rubric) {
  const ids = new Set(compatibleVersions(workspace, rubric).map((row) => row.id))
  const scripts = workspace.scripts.filter(
    (script) =>
      Boolean(script.rubricId && ids.has(script.rubricId)) &&
      Boolean(script.finalisedAt) &&
      rubric.criteria.every((criterion) => isScore(script.marks[criterion.id], criterion.max)),
  )
  return rubric.criteria.map((criterion, index) => ({
    criterion: index + 1,
    title: criterion.title,
    total: scripts.length,
    below: scripts.filter((script) => script.marks[criterion.id] < criterion.max).length,
  }))
}

export const Aggregate = z.object({
  criterion: z.number().int().min(1).max(MAX_CRITERIA),
  total: z.number().int().min(10).max(10000),
  below: z.number().int().min(3),
}).strict().refine((row) => row.total - row.below >= 3)
export type Aggregate = z.infer<typeof Aggregate>

export function cloudRows(rows: ReturnType<typeof cohort>): Aggregate[] {
  return rows.flatMap(({ criterion, total, below }) => {
    const checked = Aggregate.safeParse({ criterion, total, below })
    return checked.success ? [checked.data] : []
  })
}

export const FeedbackFile = z.object({
  version: z.literal(1),
  title: z.string().min(1).max(100),
  criteria: z.array(z.object({
    title: z.string().min(1).max(90), score: z.number().int().min(0).max(MAX_SCORE),
    max: z.number().int().min(1).max(MAX_SCORE), feedback: z.string().max(MAX_FEEDBACK),
    prompt: z.string().min(1).max(240), cue: z.string().min(1).max(MAX_FEEDBACK),
  }).refine((criterion) => criterion.score <= criterion.max)).min(1).max(MAX_CRITERIA),
}).strict()
export type FeedbackFile = z.infer<typeof FeedbackFile>

export function makeFeedback(script: Script, rubric: Rubric): FeedbackFile {
  if (!script.finalisedAt) throw new Error('Finalise the marks before exporting feedback.')
  return FeedbackFile.parse({
    version: 1,
    title: rubric.title,
    criteria: rubric.criteria.map((criterion) => ({
      title: criterion.title, score: script.marks[criterion.id], max: criterion.max,
      feedback: script.feedback[criterion.id] ?? '',
      prompt: criterion.practice || 'Explain ' + criterion.title + ' in your own words and give an example.',
      cue: levelText(criterion, criterion.max),
    })),
  })
}
