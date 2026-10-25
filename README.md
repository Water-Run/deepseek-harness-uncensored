<div align="center">
  <img src="apps/desktop/resources/icon.svg" width="128" alt="DeepSeek Harness Uncensored 黑底白鲸 Logo">
  <h1>Deepseek Harness Uncensored</h1>
  <h3>更自由的探索未至之境</h3>
  <p>内置破甲提示词、四种任务模式和独立数据目录。<br>基于 DeepSeek Harness，保留原有工具与插件体系。</p>
  <p><img src="https://img.shields.io/badge/Uncensored-v0.1.0-4B8BFF?style=for-the-badge" alt="Uncensored v0.1.0"> <img src="https://img.shields.io/badge/DSH-0.2.1--rc.2-303644?style=for-the-badge" alt="DSH 0.2.1-rc.2"> <img src="https://img.shields.io/badge/License-GPL--3.0--or--later-E6B84A?style=for-the-badge" alt="GPL-3.0-or-later"> <img src="https://img.shields.io/badge/Status-开发中-EF5363?style=for-the-badge" alt="开发中"></p>
  <p><a href="#开箱即用的破甲体验">破甲</a> · <a href="#四种模式">四种模式</a> · <a href="#其它通用增强">其它通用增强</a> · <a href="#快速开始">快速开始</a> · <a href="#开发进度">开发进度</a> · <a href="#当前限制">当前限制</a></p>
</div>

Uncensored 是 DeepSeek Harness 的独立分支，使用 **DSH 0.2.1-rc.2** 引擎，产品版本从 **v0.1.0** 开始。应用身份、数据目录和更新渠道与官方版分开，原有工具、插件和历史会话恢复能力保留。

> [!IMPORTANT]
> **项目仍处于开发阶段，不是稳定发行版。** 当前构建和 Windows 本机安装已有验证；目标保护、签名发布、桌面并存和全平台验收尚未完成。

## 开箱即用的破甲体验

Uncensored 默认加载中文 armor，并内置英文文本，无需安装插件、复制提示词或修改配置。armor 位于系统提示词前部，排在 Harness 身份说明之前，四种模式共用。默认权限为完全权限，可在设置中调整。文本来自 **dsh-purge 的 MIT 历史版本**，模式增强不会改写该文本。破甲改变模型接收的指令，不改变模型本身，也不保证模型永不拒答。

## 四种模式

新对话默认使用 **缺省**，发送前可以更换。已有对话默认锁定；临时切换模式和关闭敏感操作确认均需倒计时确认。

| 模式 | 工具与资料 |
| --- | --- |
| <img src="https://img.shields.io/badge/缺省-4B8BFF?style=flat-square" alt="缺省 · 蓝色"> | 文件、终端、检索、任务协作与工作流工具。默认 Flash、Max 推理和完全权限，适用于开发与日常任务。 |
| <img src="https://img.shields.io/badge/网安-EF5363?style=flat-square" alt="网安 · 红色"> | 7 份现场手册、案件账本和报告。目标、证据与发现保存在 `.security/<案件>/`；独立代理支持连通性检查和脱敏流量查看。 |
| <img src="https://img.shields.io/badge/逆向-40BE87?style=flat-square" alt="逆向 · 绿色"> | 8 份手册、加密识别、Frida 配方和只读样本清点。案件与分析记录保存在 `.reverse/<案件>/`，可跨会话使用。 |
| <img src="https://img.shields.io/badge/写作-E6B84A?style=flat-square" alt="写作 · 黄色"> | 7 份写作手册、六轴风格卡和 `story/bible/` 设定集。仅注入选中的资料，不挂载终端或代码执行工具。 |

## 其它通用增强

| 功能 | 说明 |
| --- | --- |
| **旁问与随问** | <kbd>/side</kbd> 在右栏保留独立对话，同步主线已完成内容，不写回主线。<kbd>/btw 问题</kbd> 使用全新上下文单次回答，结果显示在主对话中。 |
| **输入建议** | 默认关闭。开启后显示灰色补全，按 <kbd>Tab</kbd> 填入但不发送；使用当前模型，请求计入额度并写入日志。 |
| **跨对话记忆** | 可查看、搜索、编辑、启停和删除结构化记忆。默认限定当前工作区与模式，全局共享需显式选择。 |
| **余额与曲线** | 默认每 15 秒采样，点击可立即刷新。金额平滑变化，零赠金项隐藏；历史曲线保留峰谷，高低峰按北京时间计算。 |
| **额度与续跑** | 六档滚动限额，请求前预留费用，结算与在途分别统计。额度恢复后继续原任务，支持本应用普通对话跨重启续跑。 |
| **会话管理** | 项目行可打开进行中对话，忙碌时按 <kbd>Enter</kbd> 插话。删除对话会清理关联旁问、随问和子任务，保留独立分支与工作区文件。 |
| **独立与主题** | 独立应用名、CLI、深链和数据目录；设置分为通用、模型、额度、模式、插件。提供模式配色、会话色条、过渡动画和四种外观。 |
| **历史与更新** | 旧 PTC、Minimal 会话按原配置恢复。关于页显示版本与构建来源，更新提醒区分版本级别、无发行版、离线和失败。 |

## 快速开始

需要 **Node.js 22.19+（22.x）或 24+、Corepack 和 Git**。

```powershell
corepack pnpm install
corepack pnpm run build
corepack pnpm dsh web
```

Web 地址为 **http://127.0.0.1:23333**；本地 CLI 安装见 [install-uncensored.ps1](scripts/install-uncensored.ps1)。<br>默认数据目录为 `~/.dsh-uncensored`，可通过 `DSH_UNCENSORED_HOME` 修改；CLI 为 `dsh-uncensored`，深链为 `dshu://open`。<br>启动器不继承官方版 `DSH_HOME`；SDK 显式目录由调用者负责。Flash 是服务端模型别名，不保证永久固定在 1017 版本。

## 开发进度

项目尚未完成总验收。百分比综合实现、测试和实际验收估算，不代表稳定版完成度。依据见[完整编号清单](.agents/requirements/development-checklist.md)与[开发交接](.agents/HANDOFF.md)。<br><strong>✅ 13 项完成　·　🚧 17 项进行中　·　⏳ 5 项待实现</strong>

<details>
<summary><strong>查看全部 35 项进度</strong></summary>

| 状态 | 项目 | 估算 | 进展与下一步 |
| --- | --- | ---: | --- |
| ✅ | 独立版本、数据目录与启动入口 | 完成 | 版本解耦，独立目录、CLI、深链和构建信息已具备 |
| ✅ | 四模式选择与默认规则 | 完成 | 固定顺序和缺省默认，保留中英与旧会话兼容 |
| ✅ | 已有对话的模式锁定 | 完成 | 倒计时确认、运行中禁止切换、重启撤销临时权限 |
| ✅ | 首次网安责任确认与声明输入 | 完成 | 真实保护状态、倒计时、声明校验与错误反馈 |
| ✅ | 工作区与进行中对话入口 | 完成 | 无工作区会话、忙碌插话和项目快捷入口 |
| ✅ | 随问 `/btw` | 完成 | 全新上下文单次回答，无追问输入框 |
| ✅ | 设置分组、插件迁移与默认项 | 完成 | 五分组及工作步骤、用量等默认项 |
| ✅ | 模式资料基础管理 | 完成 | 案件、证据、报告、样本清点、文风与设定资料 |
| ✅ | 日出日落与外观预览卡 | 完成 | 四种外观、时区代表城市估算与手动城市 |
| ✅ | 统一下拉控件 | 完成 | 共享主题、滚动、键盘操作和焦点恢复 |
| ✅ | 关于页、来源信息与反馈入口 | 完成 | 版本、提交、编译时间、GitHub 与 Issue 入口 |
| ✅ | GitHub 更新检测与分级提醒 | 完成 | 更新级别、空发布列表、离线和失败状态 |
| ✅ | README、Credit 与许可证声明 | 完成 | 公开说明集中维护，保留上游署名与许可 |
| 🚧 | 旁问 `/side` | 90% | 主线同步、关闭重开与长上下文已验证；剩最终场景复核 |
| 🚧 | 对话删除 | 90% | 关联清理与真实重启删除已验证；剩总体验收复核 |
| 🚧 | 余额与统计 | 90% | 采样、滚动数字、曲线与多尺寸检查已有；剩最终视觉巡检 |
| 🚧 | 额度限制与自动续跑 | 85% | 真实模型恢复、停止和删除路径已验证；剩综合验收 |
| 🚧 | 设置排版与中英文细节 | 85% | 模式选择与配置分离；剩全页面文案、控件与无障碍巡检 |
| 🚧 | 写作特化 | 85% | 手册、资料注入与长篇用例已验证；长篇一致性与更多文风用例待验收 |
| 🚧 | 模式主题与完整动效 | 80% | 主要强调色和切换动画已有；剩全页面与减少动态效果巡检 |
| 🚧 | 输入预测与 Tab 预填充 | 80% | 灰字、Tab、取消与日志已有；剩全场景和独立成本测量 |
| 🚧 | 黑化 Logo 与品牌统一 | 75% | 图标资源和应用名称已有；剩安装缓存与全场景尺寸验收 |
| 🚧 | 模式页功能联动 | 75% | 按模式分标签配置；剩记忆资料联动和真实目标保护 |
| 🚧 | 网安特化与独立代理 | 70% | 手册、案件、代理与流量查看已有；剩保护与记忆联动 |
| 🚧 | 逆向能力与外部工具接入 | 70% | 手册、案件和样本清点已有；外部引擎需另装并实测 |
| 🚧 | 跨对话记忆 | 70% | 保存、检索、隔离与管理已有；剩自动提炼、摘要和来源失效标记 |
| 🚧 | 文档与仓库整理 | 70% | README、内部记录和 main 已整理；剩旧链接与流程核对 |
| 🚧 | 官方版并存与桌面交付 | 70% | 未签名安装包已在本机构建并安装；剩并存、升级、签名验收 |
| 🚧 | 稳定性与完整需求总验收 | 60% | 主要构建与相关回归已有；剩跨平台、回放和原始需求逐项核对 |
| 🚧 | 更新下载与发布路径 | 50% | 更新源已校验；真实下载、签名、安装与发布尚未验证 |
| ⏳ | 境内域名与手动规则保护 | 待实现 | 真实执行后端，以及域名、主机、正则、重定向与别名判定 |
| ⏳ | 生产/测试服务器与数据库保护 | 待实现 | 完全保护、只读安全审计、测试例外，以及命令和文件操作校验 |
| ⏳ | 保护审计与各功能联动 | 待实现 | 执行校验、审计日志、模式设置、责任确认与代理目标判断 |
| ⏳ | 完整依赖许可证审计 | 待实现 | 整合发行的生产依赖和参考项目许可核对 |
| ⏳ | 官方版插件状态核实与恢复 | 待实现 | 独立核实此前被改动的官方版，再按实际结果修复 |

</details>

## 当前限制

> [!WARNING]
> 网安首次确认展示的是**真实保护状态**，不是保护开关。境内域名、生产服务器和数据库的执行保护尚未接入，责任声明不能代替保护措施。

- 独立代理仅覆盖 `web_fetch` 和遵守代理环境变量的一次性命令；不覆盖浏览器、MCP、常驻终端和子智能体。HTTPS 隧道只记录元数据。
- 记忆尚未实现自动提炼、语义检索和来源失效标记。数据保存在 `storages/memory.json`，文件损坏时会报错，不会清空。
- 暂无正式发布安装包；更新下载、签名验证、安装升级与桌面并存仍待验收。额度恢复不接管其他运行环境或子智能体。
- 额度为保守估算，不是账单。账本升级到 v2 后不能用旧构建读取，旧未分类暂停记录需手动恢复。反编译引擎需在本机另行安装或连接。

## 反馈与许可

[提交 Issue](https://github.com/Water-Run/deepseek-harness-uncensored/issues/new/choose) · [源代码](https://github.com/Water-Run/deepseek-harness-uncensored) · [Releases](https://github.com/Water-Run/deepseek-harness-uncensored/releases) · [上游 DSH](https://github.com/deepseek-ai/deepseek-harness)<br>整合发行采用 **[GPL-3.0-or-later](LICENSE)**，上游和第三方组件保留各自许可证与版权声明。

## Credit

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：DeepSeek 原始工程，保留 [MIT 许可](LICENSES/deepseek-harness-MIT.txt)。<br>[dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)：小杨（YuJunZhiXue）；破甲文本追溯至 [MIT 版本 e1d8e590](https://github.com/Water-Run/dsh-purge/tree/e1d8e59087857fa86d0ef2bb9878800274b13a29)，[原始许可](LICENSES/dsh-purge-MIT.txt)随仓库保留。<br>[dsh-purge-plus](https://github.com/JeffKeeping/dsh-purge-plus)：JeffKeeping；保留 purge fork 所要求的来源署名。<br>[Water-Run/dsh-purge](https://github.com/Water-Run/dsh-purge)：本分支对照的个人 fork，版本节点与时间见应用“关于”。<br>GitHub 图标来自 [Octicons](https://github.com/primer/octicons)，保留其 [MIT 许可](packages/client/ui-settings-account/GITHUB-MARK-LICENSE.txt)。<br>dsh-purge 后续专有许可分支不作为复制源码的授权依据；这里保留的是上述旧 MIT 文本的许可。
