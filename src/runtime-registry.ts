import type { GovernorMode } from './types.js'

export interface CoursekeeperRuntimeHandle {
  getMode(): GovernorMode
  setMode(mode: GovernorMode): void
  getStatus(): Record<string, unknown>
}

const handles = new Map<string, CoursekeeperRuntimeHandle>()

export function registerSessionHandle(key: string, handle: CoursekeeperRuntimeHandle): void {
  handles.set(key, handle)
}

export function unregisterSessionHandle(key: string): void {
  handles.delete(key)
}

export function getSessionHandle(key: string): CoursekeeperRuntimeHandle | undefined {
  return handles.get(key)
}
