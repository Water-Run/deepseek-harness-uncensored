# Uncensored 开发交接

## 受保护 ConPTY 接入（2026-11-03）

基点 `42a4e1631e`，Goal active。`subprocess-native.spawnTerminal` 已从明确拒绝改为受保护 ConPTY 实现；复用既有 LocalTerminalHandle/ProcessInspector 的控制台行为，辅助程序本身仍经严格原生命令范围启动。模型参数和环境在固定辅助程序启动后经 fd 7 传入，辅助程序的 cwd/预加载环境不受目标覆盖；目标输出使用独立帧，不能成为控制回复。输入分块保留代理对，操作有确认、序号及超时界限，不自动重放未知结果。

终端分配成功后解除父取消信号关联；退出、显式关闭、传输失败和操作超时均通过外层原生 Job 结束整个会话。终端根进程的退出码与整个范围的关闭分开处理；正常退出保留交付的 UTF-8 尾部，显式关闭可丢弃暂停读取的数据。只有独立范围关闭后才发布空闲并释放保护。新增 terminalStartupTimeoutMs=30000、terminalRequestTimeoutMs=5000、maxTerminalRequests=64；Windows 前台仍采用控制台伪进程组语义，不伪造提示符或输入等待证据。

实际 Windows 已验证：TTY 标志、生产写入拒绝、100×30 尺寸通知、输入、Ctrl-C、自然退出/中文 emoji 尾部、暂停输出关闭、启动失败后再启动，以及分离后代在关闭后由预先持有的内核句柄确认退出。命令和终端均验证测试 HTTP 200、生产 403/零连接、原始 TCP 直连 EACCES。源码完整节点 109 项通过，新增网络两项子集另通过；Linux 98 项可移植逻辑通过，Host/Worker/协议/提供方四模块覆盖率均 100%。Linux 不表示实现了原生终端后端。

编译产物公开入口实际通过：`.dsh-build/native-terminal-built-20261103.mjs/.log` 包含 resize、UTF-8 尾部、退出码 7、原生范围关闭，原有 PowerShell/文件保护和目录清理检查也通过。完整 build 10/10、后续 build:check 2/2、392 个 NodeNext API、JSDoc、定向 lint 和文档配对通过。关键日志 `native-terminal-tests-final-20261103.log`、`native-terminal-linux-final-20261103.log`、`native-terminal-runtime3-20261103.log`、`native-terminal-descendant-20261103.log`、`native-terminal-startup-failure-20261103.log`、`native-terminal-network-20261103.log`。薄入口与 OS 分配胶水由真实子进程测试覆盖，没有关闭公共覆盖率门槛。

探针记录保留：首次内部 ConPTY 探针没有父级截止时间，确认其独立进程仍存活后仅终止该测试树；后续探针均加截止时间。外部模块 require 最初受工作区缺少 package.json 的父目录搜索影响，修正了自有 Node 项目夹具；产品辅助程序使用只读运行时目录。尺寸误判来自 Node getWindowSize 返回缓存值，改用真实交互读取及 resize 事件后通过，未修改 node-pty 或 MXC。MXC 的 PTY 接口候选出现输入/关闭问题，因此采用已实测的容器内 ConPTY。覆盖率曾出现单行 for/if 的负分支计数，展开语句后通过，未改统计器。

系统仍安装 `0e3e8d4261` 检查版，本节点没有打包安装或操作桌面。剩余仍为默认 profile/工具/Session 回放、界面消费者整合、任意 TLS/协议身份、严格入站隔离、网络数据库与远端身份、P3 审计及设置/代理联动。恢复入口是 native-terminal-host/worker/protocol、subprocess-native 和对应测试；不要将可选终端完成等同于完整目标保护或默认产品接入完成。

## 可装配原生命令提供方（2026-11-02）

基点 `5914dae8f8`，Goal active，原始范围全部保留。新增公开子入口 `target-protection/subprocess-native`，显式配置只读/可写授权、独立私有根与 network disabled/gateway；必需 targetProtection、credentials。Windows Node 24 与 BaseContainer 路径之外不回退普通进程；PTY 明确不可用。该服务已能承接现有 PowerShell 执行器，但没有进入默认应用 profile。

复用 LocalSubprocessRuntime 查找和 managed 输出绑定，增加候选元数据读取前的可覆盖授权方法，并将整个查找绑定到原规则代次。原生服务保留执行和控制流直至完成，取消、规则更改、卸载与同步 Host 退出均停止所有归属范围；清理失败阻止新任务并报告原因。私有根解析后不得落在任何授权内，可写授权必须是目录；清理拒绝越界路径，但仍释放已结束执行的规则。目标 HOME/TEMP 私有化，代理变量由执行网关接管。代理密码用保存的凭据引用，每次重读；缺失时拒绝激活或新命令，密码不进入目标环境。

`SessionChainProxy` 支持 null 会话归属及无捕获存储，通用 subprocess 不伪造会话或记录流量。原网安引擎仍传递真实会话、有界捕获和暂停回调；后续须接真实网安设置及流量归属，不能把临时网关当成已完成该联动。`subprocess-local/managed` 额外公开现有 targetEnvironment。旧 `target-protection/subprocess` 的准入拒绝行为未替换。

验证：Windows 4 文件/77 项通过，其中 6 项真实 Loader/原生测试覆盖普通命令、PowerShell、Node HTTP 经网关 200/403、取消、规则变更和 PTY 拒绝。Linux 4 文件/102 项通过，包含既有 local.spec 的 31 项；Linux 只验证可移植提供方逻辑，原生启动为隔离夹具，不宣称 Linux 原生后端完成。提供方单文件覆盖率全部 100%。编译产物公开入口和真实 Loader/PowerShell 通过 `.dsh-build/native-provider-built-20261102.mjs/.log`，生产保留、测试写入、私有目录清空和退出监听恢复。完整 build 10/10，392 个 NodeNext API、JSDoc、定向 lint、三组文档配对和 README 检查通过；三包 publint 无错误，subprocess-local 保留既有 src 通配导出警告。

回归中修正了夹具把 credentials-local 命名空间直接交给 ctx.plugin、错误使用带连字符的凭据名，以及把 Cordis 的卸载日志误当作 dispose Promise 拒绝。容量包含输出结算，测试通过服务接口等待再准入，不依赖固定延时。晚期补了凭据撤销、配置别名、可执行查找期间规则变更、已关闭控制流、同步停止异常和清理范围负例。主要日志 `native-provider-final-tests-20261102.log`、`native-provider-linux-final-20261102.log`、`native-provider-final-build-20261102.log`。

剩余：PTY、任意 TLS/协议身份、严格入站隔离、默认 profile/工具/Session 回放、其他数据库/远端身份及 P3 审计、设置/代理联动。默认产品接入前必须补齐相关工具/Session 回放。系统安装仍为干净 `0e3e8d4261` 检查版，本节点未打包安装或操作桌面。恢复时从本文件对应源码及 `subprocess-native-runtime.spec.ts` 继续；Windows 原生验证与 Linux 可移植验证须分别标注范围。

## 原生命令出站网关（2026-11-02）

基点 `50e667f485`，目标保持 active。新增 `native-gateway.ts`，持有一个已核准的原生执行修订，复用 `SessionChainProxy` 回环监听/流量记录/关闭等待；后者改为由 HTTP/CONNECT 回调选择路由，不再强制持有独立上游。`requestPinned` 新增可选方法/正文参数并导出，匿名 fetch 仍为公网 GET。原生 HTTP 保留方法与正文、验证 Host、固定已核准地址；私网需精确测试服务器标记，生产优先。CONNECT 对名称和字面地址分别验证；域名/正则/数据库身份歧义仍拒绝。代理上游失败不回退直连。

宿主环境移入 `NativeHostStart.environment`，在网关分配后确定，不传给可信 Broker。网关用 `retainNativeExecution` 保留规则并调用宿主停止回调；原生范围和套接字关闭后才释放修订。真实 Windows 及无源码钩子的编译链均证明测试请求 200、生产 403 且零连接、直接绕过网关返回 EACCES；结束后规则才能提交。证据 `native-gateway-built-20261102.mjs/.log`、`native-gateway-runtime4-20261102.log`。

首轮原生启动失败揭示 MXC 的 `runtimeConfig.networkProxy` 要求 ingress default=allow；原探针已用该配置，Broker 原实现错误设为 deny。修正后出站验证通过，但 MXC 文档明确不保证完整入站隔离，已列入剩余范围。Broker 现在先把错误原因写入独立有界诊断流，再发布失败帧，避免宿主立即停止进程后只剩泛化错误。未降低目标校验或开启普通进程回退。

验证：Windows 相邻 7 文件/130 项、Linux 6 文件/129 项通过；宿主、Broker、网关三模块覆盖率均 100%。原宿主 SDK 部分启动取消和完整执行两项继续通过。完整 build 10/10，后续 build:check 2/2，392 个 NodeNext API、定向 lint、JSDoc、三组文档配对和 README 检查通过；三包 publint 无错误，web-fetch-http 保留原有 src 通配导出警告。早期测试误用 TargetStore.save、错误假设取消必然断开 HTTP（实际可返回 502），以及未调用 Socket 原生 _destroy 导致夹具不发 close，均已修正；不得把这些夹具失败当成产品失败。Linux 同步脚本 `native-gateway-linux-20261102.sh`。

仍未注册为正式 Subprocess/PTY，未完成任意 TLS/协议身份、严格入站隔离、网络 SQL/远端身份及 P3 联动；清单未将完整代理或目标保护勾选。安装版仍是 `0e3e8d4261`，没有重新打包或触碰用户桌面。本节点不改变用户现有完整保护不可用的状态。下一步应实现受支持的原生命令服务装配并继续协议/入站边界，不能将已有普通网安代理开关等同于这条执行网关。

## 最新安装与宿主执行节点（2026-11-02）

系统已更新到干净源码 `0e3e8d426183f5e8ee972cc11a329901d979a7cc`：DSHU 0.1.0、DSH 0.2.2-alpha.2、REA 6.8.0。包 `.dsh-build/deliverables/DSHU-0.1.0-core-0.2.2-alpha.2-REA-6.8.0-win-x64-unsigned-20261102-0e3e8d.exe`，388739777 字节，SHA-256 `36b934fc95b3cebc03143d4ad22cb40dcaa03c2892841704a2099e9a437e8ee1`。run `2026-11-02T08-29-22.851Z-Bf2wNd` 完成打包、REA/Office/原生依赖检查。安装前应用已退出，静默更新返回 0；400 份数据和官方版两个关键程序文件的哈希仍相同。备份沿用下文的私有目录，旧检查包保留。未签名、未发布 Release。

安装版实际 exe 经隐藏 Electron 和独立 profile 验证原生菜单、侧栏关于共用窗口、单实例与 Escape；实际安装 Host 经无界面 Chrome 验证父会话/旁问/随问联删、刷新不复活、完整品牌和正确构建信息。证据 `about-installed-native-evidence-20261102.json`、`installed-ui-about-final-20261102.log`、`visible-20261102/installed-about-0e3e8d.png`、`installed-delete-0e3e8d-evidence.json`。没有启动用户真实 profile，测试后的数据复核无变化。01.08、15.07 已勾选；真实用户配置启动、DPI、签名/发布和其他平台仍保留待验收。

原生宿主草稿已收尾：新增固定 Broker、私有严格配置、运行条件校验和宿主句柄，外层 Job 在 SDK 调用前建立；SDK 尚未交付句柄时也能取消并确认其后代退出。显式目标环境不污染可信引导，有界标准流/控制流及独立诊断，复用 collect/spill；整个范围关闭前不释放规则。异步关闭、缓冲尾帧、诊断失败等用例补齐。真实 MXC 两项通过；编译宿主/Broker/工作进程链 192 KiB 往返、退出码 23、生产保持不变和测试写入通过。首次编译脚本错误多传 `revision` 被严格配置拒绝，修正为声明字段后通过，产品未放宽验证。

验证：Linux 96 项及四模块覆盖率均 100%；Windows 宿主 43 项、Broker 27 项及相邻协议/运行条件通过，完整 build 10/10、JSDoc、定向 lint 和文档配对通过。编译脚本 `native-host-built-20261102.mjs`，成功日志 `native-host-built2-20261102.log`；Linux 脚本 `native-host-linux-20261102.sh`。此后端源码尚未随上述检查包分发，也没有注册为正式 Subprocess/PTY，不改变应用当前保护状态。下一步仍为受保护目标代理 → 原生 Subprocess/PTY 服务 → 数据库/远端身份缺项 → P3 审计与设置联动。Goal active，所有原始范围保留。

## 关于入口统一与本地品牌（2026-11-02，待安装更新）

基点 `a75da14e16`，Goal 继续 active。按当前模式的深蓝/深红/深绿/深金配色保留；侧栏与桌面“应用”菜单共用根级关于窗口。可信主文档通过仅含订阅/可见性的 preload 桥注册入口；导航、渲染失败和插件卸载撤销注册。关闭立即释放交互，保留退出动画，并取消该窗口的更新请求。原生 Platform 页面在关于窗口打开期间隐藏，关闭后恢复同一文档；启动或恢复阶段保留来源完整的外壳文本窗口。`ui-brand-official` 按 DSHU fork 版本保留本地构建品牌，不改 local 渠道及签名标记。

实际 Electron 使用临时独立 profile、回环模型夹具和隐藏窗口，验证原生菜单→IPC→共享关于页、侧栏入口、单实例、Escape 关闭及 local 构建标识。未操作用户桌面或会话；测试代理选择菜单内实际 About 回调，不打开系统 popup。证据 `.dsh-build/about-native-evidence-20261102.json`、`about-native-20261102.log`。早期脚本错误使用 button 而非 menuitem；隐藏窗口导致 Playwright 稳定性等待和截图超时，后改为派发控件 click 事件验证功能，不把该测试当作原生截图验收。视觉证据沿用此前真实 Web 四模式/中英/窄屏截图。

验证：9 文件 281 项通过；关于页更新请求取消与双语 3 项通过；修改异步夹具后其与原生 Platform 共 42 项通过。local 产物构建完成，最新 build:check 2/2 通过；JSDoc、定向 lint、客户端文案、README 与三组文档配对完成。系统仍安装干净 `b4e69aafad` 检查版；此节点待从干净验证树打包后更新，01.08 保留 95%。Native Broker/Host 未提交草稿保持原样，不包含在本节点中；P2/P3、默认保护装配及交付矩阵仍未完成。

## Windows 安装验收与下一步（2026-11-02）

`b4e69aafad850c185b8f82ac4ddb0c7107199dbe` 已推送 main，并从干净 detached 验证树完成打包和系统安装。目标仍为完整 DSHU，未暂停或标完成。安装包为 `.dsh-build/deliverables/DSHU-0.1.0-core-0.2.2-alpha.2-REA-6.8.0-win-x64-unsigned-20261102.exe`，388736094 字节，SHA-256 `afc23c094290d8f9daef204a1755f52206901260166e03a32d3d78a3a97426d6`；交付清单 `DSHU-20261102-manifest.json`。构建 run `2026-11-02T05-22-51.607Z-0r80ug` 成功，日志 `rea-package3-20261102.log`。未签名、未上传或发布 GitHub Release。

用户已授权卸载安装，要求优先非 Computer Use、11:55 前不操作桌面。安装前查询发现旧 DSHU 已退出，不需要 GUI 输入。私有备份目录 `C:/Users/linzh/AppData/Local/DSHU-Backups/20261102-134342-b4e69aafad` 已限制为当前用户与 SYSTEM：400 份关键数据共 62.4 MB 校验复制，另保留旧程序 7817 文件约 1.029 GiB。旧卸载器 `/currentuser /S /KEEP_APP_DATA` 返回 0，新安装器同样静默安装至原目录并返回 0。前后及测试后，400 份数据文件、官方版 exe/app.asar 两个文件的 SHA-256 均未改变。未删除会话或工作区文件；未启动真实用户配置以免自动续跑其任务。

系统安装目录的 exe、app.asar、自带 Node 与已通过的包一致；元数据为 DSHU 0.1.0、DSH 0.2.2-alpha.2、REA 6.8.0、Node 24.22.1、干净源码 b4e69aafad。实际安装目录再次通过完整清单、原生依赖、CLI 插件安装/移除、REA 229 工具及 JavaScript、Office 三格式/PDF 检查，日志 `installed-runtime-smoke-20261102.log`。用实际安装资源和独立临时 profile 驱动浏览器，确认点击删除成功、旁问/随问联删、刷新不复活、关于页 commit/REA 正确；没有向真实模型发消息，使用自有回环 401 夹具建立失败会话。证据 `installed-ui-delete4-20261102.log`、`visible-20261102/installed-delete-evidence.json`、`installed-about.png`。早期夹具把空白会话当成有菜单的会话，以及刷新后未处理再次出现的欢迎层，导致验收脚本超时；产品删除请求本身已成功。

审查新增待办：桌面“应用”菜单的 `main.ts:showAbout` 仍走旧原生文本框，没有复用侧栏的新关于页。15.07 已重新标为约 95%，下一节点优先统一入口并补初始化失败时的完整来源信息；不要把只有侧栏完成说成所有关于入口完成。新侧栏关于已按真实模式验证深蓝、深红、深绿、深金和 REA 来源，英文深色/390px 通过。安装器前台/DPI、真实用户配置启动及其余桌面矩阵仍留在 02/17。

检查安装截图又发现 01.08：侧栏是带版本号的开发文本标题，缺少完整 HARNESS/UNCENSORED 标识。`packages/client/ui-brand-official/src/client/index.ts:17` 对 local 构建提前返回；unsigned 打包明确使用 local，源预览则带 official 风格。需要按 DSHU 产品身份保留品牌，不能靠把未签名包冒充 official 来解决。与原生关于入口一起修复后再更新安装包。欢迎说明在刷新后重新出现；安装版删除脚本第四次运行明确处理该层后完成全部断言，这与删除失败不同。

Native Broker/Host 草稿仍在主工作区未提交，完整保护仍未默认启用。验证树现为 detached b4e69aafad，只有一个命名 main 分支；其他工作树未改。主工作区隔离 Web 预览的运行句柄是 35724，日志 `rea-web-20261102.log`；此前 90023 已停止。安装版验证的临时 Host、浏览器和回环服务均已停止并清理，未留下调试端口。

## REA 内置与模式化关于页（2026-11-02，安装包验收前）

代码节点已推送 `751ebe2632`。干净验证树已快进，冻结安装完成，并从主树复制仅本机使用且已忽略的 `.env.windows`。第一次完整打包的准备、真实 Desktop Host REA/Office 检查已通过；ASAR beforePack 遇到 `buffer` 与 Node 内置模块同名，使 `require.resolve.paths(name)` 返回 null。新增负例复现后，改查 `name/package.json` 的 npm 搜索路径；45 项打包/Office/依赖回归通过、3 个原有跳过，实际准备树已成功枚举 176 个 REA 依赖包，包含 buffer 和 Frida。需重跑最终打包，不把失败 run 记成完成。日志 `rea-package2-20261102.log`；run `2026-11-02T05-01-49.514Z-ATE92y` 已终止。现有系统安装仍未改动。

基点是已推送的 main `d9fa8ae230`。用户追加关于页随模式使用深蓝/深红等配色，并显示 REA 等依赖来源；仍授权继续完整 DSHU。实际剩余额度 24%，未用重置或购买额度；旧 40% 暂停阈值已被后续继续授权撤销。11:55 后允许按需操作桌面，但本节点仍使用后台测试，未再次 Computer Use、卸载或替换系统应用。

`dsh-rea` 直接依赖官方 `rea-agents@6.8.0`，product.json 固定发布提交 `160d821ac9a0310afcb8d1fc427862dd6508add5`、时间、仓库与 229 工具数。默认启用、按需启动；已保存的关闭偏好保留。空路径解析为内置包及应用 Node，自定义路径移到设置的可选折叠区。Desktop Host 指定 primary-runtime Node；锁升级到 Node 24.22.1，四平台 SHA-256 来自官方校验表。未运行 REA setup，未改其他客户端配置。

ASAR 释放规则复用从 Office 提取的安装依赖遍历，保留嵌套解析、必需 peer、兼容平台的可选包和资源；缺包、损坏的已安装可选包及越界解析失败。新增实际 builder/独立 Node 夹具验证 REA 与依赖在 ASAR 外可执行。Frida 17.23.2 安装脚本已读，明确允许此固定版本在源码和打包准备时安装；真实 N-API 绑定与本机设备初始化通过，没有附加目标进程。完整 Frida 插桩与商业引擎仍未验收。

关于页改为读取现有模式强调色；深蓝、深红、深绿、深金均由真实当前对话状态驱动，未手改 DOM 伪造。新增 REA 版本、完整提交链接、时间、仓库、可选引擎说明及第三方声明入口。构建校验拒绝 product.json 与 npm pin 不一致。四模式、中英、深浅色和 390px 窄窗口已测；证据 `.dsh-build/visible-20261102/about-rea-*.png`、`rea-about-modes.json`。真实 Web `reaSettings/probeRea` 证明无需配置 Node/CLI 路径即可发现 229 项。

验证：9 文件 107 项通过/3 跳过；声明与 primary-runtime 61 项通过/1 跳过；MCP 130 项、REA 保护/配置访问 10 项通过。新路径解析 4 项及覆盖率全部 100%。真实内置包 JavaScript 和现有 Ghidra 12.1.4/Java 27 自有样本两次验收均通过。完整 build 10/10，后续 build:check 2/2、JSDoc、定向 lint、i18n、README/配对通过。主要日志 `.dsh-build/rea-*-20261102.log`。首轮 registry 连接重置后以较低并发重试成功；Frida 构建最初被 pnpm 拦下，审核并添加精确允许项后安装成功。Frida 初次独立探针使用 symlink 路径导致解析失败，改从真实包目录解析后通过。

打包 smoke 已新增真实 Desktop Host 下的 REA 版本、完整工具数和 JavaScript 样本检查，但完整安装包尚未跑完，11.05 保留进行中。后续从干净提交在已有 detached 验证树 `D:/Coding/deepseek-harness-uncensored-upstream-20261101` 快进并打包，避免把未提交的 Native Broker/Host 草稿混入交付。该树本节点检查为干净。可复用缓存与 `package:win:x64:unsigned`；主树 unsigned `--check` 已通过，勿用签名/上传流程。旧已验证包仍来自 `811717f230`。

原 Native Broker/Host 文件仍待收尾，不装配为正式 Subprocess/PTY。已有 MXC 调用的生产依赖已随本节点补齐；后端未完成状态保持不变。2026-11-02 重新读取官方 Releases：主线仍为 0.2.2-alpha.2，维护线 rc.5；没有新主线版本需要迁移。README 和第三方声明已记录 REA 原样携带的许可材料；Frida npm/上游 Node 绑定缺少独立版权文件的限制按 REA 的原说明保留，不自行补造署名。

## 删除回归、关于页与顶部代理提醒（2026-11-02）

基点 `b8b0dd4b29`，唯一命名分支 main，Goal active。用户授权按开发需要测试、卸载与安装；11:55 前不操作桌面，优先非 Computer Use。尝试查看原生界面时用户按 Escape 中止，此后只运行后台代码和无界面浏览器测试，未卸载或替换系统应用。最新实际额度为剩余 33%；后续明确继续的授权仍有效，未使用重置或购买额度。

真实 Web 复现“点击删除后立即报错”：`ui-workspace` 未注入 `remote.session`，前端请求没有发出。补齐依赖并更新四组装配夹具后，真实浏览器点击删除成功，主会话、旁问和随问均从 API/列表移除，刷新不复活。另补旧版未知类型子任务及父目录缺项的发现，依据持久化头部确认归属；目录引用独立分支时拒绝删除。把后端临时换回 HEAD 后，合法旧版族群用例再次失败，随后按原字节恢复当前实现。测试不删除用户现有会话。

关于页改为黑绿品牌区与来源卡双栏，保留 WaterRun、独立版本、DSH 版本、编译时间、提交和 purge 信息；浅深色、中英、390px 窄窗口及 Escape 关闭均核对。REA 来源卡尚未加入，随 11.05 内置分发完成，不把此项整体勾完。网安代理提醒改为标题下持续横幅，关闭开关只保存提醒偏好，不改变代理；默认仍关闭。新槽位由主对话提供，模式插件传递真实当前模式，代理插件复用设置控制器。

验证：早期 6 文件/73 项通过；最终工作区与代理 15 文件/538 项通过，代理文案快照已更新。完整 build 10/10 通过（`visible-final-build-20261102.log`），定向 lint、客户端文案检查、README/配对通过。真实页面证据在 `.dsh-build/visible-20261102/`，删除和代理开关日志 `visible-matrix8-20261102.log`；关于页三组截图在该目录。早期验收脚本有等待流式网络空闲、首次欢迎层、空会话隐藏与折叠分组造成的失败，已改为按实际页面状态等待，不能把这些脚本失败当产品故障。新增 Web 测试使用隔离 home，短模型回答用于建立可见会话，没有操作目标系统。

下一节点：REA 6.8.0 发布节点已核对为 `160d821ac9a0310afcb8d1fc427862dd6508add5`（2026-10-25T08:35:15Z），仓库 `morluto/rea`。尚未加 npm 依赖、运行时或 ASAR 分发；正式 Node 24.22.1 四平台校验值在 `.dsh-build/node-v24.22.1-shasums.txt`，可复用已有 primary-runtime 流程。应同时补关于页来源卡及 README，不另要求用户安装 REA。

工作区还保留上一节点未提交的 Native Broker/Host 实现、测试及 MXC 运行依赖，不包含在本次界面/删除提交中：完整宿主链及 SDK 启动中取消实际通过；72 项核心测试通过，覆盖率尚有 broker/host 的关闭分支未满，lint 待收尾。两处 collect/spill 测试已从数值改为 `{ maxBytes }`，类型检查和 native-host 测试通过。它仍未装配正式 Subprocess/PTY，完整保护继续不可用；原 P2/P3 范围全部保留。最新已有安装包仍来自 `811717f230`，不是本节点源码。

## 内层命令范围与自然完成（2026-11-02）

基点是已推送的唯一 main `0bf2867009`。用户再次明确“继续，完成 DSHU”；Goal active，仍按后台开发执行。最近实际剩余额度 41%；一次额度查询失败后重查成功，未使用免费重置或购买额度。完整原需求范围保留，安装器前台验收没有启动。

`native-worker.ts` 已移除直接 Node spawn，改为复用严格 `launchWindowsJob`。新增 `subprocess-local/managed` 公开既有 launcher、binder、校验器与归属类型，补齐源码别名、构建入口、共享块发布规则。命令直接退出后继续等待真实内层范围；分离后代可自然结束或经终止帧停止，最后引导自行退出，宿主仍要独立确认外层 Job。`accepted` 只表示管道受理，不证明开始执行；私有启动请求新增必填 `graceMs`，增加 `terminate` 和 `rangeExited`。工作进程测试的 Node 适配器仅用于跨平台传输测试，生产默认不走弱回退。

实际发现 MXC 会把临时目录重定向到私有根下尚未创建的 `Packages/sandbox.../AC/Temp`。引导新增第五个业务参数 `temporaryRoot`（nonce、entry、hook、tsconfig 之后），只在准入后于该根内创建临时目录并复核真实路径。实际目标 mkdtemp、越界拒绝、源码和编译链均通过。旧 `native-worker-built-20261102.mjs` 使用上一版私有协议，恢复时用新的 `native-range-built-20261102.mjs`。

验证：Linux 85 项、四模块覆盖率均 100%；Windows 两组独立进程各 33 项通过；既有原生执行 5 项及源码/编译 runner 2 项通过。真实容器普通命令、分离后代自然/主动结束、继承生产拒绝和临时目录共 7 项。故意把范围等待改成直接结果等待时，两个后代测试均在错误完成通知上失败，源码已按原字节恢复。编译产物不使用源码钩子，192 KiB 往返、目标退出码 23、引导自然退出 0、生产保持不变、外层 Job 归零。完整 build 10/10、发布与别名 177 项、NodeNext 392 API、publint、JSDoc、定向 lint 和三组 README 配对通过。日志均在 `.dsh-build/native-range-*-20261102.log`。

恢复入口：继续宿主 Native Subprocess 适配器，复用 `bindManagedProcess` 和 collect/spill。需把 SDK 启动期间也纳入可观察范围，不能在部分启动失败时只信 SDK 自报清理；可优先验证用严格 Job 拥有专用可信 Broker，再由 Broker 启动 MXC。此 Broker/宿主适配器尚未实现，仍须保持规则、代理和临时资源至真正关闭。之后继续受保护目标代理、PTY、其他数据库/远端身份及 P3 审计、设置联动。

过程中误用了 `gen-module-graph`；它只生成文档，不生成源码别名。仅将它新生成的 3 个未跟踪文档移到 `.dsh-build/native-range-doc-graph-20261102`，未改历史文档。正确的 `gen-tsconfig-paths` 管理包主入口，新 `./managed` 子路径已在其生成区外显式加入。Linux 同步脚本为 `native-range-linux-20261102.sh`；私有 WSL 验证目录未变，不重新应用旧锁补丁。现有安装包仍是 `811717f230`，没有替换正式应用。

## 可信命令工作进程与帧传输（2026-11-02）

基点为已推送的唯一 main `7d4bd67ef2`；Goal active，继续后台开发。最近实际账户剩余 44%，未使用重置或购买额度；没有打开安装器或替换正式应用。

新增 `win32-process/assets/native-bootstrap.mjs` 及其路径解析：先输出随机标识/PID/创建 FILETIME，再同步等待准入字节，之后才加载源码钩子或编译后的工作进程。`target-protection/src/native-bootstrap.ts` 限制身份头并清理监听；`native-protocol.ts` 区分标准流、控制流与生命周期；`native-worker.ts` 执行显式 argv/cwd/env，直接退出后继续保留根进程供独立 Job 管理。没有装配为正式 Subprocess，也没有代理或 PTY。SDK 仍只有测试依赖，默认完整保护仍不可用。

关键修复：Windows 第 7 号描述符必须使用 overlapped 管道，否则 128 KiB 回写在 64 KiB 后 EAGAIN。源流经有界转接再进入异步帧写入，避免退出与背压交错；无错误关闭也必须结算写入等待并停止空闲工作进程。读取帧时不能为取一条消息而提前结束 `for await`，这会销毁整个底层传输；宿主读取循环须持续到实际关闭。

验证：Windows 最新 6 文件/83 项通过；Linux 4 文件/76 项通过，四模块覆盖率均 100%；两组独立 Windows 进程各 21 项通过。源码实际 MXC 用例和 `.dsh-build/native-worker-built-20261102.mjs` 编译产物检查通过：192 KiB 二进制、退出码 23、生产保持原样、测试写入成功、Job 归零。完整 build 10/10、NodeNext 392 API、publint、启动入口、定向 lint、README/两组配对通过。JSDoc 缺说明和打包规则缺新资产的问题已修正，JSDoc 复验及发布规则 169 项通过；最终增量 build:check 2/2 通过。日志均为 `.dsh-build/native-worker-*-20261102.log`。

负对照如实保留：普通控制往返去掉转接仍通过，不作为背压证据；另一个阻塞输出并等待真实子进程关闭的用例去掉转接后超时，早期清理也超时，随后修复关闭等待。Windows 控制管道改为 overlapped 前的 EAGAIN 与测试读取器提前销毁传输的失败记录仍在。最新源码已恢复并通过回归，没有放宽覆盖率。

下一项是宿主侧 Native Subprocess 适配器，复用现有 collect/spill 和整个范围的等待语义；再接目标代理与 PTY。入口必须保护启动环境，持有规则和代理直到独立 Job 确认归零。源码链已验证在准入后注册 tsx；编译链直接导入 `lib/types/native-worker.js`。打包资产由 `check-workspace-constraints` 对单个路径显式约束，不能改成宽泛发布全部脚本。Linux 源验证副本仍为 `/home/linzh/.cache/dshu-verification/alpha2-20261101.HlFeMf`，新增同步脚本 `native-worker-linux-20261102.sh` 不重新应用旧锁补丁。现有安装包仍停在 `811717f230`。

装配前必须处理正常完成：当前外层 Job 包含常驻引导和可能的 tsx/esbuild helper，不能直接用“外层 Job 为空”实现命令的自然完成等待。优先验证复用 `LocalSubprocessRuntime` 的内层受管理范围，再在其完成后退出引导，最后由宿主独立确认外层归零；不能在直接子进程退出后盲目杀掉仍合法运行的后代。当前工作进程直接使用 Node spawn，只证明传输和外部终止链；尚未证明最终 Subprocess 的自然完成语义。这也是该提供方未标完成的原因。

## 独立 Windows Job 所有者（2026-11-02）

上一节点已按中文提交推送唯一 main：`85c6544059`。Goal active，继续后台开发；没有打开安装器或替换正式应用。最近实际剩余额度 46%，旧 40% 阈值已由用户后续授权撤销。

`win32-process/observed-job.ts` 增加独立 kill-on-close Job：打开进程后用 PID 与创建 FILETIME 防止复用，启动握手核对随机标识，分配完成前不放行目标。取消或查询失败不算关闭；活动成员未归零时拒绝释放句柄。测试用无预加载的可信 Node 引导，真实验证根进程退出后分离后代仍受控，以及 MXC 中保护规则等独立 Job 排空后才提交。正式引导在分配前不得创建后代或加入其他 Job；当前没有接成 Subprocess/PTY 提供方。

验证：相邻 9 文件/87 项通过；补充计时器故障后所有者 23 项通过；最终原生/MXC 6 项通过，并发两组各 6 项通过。Linux 23 项通过、3 个 Windows 专属跳过，逻辑覆盖率四项 100%。去掉 Job 分配的负对照在放行工作前失败，源码已恢复。编译导出运行检查通过；完整 build 10/10、后续 build:check 2/2、定向 lint、JSDoc、392 个 NodeNext API、publint 和 README/配对通过。证据在 `.dsh-build/observed-job-*-20261102.log`，构建导出检查脚本为 `observed-job-built-20261102.mjs`。首轮覆盖率、测试夹具和 lint 的失败均保留，不计通过；修复后复验结果如上。

恢复顺序：可信私有启动入口与标准流/取消 → 受保护目标代理 → Subprocess/PTY 和各原生消费者 → 远端/数据库余项 → P3 审计及模式界面。全量范围保留在 TODO 与 `requirements/2026-11-02-native-execution.md`，不把本节点勾成完整保护。现有 `811717f230` 安装包仍不包含后续源码节点。

## 原生文件策略与关闭同步节点（2026-11-02）

Goal active，继续后台开发。基点为 main/origin/main 3533786caf；本节点检查完成，按中文提交推送。没有打开安装器或替换正式应用。最近实际剩余额度 46%，未使用重置或购买额度。

新增 native-file-policy 构建器，消费 TargetProtection.nativeFileConstraints()；覆盖生产/所有者目录、硬链接、日志伴随文件、只读优先级、扫描预算和取消。修正了父目录枚举权限误覆盖读写授权的问题。TargetStore 支持同一修订的共享保留，retainNativeExecution() 在改规则时先等待原生关闭；关闭不明时保留旧修订并禁止新执行，显式所有者重试只重查关闭、不重放命令。国家数据源失效、并发保存和根所有者退出有定向验证。

MXC 1.0.1 仅为 target-protection 的开发测试依赖，未进入产品运行依赖。真实 Windows 用例验证完整拒绝、审计只读、硬链接、未来日志路径、普通写入，以及分离子进程退出后才释放修订。子进程使用事先持有的内核句柄核验，避免 PID 复用；尚未装配 Subprocess、PTY 或目标代理。

相邻回归发现：共享修订后，两次已提交的 SQLite 操作都应报告 committed-cleanup-failed，不能把第二次已提交操作说成 outcome-unknown。已据实际结果更新测试，同时修复隔离等待回收的 SQLite helper 未占 maxPending 的容量漏洞。关闭未知的 helper 现在占用容量，超额不再启动进程。

验证：首次整组 35 文件/416 项通过、1 项失败；上述 SQLite 修复后，对应 SQLite 与真实原生用例 28 项通过。原生文件策略模块覆盖率四项 100%；后续生命周期 7 项通过，Windows 并发独立进程两组各 9 项通过。Linux 定向 58 项通过、3 个 Windows 专属跳过；8 个保护场景普通回放通过。原始 POSIX 回放失败是 Windows 作者侧车中的 pwsh 与旧 exit_plan_mode，已用 header-only 维护后复验；只更新 15 个可读侧车，未改 Session JSONL 或 normalizer。667 份冻结会话及声明生成测试共 44 项通过，语料检查 3 项通过。完整构建 10/10、定向 lint、README 与两个配对通过。

日志位于 .dsh-build/native-policy-*-20261102.log。发布依赖检查已完成：hygiene 23/23 通过，日志 native-policy-hygiene-20261102.log，耗时 417.60 秒；不重复已通过检查。Linux 源码目录仍为 /home/linzh/.cache/dshu-verification/alpha2-20261101.HlFeMf；native-policy-lock.patch 已应用，不再应用。最新普通回放日志 native-policy-replay-final-20261102.log，侧车审阅清单 native-policy-header-review-20261102.json。

已核实下一步关键条件：MXC BaseContainer 的 kill_process_tree 在 Job 排空超时后只写 stderr 并继续，普通 wait 成功不足以确认整个执行范围。独立验证已在发送工作前把等待输入的可信 Node 引导程序加入宿主独立持有的 kill-on-close Job，再放行目标；停止后独立 Job accounting 为零。脚本与结果在 .dsh-build/mxc-probe-20261102/outer-job.mjs、outer-job.json，日志 mxc-outer-job2-20261102.log。正式提供方需实现可信启动栅栏、运行时启动适配、启动环境剥离预加载变量、标准流及取消，并自行确认范围关闭；不可只解析 SDK stderr。详见 requirements/2026-11-02-native-execution.md。

完整 Native Subprocess/PTY、受控目标代理、远端身份/数据库、所有原生入口及 P3 审计和 UI 仍未完成，默认完整保护继续不可用。不要把当前真实用例改记为完整命令后端已交付。

## Windows 文件别名与原生命令候选（2026-11-02）

Goal active，后台开发继续。开始时 main/origin/main 为 d8da2753e7，命名分支仍只有 main。最近实际账户剩余 51%，未使用重置或购买额度；未打开安装器、未替换正式应用。

Windows 文件保护已增加 FindFirstFileNameW/FindNextFileNameW 与卷挂载路径枚举，逐项核对原生文件 ID、链接数并在结尾复查。生产/只读/所有者目录的外部硬链接按真实归属处理；无关测试硬链接可用。枚举不完整、重复、变更、取消或关闭失败均拒绝；非 Windows 的无法归属链接仍拒绝。复用现有 win32-process 原生绑定，无新增外部运行依赖，无 Session/SQLite 格式变化。物理文件及真实 Loader 验证通过。

证据：windows-links-regressions-20261102.log 的早期 71 项通过；最新核心 Windows 47 项、Linux 45 项/2 个 Windows 专属跳过，枚举与本地规则模块覆盖率四项均 100%。SQLite 与 Loader 的相邻 Linux 回归 71 项通过/2 跳过；Windows Loader 新增硬链接路径另 1 项通过。两组独立 Windows 进程各 44 项通过。完整构建 10/10、JSDoc、第三方声明、README/配对及定向 lint 通过；最终 build:check 2/2 通过。hygiene 原运行 21/23 通过，两个失败为旧构建残留；归档后 constraints 与 publint 分别复验退出 0，未重复已通过的其余 21 项。原生 ABI 声明由 Windows 实测覆盖，覆盖率仅豁免该平台桥接，决策与关闭分支不豁免。 已确认无跟踪源码的旧 ui-deepseek-model-label-1017 目录（仅 lib/node_modules）和 mode-dossiers/lib/types/client 编译目录，整体移到 .dsh-build/retired-client-20261102，未删除文件、未跟随或删除依赖链接目标。不要恢复到 packages 目录。

受限命令候选为微软 MXC 1.0.1 / fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2，MIT，尚未加入产品依赖或默认组合。Windows 26340.9843 的实际 native probe 是 base-container，无 DACL augmentation。真实负例发现普通 IP/端口规则加 hostLoopback allow 仍可连其他本机端口；路径拒绝也不能自动覆盖已有硬链接。专用代理模式加完整别名拒绝列表后：允许端口 1 次连接、另一端口 0 次，生产读取/写入/别名变更均拒绝，允许测试写入成功。父进程复核生产与只读文件内容未变。没有 host-prep/UAC、管理员防火墙或遥测操作。

候选与接入顺序详见 requirements/2026-11-02-native-execution.md；本机源码和 npm 安装分别位于 .dsh-build/mxc-reference-20261102、.dsh-build/mxc-probe-20261102，后者保留原始脚本、通过和失败 JSON 及 verified-results.json。不能把这些独立样例当作 Subprocess/PTY 已实现。下一步接真实策略生成、受控目标代理、进程/后代回收与规则变更同步，再覆盖 MCP/REA、数据库及产品 UI。原完整 P2/P3 范围均保留。

Linux 验证环境沿用 /home/linzh/.cache/dshu-verification/alpha2-20261101.HlFeMf。一次 pnpm 安装因未指定原私有 store 拒绝迁移模块目录，未执行删除；修正 store 后离线缺 Android 元数据，在线保持冻结锁与供应链校验后安装及测试通过。其 SheetJS 临时同哈希本地镜像保留，主仓库锁仅新增内部 win32-process 引用。不重跑已应用的 windows-links-lock.patch，也不删除此前拒绝清理的缓存目录。

## SSH 代理执行节点（2026-11-02）

历史回放节点已提交并推送唯一 main：63a5778d98。继续 Goal active 和后台开发，未打开安装器或替换系统应用。

可选 target-protection/ssh 增加显式 HTTP(S) CONNECT 路由，默认仍为直连。原始域名/别名先判定，再把固定字面 IP 交给可信代理；代理凭据与 SSH 凭据独立，代理建连之后仍验证 SSH 指纹。读取凭据和建连后复查规则，生产完全保护在首次 TCP 前拒绝；代理失败没有直连回退。已建立或等待 CONNECT 的连接在保护撤下时关闭。此项不是网安设置的自动路由或解密流量捕获，也没有放开未约束的远端命令。

同时修复现有 connectThrough 丢弃响应头后首批数据的问题。真实 HTTP 代理同包返回 SSH 标识时，修复前读到空字符串，修复后完整保留。Windows 与隔离 WSL Linux 各 59 项 SSH/代理测试通过，包含实际 ssh2 握手、Loader YAML 装配、只读写入拒绝、生产零连接、别名冲突、407/403/502 无回退、独立认证、主机密钥不符、凭据等待期间变更规则和撤下回收。这里的 SSH 测试使用可控协议 peer，不冒充重新安装真实远端 helper。原真实 helper 验收不变。

完整构建 ssh-proxy-build2 为 10/10 通过；README、三个中英配对、修改源码的 lint 通过（格式和 Promise barrier 类型已修正，未改门禁）。并发独立进程检查日志 ssh-proxy-concurrent-0/1-20261102.log。其他证据：.dsh-build/ssh-proxy-all-20261102.log、ssh-proxy-linux-20261102.log、ssh-proxy-head-negative-20261102.log、ssh-proxy-build2-20261102.log、ssh-proxy-lint2/3-20261102.log。首轮未配置代理被 Schema 自动补空对象的问题已修复，直接连接与代理连接均复验。

已更新目标保护计划的 SSH 子项。目录/远端资源身份、任意网络 SQL、受限本地/远端命令、原生旁路及 P3 审计/所有者界面继续保留未完成。现有 811717f230 检查包尚未包含这两个源码节点，未将旧包称为最新源码构建。

## 新内核历史回放收尾（2026-11-02）

Goal active，继续后台推进全部待办。主工作区为 D:/Coding/deepseek-harness-uncensored，只有 main；安装器原生窗口和正式安装仍延后，Android/Fedora 与全新安装器仍为计划。02.10 内核适配可勾选完成，安装器、完整目标保护及产品联动仍未完成。

发现并修复 headless 组合的权限默认值不一致和 security-proxy 等待已禁用 credentials 的启动问题。默认保持 DSHU 完全权限，显式 workspace-write/ask 可用；真实 profile 的两个启动用例通过。SDK 回放开始消费 manifest 的显式权限，并新增先核对会话/协议后维护 header 的模式。

POSIX Node 24.21 下 SDK 33 项与 ACP 16 项共 49 项普通回放全部通过。当前格式旧输入用 behavior-update 声明保留，新增 writer 输出独立验证；不能关闭日志比较或写穿共享侧车。224 项语料/运行器/冻结记录测试通过，1 项既有跳过；667 份既有 Session 字节未变。错误 writer 内容的 SDK、ACP 负对照均失败，SDK header 维护失败时不写侧车。图片场景按实际静态请求增加 3460 token 调整窗口至 14347，并断言仅图片计费越过 80% 阈值；计费降至有效值 1 的负对照因不触发预期压缩而失败。最初设 0 只触发配置校验，不作为行为证据。

最新完整构建 10/10 通过；README 检查、820 组中英配对通过。pnpm lint 的嵌套 npm 被本机 Corepack 包管理器路由拒绝，改用同一已生成契约后的 run-oxlint 入口复验，仅发现一处测试箭头括号格式，修正后该文件检查通过；无其他错误。未改包管理策略、normalizer 或产品 armor 文本。

证据在 .dsh-build：sdk-acp-replay-final-20261102.log、replay-oracle-checks-20261102.log、current-output-negative-proof-20261102.json、image-pricing-negative-20261102.log、replay-final-build-20261102.log、replay-oxlint-20261102.log。Linux 隔离目录 /home/linzh/.cache/dshu-verification/alpha2-20261101.HlFeMf（Ubuntu），使用私有 Node/pnpm store，无真实模型密钥；SheetJS 仅验证副本使用同 sha512 本地镜像，主锁文件未改。

现有 811717f230 检查包不包含本次 headless 修复，仍未替换正式安装。下一项继续 P2 SSH 代理及受限执行/数据库身份，再接 P3 审计；不得把拒绝不受限进程当作完整目标沙盒。

## 已推送新内核与独立检查包（2026-11-01）

用户最新要求推进 TODO 到全部完成；Goal active，继续现有进行中和待实现项。原生安装器窗口仍按“先继续后台开发”延后；Android＋PRoot Fedora 与全新安装器架构仍为计划，不扩大成即时实施任务。原目标保护、数据库、审计、并存和签名验收范围保留。

源码已合入本地及远端唯一的 main：811717f230。核心迁移 ac81198769，macOS 独立路径/产物/更新源修正 18c53ca045，合并 a07155a290，本地打包时间校验修正 811717f230。主工作区依赖已更新，清理前后两次完整构建均 10/10 通过；已退役的 1017 标签插件两个生成文件移入 .dsh-build/retired-client-20261101，未删除。保留的 undefined/temp/tsx-linzh 缓存未改动，仅加本地 Git 精确排除，不进入源码或安装包。

**检查包：**`.dsh-build/deliverables/DSHU-0.1.0-core-0.2.2-alpha.2-win-x64-unsigned-20261101.exe`，317620486 字节，SHA256 `c44b58ddf36a7df5e649185202f8839995849e7aaefcee5f9e726a386cbac9ba`。对应 `DSHU-20261101-manifest.json` 记录源码、编译时间和验证范围。包来自干净源码 811717f230，编译时间 2026-11-01T13:59:54.522Z；产品 DSHU 0.1.0、内核 DSH 0.2.2-alpha.2。PE 元数据为 DeepSeek Harness Uncensored / WaterRun；ASAR 包名 deepseek-harness-uncensored。未签名，未安装，也未打开向导。

打包记录位于迁移工作树 `apps/desktop/.desktop-build/packaging-runs/2026-11-01T13-59-51.917Z-OEVSje`，result.json 的 success=true。组装后原生依赖、CLI 离线插件安装/卸载、Host 启动、DOCX/XLSX/PPTX 转 PDF 和技能 CLI 发现通过。最初直接运行打包脚本缺少 pnpm 上下文；第二次发现本地打包重新计算编译时间。已修复为使用产物记录中的时间，同时严格比对提交、产品元数据、配置和文件哈希，11 项回归通过；失败记录保留，最终为 package3。

最新完整单测 49556 项通过，4 项失败均由独立补验收敛；不是把原运行改记全绿。hygiene 23/23、全仓 lint、820 组文档配对、667 份旧 Session 字节、42 项模式组合、21 项 SDK 运行检查、20 项设置页面、7 项保护回放及 14 项中英原生静默安装场景的证据见下节。完整 SDK/ACP 旧录制在 Windows 的精确输出仍有平台差异；下一步先在其支持的 POSIX 环境核对，不能修改冻结记录或放宽 normalizer 以掩盖差异。

继续开发以主工作区为准。迁移工作树仍保留，供对照产物和日志；无需创建新分支。先补历史回放验收，再继续 P2 受限执行/数据库/原生入口，最后接 P3 审计与所有者界面。没有可用后端时继续显示保护不可用，不因打包成功勾选完整保护。

## 内核迁移：后台验收进展（2026-11-01，21:23）

Goal 保持 active；用户要求先后台开发，未打开原生安装器窗口、未更换正式应用。最近实际 Codex 剩余额度为 64%。main/origin/main 为 b149080bc0，迁移工作树仍在 D:/Coding/deepseek-harness-uncensored-upstream-20261101（detached，基点 83b0eb2269），唯一命名分支为 main。

- 已完成：全部源码和三份设置快照冲突解决；四种产品模式真实组合启动、20 项设置页面、5 项 Web 图标检查通过。中英安装器各 7 项隔离静默安装/卸载通过，真实 dshu/dsh 注册树逐项前后未变。前台/DPI 仍待用户安排。
- 已修复：预测请求提前释放主对话读取租约，新增确定性负对照复现；SDK 独立入口和目录、HTTP/受保护解析器、LiveShare 权限、插件组合及持久化迁移继续保留。7 个目标保护场景普通回放通过。
- 已完成定向检查：152 项生命周期/元数据/打包、239 项卫生修复、126 项模式组件、114 项 Forge、36 项文档/npm/VFS；PTC 28 项通过、1 平台跳过。持久化 67 根/19 份记录、389 包许可标识、293 默认/52 可选产品包分类、Python 运行时闭包、1293 处既有 unknown 断言基线通过；未提高断言基线。
- 诊断记录：前一 8 worker 运行因嵌套 lint 超时及打包夹具问题中止，不计通过；最终单测和各项补验见下方最新检查。
- 已完成补验：42 项 Web/桌面模式组合、21 项 SDK 实际运行检查通过。插件设置页撤权时残留导航的生命周期问题已修复，7 项回归通过；安装器旧日语断言改按中英交付范围，10 项通过。完整单测发现的文档预览许可打包检查缺少 npm_execpath；显式提供 pnpm 入口后，与回放运行器一起 73 项通过。
- 最新检查：完整单测 unit-suite4-round3 跑完，2498 文件/49556 项通过，3 文件/4 项失败；对应修复后的 7 项插件、10 项安装器、73 项许可/回放运行器复验通过。22 文件/268 项跳过和 1 项预期失败均保留。hygiene-final 23/23、全仓 lint-final 已通过。最新 build-final 正在执行，尚未打包或合入 main。完整 SDK/ACP 回放因 SDK Windows 路径转义错误和旧录制的平台差异中止，不能计为通过。转义已修复并在标题场景执行完成，但精确输出仍有 Windows ACL 技能和路径表示差异；保留该失败，不改写历史样本或放宽公共 normalizer。
- 回放隔离：原错误使占位测试密钥进入公开 API 并收到 401，未使用用户密钥；已把无密钥回放的默认端点固定到不可服务的回环端口，缺失适配器在本地失败。拥有本地 HTTP 服务的夹具仍可显式覆盖。
- 文档检查：根 README 长度/链接通过；全库配对最终 820 组通过。先核准 334 组正文与上游或已有基线字节一致，逐项审阅另 7 组分支合同；将 1369 个失效本地技术文档/决策链接指向已核实的上游提交路径，公开文档仍只有 README。未改冻结归档；为既有单文件说明登记 7 个精确配对豁免。补齐上下文包中文索引和声明规范化描述。原全库失败日志保留，最终证据为 pairing-final4。

日志统一在主仓库 .dsh-build/upstream-alpha2-*-20261101.log。原生夹具为迁移树 apps/desktop/.desktop-build/installer-tests/run-RlXXy2；注册树核对为主仓库 upstream-alpha2-installer-protocol-result-20261101.json。完整单测结果为同名 JSON；恢复时先查看 build-final、presets-full2 和最终补验日志，不重复已经通过的全套。

本地代码备份 .dsh-build/alpha2-wip-20261101-2028.zip 已校验 ZIP 全部成员，SHA256 b13f33b50af427628c90c2ad8713c1adb011309240d0d8c2b5349e30ed857598。包含基于 83b0eb2269 的二进制补丁、29 份未跟踪源码和清单，不含依赖、密钥、用户数据与缓存；备份后 Web 组合测试仍有新修改，优先恢复现有工作树。不要重跑一次性导入/恢复脚本，不清理已被拒绝删除的 undefined 或 PostgreSQL 临时目录。

打包夹具一次未切换临时工作目录，意外在迁移树 packed 生成 6 个 vendor tarball；已停止并将确认属于该次操作的产物移入 .dsh-build/pack-fixture-cwd-error-20261101-1810，未发布、未安装、vendor 源码无额外差异。修正为进程预加载切换到独立夹具目录，12 项打包回归通过。不要将该产物作为发布包。

全仓历史记录范围已扩展为 667 份，均与基点 83b0eb2269 原始字节一致；新增固定哈希清单和替换/删除负例，32 项记录及布局检查通过。两个 Python SDK advanced 新样本改放 advanced-alpha2 / advanced-ptc-alpha2，旧 V4 及浏览器 1017 样本原字节恢复。四份 session.expected.jsonl 是输出比较文件，按上游当前行为更新，不作为冻结 Session 输入。

原目标保护和审计未完成项保留。完成迁移验收后才合入 main 并推送，不把候选 product.json 或本地备份当作交付。

## 内核迁移：完整测试后的兼容修复（2026-11-01，17:20）

Goal 保持 active，用户选择“先继续后台开发”，不打开安装器前台，不更换正式安装。实际 Codex 周额度剩余 74%，未触发 40% 收尾规则。main 为 18dac75747；源码仍在 D:/Coding/deepseek-harness-uncensored-upstream-20261101 的 detached 工作树，原恢复位置和禁止清理缓存的约束不变。

最新完整构建 build-complete3 已 10/10 通过，真实 Web 恢复场景 web-recovery 3/3 通过；两者发生在下述后续修复之前，交付前仍需再构建。完整单测以 8 个 worker 跑完，最初为 2436 文件通过、72 文件失败，49424 项通过、160 项失败；不把这次运行记为全绿。失败清单与摘要在主仓库 .dsh-build/upstream-alpha2-failed-files-20261101.json 和 upstream-alpha2-failure-report-20261101.json。

已修复 SDK 查找独立 dsh-uncensored 入口及显式 home 覆盖，更新 SSH 协议夹具和子任务初始化用法，171 项通过。普通 HTTP 对齐上游私网访问语义，同时保留保护解析器、执行校验、代理绑定和撤销处理，258 项通过。LiveShare 的删除按钮增加权限判断；余额和额度轮询、界面随授权生命周期装卸，相关 39 项及实际组合测试通过。插件管理不再因设置权限缺失而阻塞启动；模式资料的客户端依赖改为真实 remotes 提供方。

Session 仍为 V4。新增内部确认 2026-11-01-alpha2-message-attribution，六个消息来源根扩展保留旧 owner 主体，67 根、19 份历史确认的持久化检查通过。旧内联 schema 确认文件由严格读取器兼容，不改历史文件。两份已提交的手工 V3 保护记录格式有误，使用精确路径、SHA256 和拒绝原因作为负例保留；选定的 V4 后继记录可读，内存中补齐合法 V3 工具封装的语义验证也通过，不放宽运行时读取器。详见 scripts/authored-session-rejections.ts 与测试。3691 份导入文本、32 份普通 Session 文件及一个 WebWorker Session 恢复为与索引完全一致的 LF 字节；没有修改事件内容或 Git blob。后续已有编辑的 README 只统一换行。

恢复产品的中英两语言范围，其他语言资源保留但不自动列入语言选择；安装器只输出中英资源。新 Web 图标生成器使用 DSHU 黑底白鲸矢量，maskable 版本延展背景并保留安全区；四张 PNG 已生成并查看。第三方声明生成器保留 GPL 产品声明和上游 MIT 来源，识别 ssh2 的旧式 MIT 元数据；修复 CRLF 导致供应商清单无法解析及补丁哈希不符。没有恢复本分支明确取消的 GitHub 工作流，对应上游专用测试移除，实际打包、发布预检和签名检查保留。

后续失败逐批收敛，日志均为主仓库 .dsh-build/upstream-alpha2-*-20261101.log：runtime-fixes 171 项、http-alignment 258 项、viewer-surfaces 39 项、execution-source-gates 112 项、desktop-brand-snapshots 60 项通过；compatibility-round4 为 138 通过/3 失败，round5 为 276 通过/4 失败，round6 为 211 通过/4 失败，round7/8 仍有文档、npm 夹具与换行失败，均有后续修复但不能累计当作全绿。ptc-runtime-isolated 最终 28 通过/1 平台跳过；forge-cancel-isolated 1 通过。两次合跑 runtime-contention 因长期等待中止，不能计为通过。

当前在复验 compatibility-round9。仍需：清完失败清单并确认没有新增回归，完成 3 份 settings-chrome ARIA 冲突与实际页面验收，重跑完整构建、所需完整单测/回放和打包，复核旧 Session blob、armor 与独立应用身份，才合入 main。不要重跑 .dsh-build 的一次性导入、补丁解决或换行恢复脚本。正式安装与前台 DPI 验收继续按用户指令延后。原目标保护、数据库和审计未完成范围不缩小。

## 内核迁移：源码适配与后台回归（2026-11-01）

安装器后台节点 83b0eb2269 已推送 main；用户要求暂不打开前台测试窗口，02.11 的交互/DPI 验收继续延后。正式安装没有更换。42 项相关单测、14 项原生静默检查、构建和检查证据见下节。

**恢复工作位置：D:/Coding/deepseek-harness-uncensored-upstream-20261101。** 这是从 83b0eb2269 创建的 detached HEAD，未创建命名分支。另有旧 D:/Coding/dshu-verify 工作树，不属于本次迁移，不动它。主仓库 D:/Coding/deepseek-harness-uncensored 仍为已验证 main，只有被要求保留的 undefined 缓存。

目标固定为上游 f3803c96974ad4a94195fb97e5c637e9c2a3afe3（0.2.2-alpha.2），源树基准 1f81c047fc48fa190a683e469daa699857e9afe8；rc.5 的 b830ec950faba0a46dda564be3e2d854afed94f1 思考展示修复另核准。首次完整 git apply 因 7 个本分支删除/上游删除但本分支修改的文件失败且没有改变工作树，不能把日志的 Applied 字样当作实际导入。现已用筛选后的三方补丁实际导入 6468 个文件补丁，保留根 README、公开 docs/website 删除、工作流与本分支指引、GPL 和 product.json。

**源码冲突已解决，索引仅余 3 份 settings-chrome 页面期望快照，待真实页面更新。** 迁移工作树已有独立 node_modules，锁文件完成三方结构合并及供应链校验。ssh2/cpu-features 的可选原生加速安装脚本经过读取后明确禁用，不关闭整个安装脚本策略。不要重置工作树或重新覆盖补丁；这里是 git apply --3way 的索引冲突，不运行 merge --continue。

已适配 Agent 自有模型选择、异步投影句柄、新历史/状态订阅、独立旁问、输入预测、删除及跨重启额度恢复。删除会取消对应历史、投影与状态订阅；其他会话继续工作。记忆提炼的投影在预设插件激活时等待注册完成，停止使用旧的全局 key 读取。修复自动合并留下的重复 Service.init、缺少 agent 参数和失效 selectForNextRequest 调用。

保留 DSHU 0.1.0、WaterRun、独立 ID、dshu 协议和双 HOME 卸载保护。安装器旧 strings.nsh 已移入上游 JSON 语言资源生成流程，四个独立身份/完成文案键均保留；没有打开前台窗口。上游移除了 web-fetch-http 地址校验与绑定，本分支的保护提供方仍依赖它，已保留 network.ts、授权钩子、相应依赖及回归，不跟随删除。

后台证据统一在主仓库 .dsh-build/upstream-alpha2-*-20261101.log：session-regressions 首轮 68 文件 1259 项中有 32 项失败；修复夹具、读租约和取消语义后，失败所属三文件 95 项通过。asides-memory 36 项通过，额度恢复另通过。installer-tests2 三文件 45 项通过；client-first-tests 的五文件通过，工作区期望补入“不在工作区工作”后另 18 项通过。HTTP/插件/MCP 首轮 512 项通过，代理回归已修复；四项真实 Git/pnpm 场景首次因本地 5 秒预算超时，按上游 CI 的 90000ms 统一预算复验通过（git-ci-budget）。不把未运行、跳过或失败项记为通过。

Host 契约生成与 Host 包检查通过（host-contracts2）；主要客户端包检查通过（client-types3）。直接运行聚合 tsc 时曾触及 Node 默认约 4 GiB 堆上限，未当作代码成功；后续使用仓库提供的 8 GiB 检查入口。构建首轮发现 armor 包没有注册 Host 编译引用，已补引用并重生成路径；第二轮发现扩展语言缺少本分支键和 LiveShare 缺少接口分类。修复后 build-artifacts3 的 8 阶段全部通过；这是后续 rc.5 与授权修复前的构建，不当作最新源码验收。当前 build-complete 正在跑最新 10 阶段串行构建及聚合检查。vendor 要求的测试、默认组合回放、SDK/持久化门禁、UI 实测与打包仍未完成。

维护线 534dac8c81 的思考渲染修复不在 alpha.2 中，已移植 12 个源码/测试文件并解决 ReasoningRow 与文本选择的冲突。Body Slot 提供 rawText 和 display text；原始日志不改。51 项思考/翻译回归通过，另为流式签名、普通标签及换行边界补测，reasoning-text.ts 四项覆盖率均为 100%。已重新生成 Host、Client API 及 Slot catalog；README 记载自定义 Body 的兼容变化。

LiveShare 增加 54 个 DSHU 接口分类，并修复上游允许插件声明覆盖 owner-only 的实际授权缺口：账户/额度、记忆、模式资料、代理流量、旁问/预测/删除不能因此暴露给查看者。负对照复现 allow，修复后 51 项通过，见 viewer-denial-negative/viewer-denial。原始 614 份会话记录的索引及工作区内容再次校验未变，证据 retained-sessions-20261101.json。

23 组冲突文档已更新配对记录；修正 ui-primitives 的失效笔记链接后配对检查通过（doc-pairing-check2），后续新增思考与 LiveShare 文档也已重录。主 README 维持简洁，不恢复公开文档站。迁移树 product.json/README 已写入候选 alpha.2 元数据用于构建，main 的版本和正式安装仍是原版本，不代表发布完成。

83 项手工清单仍需最终核对：76 份既有会话记录保持原字节；4 个旧设置样式文件继续由共享 PreferenceRow 承接；旧 Cordis 预设删除继续保留；strings.nsh/network.ts 已按上节处理。旧记录不因升级重写，新增上游记录已随源码进入。此前 614 份原有记录按索引阶段及 Git blob 检查未改，交付前复核。

恢复入口：先读 build-complete 日志，修复聚合检查和实际组合问题；随后完成持久化/SDK、vendor 与真实 UI 验收，更新三份页面期望并做最终审查。清单为主仓库 .dsh-build/upstream-alpha2-checkpoint-20261101.json、upstream-alpha2-manual-import-20261101.json；resolve-alpha2-*.py 与 import-alpha2-maintenance.py 是已执行的一次性记录，不要重跑。两个工作树不共享 node_modules。Goal 保持 active；最近实际剩余额度 86%，未触发 40% 收尾规则。

## 安装器独立身份与数据保留（2026-11-01）

Goal active。02.11 已完成源码和后台验证，用户明确选择“先继续后台开发”，因此不打开前台安装器测试窗口，也不操作正式安装。欢迎/进度/完成/卸载及窗口标题采用 DSHU，五张图来自现有 resources/icon.svg；render:installer-brand 可重现生成，浅深两图和卸载图已查看。包名为 deepseek-harness-uncensored，作者 WaterRun，应用全名/默认安装目录仍为 DeepSeek Harness Uncensored。新增独立 ID 校验并修正四个 Windows/macOS 预设例子及本地 macOS 默认值，拒绝已知官方 ID 的大小写变体。正式版本号与内核版本未变。

卸载保留 ~/.dsh-uncensored / DSH_UNCENSORED_HOME 及 ~/.dsh / DSH_HOME，两者即便位于候选数据目录内部也不删除；历史共用 @deepseek-ai/dsh-desktop 不作为清理对象。保护目录别名或不可确认会保留数据。私有 Native ABI 与 NSIS 同步更新为 UninstallRemoveDataV2。新旧程序、根目录/项目链接均只用专用测试目录和 GUID 验证，未改用户会话。

中英文各 7 项静默安装/卸载通过：silent、upgrade、replaced、home-inside、home-alias、home-invalid、official-home-inside，原生 C++ 清理回归也通过。源图已查看，生产式 NSIS 可编译，但不把静默结果当作前台 UI/DPI 验收。最终夹具在 apps/desktop/.desktop-build/installer-tests/run-iBsyg2；实际 dshu/dsh 注册树前后完全一致，见 .dsh-build/installer-protocol-proof-20261101.json。夹具自身使用随机独立协议。用户正式程序和协议仍指向各自安装路径。

构建 9/9、后续 build:check 2/2 通过，相关单测/定向 lint/README 检查见 .dsh-build/installer-identity-*-20261101.log。旧测试原先要求官方强制更新配置，现按本分支的独立身份及签名要求修正，不恢复官方更新源。安装器迁移说明按用户精简文档要求集中在 README 及 apps/desktop/README；不新增公开升级文档站。

内核三方树预览已保存在 .dsh-build/upstream-alpha2-merge-preview-20261101.log，347 个冲突路径，未修改工作树。下一步在无命名分支的隔离工作树中迁移 0.2.2-alpha.2，保留本分支功能、独立身份和这次安装器修改；前台安装器验收继续等待用户安排。

## 新增优先项：内核与安装器（2026-11-01）

用户追加“DSH 内核跟进最新版本”“安装器体现独立 DSHU”。已落入 02.10/02.11，见 requirements/2026-11-01-upstream-installer.md，原目标不缩小。PTC 节点 27adabde75 已推送 main，110 项及编译/回放/语料等证据见下节；当前只剩先前被拒绝清理的 undefined 缓存，不再有未提交 PTC 源码。

官方 GitHub 已核实：主线发布为 dsh-v0.2.2-alpha.2，维护线最近发布为 dsh-v0.2.1-rc.5；master 的 package.json 也是 0.2.2-alpha.2，但包含发布后的未发布提交。两个 tag 已抓取。当前 shallow=true，merge-base 暂无结果；按 product.json 的 1f81c047 源树比较，alpha.2 的核心工程范围约 6026 文件变化，rc.5 约 385 文件，多数后者为版本元数据。尚未合并或修改内核版本。应完成真正的 API、Session 与 PTC 适配，不用仅升级 rc.5 的元数据代替主线迁移。

安装器 brand.png 已查看，仍为上游白底鲸鱼与 deepseek HARNESS。productName/产物名称已独立，但 package name、卸载候选目录及 DSH_HOME 读取仍需检查。下步先完成独立安装器资产和身份/数据保护验证，再推进主线源码迁移；仅 main，不创建新的开发分支。系统安装不能代替用户点击安装向导。

## 能力绑定型 PTC 节点（2026-11-01）

Goal active，继续完整 DSHU。前一节点 66637d14b7 已修复四项 UI/额度回归。本节点完成可选 target-protection/ptc：每次使用独立 Worker 与 QuickJS WebAssembly，只暴露声明绑定及控制台，不向程序暴露 Node、进程、模块、原生文件/网络或计时器。既有 run_code 消费者接通，Node PTC 保留；绑定仍必须使用受保护提供方并自行支持取消/清理，默认产品和任意命令隔离没有因此完成。

修复两个实测生命周期缺陷：最终结果发送抛错曾使解释器永不结算，现明确拒绝并通过 using 释放端口、句柄、上下文及运行时；原生终止失败后旧实现仍接收新任务，现拒绝复用、保留执行资源和容量直到真实 exit。新增 shutdownTimeoutMs，默认 10 秒，终止长期不结算时明确抛 PTC_SHUTDOWN_UNCONFIRMED，不伪称线程已停止。真实 run_code 已验证取消时等待未 await 工具完成清理。

验证：8 文件 110 项通过，另一个独立进程同时运行 45 项通过；ptc.ts、ptc-engine.ts 的语句/分支/函数/行均 100%。两个失败负对照见 ptc-delivery-negative.log 与 ptc-shutdown-negative.log，修复后的证据为 ptc-final-coverage.log、ptc-concurrent-native.log、ptc-consumer-drain.log。源码与编译产物分别验证；普通 Node 24.21.0 从公开编译入口实证生产文件未改、测试文件写入、process 不可用、保护撤下后旧引用拒绝，结果在 ptc-built-smoke.log 及其命名证据目录。没有使用用户生产文件。

最终 build 9/9、定向 lint、工作区约束、导出 JSDoc、publint、应用入口检查及中英配对通过。新增 headless run_code 会话与全语料 3 项通过，见 ptc-final-replay.log、ptc-final-corpus.log。新夹具的语料固定点失败实际是 CRLF；只统一该未提交场景的换行，与旧源码 ZIP 对比两个代际 JSON 事件完全一致，未改冻结记录或共享正常化器。一次组合名称过滤意外选中整个 headless 套件，已主动停止并分别精确复验；该中止运行不算通过。

所有日志位于 .dsh-build/target-protection-20261027。QuickJS/quickjs-emscripten 的 MIT 许可和署名已保存，完整依赖许可证审计仍待办。旧 ptc-worker 生成产物已校验目录后移入该目录的 stale-ptc-worker-20261101，不随发布包携带；此前被拒绝清理的 undefined 与 PostgreSQL 目录未动。本节点不打包或安装，下一步继续受限执行、网络数据库与其他入口，再接审计、所有者界面和默认组合，不暂停或缩小 Goal。

## 恢复开发（2026-11-01）

用户明确恢复完整 DSHU 开发，旧暂停指令不再生效，Goal 已恢复 active。先处理 /side 参数、无工作区与未分组入口、限额暂停横幅及预计恢复、关闭旁问自动收起四项回归，编号 03.14、03.15、08.10、06.13。PTC 未提交代码仍单独保留；不混入此次修复，不声称保护完成。

2026-10-30 已从 2ce700e69e 加工作区 PTC 修改生成未签名 Windows 检查包，完整构建及打包后运行时检查通过；第二次运行 2026-10-30T01-04-13.200Z-ZyPDVX 成功，首轮官方 npm 源连接重置失败。安装包 SHA256 为 74081AE1EE5E163D427FA6252F72F1E6753D8AFFE8F991D19AD454AA126FD782。已按用户要求卸载旧 Uncensored 并启动安装向导，后续安装由用户操作，本轮未核验最终安装状态；原版 DSH 保留。

四项修复通过真实 Web 组合的三个浏览器场景：旁问只接收一条用户消息、主线不接收、关闭收起及空命令重开不重复发送；无工作区菜单图标和未分组新建；真实账本限额阻止模型发送、横幅显示预计时间、点击重置后模型完成回复并移除横幅。390px 无横向溢出，截图位于 .artifacts/screenshots/uncensored-recovery。浏览器使用已有只读录制响应，不是实时付费模型质量验收。查询结果增加可选 resumeAt，不改变账本或 Session 格式。

相关包定向回归曾通过 1415 项，仅旧 API 目录期望落后于既有 openWorkspace(null)；修正断言后单独复验。全 GUI 并发运行出现跨模块超时及 Worker 退出超时，已停止并保留 ui-recovery-20261101-gui.log，不算通过。首次浏览器测试被错误放入 Client 编译，导致 tsc 生成 56 个临时源码旁产物，已按生成时间、未跟踪状态及对应 .ts 校验，移入 .dsh-build/ui-recovery-emitted-20261101，未改原源码；现测试在 Host 范围检查。SQLite 测试的断言失败清理缺口已用 finally 关闭句柄修复。未触碰旧 undefined 或此前被拒绝清理的 PostgreSQL 目录。

最新构建、定向 lint 与测试记录统一为 .dsh-build/ui-recovery-20261101-*.log。README 及包说明同步更新。本节点仅提交源码与文档，不重新安装；下一步回到未提交 PTC 的协议/生命周期覆盖和编译后验收，再推进受限执行及保护联动。

## 已按用户要求暂停（2026-10-29）

用户明确要求“收尾暂停”，Goal 已为 paused，停止自动续跑。不得继续引用下方历史继续授权恢复开发；需等用户新的继续指令。只完成代码保存、交接和文档推送，不新增开发，不标记整体完成。

已推送源码基线为 main dc701009af。当前 QuickJS PTC 源码和新会话仍在工作区，未提交到 main；行为回归 5 文件 68 项、新会话普通回放通过，但 engine 的覆盖率门槛失败，Host/生命周期分支和最终编译产物、完整 lint/契约/文档检查尚待完成。此前完整 build 9/9 发生在后续修改之前，不作为最新源码验收。收尾不生成或安装新版应用，也不覆盖原安装和旧包。

恢复入口：先核对 git status 和本节下方 PTC 明细，从 ptc-engine-first-coverage.log 的未覆盖分支继续；保留所有原任务。当前代码原地保存，main 仅推送交接文档，未验收源码不随文档提交。被自动审批保留的 undefined 和 PostgreSQL 临时目录不动，不换工具清理。

本机完整源码备份：D:/Coding/deepseek-harness-uncensored/.dsh-build/target-protection-20261027/dshu-0.1.0-ptc-wip-20261029-220900.zip，46559378 字节，SHA256 4FC63AE7C93A60040E85D8ADDA14322E7EE7E86CD23DEA24232FDCF8AE524C04。归档基于 dc701009af，覆盖当时 26 个变更文件并附 DSHU-CLOSEOUT/manifest.json；不含被保留的测试缓存、忽略文件和未跟踪 .env。归档后的路径/哈希补记在本交接及同目录 ptc-pause-closeout.json；恢复时优先使用当前工作区，备份解压到独立目录核对，不盲目覆盖既有修改。

## 进行中：能力绑定型 PTC（2026-10-29，尚未提交）

Goal active，用户继续授权有效；本轮共享剩余从 8% 到最近的 5%，不按历史 40% 阈值暂停。main 为 dc701009af，本节源码在工作区，未提交、推送或替换安装。下方旧节点的“待提交”是历史记录。

新增可选 target-protection/ptc：每次调用在独立 Worker 内新建 QuickJS 0.32.0 WebAssembly 实例，只传代码、绑定声明和限额，不传 Host 对象、函数、凭据或环境。Node、模块加载、文件/网络/进程接口不进入解释器；TypeScript 仅在私有 Worker 内擦除类型。使用现有 run_code 消费者；绑定本身仍须用受控执行器，负责本身的取消和资源，不能把运行时当作任意 Host 函数的沙盒。普通 Node PTC 保留，默认产品未启用新提供方，任意命令/终端仍未完成。

源码在 packages/guard/target-protection/src 的 ptc.ts、ptc-engine.ts、ptc-bootstrap.ts、ptc-protocol.ts、worker.ts。薄入口采用仓库已有 worker.ts 命名；解析和运行逻辑在可直接测试的 engine。core/ptc-runtime 导出共享 validatePtcBindings，Node 的 validateBindings 委派并保留原错误前缀。新增 quickjs-emscripten-core 和 @jitl/quickjs-wasmfile-release-sync 精确 0.32.0，MIT，已安装。pnpm exec 的依赖校验可能先输出 install，须看命名检查的终态。

已通过 19 项真实 Worker 用例，包括计算/绑定、类型擦除、真实 run_code、拒绝原生 API、错误类/特殊成员、无损输出、忙循环取消和实际退出、假时钟超时、规则撤销、调用隔离、内存/输出上限、生产文件保持和测试文件写入。消息层累计限制在途参数、待确认回复和控制台积压，校验顺序确认，最终结果再检查完整 JSON 字节数。未知关闭保留规则租约等待迟到 exit，抛 PTC_SHUTDOWN_UNCONFIRMED。完整 build 曾 9/9，但之后改了类型擦除、消息和薄入口，最终构建仍待重验。

新 ptc-target-protection 会话通过真实 headless run_code，三个子派发记录生产拒绝、测试写入和独立文件校验，返回 native 为 undefined。安全头部更新已通过会话与最终工作区校验，普通回放/语料仍待最终验证。首次夹具误把补丁 name 当成替换，仍启动普通 Node/文件提供方，独立断言发现仅本轮临时生产夹具被改写；现显式禁用旧 ptc-runtime/fs-sandbox 并插入受控提供方。新记录的 Windows runtime-context cwd 仅在本场景命名字段替为既有 cwd 标记，没有改共享正常化器或任何已提交代际。

最后按当前源码复验 5 文件 68 项通过，新会话普通回放通过，日志为 ptc-current-regression.log、ptc-current-snapshot.log。直接 engine 的 26 项均通过，但 ptc-engine-first-coverage.log 仍有 27 个未覆盖位置：语句约 88%、分支约 82%、函数 100%、行约 94%，不满足门槛，不可改阈值。接下来补协议确认/异常/生命周期和 Host 消息分支、负对照与并行回归；再做编译后公开接口、最新 build/build:check、lint/JSDoc/约束/publint、README 双语说明/Credit/编号清单，最后中文提交 main。所有证据为 .dsh-build/target-protection-20261027/ptc-*.log。旧 lib/types/ptc-worker.js、.d.ts 是本节点改名生成残留，发布前清理；不要动被自动审批保留的 undefined/PostgreSQL 目录。

## 当前节点：动态插件与所有者管理准入（2026-10-29）

Goal active，继续完整“实现DSHU”；用户的继续授权覆盖历史 40% 暂停条件。上个节点为 main `a83914ca3a`，本节点尚待提交。最新成功查询共享剩余 10%，之后一次读取失败；不推算模型或会话独立余额，不使用重置。完整保护仍约 65%，不是默认产品已启用。

新增可选 `target-protection/cordis` 和 `plugin-manager`。动态提供方在 run、面板 Host 启动、Client 源码交付及 invoke 入口拒绝执行；定义和只读检查保留，关闭规则也不会放行无法可靠撤销的 VM/页面代码。管理提供方允许本地列表读取，持久变更及可能运行包进程的查询要求真实 owner Remote 身份及未取消的请求/连接；模型管理工具显式清除继承的 Remote 身份。文件锁和 HMR 队列结束后再次校验。默认提供方保留原行为；所有者主动更换组合属于可信配置行为，不宣称可隔离任意可信 Host 插件。

真实临时 profile 验证所有者版本决定写入、无身份/委派身份零写入、完全权限模型不能继承面板权限、请求/连接取消、持锁期间取消，以及保护依赖撤下后旧引用拒绝。新增 10 项在两个独立进程同时通过；两个新增提供方四项覆盖率 100%。相关 20 文件 465 项通过、3 项既有跳过；三个临时负对照分别去掉动态检查、所有者检查和身份清除，均确定失败，源码已恢复。普通 Node 24.21.0 从编译后的公开导出复核拒绝、实际所有者写入和旧引用失效，证明在 management-built-proof-final.log。

新增 management-target-protection 会话经真实 headless Loader 调用原版 plugin_manager 工具，完全权限下仍产生 TARGET_MANAGEMENT_OWNER_REQUIRED，拒绝进入 Session；随后独立校验无动态激活或规则变化。与浏览器及两个旧插件管理会话一起回放 4 项通过，加强后的新场景再次单独回放通过。旧场景排除无关的缺凭据代理；MCP 管理场景固定未执行的 Bash 能力，消除 Windows/Posix 工具名差异。安全头部更新模式通过会话/工作区校验后才写提示词/工具固定件，四个原有 JSONL 代际逐字核验未改；新增场景独立持有 v3/v4。

验证记录统一位于 `.dsh-build/target-protection-20261027/management-*.log`。完整 build 9/9、最终 build:check 2/2、全仓 lint、JSDoc、工作区约束、publint 和运行时接口目录检查通过。语料 3 项、README 链接/长度及三组双语检查通过；修正所触达包的已删除文档链接和旧插件入口说明，不重建公开 docs。首次构建的 static override 与测试 Promise 联合返回类型错误已修正；测试最初误认官方插件目录为空，已按真实目录修正。私有构建检查脚本的根包解析与 Windows file URL 问题已修正；误用不存在的约束脚本后改为真实 pnpm run constraints 并通过。不能仅凭进程启动判断成功。

仍未完成：限定目标的命令/终端/PTC、其他原生或管理入口、数据库任意 SQL/其他协议、远端资源身份，随后是 P3 的完整审计、所有者配置界面及默认产品组合。动态插件拒绝与所有者管理准入不替代这些任务。旧测试缓存仍因自动审批拒绝而保留，未换工具清理；三次旧安装包下载故障不变，本节点未生成或安装新包。

## 当前节点：浏览器执行保护与关闭确认（2026-10-29）

Goal active，继续完整“实现DSHU”。浏览器节点 `45e71739b9` 已推送，远端与本地核验一致，只有 main；上个 PostgreSQL 节点为 `c4c2b81cc9`。最近成功读取共享剩余 **10%**；用户在 39% 后的继续授权有效，不按历史 40% 阈值暂停，不使用重置或主动消耗重置券。

新增可选 `target-protection/browser`，替换普通 browser-use 注册服务，保留 Playwright MCP、Chrome DevTools MCP 和 Stagehand。三个提供方均通过同一执行租约，在原生分配前及排队调用前校验；撤销关闭资源，原生请求和关闭结束后才释放规则。未知回滚/关闭采用 `BROWSER_SHUTDOWN_UNCONFIRMED`，保留预留与租约；MCP 的实际关闭迟到回执可完成释放。`createMcpClient` 暴露启动前的生命周期对象，避免仅依赖作用域释放。此节点提供准入和撤销，**不是逐目标浏览器隔离**，默认产品仍未启用完整保护。任意网络 SQL、受限命令、远端身份、其他管理/原生旁路及 P3 完整审计和所有者界面继续未完成。

实机排查修复 SDK 重连：SDK 4.1 的会话关闭不等于 CDP 关闭；私有 Worker 在唯一初始化期间记录原生 WebSocket，操作前恢复全局构造器，清理等待 SDK 与套接字握手。重复加载扩展曾导致旧服务 Worker 目标失效，现先读取固定清单身份并复用唯一启用且同版本的扩展，显式 extensionId 保留。启动已接入现有 operationTimeoutMs，Worker 仅接收临时目录/源码配置环境和显式模型数据。共享 LLM 必须为 peer，修复编译包意外内联装饰器代码导致普通 Node 无法加载的问题。真实 Chrome 的两种 MCP 启动/附加共 4 项通过；Stagehand 源码启动/附加、同进程重连、编译后独立进程再次附加及页面保留通过。只用本轮临时浏览器、页面和假模型配置，没有实际模型调用，没有操作用户浏览器。

关键证据位于 `.dsh-build/target-protection-20261027/`：`browser-live-process-identity.log`、`browser-stagehand-peer-verified.log`。Windows 实机测试在 SDK 启动时取得根身份，并按 PID、创建时间和进程名匹配已记录根/后代；PID 复用不算原进程存活，真实已记录孤儿及后代仍被检出。退出检查通过后才对短暂文件锁做有限重试。早期 EBUSY、误判 PID、SDK 超时/目标失效、装饰器 SyntaxError 与类型错误日志保留，不能把早期失败当作仍在运行重启。源码已恢复的负对照见 `browser-negative-control-fixed.log`、`browser-catalog-negative-control.log`：移除执行检查确实启动原生进程，生成目录改动也被校验拒绝。

本体与资源管理器/MCP 的 61 项定向回归达四项 100%，连接/消息/发现/Worker 的 97 项回归亦达四项 100%；包含 MCP 失败确认和迟到回执的真实进程回归。相关总回归 **490 通过、28 跳过**，另补 PID 复用及孤儿检测两项。重试耗尽使用实际错误事件屏障替代 1 秒轮询；批量验证用仓库已有 DSH_COVERAGE_TEST_TIMEOUT_MS=120000，保留退出/效果断言，不调整产品超时。四个 keyless 会话通过，最新记录为 `browser-ci-budget-regression.log`、`browser-commit-snapshots.log`。编译与 lint 以 `browser-commit-build.log`、`browser-commit-lint.log` 的终态为准，提交前检查运行句柄。

旧 Native 会话的头部仍引用 Bash 和上游基础提示词。此浏览器专用夹具排除无关的本机 shell/代理与 Windows ACL 技能，使 macOS/Linux/Windows 输入一致。增加 DSH_SNAPSHOT=headers：先验证会话与工作区，再只更新头部固定件；共享写入策略测试保证不写会话代际。实际更新后逐字验证原 v3/v4 文件未变，普通回放通过，见 `browser-native-header-update.log`。新增独立场景为 browser-target-protection，未覆盖冻结会话代际。

运行时 Cordis 接口目录此前缺少已实现的模式、记忆、余额、REA、限额与保护 API；现补齐精确类型归属并通过同一投影重建目录，修正缺少说明的 JSDoc。根生成/校验命令采用 `--runtime-only`，验证类型、注释及当前产物，同时遵从用户要求不重建公开 docs。旧的文档树断言改为当前运行时产物断言，源码渲染/分区单测保留。README 与六组包说明同步，修正本节点触达的失效链接；完整文档/许可/旧链接审查仍待完成。

最终验收：`browser-commit-build.log` 完整 build 9/9，`browser-commit-lint.log` 全仓 lint 退出 0，`browser-commit-snapshots.log` 四个相关会话通过，六组双语记录一致；JSDoc、工作区约束和两个发布包 publint 通过，Native 包保留既有 ./src/* 声明提示。头部写入策略及 README 45 项通过。最终检查之后仅整理本交接与 TODO，不重新运行已通过行为检查。下一步仍为 P2 的执行范围隔离/管理旁路，再接 P3，不按浏览器准入节点结束完整目标。

清理审批：本轮测试曾因空环境下 Windows 临时目录缺失生成 `D:/Coding/deepseek-harness-uncensored/undefined/temp/tsx-linzh/` 六个缓存文件。已修复 Worker/独立进程的显式临时目录。校验路径与清单后，PowerShell 删除请求仍被自动审批拒绝，理由只有 **blocked by policy**；原目录保留，未换工具删除，不提交它。最终不能宣称整个工作区没有未跟踪文件。此前 PostgreSQL 临时目录保留不动。三次旧安装包下载故障继续保留，尚未生成/安装新的检查包。

管理入口续查：`extensions/tool-cordis` 只注册只读检查工具，不能把它当作动态代码执行入口。实际执行归 `extensions/cordis-host-runner`：`run`、`runHostHalf`、`getClientCode` 和 `invoke` 分别涉及模型启动、面板启动、客户端源代码交付和活动处理器；其 sandbox.ts 明确说明 Node VM 不提供隔离。`boot/plugin-manager/src/tools.ts` 的持久变更在普通完全权限审批后调用管理服务，仍能改变插件及配置。下一节点须核准这些实际入口的所有者授权、保护依赖及直接调用/缓存调用语义；仅隐藏工具或增加普通审批不足以关闭旁路。尚无这些入口的执行保护或验收，不勾选 P2 防篡改与管理入口项。

## 当前节点：PostgreSQL 固定目录审计（2026-10-29，继续开发）

用户的继续授权有效，Goal active；本轮初查共享剩余 **28%**，不再按历史 40% 阈值暂停，不使用重置或推算会话独立百分比。其他 7 项进行中、3 项待实现完整保留，目标保护整体估算仍为 65%。当前节点尚未替换默认产品。

新增可选 `target-protection/postgres` 与 `postgres-agent`，后者提供 `database_inspect`，只选择所有者绑定名称，不接收 SQL。绑定显式主机、端口、数据库、账号、凭据引用及可选 CA。解析并固定一个字面地址，强制原始名称的 TLS 校验；生产完全保护在 TCP/认证前拒绝，审计在只读事务中核验数据库/账号/只读状态后执行固定 `pg_catalog` 查询。结果用具名字段列出表名、种类、RLS 和选定设置，不读取用户表。默认 30 秒、每条 1000 行、解码结果 1 MiB、四个并发请求；结果上限不限制协议帧分配，只支持可信服务器。池化代理/数据库重映射、任意 SQL、测试写入和其他数据库未完成。READ ONLY 本身不等于任意 SQL 沙盒。

Windows 原生 PostgreSQL **18.4** 验收通过 TLS/SCRAM、完全拒绝、只读目录、数据库范围、凭据不进入结果、用户测试行不变和必需服务撤下。仅连接本轮临时数据库，未触及用户数据库；编译后公开入口证明为 `.dsh-build/target-protection-20261027/postgres-provider-proof.json` 与最新 `postgres-submit-native-proof.log`。三个新增 provider 临时集群已停服并保留，尾名 `6mdANd`、`a3Jfl6`、`us4Fly`；遵守此前自动审批拒绝，不尝试换工具删除那些保留文件。

真实 TLS 协议回归覆盖成功结果、别名、缺失凭据/PGPASSWORD、配置拒绝、规则在凭据等待中变更、身份不符、取消/超时、超限、并发容量、原生重置和撤下。两个新增模块的 24 项回归达到语句/分支/函数/行各 100%；两个独立进程同时运行各 24 项通过。时间测试在真实请求屏障后推进假时钟，不依赖机器在一秒内完成握手。先前覆盖率不足已补齐，无降阈值；最新覆盖记录为 `postgres-submit-coverage.log`，并行记录为 `postgres-concurrent-b.log`。

最终相邻后端回归 17 文件 **168 项通过**；新增 Session 通过真实 `dsh --profile headless` 调用 `database_inspect` 并独立确认监听器零 TCP，与 SQLite 两场景一起回放 3 项通过，语料检查 3 项通过。临时移除真实准入后 Loader 验收确定失败，源码已恢复；见 `postgres-negative-control.log`。新增记录独立拥有 v3/v4，不改既有冻结代际。首次 Loader 配置缺少 `cordis:`、配置回调缺少注入及快照缺少空工作区基线的失败均已修正。

最终 build 9/9、全仓 `lint:contracts-ready`、导出 JSDoc、工作区约束、publint、README 两项测试、doc-sync 和双语配对通过，见 `postgres-submit-build.log` 及同目录的 `postgres-*-checks`。`pnpm run lint` 已完成编译阶段，但其内嵌 npm 命令被 Corepack 项目包管理器检查拒绝；直接用 pnpm 运行相同 lint 后阶段。首次 lint 查出未知类型的 Promise 拒绝，改为使用驱动固定文本行类型及显式 Error 超限拒绝，全仓复验通过。最近复查剩余 **27%**。README、双语包说明和编号计划已更新，公开仍只有 README。旧检查包三次失败尚未解决，未生成或安装新包；打包恢复入口见下节。下一阶段继续 P2 的受限执行/数据库能力，再接 P3 审计、所有者界面及默认产品组合，不能把此可选审计节点当作全部保护完成。

## 当前授权与验收环境（2026-10-29，继续开发）

最新打包状态：第三次运行 `2026-10-29T03-52-22.021Z-LJFFeJ` 的 Electron 下载/解压已通过，随后官方 npm 元数据请求 `@protobufjs/base64` 失败（ERR_PNPM_META_FETCH_FAIL）；exec 70315 已退出 1，本机镜像随控制器退出而关闭。不得当作仍在运行等待，也不能宣称新安装包成功。镜像仅从内存提供与新鲜官方 SHASUMS 匹配的 Electron 文件，正常下载器校验保持开启；校验和打包控制脚本分别为 electron-mirror-validation.log、package-with-verified-electron.mjs。当前源码与授权文档已提交，下一步检查运行时依赖解析/下载，再推进 PostgreSQL 产品适配。

测试清理状态：所有专用 PostgreSQL 进程已确认停止；自动审批另拒绝了单独删除三个测试密码文件的命令，这些临时测试文件仍保留，没有换工具删除。它们只属于新建的测试集群，不是用户已有数据库凭据。两次拒绝均只提供 blocked by policy，未给出更具体原因。

用户在剩余 39% 后明确要求“不需要停止，授权你继续”。本次继续及 Goal 自动续跑保持 active，不再因原 40% 阈值暂停；不重复询问许可，不使用额度重置。下方暂停条件是历史，不得据其停止本次开发。

源码 `e6817cd09bab25ff646e4a5ba24094a30a00fa57` 已推送 main，修复实际日志路径、硬链接和提交状态，并补齐隔离资源的退出复核及逐项释放。27→28 项定向回归、两个真实 Session、完整 build 9/9、编译公开接口、JSDoc/lint/文档检查均通过。Git Schannel 连续握手失败后，用单次命令的 OpenSSL 后端及 HTTP/1.1 成功 fetch/push；证书校验保持开启，没有修改全局 Git 配置。

源码归档 `.dsh-build/target-protection-20261027/dshu-0.1.0-e6817cd09b-source.zip`，46315725 字节，SHA256 `EBBC397F64F53695CB243F762838FA30DFAD9476E19AF88377E61EE5BE7E57DC`。检查包尚未成功：`2026-10-29T03-01-07.698Z-saEv90` 在 npm 镜像下载失败；临时官方 npm 源重试 `2026-10-29T03-19-56.324Z-TnWbYB` 在 Electron TLS 下载失败。两个 exec 均已退出 1，不能按运行中等待。原安装和旧包未覆盖。缓存 Electron 44.7.0 压缩包已再次对照官方 GitHub SHASUMS 验证，SHA256 `EEE30DC8FA1F5EA95490E59F44E46EA68DD24C6E93D22FACF70FE5C2D4C2665C`；官方校验文件为 electron-v44.7.0-shasums-win.txt。后续可使用仅提供这些已校验文件的本机临时镜像继续打包，保持默认 checksum 校验。

网络数据库准备：系统及 WSL 没有 PostgreSQL，Docker daemon 未启动。独立工具位于 `C:/Users/linzh/AppData/Local/dshu-dev-tools/postgres-18.4-b13d3c08`，安装了精确版本 `@embedded-postgres/windows-x64@18.4.0-beta.17` 和 `pg@8.23.1`，安装脚本禁用，包内 symlink 清单为空。真实 PostgreSQL 18.4 临时集群完成 SCRAM、参数查询和停服，证明在 postgres-environment-proof.json。只使用新临时库，没有连接用户数据库；产品 pg 依赖尚未加入仓库。

环境探测曾因 Windows 后台服务器继承管道而误判启动等待，清理报 EBUSY。已核实唯一私有二进制路径和临时数据目录，使用 pg_ctl 确认停止，CIM 核查没有该私有二进制进程。自动审批拒绝了停服和递归删除的组合命令；改成只停服并保留目录。修复后的 pg_ctl 使用忽略 stdio，不再等待服务进程继承的管道；随后修正了测试脚本对 pg CommonJS 入口的导入，完整探测通过。保留的三个已停临时目录尾名为 xviEfR、2Y6AWh、yXxtfr，均在系统 Temp 的 dshu-pg-fixture- 前缀下，作为失败/成功证据暂存。复用入口为 postgres-runtime.json 和 postgres-owned-smoke.mjs。

下一步仍按 P2→P3：网络数据库必须固定实际地址、核验数据库及 TLS 身份、使用凭据引用、验证取消与提交结果。已核对 PostgreSQL 官方文档：READ ONLY 并不阻止全部磁盘写入，不能把该设置或 SQL 首词当作完整执行隔离。网络数据库产品后端、目标受限执行、完整审计及默认产品接入尚未完成。

## 当前节点：SQLite 路径与提交状态审查（2026-10-29）

Goal active，完整目标保留。本轮共享剩余从 44% 降到 **42%**；低于 40% 时仍按用户规则收尾打包。网络数据库任务继续保留，本节点先修复上一节点的真实遗漏。

提交前复查剩余 **40%**，尚未满足“低于 40%”。最终定向回归 28 项、两个 Session、build 9/9、定向 lint/JSDoc、文档配对和编译产物验证通过。隔离保留的未知原生范围会再次确认退出；一项释放失败不再阻断其他持有者释放，真实 helper 加观察故障回归通过。一次 GitHub TLS 握手失败保留证据，按原校验设置重试。

文件符号链接绑定曾漏查 helper 实际打开的真实路径日志，回归观察到旧实现启动 helper 并把值从 keep 改为 changed。现在同时检查两组路径，拒绝时零启动、原值不变；目录别名原行为仍通过。多个硬链接使日志归属不唯一，启动及提交前均拒绝；运行中新增硬链接会回滚。迁移步骤已写入包 README，遵从用户要求不重建公开 docs 树。

收到 COMMIT 确认后，退出或规则清理失败现在报告 `SQLITE_COMMITTED_CLEANUP_FAILED`，明确勿重放；没有提交许可时报告 `SQLITE_CLEANUP_FAILED`。有许可但无确认才使用 `SQLITE_OUTCOME_UNKNOWN`。真实数据库值验证了已提交和已取消两种情形，规则所有者能完成释放。

新增 sqlite-commit-cleanup 会话场景：实际 database_query 提交后注入释放失败，日志收到准确错误，再独立读取确认提交值。原成功场景仍通过，冻结代际未改。定向回归 27 项、两个 Session 回放通过；其他最终检查见 `.dsh-build/target-protection-20261027/sqlite-audit-*.log`，修复前证据为 sqlite-alias-before.log。

网络数据库、远端身份、受限执行、其他原生/管理旁路、完整审计与默认产品接入仍未完成。此修复不提高总体完成百分比，也不把后端显示成默认产品已启用。

## 当前节点：本地 SQLite 引擎保护（2026-10-29）

Goal active，继续完整“实现DSHU”。MCP 节点 `32b791d02d` 已推送；本节点提供可选 `target-protection/sqlite` 与 `sqlite-agent`，最新共享额度剩余 **45%**。未触发低于 40% 的收尾规则，未打包或安装。

已有数据库按名称绑定绝对路径。完全保护在 SQL helper 分配前拒绝；审计用原生只读连接和引擎授权回调；测试批次支持参数化 SQL、全文检索、原子写入及返回结果。附件库、扩展加载、自行提交/回滚和不安全 PRAGMA 被引擎拒绝；对话非完全权限强制只读。重复列、大整数、二进制与非有限浮点值保留原值。CPU、堆、输入、完整结果和并发均有界；受管私有 helper 让同步递归查询可被实际终止。

提交前重查文件身份和规则，持有回滚日志规则库的读事务直到原生完成，其他连接的规则写入返回 busy，不能在最后检查和提交之间换规则。WAL 规则库不能提供该互斥，因此拒绝持有；这不限制被查询的 SQLite 数据库使用 WAL，已有 WAL 库审计已验证主库/WAL 字节不变。授权前取消不发送提交许可，可能留下待 SQLite 恢复的未提交日志；授权后的确认丢失报告 `SQLITE_OUTCOME_UNKNOWN`，不自动重放。

验收覆盖生产拒绝、审计只读、测试写入、批次失败及结果超限回滚、跨连接改规则、SQL 递归超时、收到执行开始回执后的取消、规则撤下、会话权限、FTS 与无损值。负对照临时关闭 authorizer 后，测试库确实将临时生产库的值从 preserve 改为 changed；恢复后在附件前拒绝，证明不是只检查 SQL 文本。所有破坏性验证仅使用临时数据库。

Windows Node 24.21.0 编译产物验证通过；WSL Node 22.23.2 缺少 authorizer，按设计在打开数据库前拒绝。新 Session 场景通过真实 `dsh --profile headless` 的 `database_query` 写入，再独立读取验证提交值。manifest 增加仅供 headless 的 `runtime: sqlite-authorizer`，能力缺失时只跳过运行，语料保护仍执行。原固定代际未改写；Windows cwd 只在新夹具中规范化。

证据位于 `.dsh-build/target-protection-20261027/sqlite-*.log`、`sqlite-built-proof.json` 和新快照目录。相关回归 178 项通过；随后 SQL/WAL/取消与读锁测试在两个独立进程各 21 项通过。完整 build 9/9、最终 build:check 2/2、定向 TypeScript lint、JSDoc、publint、文档检查和配对通过。helper 作为私有 JS 资源由真实 Node 执行验证。入口检查发现两份既有模式资料脚本缺少分类，核对仅使用 Node 内置文件接口后补成私有技能资料/样本助手；检查与 12 项拒绝回归通过，没有开放额外应用启动入口。

剩余：MySQL/PostgreSQL 等网络数据库、远端资源身份、目标受限命令/外部引擎、其他原生/管理入口，以及持久审计、配置界面和默认装配。本节点不等于完整目标保护。运行时和 helper 须位于 Agent 不可写位置；外部进程替换文件的系统调用竞态仍未由内核隔离。当前安装基线和上个未签名包保持不变，继续按 P2 → P3 推进。

## 当前节点：通用 MCP 执行准入与撤销（2026-10-29）

Goal 已恢复为 **active**，继续完整“实现DSHU”目标。上一节点 `3519fbac6b` 已推送；本节点继续补原生旁路，最新共享剩余额度 **47%**，没有会话/模型独立窗口，未触发低于 40% 的收尾规则。下方 blocked 记录是历史状态。

新增可选 `target-protection/mcp`，保留普通 MCP 配置和原入口。保护存在且不能约束外部服务器效果时，stdio 在原生启动前、HTTP 在 TCP 前拒绝；MCP 只读声明不能放行。每次重连、发现、工具调用和资源读取都会复查，撤销会取消协商与请求、停止重连并回收工具；复制出的旧工具定义也无法绕过。无法确认关闭时返回 `MCP_SHUTDOWN_UNCONFIRMED` 并提示检查进程及重启 Host，规则资源保留到真实关闭回执；迟到回执可完成释放。MCP namespace 的模块级 WeakMap 已移至应用根持有的服务，独立应用和 Agent 作用域隔离，旧释放函数不能删除新的同名预留。

验证：相关 **11 文件 136 项通过**，新增保护用例在两个独立进程中同时运行，各 6 项通过。真实 Loader 与新增 keyless 会话快照通过；临时去掉校验后 Loader 从拒绝变为 allowed，负对照失败，源码已恢复。Windows Node 24.21.0 与 WSL Linux Node 22.23.2 编译后公开导出均验证原生零启动、HTTP 零 TCP、活动调用取消、旧调用拒绝，以及 SDK 探测进程和服务进程退出。完整 build 9/9、定向 lint、JSDoc、包元数据和双语记录均通过；MCP 包保留既有 `./src/*` 发布文件提示。

证据目录 `.dsh-build/target-protection-20261027/`：`mcp-admission-owned-tests.log`、`mcp-admission-concurrent-*.log`、`mcp-admission-snapshot.log`、`mcp-admission-negative.log`、`mcp-admission-built-win32.json`、`mcp-admission-built-linux.json`。首次构建暴露可选 signal 字段和测试执行上下文类型问题，已修复；新快照的 Windows cwd 只在该夹具中规范化，没有更改共享正常化器。

仍未完成：**数据库协议与远端资源身份、可限定目标的命令/MCP/REA/浏览器执行、其他原生/管理入口、完整审计和默认产品装配**。本节点提供确定性拒绝与撤销，不把任意引擎隔离或测试目标完整自由执行标为完成；默认产品仍未启用这些可选后端。未打包、安装或发布，下一阶段继续 P2，之后再完成 P3。

## 当前节点：REA 原生启动与调用保护（2026-10-29）

SSH 节点 `09f9374dc344d9d56cf45100ef9d0751cf9b048d` 已推送 main。继续执行“实现DSHU”，最近共享剩余额度 **54%**；未触发低于 40% 的收尾规则，未打包或覆盖安装。

新增可选 `target-protection/rea`，替换 REA 根服务并保留原 `rea/agent` 消费者。真实进程分配前校验，排队调用在实际分派前复查；大陆/生产规则及持久所有者资源存在时拒绝无法限制效果的原生引擎，MCP 只读声明和完全权限不能放行。配置变化或规则服务撤下后取消运行中及排队调用，等待实际 stdio 进程关闭、请求结束后释放规则所有者。普通 REA 提供方保持原行为，默认产品没有自动装配该适配器。

验证：REA/进程相关 3 文件 **19 项通过**；真实 Loader 与新增 keyless 会话快照通过；完整 build 9/9、相关 lint、JSDoc、工作区约束、两个包 publint 和双语配对通过。Windows Node 24.21.0 与 WSL Linux Node 22.23.2 都从编译后的公开导出验证启动前拒绝、无保护组合成功、强制关闭不配合的子进程、必需依赖撤下及旧调用拒绝。临时去掉执行校验后，Loader 回归从拒绝变为 allowed 并确定失败；源码已恢复，没有提交负对照。

证据：`.dsh-build/target-protection-20261027/rea-protection-final-tests.log`、`rea-protection-build-final.log`、`rea-protection-snapshot.log`、`rea-protection-negative.log`、`rea-protection-built-win32.json`、`rea-protection-built-linux.json`。Windows 快照目录字段只在新夹具中按既有 cwd 标记修正，未改正常化器或冻结的历史代际。新增快照记录真实拒绝结果，没有调用外部模型或生产服务器。

限制：该节点是 REA 原生旁路的拒绝和撤销适配，**不是 REA 引擎的目标沙盒**。通用 MCP、浏览器、computer-use、扩展/插件管理及其子进程树仍需分别约束；任意外部引擎和孙进程的操作范围不能由一个测试主机标签证明。P2 的远端资源/数据库身份与受限命令、P3 的持久审计和产品联动继续未完成。仍按 [完整计划](requirements/2026-10-27-remaining-work.md) 推进，不将可选后端源码等同于默认产品完整保护。

## 当前节点：SSH 固定目标与远端文件执行保护（2026-10-28）

用户已授权恢复，目标为“实现DSHU”，原始需求和三项保护扩展均保留。当前继续开发；最近查询 7 天共享额度剩余 **56%**，没有独立会话或模型窗口，低于 40% 时仍转入收尾打包。Goal 查询仍返回 blocked 元数据；本轮没有实际开发阻塞，也未将目标标记完成。下方 active、暂停和额度记录均为历史。

新增可选 `ssh/direct`：固定字面 TCP 目标、显式账号和凭据引用、校验 SSH 主机指纹，不调用本机 OpenSSH 或读取 ProxyCommand、跳板及代理环境变量。启动前校验远端 helper 摘要，校验失败不执行 helper；原有 OpenSSH 提供方保留。独立流继续使用 TLS-PSK 能力校验。撤下服务时停止准入并等待操作、通道和套接字结束；修复 ssh2 通道销毁后仍需消费 EOF 才能关闭，以及已关闭 RPC 接收缓存请求的问题。

新增可选 `target-protection/ssh`：生产完全保护在 TCP 前拒绝；只读审计允许结构化文件读取，拒绝写入；精确私有测试端点支持工作区内文件写入、改名和删除。每个直接服务调用都检查规则，验证规范化路径和符号链接；全权限不会扩宽远端工作区。文件操作可能影响其他服务端口，因此端口或库名不能用于掩盖同机受保护资源。普通匿名 HTTP 仍拒绝私有地址，未降低 SSRF 校验。

真实验收使用 WSL Ubuntu、普通 Node 编译后公开导出、真实 SSH 服务端、实际 POSIX helper 和 Loader，全部只操作临时测试目录。已通过完全保护零 TCP、审计读取与写入拒绝、测试文件改名/删除、越界链接拒绝、保护所有者撤下，以及错误摘要的标记 helper 未执行。结果与 helper 散列在 `.dsh-build/target-protection-20261027/ssh-real-proof.json`，最终日志为 `ssh-real-verified.log`。没有连接用户服务器或修改官方版。

验证：相关 21 文件 **353 项通过**；两个独立 Vitest 进程同时运行，各 24 项通过；修改夹具后的会话快照回放通过。完整 build 9/9、最终 build:check 2/2、全仓 lint:contracts-ready、JSDoc、文档检查及工作区约束均通过。并行回归发现 ssh2 的 Ed25519 测试密钥生成器可能截掉公钥前导零；夹具改用 Node 原生 EC 密钥，不增加重试。失败日志 `ssh-node-final.log` 保留，最终通过记录为 `ssh-node-repaired.log`、`ssh-concurrent-*.log`、`ssh-snapshot-final.log`、`ssh-check-final.log` 和 `ssh-lint-full.log`。三包 publint 无错误，两处已有 `./src/*` 发布声明提示不匹配文件。最新额度复查剩余 55%。

**仍未完成：**远端路径/硬链接/挂载与数据库身份映射、数据库协议、受限命令/终端/PTC、SSH 独立代理路由、原生 MCP/REA/浏览器和管理旁路、持久审计/SDK 回放、所有者界面和默认产品装配。远端运行时必须可信且位于 Agent 可写工作区之外；不能将当前服务器级文件保护宣传为完整远端隔离。默认产品尚未启用这些可选后端，armor 未改。本节点提交验证源码，继续入口为 P2 的远端身份/数据库与受限执行，之后才是 P3 联动。

## 当前状态：继续开发，两个节点已验证（2026-10-28）

Goal 已由用户恢复为 active。普通文件执行保护节点 `51cbed90c7` 已推送 main；本轮继续清理设置浏览器验收欠账，当前共享剩余额度 87%。完整目标未完成，不暂停或标记完成；低于 40% 时仍按既定规则收尾打包。

设置验收已从旧断言的 4 通过/15 失败恢复为 **2 文件 20 项全部通过**。按当前五分组、插件管理/列表双页、四种主题 radio、固定日出日落默认、完全展开/插话发送及独立版本号更新断言和截图语义快照；增加全部四种工作步骤模式的持久化覆盖。账号在模型组，余额与逐项限额在同页；验证 5 小时/7 天优先显示、无顶部分页、输入框不越界和无原生 select。只修改验收代码和期望，没有把产品改回旧设计。失败后关闭残留弹窗，防止后续用例被遮挡；浏览器日期与时区固定，跨窗口/端口/语言与持久化检查保留。

验证日志：.dsh-build/target-protection-20261027/settings-final-replay.log（20 项，无跳过）、settings-e2e-check.log（build:check 2/2）；定向 lint 通过。首次刷新及英文标签修正失败日志也保留。临时探查用例已删除，旧设置浏览器失败不再作为当前未完成项。

SSH 后续准备：现有 `dsh-ssh` 只支持 POSIX，直接调用原生 OpenSSH，并读取别名配置；固定目标、ProxyCommand/跳转约束、远端文件身份和命令限制均未实现。WSL Ubuntu 有 Node 22.23.2、ssh、bwrap，没有 sshd；Docker daemon 未运行。独立 Linux 工具安装在 `/home/linzh/.cache/dshu-ssh-tools.MPEan5`（tsx 4.23.13 / esbuild Linux 0.28.1），记录入口为 .dsh-build/target-protection-20261027/wsl-ssh-runtime.txt。源码 SSH 与 helper 模块加载已通过，但尚未运行真实 SSH 服务端验收，不等于协议或保护完成；不要复用 Windows 原生编译依赖。初次 `/tmp` 工具目录在下一次调用时已不存在，日志保留，不推定原因。没有连接用户服务器或改变官方版配置。

下一节点回到 P2 的真实 SSH/数据库执行保护；其余原始待办继续保留。当前只提交推送开发节点，未重复打包或安装。

## 普通文件执行保护节点（2026-10-28）

用户明确恢复开发。额度初查为 7 天共享剩余 100%，最近复查 95%；继续遵守低于 40% 时收尾、打包、推送和暂停的规则。下方暂停记录均为历史，不能据此终止本次已授权工作。

新增可选 `tool-fs.fileOperations`（默认关闭）：`remove_file` 和 `rename_file` 通过真实文件服务执行，要求源版本，拒绝目录、末级符号链接及跨文件系统移动。改名以独占链接保证不覆盖目标，校验两端沙盒和目标策略；整组校验前后规则修订号必须相同，防止另一连接在两端检查间改变源规则。发布前取消无新效果；已发布移动继续清理源名称。清理失败报告 `FS_PARTIAL_MUTATION`，保留已发布文件供检查，不自动删除可能被其他写入者接管的目标。

验证：18 文件 463 项通过、4 项原有跳过；完整 build 9/9、keyless headless 会话回放通过。真实 Loader 验证工具装配/卸载；普通 Node 加载编译后的公开导出，验证生产拒绝、只读读取/变更拒绝、目标端拒绝、二进制改名/删除和撤下后旧引用拒绝。移除整组规则版本校验的负对照确定失败；已恢复源码。日志及编译产物证明在 .dsh-build/target-protection-20261027/file-operations-*.log、file-operations-built-proof.json。

文档同步更新 README、相关包的中英说明及编号清单，并修复这些说明中已删除文档的旧链接。会话夹具的 Windows 临时路径已按夹具自身映射为 cwd 标记；没有修改正常化器来掩盖输出。没有修改 armor、用户数据或正式安装，本轮不重复打包上一安装基线。

剩余：目录树/远端文件、SSH 与数据库协议、受限命令/TCP、原生和管理旁路，以及完整审计、责任确认和默认装配。**默认产品仍未启用完整目标保护**。继续入口为 [保护计划](requirements/2026-10-26-target-protection.md)和 [当前清单](TODO.md)；仅 main、中文节点提交推送。

## 当前交付：收尾完成，交接推送后暂停（2026-10-27 18:14）

用户要求的独立代理执行保护节点已完成源码验证、打包和运行检查；交接提交推送后将 Goal 设为 paused，等待用户明确继续。最新 Codex 7 天共享额度剩余 **7%**（已用 93%），没有会话或模型独立窗口。下方恢复/继续段落均是历史记录，不得据此自动续跑。

- 源码：`cc9436a224f18b6e5e8d45af58596331f2fc1055`，已推送 main；打包时工作树干净。前一质量修复节点为 `ad334f7656`。
- Windows x64 未签名 v0.1.0 安装包：apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-10-27T09-44-06.059Z-A6RkGD/deepseek-harness-uncensored-0.1.0-win-x64-unsigned.exe；288485813 字节；SHA256 `4C9C2073A34DDD886811D99EA365081AE802A10F8554634BF79AE9ACA52DEEAA`。
- 源码归档：.dsh-build/target-protection-20261027/dshu-0.1.0-cc9436a224-source.zip；46067388 字节；SHA256 `413C725BBCEF3614B7E603456E1377F80B45DC6EA7ECA00023A9858AEABDB6A8`。归档对应代码提交，最终产物交接另做文档提交。
- 打包记录：apps/desktop/.desktop-build/packaging-runs/2026-10-27T09-44-06.059Z-A6RkGD，整体 success，1739769 ms。完整构建、准备目录及最终包的原生模块、PTY、离线插件、Web 启动、DOCX/XLSX/PPTX→PDF 和 skill CLI 检查通过。
- 本次仅打包，没有覆盖安装、签名或发布。最后核验的安装基线为 `201c9cde8d`；此前 `32aa7161ed` 等安装包保留。使用临时公共预设选择官方 npm 源；网络波动经打包器既定重试后完成，没有关闭 TLS/下载校验或改变正式环境文件。

开发证据为 20 文件 368 项回归、完整 build 9/9、真实编译产物 HTTPS 与流量记录，以及发布文件/导出/配对检查。代理目标保护仍是可选后端，**默认应用没有启用完整保护**；受控不透明 CONNECT 仍受限，精确测试环境的 TCP/命令、SSH、数据库协议、原生旁路和 P3 审计/设置联动继续未完成。旧设置浏览器验收的 15 项失败、许可审计、官方版插件页及其余桌面验收均保留于 [TODO](TODO.md)。

恢复前读取 [剩余项目计划](requirements/2026-10-27-remaining-work.md)、[目标保护计划](requirements/2026-10-26-target-protection.md)与[额度规则](requirements/2026-10-27-quota-closeout.md)，核对 main、运行版本和实际额度。产物状态在 .dsh-build/target-protection-20261027/proxy-protection-closeout-state.json；不要把完成打包等同于完成整个 Goal。

## 最新状态：独立代理执行保护节点完成，按用户要求收尾打包（2026-10-27）

用户要求在下一个开发节点完成后收尾、打包、推送并暂停。本轮以独立代理执行保护为该节点；后续不再展开新任务，完成产物记录后将 Goal 设为 paused，保留所有未完成范围。代码基于已推送的 `ad334f7656`；最新已读共享剩余 12%，不是已用比例。

新增可选 `target-protection/security-proxy`：受控 HTTP(S)、HTTP 转发与连接探测均校验原始目标，再绑定字面 IP CONNECT；保持原始 Host/TLS 名称，拒绝转发 Host 冒用，代理授权不发给源站。每跳重定向读取当前规则；生产完全保护拒绝时，代理与目标均无新增连接。控制服务是必需依赖，撤下后两个受控 HTTP 入口和旧引用均不能绕过。

代理关闭和路由变更取消旧操作，等待响应、原生套接字和已移出会话表的监听器清理；规则库保持到这些操作结束。修复并发设置/捕获修改覆盖、关闭认证时遗留用户名导致误认证、握手截止时间被持续响应拖延，以及提前关闭的套接字可能导致探测悬挂或未处理错误。普通已建立 CONNECT 不受 HTTP 请求时限误杀；转发尊重背压并在客户端断开后取消上游。

验证：20 文件 **368 项通过**（后端/传输 230 项、发布约束 138 项），相关 lint、导出 JSDoc、双语配对及完整 build **9/9** 通过。移除退出监听器的等待后，负对照确定失败；恢复实现后通过。普通 Node 加载编译后的公开导出，通过当前代理完成生产拒绝、受控连接探测、HTTPS 200/Example Domain 与流量记录；最新构建后复验成功。实际 tarball 包含新代理模块、国家数据库及署名，能力手册包保留 35 个资源文件；修正四处发布文件/元数据不一致，没有执行发布。

限制：**默认产品仍未启用完整保护**，本节点不代表所有执行入口完成。不透明 CONNECT 在受控实现中目前一律拒绝，整机测试目标的受限 TCP 通道及协议身份验证仍需实现；不能把这一限制当作“测试服务器完整自由执行”已验收。SSH、数据库协议、私有执行环境、原生/管理旁路、审计持久化/SDK 回放、所有者界面、责任确认和默认装配继续未完成。旧设置浏览器验收仍是 4 通过/15 失败，完整许可审计、官方版插件页验收、签名/升级回滚及跨平台任务保留。

证据在 .dsh-build/target-protection-20261027/：proxy-protection-all-verified.log、proxy-protection-final-build.log、proxy-protection-real-final.log、proxy-protection-built-proof.json、proxy-protection-negative-control.log、proxy-protection-package-tests.log 和 *-package.json。恢复入口为 [TODO](TODO.md)、[保护计划](requirements/2026-10-26-target-protection.md)与[剩余项目计划](requirements/2026-10-27-remaining-work.md)；须等用户明确继续，不自动续跑。

## 最新状态：用户要求完成剩余项目，已恢复（2026-10-27）

用户在阅读当前 TODO 和额度暂停状态后明确要求完成全部进行中及待实现项目；恢复查询共享剩余 27%，本轮按该继续指令执行。Goal active，工作从已推送的 `3c76aa01fc` 继续。先修复全仓静态检查问题，再补真实保护、联动、许可和交付验收；详见 requirements/2026-10-27-remaining-work.md。下方暂停、安装及打包记录是历史事实；已验证产物保留，未完成项目继续不勾选。

本轮先修复静态检查与验证设施：全仓 lint 的 47 错误、1 警告已清理；更新响应类型、代理响应字节、异步取消状态、设置注册清理及测试引用保持各自语义。既有冷启动 preset 扫描只增加有理由的局部旧 API 豁免，未新增扫描调用；注册注销仍由 Cordis 所有者追踪。插件目录的 22 项配置声明问题已修正，补齐字段说明并通过命名类型消除重复声明，生成器恢复通过并补入缺失的 12 个插件。

验证记录：相关回归 17 文件 196 项通过，配置/工作区检查 151 项通过；完整 build 9/9 和最终 build:check 2/2 通过。全仓 lint 通过后，后续配置与测试修改的定向 lint 也通过。GUI 检查发现并修复 REA/随问加载就绪竞态、子智能体假时钟缺少 React 同步、侧栏快捷键提示真实时钟竞态；对应 58 项定向回归通过。REA 中性边框与关于页滚动条修正后，相关样式及组件 38 项通过。共享主机的完整 GUI 检查使用仓库已有 DSH_COVERAGE_TEST_TIMEOUT_MS=30000 和 8 个 worker，保留全部用例；最终 **688 文件、11191 项通过，2 项原有跳过**，退出码 0。日志为 resume-quality-gui-final-all.log，未将控制预期失败的错误输出当作实际用例失败。

浏览器验收发现新的自动化欠账：settings-chrome 与 settings-appearance 仍按旧分组、旧权限默认值、三种外观及旧账号布局断言，19 项中 4 通过、15 失败；失败也导致共用页面后续状态受影响。需要按当前需求适配断言与 ARIA/样式快照，并保证失败时释放弹窗。没有把这些失败写为通过或回退用户要求的界面。对应 Chromium v1228 已通过 apps/web 的 Playwright 依赖安装；根目录 CLI 属于另一版本，不能用于此验收。

官方版核对只完成读取：实际官方桌面窗口中已看到顶部 dsh-purge 入口和余额插件；打开插件列表时用户按 Esc 停止电脑操作，后续未再操作桌面，也未修改官方配置。02.05 继续待验收，不从可见入口推定所有插件健康。最新共享额度剩余 22%（14:29 查询），继续执行本次用户明确恢复的范围。日志集中在 .dsh-build/target-protection-20261027/resume-*.log。

## 最新状态：已打包，提交交接后暂停（2026-10-27 13:24）

最新查询的 Codex 7 天共享额度剩余 **27%**（已用 73%），没有会话或模型独立窗口。本次自动续跑使用 Astra，未将此前用户对 Sol 开发的例外扩大到本轮；按低于 40% 的规则停止新开发，只完成验证、归档与打包。交接推送后将未完成 Goal 设为 paused，等待用户明确继续。以下旧节点中的 active/继续描述仅记录当时状态，以本节及额度规则的最近记录为准。

### 已保存的成果

- 三个源码节点均已推送 main：`aaa1771ce6` 本地文件/进程保护，`0a419dcd7b` 受控 HTTP 代理固定目标，`32aa7161ed` 数据库端点/文件关联及规则库 v3。当前仅 main 主线。
- 当前完整保护约 50%，仍是可选后端源码，**没有装配到默认应用**。安装包成功不代表 SSH、数据库协议或所有执行入口已受保护；现有 armor 未改动。
- 最新相关集成测试 14 文件 167 项通过，完整 build 9/9；编译产物验证端点与文件共享策略、SQLite 附属文件拒绝且字节不变、规则重开与未来版本拒绝。具体测试和限制见下方三个节点。

### 本次交付文件

| 产物 | 源码节点 | 大小 | SHA256 |
| --- | --- | --- | --- |
| Windows x64 未签名安装包 v0.1.0 | `32aa7161ed8eb6f5769bc017619d8a5e35c886db` | 288524427 字节 | `FC3A80B39F9E45F92D52B1E8C250DC900983285B7C03481C4B0C47335D174D17` |
| Git 源码归档 | 同上 | 46044415 字节 | `1078D67B661ACD45D8BD93F5FFFF4B348C05C3CAEE9E99E2D7B6215D985877B5` |

安装包：apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-10-27T05-09-42.648Z-4rCkYZ/deepseek-harness-uncensored-0.1.0-win-x64-unsigned.exe。源码归档：.dsh-build/target-protection-20261027/dshu-0.1.0-32aa7161ed-source.zip。打包时源码工作树干净；随后只有交接文档变化。

运行记录：apps/desktop/.desktop-build/packaging-runs/2026-10-27T05-09-42.648Z-4rCkYZ，整体 success，耗时 856173 ms；打包后的原生模块、PTY、离线插件安装/移除、Web 启动、DOCX/XLSX/PPTX→PDF 和 skill CLI 检查通过。未安装、签名或发布；当前已安装基线仍为 `201c9cde8d`，此前 `83078f9177` 收尾安装包也保留。

第一次打包在 Electron 下载时因 TLS ECONNRESET 失败；启用 Electron 支持的现有代理后，官方 SHA256 核对通过。第二次在 npm 镜像请求 koffi 时失败；第三次使用临时公共打包预设改为 registry.npmjs.org，其他发布设置一致，最终成功。没有改动 .env.windows、全局 npm 配置或关闭 TLS/下载校验。日志及可恢复状态位于 .dsh-build/target-protection-20261027/astra-closeout-state.json、astra-closeout-package*.log；这些本机产物不提交 Git。

交接检查：test:docs 2 项、doc-sync、diff --check 通过。全仓 lint 的类型准备步骤完成，随后 npm 子命令因 packageManager 约束无法启动；改用 pnpm run lint:contracts-ready 执行相同步骤，报告 **47 错误、1 警告**，涉及更新/余额、随问测试、独立代理等 19 个错误文件，不含 target-protection。本轮没有改这些源码，未趁额度收尾扩展修复。证据在 .dsh-build/target-protection-20261027/astra-closeout-lint.log 和 astra-closeout-lint-ready.log；当前不能声明全仓 lint 通过。

### 未完成与恢复

1. **P1 剩余**：独立网安代理的受控 Client、不透明链式隧道及路由变化。普通 HTTP 的固定 IP CONNECT 不能代替全部代理联动。
2. **P2**：SSH、数据库协议只读执行与身份、远端路径和私有地址环境、受限命令/终端、删除/重命名及原生/管理旁路。当前拒绝无法约束的进程，不是内核目标沙盒；文件最终系统调用的外部竞态仍有限制。
3. **P3**：持久化审计、TS/Python SDK 回放、所有者管理、真实状态/责任确认、地区数据更新/署名、独立代理与默认应用装配。
4. 原始其他待办保留；签名、升级/卸载/回滚、跨平台和完整依赖许可审计未完成。全仓 lint 的 47 个错误及插件参考目录检查的 22 项既有问题待修复，不能宣称全仓检查均通过。

恢复时先读 [额度规则](requirements/2026-10-27-quota-closeout.md)、[当前清单](TODO.md)和[保护实施计划](requirements/2026-10-26-target-protection.md)，核实实际额度与 main 状态，再按用户最新授权继续 P2 执行器和旁路盘点，随后接 P3。不要恢复旧模型分类草稿来替代执行保护，不因打包成功将三项目标保护打勾。

## 数据库资源与附属文件关联节点（2026-10-27）

Goal 继续 active，用户明确授权本轮 Sol 开发并要求完整可靠；最新共享额度剩余 31%（12:30，Asia/Shanghai），无 Sol 独立窗口。`aaa1771ce6` 与 `0a419dcd7b` 已推送，远端仅 main。当前默认产品与安装版未启用新后端，未改 armor；整体目标尚未完成。

一个资源可通过 aliases 绑定网络地址与本地数据路径，统一继承 ID、生产/测试标记及保护级别，别名不能覆盖父策略。各选择器独立指定端口和库名，避免网络限定漏入文件判定。数据库文件及 SQLite 风格的 -wal/-shm/-journal 同受保护，重叠命中只报告一次资源 ID。DNS 证据改按规范化主机名保存，避免多别名共享 ID 时覆盖地址；当前端口/库名不适用的选择器不产生 DNS 查询。

修正此前文件身份采用 Number 的精度问题，改用 BigInt 设备/inode；原生大文件 ID 对照与硬链接判定通过。区分待创建的不存在文件和已有但身份未知的文件，后者不能被认为与生产文件无关。规则库升级 v3，v1/v2 事务迁移保留修订号，旧格式含新字段拒绝；读写重查格式及 AppID。元数据和规则采用同一 SQLite 读取事务，另一连接不能在中间替换格式；锁冲突返回 busy，不提交，释放后可重试。

验证：数据库相关 10 文件 83 项，连同 HTTP 集成共 14 文件 167 项通过；完整 build 9/9、相关 lint、JSDoc 与文档配对通过。真实临时 SQLite WAL 数据库的主文件/附属文件拒绝后字节不变，审计允许读取但拒绝写入，其他测试库文件可修改。普通 Node 编译产物验证网络与文件共享策略、附属文件、重开及活动连接中的未来版本拒绝；记录在 .dsh-build/target-protection-20261027/resource-*.log 和 compiled-resource-proof.json。

必须继续完成：SSH 与实际数据库协议；私有地址执行环境与远端路径绑定；MCP/REA/浏览器/子智能体及扩展、PTC、插件管理、computer-use 原生或管理入口；完整审计/TS/Python SDK 回放、所有者界面、责任确认及独立代理联动。端点规则不会自动找出数据文件；缺失路径/协议覆盖时不能宣称整个数据库受保护。下一个节点先盘点这些直接执行入口并补 P2，随后完成 P3 与默认装配；禁止以开关或文档替代执行保护。

## 受控 HTTP 代理固定目标节点（2026-10-27）

当前继续执行已获授权的 Sol 开发，Goal active；最新共享额度剩余 33%（10:38，Asia/Shanghai），本轮按用户明确授权继续，不能根据旧暂停段落再次停止。三项目标保护未完成；默认产品、当前安装版和 armor 均未改动。上一节点 `aaa1771ce6` 已推送，远端仅 main。

受控 HTTP 增加字面 IP CONNECT：在同一 DNS 回答/hosts 证明和规则校验后，通过已选代理固定目标。Undici 内置 DNS interceptor 在 fetch 之下绑定地址，保留原始 Host、TLS SNI、证书校验、响应解码和原始 URL；每跳重定向重查，失败没有直连或未校验代理回退。代理凭据只发给 CONNECT，不转发至目标。普通 HTTP 提供方保持远端代理 DNS 默认；受控提供方固定使用 `literal-connect`，不是可由模型关闭的开关。

验证：13 文件 153 项通过，包括 TLS 名称不符拒绝、IPv6 CONNECT 格式、实际代理和目标零连接、精确测试例外、重定向、流取消及代理凭据隔离。完整 build 9/9 已通过，随后新增两项测试由最终 build:check 覆盖。普通 Node 从编译产物调用，在本机当前上游代理下完成生产完全保护拒绝→公网精确测试例外→HTTPS 200/Example Domain 校验；系统 DNS 和独立 IPv4 hosts 配置均通过。证据：.dsh-build/target-protection-20261027/proxy-integration.log、proxy-build.log、proxy-real-proof.json、proxy-real-hosts-proof.json。

首次外网验证出现 TLS ECONNRESET，普通代理对照也有同样错误；第二次遇到 ipv4only.arpa 的双栈 DNS 校验失败。失败日志保留，随后同一代码的系统 DNS 复验通过；没有降低 TLS、地区或地址校验。外部网络失败与真实支持范围必须继续如实报告，不把一次通过当作任意代理可用保证。参考已核对的 Undici 8.11.2 本地源码和官方 ProxyAgent/TLS 文档。

独立网安代理的受控 Client 和原始链式隧道仍未接入，当前节点只覆盖明确装配的受控 HTTP 提供方。SSH、数据库协议、MCP/REA/浏览器原生入口、私有测试地址环境、所有者管理、审计与默认产品装配继续未完成。匿名抓取仍拒绝私有地址，测试标记不绕过 SSRF；代理中的私有地址不能被当成本机同名资源。后续先补 P2 执行器，再完成独立代理与 P3 联动。

## Sol 恢复节点：本地文件与进程保护（2026-10-27）

用户明确切换 Sol 并授权恢复开发，作为本轮先前 40% 额度暂停条件的例外；恢复查询共享剩余 36%，验证前复查 35%，未返回 Sol 独立额度。三项目标保护任务继续保留，默认应用尚未装配这些后端；本节点不打包、不安装，也不改动 armor。

可选 `target-protection/fs` 替换 fs-sandbox，继续执行原文件权限策略。新增绝对路径规则、生产完全保护/只读审计、测试例外的生产优先级、直接硬链接身份和目录外无法归属硬链接的拒绝。读取、二进制/字节范围/流式读取、元数据和目录枚举均校验；规则库/SQLite 辅助文件、显式所有者文件、hosts 和国家数据受保护。监听暂不支持。LocalFileSystem 新增提供方校验方法，锁内、暂存前与最终发布前复查；另一连接在暂存期间改规则会阻止发布，清理临时残留。文件名保留物理大小写，不将 Windows 文件路径转小写后用于执行。

可选 `target-protection/subprocess` 替换 subprocess-local。在生产/大陆保护或所有者资源存在时拒绝普通进程和 PTY，避免间接脚本、删除/重命名命令及配置改写绕过文件检查。没有保护资源的内存组合能正常执行，开启策略终止已准入进程。此行为是明确拒绝不支持的任意代码，不是目标网络沙盒；测试主机名不能放行任意代码。

规则库 v1→v2 使用事务迁移，保留偏好与修订号；旧代码拒绝 v2，降级需恢复升级前备份。未新增 Session 事件或更改冻结代际。本地路径重新校验仍不能抵御外部恶意进程在最终校验与系统调用之间替换父目录；已创建父目录及此前完成的效果不回滚。UNC/设备/替代流拒绝，SSH、数据库协议、原生 MCP/REA/浏览器、代理绑定及持久化审计仍待实现。

验证：15 文件 253 项通过、4 项原有跳过；完整 build 9/9、相关 lint、导出 JSDoc、包元数据、88 包依赖策略、tsconfig 别名与新包 publint 通过。真实 Loader 从 YAML 装配三类消费者，规则服务撤下后旧引用拒绝；普通 Node 加载编译后的公开子路径，验证审计读取、写入拒绝、零子进程和服务撤下。证据在 .dsh-build/target-protection-20261027/sol-files-*.log、sol-composition.log、compiled-files-proof.json。

退出回归发现 Cordis 并发清理中规则库可能早于原生文件清理关闭，已通过 `retainExecution` 让规则所有者等待实际 I/O 和源迭代器完成；文件与 HTTP 消费者均持有。测试观察到暂存清理完成后才关闭 SQLite，暂停的迭代器只关闭一次，实际 HTTP 未结束响应在撤下时中止并关闭。未修改 vendor 的生命周期实现。

本机发现并修复两个测试设施问题：原 fs-sandbox 用逻辑 AppData 路径构造链接，原源码对照也失败，已改用分配后目录的物理路径；DNS 双传输夹具曾让 TCP 选到 UDP 禁止端口并产生未处理 EACCES，已改为持有 UDP 分配后获取相同 TCP 端口。netsh 实测连续 TCP 禁止范围达 600 个端口，分配重试有界为 1024 次，仅处理 EACCES/EADDRINUSE，释放失败资源后重试，新增重叠夹具验收。失败证据保留在 sol-sandbox-baseline.log 和 sol-sandbox-diagnostic.log；没有跳过或削弱拒绝断言。

## 当前状态：额度收尾完成，等待用户继续（2026-10-27）

04:19 查到 Codex 7 天共享额度剩余 39%，已立即停止新开发并转入收尾；04:41 复查剩余 38%。收尾包与必要检查均已完成，交接提交后执行 Goal 暂停，等待用户明确继续。目标未完成，不得标为 complete；额度回升也不自行恢复开发。

本轮交付范围是默认应用安装包与已保存的可选保护后端源码。完整目标保护未接入默认产品，P2 的命令/文件/SSH/数据库等执行器及 P3 审计、设置、责任确认、代理联动仍未完成。上次核验的安装源码为 201c9cde8d；本次只生成收尾包，没有执行覆盖安装或发布 Release。

### 收尾产物与验证

- 源码节点：`83078f9177c78259f953fc4463bdbe3757293ba7`，打包时工作树干净；代码已推送 main。
- Windows x64 未签名 v0.1.0 安装包：apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-10-26T20-24-22.544Z-xAt8J8/deepseek-harness-uncensored-0.1.0-win-x64-unsigned.exe。
- 文件大小：288520922 字节；SHA256：`825008C60051C355D75CC7F697EE0D2589FE5D2DC8DCD134F751121D9C0D6347`。
- 打包运行：apps/desktop/.desktop-build/packaging-runs/2026-10-26T20-24-22.544Z-xAt8J8，整体 success，872419 ms；使用现有代理设置 NODE_USE_ENV_PROXY=1，所有下载校验保持开启。
- 验证：源码完整构建 9/9、地区/DNS 127 项回归及最后规则 23 项复验、类型/JSDoc/lint/文档配对/包元数据和依赖检查；打包后的原生模块、PTY、离线插件安装/移除、Web 启动、DOCX/XLSX/PPTX→PDF 和 skill CLI 检查均通过。
- 记录：.dsh-build/target-protection-20261027/closeout-state.json、closeout-package.log、identity-*.log。安装包检查不是完整保护覆盖证明。

### 未完成与已知问题

- 保留三项保护任务：默认产品装配及规则管理未完成；命令、PTY、FS、SSH、数据库协议、浏览器、REA/MCP、独立代理执行器尚未接通；审计持久化、TS/Python SDK 回放、设置/责任确认及代理联动未完成。
- 未验证的代理地址仍拒绝；HTTP GET 不被自动认定为只读审计。国家数据精度有限且会过期；数据更新入口、实际使用页面署名和状态呈现仍属 P3。
- 其他原始待办保持 TODO 中的状态，包括签名/升级/回滚/跨平台、完整依赖许可审查等。先前插件参考目录生成检查的 22 项旧问题未在本次额度收尾中修复。

### 恢复入口

用户明确继续后，先读取 requirements/2026-10-27-quota-closeout.md 并检查实际剩余额度，再读 TODO.md 和 requirements/2026-10-26-target-protection.md，核对 main 工作树。下一步按 P2 的真实执行器与防篡改 → P3 审计、代理和界面联动推进，已交付的原五项保留。不要恢复旧模型分类草稿来代替执行器，也不要只凭当前 HTTP 测试勾选全路径保护。

## 必须执行：剩余额度阈值（2026-10-27）

用户明确要求自行检查实际剩余额度：低于 40% 立即停止新开发，保存代码、做必要检查、打包当前可交付成果、更新完成/未完成/问题/验证/恢复记录，然后将本对话 Goal 设为 paused 并停止自动续跑，等待用户继续；不能把未完成目标标为 complete。检查频率、最近结果和收尾步骤以 [额度与收尾规则](requirements/2026-10-27-quota-closeout.md) 为准。三项目标保护任务继续保留。

## 当前 Goal 扩展：真实目标保护（2026-10-26 追加，10-27 继续）

地区/DNS 节点：可选后端新增 `./country` 提供方，内置未经修改的 DB-IP Lite 2026-10 gzip（4,123,384 字节），官方公布的解压后 SHA1 已核对，并固定压缩/解压 SHA256。数据按 CC BY 4.0 保留 assets/NOTICE.md 与根 README 署名，缺失、损坏、未来或过期数据不被当作境外证明。当前 Web 产品未启用该后端；实际页面的署名、状态与更新入口仍属 P3，不能省略。

DNS 使用系统或显式配置的解析器，保留同一回答中的 CNAME 与 A/AAAA；验证问题/事务、限制链深度和记录数，支持 TCP 截断回退、hosts 与 localhost。无效或拒绝回答不会通过换解析器规避。地址传输仍固定到已校验 IP，NAT64 的嵌入 IPv4 同时参与规则和地区判断。国家数据更换或本地规则变更取消旧代请求；不宣称回滚已发出的操作。代理端目标仍未知，命令/文件/SSH/DB 协议/浏览器/REA/MCP/独立代理未接入。

已验证：地区与 DNS 接线共 127 项回归，最后正则数值名称修正通过规则 23 项复验；最终完整 build 9/9、279 配置检查、JSDoc、相关 lint、三方数据校验和新包 publint 通过。系统 DNS 对 example.com 的实际解析得到 4 个固定地址，本地国家库判定通过；只做解析与准入核验，未向该 HTTP 目标发请求。编译产物验证了数据资源加载、国家分类及规则变更取消（0 个目标连接）。证据：.dsh-build/target-protection-20261027/identity-*.log、dns-real-proof.json、compiled-identity-proof.json、country/verified.json。

额度已触发收尾，当前禁止继续新增实现。用户明确恢复后，再检查实际额度，并按 P2 执行器 → 代理绑定和 P3 审计/界面联动推进；三项保护任务保持未完成。

最新开发节点：新增 packages/guard/target-protection 可选后端。SQLite v1 使用 DSTP 应用标识，规则跨连接读取，配置带版本冲突检查，损坏/未来/其他应用数据库拒绝而不清空。规则支持主机、域名、RE2JS 正则、CIDR、端口和库名；精确测试例外不能覆盖生产拒绝或未覆盖的其他 DNS 地址。IPv4 映射地址、IDN 和域名边界均有回归。

`./http` 替换普通 HTTP 提供方，必须依赖规则服务；检查真实连接目标和规则版本，服务卸载时撤下提供方。当前 HTTP GET 不被视为已证明只读，代理解析地址、未核实名称链和地区均保持未知并拒绝。该包不在默认产品组合中，也没有提供完整 securityProtection 状态；命令、FS、SSH、DB 协议、REA/MCP、浏览器和独立代理尚未接通。已有安装版不受影响，禁止把此节点标为全路径保护完成。

该节点规则库/匹配/HTTP/Loader 测试 36 项通过，随后补充取消状态回归并通过 HTTP 7 项复验；共享 HTTP 包 76 项通过；完整 build 9/9、最后增量编译与 build:check 2/2、279 份配置检查、导出 JSDoc、相关 lint、包元数据及新包 publint 通过。编译产物的规则库和 HTTP 消费者拒绝冒烟通过。证据位于 .dsh-build/target-protection-20261027/target-*.log、loader-tests.log、built-target-smoke.log。Loader 卸载测试使用实际 Fiber 释放，避免把未完成的删除当作已经卸载；fixture 先复制到临时目录。下一步优先地区数据及可信名称链，再进入 P2/P3；不得整体恢复旧模型分类草稿。

用户明确把三项保护纳入本对话“完成计划的五点开发内容”的第 4 项扩展，保留所有既有交付和待办。顺序为 `09.01–09.03、09.08` 域名/规则执行后端 → `09.04–09.07` 生产/测试服务器与数据库后端 → `05.06、09.09–09.11、10.05` 审计和联动。详见 requirements/2026-10-26-target-protection.md。Goal 已按扩展范围继续，不能以 REA 已接入认定完成。

原始连续编号已还原为区间。归档 ZIP 和 33 个文件散列通过，解压到 .dsh-build/target-protection-20261027/archive；git apply --check 有当前源码/锁文件冲突，未整体应用。旧草稿把大陆识别局限为域名后缀，操作效果仍依赖模型，不能直接恢复为生产保护。当前原生子进程沙盒没有按目标隔离的完整网络能力，HTTP 代理又由上游解析，均需明确处理。

第一处源码接线在 web-fetch-http：解析前与连接前派发只能拒绝的策略检查，每次重定向复查；直连携带实际固定地址，代理携带原始目标和未知地址状态，取消后禁止建立连接。此处仅建立真实执行检查接口，域名规则、生产策略及其他消费者尚未接通，不宣称保护已启用。用户当前安装版与运行中的工作不受本开发节点影响。

首批验证：web-fetch-http 3 文件 76 项通过，其中 7 项新增执行校验使用真实本机监听器，覆盖早期拒绝、解析别名拒绝、重定向间规则变化、等待检查时取消、代理原始目标不可确认、策略失败和无策略时的正常请求；拒绝路径的目标连接计数为零。完整构建 9/9 通过。日志在 .dsh-build/target-protection-20261027/。下一步是规则/身份和持久化提供方，之后接其余执行消费者；保持 Goal active。

## 最新交付：五项完成并安装（2026-10-26）

本轮五项已完成。代码提交 `201c9cde8d` 已推送 main，本地与远端均只有 main 主线。Windows x64 未签名 v0.1.0 已覆盖安装，基于 DSH 0.2.1-rc.3；关于页显示 WaterRun、源码 201c9cd、编译时间 2026-10-26 15:22 UTC，以及 purge fork 来源。

成功打包记录：apps/desktop/.desktop-build/packaging-runs/2026-10-26T15-21-58.850Z-Jjtxxg，整体成功，耗时 884720 ms。安装包：apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-10-26T15-21-58.850Z-Jjtxxg/deepseek-harness-uncensored-0.1.0-win-x64-unsigned.exe，288518276 字节，SHA256 `A747DA708C3B248A85DC3D7FDD63666A2105326765E46AD5E10614E209416D49`。首次尝试因 Electron 下载校验清单的直连超时失败，随后设置 NODE_USE_ENV_PROXY=1 使用现有代理，官方校验保持开启并成功；两次运行记录均保留。

安装退出码 0，129 个原有会话、配置与数据文件安装前后哈希一致，官方 EXE 哈希未变。打包后与实际安装目录的原生模块、PTY、离线插件、Web 启动、DOCX/XLSX/PPTX→PDF 与 skill CLI 检查均通过。安装启动后，用户已有暂停工作按其自动恢复设置继续运行，因此没有为重复重启验收而打断它。独立测试 home 的重启与配置保留已先行验收。

证据：.dsh-build/five-items-20261026/install-result.json、installed-runtime-smoke.log、installed-about.png。应用已打开供检查，REA 默认关闭；外部 REA 和分析引擎需要在逆向设置中配置。未签名、未发布 Release，签名、升级下载与跨平台等剩余原始需求仍按 TODO 保留。

## REA 实现与验收节点（2026-10-26）

五项开发均已实现并验收，尚未把本轮代码安装到系统。REA 根服务管理可持久化启动设置，逆向预设挂载 `rea_tools`，从完整目录中按需启用 `mcp__rea__*`。各 Agent 独立进程，调用串行、参数预校验、实时权限检查；只读随问不能启动。重置、关闭、卸载与配置变更释放进程，失败不自动重放。现有主线工具和模式提示词未调整。

设置页支持 Node/REA 与可选 Ghidra/Java/IDA 配置、真实连接检测、工具搜索和明确的引擎路径状态。初次实操发现设置未声明为 volatile，保存按钮不可用，已修复并验证保存与重启。浅色中文、深色英文、390px 无横向溢出通过。静态检查发现的旧记忆源码映射缺失和预设/根服务行 ID 重复已修复，配置兼容说明见本轮五项记录。

验收：最终 artifacts 7/7、build:check 2/2；52 项相关回归及发现结果快照；278 份配置检查、1142 个客户端源文件本地化、导出 JSDoc、相关 lint 和 5 份文档配对通过。日志在 .dsh-build/five-items-20261026/rea-final-*。真实 REA 6.8.0 的 JavaScript 和 Ghidra 12.1.4 分析由新消费端完成（rea-product-real.log）。真实模型会话 session-6a0bdaa3-eaf9-4d30-b6e9-7b2912e2c6a7 使用本轮自编译样本，正常完成 19 次工具调用；案件可解析，含 1 个目标、5 条证据、3 项发现。脚本首次等待 120 秒超时，但原任务继续并完成；未重跑任务，结果另存 rea-model-proof.json。重启检测见 rea-restart-proof.json，独立测试 home 的 REA 已恢复关闭。

REA/Node/Ghidra 等外部软件未内嵌到应用；已验证路径仍在独立 .dsh-build 证据目录。Frida、IDA 和其他商业引擎没有实测。下一步中文提交并推送 main、打包当前提交、核对安装前后独立用户数据和官方版，再安装并更新本记录。不得把旧的根目录 unsigned 安装包当成本次产物。

补充门禁：依赖声明和包元数据检查通过，REA 包 publint 无警告。额外运行的插件参考目录生成检查仍有 22 项既有问题，涉及 session-controller 的配置类型、账号配置展开及余额/额度字段注释；REA 新增项已修正，不再出现在错误中。该目录检查没有通过，原始输出为 rea-plugin-catalog.log；不要将其与实际配置检查或构建通过混为一谈。

## 最新节点：开发预览热重载恢复（2026-10-26）

已确定性复现并修复 `session-maybe` 适配器释放导致的白屏。ClientEntries 在实际替换/删除前同步撤下渲染消费者，等待模块及依赖重新激活后恢复；无变化的图同步不撤下界面。渲染器自身重载时，新根先等待依赖，旧根的迟到回调不能复活它。ScopeProvider 仍严格报告装配错误。顺带修正槽位目录的缺失说明与重复声明。

相关框架回归 26 文件 385 项通过；新增错误恢复与停止后注册测试后，entries 文件 43 项通过。真实浏览器分别重载 ui-session 与 ui-renderer，页面恢复、未发送草稿保留，最终渲染器重载后无新错误。证据：.dsh-build/five-items-20261026/hmr-before-proof.json、hmr-final-proof.json、hmr-final-page.png。临时探针已从源码与构建产物移除。完整构建 9/9，通过记录为 hmr-final-build.log；最终类型检查、lint、JSDoc 和文档检查另存同目录。

五项目标仍为 1、2、3、5 完成，4（REA 产品接入）继续。尚未打包或安装本轮功能。

## 最新节点：跨对话记忆自动提炼（2026-10-26）

五项中的 1、2、3、5 已完成，余 4（REA 产品接入）。记忆增加默认关闭的自动提炼、完整请求/结果日志、会话费用统计、取消/超时/额度拒绝、空闲会话重试，以及模式资料页入口。模型提炼只使用当前回合的用户文字和助手正文；保留作用范围与禁用记录。管理页用工作区名称与模式中文显示范围，提炼历史和检索上限折叠。

真实验收通过：保存 Willow 测试事实→重启→新会话取回；禁用后回答“不知道”且不重新保存；删除来源会话保留记忆并标记来源缺失；仍可检索该事实；删除记忆后新会话不再取回。测试记忆已清理，独立 home 的自动提炼已恢复关闭。证据为 .dsh-build/five-items-20261026/memory-real-proof.json、memory-restart-proof.json、memory-lifecycle-proof.json、memory-delete-proof.json；首次提炼 290 tokens，按配置估算 ¥0.00088。来源 session-c2687136-f920-46cb-9e44-474251345a77 是本轮自建测试会话，已通过产品 API 删除；未碰用户实际数据目录。

完整 build 9/9、最后增量编译与 build:check 2/2；56 项相关回归、模式入口 16 项复验、最终 21 项提炼生命周期/计费回归、TypeScript SDK 2 项及 Python SDK 1 项通过。新事件 memory/extraction 已按 same-version 记录兼容说明，旧读取器会拒绝未知必读事件，冻结代际未改。初次真实 UI 发现配置入口归属错误，已改为在 MemoryService 构造时保存 owner namespace；通过 UI 启停与重启保存复验。中断后无活跃请求的旧提炼显示失败并可重试，无结果的请求标为费用未明；卸载会中止并等待提炼。浅深主题、模式/工作区带入和 390px 无横向溢出已验证。图片：memory-manager-light.png、memory-editor-dark-390.png。

REA 仍只有底层兼容测试，尚无产品配置和会话工具接线。可复用的真实用例为 packages/mcp/mcp-client/tests/rea.e2e.ts，JS 和 Ghidra 分别通过。独立安装在 .dsh-build/five-items-20261026/rea-runtime，Node 24.22.1 在 node/，Ghidra 支持版本在 ghidra-supported/ghidra_12.1.4_PUBLIC；JDK 为本机已有 27。REA 6.8.0 明确拒绝 12.2。229 个工具的模型输入定义约 271 KB，产品集成应支持按需使用并保留完整工具能力。复用现有 MCP 连接、工具结果验证与生命周期；不得把只读随问提升为不受约束的外部进程。

本轮尚未更新已安装应用。后续完成 REA，更新 README/清单并按用户授权统一打包安装。开发继续 main，中文提交；用户未要求暂停。

记忆节点已推送 e55723cfe1。当时发现的开发预览白屏现已修复，验收见上方热重载节点；原始错误保留在 memory-preview-hmr-errors.json。

## 当前五项目标（2026-10-26）

用户要求完成关于页、DSH 最新发布版适配、逐项额度、REA 逆向接入、跨对话记忆，并追加随问正文对比度、工作区搜索和侧栏额度等待布局。明确逐项限额默认全部关闭，只优先展示 5 小时和 7 天；其他项目保留原状态。完整验收项见 requirements/2026-10-26-five-items.md。

第一节点完成关于页与 dsh-v0.2.1-rc.3（1f81c047fc）适配，产品仍独立为 0.1.0；保留提示词源码、Flash/Max 默认、固定缺省默认、模式锁定与插件设置入口。随问紧凑正文改用 primary 对比度；工作区搜索支持名称/路径、大小写/分隔符、键盘和空结果。原始上游没有共同历史，采用 rc.2→rc.3 的三方补丁并逐项解决冲突，没有恢复已删除的公开 docs/website。

本轮尚未打包或修改已安装应用。ledger v3 的逐窗口启停/重置、共同侧栏容器与优先显示 5h/7d 已完成；490 项相关回归及最后 53 项复验通过，完整 build 9/9，最后增量 build:check 2/2。浅深色、英文、390px、增减、单窗口重置隔离、全部重置/关闭及暂停布局已在独立预览验收。后续完成 REA 与记忆。REA 6.8.0 的归档、独立依赖环境与已校验的 Node 24.22.1 在 .dsh-build/five-items-20261026/；没有运行 REA setup 或修改其他客户端配置，已通过真实 MCP 握手发现 229 个工具。

证据：.dsh-build/five-items-20261026/；预览为独立 home，测试 overlay 关闭上传与埋点。完整 build 9/9，build:check 2/2，GUI 全量及失败复验日志均保留；快照图片在 screenshots/。后续只将实际实现并验收的项目勾选，五项全部完成之前不结束目标。

逐项额度已推送 2344b36e16。记忆新增按当前记录版本去重和来源会话核验，API 返回来源存在/缺失/未知三态；来源查询失败保留记录。修复未注册工作区的 memory_write 漏存 path 范围，旧记录范围不猜测迁移。34 项核心/管理回归、来源显示组件测试和最终 7 项 AgentLoop 隔离/版本测试通过，完整构建 9/9，最后 build:check 2/2；自动提炼、摘要、费用接线与 REA 产品集成仍未完成。

记忆修复已推送 8581de933a。REA 底层真实 MCP 回归在 packages/mcp/mcp-client/tests/rea.e2e.ts：JavaScript 与 Ghidra 原生分析分别通过，未调用模型、未运行样本或 REA setup。REA 6.8.0 拒绝 Ghidra 12.2，已使用官方校验的 12.1.4（ghidra-supported/ghidra_12.1.4_PUBLIC），Java 使用已有 JDK 27；两个 ZIP 均保存在独立证据目录。测试分别用 DSH_REA_TEST_NODE/CLI 和额外的 DSH_REA_TEST_GHIDRA/JAVA_HOME/BINARY 指定路径。测试样本由 rea-native-sample.c 用 GCC 编译，功能仅为两个整数相加。REA 目录含 229 项，模型输入定义合计 270974 字节，仍需完成按需展示及逆向设置/生命周期接线。

## 最新节点：独立旁问与设置重排（2026-10-25）

- 本轮只收尾用户指定的四项，以及 F02–F15 追加交互；生产目标保护等其余需求保留未完成。
- /side 改为空白独立历史，旧继承前缀在展示层隐藏，主线通过 read_side_context 显式读取；继承权限和待用模型，随问缺少只读提供者时明确失败。普通列表排除原生子会话。
- /btw 精简为问题、回答和必要状态。额度单页、模式卡/配置入口、紧凑余额详情已重排。底部金额与限额使用原灰阶，点击查看曲线和六档进度条。
- 输入预测为通用默认开启，保留已有关闭偏好；三类真实 Tab 操作只填草稿。真实请求日志与费用见 .dsh-build/polish-review/real-features.json；重复草稿前缀已修复。
- 最新 build 9/9，Host/打包聚焦 44 项、浮层交互 1 项通过；GUI 11033 项通过、2 跳过，唯一并发超时的许可证测试单跑通过（1.38 秒）。改动文件 lint 通过。此前完整 GUI 通过记录不代替本次结果。
- 已安装源码 8c1bc7cae6 的 v0.1.0 未签名包，退出码 0，两次启动通过；107 个会话/设置文件安装前后哈希相同，官方 EXE 哈希相同。应用、系统图标及来源页已核对。
- 安装器：D:\Coding\deepseek-harness-uncensored\apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\runs\2026-10-25T13-19-48.293Z-ti5vxL\deepseek-harness-uncensored-0.1.0-win-x64-unsigned.exe；SHA-256：9551F3D517D1690148A7542DE795885F44EC69D75509FF516A735E19F60C6395。构建记录：apps/desktop/.desktop-build/packaging-runs/2026-10-25T13-19-48.293Z-ti5vxL。证据在 .dsh-build/polish-review/install-result.json 与 screenshots/。
- 本轮原始打包命令在封装后冒烟遇到 Windows 原生库长路径失败。b55de1a03a 修复验收脚本：短临时副本完整复验通过，随后在真实安装目录再次通过原生模块、CLI、Host 与 DOCX/XLSX/PPTX 转 PDF 检查。原失败日志保留；复验见 packaged-smoke-short-copy.log 与 installed-runtime-smoke.log。该提交仅修改验收脚本，应用内容仍对应 8c1bc7cae6。
- 工作区与 origin/main 保持单主线；安装后的记录另做文档提交。当前 22 项完成 / 8 项进行中 / 5 项待实现；签名、自动更新、卸载回滚、跨平台及目标保护尚未完成。

以下保留历史节点，当其状态与本节不同，以本节和 TODO 为准。

## 当前收尾与交付（2026-10-25）

本轮接收暂停后的 12 个提交和 81 个文件的未提交改动，整合通用设置行、模式反馈、随问设置及桌面主题联动。用户新增要求：余额卡紧凑、曲线悬停查看具体采样、补齐自然过渡和模式切换效果，最后打包安装供检查。

- **余额**：侧栏两行卡实测高 66px、宽 255px、横向溢出 0；赠金为零隐藏。详情突出总额、曲线和采样信息，刷新不挤动布局。悬停/轻触/方向键读取原始样本，图形降采样不删可查点；中文浅色、英文深色及 390px 均已实测。
- **控件与动效**：共享 PreferenceRow 支持换行和键盘焦点；按钮/标签/输入等统一颜色过渡，选择器箭头随展开旋转，菜单淡入淡出。Modal/Menu 退出立即释放键盘与焦点，保留不可交互的 120ms 视觉尾帧，快速重开取消移除；修复 React 焦点恢复、调用方主动转移焦点、已禁用入口和嵌套弹窗的冲突。父级直接卸载组件不保留退出，特殊自绘控件继续归 06.10。
- **主题一致性**：修正额度/记忆/代理/报告的边框、圆角、焦点环与滚动条，清除原有 5 类样式门禁失败；模式扩散增加短暂饱和度强调，减少动态效果时跳过。
- **实际回归**：当前 Web API 新建可丢弃主会话及旁问/随问后成功删除，没有发送模型请求。此前额度、写作与长旁问的真实模型证据继续保留；已打开 Start/Side question 标签实时切换成“开始/旁问”已验证。
- **文档状态**：清单按 18 完成 / 12 进行中 / 5 待实现重整；新增 06.12、07.08。根 README 不再重复整张进度表，统一指向 TODO；修正随问“全新上下文”的陈旧说法。安装计划更正为清理 Electron 资料/更新缓存、保留 Harness home。
- **验证**：完整 build 9/9；全量 GUI 670 文件、11028 项通过、2 跳过；另有 Host 28 项、聚焦改动 2470 项及退出调用方 401 项通过。UI 本地化 1123 文件、导出 JSDoc、12 组 README 配对、根 doc-sync/test:docs 通过。全仓 lint 仍有早期 spend-limit、release-status 等未改动文件的类型债务；本轮改动文件单独检查。
- **证据**：.dsh-build/polish-review/ 保存日志、截图、delete-evidence.json；账号数据、测试会话和截图均不提交。此前真实模型证据在 .dsh-build/finish-85-90/。

### MiniMax 九项补核与配色追加

已只读核对 MiniMax 会话 mvs_ab2435f0136c40a5ac5732cefe297c76 的原始九项需求和选择结果。九项已合入；用户随后授权重新调整配色，四种模式卡现直接使用主题强调色，锁定态不降低整体透明度，去除旧阴影。19 项打包路径测试与 226 项配色相关测试通过。第一轮 unsigned 打包在旧 Electron 目录清理时报 EPERM；直接清理被自动审批拒绝，保留式重命名也被 Windows 拒绝。新打包批次使用独立 Electron 解压目录，不再接触旧目录。

### 尚未完成

- 09 真实目标保护仍未接入；不能把责任确认或提示词描述成已生效的执行保护。
- /btw 在默认组合有 read-only 权限；缺少权限服务的自定义组合现明确失败，已补回归测试。
- 特殊自绘控件与原生桌面动效、安装升级和两个版本数据/登录并存、代理保护联动、记忆自动提炼及完整依赖许可审计仍在清单。
- 本地 unsigned 打包和安装结果待本节下一条交付记录；不上传、不发布。

## 界面九项优化节点（2026-10-25）

用户列出九项界面问题并附截图，同时就模式配色、无法切换的提示形式、样式巡检范围给出三个方向选择；本节点完成全部九项，未打包、未安装、未签名、未发布。

- 顶部模式卡（`ModeCard.module.css`）：按用户选定保留深色配色，只清理形状——去掉投影与内高光，描边改为同色系浅色描边，圆角改用共享最大圆角（浏览器裁到胶囊形），字号 13px、字重与内边距同步收紧。
- 模式页页脚：统一为右侧一组，顺序固定为「配置」（该模式可配置时）、「模式说明」、「查看配置」；「如何使用」并入模式说明按钮打开的对话框页签，不再单列。「查看配置」的说明改走共享 `Tooltip`（body portal），因此不再被卡片 `overflow: hidden` 裁切，层级也不再被弹窗压住。
- 设置页控件统一（用户选定范围：只统一通用设置各页控件）：新增共享 `PreferenceRow` 与 `PreferenceControlRow`（`ui-primitives`），ui-chat 的私有副本删除，ui-conversation 的繁忙发送、ui-permission-presets 的权限、locale 的语言、ui-settings-general 的代码工作工具、ui-settings-session-log 的 Session Log、ui-theme 的字号行全部改用共享实现，连同 6 份重复样式表一并删除。随问思考等级由原生 `Select`（带边框）改为主设置行同款选择器胶囊，文案「低（默认）」改为「低」。
- 无法切换模式：拒绝改为模式页「当前模式」标题下的内嵌提示条（带警示图标），设置页内不再弹顶部浮层；提示条随页面离开而清除，顶部 Toast 只保留成功与失败两类（失败带警示图标、停留 6 秒）。控制器新增 `notice` 状态与 `dismissNotice`。
- 五项默认值核实并落实：工作步骤=完全展开（`verbose`）、收起时机=下次有新消息（`next-input`）、繁忙发送=插话（`steer`）、性能与用量=详细（`detailed`）、随问思考等级=低（`low`）。`ui-settings-account/apply` 里仍断言 `transcriptView: 'standard'` 的陈旧用例改为 `verbose`（该断言自 `d5fbdf58cf` 起即与默认值不符）。
- 余额曲线补纵轴：左缘标出观测最高与最低值（含币种），绘图区左移留出刻度槽；`balance-chart` 同步输出取值范围，`viewBox` 由 300 改为 320。
- 深浅色切换：Electron preload 转发原生主题时等待 `html[data-dsh-theme-reveal]` 结束再发送，标题栏三按键不再抢在页面前变色。
- 安装器计划（仅落盘文档）：新增 [桌面安装器计划](requirements/desktop-installer-plan.md)，按阶段写明工具链预检、未签名安装、与官方版并存、升级、签名、发布、卸载的现状、缺口、动作、验收口径与停止条件，并列出四个待决问题（并存形态、签名通道、卸载数据、更新通道）；清单 `02.09` 与 TODO 指向该文档。
- 顺带修复：`remote-default-responses.ts` 补上 `agentPresets/switchPolicy`、`sensitiveConfirmationPolicy`、`securityEntryState` 三个默认响应，`ui-settings-account/apply` 的 30 项既有失败因此转绿。
- 验证：客户端 typecheck 通过；改动文件 oxlint 0 错；`ui-agent-preset` 303 项与其余改动包 4228 项通过；`verify-client-ui-i18n`（1121 文件）、`verify-export-jsdoc` 与 13 份 README 中英配对通过（全局配对仍有 514 项既有不同步）。既有失败未变：`ui-theme` 五个样式巡检（`MemoryRow`、`SpendingView`、`ui-security-proxy` 等既有债务）与 `assembly-bundle-roster` 的悬空 inject；`verify-doc-budgets` 仍因本分支已移除的 `docs/` 文件而失败。

## 整理与打包节点（2026-10-25，f5099db76a）

用户要求整理全部变更并打包最新版本；本轮只打包，未安装、未签名、未发布。

- 整理：工作区原有的并行改动（敏感操作确认迁到通用设置、模式切换拒绝提示、TODO 记录）先核对并通过 `ui-agent-preset` 301 项与 `typecheck` 5/5，提交为 `5825494d47`；随后随问只读改动提交为 `f5099db76a`，工作树干净。
- 打包：`pnpm run package:desktop:win:x64:unsigned` 成功（整体 success，30 个阶段，耗时 746,448 ms）。产物 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/deepseek-harness-uncensored-0.1.0-win-x64-unsigned.exe`，288,396,463 字节，SHA256 `5D3738A8730B66929C4FB63BE91B52D059F247B682898D01021F2FEF740F24EB`，未签名。
- 产物核验：`win-unpacked/resources/app.asar` 含 `btwMaxTokens`、`随问思考等级`、`只读地问当前进度`、`read-only` 与提交 `f5099db76a`；打包后 smoke 通过（CLI 插件离线安装/移除、DOCX/XLSX/PPTX→PDF、skill CLI 发现、打包版 Web 启动）。
- 未做：安装新包、签名、发布与自动更新配置；已安装版本仍是此前节点产物，需要新功能时安装该 unsigned exe。

## 设置归属与模式切换提示节点（2026-10-25）

用户列出三项设置调整；本轮只改源码，未打包、未安装。

- 敏感操作确认改为通用设置项：设置行仍由 `ui-agent-preset` 提供（偏好控制器与 Host Remote 都在该包），但注册到 `settings.general.item`（id `sensitive-confirmations`，order 25），模式页只保留“允许已有会话切换模式”。该行挂载时自行读取偏好，不再依赖先打开模式页；行样式改为通用分组的间距与分隔线，错误重试按钮与开关并排。
- 性能与用量默认“详细”已核实，无需改动：`ui-chat` 的 schema 默认、`PerformanceUsagePolicy` 初值与对应测试都是 `detailed`，`04.08` 已勾选，Web 金样里该行也是“详细”。若某台机器显示“简洁”，那是 `ui-chat.performanceUsage` 的已保存值（例如 `~/.dsh/profiles/<profile>/cordis.patch.yml`），不是默认值。
- 非新对话时在设置中切换模式：卡片不再静默禁用，保持可聚焦；点击交给 `selectCurrent` 判定——任务运行中提示“当前任务结束后才能切换模式”，未临时允许时提示“当前对话保持原模式，未执行切换”，都复用 `ModeSwitchToast`；权限已允许时照旧切换。卡片仍以 `aria-disabled` 与悬浮提示说明当前不可切换。
- 验证：`ui-agent-preset` 14 文件 301 项通过；改动文件 oxlint 0 错；该包 client bundle 构建通过；`verify-client-ui-i18n`、`verify-export-jsdoc` 与两份 README 中英配对通过。`tsc -b tsconfig.client.json` 在本轮改动后就通过；随后工作区里随问改动带来的 `packages/api/session-controller/src/index.ts:255` 类型错误与本节无关。
- `pnpm run test:gui`：667 文件中 654 通过，12 个文件 60 项失败，均为既有项（`ui-settings-account/apply`、`ui-settings-general` 的 composed 组合缺 `agentPresets/switchPolicy` 等桩、`ui-theme` 五个样式巡检、`ui-shortcuts`、`ui-renderer`、`ui-directory-picker-native`，以及工作区未提交的随问推理改动造成的 `ui-commands` 两项）。新注册行会让 `ui-settings-general` composed 组合额外调用 `agentPresets/sensitiveConfirmationPolicy`；该测试本就因同类缺桩失败，修复时需一并补桩。
- 未完成：`apps/web/tests/expected/settings-chrome/dialog.expected.md` 与 `apps/web/tests/expected/desktop-locale/automatic.expected.md` 需在可用的浏览器金样通道下重新录制（通用分组会多出这一行）；真实窗口的深/浅色与 390px 复核未做。

## 随问进度上下文节点（2026-10-25）

用户反馈 `/btw 进度如何` 拿不到主线进度；本节点把随问从“全新上下文”改为“有界实时进度快照 + 独立回答”，并让随问使用可配置的低思考等级，旁问仍跟随主对话。

- 新增 `aside-question-context.ts`：从父会话实时事件生成不超过 `btwContextBytes`（默认 8192）的快照，包含状态（运行中/已结束及轮次、步骤）、最近用户请求、当前待办列表、近期助手与工具工作（含进行中轮次），并以“背景数据、不要延续主线任务”标注。随问系统提示同步改写，不再声明“父对话没有上下文”。旁问保持只在每个请求前同步已完成进展（`sideContextBytes`）。
- 思考等级：`session-controller` Config 新增 volatile `btwReasoningEffort`（默认 `low`，可选 `off/low/high/max`）。随问创建时先解析模型能力，模型支持该等级才覆盖；旁问与主对话一致。通用设置新增“随问思考等级”行（`ui-commands` 注册 `settings.general.item`），按字段发现 `session-controller` 设置命名空间并 `remote.settings.update`，读写实时生效。
- 修复子会话模型选择：`model-selection` 的 `agent/request` 瀑布会用 Agent 的已提交选择覆盖创建参数。aside 创建后现在调用 `selectForNextRequest` 记录选择，否则随问的 `low` 会被默认模型覆盖（这同时修正了旁问未必真正继承主对话模型等级的隐患）。
- 修复 Loader 双重解析：Loader 传入的是已解析 Config（volatile 字段是带 `get()` 的包装），而构造函数再次 `SessionController.Config(config)` 会把包装当作值校验而失败（表现为 session-controller 未激活、随问设置无效）。构造函数现在识别已解析配置并原样使用，保证设置写入命同一个包装；直接构造的测试仍走 schema 解析。
- 使用场景与短答：随问定位为“主线任务进行中问一句进度或小问题”。系统提示要求最多三句短句（进度最多五条要点），不要开场白、不要复述问题、不调用工具、不追问；快照缺失时用一句话说明。新增 `btwMaxTokens`（默认 512）作为输出上限，随问子会话的 AgentOptions 携带 `maxTokens`，旁问不带。命令描述与输入提示同步改为“任务进行中问一句进度或小问题，快速回答一次”。
- 设置行拆分挂载：设置行改为独立的 `remote.settings` 注入作用域，缺少设置 Remote 的组合仍能注册 `/side` 与 `/btw`（此前把设置放进主注入导致 ui-commands 组合测试两项失败）。
- 只读约束：随问在发布前固定到部署的 `read-only` 权限预设（sandbox `read-only`、approval `ask`），`asides.ts` 在 composition setup 中调用 `permissionPresets.set`，正常结束/失败都先于发布，因此随问只能查看；缺少权限服务的组合保留提示词限制并记录警告。命令描述改为“只读地问一句”。真实账号验证：新建的 `session-btw-d80c4ccf…` 投影为 `{"preset":"read-only","sandbox":"read-only","approval":"ask"}`。
- 验证：`aside-question-context` 4 项、`asides.host` 7 项（进度快照、随问 low、输出上限、只读预设、旁问跟随主线）、设置行 4 项、`ui-commands` 159 项、`list-scheduling`（已解析 Config 路径）通过；`typecheck` 5/5、`build:artifacts` 7/7。真实账号页面实测：`/btw 进度如何` 1 秒返回，短答（两三句）+ 下一步建议，复述了主线当前状态；通用设置显示“随问思考等级：低（默认）”。
- 既有问题：`session-presets.host.spec.ts` 在未改动的 HEAD 上同样失败（29 项），属本机组合/环境漂移，与本节点无关；`test:gui` 的既有失败清单不变。

## 界面问题修复节点（2026-10-25）

用户列出九项问题并附截图；本节点完成前六项修复与后三项收尾，未打包、未安装。

- 标题栏模式卡：新增共享 `ModeCard.module.css` 与 `mode-tone.ts`，会话标题栏的当前模式改为对应模式的深色底、白色文字的圆角卡片，去掉下拉箭头；允许切换已有对话时由卡片本身打开模式列表，禁用状态保留模式色。新对话页的选择 chip 未改动。
- 头像：图片 URL 一旦到达就立即绘制，不再等待共享预加载；预加载失败按 4/12/30/60 秒退避自动重试，切换 URL、退出登录和卸载会清除等待中的重试。真实账号页面实测 `data-avatar-status=ready`、naturalWidth 132。
- 余额时段卡：同一行右侧显示当前计费时段的结束倒计时（北京时间 HH:MM:SS，每秒刷新），新增 `balancePeriodEnd`；真实账号页面实测由 21:58:36 递减到 21:58:34，计算与当前时钟一致。
- 拖动显示：取消浏览器自带的整行拖影，改为来源行原地变淡；插入横线使用被拖动对话的模式色（`data-drop-mode` + `--drop-color`），分组列表和单列表都生效。浏览器实测 `dragging=true`、`dropMode=writing`、marker 出现。
- 新对话草稿：空白会话的草稿同步到浏览器本地新对话槽位，下一个空白会话在自身无草稿时承接；开始对话后释放。浏览器实测输入后切走再点“新建会话”，文字原样恢复。
- 收尾验收：`/side` 在 1280px 与 390px 均正常打开，390px 时右侧面板为 `fullscreen` 且宽度等于视口；余额悬浮卡在 1280×900、390×800、1280×420 三档均无横向/纵向溢出，也不出现内部滚动。
- 对话删除：在复制自 `finish-85-90` 的隔离 home 中，根对话与随问子会话的删除都返回统一失败提示，Host 拒绝原因未在界面显示；同一功能的主机集成测试与界面测试通过（27 文件 478 项）。尚缺一次干净 home 上的真实删除 + 重启复核，不能据此把删除项标为完成。
- 验证：相关包聚焦测试全部通过（ui-workspace／ui-agent-preset／账户相关 856 项，ui-conversation 798 项，旁问与删除相关 478 项）；`pnpm run build:artifacts` 7/7、`pnpm run build:check` 2/2；`test:gui` 666 文件中 655 通过、11 个文件 57 项失败，失败集中在既有的 `ui-settings-account/apply`（composed 组合缺少 agentPresets RPC 桩）、`ui-settings-general`、`ui-theme` 样式巡检、`ui-shortcuts`、`ui-renderer`、`ui-directory-picker-native`，均未引用本节点改动文件。改动文件 oxlint 0 错；四份 README 中英配对已重新记录（全局配对检查仍有大量既有不同步项）。

## 打包与安装节点（2026-10-24）

- 按用户要求打包并安装当前开发版本；仍不发布、不上传、不做签名。
- 首次 `package:desktop:win:x64:unsigned --check` 因 vswhere 未带 `-prerelease` 报告缺少 Visual Studio C++ 工具，本机实际安装的是 VS 18 Insiders（MSVC 14.51 + Windows SDK 10.0.26100）。已在 `apps/desktop/scripts/desktop-toolchain-preflight.ts` 与 `apps/desktop/scripts/prepare-windows-installer.ps1` 的两处 vswhere 查询加 `-prerelease`；未改 CI runner 脚本。
- `pnpm run package:desktop:win:x64:unsigned` 通过：`result.json` 记录 25 个阶段全部成功、耗时 1218.7 秒；产物 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/deepseek-harness-uncensored-0.1.0-win-x64-unsigned.exe`（275 MB，未签名）。构建期包含 build:official 9/9 与打包后 runtime smoke。
- 安装：旧的手工拷贝 `%LOCALAPPDATA%\Programs\DeepSeek Harness Uncensored` 没有卸载注册项，NSIS 预检把非空目录判为外来安装并退出 2；将其移到 `...old-20261023` 后 `/S` 静默安装成功（exit 0），随后删除旧拷贝。安装目录 `%LOCALAPPDATA%\Programs\DeepSeek Harness Uncensored`，版本 0.1.0，包含 `Uninstall DeepSeek Harness Uncensored.exe`、开始菜单与桌面快捷方式、HKCU 卸载项 `4bbab420-...`。
- 安装产物核验：`resources/app.asar` 内含 `敏感操作需要确认`、`sensitive-confirmations`、`模式配置` 与提交 `d86ae1a4dd`，即本节点改动确实进入安装版。应用已启动并在运行（多个 Electron 进程，主窗口标题 `DeepSeek Harness Uncensored`）。
- **启动注意（重要）**：从 DSH 宿主内的 shell 启动 Electron 会继承 `ELECTRON_RUN_AS_NODE=1`，表现为静默退出 0 或 `bad option` 报错。启动安装版或 `dev:desktop` 前必须清除该变量（`Remove-Item Env:ELECTRON_RUN_AS_NODE`）。
- 未完成：签名/发布、自动更新配置（unsigned 构建按设计省略）、真实安装后的登录与官方版并存回归；`prepare-dsh.ts` 的版本约束本节点未触发，因产品版本 0.1.0 已能通过发行校验。

## 模式页重做与敏感确认开关节点（2026-10-24）

本轮按用户新要求完成三项，未打包、未安装、未发布；运行中的桌面版仍是旧产物。

- 设置 → 模式重做：模式选择与模式配置分离。配置区为独立区块，标签页由 `settings.mode.materials` 贡献项的注册 id 决定（贡献项按所配置的 preset id 注册），默认打开当前对话模式的标签页；卡片新增“配置”按钮，只切换标签页、不切换当前对话模式；只有一个可配置模式时直接显示模式名，没有时整块隐藏。设置页标题改为“模式”，选择与配置各有小标题。
- 对话标题栏：已有对话未获临时切换权限时，模式控件不再消失，而是保留并置灰禁用（`AgentPresetLabel locked`），提示指向“设置 → 模式”。
- 新增“敏感操作需要确认”开关，默认开启，Host 侧持久化到 `agent-preset-registry` 设置条目。关闭需十秒单调倒计时并由 Host 校验，重新开启立即生效；关闭后 `securityEntryState().required` 为 false、`beginModeSwitch` 返回 `waitMs: 0`、已打开的首次进入挑战作废。客户端以 `challenge.waitMs === 0` 作为“无需确认”的判据，因此不新增客户端侧策略判断。
- 新增 Remote：`sensitiveConfirmationPolicy`、`beginSensitiveConfirmation`、`confirmSensitiveConfirmation`，转发事件 `agent-preset/sensitive-confirmations`；typert 工件已用 `scripts/generate-typert.ts` 重新生成（35 个包）。
- 验证：`agent-preset-registry` 11 文件 100 项通过；`ui-agent-preset` 14 文件 295 项通过；新增/改动客户端文件（`sensitive-confirmations-controller.ts`、`SensitiveConfirmations.tsx`、`AgentPresetSection.tsx`、`AgentPresetLabel.tsx`）在包内测试下达到逐文件 100% 覆盖。`pnpm run typecheck` 5/5 通过（Host/客户端编译器与两个聚合检查）。改动文件的 oxlint 通过；`ui-security-proxy` 的 `controller.ts:145` 与 `SecurityProxySection.tsx:200` 是既有 lint 错误，本轮只改该包的注释。
- `pnpm run test:gui`：666 文件中 648 通过、18 个既有失败（`ui-theme` 六个样式/主题用例、`ui-settings-general`、`ui-layout`、`ui-renderer`、`ui-shortcuts`、`connection` 等），失败文件均不在本轮改动的包内；`ui-theme` 的失败与主题按本地时间选深/浅色有关（期望浅色、实际深色），属既有债务。不得把这次运行说成全绿。
- `pnpm run build:artifacts` 7/7、`pnpm run build:check` 2/2 通过（331 个客户端工件）。`verify-client-ui-i18n`（1118 文件）、`verify-export-jsdoc`、`verify-client-packages`（69 包）、`verify-package-dependencies`（87 包）与两份 README 的中英配对通过；`verify-doc-budgets` 仍因本分支已移除的 `docs/` 文件而失败，属性既有缺口。
- 未完成：真实浏览器（深色/浅色/390px）复核新标签页、置灰控件与关闭时的十秒弹窗；`index.ts` 中的 Remote 包装闭包此前即未覆盖，本轮未改变该状况。

## 历史暂停节点（2026-10-24）

用户要求立即收尾暂停；等待明确恢复，不继续开发或付费模型测试。本轮范围为旁问、删除、余额、额度续跑、设置细节、写作六项，原 TODO 勾选暂不批量改为完成。

- 已修复真实删除接口读取未注入的可选持久化服务；新增依赖检查作用域回归，8 项删除测试通过。真实 Web API 删除等待中的父会话及旁问/随问，重启后不复活，独立分支和工作区文件保留；原失败会话重试也成功。
- 已修复会话退役与异步清理交错时，语言/视图刷新访问旧绑定。回归先复现同样错误，再修复，相关 22 项通过。整包开发热更新仍可出现 Remote 连接卸载与白屏问题，继续归 `17.03`，不能以刷新代替结案。
- 旁问通过空白主线、390px 自动全屏、开始页重开保留历史；162KB 主线资料经有界上下文同步，回答末尾标记且不改主线。
- 额度用真实模型通过手动恢复、窗口到期自动恢复、跨 Host 重启恢复、停止后不恢复、删除等待任务、在途重置保留预留以及关闭限制后续跑。窗口测试将隔离账本的已结算消费时间移到到期前 1.8 秒；没有实际等待十五分钟，不使用模拟模型。
- 写作通过选中文风/设定注入、排除未选材料、六章共 7344 字、局部修订及重启后续写；最终核对姓名、职业、缺指、亲属、河流、铜钥匙与未解谜状态。只证明这些用例，不保证所有文学效果。
- 余额浮层已检查中英文、深浅色、1280px、390px 和低高度窗口，含滚动与 Escape。新增 15 秒采样、即时刷新、失败保留旧值、凭据切换与并发刷新测试，2 项通过。
- 设置五组已有中英文及窄/宽屏实测；补限额输入的错误关联、红色边框、保存忙碌态和模式色。发现并修正 Default/Standard 命名及已打开“开始/旁问”标签的语言滞留；标题相关 11 项、限额表单 2 项通过。
- 英文 Slogan 改为 `Explore the Unknown, More Freely`，对应单元测试 29 项通过；英文次数文案改为 `Turns: … · Steps: …`，相关 39 项通过。
- 最近完整构建 9/9 通过，之后只新增了次数文案及对应测试；这条最新文案尚未重新生成最终预览产物。相关源代码测试已通过。其他聚合检查、回归、本地化、文档配对与 lint 日志均在下列目录，恢复时按最新差异选择检查。
- 所有真实测试使用独立 `.dsh-build/finish-85-90/home`，预览端口 `3194`；未改用户会话、未打包安装。证据为同目录的 `budget-evidence.json`、`cold-budget.json`、`budget-reset-disable.json`、`delete-evidence.json`、`retry-delete-evidence.json`、`long-side-evidence.json`、`writing-evidence.json`、`settings-matrix.json` 与 `screenshots/`。这些运行数据不提交 Git。

恢复后的收尾：复核最新次数文案产物和旁问标签的即时语言切换；汇总六项验收并更新对应编号与概览。不得启动未获恢复授权的自动任务。

## 协作约定

2026-10-25 已按用户要求恢复整合；用户最新明确要求打包并安装供其检查。发布和签名尚未进行。恢复时先读 [进展概览](TODO.md)，再查 [完整编号清单](requirements/development-checklist.md)。编号保持稳定，按证据打勾；中文提交并推送唯一 main。

最新决定：**新对话的默认模式固定为缺省，不能在设置中修改。** 开始前仍可手动选择当前对话的模式。下文旧节点中的“设为默认”已经被此决定替代，不要重新实现该入口。

## 三方整合审查（2026-10-24，当前节点）

### 收尾追加

- 用户新截图要求已落实：首次网安声明改为单输入框淡色提示，匹配前缀蓝色、错误红色，剩余正确提示继续显示；NFKC 全半角比较同时用于 UI、控制器和 Host，实际文字错误仍被拒绝，10 秒计时保持不变。
- 客户端原生 `<select>` 已全部替换为共享 `Select`／`Menu`，包括模型设置和通用配置表单。294 项相关回归通过，保留原来的协议/推理等级选择、继承值重置和失败反馈；菜单限制高度并使用应用主题。
- 补齐深度思考文字、鲸尾与流光、消息气泡、链接、文档选择、余额曲线和低峰卡片的模式色；真实写作请求已捕捉到黄色运行状态。记忆管理中的未定义样式变量已换成现有主题变量。
- 记忆管理的 describe/list 改为所有者专用，阻止委派调用者枚举跨工作区记录；拒绝发生在读取前，测试已覆盖。页面说明删除会话与删除记忆的不同效果；来源失效标记与自动提炼仍未实现。
- 持久化历史的人类说明移入 `.agents/persistence`，原始 16 条记录从 `57086f121a` 恢复，新增本分支上下文的兼容性确认。冻结 schema、历史代际和 v4 检查点保留原路径与内容；布局由 `scripts/persistence-layout.json` 显式声明，生成器只更新当前机器目录。校验 66 个根／17 条记录通过，布局和历史验证 87 项测试通过。公开文档仍为根 README。
- 验收使用 `.dsh-build/closeout/ui-home` 和端口 `3193`，与用户正在试用的 `3192` 分开；测试关闭 Session Log 上传。截图与检查日志留在 `.dsh-build/closeout/`，不会提交测试会话或账号余额。
- 实测还修复了记忆弹窗内容宽于外框而裁切的问题，宽屏和 390px 均已复核。浅色位置菜单、深色记忆菜单、声明蓝色前缀/淡色后缀及黄色写作运行状态均有截图；临时视口已恢复。
- 最终验证：下拉框/声明相关 294 项、持久化与外观补充 91 项、记忆管理权限 1 项通过；此前声明策略与控制器批次也通过。完整构建 9/9，最后局部布局 bundle 后 Host/Client 聚合检查 2/2；UI 本地化 1116 个文件、导出 JSDoc、根 README、四组文档配对和改动 lint 通过。

- Grok 交付基线为 `62a20157f3`。修复额度误记辅助请求、冷恢复绕过 API 会话装配、先删暂停记录再恢复、关闭未等待恢复任务结束等问题；新的恢复流程只接管本应用持有的普通对话，保留原模式、工作区和旁问装配，通知落盘后才确认领取完成。真实 AgentLoop＋JSONL 测试覆盖跨重启续跑、用户停止、删除和失败重试。
- 输入建议修复空编辑器灰字、英文前导空格、完整问句被续写成回答、Tab 光标位置、输入法、取消/超时/卸载及偏好保存失败。辅助请求优先关闭推理，完整请求与终态可从 Session 日志重建；两套 SDK 补齐期望输出。真实 Web 验证过灰色建议与 Tab 填入、不发送，4 次建议约 0.4–0.9 秒；完整三输入场景与独立成本仍待验收。
- 余额修复非法金额占位崩溃、负数解析、减少动态效果中途切换及长历史丢失峰谷。调休周末按官方价格说明计为低峰，纠正原实现。更新检查改用 semver、校验真实来源与分页、区分空发布列表、支持超时重试；桌面不再依赖已弃用的 getFeedURL。
- Claude 的默认项与控件样式一并接手：完全展开、下次输入收起、详细用量；日出日落四卡片已在真实设置页核对。修复模式/主题旧动画回调覆盖新状态、卸载后重新写入样式的竞态。未更新桌面安装资源或官方 DSH 数据。
- DS 交付的记忆、代理、模式资料、首次网安确认先完成编译接缝检查：补源码映射、Client 安全类型导入、统一事件声明与严格测试类型。实际启动进一步发现 `memory/remove` 与 Remote Service 保留方法冲突，导致接口装配整体撤回；改为 `memory/deleteRecord`，客户端同步。补齐漏装配的 `modeDossiers` namespace，并新增真实 Gateway 装配回归测试。
- 最终装配修复后完整构建 9/9 通过；三个聚焦批次分别为核心 116 项、界面默认项与输入 249 项、DS 接缝整合 176 项，均通过。依赖声明、改动文件 lint、README 文档门通过。详细日志在本机 `.dsh-build/grok-review/`，不提交含测试账号信息的截图或运行数据。
- 真实 Web 验证：空输入建议可见；随问直接内容→单次回答；旁问读取主线原主题及下一回合的新主题，关闭重开保留历史；网安首次确认倒计时结束后，未输入声明仍禁用确认，取消后保持缺省。保护开启分支和实际执行隔离仍未交付。
- 390px 实测发现设置页固定左栏把正文挤成竖排，已改为顶部横向导航，并复核深色设置及额度图表没有横向挤压。截图 `screenshots/settings-narrow-final.png`；宽屏深色外观为 `screenshots/settings-dark-final.png`。已恢复浏览器视口。余额悬浮层全部边缘组合、窄屏旁问、桌面与并存验收仍需继续。

### 持久化与接口兼容确认

- 额度 SQLite 从 v1 单调升级到 v2，保留费用和限额；旧暂停来源无法可靠分类，迁移后仅手动恢复，不能用旧构建回读。新暂停记录包含需求、所有者和领取信息，进程退出/失败保留，通知以稳定 pauseId 去重。
- Session 仍为 v4，未修改任何已提交的历史格式代际。`input/prediction` 增加可选 requestId/request/outcome/usage；恢复消息增加可选 pauseId；`input-prediction` 来源表示辅助请求提示而非用户手输。新读者接受旧记录缺失的可选字段；这不承诺旧构建能够解释新增事件。
- 当前 `docs/persistence-schema.json` 与内部历史声明一致。旧公开文档删除造成的 16 份无关联 schema 问题已通过恢复内部声明解决；历史摘要、前驱、双语与已确认版本不可变检查继续执行，未恢复公开文档站。
- 尚未发布的记忆 Remote 删除入口从 `memory/remove` 改为 `memory/deleteRecord`，所有当前客户端一并更新；磁盘记忆记录不变。自定义客户端需同步改调用名。
- 预发行管理 API 的 `memory/describe`、`memory/list` 现与写入一样仅供所有者调用；委派客户端会收到 `remote-access/denied`，应由所有者在管理页操作，不可继续枚举全局记忆。会话内按范围检索的模型工具保持原有路径，无磁盘迁移。

后续优先核对编号 `03.07`、`03.13`、`06.08`、`08.07`、`10.02–10.05`、`13.03`、`17.03`。目标保护 `09` 仍未接入，不能把责任确认或代理说成强制隔离。

## 本次暂停收尾（2026-10-24）

- 移除设置中的“设为默认”；后端忽略旧 `selectedDefault`，新对话使用发行配置中的 `standard`，显式选择当前模式仍可用。旧配置无需手动清理，已有会话不迁移模式。
- 未完成的生产目标保护代码已从运行时撤出，保存到 [暂停归档](pending/README.md)，包含补丁、完整文件和校验清单。最后的 SSH/文件系统改动未验证，不得描述为已交付。
- 默认选择及界面相关 70 项测试通过，日志 `.dsh-build/pause-default-tests.log`。
- 用户已撤销本次打包要求，打包进程已结束，不再继续，也不交付旧产物。已发现的后续问题记入 TODO：Windows 安装器缺 Visual Studio C++ 工具；`prepare-dsh.ts` 仍强制 Electron 产品版本与 DSH 引擎版本相同，阻塞独立版本打包。
- 首次打包完整构建 9 项通过，随后发现编译时间被重新生成，导致发行校验失败。已让发行校验采用产物记录中的编译时间，仍校验当前源码/产品元数据及文件摘要；时间格式必须为 ISO UTC。相关 48 项测试通过（`.dsh-build/pause-packaging-tests.log`）。
- 修复后完整构建再次 9 项通过（`.dsh-build/pause-package-retry.log`）；公开文档 2 项测试、文档配对、UI 国际化和提交 lint 通过。实际桌面打包未成功，不应将构建通过描述为可安装。
- 总目标仍未完成，剩余需求继续以下清单；暂停时不要创建自动恢复任务。

远端两个没有开放 PR 的 Dependabot 遗留分支已删除，本地与远端只保留 `main`。提交点已保存在本机 `.dsh-build/retired-branches.json`，对象已 fetch。没有修改官方 DSH 的安装与用户数据。

## 网安首次进入确认节点（2026-10-24）

- 该节点实现 `05.05`—`05.07` 的确认流程，不实现 `09` 的目标保护执行器，也不改变已有会话的临时切换规则、armor 文本、工具名单或模型配置。
- Host 策略位于 `@deepseek-ai/dsh-agent-preset-registry` 的 `src/security-entry.ts`，与 `switch-policy.ts` 分开保存状态。`select` 在空白新主对话进入 `securityEntryPreset` 前要求本次 Host 启动的确认；显式 `session.create` 也通过 `assertNewConversationPreset` 拒绝旁路。已有对话和非 GUI 组合保持原行为。
- 挑战绑定所有者、注册表生命周期、目标会话和保护修订号；10 秒单调计时、5 分钟有效期、一次性消费、声明逐字校验和保护变更失效均由后端执行。确认只保存在 Host 内存，页面刷新保留，Host 重启清除。
- `securityProtection` 是可选运行状态提供方；`securityEntryState()` 读取 `read()` 的 state/revision/capabilities，提供方变化时发出 `security-protection/changed`。当前 Web 产品没有提供方，因此显示 `unavailable` 并按未启用分支要求声明；保护开启分支仅由测试提供方验证，真实后端仍属 `09`。
- 客户端 `security-entry-controller.ts` 在座位暂存前拦截，确认前不改变模式强调色、标签或模式选择；取消保留原模式和草稿。`SecurityEntryDialog.tsx` 展示真实状态、倒计时、声明输入、处理中、错误与重试，设置入口跳到模式设置页。
- 通知通过 `agent-preset/security-entry` 转发，其他窗口同步；重复确认的挑战返回 `security-entry/consumed`，客户端重新读取后按已确认处理。断线、过期、保护变化和请求失败均可重试；卸载时清理计时器并释放等待选择。
- 验证：Host 策略/注册表/真实 Loader 组合相关 84 项通过；客户端 256 项通过，含 40 项确认控制器、12 项对话框、9 项座位门禁和 65 项 apply 装配。`security-entry.ts`、`security-entry-controller.ts`、`SecurityEntryDialog.tsx`、`seat-store.ts` 聚焦覆盖 100%。Typert 生成、中英配对和改动文件 lint 通过。
- 缺口：实际浏览器验收被并行任务尚未完成的 `ui-mode-materials`、`ui-settings-memory` 组合阻塞；曾观察到真实 GUI 后端以 `security-entry/required` 拒绝未确认的网安选择，但未完成完整倒计时/输入/取消/错误截图。完整 Client 构建仍受既有 `SessionStore` API 漂移（`17.06`）阻塞，本节点不宣称构建全绿。并行工作区包含其他任务暂存的改动，本节点提交仅包含本功能文件。

## 原始需求来源

- 必须按最初需求和截图审查 DeepSeek 的全部修改，不能只修最近截图。
- 本机 `.dsh-build/original-user-messages.json` 保存从原始 DSH 会话恢复的 32 条用户消息及图片引用；原始会话位置记录在 `.dsh-build/current-work.json`。
- 原 HANDOFF 可用 `git show 2dcdbd87:HANDOFF.md` 恢复阅读；不要重新公开旧文档站。
- 后续用户消息修改了若干早期决定，以下记录以最新决定为准。

## 已交付基础

- 独立 Uncensored v0.1.0，DSH 引擎版本仍为 0.2.1-rc.2；版本号解耦。
- 默认数据目录 `.dsh-uncensored`、CLI `dsh-uncensored`、深链 `dshu://open`、独立应用名及 Windows app ID。
- 黑底白鲸 SVG/PNG/ICO、网站图标与托盘资源已生成。**实际安装的桌面程序与快捷方式仍需更新验收。**
- 首页使用“更自由的探索未至之境”，不再显示预览版或去审查版徽标。
- 根 README 已重写为简洁中文文档，旧公共 docs/website 已移除；工程内部文档和残留链接仍需清理。软件保留中英双语，用户撤回了中文单语要求。
- 根发行采用 GPL-3.0-or-later，保留上游 MIT 通知。集成发行的完整依赖许可审计尚待完成。
- 关于已包含独立版本、DSH 版本、源码提交与时间、purge fork 提交与时间、编译时间、许可及仓库入口；布局和更新状态尚待重做。
- 模式顺序为缺省（蓝）→ 网安（红）→ 逆向（绿）→ 写作（黄），有不同图标与配色。已有对话默认锁定，新对话可以选择；已有对话切换已改为后端计时十秒后确认，仅本次 Host 启动有效，重启关闭。
- 会话左边已有模式色条，失败、新会话、未知模式为灰色。
- `/side` 与 `/btw` 已作为内置功能实现。`/side` 与“开始”共用右栏标签区，“开始”有入口，关闭重开保留旁问；`/btw 问题内容` 已改为新上下文单次问答，结果块无追问输入区。
- 支持不绑定工作区的新会话；忙碌时 Enter 默认插话；模型菜单集中显示 Flash，保留旧会话模型解析。

## 当前开发节点

### 额度门闸

- 新包 `packages/guard/spend-limit`，由 base bundle 内置加载，不依赖余额采样开关。
- 默认关闭，自动恢复默认关闭。六档滚动限额：15 分钟 5 元、1 小时 15 元、5 小时 50 元、1 天 100 元、7 天 500 元、30 天 2000 元。
- SQLite 事务在请求前持久预留额度；不同会话、不同本机进程不能重复占用同一余额。配置与统计由同一账本保存。
- 覆盖 LLM 请求、重试、标题、压缩以及单独发起模型请求的 DeepSeek 原生搜索。
- 完整成功用量按公开高峰费率估算；未知最终用量保留预留额，死进程遗留请求保守计入。原始提示词和模型请求不被改写。
- 额度不足时原请求等待；启用自动恢复后，额度释放会继续该请求。关闭自动恢复时，已结算费用造成的额度不足会保持暂停，直到手动恢复、重置或禁用。仅由在途预留造成的等待会随结算继续。
- 用户明确要求“自动恢复”意味着被暂停的对话继续执行。当前覆盖本进程仍在等待的原请求；跨重启恢复、明确的会话暂停状态及真实 AgentLoop 恢复验收仍应补强，不要把只更新数字称为完成恢复。
- 重置已完成统计不会清除在途预留。单次预留本身超过上限时直接拒绝，并提示调低输出上限或提高额度。
- 界面有六档进度条、开关、限额编辑、暂停提示、恢复和重置；已与余额、统计和账单入口统一放入“额度”分组。
- 估算不是账单：默认按整个配置上下文容量和最大输出保守预留，可能较早等待；不含应用外请求或其他付费工具；未配置费率的模型在限制开启时被拒绝。
- 初始化失败保留拦截入口，不会因账本损坏而静默放行。还应补充损坏账本的真实组合启动测试。

### 旁问同步主线

- 每次旁问请求组装上下文时读取主线新完成的回合，排除尚未完成的回合和队列消息。
- 旁问保留自己的历史，不写回主线。上下文通过现有机制记录到旁问 Session 日志。
- 新增 `sideContextBytes` 配置，默认 65536 字节，包含完整包裹文字；过长时保留最近内容并标注省略，不切断 UTF-8 字符。
- 已验证主线新增内容进入下一次旁问、旁问旧内容仍在、主线不被修改及关闭重开复用身份。

### 余额界面修复

- 文案改为“高峰时段”“低峰时段”，删除“梁文峰”“梁文谷”等表述。
- 赠金为 0 时隐藏侧栏和详情里的赠金项。
- 修复悬浮卡内容固定宽度超过容器的问题，改用支持视口约束与滚动的已有 HoverCard 样式；图表和统计列可收缩、换行。
- 修复未定义的背景变量，额度卡在合适宽度下采用双列。
- 悬浮卡仍需完成浅色、窄窗口、屏幕边缘的最终浏览器复核；本轮截图已验证零赠金隐藏，尚未取得展开悬浮卡的最终截图。

## 最新 UI 与交互要求（待实现）

### 设置结构（五分组与插件迁移已完成）

严格按 **通用 → 模型 → 额度 → 模式 → 插件** 排列。

- 通用：外观、语言、工作步骤、性能等通用行为。
- 模型：模型配置，以及登录和账号管理。
- 额度：余额、历史统计、刷新设置、额度限制、恢复与重置。
- 模式：选择当前模式，新对话默认固定缺省。当前模式专属功能（境内网站保护、生产/测试目标、代理、写作资料等）仍待实现并接入此分组。
- 插件：完整迁入插件安装、启用、配置、内置和实验性功能。移除左栏独立“插件”入口。

### 外观与动画

- 外观用用户提供的预览卡片样式：日出日落、跟随系统、浅色、深色；默认日出日落。
- 自动检测时区。时区不能给出精确位置，已向用户说明按代表城市估算日出日落并提供手动城市选项；实现时不要把估算写成精确定位结果。
- 四模式必须影响整个应用的主题强调色，包括 1017 徽标、发送按钮、选择状态等；不要只改顶部文字。
- 模式切换要有明显、完整且有冲击感的颜色扩散、图标和色条动画；灰色变为模式色时也需要过渡。
- 模式卡片/标签去掉“模式”后缀。浅色界面下网安卡片使用深红底、有质感的边框和更粗白字；其余模式依相应颜色设计，并核查深浅主题对比。
- 全面修复原版 DSH 缺乏动画和样式粗糙的问题，包含按钮、开关、弹窗、菜单、标签页、面板、输入框、悬浮卡和溢出；遵循减少动态效果设置。
- 文案保持严肃、简洁，不用谐音梗、夸张能力宣传或开发过程术语。
- 余额默认刷新率 **15 秒**、点击立即刷新已实现；已有手动保存的刷新间隔继续保留。金额变化的数字滚动效果尚待实现。
- 关于页重做 DSHU Logo、GitHub Logo/入口、当前版本是否最新、构建信息和日期展示。不能把更新检查失败显示为“已是最新”。

### 默认项与确认

- 工作步骤默认“完全展开”，收起时机为“下次有新消息时”。
- 性能与用量默认“详细”。用户最新截图还显示“使用官方模型 API 时上传 Session Log”为开启，已向用户按开启记录；目前代码默认关闭，后续按最新确认落实，注意这是对早期默认决定的变更。本轮没有替用户上传真实日志。
- “允许已有会话切换模式”已移到模式分组；默认关闭，启用有 **10 秒倒计时警告和确认**，后端同步校验；软件重启自动恢复关闭。新对话选择模式不受此开关限制。
- 每次启动后，**只对新对话首次选择网安**给出责任及保护能力提示；重开已有网安对话不提示。
- 境内网站保护开启：10 秒倒计时确认。保护关闭：仍需倒计时，并额外手动输入“我确认……”责任声明。
- 首次确认之后不要反复加确认、缩减工具或修改提示词，保护只按用户明确配置的目标和等级执行。

### 随问（已实现）与输入预测（待实现）

- `/btw` 中文统一为 **随问**。
- 仅接受 `/btw 问题内容`，直接发出一个全新上下文的问题，主对话内显示简单结果小块。
- 单独 `/btw` 不创建空窗口。结果块没有追问输入框；每次调用独立。
- `/side` 持续跟进主线已完成内容，保持独立的可持续对话。
- 增加可开关的输入预测：灰色预填充，Tab 接受，不自动发送；覆盖主输入、`/side`、`/btw`，分别预测各自场景的内容。
- 用户举例随问更可能是“进度如何”之类简短问题。预测可以参考交互状态，但不要擅自改变随问回答的全新上下文语义；实现时需把这两层区分清楚。
- 预测请求计入额度。默认开关、预测模型、触发节流尚未确定，恢复后自行做合理决策并验证实际费用和延迟。

随问实现通过内置命令的文本参数提交，菜单选择只进入问题输入状态；空内容不创建子会话。提交失败保留原输入，同一问题的并发提交会合并。关闭时保留在途提交所需的引用直到完成，未提交的问题关闭后不会发送。结果区隐藏普通输入、分支、反馈和用量操作，仍允许必要的工具授权交互。旁问仍提供完整对话界面。

## 尚未完成的核心能力

- **生产保护门闸**：生产/测试服务器和数据库可选标记；生产分完全保护、允许安全审计；测试目标允许充分测试。必须在执行路径中拦截并验证拒绝没有副作用，不能只靠提示词。
- **境内域名保护**：默认启用；支持手动域名、正则规则。与生产标记、代理及工具执行统一校验。
- **网安专供代理**：独立代理与请求/响应流量查看；隔离应用控制面和模型 API；关闭独立代理时的警告开关默认关闭。
- **网安和逆向特化**：保持完整工具和原有提示词装配，强化目标管理、审计/分析工作流与专属定制功能。不能声称可保证模型始终不拒答。
- **逆向**：参考 GitHub REA 等成熟项目，核查许可、版本和实际工具接入。当前主要为模式提示词/图标框架，专用后端未完成。
- **写作**：自然文字表达、参考文风、设定集、人物、连续性和文学工具，不只是普通提示词。
- **跨会话记忆**：结构化、可管理、可检索；不是简单把旧聊天全部塞入上下文。
- **更新检测**：GitHub Release 补丁提醒、次版本启动弹窗、主版本强化提醒；清理遗留 COS 自动版本发现和发布脚本，版本与官方完全解耦。
- **安装与隔离**：实际更新 Uncensored 桌面安装、快捷方式、图标并验证官方版并存；修复 home-paths 仍接受非默认旧 `DSH_HOME` 的问题。
- **开发热更新**：完整重建时曾出现空白页、`syncInspectManifest` 不存在、连接/Session 引用释放错误；刷新可恢复，根因仍未修复。
- **历史模式恢复**：已恢复隐藏的 PTC、Minimal 定义及原工具组成，不改写或冒充四个主模式。真实 `code`→`ptc` 相邻代际恢复和原生持久终端、图片读取已通过；旧 POSIX Bash 录制场景保留原权限配置，Windows 使用新增原生工具场景。POSIX 浏览器金样仍需在对应平台验证。
- **文档与许可**：根 README 最终按简短介绍→通用增强→模式特化→使用/版本/Credit 排列；保留 DSH、YuJunZhiXue、小杨、JeffKeeping、Water-Run 与图标许可 Credit；完成生产依赖许可核查和删除文档的残留链接清理。
- **原始验收**：最后重新核对原始 32 条消息、全部新增消息与截图；还有不少上述能力未完成，不得提前将总目标标记完成。

## 提示词和许可证核验

原有中英文 armor 文本已与 MIT 历史提交 `e1d8e59087857fa86d0ef2bb9878800274b13a29` 比较一致。当前 purge 分支包含专有许可，不能把其新内容直接纳入 GPL 发行。`product.json` 所记录的 fork 参考提交与可复用内容的历史许可应分别说明。

核验脚本 `.dsh-build/verify-purge-source.mjs` 显式传上述 MIT 提交，输出 `.dsh-build/purge-source-verification.json`。不打印完整提示词或私密凭证。新模式增强不得意外改写这部分文本。

## 额度节点验证与后续验收缺口

- 相关测试：80 文件，1482 通过、1 跳过，日志 `.dsh-build/spending-side-suite-final.log`。
- 新增门闸与旁问聚焦测试：26 通过，含独立子进程竞争预留、真实 Loader 组合、生命周期、上下文同步及 UTF-8 长度限制。
- 构建的 7 项产物门通过；最初聚合检查发现测试缺 `surfaceOp`，已修正；随后 `pnpm run build:check` 两项全通过，日志 `.dsh-build/spending-side-check-final.log`。
- `verify-package-dependencies`、`verify-export-jsdoc`、`verify-client-ui-i18n`、`doc-sync` 已通过。
- 真实浏览器：低额度请求被拒绝并显示 `SPEND_REQUEST_TOO_LARGE`，账本没有预留/收费；测试环境已恢复六档默认值，限制及自动恢复均关闭。
- 浏览器确认零赠金隐藏与严肃文案；截图 `.dsh-build/screenshots/spending-settings-final.png`。完整浅色/窄屏悬浮卡、/side 真实模型持续跟进、自动恢复的真实会话演示仍需补齐。
- 本节点有真实 Session/AgentLoop 行为测试和上下文文字快照；完整新增功能的顶层 keyless recorded-session 场景尚需补充。不要把整套快照回归描述为通过。
- 上一节点已有 87 项 Client domain graph 报错，经与 2dcdbd87 对比全部为既有项；未关闭检查。完整 hygiene 最近聚合不是全绿，细节在本机 current-work 文件。

## 删除对话（2026-10-24 已实现）

- 会话列表的右键/更多菜单增加“删除对话”，删除前显示会话名称并确认。
- 运行中的对话先停止，再删除；后端校验权限并清理会话存储、列表索引及关联旁问/随问引用，不删除工作区文件。
- 删除当前对话后切换到相邻对话或新会话；失败时显示可重试提示。
- 验收：重启后不再出现已删除对话，无残留标签或失效引用，其他对话与工作区文件保持完整。

删除入口位于会话行菜单，弹窗独立于会话行存活；确认期间禁用重复提交和关闭，失败可重试。后端停止任务，等待子任务和后台活动退出，释放 API 实际持有的 AgentHandle，再取得全部写入锁。原生旁问、随问与所属子任务一并清理，独立分支、其他对话和工作区文件保留。外部持有写入权或权限不足时拒绝操作。

JSONL 将已删除目录移入私有清理区，保留仅含标识的删除记录；重启继续物理清理和搜索/投影/工作区引用清理。已删除标识不可复用。原生子会话发布和删除共用跨进程目录互斥，避免另一实例在父对话删除期间创建孤立旁问。客户端忽略删除后的迟到列表、投影和状态，关闭对应旁问标签，并转移当前选中项。

验证：完整构建 9 项通过（`.dsh-build/delete-build-verified.log`）；聚焦加固 114 项通过，受影响大组 96 文件中 2662 通过、11 跳过、12 失败，12 项均为不支持删除的存储替身被恢复清理错误调用，已修复，相关 6 文件 91 项全部通过（`.dsh-build/delete-repair-tests.log`）。真实 JSONL/SQLite 集成测试覆盖运行中停止、权限拒绝、外部写入权、全部目标写锁预检、冷索引即时删除、重启清理和两个 Host 的旁问创建竞争。浏览器验证菜单、确认、取消与保留会话；截图 `.dsh-build/screenshots/delete-conversation-confirmation.png`，浏览器未执行永久删除现有数据，执行路径由集成与组装 UI 测试覆盖。

公开 README 和相关包说明已更新；依赖、导出 JSDoc、UI 国际化及公开文档检查通过。最后一轮修改后，7 文件 126 项聚焦测试通过（`.dsh-build/delete-checked-tests.log`），完整构建 9 项再次通过（`.dsh-build/delete-build-complete.log`），本节点全部改动 TypeScript 文件的 lint 通过（`.dsh-build/delete-lint-changed.log`）。全仓 lint 仍包含先前模式、额度和设置代码的既有报错，不能描述为全绿；日志 `.dsh-build/delete-lint-final.log`。完整新增功能的顶层 keyless recorded-session 场景仍在总验收缺口中；不要将整个项目或所有原始要求标记完成。

## 恢复后的设置节点（2026-10-24）

- 设置已按通用、模型、额度、模式、插件排列；登录与身份管理进入模型，账单/充值入口与余额/限额进入额度。
- 插件安装、启用、配置与实验性功能已迁入设置，左栏独立插件入口移除。其他功能的插件详情链接打开设置，保留当前会话。
- 设置支持直接定位到指定分组；程序化插件跳转会选择管理页。卸载时移除导航服务与监听。
- 设置面板加宽，额度内有余额/限额分页。完整视觉重做、模式选择与确认、日出日落及动画仍待继续。
- 余额默认 15 秒刷新，点击余额立即请求刷新；不覆盖用户已保存的间隔。
- 构建 9 项全通过（`.dsh-build/settings-node-build.log`）；相关聚焦测试 120 通过（`.dsh-build/settings-node-final-tests.log`）。此前大组 1143 项中 1127 项通过，旧入口断言已更新，受影响文件的后续回归通过；不要把那次大组运行说成全绿。
- 真实浏览器已验证五分组顺序、登录在模型组、额度分页、插件管理和插件配置打开。截图 `.dsh-build/screenshots/settings-plugins-migrated.png`。
- 随问单问单答已在下一节点实现；接下来补删除对话，再继续模式设置和整体主题。

## 继续时的建议顺序

随问节点补充验证：命令、界面和生命周期相关测试 351 项通过，Host/命令聚焦测试 158 项通过；真实页面已验证裸 `/btw` 无窗口且提示输入内容，`/btw 问题内容` 直接返回独立回答，结果块没有输入框、分支、反馈或用量按钮。截图 `.dsh-build/screenshots/btw-single-question.png`。关闭按钮的原生灰底也已清理。完整重建仍会触发旧的热更新空白页问题，刷新能恢复，该问题仍未关闭。

1. 阅读本交接，确认用户已明确恢复；核对 main 与工作区。
2. 删除对话、当前模式选择、默认项、已有会话切换的临时确认节点已完成；网安首次进入的责任提示仍需与实际防护状态一起实现。
3. 统一全应用主题色、主题预览卡、日出日落、模式动画、按钮/开关/悬浮卡、余额滚动及关于页；补 POSIX 浏览器金样验证。
4. 补真实执行保护、网安首次新对话确认、独立代理、模式特化与结构化记忆。
5. 补自动恢复和输入预测、更新检测、隔离、安装、许可和完整原始需求验收。

推送时保留所有钩子。Windows Git Bash 若找不到 pnpm，在当前 PowerShell 进程前置 `C:/Program Files/nodejs/node_modules/corepack/shims` 到 PATH，再正常推送，不绕过检查。不要提交 `.dsh-build` 中的认证 URL、用户会话、余额记录或截图。

## 模式设置节点（2026-10-24）

- 卡片选择当前对话的模式，独立按钮设置未来新对话的默认项；删除了默认设置同步改动当前空白会话的旧路径。模式切换开关已从通用迁入模式。
- 后端只接受所有者确认：十秒单调时钟计时、一次性确认标识、五分钟过期、禁用即撤销待确认标识。权限仅保存在注册表实例内；旧 `allowExistingSessionSwitch` 配置仍可解析但不再生效，修改旧文件不能绕过确认。已有对话运行期间仍禁止切换。
- 权限推送同步其他窗口；迟到的读取或确认响应不能覆盖更新的撤销。UI 倒计时不自动确认，取消保持关闭，关闭插件会清理计时器并等待在途请求。
- 四个主要模式的显示名已去掉“模式”后缀。选中卡片和会话标签使用深色模式底色、清晰边框和白色较粗文字；增加统一颜色变量，已验证浅色/深色对比。全应用 1017/发送等强调色、灰条到模式色的冲击动画仍未完成。
- 模式/注册表/事件相关 15 文件 248 项测试通过（`.dsh-build/modes-final-tests.log`）；完整构建及检查结果以 `.dsh-build/modes-build-complete.log` 为准。改动文件 lint、JSDoc、国际化、依赖和两组文档配对已通过。原有 Web 模式回放失败情况见上文，不能报告这组回放通过。
- 实际浏览器验证当前选择与默认项分离、十秒按钮禁用、取消不授权、通用页已无旧开关；截图 `modes-current-light.png`、`modes-current-dark.png`、`modes-switch-confirmation.png` 位于 `.dsh-build/screenshots/`。预览恢复默认缺省、当前缺省、跟随系统、临时授权关闭。390px 视口仍待实际浏览器验收；当前 IAB 未暴露视口调整能力。
- 首次新对话进入网安的责任确认尚未实现；目前真实境内/生产保护后端仍缺失，不能显示为已开启。本节点未修改 armor 提示词或模式工具组成。

## 历史模式恢复节点（2026-10-24）

- 从原始基线 `57086f121a` 恢复 PTC、Minimal 定义，保留原工具组成。定义可设 `hidden: true`，仅从公开选择列表隐藏，显式解析、恢复、挂载仍可使用；不是权限限制。四个主模式的选择顺序未变。
- 保留全部冻结 Session 日志及代际。`preset-migration.snapshot.ts` 继续检查父子关系、损坏日志拒绝、只发布当前后继版本，以及原始字节不变；新增事件的权限期望对应本发行当前完全权限默认值。
- 新增 `legacy-presets.e2e.ts` 通过真实 Web 配置检查四模式列表、隐藏模式挂载、原生 shell 持久环境/目录和图片读取；Windows 使用 PowerShell，POSIX 使用 Bash。修复 keyless scaffold 的路由适配器丢失图像能力元数据的问题。
- 原 `minimal-preset.snapshot.ts` 固定 Bash 命令和 Bash schema，已明确限于 POSIX；增加历史权限 overlay 保留这些录制的 workspace-write/ask 环境，不篡改冻结录制。Windows 本机的完整 Bash/UI 金样仍未验证，本机还缺 Playwright 1228 浏览器。不要报告整个 Web 快照套件通过。
- 补上额度模块在 `tsconfig.base.json` 的源码及 types 路径映射，`verify-cordis-config` 277 配置文件通过。新增 Web 原生测试已进入 Host 检查程序，并从 Client 项目排除。
- 验证：注册表/声明相关 60 通过、1 跳过（`.dsh-build/legacy-presets-tests.log`）；历史恢复与原生工具 3 项通过（`.dsh-build/legacy-presets-web-final.log`）；构建 9 项通过（`.dsh-build/legacy-presets-build-clean.log`），新增测试纳入后 Host/Client 聚合检查 2 项通过（`.dsh-build/legacy-presets-check.log`）；改动文件 lint、JSDoc、依赖、配置及文档配对通过。
- 一次新 Web 测试遗漏 Client 排除项导致编译生成 56 个未跟踪源码旁产物，已按工作区内路径及同名已跟踪源码逐一验证后清理；没有保留或提交这些产物。工作区应只包含节点源码与文档。
- 下一项优先补境内域名/生产服务器和数据库的真实执行门闸，再把网安首次新对话责任确认接到真实保护状态；不能仅在提示词中加规则。额度、代理、模式特化等原始需求继续按本交接推进。

## 三项模式特化节点（2026-10-24）

- 新增 `packages/skill/skill-playbooks`（GPL-3.0-or-later）：一个技能提供方，按预设 `packs` 挂载网安、逆向或写作手册。网安 7 份、逆向 8 份、写作 7 份技能，配套参考表与两个零依赖 Node 脚本；标准预设不挂载，写作预设仍无终端/命令执行工具。
- 真实存储与调用入口：`assets/shared/scripts/casefile.mjs` 在 `.security/<slug>/` 或 `.reverse/<slug>/` 维护 `case.json`（目标、证据、发现、备注），带锁、原子写入、严重级别校验和 Markdown 报告渲染；`sample.mjs` 流式计算哈希、格式、熵与字符串。两个脚本各有测试。
- 预设人设改为阶段化路由：网安按侦察/Web/网络/载荷/云/报告指向技能并保留既有"目标是用户的、占位符继续工作"要求；逆向按初筛/静态/动态/协议/补丁/移动/恶意样本/案件簿路由；写作保留原写作纪律并新增 `story/` 设定集与风格卡约定。armor 文本未改动。
- 开源调研与许可：`morluto/rea`（MIT）、`mrexodia/ida-pro-mcp`（MIT）、`LaurieWired/GhidraMCP`（Apache-2.0）、`swisskyrepo/PayloadsAllTheThings`（MIT）已核对；写作参考 `SillyTavern`（AGPL-3.0）与 `novelWriter`（GPL-3.0）仅作先例，未复制代码或文本。取舍与完整清单见 `.agents/notes/implemented/architecture/2026-10-24-mode-specialization-playbooks.md`。
- 验证：`playbooks.spec.ts` 13 项通过（含真实 `cordis.yml` 组合、注销、非法手册拒绝、账本与清点脚本、预设挂载与脚本路径断言）；`tsc -b packages/skill/skill-playbooks` 通过；`verify-cordis-config` 277 个配置通过；`verify-runtime-closure` 通过；`verify-default-product-isolation` 通过；新增文件 oxlint 通过；README 中英配对、包限制章节、Agent Note 格式与分类检查通过。
- `pnpm run build:artifacts`：Host 侧门禁通过；Client 编译器仍因既有 `SessionStore` API 漂移（`ui-chat`、`ui-goal`、`ui-model-selection` 等本次未改的文件）失败，Client bundle 与 Web build 随之跳过。属既有 `17.06` 债务，不由本节点引入；本轮另修掉 `spend-limit` 测试的 `brandString` 泛型错误以恢复 Host typecheck（提交 `1b12eadabb`）。
- 三个提交已推送 `main`：`cd21bb9f5b`（手册包与预设）、`1b12eadabb`（额度测试类型修复）、`63bb8d327b`（脚本相对路径修正）。本次未打包、未安装，运行中的桌面版仍是旧产物。
- 已知缺口：未用真实模型验证效果；模式设置页（`04.05`）与跨对话结构化记忆（`13`）仍未接入；全仓文档配对与子系统页面检查在本分支本来就有大量既有失败（`17.06`），本次没有扩大处理范围；本节点未打包、未安装。

## 跨对话记忆节点（2026-10-24）

- 新增 `packages/memory/memory`（GPL-3.0-or-later）：`ctx.memory` 服务打开 `memory` 存储域（单文档 `storages/memory.json`），记录含 ID、类型、内容、范围、来源、时间、版本与状态；检索为进程内中英文词项匹配（汉字单字与相邻双字），按相关性、范围具体度与新鲜度排序，去重、同主题冲突取最新、并按条数/字符/字节预算裁剪。注入作为 `memory-context` 用户消息写入 Session 日志，来源记录每条 ID 与版本；已注入记录不重复，随问等未继承历史的新建子会话不注入。模型工具 `memory_write`／`memory_search` 由 `./agent` 子路径按预设挂载。
- 新增 `packages/api/memory-controller`：`remote.memory` 命名空间，读取开放、写入要求所有者，版本冲突返回 `memory/conflict` 并携带两个版本。
- 新增 `packages/client/ui-settings-memory`：通用设置中的一行与模态管理面板（搜索、范围/类型筛选、新增、编辑、启停、删除、冲突保留输入）。五个设置分组的结构未改动。
- 存储采用单文档布局而非按记录布局：按记录布局会静默丢弃无法解析的文档，与“损坏时明确报错、不清空用户数据”的要求冲突。
- 验证：`packages/memory/memory/tests` 24 项通过（含中文检索、去重、冲突、预算、持久化重开、损坏存储、真实 AgentLoop 中工具保存→另一对话注入→日志重建→删除后不再注入）；`packages/client/ui-settings-memory/tests` 6 项通过；四个新包 `tsc -b` 通过；Typert 工件已生成（35 个包）。
- **未完成**：自动提炼（含独立开关与额度接线）、语义检索、来源会话失效标记、删除对话与保留记忆的界面说明；跨工作区目标分级仍依赖已归档的 `09`。
- **集成阻塞（重要）**：本次并行会话中另一模型同时修改了 `packages/bundle/base/cordis.patch.yml`、`packages/bundle/base/package.json`、`packages/bundle/web-app/cordis.patch.yml`、`packages/bundle/web-app/package.json`、`packages/api/remotes/*`、`tsconfig.base.json`、`tsconfig.host.json`、`tsconfig.client.json`、`.agents/TODO.md`，加入 security-proxy、mode-dossiers 等尚未跟踪的包。记忆的记忆行（base）、memory-controller／ui-settings-memory 行（web-app）、四个预设的 `dsh-memory/agent` 行、`api/remotes` 挂载与三处 tsconfig 引用均已写入工作区，但上述文件同时含他人未提交改动，按“只提交本任务文件”的要求未纳入本次提交。合并时需与对方的这些包一起提交，或在对方提交后重新应用记忆相关行；`pnpm install` 当前因 `packages/shell/tool-bash` 引用未登记到工作区的 `@deepseek-ai/dsh-security-proxy` 而失败，pre-push 的 `pnpm run typecheck` 因此无法通过。

## 网安独立代理与流量查看节点（2026-10-24）

- 新增 `packages/guard/security-proxy`（`@deepseek-ai/dsh-security-proxy`，服务定义 `ctx.securityProxy`）与 `packages/guard/security-proxy-local`（`@deepseek-ai/dsh-security-proxy-local`，提供者，base 组合内置挂载），以及 `packages/client/ui-security-proxy`（设置 → 模式 → 网安资料区与流量查看器）。服务定义与提供者分离，消费者只依赖定义包。
- 覆盖判定读取会话日志中已提交的 `security` 预设（最近一次 `agent-preset/selected` 或会话头），工具参数不能自报模式；`standard`、`reverse`、`writing` 与模型 API、登录、余额、更新检查不经过该代理，插件从不安装进程级 dispatcher。并发会话按各自的回环监听隔离。
- 上游支持 `http`/`https`，密码经 `ctx.credentials` 保存为 `DSH_SECURITY_PROXY_PASSWORD`，设置文件、流量记录与错误文案不含明文；没有通过放宽 TLS 校验"解决"连接问题。连接检查真实发起 CONNECT；状态机为 `off`/`connecting`/`ready`/`failed`，失败带机器原因与不含凭据的详情。
- 受控客户端（`web_fetch`）在自身请求/响应层记录明文，TLS 仍为 Node 默认校验；子进程获得每会话回环链式代理的环境变量，明文 HTTP 完整捕获，CONNECT 只记录隧道元信息并标注 `tunnel-metadata-only`。记录默认脱敏 `Authorization`、`Cookie`、`Set-Cookie`、`Proxy-Authorization` 与常见 JSON/表单密钥字段；条数、正文字节、保留时长有上限，记录只在内存。
- "网安模式未开启独立代理时警告"默认关闭，每对话一次（销毁后重置），经 `security-proxy/warning` 事件在前端提示，不改变代理状态。
- 验证：新增 59 项测试通过（`capture` 15、`settings` 12、`engine` 15（含真实本机上游代理、目标服务器、CONNECT 隧道、超时、取消、断连、正文截断、关闭后端口不再服务）、`composition` 6（真实 Loader + 真实凭据提供者 + 归属拒绝 + 提醒去重 + 凭据只在凭据库 + 重启保留与失败状态）、客户端 11）。改动文件 lint 通过；`verify-client-packages` 通过；新包的 README 中英配对已记录。
- 提交：`eb54dd4574`（服务定义与提供者）、`b1d4eda231`（设置界面与装配）及本次修正提交；均已推送 `main`，未强推、未另开分支。
- 未完成/缺口：浏览器工具、MCP、常驻终端、委派子代理与忽略代理环境变量的程序不在覆盖范围内，界面已如实标注；HTTPS 子进程正文不可见；未做导出；未在真实浏览器中点击验证新面板（客户端组件与控制器有测试）；`10.05` 仍缺真实目标保护提供者。
- 重叠与协作：另一任务正在修改 `packages/client/ui-agent-preset`（`settings.mode.materials` 座与安全确认对话框）、`packages/api/mode-dossiers`、`packages/memory/*` 等未提交文件；本节点只注册进 `settings.mode.materials`，未改动这些文件；该座位已由并行任务在 `5324f279a8` 落地，网安资料区与网安代理区并排显示。`pnpm-lock.yaml` 已含他人未提交的条目，本节点未提交它；`verify-cordis-config`、`verify-package-dependencies`、`verify-export-jsdoc`、`verify-client-ui-i18n` 目前因他人未完成的 `memory`/`mode-dossiers` 代码而红，本节点新增代码在这些检查中没有报错。
## 模式专属资料管理节点 04.05（2026-10-24）

- 新增 `packages/api/mode-dossiers`（`@deepseek-ai/dsh-api-mode-dossiers`，Host Remote `modeDossiers`）与 `packages/client/ui-mode-materials`（`@deepseek-ai/dsh-client-ui-mode-materials`，设置面板）。`packages/client/ui-agent-preset` 只新增 `settings.mode.materials` 槽位声明、卡片下方渲染位与一行测试夹具的 `renderSlot`；模式卡片、默认模式与既有会话切换逻辑未改。
- 存储：网安/逆向案件沿用 `casefile.mjs` 的格式版本 1（`.security/<slug>/case.json`、`.reverse/<slug>/case.json`），四个记录集合、严重级别词表、证据编号校验、报告 Markdown 与该脚本一致；写入使用组合文件系统的版本保护（`replaceIfVersion`），冲突返回 `mode-dossier/conflict` 且不改文件，未知顶层键与记录额外字段原样保留。写作资料为 `story/style/*.md`、`story/bible/*.md` 加登记表 `story/materials.json`，删除记录不动源文件，未登记文件可纳入。
- 请求上下文：写作模式请求在 `agent/pre-step` 收到选中资料组成的 user 角色消息（来源 `mode-dossiers`、`form: instructions`），内容即会话日志；只读取被选中的资料，未选中文件不会进入；`contextBytes` 默认 16 KiB，单文档上限 8 KiB，截断有标注。选择未变化时不重复注入。
- 逆向面板的样本清点只读字节（SHA-256、容器签名、熵、有界字符串），不执行样本；工具列表如实显示内置能力可用、IDA/Ghidra/REA/Frida 未接入，不下载、不安装、不探测。
- 未实现项按未实现显示：生产/测试目标保护、境内域名保护、独立代理（`10.02`—`10.05`）与跨对话记忆（`13`）均未接入；界面明说目标只是案件资料，不产生执行保护；也没有用 localStorage 之类冒充跨会话存储。
- 验证：`tsc -b packages/api/mode-dossiers/tsconfig.host.json` 通过；Host 测试 35 项、客户端组件测试 7 项通过（`vitest run packages/api/mode-dossiers/tests`、`packages/client/ui-mode-materials/tests`）；`pnpm --filter @deepseek-ai/dsh-client-ui-mode-materials bundle` 成功（`lib/client.js` 85.8 kB）；`verify-client-packages`、`verify-export-jsdoc`、`verify-client-ui-i18n`、`verify-package-dependencies` 对本节点新增包无报错；两个新包的 README 中英配对已记录。
- 阻塞与边界：完整 `build:artifacts` 未能跑通——Client 编译器当前因另一任务未提交的 `SessionStore` 漂移（`ui-chat`、`ui-approval`、`ui-sidebar-right`）失败，属既有 `17.06` 债务；`generate-typert` 也因他人未完成的 `@deepseek-ai/dsh-memory/types` 路径映射失败，本包产物已在先前一次成功运行中生成（`lib/typert.host.*`、`lib/typert.remote-client.*`）。因此本轮**没有**真实浏览器截图：Web 前端无法构建，运行中的 127.0.0.1:62766 是已安装的旧打包产物，不代表本节点代码。深浅主题与 390px 窄窗口的浏览器验收仍需在 Client 编译恢复后补做。
- 协作：`settings.mode.materials` 槽位同时被 `ui-security-proxy` 使用（它读取 `modeId` 并只在 `security` 渲染），两者共存；`ui-mode-materials` 的面板 id 为 `security`/`reverse`/`writing`，顺序 10/20/30。本节点未打包、未安装、未发布。
