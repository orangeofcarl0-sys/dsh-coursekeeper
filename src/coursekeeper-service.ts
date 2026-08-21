import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { getSessionHandle } from './runtime-registry.js'
import type { GovernorMode } from './types.js'

const REMOTE_METHODS = ['status', 'setMode'] as const

export class CoursekeeperService extends TypertRemoteService {
  static inject = ['sessions']

  constructor(ctx: any) {
    super(ctx, 'coursekeeper')
    for (const name of REMOTE_METHODS) {
      Remote(null, {
        kind: 'method',
        name,
        private: false,
        static: false,
        addInitializer: (fn: any) => { fn.call(this) },
      })
    }
  }

  status(sessionId: string): unknown {
    return getSessionHandle(String(sessionId))?.getStatus() ?? null
  }

  setMode(sessionId: string, mode: GovernorMode): { ok: boolean; mode?: GovernorMode; reason?: string } {
    const handle = getSessionHandle(String(sessionId))
    if (!handle) return { ok: false, reason: 'unknown session' }
    handle.setMode(mode)
    return { ok: true, mode: handle.getMode() }
  }
}

export default CoursekeeperService
