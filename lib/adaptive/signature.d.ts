import type { TaskContract, TaskSignature } from '../types.js';
export declare function simHash64(text: string): string;
export declare function hammingSimilarity64(left: string, right: string): number;
export declare function buildTaskSignature(contract: TaskContract, knownArtifacts?: Iterable<string>): TaskSignature;
export declare function routeBucket(signature: TaskSignature): string;
