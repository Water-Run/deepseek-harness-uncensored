# 17.06 稳定性检查

状态：进行中。当前安装版、构建源码及恢复入口见 [HANDOFF](../HANDOFF.md)。下列日期化记录保留各自验证范围；全部原始需求保留。

## 已完成

- [x] **文件预览通知合并（2026-11-18）**。客户端按已绑定路径和候选路径保留最新通知，重连刷新覆盖旧通知。等待 `stat` 时若新路径的通知曾被淘汰，重新读取该路径以避免漏掉变更。旧实现复现 128 次密集通知的积压和重连后的过期通知。修复后工作区文件包 254 项通过、3 项跳过，含路径重绑定及淘汰回退场景。源码待下次打包。日志位于 `%USERPROFILE%/DSHU-Deliveries/20261118/workspace-change-client-*.log`。

- [x] **工作区文件变更合并（2026-11-18）**。Host 在事件入口按解析后的目标键过滤，每条订阅只保留一个待刷新标记。`ready` 后的首读覆盖解析前的变化，读取途中到达的新变化仍触发下一次刷新。256 次密集通知只发出一帧当前元数据，后续订阅与取消继续通过。两个回归用例在原实现上复现失败。工作区文件包 253 项通过、3 项跳过，锁文件供应链检查、迁移指南与文档链接通过。日志位于 `%USERPROFILE%/DSHU-Deliveries/20261118/workspace-change-burst-*.log`。待下次打包。[迁移指南](../../docs/upgrade-guide/v0.2.2-rc.4/workspace-file-change-coalescing/guide.zh.md)

- [x] **Windows 双语记录与生成区块（2026-11-14）**。记录读取、正文分节哈希、生成区块标记与规范格式比较支持 CRLF；计算及生成结果仍使用 LF。有效正文改动、坏哈希、重复章节和损坏标记仍被拒绝。新增回归先复现失败，相关三文件共 97 项通过；Windows 实际检出的全库 1,164 组双语配对通过，未批量重写已有记录。证据为 `%USERPROFILE%/DSHU-Deliveries/20261114/pairing-*-before.log`、`isolation-pairing-tests.log` 和 `pairing-crlf-corpus-complete.log`。

- [x] **pnpm 11 验证配置隔离（2026-11-14）**。修正独立 pnpm 与完整 Host 冒烟检查中不再生效的存储配置变量，保留认证专用的 `npm_config_userconfig`。新增真实配置读回及私有存储断言；修复前 `store-dir` 返回 `undefined`，修复后两个独立 Electron Node 进程并行通过离线安装与脚本执行，保留原 45 秒上限。证据为 `%USERPROFILE%/DSHU-Deliveries/20261114/pnpm-before-fix.json` 和 `pnpm-after-fix.json`。首次打包退出等待超时的完整根因仍未确认，不因配置修正而删除失败记录。

- [x] **SDK 回放路径别名（2026-11-11）**。与 headless 夹具一致登记临时目录的 JSON 转义及斜杠拼写。Windows 审批与最小图片压缩的持久日志比较已通过，完整场景后续仍受 Bash/PowerShell 工具预期差异阻塞，不计为通过。归一化与回放支撑测试 241 项通过、1 项跳过；Linux 当前源码构建与聚合检查通过，SDK/ACP 回放 53 项通过、2 项桌面场景未执行。714 份已提交 JSONL 与 Git 对象字节一致，包含 Session 及协议预期。证据见 [HANDOFF](../HANDOFF.md#sdk-回放的-windows-路径别名2026-11-11)。

- [x] **余额提示框与字体响应式（2026-11-11）**。余额提示框在窗口、容器、文字尺寸与滚动变化后保持图内定位，采样不跳变，退出清理资源。改前单元用例及两种浏览器均复现越界，修复后通过。字体输入框复用共享设置行，窄窗下移、字号控件留在右侧，并保留焦点与草稿。三套单元共 2,579 项通过，独立复验无测试池退出告警；六项浏览器用例、八项产物构建、两项聚合检查通过。日志与截图见 [HANDOFF](../HANDOFF.md#余额提示框与字体响应式布局2026-11-11)。

- [x] **协议历史回放与 Python 原生夹具（2026-11-11）**。当前源码在 Linux 干净检出中通过八项产物构建、两项聚合检查及 53 项 SDK/ACP 回放，2 项桌面相关场景未执行。181 份录制 JSONL 摘要一致，临时检出已清理。Windows 修复了 7 个夹具链接的检出，并通过 ACP 握手。Python 测试载体显式通过 Node 启动 SDK profile，共用历史读取支持 Windows 扩展长度路径；命令、图片、计划、审批和示例 38 项通过。Windows 原生全套历史语料的路径、技能及工具集差异继续待验收，公共 SDK 接口不变。证据见 [HANDOFF](../HANDOFF.md#协议历史回放与-windows-python-夹具2026-11-11)。

- [x] **已撤销暂停的恢复竞态（2026-11-11）**。暂停撤销或被替换后，异步恢复曾继续向实际 AgentLoop 投递通知并发出模型请求。恢复前后现核对暂停标识及领取归属，跳过失效项并保留后继暂停。三个改前失败用例修复后通过，模型请求与继续通知均为零。跨句柄领取、释放及转交断言通过。会话 API 与额度模块 1,199 项测试通过、1 项跳过，八项产物构建通过，修复已随 `.7` 安装。日志前缀为 `.dsh-build/spending-withdrawn-`。

- [x] **旁问清理与额度暂停（2026-11-11）**。重启后清理旁问会移除旧代次暂停，重复请求保留新代次暂停。额度提供方重新加载时继续核对，不支持删除的存储也覆盖此路径。空白主对话在发布子对话前落盘，失败时不发布子对话，不追加主线事件。会话 API 与额度模块 1,196 项测试通过、1 项跳过，无投影缓存场景另有 14 项复验通过。父会话检查点与卸载排空的负向控制均检出故障。八项产物构建和 Host/Client 聚合检查通过，修复已随 `.7` 安装。证据见 [HANDOFF](../HANDOFF.md#旁问清理与额度暂停2026-11-11)。

- [x] **删除后的额度暂停恢复（2026-11-11）**。删除清理中断后，挂载额度接入会按持久删除标识清理暂停记录。真实 AgentLoop、JSONL 和 SQLite 用例覆盖重启、额度提供方重新加载、其他暂停会话保留、不支持删除的存储及读取失败。卸载排空用例和负向控制通过。会话 API 包 1,139 项测试通过、1 项跳过，相关定向复验 81 项通过。八项产物构建、Host/Client 聚合检查及定向 lint 通过。日志前缀为 `.dsh-build/deletion-spending-`。

- [x] **会话底栏浏览器回归（2026-11-11）**。费用与限额加入详情面板缩放测试。Chromium 和 WebKit 的四项场景覆盖有、无 Chat 统计贡献，390px 浅深主题和 14px、22px 字号下的同排、横向溢出及字体颜色。两面板还覆盖三个窗口宽度、限额进度条、模态焦点与 Escape 后返回。WebKit 复现的焦点返回错误已修复，组件覆盖率为 100%。日志为 `.dsh-build/footer-two-browsers-20261111.log`。

- [x] **GUI 全量复验（2026-11-11）**。初查三项失败已修正。关于页与 REA 配置区采用中性细边框，圆形装饰显式使用圆角。定时任务测试先注册扩展语言定义，再验证八种字典。769 个文件通过，12,884 项测试通过、2 项跳过。八项产物构建、Host/Client 聚合检查和定向 lint 通过。日志为 `.dsh-build/footer-focus-gui-verified-20261111.log`。

- [x] **推送检查触发（2026-11-11）**。当前主分支缺少上游跟踪，Lefthook 回退为比较 `HEAD` 与本地 `main`，跳过了推送类型检查。已配置 `main` 跟踪 `origin/main`，独立仓库用真实推送复现漏检并验证修复。报告为 `.dsh-build/lefthook-native-probe-20261111.json`，临时仓库已清理。

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
- [x] **Windows 会话结束清理（2026-11-11）**。工作区和欢迎窗口在收到 `session-end` 时直接启动清理。查询或取消通知继续保留运行状态，多窗口通知共用同一次清理。两个新增回归在修复前均未调用 Host 停止，修复后主进程的 156 项测试通过。隐藏 Electron 44.7.0 窗口接收实际 `WM_QUERYENDSESSION`、取消与确认的 `WM_ENDSESSION`，确认通知触发从当前源码编译的回调，清理开始时 `before-quit` 次数为零。报告为 `.dsh-build/windows-session-end-20261111/result.json`，整机重启仍待验收。[Electron 退出事件](https://www.electronjs.org/docs/latest/api/app#event-before-quit)
- [x] **Keyed Slot 分派键（2026-11-11）**。`renderSlot` 要求 keyed 子 Slot 显式传入 `entryKey`，包括使用 `hookContext` 的子 Slot。三个缺键负例由编译检查覆盖。合法键未注册时仍使用 fallback，相关渲染器测试通过。[迁移指南](../../docs/upgrade-guide/v0.2.2-rc.1/keyed-slot-entry-key/guide.zh.md)
- [x] **动态 Slot 参数（2026-11-11）**。独立变化的 Slot 名称和分派键需满足所有可能目标的参数约束。编译负例覆盖普通 owner props、按键的 owner props、不适用的分派键、不匹配的 `hookContext` 以及 chain selector 的输入。单个目标允许其自身声明的联合参数类型，同一对象决定的键与参数可作为元组传入。
- [ ] **其他验收**。原生系统关机、历史回放、跨平台、原始截图和完整编号终验待验收。

## Windows 更新交接与目录回退（2026-11-18）

应用等待退出期间，再次请求安装同一版本会复用当前的安装状态。重复请求只执行一次 Host 停止准备和一次安装器交接。旧实现的回归用例失败，修复后更新协调器和目录安装模板共 50 项通过，Electron 44.7.0 回环共 15 场景通过。回环用例替换平台安装调用，不执行安装器。源码构建的 10 项检查通过，修复将进入下一检查包。

Windows 原生 NSIS 隔离夹具通过 9 个目录替换场景。待安装目录缺失或被锁定时恢复旧目录。回退目标被占用时保留旧目录备份及占用方文件。坏包和取消用例保持旧版本，短暂锁定释放后可完成替换。该夹具只操作临时目录，实际签名升级和安装后启动失败的恢复仍待验收。

回执位于 `%USERPROFILE%/DSHU-Deliveries/20261118/` 的 `updater-handoff-loopback-final.log` 与 `windows-directory-rollback-18-4.log`。

## 更新工作区运行器（2026-11-16）

私有 Electron 测试应用使用开发项目依赖投影、当前客户端版本和完整欢迎页资源，通过原生跳过操作进入工作区，不提供模型密钥。截图中的 `desktop account: this application build carries no DSH_CLIENT_VERSION` 来自此前遗漏版本的测试配置；已安装 `.16.3` 不使用这个配置。意外致命错误转为测试失败，不打开人工恢复弹窗。

运行器同时要求进程正常以 0 退出，以及结果报告包含十个不同且完整的场景。缺少报告、部分报告、重复场景、范围不符和手动报告冒充自动验收均被拒绝，九项所属回归通过。更新失败后，测试分别等待替代 Host 就绪和页面完成重载，避免把导航中被销毁页面的 Promise 当作当前页面的交互。自建任务在退出前清理，避免停在退出确认。

本节点真实 Electron 单组十项更新场景和正常退出通过，目录为 `.desktop-build/qualification/electron-workspace-updates-M8ieDF`。随后两个独立进程并发，各十项通过，目录分别为 `electron-workspace-updates-hn0lfQ`、`electron-workspace-updates-O7kl16`。覆盖普通和强更的下载失败、任务确认、停止拒绝、替代 Host 恢复和再次确认安装；所有安装调用均被拦截，没有执行安装器。并发两组的首次 Host 启动约 13.6–13.7 秒，恢复启动约 9.0–9.8 秒，结束后未发现对应测试进程。一份更早报告虽有十项断言，但进程因退出确认超时而被终止，保留为失败，不算通过。另一次替代 Host 等待超过 20 秒的失败也保留，不能据后续通过认定其原因已查清。成功报告附带 Host 启动时间和后端状态；失败材料记录相同事实，不推断程序崩溃原因。

日志位于 `%USERPROFILE%/DSHU-Deliveries/20261116/`，前缀 `workspace-update-recovery-`，其中 `observed-hosts.log` 为首次完整通过，`concurrent-{1,2}.log` 为并发通过。`workspace-update-result-unit-final.log` 九项通过，`workspace-update-recovery-build-check-final.log` 两项聚合编译通过，改动文件 lint、翻译配对和本仓 `doc-sync` 通过；本仓 `doc-sync` 只检查 README 链接和长度，不据此声称所有上游文档门禁通过。此节点未修改产品源码、重新构建安装器或完成签名安装升级验收。

## Host 原生退出事实（2026-11-16）

Host 意外退出首次触发故障时，报告附带 `hostExit`：实际 PID、原始退出码、无符号 32 位十六进制、信号和关闭请求/确认状态。原有错误文本、stderr 上限、首个故障及恢复行为保持原契约，不推断终止方或原因，也不改写此前的崩溃记录。

修复前，Windows 的十六进制状态和 Linux 的真实信号两类回归各检出失败。修复后 Windows/Linux 三文件各 70 项通过、1 项平台专属跳过；Windows 子进程实际以 `0x40010004` 退出，Linux 子进程由 SIGTERM 终止。诊断说明已同步中英文。日志前缀为 `20261116/host-exit-facts-`；此前用户配置的 7:40 退出仍未定位，不能把新增取证或受控复现写成根因修复。

## Frida 本地目标验收（2026-11-15）

DSHU 的实际 REA 工具消费端调用 Windows 已安装版及 Linux tar.gz 内的 Node 24.22.1、REA 6.9.0、Frida 17.23.2。目标为仓库内 C 夹具的私有编译副本，没有附加用户进程、修改 ptrace 策略或调用付费模型。

- Windows 两项通过：附加自建进程，将函数返回值从 42 改为 99；卸载脚本、关闭会话、重置 REA 和释放 Agent 后均恢复为 42，并验证工具移除与目标退出。暂停启动路径先注入再恢复；关闭尚未恢复的目标后，目标正常执行原函数并退出。
- Windows 两个独立测试进程同时执行，两组各两项通过；临时目录和目标进程各自持有，重试禁用。
- Linux 一项通过、一项明确跳过：暂停启动、注入、恢复、关闭与退出通过；同级进程附加不在本次 Linux 范围。初次使用导出查询时找不到已由 `nm -D` 确认的 ELF 函数；夹具改用暂停进程的符号表解析后通过，保留原失败记录。

证据位于 `%USERPROFILE%/DSHU-Deliveries/20261115`：`frida-windows-e2e.log`、`frida-windows-concurrent-{1,2}.log`、`frida-linux-final.log`、`frida-linux-export-before.log` 和 `frida-owned-probe.json`。维护入口为 `packages/mcp/rea/tests/frida.e2e.ts`，配置与编译条件见[包说明](../../packages/mcp/rea/README.zh.md#验证)。本次验证不代表远程设备、Linux 附加已有进程、商业引擎或许可证审计完成。

## Linux Frida 附加与回收（2026-11-16）

Windows 已安装版和 Linux `.16.2` 实际归档内的 Node、REA 及 Frida 运行时通过同一工具消费端。两平台各两项完整流程通过：附加本轮编译的目标、注入返回值 99、卸载/关闭/重置/释放后恢复 42，以及暂停启动和目标退出。REA 源码目录与交付基线 `668ec5146d` 的 Git 树摘要相同，不将测试变更描述为引擎代码修复。

Linux 夹具只在显式传入 `--allow-parent-debugger` 时调用 `PR_SET_PTRACER`，允许测试父进程及其后代（含 REA）调试，并回报实际父 PID。运行前后系统 `ptrace_scope` 均为 1。去掉此调用的独立负对照保留同一就绪消息，实际 `start_frida_session` 因 `/proc/<pid>/mem: Permission denied` 失败；未修改系统策略、提权或附加用户进程。[内核语义](https://docs.kernel.org/admin-guide/LSM/Yama.html)

Linux 两个独立测试进程同时运行，每组两项通过，重试为零；各自使用私有目标和目录。启动错误与进程真正关闭分别观察，清理在关闭后释放目录。Windows 无效可执行文件进一步复现了同步启动失败时的夹具收尾缺口：修复前遗留 1 个测试目录，修复后为 0，原始启动错误仍保留；这不是产品引擎代码修复。验证时备份并临时覆盖私有 Linux 检出的两个测试文件，结束后恢复，工作树干净。任意已有进程、远程设备、商业引擎及整体许可审查仍未验收。

最新证据位于 `%USERPROFILE%/DSHU-Deliveries/20261116/`：`frida-windows-attach-complete.log`、`frida-windows-attach-inputs.json`、`frida-owned-spawn-failure-result.json`，以及 `frida-attach-complete/` 下的两份并发日志、负对照、源码/二进制摘要和 ptrace 前后读数。聚合编译两项与改动文件 lint 通过，日志为 `frida-attach-build-check-complete.log` 和 `frida-attach-lint-complete.log`。早期独立通过及负对照保留在 `frida-linux-attach-*` 与 `frida-attach-final/`。这是现有 `.16.2` 引擎的新增验收，未重新打包安装器。
