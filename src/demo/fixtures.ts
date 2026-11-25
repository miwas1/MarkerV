import { makeFeedback, newWorkspace, validateSuggestions, type Rubric, type Script, type Workspace } from '../domain/workspace'

export const sampleProjectId = 'sample-project-os'
export const sampleId = 'fictional-processes-01'

export const sampleRubric: Rubric = {
  id: 'sample-rubric-1', series: 'sample-rubric', version: 1, projectId: sampleProjectId,
  title: 'Processes and threads',
  question: 'Explain the difference between a process and a thread, and give an advantage of using multiple threads.',
  criteria: [
    { id: 'process', title: 'Process', max: 2, levels: ['Missing or incorrect.', 'Identifies a running program.', 'Identifies a running program with its own address space.'], practice: 'How does a process differ from the program stored on disk?' },
    { id: 'thread', title: 'Thread', max: 2, levels: ['Missing or incorrect.', 'Identifies a unit of execution inside a process.', 'Describes execution inside a process and the resources or memory it shares.'], practice: 'Which memory do two threads in the same process share?' },
    { id: 'advantage', title: 'Advantage of threads', max: 2, levels: ['Missing or incorrect.', 'Gives a valid advantage.', 'Explains why the advantage follows from sharing a process.'], practice: 'Why can switching between threads be cheaper than switching between processes?' },
  ],
}

const fixtureAnswers = [
  ['A process is a running program. A thread runs inside a process. Threads can switch faster.', [1, 1, 1]],
  ['A process is a program in execution with its own address space. A thread runs within it and shares memory. Threads share that memory so they can exchange data easily.', [2, 2, 2]],
  ['A process has its own address space while it is running. A thread is a path of execution. Threads share resources, so exchanging data does not need a separate address space.', [2, 1, 2]],
  ['Processes and threads are names for programs. Threads are faster.', [0, 0, 1]],
  ['A process is a running program with private memory. Threads execute inside it using the same memory. Threads are quicker to create because they reuse the address space.', [2, 2, 2]],
  ['A process is a running program. A thread is a unit within the program, but threads cannot share anything.', [1, 1, 0]],
  ['A process has a separate address space. Threads in one process share memory and files. They need less work to start because there is no separate address space.', [2, 2, 2]],
  ['A process is a unit of a CPU. A thread shares memory with other threads in its process. Sharing a process makes it cheaper to start a new unit of execution.', [0, 2, 2]],
  ['A process is a running program with separate memory. A thread is a path within that process. Threads are quicker to start.', [2, 1, 1]],
  ['A process is a program in execution. Threads share memory within it. Sharing memory makes it possible for threads to pass data without a separate communication channel.', [1, 2, 2]],
  ['A process has isolated memory. A thread shares the memory of its process. A thread can therefore communicate with another by reading its shared data.', [2, 2, 2]],
  ['A process runs the program in its own memory. A thread is a small part of that process. Threads are easier to switch between.', [2, 1, 1]],
] as const

export const sampleTranscript = fixtureAnswers[0][0]
const suggestions = validateSuggestions([
  { id: 'process', score: 1, quote: 'A process is a running program.', reason: 'The answer identifies a program in execution. Add how its address space is organised.' },
  { id: 'thread', score: 1, quote: 'A thread runs inside a process.', reason: 'The answer locates the thread within a process. Mention the memory it shares.' },
  { id: 'advantage', score: 1, quote: 'Threads can switch faster.', reason: 'The answer gives an advantage. Explain how the shared address space contributes to it.' },
], sampleRubric, sampleTranscript)

function fixtureScript(index: number): Script {
  const [transcript, scores] = fixtureAnswers[index]
  return {
    id: index === 0 ? sampleId : 'fictional-processes-' + (index + 1),
    sequence: index + 1,
    revision: 0,
    createdAt: 1763841100000 + index,
    confirmed: true,
    projectId: sampleProjectId,
    rubricId: sampleRubric.id,
    transcript,
    marks: index === 0 ? {} : Object.fromEntries(sampleRubric.criteria.map((criterion, position) => [criterion.id, scores[position]])),
    finalisedAt: index === 0 ? undefined : 1763841200000 + index,
    suggestions: index === 0 ? suggestions : undefined,
    provenance: index === 0 ? { source: 'sample' } : undefined,
    feedback: index === 0 ? {} : {
      process: 'State whether the running program has its own address space.',
      thread: 'Explain which memory is shared by threads in the same process.',
      advantage: 'Explain why sharing an address space makes the advantage possible.',
    },
  }
}

export function sampleWorkspace(photo?: Blob): Workspace {
  const scripts = fixtureAnswers.map((_, index) => fixtureScript(index))
  scripts[0].photo = photo
  return {
    ...newWorkspace(),
    projects: [{
      id: sampleProjectId,
      name: 'CS201 · Operating Systems',
      description: 'Midterm short-answer assessment on processes and threads.',
      createdAt: 1763841000000,
    }],
    activeProjectId: sampleProjectId,
    rubrics: [sampleRubric],
    scripts,
    nextSequence: scripts.length + 1,
  }
}

export const sampleFeedback = makeFeedback(fixtureScript(2), sampleRubric)
