---
kind: upgrade-guide
description: "SSH 客户端须使用协议 4 的 helper 获取资源匹配审计回执，并在效果完成后报告审计未经确认。"
---

# 处理 SSH 文件审计未经确认

[English](guide.md) | 中文

## 变更

配置 `target-protection` 审计存储后，受保护 SSH 除连接准入外，也记录文件请求结果及拒绝。helper 已返回结果、但审计确认失败时，会抛出代码为 `TARGET_AUDIT_UNCONFIRMED` 的 `TargetAuditError`；远端效果可能已经完成。`TARGET_AUDIT_UNAVAILABLE` 在分派前拒绝后续文件请求。准入记录写入失败仍会阻止底层操作。

SSH 客户端与 helper 使用协议 4，旧协议对端在就绪前拒绝握手。回复包含当前请求实际匹配的文件规则，包括拒绝结果；受保护客户端将索引关联到所保留的中央资源映射。未知规则索引会以 `TARGET_AUDIT_UNCONFIRMED` 关闭连接，因为远端效果可能已经完成。

无法交付流式结果时会关闭已分配的 helper 游标。游标清理未经确认时保留未确认错误及诊断原因。取消和传输失败不能证明回滚。保护默认值和审计记录字段不变。

## 迁移

1. 停止远端工作，将匹配的 [helper 运行时](../../../../packages/ssh/ssh-helper-runtime/README.zh.md) 部署到 Agent 不可写的位置，并将 `cordis.yml` 或 profile patch 中的 `helperHash` 更新为其 SHA-256。升级客户端并确认就绪；保留独立核验的主机密钥及凭据。
2. 确保配置的 `auditPath` 可由 Host 写入，并与规则注册库分开。发生审计故障后恢复审计存储，再重新启动受影响的提供方。
3. 消费者遇到 `TARGET_AUDIT_UNCONFIRMED` 时，须先检查远端文件状态再重试。不得自动重放变更或继续受影响的流。`TARGET_AUDIT_UNAVAILABLE` 表示该请求尚未开始。
4. 使用临时目标验证：拒绝写入后文件不变；允许的审计读取仅记录命中的中央资源；注入最终审计故障后，应报告不确定状态且保留实际文件结果。参见[资源检查](../../../../packages/ssh/ssh/tests/direct/central-file-mapping.spec.ts)、[执行检查](../../../../packages/guard/target-protection/tests/remote-audit.spec.ts)及[流清理检查](../../../../packages/ssh/ssh/tests/direct/audit.spec.ts)。

文件身份是经认证端点及请求路径的带密钥指纹。资源 ID 仅来自经核验的 helper 实际匹配；静态路径规则没有中央 UUID。审计记录不增加密钥、路径明文或文件内容。
