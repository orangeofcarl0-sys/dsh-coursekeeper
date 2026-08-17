import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface LedgerOptions {
  readonly enabled: boolean
  readonly path: string
  readonly maxBytes?: number
}

export interface LedgerStatus {
  readonly enabled: boolean
  readonly path: string
  readonly maxBytes: number | null
  readonly rotations: number
  readonly failed: boolean
  readonly error?: string
}

export class DecisionLedger {
  private queue: Promise<void> = Promise.resolve()
  private closed = false
  private prepared = false
  private failure: string | undefined
  private rotations = 0
  private rotationSequence = 0

  constructor(private readonly options: LedgerOptions) {}

  record(record: Record<string, unknown>): void {
    if (!this.options.enabled || this.closed || this.failure !== undefined) return
    const line = `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`
    this.queue = this.queue.then(async () => {
      if (!this.prepared) {
        await mkdir(dirname(this.options.path), { recursive: true })
        this.prepared = true
      }
      await this.rotateBeforeAppend(line)
      await appendFile(this.options.path, line, 'utf8')
    }).catch((error: unknown) => this.recordFailure(error))
  }

  status(): LedgerStatus {
    return {
      enabled: this.options.enabled,
      path: this.options.path,
      maxBytes: this.options.maxBytes ?? null,
      rotations: this.rotations,
      failed: this.failure !== undefined,
      ...(this.failure === undefined ? {} : { error: this.failure }),
    }
  }

  async close(): Promise<void> { this.closed = true; await this.queue }

  private async rotateBeforeAppend(line: string): Promise<void> {
    const maxBytes = this.options.maxBytes
    if (maxBytes === undefined) return
    let size = 0
    try { size = (await stat(this.options.path)).size }
    catch (error) { if (!hasErrorCode(error, 'ENOENT')) throw error }
    if (size === 0 || size + Buffer.byteLength(line, 'utf8') <= maxBytes) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    let target: string
    do { this.rotationSequence++; target = `${this.options.path}.${timestamp}.${this.rotationSequence}.jsonl` }
    while (await pathExists(target))
    await rename(this.options.path, target)
    this.rotations++
  }

  private recordFailure(error: unknown): void {
    if (this.failure !== undefined) return
    this.failure = error instanceof Error ? error.message : String(error)
    console.error(`[coursekeeper] decision ledger disabled after write failure: ${this.failure}`)
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}
async function pathExists(path: string): Promise<boolean> {
  try { await stat(path); return true }
  catch (error) { if (hasErrorCode(error, 'ENOENT')) return false; throw error }
}
