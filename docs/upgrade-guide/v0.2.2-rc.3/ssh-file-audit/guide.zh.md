---
kind: upgrade-guide
description: "受保护 SSH 文件请求可能在远端效果完成后报告审计未经确认。"
---

# 处理 SSH 文件审计未经确认

[English](guide.md) | 中文

## 变更

配置 `target-protection` 审计存储后，受保护 SSH 除连接准入外，也记录文件请求结果及拒绝。helper 已返回结果、但审计确认失败时，会抛出代码为 `TARGET_AUDIT_UNCONFIRMED` 的 `TargetAuditError`；远端效果可能已经完成。`TARGET_AUDIT_UNAVAILABLE` 在分派前拒绝后续文件请求。准入记录写入失败仍会阻止底层操作。

无法交付流式结果时会关闭已分配的 helper 游标。游标清理未经确认时保留未确认错误及诊断原因。取消和传输失败不能证明回滚。helper 协议、保护默认值和审计记录字段不变。

## 迁移

1. 确保配置的 `auditPath` 可由 Host 写入，并与规则注册库分开。发生审计故障后恢复审计存储，再重新启动受影响的提供方。
2. 消费者遇到 `TARGET_AUDIT_UNCONFIRMED` 时，须先检查远端文件状态再重试。不得自动重放变更或继续受影响的流。`TARGET_AUDIT_UNAVAILABLE` 表示该请求尚未开始。
3. 使用临时目标验证集成：拒绝写入后文件不变；成功写入有文件审计；注入最终审计故障后，应报告不确定状态且保留实际文件结果。参见[执行检查](../../../../packages/guard/target-protection/tests/remote-audit.spec.ts)及[流清理检查](../../../../packages/ssh/ssh/tests/direct/audit.spec.ts)。

文件身份是经认证端点及请求路径的带密钥指纹。这些记录不证明 helper 匹配的中央资源 UUID。审计记录不增加密钥、路径明文或文件内容。
