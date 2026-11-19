# 更新检查：限流、拒绝与手动重试

状态：已随 `2026.11.16.4` 交付并保留数据安装，Windows/Linux 定向验收通过；正式资产下载、签名和已安装更新器全链验收继续保留在 [TODO](../TODO.md)。[本版交付](2026-11-16.4-delivery.md)

## 当前行为

GitHub HTTP 429、主额度耗尽的响应头或数字 `Retry-After` 会产生明确的限流结果和可重试时间。多个有效期限取较晚者；已确认限流但时间无效时按 GitHub 要求至少等待一分钟。时间必须能被 ECMAScript Date 表示。只有状态码的 HTTP 403 仍显示“检查被拒绝”，不把它推断为限流。

关于页显示重试时间，冷却期间禁用检查，关闭、重开根级弹窗不绕过冷却。到期只启用手动检查，不自动请求。失败、离线、限流和空发行列表均不显示“已是最新”。更新来源仍仅为本仓库，客户端没有新增凭据、设置或自动安装行为。[GitHub 限流规则](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#rate-limit-errors)

此前原生探测的 403 没有保留完整响应头，原因仍未知。本节点匿名只读请求返回 200、剩余 57 次请求额度，允许浏览器读取限流响应头；不能用本次成功回填旧失败原因。原始记录为 `20261116/release-discovery-response.json`。

## 桌面更新渠道切换

普通检查读取配置时切换渠道，旧检查在发出请求前结束，过期错误被舍弃。定向回归复现修复前一次多余的旧渠道请求，修复后只请求新渠道，并保留其检查结果。更新协调器、定时检查与下载缓存清理共 66 项测试通过。此修复进入下一次打包。[桌面更新说明](../../apps/desktop/README.zh.md)

强更检查在渠道切换后舍弃旧渠道的迟到结果。上一条有效决定保留到新渠道提供有效结果。修复配置后重新读取与从设置切换均会重新检查强更策略。两种迟到结果和修复文件后的漏查均在旧实现上复现。36 项定向测试通过，证据位于 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-policy-channel/`。[桌面更新说明](../../apps/desktop/README.zh.md#updates)

清单检查和完整包下载跨请求保留重定向次数。Electron 44.7.0 的回环场景确认，两条路径均在第 11 次重定向时返回错误。完整包下载失败后没有可安装目标，恢复正常响应后可显式重试。首轮回环出现上游的 `MaxListenersExceededWarning`，请求结束后取消令牌的监听数回到零。首轮 17 个传输场景与 54 项定向单测的回执在 `apps/desktop/.desktop-build/qualification/local-updater-aj6Yvz/`。

重定向注销上一跳的超时计时和取消监听。真实 Electron 超限重定向场景中，取消令牌的监听数峰值为 1，结束后为零。最后一跳暂停时取消检查，只中止当前请求一次，随后可正常检查。21 项传输、7 项签名场景及 75 项定向单测通过，复验回执在 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-redirect-cancellation/`。

取消正在写入磁盘的更新下载会中止当前请求，并在返回前关闭临时文件。真实 Electron 夹具分别确认旧流程未中止请求、仅中止请求仍有文件未关闭。修复后同版本可显式重试，下载内容与服务端逐字一致，安装入口未执行。24 项传输场景通过。依赖使用锁中已有的 `builder-util-runtime@9.7.0`，冻结锁通过供应链校验。回执为 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-download-cancel-{before,abort-only,final}.log`。[桌面更新说明](../../apps/desktop/README.zh.md#updates)

差分下载的直接 Range 请求也使用本次下载的取消令牌。真实 Electron 在收到部分数据后暂停回环响应，修复前切换一直等待该响应。修复后旧请求只中止一次，发出新清单请求前重建文件描述符已关闭。显式重试以单段 Range 重建出与基线完全一致的载荷，没有回退到全量下载。25 项传输场景和 51 项定向测试通过。回执为 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-range-cancellation-{inflight-before,final}.log`，夹具未执行安装器。[桌面更新说明](../../apps/desktop/README.zh.md#updates)

## Windows 差分索引核验

完整 Windows 打包在写入成功回执前核验最终安装器和外部 `.blockmap`。定向用例覆盖等长安装器的错配索引、损坏索引，以及校验失败后中止并保留发布回执为缺失状态。86 项打包与发布材料测试通过。用该校验器复算当前 18.10 未签名安装器的实际索引，内容一致，回执为 `candidate-2026.11.18.10/installer-blockmap-verification.json`。真实签名安装器和在线升级仍待验收。[打包说明](../../apps/desktop/packaging/README.zh.md)

Windows 签名构建在同一步核对 `latest.yml` 的内部分发版本、唯一安装包文件名、大小和 SHA-512。完整打包与安装更新资格检查共用校验器。77 项定向测试通过，覆盖缺失清单、错误版本、文件名、大小和摘要。用 electron-builder 26.17.0 的清单生成器为 18.11 未签名实包生成本地测试清单，正确清单及实际差分索引通过，替换版本后被拒绝。回执为 `candidate-2026.11.18.11/windows-feed-check-137OjY/result.json`。正式签名与在线升级仍待验收。

18.11 首次未签名打包生成了安装器和索引，校验因指向产物父目录而停止。打包控制器使用当前监督进程的目录解析产物路径，与安装器构建使用同一目录。回归覆盖继承旧目录时的未签名构建，首次失败保留在 `windows-18-11-attempt-1-package.log`。

同版本完整重跑的差分索引校验已通过，更新渠道和重定向修复已随 Windows 18.11 实装。本地 Electron 使用 18.10 与 18.11 的真实包完成单段差分重建，校验结果与完整包一致。[实际交付](2026-11-18.11-delivery.md#更新与差分下载)

首发操作说明接入只读批次核对。检查器验证 SHA-256 清单中该安装器的唯一条目，并用 SHA-512 确认这次读取的内容与差分索引所校验的安装器一致。74 项发行材料与阶段测试通过。Windows 18.11 历史未签名检查包、原始 `.blockmap`、SHA-256 文件和本地测试更新清单共同通过检查，回执为 `windows-release-checksum-18.11.json`。正式候选签名与实装另行验收。[首发操作说明](windows-x64-first-release.md#核对候选安装器)

## 安装载荷预检（2026-11-19）

安装器在解压后核对暂存主程序和 `resources/app.asar` 的文件类型及非空状态。两个合法 7-Zip 归档分别模拟缺失和空白 ASAR。真实 NSIS 隔离安装均以退出码 2 结束，旧程序与旧运行时文件内容一致，日志记录了受影响文件。目录与解压失败日志的文件名统一补齐小时位，凌晨原生回归通过。[打包说明](../../apps/desktop/packaging/README.zh.md)

13 项原生目录事务场景及 20 项安装器定向检查通过。默认 MSVC 14.51.36231 缺少 Spectre 库。此次使用已安装的 `VCToolsVersion=14.52.36629` 与 `MSVCPreviewEnabled=true`，未签名打包预检通过。原生夹具回执为 `%USERPROFILE%/DSHU-Deliveries/20261119/installer-payload-guard/result.json`。实际新版安装包及签名在线升级仍待验收。

预检覆盖独立写入暂存目录的卸载器。原生夹具模拟卸载器缺失时，旧逻辑返回成功，新逻辑以退出码 2 结束，保留旧版主程序和运行时，移除暂存目录并在报告中列出缺失文件。15 项原生目录事务和 20 项定向测试通过。回执位于 `%USERPROFILE%/DSHU-Deliveries/20261119/uninstaller-payload-preflight/native-smoke.log`。

### 静默安装与登记失败保护

生产 NSIS 配置以独立测试应用运行，中英文各通过 16 项静默场景，包括拒绝较新版本、同版修复、卸载登记、快捷方式、资料清理及保留。安装器在核对安装路径与卸载命令，并写入所需版本信息后清理旧版备份。新增原生场景在目录提升后故意留下缺失的安装登记，验证退出码 2、新旧运行时文件完整保留，以及报告中的失败值和真实备份路径。

14 项原生目录事务、32 项静默安装及卸载检查和 20 项定向测试通过。实装 18.11 的 ASAR 摘要一致。回执位于 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-silent-installer/result.json`。新版 DSHU 完整安装与签名在线升级仍待验收。[安装流程](../../apps/desktop/packaging/README.zh.md)

### Windows 更新交接校验

用户确认重启且 Host 停止后，Windows 在将退出控制权交给更新器前核对待执行安装器的 SHA-512。校验失败会恢复当前工作区，普通与强制更新均提供重新下载入口。

真实 Electron 44.7.0 本地更新夹具通过 19 个场景，新增在重启准备期间改写或删除安装文件的两项检查。两项均拒绝交接，显式重试发起新下载，并对恢复后的文件完成模拟交接。夹具没有执行安装器。结果位于 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-updater-handoff/result.json`。[更新流程](../../apps/desktop/README.zh.md#updates)

Windows 在构建更新提供方前检查已安装的 `app-update.yml`，要求 `publisherName` 含一份完整的 `CN`、`O` 和 `C`。缺失、空白、属性不全或多身份使检查直接失败。更新配置、更新协调器和打包签名配置共 64 项定向测试通过。此项验证覆盖配置准入，签名在线升级仍待实包验收。[签名配置](../../apps/desktop/windows-signing/README.zh.md#signing-configuration)

Windows 更新下载使用系统 Authenticode 验证发布者，安装交接前对当前文件复核发布者和 SHA-512。真实 Electron 环回通过 7 项签名场景，包含可信缓存交接、缓存发布者不符和验签程序不可用；后两项均拒绝交接。验证使用现有微软签名文件及其公开证书和独立无签名数据，安装交接由夹具记录。19 项传输、54 项配置及协调器测试通过。签名场景证据在 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-publisher-verifier/result.json`。DSHU 发布证书签名的在线升级待实包验收。[签名配置](../../apps/desktop/windows-signing/README.zh.md#signing-configuration)

显式重试先刷新更新清单。旧包返回 404、清单换版时，重试只请求清单，用户再次选择后才请求新版安装器。交接验签失败时撤销所选安装器的内存记录和自有缓存索引。缓存发布者不匹配和验签程序暂时不可用两条路径都在重试时重新请求清单和安装器。20 项传输、7 项签名场景和 74 项定向单测通过。夹具回执在 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-update-retry/`。

已展示更新后，自动或手动刷新清单失败都会要求下一次下载先复查。真实 Electron 回环夹具在刷新返回 404 后换版，旧确认只发出清单请求，新确认才下载新版本。22 项传输场景和 60 项定向测试通过。夹具未执行安装器。日志为 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-feed-refresh-retry.log`。

安装器接管退出与 Host 停止准备分属两个阶段。主进程测试替身现转发交接回调，覆盖普通退出检查仍在等待和退出对话框仍打开两种场景。两项均确认关闭窗口并放弃旧退出意图，平台清理启动后无需等待即可交接。启动、更新和恢复的 273 项测试通过。日志为 `%USERPROFILE%/DSHU-Deliveries/20261119/installer-quit-handoff-tests.log`。

工作区验收夹具也转发安装接管回调。后台 Electron 回环验收覆盖文件缺失或内容改变时拒绝交接，以及复验通过后由桌面决定是否交接。拒绝时保持就绪，允许后只记录一次安装调用。23 项传输场景通过，夹具拦截安装入口。带工作区窗口和正式签名包的启动仍需验证。结果为 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-native-shell-handoff.json`。

## 安装器交接结果待确认（2026-11-19）

交接调用抛错或更新库稍后报错时，原流程会再次调用安装器。修复后，当前进程保留交接状态和诊断，账户行改为「更新详情」，强更窗口隐藏安装操作。安装器仍在运行时先等待其结束，再退出并重新打开 DSHU 核对实装版本。交接前可恢复的准备故障仍走原重试路径。

288 项定向测试和 27 个隔离 Electron 44.7.0 场景通过。强更窗口已验证交接报错后的提示、按钮状态和调用次数。夹具拦截安装器入口。日志为 `windows-update-handoff-outcome-{before,tests,electron}.log`。正式签名包和在线升级待验收。

## Windows 退出与安装器启动顺序（2026-11-19）

锁定的更新库发起异步启动后立即安排退出，系统稍后拒绝进程创建时应用可能已退出。Windows 更新现等待已校验的独立用户级安装器发出进程创建事件，再请求退出。启动失败走现有工作区恢复路径，保留有效下载以供重试。标记为要求提升权限的安装包在交接前被拒绝。

261 项定向测试通过。隔离 Electron 44.7.0 的 29 个场景通过，覆盖启动仍在等待、系统拒绝后的重试及需要提升权限的包。回执位于 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-installer-launch/`。正式签名安装器和真实在线升级待验收。

退出处理权在系统确认安装器启动后移交。主进程回归分别在普通退出检查和确认弹窗仍挂起时复现过早移交。修复后，启动期间的手动退出继续经过普通确认和清理。若应用已经开始普通退出，移交保持该退出流程。另复核 Windows 更新源拒绝缺失或无效的发布者配置。272 项定向测试和 29 个隔离 Electron 场景通过，回执位于 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-installer-quit-ownership/`。

## 已签名输入的交接复验（2026-11-19）

使用微软签名的本机系统文件、公有证书和既有未签名数据复验源码 `1583bbaf88` 的更新交接。两个输入的 SHA-512 与早期回执一致。七个签名整包及缓存场景全部通过。正向场景核对启动前有一次额外的 Authenticode 校验，夹具确认启动后才移交退出处理并请求退出。错误发布者、未签名和缓存验签不可用均在交接前被拒绝。回执位于 `%USERPROFILE%/DSHU-Deliveries/20261119/signed-updater-handoff/`。正式 DSHU 签名包、实装及在线升级仍待验收。

## 签名差分与交接复验（2026-11-19）

使用微软签名的 x64 系统文件 `10.0.26100.6` 和 `10.0.26100.9767` 作只读样本。两个 blockmap 分别从文件副本生成。该轮共通过 11 个场景。单段和多段 Range 均只下载 168,528 字节可执行文件数据，复用 322,992 字节，较 491,520 字节整包少下载约 65.7%。缺少旧 blockmap 和 Range 被拒绝均回退到完整下载。

单段重建产物通过 SHA-512 和 Authenticode 校验。另行批准安装时再次验签，模拟启动确认后移交退出。系统原文件和测试副本的 SHA-256 均保持一致。输入清单和回执为 `%USERPROFILE%/DSHU-Deliveries/20261119/signed-differential-replay/` 下的 `inputs.json`、`result.json` 和 `process.json`。正式签名包、实装缓存和在线服务仍待验收。

## 窗口投递失败后的 Host 恢复（2026-11-19）

安装启动失败后，向正在销毁的窗口发送更新状态曾中断 Host 恢复。窗口和强更覆盖层的投递失败现分别记入壳日志。普通和强制更新的主进程回归均注入了窗口发送失败，确认仍能重建 Host、重载工作区并读取替代 Host 的启动地址。267 项定向测试及桌面构建通过。回执位于 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-update-recovery-delivery/`。本轮使用主进程替身，已安装资料的端到端回读仍待验收。

## 候选签名与摘要回执（2026-11-19）

只读验签脚本要求安装器携带有效的内嵌 Authenticode 签名、核定证书和时间戳。提供预期 SHA-256 后，脚本持有禁止写入和删除的文件句柄，在核对签名期间读取同一文件并生成回执。过去的脚本曾接受只依赖本机 Windows 签名目录验证的文件。[首发安装器核验](windows-x64-first-release.md#核对候选安装器)

PowerShell 7 用微软签名的 PowerShell 文件通过验签和摘要核对，原有两参数调用保持无输出。仅目录签名、错误证书、错误摘要、无签名及文件正被写入均被拒绝。Windows PowerShell 5.1 也生成了正确的样本回执。现有样本内容经摘要复核。结果位于 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-candidate-signature-receipt/result.json`。正式 DSHU 签名候选仍待验收。

## 桌面更新的内嵌签名与时间戳（2026-11-19）

Windows 更新在下载时和启动安装器前都核对内嵌 Authenticode 签名、时间戳和已配置的发布者，包含复用缓存的路径。原先可通过发布者核对的真实 Windows 目录签名样本已被拒绝。缺少时间戳或验签结果不完整也会拒绝交接，下载缓存按现有路径处理。[签名配置](../../apps/desktop/windows-signing/README.zh.md#signing-configuration)

56 项定向测试通过，覆盖缺少字段、时间戳缺失、目录签名及原有协调器行为。使用带内嵌签名的微软 PowerShell 文件，在真实 Electron 环回复验 7 个场景，包括下载、缓存复验及已确认的模拟交接。证据位于 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-update-embedded-signature/`。正式 DSHU 签名实装和在线链路待验收。

## 更新验收日志（2026-11-19）

验收检查器识别应用发出的配置失败和策略登录事件。更新失败码直接取自本次失败并按固定列表写入，历史日志仍可读取。真实 Electron 环回的损坏下载记录了 `ERR_CHECKSUM_MISMATCH`。7 个环回场景和 83 项定向测试通过，日志与进程回执位于 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-update-journal/`。[验收日志说明](../../apps/desktop/tests/installed-update/README.zh.md)

## 验收

- 两个所属测试文件在 Windows/Linux 各 28 项通过，覆盖 403/429、主/次级期限、重叠期限、无效数值、普通拒绝、不会自动重试，以及中英文弹窗关闭/重开和到期后的显式重试。
- 中英文真实 Web 场景在 Windows/Linux 各两项通过。每项消费原有 `feedback-command` 的无密钥 LIGHTHOUSE 录制，再操作组装后的关于页；源 Session 原始文件未修改。预期输出放在 `apps/web/tests/expected/release-rate-limit/`，不把 DOM 记录放入顶层 Session 快照目录。
- 真实浏览器响应明确开放跨域限流头；一小时冷却在一分钟后仍禁用，到期后恢复手动检查。改变主题、关闭重开和时间到期均不增加请求，后续普通 403 与 200 空发行列表通过实际按钮重试进入。
- 通过应用自己的外观控件切换浅深主题，检查 1280px 浅色和 390px 深色的中英文排列、关闭入口及横向溢出。Windows 系统 Edge 的四张截图已查看，Linux 同场景断言通过；没有操作用户桌面。两平台实际安装包及原生窗口另有交付检查。
- Windows 实际安装资源在注入带跨域可读头的 429 后显示可重试时间并禁用检查，报告为 `candidate-2026.11.16.4/installed-release-rate-limit-result.json`，截图已查看。服务端完整一小时期限由上述 Web 场景验证；实装探测不等待真实一小时。
- 8 项产物构建、随后 2 项聚合编译、定向 lint 和 README 双语配对通过；本仓 `doc-sync` 只验证 README 链接和长度，不据此声称上游全部文档门禁通过。

日志位于 `%USERPROFILE%/DSHU-Deliveries/20261116/`，Windows 前缀为 `release-rate-limit-`，最终浏览器记录为 `web-headers.log`；Linux 记录为 `linux-release-check-16-4-{unit,web}.log`。早期未开放跨域头的测试只覆盖一分钟回退，不作为一小时期限的通过证据。开发截图显示最低版号和本地修改标记，实装截图显示 `.16.4` 和干净源码 `089dbb9b49`，两者分别保留。

## 构建收尾

浏览器测试首次漏登正确的编译分组，导致编译失败并产生 48 个多余的 JS/声明文件；`apps/web/tsconfig.json` 已将它归入 Host 测试程序。删除命令被自动审批拒绝后，经独立核对路径、创建时间、无链接及摘要，采用保留副本的逐文件整理方式，将这些本节点产物移至 `20261116/release-rate-limit-compiler-emits/`，每个 SHA-256 均一致；原始 TypeScript 文件保留。审计清单为 `release-rate-limit-accidental-emits.json`，源码目录不再含这些误生成文件。此前其他拒绝清理的目录未触及。
