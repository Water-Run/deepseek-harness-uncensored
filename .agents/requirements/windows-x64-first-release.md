# DSHU Windows x64 首发打包交接

首发是 Windows x64 的完整交付，沿用 DSHU 的 NSIS 安装器。已确定应交付的功能必须全部进入同一候选并通过实装验收。任一项缺失、失败或缺少证据，首发都保持待交付。Linux x64 及其他平台按后续版本计划处理。

本轮暂缓 rc.5 升级与实装。当前本机仍基于 rc.4，已合入源码的 rc.5 记录在下表。候选的实际内核版本及完整源码提交在构建时单独登记。

本说明覆盖打包前检查、候选文件验证、实装回退和用户手动发布。现有全量候选尚未生成。自主攻击组件的构建与部署步骤不在本文范围内。

## 核对基线

| 对象 | 已有证据 |
| --- | --- |
| 当前 Windows 实装 | `2026.11.18.11`，源码 `5f9a129fedc44de85bb6a405b4ae60a866820ead`，DSH `0.2.2-rc.4`。已有保留资料升级、四模式启动、官方版并存和回退记录。[本地交付](2026-11-18.11-delivery.md) |
| 当前源码 | 已合入 DSH `0.2.2-rc.5`，上游提交 `9c2670d3bce5275e0d1610272958121af87787bb`。REA 为 `6.9.0`，提交 `d74549e495c58eb4a560279fd9f05508401ea0a0`。[产品元数据](../../product.json) |
| 尚待入包的改动 | 冷分叉、删除回执、安装保全、完整包及差分切换和安装交接恢复各有定向证据。[同一候选的验收单](#同一候选的验收单)列出仍需实装覆盖的路径。 |
| 发行材料 | Windows 实装清单含 920 个 npm 包和 23 份补充声明。用同一实装输入复算后有 35 份补充声明，仍有 6 项依赖材料待核查。最终以候选的实际清单为准。[依赖审计](2026-11-03-dependency-notices.md) |

2026-11-19 对照源码 `1ed6ee5571`，只读复核了实装的四个关键文件、18.11 安装器和 18.10 回退安装器。六项 SHA-256 均与历史回执一致，升级前备份目录仍存在。此次检查覆盖文件摘要和备份目录的存在性。回执为 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-first-release-baseline/installed-and-rollback.json`。当前[公开预发布](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.5)为 17.5。

### 沿用 rc.4 的源码基线

rc.5 同步提交 `cb93054364cdb4bf16236ae013bcb8b31f70f3ef` 的直接父提交是 `a25afc41b8fd12c0777ab235186db4e8101a4cb4`。该基线的根 `package.json` 和 `product.json` 均为 DSH `0.2.2-rc.4`，上游提交为 `3f321d32bfe382212a8ed8785c1d47a5a300aa23`，REA 为 `6.9.0`。如继续暂缓 rc.5，后续迁移以该 rc.4 源码为起点，保留 18.11 实装为历史验证对象。

以 `09a5979693811de58a992997695616f18f98a3ae` 为差异终点，在隔离 Git 索引中对四组改动执行了 `git apply --cached --check`。Windows 更新与验签 14 个文件、额度与余额 10 个、会话与旁问 14 个、流量记录 7 个均通过。合并后的 45 个文件也通过文本应用检查。完整选区与核对结果见 `%USERPROFILE%/DSHU-Deliveries/20261119/rc4-candidate-source/result.json`。

在 `75a724026557ccd1c86230bcf211e690600a7fae` 复核 43 份源码的 340 处直接相对路径或工作区别名引用，全部能定位到文件。其中 10 个依赖文件与当前源码有差异。编译夹具确认 rc.4 的旧声明缺少两种安装失败状态及两项额度暂停属性。补齐 `packages/client/ui-settings-general/src/types.ts` 和 `packages/guard/spend-limit/src/types.ts` 的当前声明后，夹具通过，扩到 47 个文件的补丁也通过文本应用检查。三个回执在同一目录的 `direct-import-check.json`、`declarations-compiler-fixture.json` 和 `expanded-text-check.json`。

其余 8 个文件差异已在 `1d6dfb8e51016ca1c651c65b45083ce25ffdb19e` 核对。迁移选区需补充 6 个桌面文件 `about.ts`、`client-metadata.ts`、`project-manager.ts`、`runtime-tree.ts`、`update-presentation.ts` 和 `update-source.ts`。当前主进程会将安装版本传给运行时读取和项目准备，rc.4 的旧签名缺少这两个参数。`startup-error.ts` 只有注释差异。流量记录使用的 `WebError` 和 `WebFetchResult` 的声明与导出相同，这两个依赖可以沿用 rc.4 基线。

扩到 53 个文件后，文本应用检查通过。对选区的 359 处直接相对路径或工作区别名引用复核后，均可定位，除上述两处可沿用的依赖外未发现新的直接源码差异。回执见同目录的 `desktop-support-check.json`。接手时仍需按首发清单补齐其他功能及传递依赖，并对选定源码、依赖锁、原生资源和测试执行完整候选的类型检查、构建和实装。结果填入[同一候选的验收单](#同一候选的验收单)。

在独立 Windows 临时目录中，用 rc.4 基线的四个支持文件，配合 `0b8c1dcd39a6b4bf0f31ce11bdf88d00c49a7c8d` 的运行时树和客户端元数据修复，运行了两个所属测试文件。35 项全部通过，覆盖运行时平台、版本、Host 入口内容校验及客户端版本缺失处理。运行时外部依赖 `semver` 与两个提交的锁文件一致。逐文件 Git blob 和测试汇总见同目录的 `desktop-runtime-fixture.json`。验收范围是两个模块及测试依赖。

更新下载器新增了对 `builder-util-runtime@9.7.0` 的直接引用。迁移时同时更新 `apps/desktop/package.json` 和 rc.4 锁文件的 `apps/desktop` importer，锁定 `9.7.0(supports-color@9.4.0)`。rc.4 已经通过 `electron-updater` 锁定同一版本。原有包记录、完整性值和快照与 `81f637fa88906218bc5313728da21100b05408e2` 一致，可复用。桌面清单补丁也通过了应用检查。

使用该依赖和选定的 rc.4 源码组合隔离运行了 61 项测试，覆盖 Windows 发布者配置、更新提示、频道切换、下载与独立安装确认。协调器测试使用模拟更新器。结果与逐文件来源见同目录的 `desktop-update-fixture.json`。实际签名、在线更新和实装仍填入候选验收单。

桌面启动和更新迁移可使用同目录的 `rc4-desktop-startup-update-68ab3935ae.patch`。补丁含 32 个文件，`pnpm-lock.yaml` 的变更限于桌面 importer 新增的直接依赖。补丁已应用到 rc.4 临时索引并逐文件回读。启动与更新两批隔离测试的 30 条源码和夹具摘要全部相符，对应此前通过的 96 项测试。文件清单和 SHA-256 记录在同名 JSON 回执中。

在独立 rc.4 工作树内先核对 `git rev-parse HEAD` 为 `a25afc41b8fd12c0777ab235186db4e8101a4cb4`，再用 `git apply --check <补丁路径>` 检查局部冲突。应用后将启动和更新纳入候选清单，继续补齐其他首发功能、完整类型检查、安装包和实装验收。

## 打包前确认

1. 固定 DSHU 的源码提交和依赖锁。记录 Windows x64 构建环境、日期版本、上游 DSH 和 REA 的版本及提交。关于页、CLI、安装器与 Windows 登记应显示同一个 DSHU 日期版本。
2. 将[编号需求](development-checklist.md)中已确定首发的 Windows 功能逐项写入候选清单。每项填上需求编号、功能入口、对应文件或配置、默认状态及实装验收方法。默认关闭的可选保护也应在启用后走通已承诺的路径。
3. 对照候选装配清单检查各模式、插件、资源、运行时和许可文件。发现缺项、未经确认的变更、来源不明或版本冲突时，停在当前批次。明确修复缺口并重新核对后再进入候选验收。
4. 备份现有 DSHU 资料，记录当前安装器和备份的路径及摘要。保留相同平台的回退包，事先确认该版本能否读取候选写出的资料格式。

在工作区根目录运行以下只读检查，将输出保存到本次验收记录。还需记录实际运行的 Node 和 pnpm 版本以及 Windows 构建机工具检查结果。

```powershell
git status --short
git rev-parse HEAD
node --version
pnpm --version
Get-FileHash -Algorithm SHA256 -LiteralPath 'pnpm-lock.yaml'
$product = Get-Content -LiteralPath 'product.json' -Raw | ConvertFrom-Json
$product | Select-Object name, version, upstreamVersion, upstreamCommit
$product.rea | Select-Object version, commit, repository
```

以候选实际构建回执为准。工作区有未提交修改、项目版本与产物冲突，或依赖锁摘要无法对应时，先厘清来源。源码里的最低版本号和实装版本分别登记。

## 核对候选安装器

对已获验收资格的 Windows x64 安装器运行以下只读检查。指纹从核定的公开发布证书取得，预期 SHA-256 从独立保存的候选回执取得。核对同一最终文件上的内嵌 Authenticode 签名、时间戳和摘要后，保存输出的 JSON 回执。

```powershell
$installer = Get-Item -LiteralPath '<最终安装器绝对路径>'
$thumbprint = '<核定的公开发布证书指纹>'
$expectedSha256 = '<验收记录中的候选 SHA-256>'
$receipt = & ./apps/desktop/scripts/verify-published-windows.ps1 `
    -Installer $installer.FullName -Thumbprint $thumbprint -ExpectedSha256 $expectedSha256
$receipt | ConvertTo-Json
'{0}  {1}' -f $receipt.SHA256, $receipt.File
```

分别登记 `ProductVersion`、`FileVersion` 和构建清单中的内部分发版本，再核对用户看到的日期版本。18.11 历史检查包的两项文件资源值分别为 `2026.1118.11` 和 `2026.11.18.11`。

将最后一行放入本版本的 `SHA256SUMS.txt`。签名或摘要核对失败时不会生成回执。依赖 Windows 签名目录（Catalog）的文件会被拒绝，安装器需携带可独立验证的内嵌签名。签名或重新生成文件之后重新检查全部摘要和配套文件，再安排实装。未签名检查包记录自己的验证结果。[只读验签场景](2026-11-16-release-check.md#候选签名与摘要回执2026-11-19)

[Microsoft 签名校验](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/get-authenticodesignature) · [Microsoft 文件摘要](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash) · [更新验收](2026-11-16-release-check.md)

候选包含更新清单与差分索引时，可在仓库根目录执行批次复核，核对 `latest.yml` 的内部分发版本、文件名、大小和 SHA-512。沿用上面选定的 `$installer`。索引用完整安装器文件名加 `.blockmap` 后缀，放在同一目录。摘要文件应有与安装器文件名完全一致的一行。仅大小写不同的文件名也按重复条目拒绝。

```powershell
$feed = Join-Path $installer.DirectoryName 'latest.yml'
$checksums = Join-Path $installer.DirectoryName 'SHA256SUMS.txt'
$version = '<构建清单的内部分发版本>'
pnpm --dir apps/desktop exec tsx scripts/verify-windows-installer-blockmap.ts --feed $feed --version $version --checksums $checksums $installer.FullName
```

若仅复核已有安装器、差分索引和摘要，可同时省略 `--feed` 和 `--version`。成功时保存输出的 `file-integrity-only` JSON 回执。缺少或重复的安装器摘要、内容不一致或索引批次错配会返回非零。签名、装配完整性与实装结果分别留档。

## 同一候选的验收单

开始验收时填入候选版本、完整源码提交和安装器 SHA-256。已有证据提供验证基线，候选状态均为待验。每一行补上实测结果和回执路径，将通过项绑定到这个安装器摘要。

| 验收项 | 已有证据 | 候选验证 | 候选状态 |
| --- | --- | --- | --- |
| 安装身份与冷启动 | 18.11 以普通账户启动。DSHU 与官方 DSH 的 Host 及浏览器资料隔离已有本地验收。[安装记录](2026-11-18.11-delivery.md#安装与恢复) · [并存验证](2026-11-06-stability.md#windows-并存与重启2026-11-18) | 全新安装并启动，核对名称、图标、卸载项、快捷方式、独立目录和 Host。原有官方 DSH 可启动并读回自己的资料。 | 待验 |
| 使用入口与默认值 | 会话删除的 Host、Web 和缺失实时通知回归通过。冷分叉已有源码与浏览器证据。[稳定性](2026-11-06-stability.md) | 核对四模式、旁问及传图、随问归属、工作区、删除、冷分叉、额度、余额图、输入预测及默认值。[使用手册的功能入口速查](../../docs/user/guide/dshu.md#reference) | 待验 |
| 运行时与可选功能 | Windows 本地文件与 SQLite 已通过真实读写和独立冷重启。默认关闭的进阶路径及各自覆盖范围见[开发清单](../TODO.md#进行中8-项)。 | 检查正常会话、附件、已承诺的静态分析与工具入口。启用可选保护后，核对实际拒绝、审计记录与显示。 | 待验 |
| 保留资料升级 | 18.10 → 18.11 原位更新核对了 7,428 个资料文件。源码中的安装失败恢复另有主进程替身测试。[原位更新](2026-11-18.11-delivery.md#安装与恢复) · [恢复回归](2026-11-16-release-check.md#窗口投递失败后的-host-恢复2026-11-19) | 从检查版资料副本升级，读回原会话、附件、配置和隔离资料。覆盖目标目录锁定、同版修复、换目录及失败恢复。 | 待验 |
| 离线、登录与重启 | 独立资料目录和启动故障诊断已用隔离 Host 或 Electron 验证。[并存与启动](2026-11-06-stability.md#windows-并存与重启2026-11-18) | 验证真实登录态、离线诊断、正常退出后重开和 Windows 系统重启。记录失败时的诊断位置。 | 待验 |
| 更新交接 | 微软签名样本覆盖整包、签名拒绝、单段与多段差分、整包回退、再次验签和退出顺序。安装器启动由夹具模拟。[签名差分复验](2026-11-16-release-check.md#签名差分与交接复验2026-11-19) | 在线升级按正式发布者证书、实际服务、实装缓存和候选程序验证。记录签名、清单摘要、下载、取消、重试、安装交接及重启结果。 | 待验 |
| 发行材料与回退 | 历史安装器摘要已复核。[原始备份](2026-11-18.11-delivery.md#原始备份完整性复核2026-11-19)的 7,428 个文件均匹配升级前清单，两版真实 Host 已通过[隔离回读](2026-11-18.11-delivery.md#隔离回退演练2026-11-19)。按实装输入复算 35 份补充声明，6 项仍待核查。[依赖审计](2026-11-03-dependency-notices.md) | 核对正式安装器、摘要、构建清单、发行说明、许可与署名。以候选实包执行回退，读回对应备份中的关键资料。 | 待验 |

用独立测试资料验证全新安装，再用已有版本的资料副本验证升级。两条路径各记录安装前后的文件和启动结果。会话删除、分叉、截图所示余额、默认开关等逐项按[使用手册的功能入口速查](../../docs/user/guide/dshu.md#reference)验收。

测试失败时记录失败原因。证据缺失或候选身份与回执不一致时标为待验。任一项失败或待验，首发都保持待交付。新构建产生不同摘要后，重新验收受其影响的项目。

### 候选回执模板

按候选版本保存一份回执。首次填写时，各测试结果均为「待验」。每次更换安装器，登记新摘要并复核受变更影响的验收项。

| 字段 | 填写内容 |
| --- | --- |
| 源码与构建 | 完整源码提交、锁文件 SHA-256、工作区状态、Windows 构建工具版本、DSH 和 REA 的版本及提交 |
| 最终安装器 | Windows x64、显示版本、内部分发版本、发布文件名、大小、SHA-256、签名验证回执 |
| 更新资产 | `latest.yml`、`.blockmap` 和 `SHA256SUMS.txt` 的文件名及摘要，以及在线升级回执 |
| 功能与实装 | 对照上方验收单逐项记录结果、平台、产物 SHA-256、复现步骤和日志位置 |
| 资料与回退 | 升级前备份、回退安装器的版本和 SHA-256、资料格式兼容性及实际回读结果 |
| 剩余缺口 | 未通过或待验项目、影响、当前证据和恢复入口 |
| 发行 | 草稿标签和目标提交、资产总表、用户确认和发布后复核记录 |

## 手动发布

1. 在 [DSHU 的 Releases 页面](https://github.com/Water-Run/deepseek-harness-uncensored/releases)建立草稿。选择日期版本对应的 `vYYYY.MM.DD.N` 标签，确认标签指向验收记录中的完整源码提交。
2. 填写标题与发行说明。列明 Windows x64、产品版本、实际 DSH 内核、REA 来源、升级与回退入口，以及已确认的已知问题。
3. 只附上同一验收批次的 Windows 安装器与 `SHA256SUMS.txt`。若批次包括已验收的在线升级，同时附匹配的更新清单和差分索引。在草稿中核对文件名、摘要和平台。
4. 所有应交付项都有同一候选的通过回执后，由用户确认渠道并发布。发布后从页面下载一次安装器，复核 SHA-256、签名和文件名。在线更新另核对实际客户端看到的版本与下载路径。

[GitHub Release 操作说明](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release)

## 交付记录

每批记录候选文件名、SHA-256、构建源码、功能清单、测试回执、待核查依赖、备份、回退安装器和发行说明。签名、上传和公开发布按各自授权执行。候选验收与已发布文件的复核分别留档。

历史 Windows 检查版的备份、安装器及恢复入口见[本地交付记录](2026-11-18.11-delivery.md#安装与恢复)。若新版资料格式与回退版本不兼容，保留新版资料，再使用对应旧版备份恢复。首发缺口继续记录在[开发清单](../TODO.md#windows-首发缺口)。
