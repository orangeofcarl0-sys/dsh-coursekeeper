import type { JSpaceAssistMode, Route, RouterAssistMode } from './types.js'

export const LEGACY_RL_PERSONA = 'You are a helpful software engineer assistant.'

export function jspaceAssistKernel(mode: JSpaceAssistMode): string {
  if (mode === 'off') return ''
  if (mode === 'lite') {
    return [
      '<jspace-assist mode="lite">',
      'Maintain one active working focus and pursue a viable route with confidence in execution, not certainty of belief.',
      'When uncertain, seek discriminating evidence. Do not abandon a route merely because another possibility can be imagined.',
      'Treat external evidence and falsifiers as authoritative over narrative coherence.',
      '</jspace-assist>',
    ].join('\n')
  }
  return [
    '<jspace-assist mode="legacy">',
    'Maintain a compact internal workspace: Goal, Core, Verified, Open, Next.',
    'Keep Core small and coherent. Let Verified contain only evidence-backed facts; Open contains unresolved load-bearing questions.',
    'Commit to Next until evidence changes the working model. Monitoring must change the next action or remain silent.',
    'Execution confidence is encouraged; epistemic confidence must not rise merely because the reasoning is fluent or self-consistent.',
    'If derivation stops adding constraints, obtain empirical or tool evidence instead of extending narration.',
    '</jspace-assist>',
  ].join('\n')
}

export function routePersona(route: Route): string {
  switch (route) {
    case 'direct':
      return 'You are a hands-on software engineer. Produce the requested artifact directly, then verify the result.'
    case 'inspect':
      return 'You are a careful software engineer. Inspect the current implementation and failure evidence before making the smallest relevant change.'
    case 'plan':
      return 'You are a systems software engineer. Establish interfaces, invariants, dependencies, and a bounded execution plan before broad mutation.'
    case 'explore':
      return 'You are an investigative software engineer. Form falsifiable hypotheses and obtain discriminating evidence before committing to implementation.'
  }
}

function isPersonaSection(name: string): boolean {
  return name === 'persona' || /persona/i.test(name)
}

export interface RouterAssistResult<T = any> {
  readonly sections: T[]
  readonly tools: any[]
  readonly changed: boolean
}

/**
 * Optional compatibility/experimental interface shaping. The governor remains
 * the authority for commitment, debt, falsification, and completion.
 */
export function applyRouterAssist(
  assembled: { sections?: any[]; tools?: any[] },
  route: Route,
  mode: RouterAssistMode,
  promoted: boolean,
): RouterAssistResult {
  const originalSections = [...(assembled.sections ?? [])]
  const originalTools = [...(assembled.tools ?? [])]
  if (mode === 'off' || promoted) return { sections: originalSections, tools: originalTools, changed: false }

  const planSections = originalSections.filter(section => /plan/i.test(String(section?.name ?? '')))
  const available = new Set(originalTools.map(tool => String(tool?.name ?? '')))
  const shell = available.has('pwsh') ? 'pwsh' : available.has('bash') ? 'bash' : undefined

  if (mode === 'minimal-first') {
    const core = new Set<string>(['str_replace_editor'])
    if (!available.has('str_replace_editor')) {
      if (available.has('read')) core.add('read')
      if (available.has('edit')) core.add('edit')
    }
    if (shell) core.add(shell)
    return {
      sections: [...planSections, { name: 'coursekeeper-router-persona', text: LEGACY_RL_PERSONA, order: 0 }],
      tools: originalTools.filter(tool => core.has(String(tool?.name ?? ''))),
      changed: true,
    }
  }

  const sections = originalSections.filter(section => !isPersonaSection(String(section?.name ?? '')))
  sections.push({ name: 'coursekeeper-router-persona', text: routePersona(route), order: 0 })
  const desired: Record<Route, string[]> = {
    direct: ['read', 'write', 'edit', 'str_replace_editor'],
    inspect: ['read', 'glob', 'grep', 'edit', 'str_replace_editor'],
    plan: ['read', 'glob', 'grep'],
    explore: ['read', 'glob', 'grep', 'web_search', 'web_fetch'],
  }
  const core = new Set(desired[route])
  if (shell) core.add(shell)
  const filtered = originalTools.filter(tool => core.has(String(tool?.name ?? '')))
  return { sections, tools: filtered.length > 0 ? filtered : originalTools, changed: true }
}


export const NATIVE_CANONICAL_PERSONA = LEGACY_RL_PERSONA
export const NATIVE_CANONICAL_TOOL_PREFIX = ['bash', 'read'] as const

export interface NativeCanonicalResult<T = any> {
  readonly sections: T[]
  readonly tools: any[]
  readonly changed: boolean
  readonly personaExact: boolean
  readonly personaFirst: boolean
  readonly toolPrefix: readonly string[]
  readonly toolPrefixMatch: boolean
  readonly auxiliaryToolsAtEnd: boolean
  readonly deviations: readonly string[]
}

const COURSEKEEPER_AUX_TOOL_NAMES = new Set([
  'coursekeeper_control',
  'coursekeeper_status',
  'coursekeeper_semantic_verify',
  'trajectory_control',
  'trajectory_semantic_verify',
])

function sectionText(section: any): string {
  return typeof section?.text === 'string' ? section.text : ''
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
export function applyNativeCanonicalProfile(
  assembled: { sections?: any[]; tools?: any[] },
  toolPrefix: readonly string[] = NATIVE_CANONICAL_TOOL_PREFIX,
): NativeCanonicalResult {
  const originalSections = [...(assembled.sections ?? [])]
  const originalTools = [...(assembled.tools ?? [])]

  const nonPersona = originalSections.filter(section => !isPersonaSection(String(section?.name ?? '')))
  const canonicalPersona = {
    name: 'coursekeeper-native-canonical-persona',
    text: NATIVE_CANONICAL_PERSONA,
    order: Number.MIN_SAFE_INTEGER,
  }
  const sections = [canonicalPersona, ...nonPersona]

  const byName = new Map<string, any[]>()
  for (const tool of originalTools) {
    const name = String(tool?.name ?? '')
    const items = byName.get(name) ?? []
    items.push(tool)
    byName.set(name, items)
  }
  const used = new Set<any>()
  const ordered: any[] = []
  for (const name of toolPrefix) {
    for (const tool of byName.get(name) ?? []) {
      if (!used.has(tool)) { used.add(tool); ordered.push(tool) }
    }
  }
  const ordinary = originalTools.filter(tool => !used.has(tool) && !COURSEKEEPER_AUX_TOOL_NAMES.has(String(tool?.name ?? '')))
  const auxiliary = originalTools.filter(tool => !used.has(tool) && COURSEKEEPER_AUX_TOOL_NAMES.has(String(tool?.name ?? '')))
  const tools = [...ordered, ...ordinary, ...auxiliary]

  const actualPrefix = tools.slice(0, toolPrefix.length).map(tool => String(tool?.name ?? ''))
  const presentPrefix = toolPrefix.filter(name => originalTools.some(tool => String(tool?.name ?? '') === name))
  const toolPrefixMatch = presentPrefix.length === toolPrefix.length
    && toolPrefix.every((name, index) => actualPrefix[index] === name)
  const personaExact = sections[0]?.text === NATIVE_CANONICAL_PERSONA
  const personaFirst = sections[0]?.name === 'coursekeeper-native-canonical-persona'
  const firstAux = tools.findIndex(tool => COURSEKEEPER_AUX_TOOL_NAMES.has(String(tool?.name ?? '')))
  const auxiliaryToolsAtEnd = firstAux < 0 || tools.slice(firstAux).every(tool => COURSEKEEPER_AUX_TOOL_NAMES.has(String(tool?.name ?? '')))
  const deviations: string[] = []
  if (!personaExact) deviations.push('persona-not-exact')
  if (!personaFirst) deviations.push('persona-not-first')
  for (const name of toolPrefix) {
    if (!originalTools.some(tool => String(tool?.name ?? '') === name)) deviations.push(`missing-tool:${name}`)
  }
  if (!toolPrefixMatch) deviations.push(`tool-prefix-mismatch:${actualPrefix.join(',') || '(empty)'}`)
  if (!auxiliaryToolsAtEnd) deviations.push('coursekeeper-aux-tools-not-at-end')

  const changed = sections.length !== originalSections.length
    || sections.some((section, index) => section !== originalSections[index])
    || tools.some((tool, index) => tool !== originalTools[index])

  return {
    sections,
    tools,
    changed,
    personaExact,
    personaFirst,
    toolPrefix: actualPrefix,
    toolPrefixMatch,
    auxiliaryToolsAtEnd,
    deviations,
  }
}

export interface ProtocolRequestObservation {
  readonly reasoningBlocks: number
  readonly toolResultBlocks: number
  readonly linkedToolResults: number
  readonly pluginUserMessages: number
  readonly reasoningRetention: 'observed' | 'not-observed' | 'not-applicable' | 'unknown'
  readonly nativeObservationSemantics: 'observed' | 'not-observed' | 'not-applicable' | 'unknown'
}

/** Best-effort structural observation only. This does not claim provider-side serialization. */
export function observeRequestProtocol(messages: readonly any[]): ProtocolRequestObservation {
  let reasoningBlocks = 0
  let toolResultBlocks = 0
  let linkedToolResults = 0
  let pluginUserMessages = 0
  for (const message of messages ?? []) {
    if (message?.source?.kind === 'plugin') pluginUserMessages++
    for (const block of message?.content ?? []) {
      if (block?.type === 'reasoning') reasoningBlocks++
      if (block?.type === 'tool-result') {
        toolResultBlocks++
        if (block?.source?.callId != null || block?.tool_call_id != null || message?.source?.callId != null) linkedToolResults++
      }
    }
  }
  const hasToolResults = toolResultBlocks > 0
  return {
    reasoningBlocks,
    toolResultBlocks,
    linkedToolResults,
    pluginUserMessages,
    reasoningRetention: hasToolResults ? (reasoningBlocks > 0 ? 'observed' : 'not-observed') : 'not-applicable',
    nativeObservationSemantics: hasToolResults ? (linkedToolResults > 0 ? 'observed' : 'not-observed') : 'not-applicable',
  }
}
