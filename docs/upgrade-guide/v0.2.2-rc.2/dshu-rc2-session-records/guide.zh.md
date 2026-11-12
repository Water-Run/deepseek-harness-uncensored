---
kind: upgrade-guide
description: "旧 DSHU 读取方可能拒绝新的具名子级和 Team 记录。"
---

# DSHU rc.2 Session 记录

[English](guide.md) | 中文

## 变更

rc.2 适配保留 Session 格式 4，并继续读取既有日志。新的子级目录使用 payload 版本 3，Team 选择使用 `team/mode`，任务记录可以携带 `ownerName`。早于这些记录的读取方可能拒绝未知目录版本、必读事件或任务字段；相同的 Session 格式号不保证支持降级。重试和结算来源元数据也会进入 DSHU 预测与记忆审计。[本地确认记录](../../../../.agents/persistence/changes/2026-11-12-rc2-intake.md)单独确认合并后的分支类型，不混入上游参考历史。

## 迁移

1. 退出 DSHU，保留升级前的数据目录副本，通常为 `~/.dsh-uncensored`，或 `DSH_UNCENSORED_HOME` 指定的目录。
2. 使用相互匹配的 DSHU Windows 或 Linux 构建及 SDK，先打开既有对话，再创建新的具名子级或 Team 记录；历史记录无需改写或回填字段。
3. 降级后若旧构建拒绝新记录，退出应用并恢复升级前备份。不要删除未知事件或手动修改 Session 版本来绕过准入。
