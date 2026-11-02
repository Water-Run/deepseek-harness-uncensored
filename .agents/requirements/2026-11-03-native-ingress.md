# 原生入站保护：实测与实施条件

属于 09.04–09.08 的真实执行保护，保持任意测试目标执行、数据库保护及后续 P3 联动范围。**基础辅助程序已接通内部启动屏障，但严格入站保护尚未完成，不能据当前测试将完整保护设为生效。**

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

- [ ] 〔进行中〕独立 WFP 辅助程序已有 Rust 实现和私有继承管道；它不自动提权。接口只接受核验后的 Job/容器，不提供通用防火墙规则、命令或任意文件接口。跨完整性级别启动及受保护部署仍待实现。
- [ ] 〔进行中〕已核验调用进程/目标 PID 的精确创建时间、同一账户、Job 归属与容器 SID；复制句柄保持原权限并要求已有查询/终止权。还须验证真实高权限过滤，以及普通子进程和嵌套容器不能脱离规则。
- [ ] 〔进行中〕正常清理已实现先确认整个 Job 归零、再事务删除自身对象；异常退出采用持久规则保留。同一次系统启动内的遗留恢复已实现并通过进程观测验证，管理员实际删除与跨系统重启维护未完成。不能仅凭父 PID 或 Job 名称消失删除规则。
- [ ] 实现受保护部署、正式提权和撤销路径。管理员夹具已可审查，仅操作临时容器及本次所有者记录；本次 UAC 启动被取消，没有写入 WFP 规则。不得静默修改全局 BFE 权限或退回宽松执行。
- [ ] 覆盖 TCP/UDP、IPv4/IPv6、本机及独立网络对端、允许的出站代理、直接绕过、取消和异常关闭；通过后再接入默认 profile、产品状态及 P3 审计。

## 已接通的基础链路

`native/target-guard` 提供固定操作的辅助程序：独立 provider/子层、IPv4/IPv6 ALE 接收规则、持久化归属信息及事务清理。`native-ingress.ts` 提供有界 IPC、取消和辅助程序关闭；私有 Broker 的可选 `ingress` 配置在发出启动字节前等待安装确认，保护失效时停止目标。公开原生提供方、用户设置和默认 profile 尚未启用它。

- [x] Rust 14 项确定性测试覆盖关闭顺序、未知结果、协议拒绝和回复失败；编译与 Clippy 无告警检查通过。
- [x] Windows 最终 122 项（含相邻宿主检查）、Linux 79 项可移植 TypeScript 测试通过，客户端/Broker/Job 所有者三个模块覆盖率全部 100%。Linux 不代表实现了 WFP 后端。
- [x] Windows 原生验证调用者创建时间错误、仅查询 Job 句柄不被扩权、WFP 权限不足时目标未放行，以及完整 Host/Broker 失败后的范围回收与保护修订释放。
- [x] 编译后的 Host/Broker/辅助程序链再次拒绝权限不足，并核对目标文件未生成、范围已关闭和原规则可更新。
- [ ] 管理员权限下的成功安装、实际流量阻止与撤销尚未运行；UAC 启动被取消，未安装服务或向系统写入过滤规则。

基础链路证据为 `.dsh-build/target-guard-tests-final-20261103.log`、`target-guard-clippy-20261103.log`、`native-ingress-portable-tests-20261103.log`、`native-ingress-linux-20261103.log`、`native-ingress-access-runtime-20261103.log`、`native-ingress-broker-runtime2-20261103.log` 和 `native-ingress-built-20261103.log`。完整工程 build 10/10、后续 build:check 2/2 通过；其余 SQL、远端资源身份及产品联动任务均保留。

## 同启动内遗留恢复

第 2 版 provider 记录包含账户、原所有者/辅助进程/目标身份、容器 SID、系统启动身份及准入前进程集合。新的 `recover` 操作可限定原所有者的 PID 与精确 FILETIME；仅处理当前账户的受支持记录。旧版或损坏记录单独计数并保留，不能从显示名称推断归属。已结束对象的删除在每个事务内复查记录、对象关联、动作、条件和标记。

在可信引导屏障关闭时取得进程集合；[内核进程序号](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntquerysysteminformation)用于识别 PID 复用。恢复须确认原三个进程已结束，集合外全部进程均可分类，且前后快照相同；任何同容器进程、不可读取身份或变化均保留规则。系统启动身份读取采用 [PHNT 的 BootEnvironment 定义](https://github.com/winsiderss/phnt/blob/master/ntexapi.h)，读取失败或启动身份不同则拒绝自动清理；跨系统重启的维护仍待实现。没有用创建时间排序推断后代，也没有以命名 Job 不存在当作空 Job。

- [x] Rust 34 项测试覆盖协议、选择原所有者、PID 复用、残留后代、快照变化及系统启动变化；Clippy 无告警检查通过。
- [x] Windows 客户端 14 项及原生拒绝 4 项通过；Linux 客户端 14 项通过，新增恢复模块覆盖率 100%。
- [x] 真实只读观测：活动容器返回 `scope-active`，终止并等待退出后返回 `quiescent`；没有 WFP 写入。
- [x] 本机对照夹具的 TCP/UDP、IPv4/IPv6 四项入站与出站均可通信，临时容器及目录已清理。
- [ ] 具备管理员令牌后运行固定夹具，验证四项入站阻止、出站保持、活动记录拒绝恢复、正常删除与辅助程序崩溃后的删除；仅限该次所有者，不检查或删除其他遗留规则。

恢复源代码为 `native/target-guard/src/recovery.rs`、`src/windows/observation.rs`、`src/windows/recovery.rs` 和 `packages/guard/target-protection/src/native-ingress-recovery.ts`。验收入口为 `native/target-guard/tests/windows-acceptance.mjs`，非提权对照使用 `--baseline`。日志为 `.dsh-build/target-recovery-tests-final-20261103.log`、`target-recovery-clippy-final-20261103.log`、`target-recovery-runtime-final-20261103.log`、`target-recovery-linux-20261103.log` 和 `target-recovery-observe-final-20261103.log`。
