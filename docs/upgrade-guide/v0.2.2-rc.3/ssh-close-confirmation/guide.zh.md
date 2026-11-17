---
kind: upgrade-guide
description: "直连 SSH 客户端要求 helper 协商并确认关闭完成。"
---

# SSH 关闭确认

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-ssh/direct` 和 `@deepseek-ai/dsh-target-protection/ssh` 要求在 helper 握手中发送 `closeConfirmation: true`。配套 helper 仅在已接受的文件 I/O、进程和清理全部结束后，以 `{ quiescent: true }` 确认关闭。新客户端在发布就绪状态前拒绝旧 helper。使用匹配协议版本的客户端可省略该字段，关闭时收到 `null`。默认 OpenSSH 客户端不要求此协商。

已激活的直连连接若无法确认关闭，释放会以 `SSH_REMOTE_CLEANUP_UNCONFIRMED` 拒绝，并保留执行依赖。受保护连接会保留规则修订：所有者设置变更等待确认关闭后才提交，关闭失败会禁用新的原生执行。TCP 断连不能确认远端终止。操作不会自动重连或重放。

## 迁移

1. 停止已有远端任务，然后先部署配套的 [SSH helper 运行时](../../../../packages/ssh/ssh-helper-runtime/README.zh.md)，再升级直连客户端。运行时应位于 Agent 不可写的路径。
2. 计算已安装 helper 入口的 SHA-256，并更新连接 `cordis.yml` 或配置档补丁中的 `helperHash`。保留经独立核验的 `hostKeySha256` 和已有凭据引用。
3. 升级客户端并确认连接就绪。正常关闭时确认释放成功。受保护连接还需确认规则变更仅在连接关闭后完成。
4. 遇到 `SSH_REMOTE_CLEANUP_UNCONFIRMED` 时，通过可信管理连接核查并停止所属远端进程及待处理文件操作，再重启或重新加载 Host。重试前检查结果不确定的变更；不能把重启当作远端清理完成的证明。
