import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { GovernorMode } from './types.js';
export declare class CoursekeeperService extends TypertRemoteService {
    static inject: string[];
    constructor(ctx: any);
    status(sessionId: string): unknown;
    setMode(sessionId: string, mode: GovernorMode): {
        ok: boolean;
        mode?: GovernorMode;
        reason?: string;
    };
}
export default CoursekeeperService;
