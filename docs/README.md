# Coursekeeper 文档

这组文档按“使用 → 理解 → 调参 → 研究”的顺序组织。无需通读全部文件。

## 使用者

先读 [QUICKSTART](QUICKSTART.md)，然后按需要查 [CONFIGURATION](CONFIGURATION.md)、[TOOLS_AND_STATUS](TOOLS_AND_STATUS.md) 和 [TROUBLESHOOTING](TROUBLESHOOTING.md)。如果只是想稳定使用，默认 `governor + guard + adaptiveRouting=shadow + rolloutMode=single` 即可。

## 开发者

先读 [ARCHITECTURE](ARCHITECTURE.md) 和 [CONTROL_PROTOCOL](CONTROL_PROTOCOL.md)，再看 [EVIDENCE_AND_COMPLETION](EVIDENCE_AND_COMPLETION.md)、[ADAPTIVE_ROUTING](ADAPTIVE_ROUTING.md)、[EXPERIENCE_MEMORY](EXPERIENCE_MEMORY.md)、[VERIFIED_BRANCHING_MODE](VERIFIED_BRANCHING_MODE.md)、[BRANCHING_PROTOCOL](BRANCHING_PROTOCOL.md) 与 [API_REFERENCE](API_REFERENCE.md)。

## 做 A/B 或研究

读 [OPTIONAL_MODES](OPTIONAL_MODES.md)、[NATIVE_CANONICAL_MODE](NATIVE_CANONICAL_MODE.md)、[VERIFIED_BRANCHING_MODE](VERIFIED_BRANCHING_MODE.md)、[SEMANTIC_VERIFIER](SEMANTIC_VERIFIER.md)、[EXPERIMENTS](EXPERIMENTS.md) 与 [VALIDATION](VALIDATION.md)。不要把 assist profile 的表现与纯 governor 经验直接混合比较。

## 文档原则

文档中的 `默认` 指 `src/index.ts` 的运行时默认值；`bundle 默认` 指 `cordis.patch.yml`。若二者冲突，以运行时代码为准。文档明确区分控制逻辑已经实现的事实与需要真实 provider A/B 才能证明的性能结论。

- [Native Canonical 实验模式](NATIVE_CANONICAL_MODE.md)：exact persona、bash→read、retained reasoning / tool-result fidelity 的隔离测试。

- [Verified Branching](VERIFIED_BRANCHING_MODE.md)：条件多 rollout、fresh-context comparative verification、winner reverify。
- [Branching Runtime Protocol](BRANCHING_PROTOCOL.md)：WorkspaceForkProvider、BranchExecutor、ComparativeVerifierBackend 与失败语义。
- [修复规范](REPAIR_SPEC.md)：语义验证韧性、债务生命周期、交互闭环、本地 workspace fork 等 P0–P3 修复设计。
