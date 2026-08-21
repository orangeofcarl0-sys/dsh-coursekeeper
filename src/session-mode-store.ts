import { appendFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { GovernorMode } from './types.js'

export interface SessionModeStoreOptions {
  readonly enabled: boolean
  readonly path: string
  readonly maxInMemory: number
}

function isGovernorMode(value: unknown): value is GovernorMode {
  return value === 'off' || value === 'shadow' || value === 'active'
}

function isModeRow(value: unknown): value is { sessionId: string; mode: GovernorMode; at: string } {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row['sessionId'] === 'string' && isGovernorMode(row['mode']) && typeof row['at'] === 'string'
}

/**
 * Durable per-session coursekeeper mode. The latest row per session id wins,
 * so a mode chosen with /coursekeeper on|shadow|off survives a web restart.
 */
export class SessionModeStore {
  private readonly modes = new Map<string, { mode: GovernorMode; at: string }>()
  private loadPromise: Promise<void> | undefined
  private queue: Promise<void> = Promise.resolve()
  private loaded = false
  private invalidLines = 0
  private failure: string | undefined

  constructor(private readonly options: SessionModeStoreOptions) {}

  async ready(): Promise<void> {
    if (!this.options.enabled || this.loaded) return
    if (!this.loadPromise) this.loadPromise = this.load()
    await this.loadPromise
  }

  get(sessionId: string): GovernorMode | undefined {
    return this.modes.get(sessionId)?.mode
  }

  set(sessionId: string, mode: GovernorMode): void {
    if (!this.options.enabled || this.failure) return
    const at = new Date().toISOString()
    this.modes.set(sessionId, { mode, at })
    while (this.modes.size > this.options.maxInMemory) {
      const first = this.modes.keys().next().value as string
      this.modes.delete(first)
    }
    const row = JSON.stringify({ sessionId, mode, at })
    this.queue = this.queue.then(async () => {
      await mkdir(dirname(this.options.path), { recursive: true })
      await appendFile(this.options.path, row + '\n', 'utf8')
    }).catch(error => this.recordFailure(error))
  }

  async status(): Promise<Record<string, unknown>> {
    let bytes: number | undefined
    try { bytes = (await stat(this.options.path)).size } catch { /* absent is fine */ }
    return {
      enabled: this.options.enabled,
      path: this.options.path,
      loaded: this.loaded,
      sessions: this.modes.size,
      invalidLines: this.invalidLines,
      failed: this.failure !== undefined,
      ...(this.failure ? { error: this.failure } : {}),
      ...(bytes === undefined ? {} : { bytes }),
    }
  }

  async close(): Promise<void> { await this.queue }

  private async load(): Promise<void> {
    try {
      let text = ''
      try { text = await readFile(this.options.path, 'utf8') } catch (error: any) { if (error?.code !== 'ENOENT') throw error }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          const row = JSON.parse(line)
          if (isModeRow(row)) this.modes.set(row.sessionId, { mode: row.mode, at: row.at })
          else this.invalidLines++
        } catch { this.invalidLines++ }
      }
      this.loaded = true
    } catch (error) {
      this.recordFailure(error)
      this.loaded = true
    }
  }

  private recordFailure(error: unknown): void {
    if (this.failure) return
    this.failure = error instanceof Error ? error.message : String(error)
    console.error(`[coursekeeper] session mode store disabled after failure: ${this.failure}`)
  }
}
