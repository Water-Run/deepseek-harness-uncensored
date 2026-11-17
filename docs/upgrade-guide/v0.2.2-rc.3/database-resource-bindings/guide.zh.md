---
kind: upgrade-guide
description: "原生 PostgreSQL 和 MySQL 请求会拒绝尚未配置端点身份的生产路径资源。"
---

# 关联原生数据库资源

[English](guide.md) | 中文

## 变更

受保护的 PostgreSQL 和 MySQL 提供方使用原生数据库范围。启用的生产资源若只有路径选择器，会在所有者提供端点关联或明确网络别名前拒绝数据库请求。在另一个绑定中省略关联，也不会使该请求获得豁免。普通端点检查不能证明原生数据库覆盖。

可选的 `databases[].resourceIds` 包含中央服务器或数据库 UUID。数据库资源作用于配置的主机、端口及启动数据库；服务器资源覆盖该端点的所有库。原有选择器继续生效。缺失或域名资源引用会拒绝提供方激活，删除被引用资源后停止后续操作。生产保护优先于测试例外。

这些是所有者关联，不是远端数据文件发现。TLS、协议身份、角色、测试开关及表约束仍须满足。默认值继续关闭或为空；持久规则及审计字段不变。

## 迁移

1. 在所有者设置中检查启用的生产资源。对原生数据库提供方涉及的每个纯路径资源，确认其现有中央 UUID 及实际端点，区分服务器级和单库策略。
2. 在 `cordis.yml` 或 profile patch 的相应 PostgreSQL/MySQL 条目中添加 `resourceIds: ["<服务器 UUID>", "<数据库 UUID>"]`，只包含适用资源；已有明确网络别名仍可使用。重启受影响的提供方，先修复无效引用再发送工作。
3. 自定义原生数据库执行器须向 `targetProtection.checkConnection` 传入 `database` 范围及经校验的所有者关联。生产路径身份未确认时，不得降级为普通端点检查或自动重试。
4. 使用临时的完全保护、审计及测试资源验证：完全保护不发起连接，审计允许固定只读查询并拒绝写入，测试写入仍须单独开启且取得提交确认。参见 [PostgreSQL](../../../../packages/guard/target-protection/tests/postgres.spec.ts)、[MySQL](../../../../packages/guard/target-protection/tests/mysql.spec.ts)和[资源策略](../../../../packages/guard/target-protection/tests/database-resources.spec.ts)检查。
