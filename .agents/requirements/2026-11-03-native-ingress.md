# 原生入站保护：实测与实施条件

属于 09.04–09.08 的真实执行保护，保持任意测试目标执行、数据库保护及后续 P3 联动范围。**严格入站保护尚未实现，不能据当前测试将完整保护设为生效。**

## 已执行的验证

环境为 Windows 26340.9843、Node 24.21.0、MXC 1.0.1；源码节点 `fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2`。请求探测报告 BaseContainer、拒绝路径、目录枚举、原生入站及专用代理能力可用。验证未提权，未安装服务、修改宿主 DACL 或系统防火墙规则。

| 场景 | 出站到自有代理 | 容器内连接自身监听 | 同机进程连接监听 |
| --- | --- | --- | --- |
| 普通进程基线 | 成功 | IPv4/IPv6 成功 | 回环及本机网卡地址成功 |
| 完全禁网容器 | EACCES | IPv4/IPv6 EACCES | 超时 |
| 发布版 SDK 的代理容器 | 成功 | IPv4/IPv6 EACCES | 超时 |

监听分别绑定 `0.0.0.0` 和 `::`，端口由操作系统分配；连接方仍是本机进程。该结果不代表远端机器、UDP 或全部 Windows 版本的入站验证。完全禁网同时阻断内部回环，因此不能直接把 TCP 代理移入同一容器，再用管道转发来满足现有客户端。

上游 [网络说明](https://github.com/microsoft/mxc/blob/fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2/docs/backends/process-container/networking.md) 明确代理模式需要双向 `privateNetworkClientServer` 能力。[原生映射](https://github.com/microsoft/mxc/blob/fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2/src/mxc-sdk/src/backends/process_container/common/base_container_helpers.rs) 未填入 PSEC 的 ingress 表；目前观察到的入站超时不能替代明确的拒绝策略。

已在独立源码副本编译两种候选，只给代理请求补充 ingress 表：默认拒绝且回环拒绝；默认拒绝且回环允许。两种候选均在创建代理容器时被 `CreateProcessSecurityEnvironment` 拒绝，HRESULT `0x80070057`。没有将候选 DLL 放进产品、替换 npm 包或改写系统安装版。这些结果否定当前机器上的这两种映射，不断言所有原生 API 或未来系统都无法实现。

WFP 实测结果为 `open=0, add=5, close=0`：当前账户可以打开过滤引擎，但增加空子层被拒绝。探针使用动态会话，没有创建流量过滤器或留下持久对象。[微软访问控制说明](https://learn.microsoft.com/en-us/windows/win32/fwp/access-control)区分打开与添加权限；不能把能打开引擎当作可安装过滤规则。

## 复现与证据

以下命令只操作自有临时文件、监听和测试进程。输出是观测结果，命令退出成功不代表完整保护已通过。

```powershell
node packages/guard/target-protection/tests/fixtures/native-network-probe.mjs
node packages/guard/target-protection/tests/fixtures/native-wfp-access-probe.mjs
```

原始记录位于 `.dsh-build/native-ingress-published-20261103.json`、`native-ingress-repro-20261103.json`、`native-ingress-patched-20261103.log`、`native-ingress-hostallow-20261103.log` 和 `native-wfp-access-20261103.json`。维护后的探针独立并行重放两个候选，`native-ingress-deny-repro-20261103.json` 与 `native-ingress-hostallow-repro-20261103.json` 均确认普通基线/禁网执行正常、仅代理容器创建被拒绝。隔离源码副本为 `.dsh-build/mxc-ingress-20261103`，构建日志为 `mxc-ingress-build-20261103.log` 与 `mxc-ingress-build-hostallow-20261103.log`。使用现有 Rust 1.98.1、锁文件和两个编译任务，未修改系统工具链。

拒绝回环候选 DLL 的 SHA-256 为 `616bc6d95549fd7bab1a46e778499e28ea52a000196b1760fca4994771593580`；允许回环候选为 `22dd5002c5197c72d26aa153ef9d13fbe7781bb795af26fc2b63e74dbcc019c7`。前者保存在 `.dsh-build/mxc-ingress-deny-20261103`，后者在 `.dsh-build/mxc-ingress-target-20261103/release`。仅用于重现实验，不是可交付运行时。

## 后续实现与验收

- [ ] 实现最小权限的独立 WFP 辅助程序。模型、普通宿主和目标进程不取得该权限；接口只接受已核验的 DSHU 执行范围，不提供通用防火墙修改能力。
- [ ] 校验调用进程、PID 创建时间、Job 归属和容器 SID；目标代码启动前确认 IPv4/IPv6 入站限制已生效。验证普通子进程和嵌套容器不能脱离规则。
- [ ] 在确认整个执行范围退出后再释放规则。辅助程序或宿主异常退出不能形成过滤先撤销、目标仍运行的窗口；恢复清理只移除确认归属的对象，不修改其他应用策略。
- [ ] 实现构建、部署、权限不足和撤销路径；需要管理员参与的实际验收，留到辅助程序及操作范围可审查后进行。不得静默修改全局 BFE 权限或退回宽松执行。
- [ ] 覆盖 TCP/UDP、IPv4/IPv6、本机及独立网络对端、允许的出站代理、直接绕过、取消和异常关闭；通过后再接入默认 profile、产品状态及 P3 审计。

这是一条待实现路径，尚未完成其安全接口、安装或真实过滤验收。现有原生命令、ConPTY、HTTPS 检查保持原状，其余 SQL、远端资源身份及产品联动任务均保留。
