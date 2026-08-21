declare module '@deepseek-ai/cordis' { export type Context = any }
declare module '@deepseek-ai/schemastery' { const z: any; export default z }
declare module '@deepseek-ai/dsh-agent' { export type Agent = any; export type PreStepDecision = any }
declare module '@deepseek-ai/dsh-llm' {
  export const createUserMessage: any
  export const ReasoningEffortId: any
  export type ContentBlock = any
  export type LlmCallConfig = any
  export type LlmResolvedModelInfo = any
  export type UserMessage = any
}
declare module '@deepseek-ai/dsh-session' { export type Session = any }
declare module '@deepseek-ai/dsh-tools' { export const defineTool: any }
declare module '@deepseek-ai/dsh-system-prompt' {}
declare module '@deepseek-ai/dsh-plan-mode' {}
declare const process: any
declare const Buffer: any
declare module 'node:crypto' { export const createHash: any }
declare module 'node:os' { export const homedir: any }
declare module 'node:path' { export const join: any; export const dirname: any }
declare module 'node:fs/promises' { export const appendFile: any; export const mkdir: any; export const rename: any; export const stat: any; export const readFile: any; export const rm: any; export const cp: any }

declare module 'node:os' { export const homedir: any; export const tmpdir: any }
declare module 'node:child_process' { export const execFile: any }
declare module 'node:util' { export const promisify: any }
