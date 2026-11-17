# 文档断链与篇幅整理

状态：30 处既有断链中已修复 28 处，两处篇幅超额已修复。两处冻结 `v0.2.2-rc.1` 指南链接已获用户明确例外授权并仅修改 URL 与配对记录，迁移文字未变；全仓 2,356 份文档链接及锚点已通过。Goal 和原有任务范围保持不变；没有修改已安装的 `2026.11.17.1` 程序。

## 已修复范围

本地文档引用的上游 CI、维护规则及专题资料改为固定的 `dsh-v0.2.2-rc.3` 版本链接，逐个以对应提交 `38a6a5c965aa99ab525161efb7cc5cf1fe62fced` 的 Git 树确认资源存在。DSHU 自有持久化状态仍指向本仓库 `.agents/persistence/status.md`，没有用上游状态替代本地依据。

文档预览的四处链接指向当前 `src/client/registry.ts` 和 `contract.ts`，并核对 `DocumentPreviewProps` 的实际声明。没有恢复已移除的目录或给校验器添加忽略项。

文档技能及其参考页改为本仓库实际离线流程：`website/docs.ts` 选择内容，`scripts/stage-dsh-docs.ts` 生成安装包内文档；移除要求执行本仓库不存在的 VitePress 和部署命令。上游网站资料保留为明确的版本化参考，不恢复网站应用。实际暂存后检查生成的升级指南索引和中英文使用手册，所属七项回归通过。

根 AGENTS 只将“every remaining any”精简为“each any”；测试策略的单元测试和覆盖率段落中英文同时精简，保留测试位置、HMR 清理、错误和竞态测试、永久回归、按文件 100%、缺 pwsh 的自跳过与豁免、CI 提供 pwsh 并执行门槛等要求。没有改变预算上限、代码或测试配置。七份受预算约束文档均已通过原校验器。

## 验证与剩余链接

`verify-md-links` 当前仅报告两个冻结指南链接，不能把它报告为全仓通过。两处均指向旧 `packages/bundle/web-app/presets/cordis.patch.yml`；已核对该文件存在于 `dsh-v0.2.2-rc.1` 的 Git 树，并准备指向同一标签的 URL，不改迁移步骤。

[升级指南技能](../skills/dsh-create-upgrade-guide/SKILL.md)规定：“After the version bump, guides in older version directories are frozen”。因此暂不应用补丁，也不重算冻结记录。补丁为 `%USERPROFILE%/DSHU-Deliveries/20261117/frozen-guide-link-fix.patch`；`frozen-guide-before.json` 保存修改前 blob，后续操作先核对，再按用户答复处理。

实际暂存及所属七项测试、公开 README 的 `doc-sync`、两项快速文档测试、全仓 lint、三组双语配对均通过。15 份改动 Markdown 的相对链接及 28 个版本化上游资源/锚点均通过定向验证；两个冻结文件的 blob 未变。全仓链接检查仍失败两处，未忽略或伪报。

材料位于同一交付目录，前缀 `doc-cleanup-`：`links.log` 为剩余两处失败，`budgets.log` 为七项预算通过，`stage.log` 和 `stage-tests.log` 为真实暂存与七项测试，`pairing-check.log` 为三组双语配对，`scoped-links.log` 为改动文档/版本化资源/冻结 blob 核对，`skills.log` 为技能元数据检查。公开 README 和快速文档测试、全仓 lint、最终提交与推送状态另有对应日志。历史“30 处/两处预算”的交付记录保留为当时事实，不改写旧产物证据。

## 用户批准的链接例外

用户已明确答复“允许，仅修链接”。实际变更仅将两个 cordis.patch.yml 链接指向同一 dsh-v0.2.2-rc.1 上游版本，并重算一组双语记录；没有修改迁移步骤。上文待确认和冻结 blob 未变的描述是先前检查的历史记录，当前以本节及源码差异为准。
