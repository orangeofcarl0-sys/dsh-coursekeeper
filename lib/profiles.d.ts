import type { JSpaceAssistMode, Route, RouterAssistMode } from './types.js';
export declare const LEGACY_RL_PERSONA = "You are a helpful software engineer assistant.";
export declare function jspaceAssistKernel(mode: JSpaceAssistMode): string;
export declare function routePersona(route: Route): string;
export interface RouterAssistResult<T = any> {
    readonly sections: T[];
    readonly tools: any[];
    readonly changed: boolean;
}
/**
 * Optional compatibility/experimental interface shaping. The governor remains
 * the authority for commitment, debt, falsification, and completion.
 */
export declare function applyRouterAssist(assembled: {
    sections?: any[];
    tools?: any[];
}, route: Route, mode: RouterAssistMode, promoted: boolean): RouterAssistResult;
export declare const NATIVE_CANONICAL_PERSONA = "You are a helpful software engineer assistant.";
export declare const NATIVE_CANONICAL_TOOL_PREFIX: readonly ["bash", "read"];
export interface NativeCanonicalResult<T = any> {
    readonly sections: T[];
    readonly tools: any[];
    readonly changed: boolean;
    readonly personaExact: boolean;
    readonly personaFirst: boolean;
    readonly toolPrefix: readonly string[];
    readonly toolPrefixMatch: boolean;
    readonly auxiliaryToolsAtEnd: boolean;
    readonly deviations: readonly string[];
}
/**
 * Experimental DeepSeek code-agent compatibility surface.
 *
 * This mode deliberately does less than router-assist:
 *   - one exact persona at the beginning of the assembled section list;
 *   - a stable full tool surface, reordered only so the candidate canonical
 *     prefix is bash -> read when those tools exist;
 *   - Coursekeeper-owned auxiliary tools are kept at the tail;
 *   - no tool is created, removed, renamed, or schema-rewritten here.
 *
 * Retained reasoning and native tool-result semantics are provider/runtime
 * properties. They are observed separately and are never fabricated here.
 */
export declare function applyNativeCanonicalProfile(assembled: {
    sections?: any[];
    tools?: any[];
}, toolPrefix?: readonly string[]): NativeCanonicalResult;
export interface ProtocolRequestObservation {
    readonly reasoningBlocks: number;
    readonly toolResultBlocks: number;
    readonly linkedToolResults: number;
    readonly pluginUserMessages: number;
    readonly reasoningRetention: 'observed' | 'not-observed' | 'not-applicable' | 'unknown';
    readonly nativeObservationSemantics: 'observed' | 'not-observed' | 'not-applicable' | 'unknown';
}
/** Best-effort structural observation only. This does not claim provider-side serialization. */
export declare function observeRequestProtocol(messages: readonly any[]): ProtocolRequestObservation;
