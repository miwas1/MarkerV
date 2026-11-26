import { latestRubrics, projectScripts, type Rubric, type Script } from './workspace.ts'

export type DeviceReadinessStatus = 'unavailable' | 'available' | 'downloadable' | 'downloading'

export type AiReadinessSummary = {
  textReady: boolean
  imageReady: boolean
  bothReady: boolean
  canDownload: boolean
  downloading: boolean
  topbarLabel: string
  topbarTone: 'ready' | 'action' | 'neutral' | 'offline'
}

export function summariseAiReadiness(input: {
  configured: boolean
  text: DeviceReadinessStatus
  image: DeviceReadinessStatus
  online: boolean
  allowCloud: boolean
  cloudConfigured: boolean
}): AiReadinessSummary {
  const textReady = input.configured && input.text === 'available'
  const imageReady = input.configured && input.image === 'available'
  const bothReady = textReady && imageReady
  const canDownload = input.configured && (input.text === 'downloadable' || input.image === 'downloadable')
  const downloading = input.configured && (input.text === 'downloading' || input.image === 'downloading')

  if (!input.online) {
    return {
      textReady,
      imageReady,
      bothReady,
      canDownload,
      downloading,
      topbarLabel: textReady ? 'Offline · Local AI ready' : 'Offline · Local workspace',
      topbarTone: 'offline',
    }
  }
  if (textReady) {
    return {
      textReady,
      imageReady,
      bothReady,
      canDownload,
      downloading,
      topbarLabel: 'On-device AI ready',
      topbarTone: 'ready',
    }
  }
  if (downloading) {
    return {
      textReady,
      imageReady,
      bothReady,
      canDownload,
      downloading,
      topbarLabel: 'Downloading AI…',
      topbarTone: 'action',
    }
  }
  if (canDownload) {
    return {
      textReady,
      imageReady,
      bothReady,
      canDownload,
      downloading,
      topbarLabel: 'Set up AI (1 click)',
      topbarTone: 'action',
    }
  }
  if (input.allowCloud && input.cloudConfigured) {
    return {
      textReady,
      imageReady,
      bothReady,
      canDownload,
      downloading,
      topbarLabel: 'Cloud AI on',
      topbarTone: 'neutral',
    }
  }
  return {
    textReady,
    imageReady,
    bothReady,
    canDownload,
    downloading,
    topbarLabel: 'Set up AI',
    topbarTone: 'neutral',
  }
}

/**
 * Picks a sensible default rubric for script capture in a project:
 * - If there is exactly one active rubric, select it automatically.
 * - If there are multiple active rubrics, reuse the rubric from the most recently added script
 *   in this project when that rubric is still active (otherwise leave unassigned so the lecturer picks).
 */
export function defaultRubricForCapture(
  workspace: { rubrics: Rubric[]; scripts: Script[]; projects: Array<{ id: string }>; activeProjectId: string },
  projectId: string,
): string {
  const active = latestRubrics(workspace as Parameters<typeof latestRubrics>[0], projectId)
  if (active.length === 0) return ''
  if (active.length === 1) return active[0].id
  const activeIds = new Set(active.map((rubric) => rubric.id))
  const recent = projectScripts(workspace as Parameters<typeof projectScripts>[0], projectId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((script) => script.rubricId && activeIds.has(script.rubricId))
  return recent?.rubricId ?? ''
}

export type StarterRubricTemplate = {
  id: string
  label: string
  summary: string
  title: string
  question: string
  criteria: Array<{
    title: string
    max: number
    levels: string[]
    practice: string
    keyPoints: string
  }>
}

export const STARTER_RUBRICS: StarterRubricTemplate[] = [
  {
    id: 'short-answer',
    label: 'Short-answer explanation',
    summary: '3 criteria · 6 marks',
    title: 'Concept explanation',
    question: 'Define the core concept, explain how the underlying mechanism works, and give one concrete example.',
    criteria: [
      {
        title: 'Core definition',
        max: 2,
        levels: [
          'Missing, off-topic, or factually incorrect definition.',
          'Identifies the concept partially or uses vague wording.',
          'Defines the concept accurately with its key distinguishing feature.',
        ],
        practice: 'State the core definition in one clear sentence without relying on an example.',
        keyPoints: 'Accept equivalent terminology if the distinguishing property is accurate. Do not award full marks for a circular restatement.',
      },
      {
        title: 'Mechanism and reasoning',
        max: 2,
        levels: [
          'No explanation of how or why the concept works.',
          'Mentions one step or cause without linking it to the outcome.',
          'Explains the cause-and-effect link clearly and accurately.',
        ],
        practice: 'Walk step by step from the cause to the outcome in your own words.',
        keyPoints: 'Must connect cause to effect rather than listing isolated keywords.',
      },
      {
        title: 'Concrete example',
        max: 2,
        levels: [
          'No example provided, or the example contradicts the concept.',
          'Names a relevant example without explaining how it fits.',
          'Gives a relevant example and links it directly back to the mechanism.',
        ],
        practice: 'Pick a new real-world scenario and explain which part shows this mechanism.',
        keyPoints: 'Any valid domain example earns marks when explicitly linked to the concept.',
      },
    ],
  },
  {
    id: 'case-analysis',
    label: 'Problem / case analysis',
    summary: '3 criteria · 6 marks',
    title: 'Case study analysis',
    question: 'Diagnose the main issue in the case, apply an appropriate method or framework, and recommend an action with its limitations.',
    criteria: [
      {
        title: 'Problem diagnosis',
        max: 2,
        levels: [
          'Misses the core problem or misreads the case facts.',
          'Identifies a surface symptom without isolating the root cause.',
          'Clearly identifies the root issue using specific details from the case.',
        ],
        practice: 'Distinguish the root cause in the case from its visible symptoms.',
        keyPoints: 'Look for specific grounding in the case details rather than generic advice.',
      },
      {
        title: 'Method or framework application',
        max: 2,
        levels: [
          'No relevant method or concept is applied.',
          'Names a relevant method but applies it superficially or with errors.',
          'Applies a suitable method accurately to analyse the case.',
        ],
        practice: 'Explain why this method fits the problem better than an alternative.',
        keyPoints: 'Check that the method is applied to the facts, not merely defined in isolation.',
      },
      {
        title: 'Recommendation and limits',
        max: 2,
        levels: [
          'No actionable recommendation or disconnected from the analysis.',
          'Gives a plausible recommendation without trade-offs or risks.',
          'Provides a justified recommendation and identifies a realistic constraint or risk.',
        ],
        practice: 'What assumption could cause your recommendation to fail in practice?',
        keyPoints: 'Full marks require both a justified action and at least one concrete trade-off or constraint.',
      },
    ],
  },
  {
    id: 'critical-argument',
    label: 'Critical argument / essay',
    summary: '3 criteria · 9 marks',
    title: 'Argumentative response',
    question: 'Take a clear position on the prompt, support it with specific evidence, and address a plausible counterargument.',
    criteria: [
      {
        title: 'Claim and focus',
        max: 3,
        levels: [
          'No clear position or does not address the prompt.',
          'States a broad topic or weak opinion without a focused claim.',
          'States a clear position that answers the prompt directly.',
          'Presents a sharp, nuanced thesis that frames the entire response.',
        ],
        practice: 'Rewrite your opening claim so a reader can tell your exact stance and reasoning immediately.',
        keyPoints: 'A descriptive summary without taking an evaluative stance caps at 1 mark.',
      },
      {
        title: 'Supporting evidence',
        max: 3,
        levels: [
          'Assertions are unsupported or rely on inaccurate claims.',
          'Includes general examples with weak connection to the claim.',
          'Uses relevant evidence and explains how it supports the claim.',
          'Integrates specific, accurate evidence with clear analytical commentary.',
        ],
        practice: 'Choose one claim you made and explain why your evidence proves it.',
        keyPoints: 'Evidence must be analysed, not dropped in as an unexplained quote or name-drop.',
      },
      {
        title: 'Counterargument and rebuttal',
        max: 3,
        levels: [
          'Ignores alternative viewpoints completely.',
          'Mentions an opposing view in passing without engaging with it.',
          'Explains a credible objection and responds to it reasonably.',
          'Represents the strongest counterargument fairly and offers a compelling rebuttal or qualification.',
        ],
        practice: 'What is the strongest objection a critic would raise, and how does your position answer it?',
        keyPoints: 'Avoid awarding full marks for straw-man objections that are trivially dismissed.',
      },
    ],
  },
]

export function createRubricFromTemplate(templateId: string, projectId: string): Rubric {
  const template = STARTER_RUBRICS.find((item) => item.id === templateId) ?? STARTER_RUBRICS[0]
  const id = crypto.randomUUID()
  return {
    id,
    series: id,
    version: 1,
    projectId,
    title: template.title,
    question: template.question,
    criteria: template.criteria.map((criterion) => ({
      id: crypto.randomUUID(),
      title: criterion.title,
      max: criterion.max,
      levels: [...criterion.levels],
      practice: criterion.practice,
      keyPoints: criterion.keyPoints,
    })),
  }
}
