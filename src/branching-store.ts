import { appendFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { BranchExperience } from './types.js'

export interface BranchExperienceStoreOptions {
  readonly enabled: boolean
  readonly path: string
  readonly maxInMemory: number
}

function isBranchExperience(value: unknown): value is BranchExperience {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return row['schemaVersion'] === 1 && typeof row['id'] === 'string' && typeof row['at'] === 'string'
    && typeof row['domain'] === 'object' && typeof row['task'] === 'object' && Array.isArray(row['triggers'])
    && typeof row['candidateCount'] === 'number' && typeof row['finalReverifyPassed'] === 'boolean'
}

export class BranchExperienceStore {
  private readonly rows: BranchExperience[] = []
  private loadPromise: Promise<void> | undefined
  private queue: Promise<void> = Promise.resolve()
  private loaded = false
  private invalidLines = 0
  private failure: string | undefined

  constructor(private readonly options: BranchExperienceStoreOptions) {}

  async ready(): Promise<void> {
    if (!this.options.enabled || this.loaded) return
    if (!this.loadPromise) this.loadPromise = this.load()
    await this.loadPromise
  }

  values(): readonly BranchExperience[] { return this.rows }

  append(row: BranchExperience): void {
    if (!this.options.enabled || this.failure) return
    this.rows.push(row)
    while (this.rows.length > this.options.maxInMemory) this.rows.shift()
    this.queue = this.queue.then(async () => {
      await mkdir(dirname(this.options.path), { recursive: true })
      await appendFile(this.options.path, `${JSON.stringify(row)}\n`, 'utf8')
    }).catch(error => this.recordFailure(error))
  }

  async status(): Promise<Record<string, unknown>> {
    let bytes: number | undefined
    try { bytes = (await stat(this.options.path)).size } catch { /* absent is fine */ }
    return {
      enabled: this.options.enabled,
      path: this.options.path,
      loaded: this.loaded,
      entries: this.rows.length,
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
      const historical: BranchExperience[] = []
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          const row = JSON.parse(line)
          if (isBranchExperience(row)) historical.push(row)
          else this.invalidLines++
        } catch { this.invalidLines++ }
      }
      const liveIds = new Set(this.rows.map(row => row.id))
      this.rows.unshift(...historical.filter(row => !liveIds.has(row.id)))
      if (this.rows.length > this.options.maxInMemory) this.rows.splice(0, this.rows.length - this.options.maxInMemory)
      this.loaded = true
    } catch (error) {
      this.recordFailure(error)
      this.loaded = true
    }
  }

  private recordFailure(error: unknown): void {
    if (this.failure) return
    this.failure = error instanceof Error ? error.message : String(error)
    console.error(`[coursekeeper] branch experience store disabled after failure: ${this.failure}`)
  }
}
