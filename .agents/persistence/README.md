# 持久化兼容性记录

这些文件供开发校验使用。`changes/` 保留上游历史声明，[格式状态](status.md)记录写入格式、兼容基线和发布证据。历史命令用于解释对应版本的决定。当前 DSHU 操作见下方命令。

`scripts/persistence-layout.json` 显式选择内部记录位置。冻结的 schema、发布快照和 v4 检查点继续保存在 `docs/persistence-changes/` 原路径，校验仍核对前驱、摘要、版本、双语声明及最终确认后的不可变性。

新增持久化类型后运行 `pnpm run persistence-changes --record 日期-名称 --decision same-version --prose 文件.json`，其中 prose 包含 en/zh 的 summary、compatibility、verification；版本升级时选择 version-bump。该命令只生成内部说明和机器目录，不恢复公开文档站。随后运行 `pnpm run verify-persistence-changes` 与 `pnpm run verify-persistence-catalog`。
