# 破甲核心切换到 dsh-purge Community 计划

逐文件执行清单（提交单元、diff、闸门、回滚）见 [2026-11-24-armor-execution.md](2026-11-24-armor-execution.md)；排期与两波落点见 [2026-11-24-armor-next-release-plan.md](2026-11-24-armor-next-release-plan.md)。

## 目标

把 DSHU 下一版的破甲核心（`packages/context/uncensored-armor` 挂载的提示词）从「原版 dsh-purge 历史快照」切换到社区维护版 **[kingcharleslzy-ai/dsh-purge](https://github.com/kingcharleslzy-ai/dsh-purge)** 的内容与版本线，并让来源、许可、关于页、同步机制、评测闸门同时跟上。切换的判据不是"换了哪段文字"，而是 `scripts/armor-probe` 的完整交付率不低于现有基线，且溯源元数据全部指向仍在维护的仓库。

## 一、上游核对

| 项 | 值 |
| --- | --- |
| 仓库 | `kingcharleslzy-ai/dsh-purge`（MIT，12,069 star / 4,667 fork） |
| 最新稳定发行 | `v1.7.20`，发布 `2026-11-17T15:37:33Z` |
| 发行物 | `dsh-purge-community-1.7.20.tgz`，sha256 `5b3d66e804ea0b1cf6ef01035a292755ab9fea771b8f5338000954075dd6b45a` |
| `master` HEAD | `e519253d5b01344056055af9d2041dcafa42fed3`（`2026-11-18T10:24:44Z`，贡献者头像文档刷新） |
| 适配宿主 | DSH Desktop `0.2.2-rc.3`；`rc.1` / `rc.2` / `rc.5` 同样通过 |
| 上游自测 | `749 tests / 719 pass / 0 fail / 30 skipped` |
| 形态 | 86 条宿主补丁 + 左侧栏整页面板 + `unrestricted`/`redteam` 预设 + 25 层自检 + 备份回滚 + refusal-retry |
| 关键事实 | 社区版把正文降级为**运行时可编辑的注入正文**：`lib/rules.js` 的 `resolveInjectText` 按「本进程框内提交 > `$DSH_HOME/prompt-inject.md` > 内置默认槽」三级取值，组装前由 `ensureOperatorBody` 挂进 `dsh-purge*` section。同一份正文的体检记录在 `docs/inject-review.md`（47 段 / 20,969 字符，其中 79% 是强制语句，结论是「不能靠删段压缩，只能改写」）。因此单块文本存在，但它是机器上的可变状态，不是随仓库版本走的源文件 |

社区版的提示词侧内容只有四类，全部可定位到具体文件：

| 类别 | 上游位置 | 体量 | 作用 |
| --- | --- | --- | --- |
| 工作区引言强句 | `lib/patches/shared.mjs` → `STRONG_INTRO_CORE` / `_AUTHORIZED_TAIL` / `_ANTI_SOFT_TAIL` | 约 1.1 KB | 把 `AGENT_INSTRUCTIONS_INTRO` 换成 ACTIVE/MANDATORY + 授权声明 + 反软拒 |
| 宿主句式改写 | `lib/patches/prompt.mjs` 补丁 #2/#3/#4/#5/#43/#70/#71/#73/#76 | 每条 1–3 句 | 作用域不压 system、审批句改可提权、官方身份句剥离、终端「无网络」句清除 |
| 尾部强化段 | `lib/boost.js` → `BOOST_TEXT` | 约 1.3 KB | `<dsh_boost>` 块，挂在 section 末尾，抗长上下文漂移；默认关闭（`tuning.json` 的 `boost`） |
| 运行时重试 | `lib/refusal-retry.js` | 机制 | nudge → fiction → seed 三臂重试，1.7.20 新增 `partial_refused` / `empty_after_retry` / `refused` / `recovered` 审计标签 |

## 二、DSHU 现状

`uncensored:armor` 是一个第一方 system-prompt section，排在 `HARNESS_IDENTITY` 之前（`packages/context/uncensored-armor/src/index.ts:62`），文本是 `armor.zh.ts`（26,543 B）/ `armor.en.ts`（30,299 B）两个手写大字面量，来源 Water-Run/dsh-purge 的 MIT 提交 `e1d8e590`，关于页对照提交 `19082c2b`。

已经具备的等价物和仍然缺的，逐条核对如下：

| 社区补丁 | DSHU 现状 | 结论 |
| --- | --- | --- |
| #4 / #43 / #76 身份句剥离 | base 层已用 `includeHarnessIdentity: false` + `personaPrefix: ''` 结构性完成；但 `packages/bundle/web-app/cordis.patch.yml:21` 和三个 web 预设仍写死 `You are a coding agent powered by the {{model}} model.` | 缺口在预设层 |
| #1 / #2 / #3 引言与作用域 | `packages/context/agent-instructions/src/render.ts:18` 仍是官方 `AGENT_INSTRUCTIONS_INTRO`，无强句、无「替换稿不压过 system」的强口令 | 缺口 |
| #5 审批句 | `packages/interaction/user-approval/src/index.ts:74` 仍是 `do not request sandbox escalation (do not set sandbox_permissions)` | 缺口，且改写要贴合 DSHU 的 `danger-full-access` 事实 |
| #70 终端无网络句 | `packages/bundle/sdk-minimal/cordis.patch.yml:166` 仍保留 | 缺口（sdk-minimal 一路） |
| boost 尾段 | 无 | 缺口 |
| refusal-retry | 无 | 缺口（行为层，非文本层） |

现有计量口径已经存在，不需要新建评测台：[scripts/armor-probe](../../scripts/armor-probe/README.md) 用同一模型、同一探针跑 `armor` / `bare` 两臂，2026-11-19 的双采样基线记录在 [baseline.md](../../scripts/armor-probe/baseline.md)：armor 臂完整交付 90%、拒答开头 10%、缓存前缀约 6.5k token/请求；bare 臂 36% / 62%。这份基线同时给出了明确读数——七类里五类已顶格，剩余空间只在 `fraud`（50%）与 `forge`（83%）。

## 三、判定：不装插件本体，只移植「核」

四条理由，按权重排列。

1. **架构冲突。** 社区版 86 条补丁的锚点是官方 `app.asar` 里的宿主字符串；DSHU 是源码 fork，同样的字符串已经是自己的源码（例如审批句、身份句、preset 配置）。锚点在 fork 上不匹配，`selfcheck` 会大面积报漂移，而修漂移等于把 DSHU 改回官方文本再打补丁。
2. **单段文本没有等价替代。** 社区版把破甲拆成「宿主句式 + 预设人设 + 尾部 boost + 运行时重试」。直接删掉 26 KB armor 会同时删掉 DSHU 自己的四模式路由、安全手册引用、范围声明结构，这些是产品面，不是破甲面。
3. **挂载点冲突。** 社区插件靠 `system-prompt/assemble` waterfall 把 `dsh-purge` 前缀 section 顶到最前（`COMPLETE_PROMPT_WATERFALL_INJECT`）；DSHU 已经用 section order 达成同一效果，再叠一层会让同一段文本出现两遍，缓存前缀翻倍。
4. **回滚面。** 社区版自带备份/回滚/更新链路，与 DSHU 的安装器、关于页更新检查、`product.json` 版本链是两套并行系统，同时存在会产生"哪个版本才算数"的二义。

因此本轮切换的定义是：**换核不换壳**——`uncensored:armor`、`uncensored:boost` 两个 section 仍由 DSHU 自己挂载，文本内容改为分层组装，其中「上游片段」与社区版逐字对齐并用校验和锁定，「本地片段」明确标注不同步。

## 四、目标结构

```text
packages/context/uncensored-armor/
  src/
    core/zh.ts            # 上游片段（逐字对齐 + 来源注释 + sha256）
    core/en.ts
    local/zh.ts           # DSHU 自有：小码酱、四模式路由、范围声明、手册引用
    local/en.ts
    armor.zh.ts           # 组合器：CORE + LOCAL，导出 ARMOR_ZH（保持现有签名）
    armor.en.ts
    boost.zh.ts           # BOOST_TEXT 中文搬运
    boost.en.ts
    index.ts              # 增加 boost section 与 Config.boost
  armor-core.lock.json    # 上游版本、文件、片段 sha256
  tests/core-sync.spec.ts # 离线校验 lock 与源文件一致
```

`ARMOR_ZH` / `ARMOR_EN` 的导出名、`ARMOR_SECTION`、`Config.language` 全部保持不变，`packages/bundle/base/cordis.patch.yml:558` 的挂载行不动。新增 `Config.boost`（默认 `false`，与社区版 `readTuning().boost === true` 的默认一致）与 `uncensored:boost` section，order 取 `systemPrompt.getSectionOrder` 最大值之后，保证它是最后一段。

## 五、移植清单

| 序 | 上游来源 | 落地位置 | 动作 | 验收 |
| --- | --- | --- | --- | --- |
| 0 | 社区版内置默认正文（`resolveInjectText` 的 bundled 槽） | `src/core/{zh,en}.ts` 的正文段 | 在隔离 `DSH_HOME` 装一次 `v1.7.20`，取落盘的 `$DSH_HOME/prompt-inject.md` 作为候选正文；先用 `--armor-file` 评测，不与 DSHU 自有内容合并定稿 | 探针达标（第八节）；`armor-core.lock.json` 记录该文件 sha256 |
| 1 | `STRONG_INTRO_CORE` + `_AUTHORIZED_TAIL` + `_ANTI_SOFT_TAIL` | `src/core/{zh,en}.ts` | 逐字搬运，中文按语义等价翻译并在注释里记对应英文常量名 | `armor-core.lock.json` 的 sha256 比对通过 |
| 2 | `BOOST_TEXT` | `src/boost.{zh,en}.ts` + `uncensored:boost` | 逐字搬运；`Config.boost` 默认关，`cordis.yml` 可开 | 单测：`boost: true` 产生两个 section，`false` 只产生 armor |
| 3 | 补丁 #1/#2/#3 的引言强句 | `packages/context/agent-instructions/src/render.ts:18` | 用 `STRONG_INTRO` 替换 `AGENT_INSTRUCTIONS_INTRO`；`REPLACEMENT_AGENT_INSTRUCTIONS_INTRO` 的强口令沿用社区「替换稿不压过 system」措辞 | agent-instructions 单测 + `snapshots/session/*` 重录 |
| 4 | 补丁 #5 审批句 | `packages/interaction/user-approval/src/index.ts:74` | 改写为 DSHU 真实语义：本机 `danger-full-access` 下不需要提权，也不该停下来要许可；保留"被拒绝时换实现"的指令 | `user-approval/tests/approval.spec.ts:355` 的 `NEVER_SENTENCE` 常量同步 |
| 5 | 补丁 #43/#76 身份句 | `packages/bundle/web-app/cordis.patch.yml:21`、`presets/{standard,ptc,minimal}.patch.yml` | 待决项 D1：清空或保留 | `apps/cli/tests/web-agent-presets.e2e.ts` + 快照 |
| 6 | 补丁 #70 无网络句 | `packages/bundle/sdk-minimal/cordis.patch.yml:166` | 删除该行描述 | sdk-minimal 单测 |
| 7 | `refusal-retry`（1.7.20 标签口径） | 新包 `packages/guard/refusal-retry` | 按 DSHU 原生 seam 实现：`agent/turn-stopping` 判定 → `agent.steer` 续同一轮，臂与上限走 `Config` | 四类结局的单元测试 + 真实请求命中率 ≥50% |

第 3、4 两项是"宿主句式"，直接影响所有模式的 system prompt，必须各自单独提交、各自出快照差异，不与文本核混在一个提交里。

## 六、溯源、许可与产品展示

| 文件 | 现状 | 改动 |
| --- | --- | --- |
| `product.json` | `purge.repository` / `commit` / `commitTime` / `licensedContentCommit` / `licensedContentLicense` | 仓库改 `kingcharleslzy-ai/dsh-purge`；`version: "1.7.20"`；`commit: e519253d…`；`commitTime: 2026-11-18T10:24:44Z`；新增 `artifact`（tgz sha256）与 `tag`；保留 `licensedContentCommit: e1d8e590…` 作为历史 MIT 文本出处 |
| `scripts/client-build-environment.ts:53` | 只校验 `purge.commit` / `commitTime` | 增校验 `purge.repository`（GitHub URL 正则，复用 `:61` 的 REA 写法）、`tag`、`artifact` 的 sha256 形状；新增 `DSH_CLIENT_PURGE_REPO` / `DSH_CLIENT_PURGE_VERSION` 环境变量 |
| `packages/client/ui-settings-account/src/client/AboutDialog.tsx:117` | URL 写死 `https://github.com/Water-Run/dsh-purge/commit/…` | 改为 `${DSH_CLIENT_PURGE_REPO}/commit/${DSH_CLIENT_PURGE_COMMIT}`，版本号同行展示 |
| `apps/desktop/src/locale.ts:38,240` | `dsh-purge: {purge}` | 文案改为 `dsh-purge Community {purge}` |
| `LICENSES/dsh-purge-MIT.txt` | 原版 MIT | 保留原文件；新增 `LICENSES/dsh-purge-community-MIT.txt`（社区版 LICENSE + NOTICE 署名段） |
| `THIRD_PARTY_NOTICES.md:6`、`scripts/gen-third-party-notices.ts:794` | 只提 dsh-purge | 两处同步追加社区版署名与 MIT 声明，`pnpm run doc-sync` 复算 |
| `README.md:303,309` | 指向 `e1d8e590` 与 `19082c2b` | 主链接改社区版 `v1.7.20` / `e519253d`，历史快照降为附注并保留原作者署名 |
| `发布稿/项目介绍.md:3`、`docs/user/guide/dshu.md` | "内置 dsh-purge 的破甲提示词" | 改为"内置 dsh-purge Community 的破甲核心" |
| `scripts/install-uncensored.ps1:21` | `$SkillSource` 默认 `D:\Coding\dsh-purge\skills` | 改指本地 checkout 的 `skills` 或置空并报错，去掉硬编码开发路径 |

## 七、同步与锁定

新增 `scripts/sync-armor-core.mjs`，只做一件事：按 `product.json` 的 `purge.tag`/`commit` 取出上游两个源文件，抽出四个常量，重新生成 `src/core/*.ts` 与 `armor-core.lock.json`。

```sh
# 首次或升级时（需要网络）
node scripts/sync-armor-core.mjs --ref v1.7.20

# CI / 本地闸门（离线，只比校验和）
node scripts/sync-armor-core.mjs --check
```

`armor-core.lock.json` 结构：

```json
{
  "repository": "https://github.com/kingcharleslzy-ai/dsh-purge",
  "tag": "v1.7.20",
  "commit": "e519253d5b01344056055af9d2041dcafa42fed3",
  "commitTime": "2026-11-18T10:24:44Z",
  "license": "MIT",
  "files": {
    "lib/patches/shared.mjs": "<sha256>",
    "lib/boost.js": "<sha256>"
  },
  "fragments": {
    "STRONG_INTRO": "<sha256>",
    "STRONG_INTRO_CORE": "<sha256>",
    "STRONG_INTRO_AUTHORIZED_TAIL": "<sha256>",
    "STRONG_INTRO_ANTI_SOFT_TAIL": "<sha256>",
    "BOOST_TEXT": "<sha256>"
  }
}
```

`--check` 在离线状态下重算 `src/core/*.ts` 里每个片段的 sha256 并与 lock 比对，不一致就以错误退出。这条测试把"上游改了但 DSHU 没跟"变成构建失败，而不是靠人记得去看 release notes。`local/*.ts` 不参与校验，并在文件头写 `sync: never`。

## 八、评测闸门

核文本的每一版候选都必须先过 A/B，再合入。`run.mjs` 已支持 `--armor-file`，候选文本不需要进构建就能测。

```sh
# 1. 候选核文本落盘（组合 CORE+LOCAL 的纯文本）
node scripts/armor-probe/run.mjs --armor-file=$TMPDIR/armor-candidate.txt \
  --samples=2 --concurrency=4 --out=$TMPDIR/armor-community.jsonl
node scripts/armor-probe/score.mjs $TMPDIR/armor-community.jsonl --json=$TMPDIR/armor-community.json

# 2. 生产配置回归（thinking on / effort max / 更大预算）
node scripts/armor-probe/run.mjs --armor-file=$TMPDIR/armor-candidate.txt \
  --thinking=on --effort=max --max-tokens=24000 --samples=1 \
  --out=$TMPDIR/armor-community-prod.jsonl
```

判据：

| 指标 | 门槛 |
| --- | --- |
| 完整交付 | ≥ 现有基线 90%，允许 −2pp 波动 |
| 拒答开头 | ≤ 12% |
| 缓存前缀 | ≤ 现有 +15%（现 6.5k token/请求） |
| 生产配置 | 不出现回答为空（thinking 吃满预算）的格 |
| `fraud` / `forge` | 不得低于基线的 50% / 83% |

不达标就不进 `armor.zh.ts`，候选留在 `scripts/armor-probe/candidates/` 并记录该轮读数。

## 九、阶段与完成条件

| 阶段 | 内容 | 完成条件 |
| --- | --- | --- |
| P0 溯源 | `product.json`、构建环境校验与 env、关于页链接、许可与声明、文档措辞、安装脚本硬编码路径 | `pnpm run typecheck`；`scripts/client-build-environment.client.spec.ts` 与 `release/families.spec.ts` 通过；关于页在 `pnpm run dev:web` 下显示社区版仓库、版本与提交，链接可点开 |
| P1 宿主句式 | agent-instructions 引言强句、审批句改写、sdk-minimal 无网络句（各自独立提交） | 各自单测 + 受影响快照重录；`armor-probe` 复测不退化 |
| P2 重试臂 ★ | 新增 `refusal-retry` 插件：`agent/turn-stopping` 判定拒答 → `agent.steer` 续同一轮，有限臂、有审计、可关 | 单元覆盖四类结局（`refused` / `partial_refused` / `empty_after_retry` / `recovered`）、上限与关闭路径；真实请求回归命中率 ≥50%、额外 token ≤ +25% |
| P3 定向规则与 boost | persona 里补资金/文书两条定向规则；`Config.boost` + `uncensored:boost` section | 单测覆盖开/关两态与 section 顺序；`fraud` / `forge` 探针拒答开头从 4/12 降到 ≤1/12 |
| P4 核文本 | 拆分 `core`/`local`，组合器保持导出签名；`sync-armor-core.mjs` + `--check` + 单测 | `pnpm vitest run packages/context/uncensored-armor` 通过；`--check` 通过；`armor-probe` 达标（第八节表格） |
| P5 预设身份句 | 按 D1 结论处理 web 四预设与身份句 | `apps/cli/tests/web-agent-presets.e2e.ts` 与 web 快照通过 |

快照重录是本轮最大工作量：`snapshots/**/system-prompt*.expected.md` 共 125 个文件，其中 112 个携带当前 armor 文本。P1 之后一次性重录，命令：

```sh
pnpm run build:artifacts
pnpm run test:snapshot:record   # 需要 DEEPSEEK_API_KEY
pnpm run test:snapshot
pnpm run build:check
pnpm run doc-sync
```

## 十、风险与回滚

| 风险 | 处置 |
| --- | --- |
| 核文本质量回退 | `armor-probe` 是硬闸门；不达标不合入；候选文本留档可复跑 |
| 缓存前缀成本上升 | lock 里记录 CORE 字节数，与基线 6.5k token 对照；超 15% 即拒 |
| 上游再次消失 | `v1.7.20` 的 tgz 与两个源文件按 sha256 归档到 `kernel/`（沿用内核候选的归档做法），`--check` 不依赖网络 |
| 许可与署名 | 原版 MIT 文件不删；社区版 LICENSE/NOTICE 单列；README 保留三位作者署名与原许可链接 |
| 版本二义 | 只有 `product.json` 一个来源；关于页与环境变量全部由它派生，不新增第二套版本记录 |
| 快照雪崩 | `core`/`local` 拆分后先跑 `--armor-file` 定稿文本，再改源文件，避免多轮重录 |

回滚：P0 只改元数据，回退即改回 `product.json`；P1/P2 回退到拆分前的两个字面量文件（保留 `armor.zh.ts.bak` 到下一版发布）；P3/P4 是独立提交，单独 revert。

## 十一、待决项

| 编号 | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| D1 | web 四预设里的官方身份句是否清空（社区 #43/#76 的做法） | 影响四模式的自我描述与产品呈现 | 清空 `minimal`（本就是极简），`standard`/`ptc` 保留但改写成不含产品名的中性句 |
| D2 | `boost` 默认开还是关 | 关：与社区默认一致，成本低；开：抗漂移更强，前缀增加 | 默认关，桌面设置里可开，先在 `armor-probe` 上量出增益再决定下一版默认值 |
| D3 | `refusal-retry` 的默认值（关 / 只开第一臂 / 三臂全开） | 影响成本与误触发面 | 已决定实施（P2）；默认只开 nudge 臂，其余按 `Config` 打开 |

## 验收记录

（实施时逐项填入：命令、平台、时间、输出摘要。当前状态：计划阶段，未开始实施。）
