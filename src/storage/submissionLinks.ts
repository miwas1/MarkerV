import { getAuth } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import firebaseAppletConfig from '../../firebase-applet-config.json'
import { checkDevice, configured, ensureAppCheck, getFirebaseApp, mark } from '../ai/firebase'
import {
  autoMarkByRubric,
  buildCombinedAnswer,
  buildSubmitterLabel,
  generateUniqueLinkId,
  MAX_FILE_BYTES,
  MAX_FILE_NAME,
  MAX_IMAGE_DATA_URL,
  MAX_OWNER_NAME,
  MAX_PORTAL_INSTRUCTIONS,
  MAX_PORTAL_TITLE,
  MAX_PROJECT_NAME,
  MAX_SUBMISSION_TEXT,
  rubricSnapshotTotal,
  sanitizeFieldValues,
  validateLinkDraft,
  type AutoMarkEngine,
  type AutoMarkOutcome,
  type AutoMarkStatus,
  type FieldResponseValue,
  type RubricSnapshot,
  type StudentSubmissionDoc,
  type SubmissionFieldDef,
  type SubmissionLinkDoc,
} from '../domain/submissionLink'
import type { Rubric, Suggestion } from '../domain/workspace'

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string
  operationType: OperationType
  path: string | null
  authInfo: {
    userId?: string | null
    email?: string | null
    emailVerified?: boolean | null
    isAnonymous?: boolean | null
    tenantId?: string | null
    providerInfo?: {
      providerId?: string | null
      email?: string | null
    }[]
  }
}

let cachedDb: Firestore | undefined
let connectionChecked = false

export function getDb(): Firestore {
  if (!configured) {
    throw new Error('Firebase is not configured for submission links.')
  }
  ensureAppCheck()
  if (!cachedDb) {
    const app = getFirebaseApp()
    const databaseId = firebaseAppletConfig.firestoreDatabaseId
    cachedDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app)
  }
  return cachedDb
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentUser = configured ? getAuth(getFirebaseApp()).currentUser : null
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo))
  throw new Error(JSON.stringify(errInfo))
}

export function formatFriendlyFirestoreError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  try {
    const parsed = JSON.parse(raw) as Partial<FirestoreErrorInfo>
    if (typeof parsed.error === 'string') {
      const lower = parsed.error.toLowerCase()
      if (lower.includes('quota')) {
        return 'Daily Firestore quota exceeded. Quota resets tomorrow.'
      }
      if (lower.includes('permission') || lower.includes('insufficient')) {
        return 'Permission denied. Make sure you are signed in with the lecturer account that owns this portal.'
      }
      if (lower.includes('offline') || lower.includes('unavailable')) {
        return 'Could not reach the server. Check your internet connection and try again.'
      }
      return parsed.error
    }
  } catch {
    // Plain error message
  }
  if (raw.toLowerCase().includes('quota')) return 'Daily Firestore quota exceeded. Quota resets tomorrow.'
  return raw || fallback
}

export async function testConnection(): Promise<void> {
  if (!configured || connectionChecked) return
  connectionChecked = true
  try {
    await getDocFromServer(doc(getDb(), 'test', 'connection'))
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.')
    }
  }
}

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis()
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return Number((value as { seconds: number }).seconds) * 1000
  }
  return Date.now()
}

function parseLinkDoc(id: string, data: DocumentData): SubmissionLinkDoc {
  return {
    id,
    ownerId: String(data.ownerId ?? ''),
    ownerName: String(data.ownerName ?? 'Lecturer'),
    projectId: String(data.projectId ?? ''),
    projectName: String(data.projectName ?? ''),
    title: String(data.title ?? ''),
    instructions: String(data.instructions ?? ''),
    isOpen: Boolean(data.isOpen),
    autoMark: Boolean(data.autoMark),
    showScoreToStudent: Boolean(data.showScoreToStudent),
    rubricId: String(data.rubricId ?? ''),
    rubricTitle: String(data.rubricTitle ?? ''),
    rubricSnapshot: data.rubricSnapshot as RubricSnapshot | undefined,
    fields: Array.isArray(data.fields) ? (data.fields as SubmissionFieldDef[]) : [],
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  }
}

function parseSubmissionDoc(id: string, data: DocumentData): StudentSubmissionDoc {
  return {
    id,
    linkId: String(data.linkId ?? ''),
    ownerId: String(data.ownerId ?? ''),
    status: (data.status as StudentSubmissionDoc['status']) ?? 'submitted',
    submitterLabel: String(data.submitterLabel ?? 'Student submission'),
    fieldValues: sanitizeFieldValues(data.fieldValues),
    combinedAnswer: String(data.combinedAnswer ?? ''),
    attachmentImageDataUrl: String(data.attachmentImageDataUrl ?? ''),
    attachmentFileName: String(data.attachmentFileName ?? ''),
    autoMarkStatus: (data.autoMarkStatus as AutoMarkStatus) ?? 'not_requested',
    autoMarkEngine: (data.autoMarkEngine as AutoMarkEngine) ?? 'none',
    marks: (data.marks && typeof data.marks === 'object' ? data.marks : {}) as Record<string, number>,
    suggestions: (data.suggestions && typeof data.suggestions === 'object' ? data.suggestions : {}) as Record<
      string,
      Suggestion
    >,
    totalEarned: Number(data.totalEarned ?? 0),
    totalPossible: Number(data.totalPossible ?? 0),
    importedToWorkspace: Boolean(data.importedToWorkspace),
    workspaceScriptId: String(data.workspaceScriptId ?? ''),
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  }
}

export type CreateSubmissionLinkInput = {
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
}

export async function createSubmissionLink(input: CreateSubmissionLinkInput): Promise<string> {
  const cleanedFields = validateLinkDraft({
    title: input.title,
    instructions: input.instructions,
    fields: input.fields,
    autoMark: input.autoMark,
    rubricSnapshot: input.rubricSnapshot,
  })

  const db = getDb()
  let linkId = generateUniqueLinkId()

  // Guarantee unique document ID before writing
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidateRef = doc(db, 'submissionLinks', linkId)
    try {
      const snap = await getDoc(candidateRef)
      if (!snap.exists()) break
      linkId = generateUniqueLinkId()
    } catch {
      break
    }
  }

  const path = `submissionLinks/${linkId}`
  const payload: Record<string, unknown> = {
    ownerId: input.ownerId.trim().slice(0, 128),
    ownerName: (input.ownerName.trim() || 'Lecturer').slice(0, MAX_OWNER_NAME),
    projectId: input.projectId.trim().slice(0, 128),
    projectName: (input.projectName.trim() || 'Workspace').slice(0, MAX_PROJECT_NAME),
    title: input.title.trim().slice(0, MAX_PORTAL_TITLE),
    instructions: input.instructions.trim().slice(0, MAX_PORTAL_INSTRUCTIONS),
    isOpen: Boolean(input.isOpen),
    autoMark: Boolean(input.autoMark),
    showScoreToStudent: Boolean(input.autoMark && input.showScoreToStudent),
    rubricId: (input.rubricId ?? '').trim().slice(0, 128),
    rubricTitle: (input.rubricTitle ?? '').trim().slice(0, 120),
    fields: cleanedFields,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  if (input.rubricSnapshot) {
    payload.rubricSnapshot = input.rubricSnapshot
  }

  try {
    await setDoc(doc(db, 'submissionLinks', linkId), payload)
    return linkId
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path)
  }
}

export async function updateSubmissionLinkConfig(
  linkId: string,
  input: {
    title: string
    instructions: string
    isOpen: boolean
    autoMark: boolean
    showScoreToStudent: boolean
    rubricId: string
    rubricTitle: string
    rubricSnapshot?: RubricSnapshot
    fields: SubmissionFieldDef[]
  },
): Promise<void> {
  const cleanedFields = validateLinkDraft({
    title: input.title,
    instructions: input.instructions,
    fields: input.fields,
    autoMark: input.autoMark,
    rubricSnapshot: input.rubricSnapshot,
  })

  const path = `submissionLinks/${linkId}`
  const updatePayload: Record<string, unknown> = {
    title: input.title.trim().slice(0, MAX_PORTAL_TITLE),
    instructions: input.instructions.trim().slice(0, MAX_PORTAL_INSTRUCTIONS),
    isOpen: Boolean(input.isOpen),
    autoMark: Boolean(input.autoMark),
    showScoreToStudent: Boolean(input.autoMark && input.showScoreToStudent),
    rubricId: (input.rubricId ?? '').trim().slice(0, 128),
    rubricTitle: (input.rubricTitle ?? '').trim().slice(0, 120),
    fields: cleanedFields,
    updatedAt: serverTimestamp(),
  }

  if (input.rubricSnapshot) {
    updatePayload.rubricSnapshot = input.rubricSnapshot
  }

  try {
    await updateDoc(doc(getDb(), 'submissionLinks', linkId), updatePayload)
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path)
  }
}

export async function toggleSubmissionLinkOpen(linkId: string, isOpen: boolean): Promise<void> {
  const path = `submissionLinks/${linkId}`
  try {
    await updateDoc(doc(getDb(), 'submissionLinks', linkId), {
      isOpen: Boolean(isOpen),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path)
  }
}

/**
 * Deletes a link together with every submission received through it, and returns how many
 * submissions were removed. Firestore does not delete a subcollection with its parent, and the
 * security rules let the owner delete a submission only while its link still exists, so the
 * submissions go first. If any deletion fails the link is kept, so the lecturer can try again.
 */
export async function deleteSubmissionLink(linkId: string, ownerId: string): Promise<number> {
  const path = `submissionLinks/${linkId}`
  try {
    const db = getDb()
    const received = await getDocs(
      query(collection(db, 'submissionLinks', linkId, 'submissions'), where('ownerId', '==', ownerId)),
    )
    await Promise.all(received.docs.map((entry) => deleteDoc(entry.ref)))
    await deleteDoc(doc(db, 'submissionLinks', linkId))
    return received.size
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path)
  }
}

export function subscribeLecturerLinks(
  ownerId: string,
  onData: (links: SubmissionLinkDoc[]) => void,
  onError: (message: string) => void,
): () => void {
  const path = 'submissionLinks'
  const q = query(collection(getDb(), path), where('ownerId', '==', ownerId))
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((docSnap) => parseLinkDoc(docSnap.id, docSnap.data()))
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
      onData(items)
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path)
      } catch (wrapped) {
        onError(formatFriendlyFirestoreError(wrapped, 'Could not load your submission links.'))
      }
    },
  )
}

export async function getSubmissionLinkPublic(linkId: string): Promise<SubmissionLinkDoc | null> {
  const path = `submissionLinks/${linkId}`
  try {
    const snap = await getDoc(doc(getDb(), 'submissionLinks', linkId))
    if (!snap.exists()) return null
    return parseLinkDoc(snap.id, snap.data())
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path)
  }
}

export async function runAutoMarkEngine(
  rubricSnapshot: RubricSnapshot,
  answerText: string,
): Promise<AutoMarkOutcome> {
  const cleanText = answerText.trim()
  const totalPossible = rubricSnapshotTotal(rubricSnapshot)

  // Try Chrome Built-in AI on-device marking first when available in the current browser
  if (cleanText.length > 0 && configured) {
    try {
      const status = await checkDevice(false)
      if (status === 'available') {
        const rubricModel: Rubric = {
          id: rubricSnapshot.id,
          series: rubricSnapshot.id,
          version: 1,
          title: rubricSnapshot.title,
          question: rubricSnapshot.question,
          criteria: rubricSnapshot.criteria,
        }
        const aiResult = await mark(rubricModel, cleanText, () => true)
        const marks: Record<string, number> = {}
        let totalEarned = 0
        for (const criterion of rubricSnapshot.criteria) {
          const score = aiResult.suggestions[criterion.id]?.score
          const safeScore = typeof score === 'number' ? Math.min(criterion.max, Math.max(0, Math.round(score))) : 0
          marks[criterion.id] = safeScore
          totalEarned += safeScore
        }
        return {
          marks,
          suggestions: aiResult.suggestions,
          totalEarned,
          totalPossible,
          engine: 'device-ai',
        }
      }
    } catch {
      // Fall back cleanly to deterministic rubric-evidence scorer
    }
  }

  return autoMarkByRubric(rubricSnapshot, cleanText)
}

export type StudentSubmitReceipt = {
  submissionId: string
  submitterLabel: string
  autoMarkStatus: AutoMarkStatus
  totalPossible: number
  /** Optional local-only self-check estimate shown on receipt; never persisted to Firestore. */
  selfCheck?: AutoMarkOutcome
}

export async function submitStudentWork(
  link: SubmissionLinkDoc,
  input: {
    fieldValues: FieldResponseValue[]
    attachmentImageDataUrl: string
    attachmentFileName: string
  },
): Promise<StudentSubmitReceipt> {
  const sanitizedValues: FieldResponseValue[] = input.fieldValues.slice(0, 12).map((item) => ({
    fieldId: item.fieldId.slice(0, 128),
    label: item.label.trim().slice(0, 80) || 'Field',
    type: item.type,
    textValue: item.textValue.trim().slice(0, MAX_SUBMISSION_TEXT),
    fileName: item.fileName.trim().slice(0, MAX_FILE_NAME),
    fileType: item.fileType.trim().slice(0, 120),
    fileSize: Math.min(MAX_FILE_BYTES, Math.max(0, Math.round(item.fileSize || 0))),
    extractedText: item.extractedText.trim().slice(0, MAX_SUBMISSION_TEXT),
  }))

  const submitterLabel = buildSubmitterLabel(link.fields, sanitizedValues)
  const combinedAnswer = buildCombinedAnswer(link.fields, sanitizedValues)
  const safeImage = input.attachmentImageDataUrl.slice(0, MAX_IMAGE_DATA_URL)
  const safeFileName = input.attachmentFileName.trim().slice(0, MAX_FILE_NAME)

  // Students can never write marks or suggestions to Firestore; official marking always runs on the lecturer's device.
  const autoMarkStatus: AutoMarkStatus = link.autoMark ? 'pending' : 'not_requested'
  const totalPossible = Math.max(0, Math.round(rubricSnapshotTotal(link.rubricSnapshot)))

  const submissionId = crypto.randomUUID()
  const path = `submissionLinks/${link.id}/submissions/${submissionId}`

  const payload = {
    linkId: link.id,
    ownerId: link.ownerId,
    status: 'submitted' as const,
    submitterLabel,
    fieldValues: sanitizedValues,
    combinedAnswer,
    attachmentImageDataUrl: safeImage,
    attachmentFileName: safeFileName,
    autoMarkStatus,
    autoMarkEngine: 'none' as const,
    marks: {},
    suggestions: {},
    totalEarned: 0,
    totalPossible,
    importedToWorkspace: false,
    workspaceScriptId: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  try {
    await setDoc(doc(getDb(), 'submissionLinks', link.id, 'submissions', submissionId), payload)

    // Optional local-only self-check estimate for student feedback (never stored or treated as an official mark).
    let selfCheck: AutoMarkOutcome | undefined
    if (link.autoMark && link.showScoreToStudent && link.rubricSnapshot && combinedAnswer.trim().length > 0) {
      selfCheck = await runAutoMarkEngine(link.rubricSnapshot, combinedAnswer).catch(() => undefined)
    }

    return {
      submissionId,
      submitterLabel,
      autoMarkStatus,
      totalPossible,
      selfCheck,
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path)
  }
}

export function subscribeLinkSubmissions(
  linkId: string,
  ownerId: string,
  onData: (submissions: StudentSubmissionDoc[]) => void,
  onError: (message: string) => void,
): () => void {
  const path = `submissionLinks/${linkId}/submissions`
  const q = query(collection(getDb(), 'submissionLinks', linkId, 'submissions'), where('ownerId', '==', ownerId))
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((docSnap) => parseSubmissionDoc(docSnap.id, docSnap.data()))
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
      onData(items)
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path)
      } catch (wrapped) {
        onError(formatFriendlyFirestoreError(wrapped, 'Could not load student submissions.'))
      }
    },
  )
}

export async function markSubmissionImported(
  linkId: string,
  submissionId: string,
  workspaceScriptId: string,
): Promise<void> {
  const path = `submissionLinks/${linkId}/submissions/${submissionId}`
  try {
    await updateDoc(doc(getDb(), 'submissionLinks', linkId, 'submissions', submissionId), {
      status: 'imported',
      importedToWorkspace: true,
      workspaceScriptId: workspaceScriptId.slice(0, 128),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path)
  }
}

export async function saveSubmissionAutoMarks(
  linkId: string,
  submissionId: string,
  outcome: AutoMarkOutcome,
): Promise<void> {
  const path = `submissionLinks/${linkId}/submissions/${submissionId}`
  try {
    await updateDoc(doc(getDb(), 'submissionLinks', linkId, 'submissions', submissionId), {
      autoMarkStatus: 'marked',
      autoMarkEngine: outcome.engine,
      marks: outcome.marks,
      suggestions: outcome.suggestions,
      totalEarned: Math.min(Math.round(outcome.totalPossible), Math.max(0, Math.round(outcome.totalEarned))),
      totalPossible: Math.max(0, Math.round(outcome.totalPossible)),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path)
  }
}

export async function deleteStudentSubmission(linkId: string, submissionId: string): Promise<void> {
  const path = `submissionLinks/${linkId}/submissions/${submissionId}`
  try {
    await deleteDoc(doc(getDb(), 'submissionLinks', linkId, 'submissions', submissionId))
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path)
  }
}
