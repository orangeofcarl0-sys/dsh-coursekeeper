export interface LedgerOptions {
    readonly enabled: boolean;
    readonly path: string;
    readonly maxBytes?: number;
}
export interface LedgerStatus {
    readonly enabled: boolean;
    readonly path: string;
    readonly maxBytes: number | null;
    readonly rotations: number;
    readonly failed: boolean;
    readonly error?: string;
}
export declare class DecisionLedger {
    private readonly options;
    private queue;
    private closed;
    private prepared;
    private failure;
    private rotations;
    private rotationSequence;
    constructor(options: LedgerOptions);
    record(record: Record<string, unknown>): void;
    status(): LedgerStatus;
    close(): Promise<void>;
    private rotateBeforeAppend;
    private recordFailure;
}
