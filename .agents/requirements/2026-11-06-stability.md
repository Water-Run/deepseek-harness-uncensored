# 17.06 稳定性检查

状态：进行中。本页修复已随源码 `7db7e35015`、检查版 `0.1.0-test.20261106.1` 安装，实际载荷及实装隔离运行验证通过。安装证据见 [HANDOFF](../HANDOFF.md)，保留全部原始交付范围。

## 已完成

- [x] **Windows 干净检出 lint（2026-11-11）**。修复复现的 5 条源码规则问题及 Corepack 下的 lint 启动失败。完整 lint、八项构建产物步骤、Host/Client 聚合检查和 66 项定向回归通过。主工作区已有的 56 个编译残留详见[交接记录](../HANDOFF.md)。

- [x] **Windows 工具链前置检查（2026-11-10）**：`--check` 与正常打包均通过 MSBuild x64 准备阶段核验所选工具集的 Spectre/SDK 条件，目录构建也不再跳过。真实 14.51 缺库场景从旧检查通过变为 `MSB8040` 提前拒绝，14.52 Preview 通过。正常打包失败记录仅包含配置和工具链两阶段，尚未构建或下载。82 项定向回归、最终 Host/Client 聚合检查和相关 lint 通过，日志前缀 `.dsh-build/preflight-spectre-` 与 `msvc-preflight-`。此改动用于后续源码打包。
- [x] **hygiene**：完整初查 23 项，17 项通过、6 项失败。下表六项修复后分别通过；其余检查没有相关依赖或入口变更，不重复运行。完整初查日志 `.dsh-build/hygiene-baseline-20261106.log`，修复后日志 `.dsh-build/hygiene-fixed-*-20261106.log`。
- [x] **地区数据路由**：下载继承 Host 当前传输与代理策略，不再另建或销毁代理。真实 undici 测试覆盖当月 404 后的上月请求，以及下载后传输仍可用。编译公开提供方另验证更新缓存及校验结果：`.dsh-build/hygiene-country-built-20261106-result.json`。没有访问真实下载端点或修改用户地区数据。
- [x] **定向回归**：六个测试文件共 532 项分批通过，日志 `.dsh-build/hygiene-isolation-rescope-20261106.log` 与 `.dsh-build/hygiene-country-payload-final-20261106.log`。
- [x] **编译**：`build:artifacts` 八项、随后 `build:check` 两项通过，日志前缀 `.dsh-build/hygiene-`。

| 检查 | 修复与验证 |
| --- | --- |
| `rescope-vendor:check` | 使用 vendor 现有 V17 标识；保留工具目录中的 `cordis` 预设 ID，仅重命名真实包引用。vendor 内容未修改。同步现有四模式与 Markdown 变换测试。 |
| `constraints` | 保留 CLI 发布包中的显式目标保护示例；拒绝遗漏或混入其他配置。目标保护文件列表按既有规则排序，发布文件集合未减少。 |
| `verify-default-product-isolation` | 保留 README 已要求的三个浏览器提供方及公共运行时随包分发。仅 Desktop Host 的明确依赖边和四个固定包可作为未启用载荷；依赖图继续检查。默认源码导入、默认配置、别名、其他消费者和额外实验依赖仍被拒绝。 |
| `verify-product-use` | 删除过时的目标保护包级 optional 声明。默认界面引用其代码不等于装配执行后端，后端仍需明确启用。 |
| `verify-no-bare-dispatcher` | 地区数据下载不覆盖 Host 的统一路由。 |
| `verify-no-unknown-casts` | 删除上一节点已移除断言的陈旧基线；剩 1,277 项，没有新增允许项。 |

## 领域依赖图与后续验收

- [x] **插槽框架与运行时目录（2026-11-10）**：Slots/Renderer 的 16 个测试文件、178 项通过，覆盖注册生命周期、重复输入、作用域与过期授权、崩溃隔离、Factory 组合和重连。额外 6 项模型目录查询测试通过。新鲜度检查发现配置文件操作提示遗漏了一条组件登记，重新生成后通过。
- [x] **Linux Bash 回放（2026-11-10）**：独立 Ubuntu x64 目录从 `84978f6775` 源码建立，包含本次目录修正，离线锁定依赖、8 项产物构建及随后 2 项 Host/Client 聚合检查通过。四项 Bash 录制回放全部通过。`bash-startup-timeout` 保留 v3/v4 输入，以独立 writer 预期核对当前后台提示和任务退出记录；旧输入摘要一致。日志前缀 `.dsh-build/linux-`，复现目录写在 `linux-replay-root-20261110.txt`。
- [x] **Linux 删除收尾（2026-11-10）**：会话 API 与 JSONL 持久化的 17 项删除测试通过，覆盖子会话、写锁、批量准入、重启后收尾和工作区文件保留。日志 `.dsh-build/linux-deletion-20261110.log`。
- [x] **Linux 历史模式与界面（2026-11-10）**：Minimal 的 13 项 Shell、图片、分页和压缩测试，加一项旧模式原生能力及两项旧 PTC 恢复，共 16 项通过。历史测试页显式关闭其录制中没有覆盖的输入预测，展开场景明确使用紧凑视图和完成时收起。三份 UI 预期纳入当前模式指示、旁问和费用入口，三份原始 Session 的哈希均一致。最终 replay 日志 `.dsh-build/linux-history-web-accepted-20261110.log`。

- [x] **客户端领域依赖图**：初查报告 85 处，已在[客户端层验收](2026-11-06-client-layers.md)分类修正并通过。原始输出 `.dsh-build/hygiene-client-domain-20261106.log`，按包统计 `.dsh-build/hygiene-client-domain-20261106-summary.json`。本轮已区分共享 API、实际实现依赖、图片误分类和重复计数；原报告不是 85 个运行故障。

| 界面包 | 初查数量 |
| --- | ---: |
| `ui-chat` | 1 |
| `ui-conversation` | 3 |
| `ui-settings-account` | 15 |
| `ui-sidebar-browser` | 19 |
| `ui-sidebar-documentpreview` | 41 |
| `ui-tool` | 1 |
| `ui-workspace` | 5 |

- [x] **桌面退出竞态（2026-11-11）**。主进程回归用例复现了重复退出提前关闭窗口，以及普通退出开始后仍交接安装器。修复后重复请求等待同一次清理，普通退出会取消竞争中的安装交接。Host 退出后仍会等待内嵌页面清理完成。
- [x] **Keyed Slot 分派键（2026-11-11）**。`renderSlot` 要求 keyed 子 Slot 显式传入 `entryKey`，包括使用 `hookContext` 的子 Slot。三个缺键负例由编译检查覆盖。合法键未注册时仍使用 fallback，相关渲染器测试通过。[迁移指南](../../docs/upgrade-guide/v0.2.2-rc.1/keyed-slot-entry-key/guide.zh.md)
- [x] **动态 Slot 参数（2026-11-11）**。独立变化的 Slot 名称和分派键需满足所有可能目标的参数约束。编译负例覆盖普通 owner props、按键的 owner props、不适用的分派键、不匹配的 `hookContext` 以及 chain selector 的输入。单个目标允许其自身声明的联合参数类型，同一对象决定的键与参数可作为元组传入。
- [ ] **其他验收**。原生系统关机、历史回放、跨平台、原始截图和完整编号终验待验收。
