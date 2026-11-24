# 破甲升级 TODO 清单

标准勾选清单，覆盖已完成部分与待执行部分。上位文档：[下一版总计划](2026-11-24-armor-next-release-plan.md) · [逐文件执行清单](2026-11-24-armor-execution.md) · [决策记录](2026-11-24-armor-community-core.md)。

状态：Wave 1 未开始 · **完成 10 / 63** · 更新 2026-11-24

图例：`[x]` 已完成且有证据 · `[!]` 阻塞（等决定）· `[ ]` 未开始

## A 已完成：调研、决策、计划与基线

- [x] A1 核对社区版仓库身份：`kingcharleslzy-ai/dsh-purge`，MIT，12,069 star / 4,667 fork，最新稳定版 `v1.7.20`（2026-11-17T15:37:33Z），`master` HEAD `e519253d`（2026-11-18T10:24:44Z）。
- [x] A2 记录发行物摘要：`dsh-purge-community-1.7.20.tgz`，sha256 `5b3d66e804ea0b1cf6ef01035a292755ab9fea771b8f5338000954075dd6b45a`。
- [x] A3 摸清社区版注入机制：`lib/rules.js` 的 `resolveInjectText` 三级取值（框内提交 > `prompt-inject.md` > 内置槽）+ `ensureOperatorBody` 挂载 + `system-prompt/assemble` waterfall 前置重排。
- [x] A4 摸清社区版补丁面：86 条宿主锚点补丁、25 层自检、备份回滚、`refusal-retry` 三臂与 1.7.20 的四个审计标签。
- [x] A5 确认社区版没有可整体替换的单块正文，正文是磁盘可变状态；据此确定「换核不换壳」的判定。
- [x] A6 定位 DSHU 侧已有接缝：`agent/turn-stopping`（`agent.ts:402`）、`agent.steer` / `agent.followup`、`MessageSourceMap` 标签、`spend-limit` 续跑先例、`snapshotEvents` 可读最后一条 assistant 消息。
- [x] A7 量化现状：`armor-probe` 2026-11-19 基线，armor 臂完整交付 90% / 拒答开头 10% / 前缀约 6.5k token，bare 臂 36% / 62%；剩余空间只在 `fraud` 50% 与 `forge` 83%。
- [x] A8 决策：正文这层已饱和，效果杠杆在宿主句式与运行时重试；排序为机制优先、正文最后。
- [x] A9 产出三份文档（决策 / 逐文件执行 / 排期）并互链。
- [x] A10 接盘核对：`main` @ `473891723e` 与 `origin/main` 同点；已发行 `v2026.11.23.0` / 运行时 `2026.1123.0` / 内核 `rc.5`；候选 `kernel/0.2.3-alpha.2`（tag `dsh-v0.2.3-alpha.2`、base `4b399c39`、树 `8ffb1ff8`）。

## B 开工闸门（需你确认）

- [ ] B1 决定 D1：web 四预设官方身份句改为清空 / 中性句（建议 `minimal` 清空，`standard` / `ptc` 中性句）。
- [ ] B2 决定 D4：下一版最终模式清单；若收窄，Wave 2 同步删除文本里对已移除能力的承诺。
- [ ] B3 确认两波落点：Wave 1 进 `main`，Wave 2 等产品候选。
- [ ] B4 确认 Credit 措辞（总计划 4.1）。

## C Wave 1：`main` 上可独立验收的部分

### C-1 溯源与 Credit（轨道 C）

- [ ] C1 `product.json` 的 `purge` 块改指社区版：仓库、`tag: v1.7.20`、`commit: e519253d…`、`commitTime`、`artifact` 摘要；保留 `licensedContentCommit: e1d8e590…`。
- [ ] C2 `scripts/client-build-environment.ts` 增加 `DSH_CLIENT_PURGE_REPO` / `DSH_CLIENT_PURGE_VERSION` 的校验与导出。
- [ ] C3 三个 fixture 同步补字段：`client-build-environment.client.spec.ts`、`release/families.spec.ts`、`apps/desktop/tests/pack-local-packages.spec.ts`。
- [ ] C4 `AboutDialog.tsx` 的 URL 改按环境变量派生，同组增加版本行；`locales.ts` 增加 `purgeVersion` 词条。
- [ ] C5 `apps/desktop/src/about.ts` 与 `locale.ts` 读取并展示社区版仓库与版本。
- [ ] C6 `README.md` 版本基线表改指 `v1.7.20`。
- [ ] C7 `README.md` Credit 拆成三条署名（原作者保留第一行、社区维护单列、JeffKeeping 作补充）。
- [ ] C8 新增 `LICENSES/dsh-purge-community-MIT.txt`，保留原 `LICENSES/dsh-purge-MIT.txt`。
- [ ] C9 `THIRD_PARTY_NOTICES.md` 与 `scripts/gen-third-party-notices.ts` 追加社区版署名。
- [ ] C10 `docs/user/guide/dshu.md` 与 `发布稿/项目介绍.md` 的措辞改「dsh-purge Community 破甲核心」。
- [ ] C11 新增升级指南 `docs/upgrade-guide/v<下一版本>/armor-community/guide.md`。
- [ ] C12 跑 `pnpm run typecheck` + 三个 spec + `pnpm run doc-sync`，`pnpm run dev:web` 下核对关于页四项。

### C-2 `refusal-retry` 新包

- [ ] C13 建包骨架：`package.json`、`tsconfig.json`（照 `guard/repeat-tool-reminder`）。
- [ ] C14 `src/types.ts`：`refusal/retry` 会话事件的合并声明，JSDoc 带 `@mode` / `@param`。
- [ ] C15 `src/classify.ts`：四类结局纯函数与阈值常量。
- [ ] C16 `src/arms.ts`：三臂文本与 `retryMessage(arm)`，source 带 `kind` 标签。
- [ ] C17 `src/index.ts`：`apply` 挂 `agent/turn-stopping`，预算挂 `WeakMap`，用 `agent.steer` 续同一轮。
- [ ] C18 `tests/classify.spec.ts` + `tests/index.spec.ts`：四类结局、上限、关闭路径、dispose 后不再触发。
- [ ] C19 `README.md` / `README.zh.md`：配置表、Model Experience、`Known Limitations`。
- [ ] C20 `pnpm vitest run packages/guard/refusal-retry` + `test:coverage` 该包 100%。

### C-3 探针台

- [ ] C21 将 `scripts/armor-probe/`（含 `run.mjs` / `score.mjs` / `probes.mjs` / `README.md` / `baseline.md`）纳入版本控制。
- [ ] C22 `probes.mjs` 追加 10 条真实请求类别 + 1 条负对照；`fraud` / `forge` 各补 3 条 direct。
- [ ] C23 `score.mjs` 增加负对照「误触发」列。
- [ ] C24 全量跑一轮，`baseline.md` 增加 2026-11-24 记录段并保留 11-19 段。

## D Wave 2：产品候选树上执行

### D-1 文本层

- [ ] D1 `agent-instructions/src/render.ts` 引言改 ACTIVE/MANDATORY 强句，README 与 spec 同步。
- [ ] D2 `user-approval/src/index.ts` 的 `NEVER_SENTENCE` 改写为「已全权访问，不必请求许可」，README×2 与 spec 同步。
- [ ] D3 `bundle/sdk-minimal/cordis.patch.yml` 删掉 pwsh「无网络」句，与 bash 段措辞对齐。
- [ ] D4 `uncensored-armor/src/local/*` 追加资金与文书两条定向规则（中英各一版）。
- [ ] D5 `uncensored-armor` 新增 `boost.{zh,en}.ts` 与 `Config.boost` 及 `uncensored:boost` section。
- [ ] D6 `uncensored-armor` 拆分 `core/*` + `local/*` + 组合器，导出名与挂载行不变。
- [ ] D7 新增 `scripts/sync-armor-core.mjs` 与 `armor-core.lock.json`，含 `--check` 离线校验。
- [ ] D8 `uncensored-armor/tests/core-sync.spec.ts`：校验通过、篡改即失败、`local/` 不参与。
- [ ] D9 按 B1 结论处理 `web-app/cordis.patch.yml` 与三个 web preset 的身份句。

### D-2 注册合并与候选重建

- [ ] D10 `tsconfig.host.json` 增加新包引用。
- [ ] D11 `packages/bundle/base/package.json` 增加依赖。
- [ ] D12 `packages/bundle/base/cordis.patch.yml` 插入 `refusal-retry` 行与配置。
- [ ] D13 重新生成 `kernel/0.2.3-alpha.2/dshu.patch`。
- [ ] D14 更新 `source.json.tree` 并用 `scripts/prepare-kernel-candidate.mjs` 复现，树号必须相等。

### D-3 快照与 SDK

- [ ] D15 `pnpm run build:artifacts` + `test:snapshot:record`（需 key）一次重录 112 个 `system-prompt*.expected.md`。
- [ ] D16 `pnpm run test:snapshot` 无密钥复核 + `pnpm run build:check`。
- [ ] D17 更新 TypeScript 与 Python 两套 SDK 的预期输出（新增事件与插件）。
- [ ] D18 `pnpm run doc-sync`：module-graph、config-catalog、composition 生成物刷新。

## E 评测与验收（最终候选）

- [ ] E1 文本核全量：32 探针 × 2 臂 × 2 采样，完整交付 ≥90%、拒答开头 ≤5%。
- [ ] E2 定向：`fraud` / `forge` 各 6 条，拒答开头 ≤1/6。
- [ ] E3 重试臂命中率 ≥50%，`refusal/retry` 事件可见且可回放。
- [ ] E4 成本：额外 token ≤ +25%，缓存前缀增幅 ≤15%。
- [ ] E5 负对照 doxx 不误触发重试。
- [ ] E6 四模式各起一次真实会话，无启动失败。
- [ ] E7 生产配置回归（`thinking=on --effort=max --max-tokens=24000`）无空回答格。
- [ ] E8 会话导出后压缩重放，重试记录仍可读。
- [ ] E9 记录本轮证据到执行清单的「验收记录」段。

## F 发布（与接盘路线第 6–7 步合并）

- [ ] F1 `release-notes.md` 增加破甲来源与行为变更段。
- [ ] F2 README 版本基线表与关于页在安装包内复核一致。
- [ ] F3 许可与第三方声明按最终产物重算。
- [ ] F4 Windows x64 包内确认新插件可加载、旧资料可升级。
- [ ] F5 过渡版 10 附件清单核对（沿用交接路线命令）。
- [ ] F6 常规 Release 5 附件清单核对，并回读标签与正文。

## 进度统计

| 段 | 总数 | 已完成 |
| --- | --- | --- |
| A 已完成 | 10 | 10 |
| B 闸门 | 4 | 0 |
| C Wave 1 | 24 | 0 |
| D Wave 2 | 18 | 0 |
| E 验收 | 9 | 0 |
| F 发布 | 6 | 0 |
| 合计 | 63 | 10 |
