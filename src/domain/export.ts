import {
  compatibleVersions,
  earned,
  isScore,
  levelText,
  makeFeedback,
  scriptName,
  scriptSourceLabel,
  statusOf,
  total,
  type OralQuestion,
  type Provenance,
  type Rubric,
  type Script,
  type Workspace,
} from './workspace.ts'

export type CollatedRow = {
  script: Script
  scriptLabel: string
  candidateRef: string
  rubricVersion: number
  sourceLabel: string
  status: string
  finalised: boolean
  flagged: boolean
  scores: Array<number | null>
  earned: number | null
  max: number
  percent: number | null
  aiSuggestedCount: number
  lecturerChangedCount: number
  finalisedAtIso: string
}

export type CollatedSummary = {
  totalScripts: number
  finalisedCount: number
  awaitingCount: number
  flaggedCount: number
  maxMarks: number
  meanEarned: number | null
  medianEarned: number | null
  minEarned: number | null
  maxEarned: number | null
  meanPercent: number | null
  aiSuggestedCriteria: number
  lecturerChangedCriteria: number
}

export type CollatedAssessment = {
  rubric: Rubric
  versions: Rubric[]
  rows: CollatedRow[]
  summary: CollatedSummary
}

export function slugifyFilename(value: string, fallback = 'export'): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || fallback
}

export function feedbackDownloadName(script: Script, rubric: Rubric, ext: 'json' | 'txt' = 'json'): string {
  const rubricSlug = slugifyFilename(rubric.title, 'assessment')
  const whoSlug = script.candidateRef?.trim()
    ? slugifyFilename(script.candidateRef, slugifyFilename(scriptName(script), 'script'))
    : slugifyFilename(scriptName(script), 'script')
  return `${rubricSlug}-${whoSlug}-feedback.${ext}`
}

/**
 * Escapes a single CSV field (RFC 4180) and neutralises spreadsheet formula injection
 * when a string starts with `=`, `+`, `-`, `@`, tab, or CR.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = typeof value === 'number' || typeof value === 'boolean' ? String(value) : value
  if (typeof value === 'string' && text.length > 0 && /^[=+\-@\t\r]/.test(text)) {
    text = "'" + text
  }
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"'
  }
  return text
}

function csvLine(cells: Array<string | number | boolean | null | undefined>): string {
  return cells.map(csvCell).join(',')
}

export function defaultOralQuestions(script: Script, rubric: Rubric): OralQuestion[] {
  const criteria = [...rubric.criteria].sort((a, b) => {
    const aLost = a.max - (script.marks[a.id] ?? 0)
    const bLost = b.max - (script.marks[b.id] ?? 0)
    return bLost - aLost
  })
  return Array.from({ length: 3 }, (_, index) => {
    const criterion = criteria[index % criteria.length]
    const prompt = [
      criterion.practice || 'Explain ' + criterion.title + ' in your own words.',
      'Give an example that demonstrates ' + criterion.title + '.',
      'What common mistake would you avoid when explaining ' + criterion.title + '?',
    ][index]
    return { prompt, cue: levelText(criterion, criterion.max) }
  })
}

export function provenanceLabel(provenance?: Provenance): string {
  switch (provenance?.source) {
    case 'device':
      return 'On this device'
    case 'cloud':
      return 'Cloud'
    case 'sample':
      return 'Sample result'
    case 'heuristic':
      return 'Keyword match (not AI)'
    case 'unknown':
      return 'Source unavailable'
    default:
      return 'Manual'
  }
}

export function collateAssessment(workspace: Workspace, rubric: Rubric): CollatedAssessment {
  const versions = compatibleVersions(workspace, rubric)
  const versionById = new Map(versions.map((item) => [item.id, item.version]))
  const maxMarks = total(rubric)

  const matchingScripts = workspace.scripts
    .filter((script) => Boolean(script.rubricId && versionById.has(script.rubricId)))
    .slice()
    .sort((a, b) => a.sequence - b.sequence)

  const rows: CollatedRow[] = matchingScripts.map((script) => {
    const scores = rubric.criteria.map((criterion) =>
      isScore(script.marks[criterion.id], criterion.max) ? script.marks[criterion.id] : null,
    )
    const allReviewed = scores.every((score) => score !== null)
    const finalised = Boolean(script.finalisedAt) && allReviewed
    const earnedMarks = allReviewed ? earned(script, rubric) : null
    const percent = earnedMarks !== null && maxMarks > 0 ? Math.round((earnedMarks / maxMarks) * 1000) / 10 : null

    let aiSuggestedCount = 0
    let lecturerChangedCount = 0
    for (const criterion of rubric.criteria) {
      const suggested = script.suggestions?.[criterion.id]?.score
      const finalScore = script.marks[criterion.id]
      if (typeof suggested === 'number') {
        aiSuggestedCount++
        if (isScore(finalScore, criterion.max) && finalScore !== suggested) {
          lecturerChangedCount++
        }
      }
    }

    return {
      script,
      scriptLabel: scriptName(script),
      candidateRef: script.candidateRef?.trim() ?? '',
      rubricVersion: versionById.get(script.rubricId!) ?? rubric.version,
      sourceLabel: scriptSourceLabel(script) + (script.sourceFile?.name ? ' · ' + script.sourceFile.name : ''),
      status: statusOf(script),
      finalised,
      flagged: Boolean(script.secondReview),
      scores,
      earned: earnedMarks,
      max: maxMarks,
      percent,
      aiSuggestedCount,
      lecturerChangedCount,
      finalisedAtIso: script.finalisedAt ? new Date(script.finalisedAt).toISOString() : '',
    }
  })

  const finalisedTotals = rows
    .filter((row) => row.finalised && row.earned !== null)
    .map((row) => row.earned!)
    .sort((a, b) => a - b)

  const meanEarned = finalisedTotals.length
    ? Math.round((finalisedTotals.reduce((sum, value) => sum + value, 0) / finalisedTotals.length) * 100) / 100
    : null
  const medianEarned = finalisedTotals.length
    ? finalisedTotals.length % 2 === 1
      ? finalisedTotals[(finalisedTotals.length - 1) / 2]
      : Math.round(((finalisedTotals[finalisedTotals.length / 2 - 1] + finalisedTotals[finalisedTotals.length / 2]) / 2) * 100) / 100
    : null
  const minEarned = finalisedTotals.length ? finalisedTotals[0] : null
  const maxEarned = finalisedTotals.length ? finalisedTotals[finalisedTotals.length - 1] : null
  const meanPercent = meanEarned !== null && maxMarks > 0 ? Math.round((meanEarned / maxMarks) * 1000) / 10 : null

  return {
    rubric,
    versions,
    rows,
    summary: {
      totalScripts: rows.length,
      finalisedCount: finalisedTotals.length,
      awaitingCount: rows.length - finalisedTotals.length,
      flaggedCount: rows.filter((row) => row.flagged).length,
      maxMarks,
      meanEarned,
      medianEarned,
      minEarned,
      maxEarned,
      meanPercent,
      aiSuggestedCriteria: rows.reduce((sum, row) => sum + row.aiSuggestedCount, 0),
      lecturerChangedCriteria: rows.reduce((sum, row) => sum + row.lecturerChangedCount, 0),
    },
  }
}

export function buildMarksheetCsv(
  collated: CollatedAssessment,
  options?: { finalisedOnly?: boolean },
): string {
  const rows = options?.finalisedOnly ? collated.rows.filter((row) => row.finalised) : collated.rows
  const headers = [
    'Script',
    'Candidate ID',
    'Assessment',
    'Rubric Version',
    'Source',
    'Status',
    'Second Review',
    ...collated.rubric.criteria.map((criterion, index) => `C${index + 1}: ${criterion.title} (/${criterion.max})`),
    'Total',
    'Max',
    'Percent',
    'Finalised At',
    'Feedback Summary',
  ]

  const lines = [csvLine(headers)]
  for (const row of rows) {
    const feedbackSummary = collated.rubric.criteria
      .map((criterion, index) => {
        const note = row.script.feedback[criterion.id]?.trim()
        return note ? `C${index + 1} (${criterion.title}): ${note}` : ''
      })
      .filter(Boolean)
      .join(' | ')

    lines.push(
      csvLine([
        row.scriptLabel,
        row.candidateRef,
        collated.rubric.title,
        `v${row.rubricVersion}`,
        row.sourceLabel,
        row.status,
        row.flagged ? 'Yes' : 'No',
        ...row.scores.map((score) => (score === null ? '' : score)),
        row.earned === null ? '' : row.earned,
        row.max,
        row.percent === null ? '' : `${row.percent}%`,
        row.finalisedAtIso,
        feedbackSummary,
      ]),
    )
  }
  return lines.join('\r\n') + '\r\n'
}

export function buildAuditLogCsv(collated: CollatedAssessment): string {
  const headers = [
    'Script',
    'Candidate ID',
    'Status',
    'Criterion',
    'Max Marks',
    'AI Suggested Mark',
    'Verified Quote',
    'AI Reason',
    'Lecturer Final Mark',
    'Human Decision',
    'Inference Source',
    'Finalised At',
  ]
  const lines = [csvLine(headers)]
  for (const row of collated.rows) {
    const source = provenanceLabel(row.script.provenance)
    for (let index = 0; index < collated.rubric.criteria.length; index++) {
      const criterion = collated.rubric.criteria[index]
      const suggestion = row.script.suggestions?.[criterion.id]
      const finalScore = row.scores[index]
      const suggestedScore = suggestion?.score ?? null
      const verifiedQuote = suggestion?.start !== null && suggestion?.quote ? suggestion.quote : ''
      const decision =
        finalScore === null
          ? 'Pending'
          : suggestedScore === null
            ? 'Marked manually'
            : finalScore === suggestedScore
              ? 'Accepted AI'
              : 'Changed by lecturer'

      lines.push(
        csvLine([
          row.scriptLabel,
          row.candidateRef,
          row.status,
          `C${index + 1}: ${criterion.title}`,
          criterion.max,
          suggestedScore === null ? '' : suggestedScore,
          verifiedQuote,
          suggestion?.reason ?? '',
          finalScore === null ? '' : finalScore,
          decision,
          suggestion ? source : 'Manual',
          row.finalisedAtIso,
        ]),
      )
    }
  }
  return lines.join('\r\n') + '\r\n'
}

export function formatStudentFeedbackText(script: Script, rubric: Rubric): string {
  const released = makeFeedback(script, rubric)
  const totalEarned = released.criteria.reduce((sum, item) => sum + item.score, 0)
  const totalMax = released.criteria.reduce((sum, item) => sum + item.max, 0)
  const lines = [
    released.title,
    `Total: ${totalEarned} / ${totalMax} marks`,
    '',
  ]
  released.criteria.forEach((criterion, index) => {
    lines.push(`${index + 1}. ${criterion.title} — ${criterion.score} / ${criterion.max}`)
    if (criterion.feedback) lines.push(`   Feedback: ${criterion.feedback}`)
    lines.push(`   Practice: ${criterion.prompt}`)
    lines.push(`   Self-check: ${criterion.cue}`)
    lines.push('')
  })
  return lines.join('\n').trimEnd() + '\n'
}

export function buildOralVivaMarkdown(collated: CollatedAssessment): string {
  const finalisedRows = collated.rows.filter((row) => row.finalised)
  const lines = [
    `# Oral Follow-Up Sheet — ${collated.rubric.title}`,
    '',
    `Finalised scripts: ${finalisedRows.length} · Total marks per script: ${collated.summary.maxMarks}`,
    '',
  ]
  if (!finalisedRows.length) {
    lines.push('No finalised scripts in this assessment yet.')
    return lines.join('\n') + '\n'
  }
  for (const row of finalisedRows) {
    const heading = row.candidateRef
      ? `${row.scriptLabel} (${row.candidateRef})`
      : row.scriptLabel
    lines.push(`## ${heading} — ${row.earned ?? 0} / ${row.max}${row.flagged ? ' · Flagged for second review' : ''}`)
    lines.push('')
    const questions = row.script.oral?.length ? row.script.oral : defaultOralQuestions(row.script, collated.rubric)
    questions.forEach((item, index) => {
      lines.push(`${index + 1}. **Question:** ${item.prompt}`)
      lines.push(`   - *Examiner cue:* ${item.cue}`)
    })
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

export async function buildFeedbackZip(collated: CollatedAssessment): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const finalisedRows = collated.rows.filter((row) => row.finalised)
  const rubricSlug = slugifyFilename(collated.rubric.title, 'assessment')
  const usedBaseNames = new Set<string>()

  zip.file(`${rubricSlug}-marksheet.csv`, '\uFEFF' + buildMarksheetCsv(collated))
  zip.file(`${rubricSlug}-moderation-audit.csv`, '\uFEFF' + buildAuditLogCsv(collated))
  zip.file(`${rubricSlug}-oral-viva.md`, buildOralVivaMarkdown(collated))

  const jsonFolder = zip.folder('student-practice-json')
  const txtFolder = zip.folder('student-feedback-txt')

  for (const row of finalisedRows) {
    const preferred = row.candidateRef
      ? slugifyFilename(row.candidateRef, slugifyFilename(row.scriptLabel, 'script'))
      : slugifyFilename(row.scriptLabel, 'script')
    let baseName = `${rubricSlug}-${preferred}`
    if (usedBaseNames.has(baseName)) {
      baseName = `${baseName}-${slugifyFilename(row.scriptLabel, 'script')}`
    }
    usedBaseNames.add(baseName)

    const feedbackJson = makeFeedback(row.script, collated.rubric)
    jsonFolder?.file(`${baseName}-feedback.json`, JSON.stringify(feedbackJson, null, 2) + '\n')
    txtFolder?.file(`${baseName}-feedback.txt`, formatStudentFeedbackText(row.script, collated.rubric))
  }

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
