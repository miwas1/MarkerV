import type { BenchmarkItem, BenchmarkKind } from '../domain/benchmark'
import type { Rubric } from '../domain/workspace'
import pack from './pack.json'

// Generated from marking-test-pack/ by `npm run benchmark:pack`. Every answer is fictional.
const KINDS: Record<string, BenchmarkKind> = {
  '05': 'typed',
  '07': 'injection',
  '08': 'off-topic',
  '09': 'borderline',
  '10': 'short',
}

export type BenchmarkCase = BenchmarkItem & {
  projectName: string
  file: string
  tests: string
  transcript: string
  rubric: Rubric
}

const rubrics = new Map(pack.projects.map((project) => [project.id, {
  name: project.name,
  rubric: {
    id: 'benchmark-' + project.id,
    series: 'benchmark-' + project.id,
    version: 1,
    title: project.rubric.title,
    question: project.rubric.question,
    criteria: project.rubric.criteria,
  } satisfies Rubric,
}]))

export const benchmarkCases: BenchmarkCase[] = pack.cases.map((item) => {
  const project = rubrics.get(item.projectId)!
  return {
    id: item.id,
    kind: KINDS[item.file.slice(0, 2)] ?? 'typed',
    reference: item.reference,
    criterionIds: project.rubric.criteria.map((criterion) => criterion.id),
    projectName: project.name,
    file: item.file,
    tests: item.tests,
    transcript: item.transcript,
    rubric: project.rubric,
  }
})

/** Two scripts per rubric, chosen so the ten cover every kind of script twice. */
export const quickBenchmarkCases: BenchmarkCase[] = [...rubrics.keys()].flatMap((projectId, index) => {
  const scripts = benchmarkCases.filter((item) => item.rubric.id === 'benchmark-' + projectId)
  return [scripts[index % scripts.length], scripts[(index + 2) % scripts.length]]
})

export function benchmarkCase(id: string): BenchmarkCase | undefined {
  return benchmarkCases.find((item) => item.id === id)
}
