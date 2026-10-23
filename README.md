<p align="center"><img src="apps/desktop/resources/icon.svg" width="96" alt="Uncensored 黑底白鲸图标"></p>

# Deepseek Harness Uncensored: 更自由的探索未至之境

Uncensored v0.1.0，基于 DSH 0.2.1-rc.2 的独立分支。面向已经使用 DSH 的用户，保留原有工具与插件体系，内置提示词调整，使用独立的应用身份和数据目录。

## 通用增强

- **独立安装**：应用名、CLI、深链和默认数据目录与官方版分开，可同时使用。
- **旁问与随问**：`/side` 在右栏打开旁问，每次提问同步主线已完成的新进展，关闭重开可继续，内容不写回主线。超长更新保留最近内容并标注省略。`/btw 问题内容` 使用全新上下文回答一次，在主会话内显示简洁结果块；空命令不创建窗口，结果块没有追问输入框。
- **余额与统计**：显示充值余额，有赠金时并排显示赠金余额；默认每 15 秒刷新，点击余额立即刷新，提供历史曲线、本机/API 来源切换和高峰／低谷时段提示。曲线来自本机采样，余额变化包含充值、赠金和到期变化。
- **集中设置**：按通用、模型、额度、模式、插件分组。登录与账号管理位于模型页，余额、账单入口与限额位于额度页，插件安装和配置在设置中完成。
- **额度限制**：默认关闭；支持 15 分钟／1 小时／5 小时／1 天／7 天／30 天六档限额，默认分别为 5／15／50／100／500／2000 元。进度条区分费用估算和在途预留，额度不足时暂停新的请求；可自动恢复、手动恢复或重置统计，在途预留不会被重置清空。
- **界面与交互**：黑底白鲸图标、模式配色与过渡动画；会话左侧用色条标记模式，新会话、失败和未知状态显示灰色；保留中英双语。支持不关联工作区的新会话，忙碌时按 Enter 默认插话。
- **模型与权限**：默认 Flash、Max 推理和完全权限，权限可调整。模型菜单只显示 Flash，已有会话的模型仍可解析。
- **关于与反馈**：显示独立版本、DSH 原版本、源码节点与时间、purge fork 节点与时间及编译时间；提供仓库、GPL 许可和 GitHub Issue 入口。

## 模式

按 **缺省 → 网安 → 逆向 → 写作** 排列。新会话可以选择模式；已有会话默认锁定，在设置中开启“允许已有会话切换模式”后可于空闲时切换。

| 模式 | 配色 | 用途 |
| --- | --- | --- |
| 缺省 | 蓝色 | 开发、文件处理、终端操作、检索与日常任务 |
| 网安 | 红色 | 安全分析、验证、复现与证据记录 |
| 逆向 | 绿色 | 二进制、程序行为与协议分析 |
| 写作 | 黄色 | 小说、剧本、续写、编辑与长文创作 |

**缺省模式**使用文件、终端、检索、任务协作与工作流工具，适合从调查到修改、验证的完整任务。

**网安模式**侧重目标分析、工具执行、结果复核和证据整理。保留完整的执行与协作工具，区分已验证结论和待验证推测。

**逆向模式**围绕样本、哈希、平台与架构展开，追踪字符串、符号、调用关系和运行证据。可调用已安装的分析工具；深入反编译需要配置 Ghidra、IDA、Hopper 或 REA 等后端。

**写作模式**使用文件、检索和呈现工具，侧重自然表达、人物声音、叙事视角与情节连续性。直接交付正文，支持续写和编辑；不挂载终端或代码执行工具。

## 使用

额度按公开高峰费率保守估算，覆盖对话、重试、标题、压缩和 DeepSeek 原生搜索；不等同于账单，不包括应用外请求或其他付费工具。请求先按配置的上下文容量和最大输出预留，收到完整用量后结算；用量不明时保留全额估算，未配置费率的模型在启用限制时被拦截。统计保存在独立数据目录中，并由本机进程共享。

开发环境需要 Node.js 22.19+（22.x）或 24+、Corepack 与 Git。

```powershell
corepack pnpm install
corepack pnpm run build
corepack pnpm dsh web
```

Web 默认地址为 `http://127.0.0.1:23333`。桌面版保留 Electron 独立窗口；本地 CLI 安装脚本为 [install-uncensored.ps1](scripts/install-uncensored.ps1)。

| 项目 | Uncensored |
| --- | --- |
| 默认数据 | `~/.dsh-uncensored` |
| 自定义数据目录 | `DSH_UNCENSORED_HOME` |
| CLI | `dsh-uncensored` |
| 深链 | `dshu://open` |
| Windows 应用名 | `DeepSeek Harness Uncensored` |

继承的官方默认 `DSH_HOME=~/.dsh` 不会用于本分支；显式指定目录仍由调用者负责。无工作区会话使用 Host 默认工作目录。Flash 使用服务端模型别名，不能保证永久固定在 1017 版本。

## 当前限制

本分支仍在开发中。模式专用资料与跨对话记忆、目标与数据库保护、手动域名规则、网安独立代理与流量查看、额度限制与自动恢复、设置重做及分级更新提醒正在完善。

签名桌面包的更新地址指向本仓库 [GitHub Releases](https://github.com/Water-Run/deepseek-harness-uncensored/releases)。当前没有已发布的安装包，更新下载、签名验证和安装尚未做真实发布验证；未签名的本地构建不启用自动更新。

内置提示词不会提高模型本身的能力，也不保证任务成功。原始 DSH 的基础功能与插件用法请参阅 [上游仓库](https://github.com/deepseek-ai/deepseek-harness)。

## 反馈与许可

[提交 Issue](https://github.com/Water-Run/deepseek-harness-uncensored/issues/new/choose) · [源代码](https://github.com/Water-Run/deepseek-harness-uncensored) · [GPL-3.0-or-later](LICENSE)

本项目的整合发行采用 **GPL-3.0-or-later**；上游和第三方组件保留各自许可证与版权声明。

## Credit

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：DeepSeek 的原始工程，保留 [MIT 许可](LICENSES/deepseek-harness-MIT.txt)。
- [dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)：小杨（YuJunZhiXue）。内置提示词可追溯至 [MIT 版本 e1d8e590](https://github.com/Water-Run/dsh-purge/tree/e1d8e59087857fa86d0ef2bb9878800274b13a29)，[原始许可](LICENSES/dsh-purge-MIT.txt)随仓库保留。
- [dsh-purge-plus](https://github.com/JeffKeeping/dsh-purge-plus)：JeffKeeping；同时保留 purge fork 所要求的来源署名。
- [Water-Run/dsh-purge](https://github.com/Water-Run/dsh-purge)：本分支对照的个人 fork，版本节点与时间见应用的“关于”。
- GitHub 图标来自 [Octicons](https://github.com/primer/octicons)，保留其 [MIT 许可](packages/client/ui-settings-account/GITHUB-MARK-LICENSE.txt)。

dsh-purge 后续专有许可分支不作为这里复制源码的授权依据；这里保留的是上述旧 MIT 文本的许可。
