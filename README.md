<div align="center">
  <img src="apps/desktop/resources/icon.svg" width="128" alt="DeepSeek Harness Uncensored 黑底白鲸 Logo">
  <h1>Deepseek Harness Uncensored: 更自由的探索未至之境</h1>
  <p>内置破甲提示词、四种任务模式和独立数据目录。<br>基于 DeepSeek Harness，保留原有工具与插件体系。</p>
  <p><img src="https://img.shields.io/badge/Uncensored-v0.1.0-4B8BFF?style=for-the-badge" alt="Uncensored v0.1.0"> <img src="https://img.shields.io/badge/DSH-0.2.1--rc.3-303644?style=for-the-badge" alt="DSH 0.2.1-rc.3"> <img src="https://img.shields.io/badge/License-GPL--3.0--or--later-E6B84A?style=for-the-badge" alt="GPL-3.0-or-later"> <img src="https://img.shields.io/badge/Status-开发中-EF5363?style=for-the-badge" alt="开发中"></p>
  <p><a href="#开箱即用的破甲体验">破甲</a> · <a href="#四种模式">四种模式</a> · <a href="#其它通用增强">其它通用增强</a> · <a href="#快速开始">快速开始</a> · <a href="#开发进度">开发进度</a> · <a href="#当前限制">当前限制</a></p>
</div>

Uncensored 是 DeepSeek Harness 的独立分支，使用 **DSH 0.2.1-rc.3** 引擎，产品版本从 **v0.1.0** 开始。应用身份、数据目录和更新渠道与官方版分开，原有工具、插件和历史会话恢复能力保留。

> [!IMPORTANT]
> **项目仍处于开发阶段，不是稳定发行版。** Windows x64 本机覆盖安装、数据保留和重新启动已验证；目标保护、签名发布和全平台验收尚未完成。

## 开箱即用的破甲体验

Uncensored 默认加载中文 armor，并内置英文文本，无需安装插件、复制提示词或修改配置。armor 位于系统提示词前部，排在 Harness 身份说明之前，四种模式共用。默认权限为完全权限，可在设置中调整。文本来自 **dsh-purge 的 MIT 历史版本**，模式增强不会改写该文本。破甲改变模型接收的指令，不改变模型本身，也不保证模型永不拒答。

## 其它通用增强

| 功能 | 说明 |
| --- | --- |
| **旁问与随问** | <kbd>/side</kbd> 打开空白的独立旁问，以主线背景为参考；主线可按需调用工具读取旁问。<kbd>/btw 问题</kbd> 给出一次简短只读回答，只显示问题和结果。两者不混入普通会话列表。 |
| **输入预测** | 通用设置中默认开启，保留已有关闭偏好。灰色补全按 <kbd>Tab</kbd> 填入但不发送；主线、旁问和随问分别预测，使用当前模型并计费。 |
| **跨对话记忆** | 可选自动提炼（默认关闭），整理长期事实并去重；可查看、搜索、编辑、启停和删除。默认限定当前工作区与模式，全局共享需显式选择。模式页可直接管理对应记忆。 |
| **余额与曲线** | 默认每 15 秒采样，点击可立即刷新。金额平滑变化，零赠金项隐藏；紧凑卡片显示时段倒计时，曲线可悬停、轻触或用方向键查看具体采样。 |
| **额度与续跑** | 六档限额独立开关、金额与重置，默认全部关闭；优先显示 5 小时与 7 天。请求前预留、完成后结算，恢复时继续原任务。底部仅统计已开启窗口，展开查看进度。 |
| **对话费用** | 底部显示回答、重试与记忆提炼的费用估算，展开查看累计曲线。按配置费率计算，缺少用量或费率会标记；不等同于账户账单。 |
| **会话管理** | 项目行可打开进行中对话，忙碌时按 <kbd>Enter</kbd> 插话。删除对话会清理关联旁问、随问和子任务，保留独立分支与工作区文件。 |
| **独立与主题** | 独立应用名、CLI、深链和数据目录；设置分为通用、模型、额度、模式、插件。提供模式配色、会话色条、过渡动画和四种外观。 |
| **历史与更新** | 旧 PTC、Minimal 会话按原配置恢复。关于页显示版本与构建来源，更新提醒区分版本级别、无发行版、离线和失败。 |

## 四种模式

新对话默认使用 **缺省**，发送前可以更换。已有对话默认锁定；临时切换模式和关闭敏感操作确认均需倒计时确认。

| 模式 | 工具与资料 |
| --- | --- |
| <img src="https://img.shields.io/badge/缺省-4B8BFF?style=flat-square" alt="缺省 · 蓝色"> | 文件、终端、检索、任务协作与工作流工具。默认 Flash、Max 推理和完全权限，适用于开发与日常任务。 |
| <img src="https://img.shields.io/badge/网安-EF5363?style=flat-square" alt="网安 · 红色"> | 7 份现场手册、案件账本和报告。目标、证据与发现保存在 `.security/<案件>/`；独立代理支持连通性检查和脱敏流量查看。 |
| <img src="https://img.shields.io/badge/逆向-40BE87?style=flat-square" alt="逆向 · 绿色"> | REA 工具按需接入、8 份手册和样本清点。每个对话独立持有分析进程，案件与证据保存在 `.reverse/<案件>/`。 |
| <img src="https://img.shields.io/badge/写作-E6B84A?style=flat-square" alt="写作 · 黄色"> | 7 份写作手册、六轴风格卡和 `story/bible/` 设定集。仅注入选中的资料，不挂载终端或代码执行工具。 |

## 快速开始

**REA 外部工具：**在“设置 → 模式 → 逆向配置”填写已安装的 Node 与 REA 入口路径，启用、保存并检测连接。可选配置 Ghidra、Java 和 IDA MCP。已验证 REA 6.8.0 的 229 个工具目录、JavaScript 分析及 Ghidra 12.1.4 原生分析；该版本不支持 Ghidra 12.2。外部引擎需另行安装，调用要求完全权限，随问不能启动。保存配置会关闭现有分析连接，重开样本后继续。

需要 **Node.js 22.19+（22.x）或 24+、Corepack 和 Git**。

```powershell
corepack pnpm install
corepack pnpm run build
corepack pnpm dsh web
```

Web 地址为 **http://127.0.0.1:23333**；本地 CLI 安装见 [install-uncensored.ps1](scripts/install-uncensored.ps1)。<br>默认数据目录为 `~/.dsh-uncensored`，可通过 `DSH_UNCENSORED_HOME` 修改；CLI 为 `dsh-uncensored`，深链为 `dshu://open`。<br>启动器不继承官方版 `DSH_HOME`；SDK 显式目录由调用者负责。Flash 是服务端模型别名，不保证永久固定在 1017 版本。

## 开发进度

当前功能状态、完成比例和下一步统一维护在 [开发清单](.agents/TODO.md)，需求编号保留在 [完整清单](.agents/requirements/development-checklist.md)。目标保护、签名发行与跨平台验收仍在清单中。

## 平台交付计划

| 优先级 | 平台 | 状态 |
| --- | --- | --- |
| 1 | Windows x64 Desktop | 当前优先交付与安装验证 |
| 2 | Linux x64 Desktop | 计划 |
| 3 | macOS ARM Desktop（arm64） | 计划，已有构建链待实机验收 |
| 4 | Android＋PRoot Fedora | 仅草案，与新安装器计划一并推进 |

## 当前限制

> [!WARNING]
> 网安首次确认展示**真实保护状态**。开发后端已有 HTTP、独立代理、文件、基础 SSH、REA/MCP 准入、本地 SQLite 执行及 PostgreSQL 固定目录审计，尚未在默认产品启用；任意网络 SQL、远端身份、受限执行、其他原生入口及完整审计仍待完成，当前应用不能显示完整保护已生效。

- 独立代理仅覆盖 `web_fetch` 和遵守代理环境变量的一次性命令；不覆盖浏览器、MCP、常驻终端和子智能体。HTTPS 隧道只记录元数据。
- 记忆提炼会额外调用当前模型，受额度限制；结果可编辑、禁用或删除，失败可重试。数据保存在 `storages/memory.json`，损坏时报错并保留文件。检索使用词项匹配，暂不提供向量语义检索；包含提炼日志的会话不能由旧构建回读。
- 当前为本机验收的未签名构建，尚无正式发行包；自动更新、签名验证、卸载回滚与跨平台仍待验收。额度恢复不接管其他运行环境或子智能体。
- 额度为保守估算，不是账单。升级前退出旧应用；账本自动迁移到 v3，保留费用和设置，旧总开关开启时保留为六档全部开启。旧构建不能读取 v3，旧未分类暂停记录需手动恢复。单项重置保留其他窗口与在途预留。反编译引擎需在本机另行安装或连接。

## 反馈与许可

[提交 Issue](https://github.com/Water-Run/deepseek-harness-uncensored/issues/new/choose) · [源代码](https://github.com/Water-Run/deepseek-harness-uncensored) · [Releases](https://github.com/Water-Run/deepseek-harness-uncensored/releases) · [上游 DSH](https://github.com/deepseek-ai/deepseek-harness)<br>整合发行采用 **[GPL-3.0-or-later](LICENSE)**，上游和第三方组件保留各自许可证与版权声明。

## Credit

[DB-IP Lite](https://db-ip.com/db/download/ip-to-country-lite)：目标保护开发后端使用的本地国家数据，按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 保留署名。数据是地区估计，不能替代手动生产目标规则；默认产品尚未启用完整保护。

[REA](https://github.com/morluto/rea)：morluto 维护的开源逆向工具，采用 MIT 许可。本项目通过 MCP 连接已安装的 REA；分析引擎保留各自许可。

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：DeepSeek 原始工程及鲸鱼轮廓；黑底应用图标基于该轮廓调整，旁问、费用和限额图标在仓库内绘制并保留矢量代码。保留 [MIT 许可](LICENSES/deepseek-harness-MIT.txt)。<br>[dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)：小杨（YuJunZhiXue）；破甲文本追溯至 [MIT 版本 e1d8e590](https://github.com/Water-Run/dsh-purge/tree/e1d8e59087857fa86d0ef2bb9878800274b13a29)，[原始许可](LICENSES/dsh-purge-MIT.txt)随仓库保留。<br>[dsh-purge-plus](https://github.com/JeffKeeping/dsh-purge-plus)：JeffKeeping；保留 purge fork 所要求的来源署名。<br>[Water-Run/dsh-purge](https://github.com/Water-Run/dsh-purge)：本分支对照的个人 fork，版本节点与时间见应用“关于”。<br>GitHub 图标来自 [Octicons](https://github.com/primer/octicons)，保留其 [MIT 许可](packages/client/ui-settings-account/GITHUB-MARK-LICENSE.txt)。<br>dsh-purge 后续专有许可分支不作为复制源码的授权依据；这里保留的是上述旧 MIT 文本的许可。
