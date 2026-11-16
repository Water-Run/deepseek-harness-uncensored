# SSH 关闭确认与规则修订保留

状态：源码实现及 Windows/Linux 定向回归通过，并随 `2026.11.17.1` 检查版安装。可选会话路由与代理归属见[后续实现](2026-11-17-ssh-session-routing.md)，实体远程、网络与身份映射等未完成范围继续保留在 [TODO](../TODO.md)。

## 实现

受保护 SSH 在启动前保留准入时的规则修订。规则变更停止新操作，调用连接关闭，并在收到远端关闭确认及本地 I/O 结束后才提交。断连、远端清理失败或无效确认产生 `SSH_REMOTE_CLEANUP_UNCONFIRMED`，原规则保留，新的原生执行拒绝准入。关闭请求不受正在撤销的准入信号破坏；没有把 TCP 关闭当作远端停止。

直连客户端在 hello 中要求 `closeConfirmation: true`。新 helper 接受该可选字段，等待已接受的文件 I/O、进程和清理后回复 `{ quiescent: true }`。旧客户端仍得到原有的 `null`；新客户端拒绝不能协商的旧 helper。部署顺序及未知结果的处理见[中英文迁移指南](../../docs/upgrade-guide/v0.2.2-rc.3/ssh-close-confirmation/guide.zh.md)。

异步获取执行保留后再次检查连接是否已撤出；晚到的保留立即释放，不创建 TCP。共享连接仍属于部署，未绑定首个 Agent，也未新增默认启用的保护。

## 验证

关闭失败仍释放保留、规则提前提交这两个新增回归在修复前失败。实际 POSIX helper 的文件 I/O 屏障用例通过；仅撤去排空屏障的负对照会提前回复，按预期失败，随后恢复源码。测试不以固定睡眠代替收尾完成。

Windows 直连、代理、Loader 及保护六个文件共 52 项通过；两个独立测试进程并发，各 52 项通过。Linux 对应直连用例及 helper、文件、子进程、终端、沙盒相关共 19 个文件、175 项通过。覆盖正常确认、旧 helper 握手拒绝、三种无效回复、断连保留修订、新执行拒绝、等待远端确认才提交，以及依赖撤出后的晚到保留释放。

SSH 服务端使用自建回环 ssh2 夹具，包含真实认证与 SSH 通道；helper 用例执行本机 POSIX helper 和真实文件/进程提供方。没有接触用户或生产服务器。测试代理在 SSH 清理完成后才关闭；异步凭据用例释放持有的屏障后再等待规则变更，避免夹具自己形成循环等待。断连用例在核对拒绝和保留后，仅释放其观测到的真实测试保留，清理不运行远端任务的私有夹具。

8 项产物构建、随后 2 项聚合编译、定向 lint、全仓导出 JSDoc、三组文档配对及升级指南校验通过。`doc-sync` 在本分支只检查公开 README，已通过；全仓 Markdown 链接仍有 30 处既有断链，本轮修改的九份文档链接均通过，详见[检查整理](2026-11-17-validation-followup.md)。

原始日志位于 `%USERPROFILE%/DSHU-Deliveries/20261116/`，前缀 `ssh-close-`：`before.log` 为初始失败，`helper-negative.log` 为负对照，`linux-neighbors.log` 为 175 项通过，`concurrent-{1,2}.log` 为各 52 项通过。`build-artifacts.log`、`build-check-final.log`、`lint.log`、`jsdoc.log`、`pairing-check.log`、`upgrade-guides.log` 和 `scoped-links.log` 为构建及检查记录。未修改 Session 事件、持久化格式或模型输出，不把这些协议回归当作真实远程设备验收。

## 后续范围

继续按“域名/主机规则 → 服务器/数据库 → 审计联动”推进，保留入站、冷重启、部署、其他协议、SSH 按会话代理归属及远端身份映射验收。此项不完成这些范围，也不改变进阶保护默认关闭的要求。
