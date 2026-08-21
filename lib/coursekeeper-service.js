import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { getSessionHandle } from './runtime-registry.js';
const REMOTE_METHODS = ['status', 'setMode'];
export class CoursekeeperService extends TypertRemoteService {
    static inject = ['sessions'];
    constructor(ctx) {
        super(ctx, 'coursekeeper');
        for (const name of REMOTE_METHODS) {
            Remote(null, {
                kind: 'method',
                name,
                private: false,
                static: false,
                addInitializer: (fn) => { fn.call(this); },
            });
        }
    }
    status(sessionId) {
        return getSessionHandle(String(sessionId))?.getStatus() ?? null;
    }
    setMode(sessionId, mode) {
        const handle = getSessionHandle(String(sessionId));
        if (!handle)
            return { ok: false, reason: 'unknown session' };
        handle.setMode(mode);
        return { ok: true, mode: handle.getMode() };
    }
}
export default CoursekeeperService;
//# sourceMappingURL=coursekeeper-service.js.map