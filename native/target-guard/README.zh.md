# DSHU 原生目标保护辅助程序

[English](README.md) | 中文

用于按容器限制 Windows 入站连接及审慎恢复遗留规则的开发组件。当前未打包、未自动提权，也未在默认产品启用；真实高权限过滤、规则删除及受保护部署仍待验证或实现。

## 资源归属

私有继承管道入口按两个管道的创建者核对调用者 PID 和精确创建 FILETIME，并拒绝容器内调用者。准入核验目标创建时间、账户和 AppContainer SID，再以相同权限复制调用者的 Job 句柄；调用者本身必须已有查询与终止权限。Job 必须仅包含可信引导程序、禁止脱离，并配置句柄关闭时终止。

辅助程序创建独立 WFP provider、子层及按该容器 SID 匹配的 IPv4/IPv6 ALE 接收/接受阻止规则。这些对象持久保留，避免辅助程序失败时目标仍运行却失去保护；provider 按版本记录进程身份、系统启动身份和准入前的进程集合。接口不接受执行命令、任意路径或调用者指定的过滤规则。

正常清理先确认 Job 成员归零，再通过事务移除自身 WFP 对象。EOF、无效 IPC、回复失败和显式停止都先终止归属 Job，再清理。无法确认终止或删除结果时报告失败，规则可能保留。

TypeScript 客户端限制消息、诊断、请求等待和辅助程序退出时间。私有原生 Broker 可在释放引导屏障前安装该保护，并在保护失效时停止执行；当前没有用户设置或默认 profile 启用此路径。所有者须提供位于目标可写范围之外的可信辅助程序。

## 遗留恢复

新辅助进程接受 `recover`，可限定原所有者 PID 与精确 FILETIME；仅处理属于已认证账户的受支持记录。所有者、辅助进程或目标仍存活时禁止删除。所有关联 WFP 对象的容器 SID、动作、条件和标记必须仍与记录一致。

进程集合在可信引导屏障关闭期间采集。内核进程序号用于区分复用 PID；集合外每个进程都须分类，观测前后进程集合必须一致。存在同容器进程、身份不可读取或快照变化时保留规则；父 PID 或 Job 名称消失不能单独证明目标已退出。系统启动身份变化时保留记录，等待显式维护；跨系统重启清理尚待实现。

第 2 版记录携带这些证据。旧版、损坏和不可读取记录单独计数，不猜测升级；每项删除在独立事务内重新核对记录和关联对象。结果分别列出已删除、保留和无法识别的记录。取消或传输失败可能发生在部分清理之后；客户端不静默重试，也不把未知结果报告为成功。

## 开发检查

在已安装 Rust 1.98.1 的 Windows 中，从仓库根目录运行：

```powershell
$env:CARGO_TARGET_DIR = "$PWD/.dsh-build/target-guard"
cargo +1.98.1 build --locked --manifest-path native/target-guard/Cargo.toml
cargo +1.98.1 test --locked --manifest-path native/target-guard/Cargo.toml
$env:DSH_NATIVE_INGRESS_HELPER = "$env:CARGO_TARGET_DIR/debug/dshu-target-guard.exe"
pnpm exec vitest run packages/guard/target-protection/tests/native-ingress-runtime.spec.ts
```

上面的原生验收用于非提权账户，检查调用者身份拒绝、WFP 权限不足、恢复拒绝以及目标未执行；`native-policy-runtime.spec.ts` 使用相同辅助程序变量覆盖完整 Broker 拒绝路径。不能用提权运行代替这些权限拒绝用例。Rust 测试检查关闭、协议和观测判定，TypeScript 测试检查有界传输；这些检查不代表真实入站过滤已经验证成功。

`node native/target-guard/tests/windows-acceptance.mjs --baseline` 创建临时 TCP/UDP IPv4/IPv6 本机端点，不修改 WFP。同一夹具不带 `--baseline` 时要求已有管理员令牌，检查过滤、正常清理和辅助进程崩溃恢复，仅选择本次所有者记录。它不自动提权，也不访问用户资料。高权限运行尚未验证。结果保存在 `.dsh-build/guard-admin-results`。

可执行文件仅使用私有继承 stdin/stdout，不启动 UAC、不安装服务、不修改 BFE 权限。生产提权、跨完整性级别的认证传输、安装及剩余验收记录在[入站工作清单](../../.agents/requirements/2026-11-03-native-ingress.md)。

## 许可

DSHU 代码采用 GPL-3.0-or-later。固定 Rust 依赖保留各自许可：serde/serde_json 和 windows-sys 采用 MIT 或 Apache-2.0，传递依赖版本记录在 `Cargo.lock` 中。本组件尚未进入发布安装包。
