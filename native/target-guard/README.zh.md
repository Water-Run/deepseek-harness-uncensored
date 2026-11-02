# DSHU 原生目标保护辅助程序

[English](README.md) | 中文

用于按容器限制 Windows 入站连接的开发组件。当前未打包、未自动提权，也未在默认产品启用；真实高权限过滤、受保护部署和遗留规则恢复仍待验证或实现。

## 资源归属

私有继承管道入口按两个管道的创建者核对调用者 PID 和精确创建 FILETIME。准入核验目标创建时间、账户和 AppContainer SID，再以相同权限复制调用者的 Job 句柄；调用者本身必须已有查询与终止权限。Job 必须仅包含可信引导程序、禁止脱离，并配置句柄关闭时终止。

辅助程序创建独立 WFP provider、子层及按该容器 SID 匹配的 IPv4/IPv6 ALE 接收/接受阻止规则。这些对象持久保留，避免辅助程序失败时目标仍运行却失去保护；provider 记录调用者和目标身份，供后续恢复功能核验。接口不接受执行命令、任意路径或调用者指定的过滤规则。

正常清理先确认 Job 成员归零，再通过事务移除自身 WFP 对象。EOF、无效 IPC、回复失败和显式停止都先终止归属 Job，再清理。无法确认终止或删除结果时报告失败，规则可能保留。辅助程序异常退出后的恢复尚未实现，因此高权限部署尚未就绪。

TypeScript 客户端限制消息、诊断、请求等待和辅助程序退出时间。私有原生 Broker 可在释放引导屏障前安装该保护，并在保护失效时停止执行；当前没有用户设置或默认 profile 启用此路径。所有者须提供位于目标可写范围之外的可信辅助程序。

## 开发检查

在已安装 Rust 1.98.1 的 Windows 中，从仓库根目录运行：

```powershell
$env:CARGO_TARGET_DIR = "$PWD/.dsh-build/target-guard"
cargo +1.98.1 build --locked --manifest-path native/target-guard/Cargo.toml
cargo +1.98.1 test --locked --manifest-path native/target-guard/Cargo.toml
$env:DSH_NATIVE_INGRESS_HELPER = "$env:CARGO_TARGET_DIR/debug/dshu-target-guard.exe"
pnpm exec vitest run packages/guard/target-protection/tests/native-ingress-runtime.spec.ts
```

上面的原生验收用于非提权账户，检查调用者身份拒绝、WFP 权限不足以及目标未执行；`native-policy-runtime.spec.ts` 使用相同辅助程序变量覆盖完整 Broker 拒绝路径。不能用提权运行代替这些权限拒绝用例。可移植 Rust 测试检查关闭顺序和协议失败，TypeScript 测试检查客户端及 Broker 屏障；这些检查不代表真实入站过滤已经验证成功。

可执行文件仅使用私有继承 stdin/stdout，不启动 UAC、不安装服务、不修改 BFE 权限。生产提权、跨完整性级别的认证传输、安装、恢复和管理员验收记录在[入站工作清单](../../.agents/requirements/2026-11-03-native-ingress.md)。

## 许可

DSHU 代码采用 GPL-3.0-or-later。固定 Rust 依赖保留各自许可：serde/serde_json 和 windows-sys 采用 MIT 或 Apache-2.0，传递依赖版本记录在 `Cargo.lock` 中。本组件尚未进入发布安装包。
