import { newWorkspace, normalizeWorkspace, type Workspace } from '../domain/workspace'

let connection: Promise<IDBDatabase> | undefined
function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('marking-assistant', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('private')
      request.result.createObjectStore('sample')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Local storage is unavailable. Check your browser settings and retry.'))
  }).catch((error: unknown) => {
    connection = undefined
    throw error
  })
  return connection
}

export type Space = 'private' | 'sample'
export async function readSpace(space: Space, initial: () => Workspace = newWorkspace): Promise<Workspace> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction(space).objectStore(space).get('workspace')
    request.onsuccess = () => resolve(normalizeWorkspace(request.result ?? initial()))
    request.onerror = () => reject(new Error('Could not open the saved workspace.'))
  })
}

export async function writeSpace(space: Space, initial: () => Workspace, change: (workspace: Workspace) => Workspace): Promise<Workspace> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(space, 'readwrite')
    const store = transaction.objectStore(space)
    const request = store.get('workspace')
    let updated: Workspace
    let failure: unknown
    request.onsuccess = () => {
      try {
        updated = normalizeWorkspace(change(normalizeWorkspace(request.result ?? initial())))
        store.put(updated, 'workspace')
      } catch (error) {
        failure = error
        transaction.abort()
      }
    }
    transaction.oncomplete = () => resolve(updated)
    transaction.onabort = () => reject(failure ?? new Error('Could not save locally. Check available storage and retry.'))
  })
}
