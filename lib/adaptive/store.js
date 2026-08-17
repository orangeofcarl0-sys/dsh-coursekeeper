import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
function isExperience(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const row = value;
    return row['schemaVersion'] === 1 && typeof row['id'] === 'string' && typeof row['at'] === 'string'
        && typeof row['task'] === 'object' && typeof row['domain'] === 'object' && typeof row['initialRoute'] === 'string';
}
export class ExperienceStore {
    options;
    rows = [];
    loadPromise;
    queue = Promise.resolve();
    invalidLines = 0;
    failure;
    loaded = false;
    constructor(options) {
        this.options = options;
    }
    async ready() {
        if (!this.options.enabled || this.loaded)
            return;
        if (!this.loadPromise)
            this.loadPromise = this.load();
        await this.loadPromise;
    }
    values() { return this.rows; }
    append(experience) {
        if (!this.options.enabled || this.failure)
            return;
        this.rows.push(experience);
        while (this.rows.length > this.options.maxInMemory)
            this.rows.shift();
        const line = `${JSON.stringify(experience)}\n`;
        this.queue = this.queue.then(async () => {
            await mkdir(dirname(this.options.path), { recursive: true });
            await appendFile(this.options.path, line, 'utf8');
        }).catch(error => this.recordFailure(error));
    }
    async close() { await this.queue; }
    async status() {
        let bytes;
        try {
            bytes = (await stat(this.options.path)).size;
        }
        catch { /* absent is fine */ }
        return {
            enabled: this.options.enabled,
            path: this.options.path,
            loaded: this.loaded,
            entries: this.rows.length,
            invalidLines: this.invalidLines,
            failed: this.failure !== undefined,
            ...(this.failure ? { error: this.failure } : {}),
            ...(bytes === undefined ? {} : { bytes }),
        };
    }
    async load() {
        if (!this.options.enabled) {
            this.loaded = true;
            return;
        }
        try {
            let text = '';
            try {
                text = await readFile(this.options.path, 'utf8');
            }
            catch (error) {
                if (error?.code !== 'ENOENT')
                    throw error;
            }
            const loadedRows = [];
            for (const line of text.split('\n')) {
                if (!line.trim())
                    continue;
                try {
                    const value = JSON.parse(line);
                    if (isExperience(value))
                        loadedRows.push(value);
                    else
                        this.invalidLines++;
                }
                catch {
                    this.invalidLines++;
                }
            }
            // Loading may race with an early append. Historical rows belong before
            // in-process rows; de-duplicate by experience id and keep the newer in-process row.
            const liveIds = new Set(this.rows.map(row => row.id));
            this.rows.unshift(...loadedRows.filter(row => !liveIds.has(row.id)));
            if (this.rows.length > this.options.maxInMemory)
                this.rows.splice(0, this.rows.length - this.options.maxInMemory);
            this.loaded = true;
        }
        catch (error) {
            this.recordFailure(error);
            this.loaded = true;
        }
    }
    recordFailure(error) {
        if (this.failure)
            return;
        this.failure = error instanceof Error ? error.message : String(error);
        console.error(`[coursekeeper] experience store disabled after failure: ${this.failure}`);
    }
}
//# sourceMappingURL=store.js.map