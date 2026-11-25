import { useCallback, useEffect, useState } from 'react'
import { newWorkspace, type Workspace } from '../domain/workspace'
import { readSpace, writeSpace, type Space } from './database'

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.'

export function useWorkspace(space: Space = 'private', initial = newWorkspace) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    let readVersion = 0
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('marking-' + space) : null
    const refresh = () => {
      const version = ++readVersion
      void readSpace(space, initial).then((value) => {
        if (active && version === readVersion) {
          setWorkspace(value)
          setError('')
        }
      }, (failure: unknown) => {
        if (active && version === readVersion) setError(errorMessage(failure))
      })
    }
    refresh()
    if (channel) channel.onmessage = refresh
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      channel?.close()
      window.removeEventListener('focus', refresh)
    }
  }, [space, initial, attempt])

  const commit = useCallback(async (change: (value: Workspace) => Workspace) => {
    await writeSpace(space, initial, change)
    // Read the latest committed transaction in case a second tab wrote meanwhile.
    setWorkspace(await readSpace(space, initial))
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel('marking-' + space)
      channel.postMessage('refresh')
      channel.close()
    }
  }, [space, initial])

  return { workspace, error, commit, reload: () => setAttempt((count) => count + 1) }
}
