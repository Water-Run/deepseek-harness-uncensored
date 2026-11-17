# SSH 文件审计的资源匹配回执

状态：源码、真实 helper 回归及录制会话重放通过，已随[本地 17.6](2026-11-17.6-delivery.md)打包并保留数据安装。公开安装包仍为 17.5；本次没有发布 Release。本项补齐保护审计中的逐文件中央资源归属，不代表完整进阶保护已经交付。

## 行为

helper 在实际路径、inode 和 Linux 挂载检查命中文件规则时，将规则索引关联到当前 RPC 的成功或拒绝回复。客户端仅根据该连接保留修订中的映射恢复中央资源 UUID，复用审计记录的 `ruleIds` 和 `matchedRules`。同一资源的多个匹配去重；静态路径规则没有中央 UUID，配置的全部资源不会被直接当作命中。

并发 RPC 独立收集匹配；路径准备、流式后续读取及最终结果保留各自的请求与原会话归属。静态完整保护先命中时，仍核对该文件的其他规则，保留实际匹配的中央资源。传输失败或取消没有回执时，不推断未返回的匹配，也不推断回滚。

协议对非整数、负数和超过规则上限的索引拒绝整个帧。客户端收到不属于已安装策略的索引时，不交付结果，以 `TARGET_AUDIT_UNCONFIRMED` 报告远端结果未经确认，并启动连接关闭；后续文件请求停止。关闭失败保留诊断及原有依赖保留规则。路径明文、文件内容和凭据不加入审计。

客户端和 helper 统一使用协议 4，旧协议在就绪前拒绝握手。部署需要更新 helper 及其固定摘要，见[迁移指南](../../docs/upgrade-guide/v0.2.2-rc.3/ssh-file-audit/guide.zh.md)。保护默认关闭，配置项、Session 事件和 SQLite 字段不变。

## 验证

- Windows 首批 83 项通过，7 项 Linux helper 用例跳过；补充的连接旧协议拒绝与映射去重回归 29 项通过。
- Linux 扩大回归 343 项通过、2 项条件跳过，使用真实 helper、认证 SSH 通道及独立临时文件。新增硬链接别名、重叠静态规则及受控并发请求，核对各自资源 UUID，原文件内容保持正确。
- `ssh-target-protection` 的 keyless Session 重放通过，场景增加资源 UUID 断言；原始 JSONL、提示词、工具 schema 及 writer 预期未改动。
- 故障对照临时移除实际匹配回执，新增 inode/并发场景在资源断言处失败；helper 源码随后逐字节恢复并核对 SHA-256。
- 产物构建及聚合编译通过，目录更新后的完整构建 10 项通过；测试清理修订后的两项聚合检查通过。构建模块的协议 4 成功/拒绝回执与保护模块导入通过，398 个 NodeNext 声明 API、导出 JSDoc、升级指南及未知类型断言检查通过。
- 公开服务 API 目录按源码重生成，所属 10 项目录回归通过。四组双语配对、README 检查、2 项文档测试与文档链接检查通过。全仓 lint 检出的格式问题已修复，最后三个修订文件以原 lint 执行器补验通过。
- 并发用例在释放屏障后等待 helper 关闭，再恢复方法替换；失败路径也保留该顺序。修订后的 16 项协议及真实 helper 用例通过，故障对照再次检出缺失回执并完成源码恢复。

首次 Linux 扩大回归因四处夹具仍固定使用旧协议而失败；已将当前协议夹具改为共享版本常量，同时保留旧协议拒绝用例。首次 API 生成检出新公开参数类型缺少文档归属，补齐后以原生成器通过。没有降低检查门槛。

材料位于 `%USERPROFILE%/DSHU-Deliveries/20261117/`，统一前缀 `ssh-resource-receipt-`：主要日志为 `windows-final.log`、`targeted.log`、`linux-final.log`、`snapshot.log`、`negative.log`、`negative-restored.json`、`final-build.log`、`aggregate-final.log`、`api-final.log`、`built-smoke-final.log`、`declarations.log`、`contracts.log`、`docs.log` 和 `lint-corrected.log`。

## 后续范围

远端数据库映射、独立 Worker 部署、入站、其他协议及实体服务器验收仍保留在 [TODO](../TODO.md)。本次没有发布 Release；发布操作遵循 [HANDOFF](../HANDOFF.md#工作约束) 中的逐次授权规则。
