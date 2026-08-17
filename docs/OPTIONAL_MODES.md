# 可选 J-Space 与 Router Assist

Coursekeeper 保留前两个项目的有效机制，但把它们降为可开关 augmentation，不允许形成第二套 route/debt/verifier 控制平面。

## 1. `governor`

```yaml
augmentationProfile: governor
jspaceAssist: off
routerAssist: off
```

推荐默认。官方 persona/context 和 tool schema 最稳定，最适合测 Coursekeeper 本体收益。

## 2. `jspace-assist`

Profile 默认开启 `jspaceAssist: lite`。

Lite kernel 只做三件事：

```text
保持单一 active working focus
把 uncertainty 转成 evidence seeking
提高 execution confidence，但不提高 epistemic confidence
```

它不恢复完整动态 Goal/Core/Verified/Open/Next ledger。

`jspaceAssist: legacy` 保留更强的历史风格，用于实验；它会增加模型可见认知协议，不建议作为生产默认。

无论哪种 J-Space Assist，Coursekeeper 仍拥有：route、budget、falsifier、Debt、Verifier、finish gate。

## 3. `router-assist`

Profile 默认开启 `routerAssist: minimal-first`。

### minimal-first

只在首个未 promoted 请求中把 interface 收窄到最小可行动面，并使用历史 RL-like persona。发生 durable tool call 后停止该首轮 shaping。

它最接近旧 Router Standard 的“极简首轮接口”实验。

### task-aware

不自己重新分类 build/fix，而是把**Coursekeeper 已选 route**映射到 persona 和偏好的首轮工具集：

```text
DIRECT   hands-on
INSPECT  careful inspect-first
PLAN     systems/planning
EXPLORE  falsifiable investigation
```

这避免出现两个互相竞争的 Router。

## 4. `hybrid-assist`

J-Space lite + Router minimal-first 同时开启。

它可以测试“interface 选路 + self-efficacy induction”的组合，但也是最容易增加 reasoning、改变 tool/prompt topology 和降低 cache reuse 的模式，因此不应作为默认。

## 5. Profile 与个人经验

`augmentationProfile` 是 CalibrationDomain 的一部分。不同 profile 的历史默认只按 `crossProfileWeight=0.25` 参与。

因此做对照时建议：

```text
同 model / provider
固定其他 Coursekeeper 配置
只切 augmentationProfile
分别看质量、route failure、uncached tokens、verifier/challenger 次数
```

不要把四种 profile 的 Episode 直接合并成一份“平均提升”。

## 6. 推荐使用场景

稳定日常使用：`governor`。

想验证 J-Space 是否存在纯 controller 无法复制的额外能力增益：`jspace-assist`。

想验证 minimal first-turn interface 的轨迹影响：`router-assist`。

只有完成前两项单独 A/B 后，才测试 `hybrid-assist`。

## native-canonical

`native-canonical` 与 J-Space/Router assist 不同。它不是认知增强模式，而是协议保真实验模式。

行为：

- exact persona：`You are a helpful software engineer assistant.`；
- 候选工具前缀：`bash -> read`；
- 不按 route 动态裁剪工具；
- Coursekeeper auxiliary tools 后置；
- 正常 `pre-step` policy message 静默；
- `jspaceAssist/routerAssist/adaptiveReasoning` 强制关闭；
- retained reasoning / native tool-result 只检测，不伪造。

详见 [NATIVE_CANONICAL_MODE.md](NATIVE_CANONICAL_MODE.md)。
