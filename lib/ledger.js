import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
export class DecisionLedger {
    options;
    queue = Promise.resolve();
    closed = false;
    prepared = false;
    failure;
    rotations = 0;
    rotationSequence = 0;
    constructor(options) {
        this.options = options;
    }
    record(record) {
        if (!this.options.enabled || this.closed || this.failure !== undefined)
            return;
        const line = `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`;
        this.queue = this.queue.then(async () => {
            if (!this.prepared) {
                await mkdir(dirname(this.options.path), { recursive: true });
                this.prepared = true;
            }
            await this.rotateBeforeAppend(line);
            await appendFile(this.options.path, line, 'utf8');
        }).catch((error) => this.recordFailure(error));
    }
    status() {
        return {
            enabled: this.options.enabled,
            path: this.options.path,
            maxBytes: this.options.maxBytes ?? null,
            rotations: this.rotations,
            failed: this.failure !== undefined,
            ...(this.failure === undefined ? {} : { error: this.failure }),
        };
    }
    async close() { this.closed = true; await this.queue; }
    async rotateBeforeAppend(line) {
        const maxBytes = this.options.maxBytes;
        if (maxBytes === undefined)
            return;
        let size = 0;
        try {
            size = (await stat(this.options.path)).size;
        }
        catch (error) {
            if (!hasErrorCode(error, 'ENOENT'))
                throw error;
        }
        if (size === 0 || size + Buffer.byteLength(line, 'utf8') <= maxBytes)
            return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let target;
        do {
            this.rotationSequence++;
            target = `${this.options.path}.${timestamp}.${this.rotationSequence}.jsonl`;
        } while (await pathExists(target));
        await rename(this.options.path, target);
        this.rotations++;
    }
    recordFailure(error) {
        if (this.failure !== undefined)
            return;
        this.failure = error instanceof Error ? error.message : String(error);
        console.error(`[coursekeeper] decision ledger disabled after write failure: ${this.failure}`);
    }
}
function hasErrorCode(error, code) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
async function pathExists(path) {
    try {
        await stat(path);
        return true;
    }
    catch (error) {
        if (hasErrorCode(error, 'ENOENT'))
            return false;
        throw error;
    }
}
//# sourceMappingURL=ledger.js.map