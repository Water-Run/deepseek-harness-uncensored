<div align="center">
  <img src="apps/desktop/resources/icon.svg" width="112" alt="DSHU 黑底白鲸标志">
  <h1>Deepseek Harness Uncensored: 更自由的探索未至之境</h1>
  <p><b>DSHU v0.1.0</b> · 基于 DeepSeek Harness 0.2.2-rc.1 · WaterRun</p>
</div>

DSHU 内置破甲提示词、四种模式和独立的桌面应用。官方 DSH 与 DSHU 可同时安装，分别使用自己的程序目录、配置、会话和更新渠道。未签名的 Windows x64 检查版 `0.1.0-test.20261111.5` 已完成本机安装与运行验收。

## 通用增强

| 功能 | 用法 |
| --- | --- |
| **旁问和随问** | 输入 `/side 问题` 在右侧开旁问，单独输入 `/side` 可打开或重开。旁问参考主线最新进展，自身历史单独保存，支持传图及 `/clear`。可开启关闭时自动清除。输入 `/btw 问题` 在主对话内获得一次简短回答。 |
| **余额和额度** | 余额默认每 15 秒采样，最短 3 秒，点击立即刷新。曲线可查看各时点，长时间平稳区间用虚线缩短。六档限额独立启停和重置，默认全关。暂停横幅显示恢复时间和快捷重置，开启自动恢复后会继续被暂停的对话。底栏可展开费用和限额。 |
| **记忆和输入预测** | 结构化记忆可按范围检索和编辑，自动提炼默认关闭。输入预测默认开启，主线、旁问和随问各自预测，按 Tab 填入。启用的预测与提炼请求使用当前模型并计费。 |
| **会话和外观** | 支持会话删除、项目内进行中会话入口、工作区搜索和插话发送。主题色随模式变化，侧栏色条标识会话模式。外观支持日出日落、跟随系统、浅色和深色。 |

## 四种模式

新对话从缺省开始，发送前可切换。已有对话默认锁定。四种模式共用内置破甲提示词，回答仍由模型生成。

| 模式 | 用途 |
| --- | --- |
| **缺省 · 蓝色** | 开发和日常任务，使用文件、终端、检索、协作及工作流。 |
| **网安 · 红色** | 现场手册、目标与证据账本、报告、独立代理和流量查看。案件保存在 `.security/<案件>/`。可把选定备注审阅后存入跨对话记忆，默认限定当前工作区和网安模式。首次进入新网安对话时有责任确认。 |
| **逆向 · 绿色** | 样本清点、静态与动态分析、协议分析和案件记录。桌面内置 REA 6.8.0，可在设置中检查连接。Ghidra、IDA 等引擎按需接入。 |
| **写作 · 黄色** | 小说、剧本和长文，支持参考文风、六轴风格卡和 `story/bible/` 设定集。选中资料才进入请求，模式不挂载终端或代码执行工具。 |

独立代理仅用于网安模式，覆盖受控抓取、遵守代理变量的命令与终端、桌面侧栏及以 launch 方式运行的 Playwright MCP、Chrome DevTools MCP 和 Stagehand。不透明 HTTPS 隧道记录连接元数据。[进阶目标保护](packages/guard/target-protection/README.zh.md)可为指定工具启用 HTTP/1.1 检查并脱敏记录正文。桌面侧栏在对应分区验证检查证书，命令行客户端需显式使用监听器的公开证书。网安可启用未开代理的顶部提醒。

境内、手动目标及生产资源规则由[可选保护配置](apps/cli/config/examples/target-protection.yml)接入，默认关闭。已覆盖的后端支持真实执行拦截与审计，设置页分别显示 HTTP、本机文件、命令/终端、SSH 和数据库的覆盖。SSH 显示已验证连接，数据库显示配置数，连接和权限在执行时核验。原生入站隔离、其他协议和部分远端资源仍在开发。

## 安装与开发

- **桌面**　Windows x64 已提供本机检查版。Linux x64 检查版 `0.1.0-test.20261110.linux.4` 已构建 deb 和 tar.gz，并通过 Debian 12 的依赖解析、安装、启动与卸载。上一 Linux 检查版已通过 Ubuntu 的升级与便携启动。macOS arm64 和 Android＋PRoot Fedora 保留为计划。签名与在线升级仍待验收。正式版本与更新使用本仓库的 [GitHub Releases](https://github.com/Water-Run/deepseek-harness-uncensored/releases)。
- **源码**　使用 Node.js 24.22.1、Git 与 Corepack。依次运行 `corepack pnpm install`、`corepack pnpm run build`、`corepack pnpm dsh web`。CLI 安装见[安装脚本](scripts/install-uncensored.ps1)。
- **独立标识**　默认数据目录为 `~/.dsh-uncensored`，可用 `DSH_UNCENSORED_HOME` 修改。CLI 为 `dsh-uncensored`，深链为 `dshu://open`。关于页列出作者、DSHU 与 DSH 版本、构建时间、源码提交及依赖来源。

[开发进度](.agents/TODO.md) · [原始需求编号](.agents/requirements/development-checklist.md) · [反馈问题](https://github.com/Water-Run/deepseek-harness-uncensored/issues/new/choose)

## Credit

- **DeepSeek** 提供原始 Harness 和鲸鱼轮廓。DSHU 使用黑底图标，基于 [DeepSeek Harness 0.2.2-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1) 并保留 [MIT 许可](LICENSES/deepseek-harness-MIT.txt)。
- **小杨（YuJunZhiXue）** 的 [dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) 提供破甲文本。沿用 [MIT 历史版本 e1d8e590](https://github.com/Water-Run/dsh-purge/tree/e1d8e59087857fa86d0ef2bb9878800274b13a29) 与[原许可](LICENSES/dsh-purge-MIT.txt)。同时感谢 **JeffKeeping** 的 [dsh-purge-plus](https://github.com/JeffKeeping/dsh-purge-plus)。关于页记录 [Water-Run/dsh-purge fork 对照提交 19082c2b9788](https://github.com/Water-Run/dsh-purge/commit/19082c2b9788039fa7f8888c4a69086f43adc1ff) 及其时间。
- **morluto** 维护 [REA](https://github.com/morluto/rea)。内置版本为 [6.8.0 · 160d821ac9a0](https://github.com/morluto/rea/commit/160d821ac9a0310afcb8d1fc427862dd6508add5)，保留 MIT 许可和第三方声明。
- 可选保护使用 [DB-IP Lite](https://db-ip.com/db/download/ip-to-country-lite)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)）和 [QuickJS](https://bellard.org/quickjs/) / [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)（[MIT 声明](LICENSES/quickjs-wasm-MIT.txt)）。GitHub 标志来自 [Octicons](https://github.com/primer/octicons)，保留 [MIT 许可](packages/client/ui-settings-account/GITHUB-MARK-LICENSE.txt)。

DSHU 采用 [GPL-3.0-or-later](LICENSE)。上游和第三方组件保留各自的许可与署名。

<details>
<summary>English overview</summary>

**DeepSeek Harness Uncensored · Explore the Unknown More Freely**

DSHU v0.1.0 is an independent desktop fork of DeepSeek Harness 0.2.2-rc.1. It can coexist with the official app and uses a separate profile and update channel. It includes built-in armor prompts, four modes, and Chinese and English UI.

- **General** · Use `/side` for a persistent side conversation with image attachments and `/clear`, or `/btw question` for a quick one-off answer. Balance history, spending limits, scoped memory, and Tab suggestions are available in Settings.
- **Modes** · Standard covers daily development. Security adds case notes, reports, and an independent proxy with traffic inspection. Reverse integrates REA for analysis. Writing uses selected style references and story materials.
- **Delivery** · Unsigned Windows x64 inspection build `0.1.0-test.20261110.4` has passed local installation and runtime checks. Linux x64 inspection build `0.1.0-test.20261110.linux.4` produced deb and tar.gz archives and passed dependency resolution, installation, startup, and removal on Debian 12. The previous Linux inspection build passed upgrade and portable launch checks on Ubuntu. macOS arm64 and Android with Fedora under PRoot remain planned. Advanced target protection is opt-in. See [development status](.agents/TODO.md) and [Releases](https://github.com/Water-Run/deepseek-harness-uncensored/releases).

</details>
