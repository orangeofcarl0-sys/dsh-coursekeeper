import { cp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BranchCandidate } from './types.js'
import type {
  BranchCheckpoint,
  BranchExecutor,
  WorkspaceForkProvider,
} from './branching.js'

const execFileAsync = promisify(execFile)

export interface LocalWorkspaceForkOptions {
  root: string
  workspaceRefRoot?: string
  command?: string[]
  timeoutMs?: number
}

/**
 * A local filesystem-backed WorkspaceForkProvider:
 * checkpoint = workspace root; fork = recursive directory copy; dispose = rm -rf.
 * It never pretends to isolate if no workspace root has been configured.
 */
export class LocalWorkspaceForkProvider implements WorkspaceForkProvider {
  readonly capability = 'arbitrary' as const
  constructor(private readonly options: LocalWorkspaceForkOptions) {}

  async checkpoint(): Promise<BranchCheckpoint> {
    return { capability: this.capability, ref: this.options.root }
  }

  async fork(checkpoint: BranchCheckpoint, candidateId: string): Promise<{ workspaceRef: string }> {
    if (!checkpoint.ref) throw new Error('local fork requires checkpoint.ref')
    const refRoot = this.options.workspaceRefRoot ?? join(tmpdir(), 'coursekeeper-branches')
    await mkdir(refRoot, { recursive: true })
    const ref = join(refRoot, 'branch-' + candidateId.replace(/[^A-Za-z0-9_.-]/g, '-'))
    await rm(ref, { recursive: true, force: true })
    await cp(checkpoint.ref, ref, { recursive: true })
    return { workspaceRef: ref }
  }

  async apply(candidate: BranchCandidate): Promise<{ ok: boolean; artifacts?: readonly string[]; reason?: string }> {
    if (!candidate.workspaceRef) return { ok: false, reason: 'candidate has no workspaceRef' }
    return { ok: true, artifacts: candidate.evidence.artifacts }
  }

  async dispose(workspaceRef: string): Promise<void> {
    await rm(workspaceRef, { recursive: true, force: true })
  }
}

/**
 * Minimal local BranchExecutor: runs a configured command inside the forked
 * workspace and captures stdout/stderr as candidate evidence. Without a command
 * it still produces an evidence placeholder so the branching pipeline can be
 * exercised end-to-end.
 */
export class LocalBranchExecutor implements BranchExecutor {
  constructor(private readonly options: LocalWorkspaceForkOptions) {}

  async execute(input: {
    candidateId: string
    workspaceRef: string
    objective: string
    route?: string
    freshContext: true
    includeGeneratorReasoning: false
  }): Promise<any> {
    const command = this.options.command ?? []
    const outputs: string[] = []
    let unresolvedError: string | undefined
    if (command.length > 0) {
      try {
        const result = await execFileAsync(command[0]!, command.slice(1), {
          cwd: input.workspaceRef,
          timeout: this.options.timeoutMs ?? 120_000,
          maxBuffer: 4 * 1024 * 1024,
        })
        if (result.stdout) outputs.push(String(result.stdout).slice(0, 4000))
        if (result.stderr) outputs.push(String(result.stderr).slice(0, 2000))
      } catch (error) {
        unresolvedError = error instanceof Error ? error.message : String(error)
      }
    }
    return {
      route: input.route,
      evidence: {
        summary: command.length ? 'local executor: ' + command.join(' ') : 'local executor: no command configured',
        artifacts: [],
        commands: command.length ? [command.join(' ')] : [],
        outputs,
        unresolvedErrors: unresolvedError ? [unresolvedError] : [],
      },
    }
  }
}
