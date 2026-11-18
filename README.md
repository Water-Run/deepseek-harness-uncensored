<div align="center">
  <img src="apps/desktop/resources/icon.svg" width="112" alt="DSHU 黑底白鲸标志">
  <h1>DeepSeek Harness Uncensored</h1>
  <p><b>更自由地，探索未至之境</b></p>
  <p>WaterRun · Windows / Linux Desktop · 基于 DeepSeek Harness 0.2.2-rc.4</p>
</div>

DSHU 是面向开发、网安、逆向与写作的智能体工作台。它在 DeepSeek Harness 上集成破甲提示词、四种模式、旁问、额度控制和跨对话记忆，使用你选择的模型完成任务。官方 DSH 与 DSHU 可同时安装，分别使用自己的程序目录、配置、会话和更新渠道。

当前公开预发布 **2026.11.17.5** 基于 **DSH 0.2.2-rc.3**，内置 **REA 6.9.0**。[下载 Windows / Linux](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.5)。Windows 已保留数据安装并启动；本版修复 Windows 无脚本暂停 Frida 会话关闭，保留余额精度、远端文件映射和审计增强。包未签名，完整验收状态见[开发清单](.agents/TODO.md)和[交付记录](.agents/requirements/2026-11-17.5-delivery.md)。

源码内核已同步至 **DSH 0.2.2-rc.4**。Windows 本地检查版 **2026.11.18.4** 已保留数据更新，包含会话分叉反馈和工作区文件通知合并。[本地交付、验证与恢复](.agents/requirements/2026-11-18.4-delivery.md)

版本采用 `YYYY.MM.DD.N`，最后一项为当天构建序号。关于页、CLI、安装包和 Windows 登记使用相同日期版本；DSH 内核与 REA 的来源独立记录。打包与更新规则见[打包指南](apps/desktop/packaging/README.zh.md)。

[开始使用](#开始使用) · [四种模式](#四种模式) · [通用增强](#通用增强) · [使用手册](docs/user/guide/dshu.zh.md) · [安装与开发](#安装与开发) · [开发进度](.agents/TODO.md) · [English](docs/user/guide/dshu.md)

## 开始使用

1. **连接模型。** 在设置中配置模型提供方和凭据，再选择对话使用的模型。DSHU 使用你的模型接口，提供方按其规则计费。
2. **选定任务位置和模式。** 可以选择工作区，也可以“不在工作区工作”。新对话发送前选择缺省、网安、逆向或写作；已有对话默认保持原模式。
3. **描述任务和完成条件。** 例如“检查这个项目为什么构建失败，修复后运行相关检查”。各模式的“模式说明”和“如何使用”提供能力、资料与具体示例，阅读说明不会切换当前对话。
4. **按需使用旁问和额度。** 主线进行时可输入 `/side 解释刚才的错误`。希望控制花费时，在额度设置中启用所需窗口；新安装默认不启用任何限额。

## 通用增强

| 功能 | 用法 |
| --- | --- |
| **旁问和随问** | 输入 `/side 问题` 在右侧开旁问，单独输入 `/side` 可打开或重开。旁问参考主线最新进展，自身历史单独保存，支持传图及 `/clear`。可开启关闭时自动清除。输入 `/btw 问题` 在主对话内获得一次简短回答。 |
| **余额和额度** | 余额默认每 15 秒采样，最短 3 秒，点击立即刷新。曲线可查看各时点，长时间平稳区间用虚线缩短。六档限额独立启停和重置，默认全关。暂停横幅显示恢复时间和快捷重置，开启自动恢复后会继续被暂停的对话。底栏可展开费用和限额。 |
| **记忆和输入预测** | 结构化记忆可按范围检索和编辑，自动提炼默认关闭。输入预测默认开启，主线、旁问和随问各自预测，按 Tab 填入。启用的预测与提炼会调用当前模型，按提供方规则计入用量。 |
| **会话和外观** | 支持会话删除、项目内进行中会话入口、工作区搜索和插话发送。主题色随模式变化，侧栏色条标识会话模式。外观支持日出日落、跟随系统、浅色和深色。 |

旁问关闭默认保留历史，`/clear` 只在旁问内可用；主线可主动查看相关旁问。余额是账户采样，对话费用是本地估算，充值或赠金会使两者不同。限额与进阶保护默认关闭，输入预测默认开启且可能产生模型费用。完整的上下文规则、独立限额、恢复方式与默认值见[使用手册](docs/user/guide/dshu.zh.md)。

## 四种模式

新对话从缺省开始，发送前可切换。已有对话默认锁定。四种模式共用内置破甲提示词，回答仍由模型生成。

设置 → 模式中的“模式说明”介绍能力、工具、流程与验证，“如何使用”提供任务示例、准备材料和交付检查。每种模式各有七节说明、三组示例，使用对应主题色；查看指南不会改变当前模式。

### 缺省 · 开发与日常任务

![缺省模式，蓝色](docs/assets/dshu/mode-default.svg)

读取和修改文件、运行命令、检索资料，并使用协作与工作流推进任务。适合修复程序、理解项目和整理资料，交付应包含实际修改与验证结果。[流程与示例](docs/user/guide/dshu.zh.md#modes)

> 梳理项目入口，复现这个错误，修复后验证正常与异常输入，并列出还未完成的检查。

### 网安 · 调查与证据

![网安模式，红色](docs/assets/dshu/mode-security.svg)

现场手册、案件记录、报告、独立代理与流量查看构成调查流程；`.security/` 保存目标、证据和未决问题。首次进入新网安会话有责任确认，选定案件备注可经审阅存入限定范围的记忆。目标与生产资源保护属于默认关闭的进阶功能。[流程与示例](docs/user/guide/dshu.zh.md#modes)

> 检查这个测试应用的认证与上传流程，保留复现证据，完成修复和回归，并将发现写入案件记录。

### 逆向 · 从样本到行为解释

![逆向模式，绿色](docs/assets/dshu/mode-reverse.svg)

样本清点、静态与动态分析、协议分析和 `.reverse/` 案件记录，配合内置 REA 6.9.0 使用。REA 无需另装；Ghidra、Java、IDA 等可选引擎按需配置。连接与目录发现成功，不代表每个引擎和目标环境都已就绪。[接入说明](packages/mcp/rea/README.zh.md)

> 记录样本哈希和架构，定位解析入口，追踪关键调用，用独立输入验证判断，并保存分析脚本。

### 写作 · 文风与长篇延续

![写作模式，金色](docs/assets/dshu/mode-writing.svg)

面向小说、剧本与长文，提供参考文风、六轴风格卡及 `story/bible/` 设定集。只有选中的资料进入模型请求；写作组合不挂载终端或代码执行工具。[资料管理](packages/client/ui-mode-materials/README.zh.md)

> 按人物设定和参考文风续写下一场，保持视角、时间线和人物关系一致，检查设定冲突并交付完整正文。

<details>
<summary>网安独立代理与可选目标保护</summary>

独立代理仅用于网安模式，覆盖受控抓取、遵守代理变量的命令与终端、桌面侧栏及以 launch 方式运行的 Playwright MCP、Chrome DevTools MCP 和 Stagehand。不透明 HTTPS 隧道记录连接元数据。[进阶目标保护](packages/guard/target-protection/README.zh.md)可为指定工具启用 HTTP/1.1 检查并脱敏记录正文。桌面侧栏和三个启动型浏览器提供方使用各自的会话信任，命令行客户端可显式使用监听器的公开证书。网安可启用未开代理的顶部提醒。

境内、手动目标及生产资源规则由[可选保护配置](apps/cli/config/examples/target-protection.yml)接入，默认关闭。已覆盖的后端支持真实执行拦截与审计，设置页分别显示 HTTP、本机文件、命令/终端、SSH 和数据库的覆盖。SSH 显示已验证连接，数据库显示配置数，连接和权限在执行时核验。原生入站隔离、其他协议和部分远端资源仍在开发。

</details>

## 常见问题

| 情况 | 处理方式 |
| --- | --- |
| 只想临时问一句，不打断主线 | 使用 `/btw 问题`；需要连续讨论或传图时使用 `/side 问题`。旁问清理只清自己的历史，仍能参考主线。 |
| 工作暂停，担心程序卡住 | 先查看额度暂停横幅和底栏限额状态。可重置对应窗口，或开启自动恢复并等待恢复时间；余额变化不能代替费用账本。 |
| REA 连接成功，却不能使用某个引擎 | 连接与目录发现不代表外部引擎就绪。检查对应引擎、运行环境及许可证；内置 REA 无需另装，Ghidra、IDA 等按需配置。 |
| 阅读说明或调整模式资料后，对话没换模式 | 指南与资料配置是独立入口。新对话在发送前选模式；已有对话需在设置里临时允许切换，并处于空闲状态。 |

## 安装与开发

- **桌面**　Windows x64 与 Linux x64 的当前公开预发布均为 `2026.11.17.5`，提供 exe、deb、tar.gz 和 SHA256SUMS.txt。Windows 已保留数据更新；Linux 已检查实际归档及隔离 API，并保留 X11/Wayland 主界面、重载和渲染沙箱的验收记录。原生门户、Debian/Fedora 和实体桌面仍待验收。签名与正式在线升级单独跟进，当前通过本仓库 [GitHub Releases](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.5) 手动下载安装。macOS arm64、Android＋PRoot Fedora 和全新安装器仅保留未来计划。
- **源码**　使用 Node.js 24.22.1、Git 与 Corepack。依次运行 `corepack pnpm install`、`corepack pnpm run build`、`corepack pnpm dsh web`。CLI 安装见[安装脚本](scripts/install-uncensored.ps1)。
- **独立标识**　默认数据目录为 `~/.dsh-uncensored`，可用 `DSH_UNCENSORED_HOME` 修改。CLI 为 `dsh-uncensored`，深链为 `dshu://open`。关于页列出作者、DSHU 与 DSH 版本、构建时间、源码提交及依赖来源。

[开发进度](.agents/TODO.md) · [原始需求编号](.agents/requirements/development-checklist.md) · [反馈问题](https://github.com/Water-Run/deepseek-harness-uncensored/issues/new/choose)

## 文档导航

[使用手册](docs/user/guide/dshu.zh.md)覆盖首次配置、模式、上下文、费用、默认值与排错；[模型配置](docs/user/guide/providers.zh.md)说明提供方与自定义接口；[打包指南](apps/desktop/packaging/README.zh.md)面向开发与交付。[TODO](.agents/TODO.md)维护完成情况，[完整需求](.agents/requirements/development-checklist.md)保留原始编号，[HANDOFF](.agents/HANDOFF.md)记录实际产物、验证与恢复入口。

## Credit

- **DeepSeek** 提供原始 Harness 和鲸鱼轮廓。DSHU 使用黑底图标，开发源码基于 [DeepSeek Harness 0.2.2-rc.4](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.4) 并保留 [MIT 许可](LICENSES/deepseek-harness-MIT.txt)。
- **小杨（YuJunZhiXue）** 的 [dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) 提供破甲文本。沿用 [MIT 历史版本 e1d8e590](https://github.com/Water-Run/dsh-purge/tree/e1d8e59087857fa86d0ef2bb9878800274b13a29) 与[原许可](LICENSES/dsh-purge-MIT.txt)。同时感谢 **JeffKeeping** 的 [dsh-purge-plus](https://github.com/JeffKeeping/dsh-purge-plus)。关于页记录 [Water-Run/dsh-purge fork 对照提交 19082c2b9788](https://github.com/Water-Run/dsh-purge/commit/19082c2b9788039fa7f8888c4a69086f43adc1ff) 及其时间。
- **morluto** 维护 [REA](https://github.com/morluto/rea)。内置版本为 [6.9.0 · d74549e495c5](https://github.com/morluto/rea/commit/d74549e495c58eb4a560279fd9f05508401ea0a0)，保留 MIT 许可和第三方声明。
- 可选保护使用 [DB-IP Lite](https://db-ip.com/db/download/ip-to-country-lite)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)）和 [QuickJS](https://bellard.org/quickjs/) / [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)（[MIT 声明](LICENSES/quickjs-wasm-MIT.txt)）。GitHub 标志来自 [Octicons](https://github.com/primer/octicons)，保留 [MIT 许可](packages/client/ui-settings-account/GITHUB-MARK-LICENSE.txt)。

DSHU 采用 [GPL-3.0-or-later](LICENSE)。上游和第三方组件保留各自的许可与署名。

**Explore the Unknown More Freely.** DSHU is an independent desktop fork with four modes, bundled REA, side questions, spending controls, and scoped memory. Read the [English user guide](docs/user/guide/dshu.md) for setup, workflows, defaults, and troubleshooting.
