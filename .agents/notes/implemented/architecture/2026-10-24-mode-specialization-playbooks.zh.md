# Agent Note：用作战手册包实现模式特化

Status: implemented

[English](2026-10-24-mode-specialization-playbooks.md) | 中文

## 问题

网安、逆向、写作三个模式此前只靠人设文字、模式配色和一段简短说明来区分。对应需求要求真正的能力，并要求调研开源项目、记录许可证与取舍。只做提示词特化过不了三项检验：模型无法在任务需要时加载更深入的手册；上下文压缩后没有任何持久资料；仓库里找不到可指认的交付物作为证据。

框架其实已经提供了正确的接缝。`ctx.skills` 合并各提供方的目录，预设只挂载本模式需要的工具与提供方，`dsh-tool-skill` 在会话中展示摘要并按需加载正文。`skill-office` 已经证明第一方包可以携带指令资源。

## 决定

新增 `@deepseek-ai/dsh-skill-playbooks`：一个提供方，内置三套原创作战手册，只挂载预设指定的那套。

- 网安、逆向、写作三个预设分别以 `packs: [<mode>]` 挂载；缺省预设不挂载。
- 每套手册包含技能形式的现场手册、作为技能资源的参考表，以及 `assets/shared/scripts/` 下零依赖的 Node 脚本。
- `casefile.mjs` 与 `sample.mjs` 提供真实存储与可复现清点：在 `.security/` 或 `.reverse/` 下建立案件目录，记录目标、证据、发现、哈希、熵，并可渲染报告。写作模式按设计不挂载终端，其连续性流程使用文件工具把设定写入 `story/`。
- 预设人设直接点名已挂载的技能与案件约定，模型无需先读完所有手册即可路由。
- 不内嵌任何第三方代码。外部项目只在正文中点名，脚本均为原创。

### 开源调研与许可证

| 参考项目 | 本次用途 | 许可证 |
| --- | --- | --- |
| [`morluto/rea`](https://github.com/morluto/rea) | 确认原生、JS/Electron、.NET、APK 与 adb 分析的提供方桥接方式；在逆向工具表中点名 | MIT |
| [`mrexodia/ida-pro-mcp`](https://github.com/mrexodia/ida-pro-mcp) | 逆向工具表中的 IDA MCP 桥；已核对 MIT 许可证原文 | MIT |
| [`LaurieWired/GhidraMCP`](https://github.com/LaurieWired/GhidraMCP) | 逆向工具表中的 Ghidra MCP 桥 | Apache-2.0 |
| [`swisskyrepo/PayloadsAllTheThings`](https://github.com/swisskyrepo/PayloadsAllTheThings) | 按漏洞类型交叉核对覆盖面；已核对 MIT 许可证原文；载荷表为独立编写 | MIT |
| `Ghidra`、`radare2`/`rizin`、`Frida`、`JADX`、`apktool`、`capa`、`YARA`、`angr`、`z3`、`pwntools` | 工具表中点名，未随包分发 | Apache-2.0 / LGPL-3.0 / wxWindows / Apache-2.0 / Apache-2.0 / Apache-2.0 / BSD-3-Clause / BSD-2-Clause / MIT / MIT |

写作指导为原创文字，未复制任何受版权保护的写作教程或样本文本。`SillyTavern` 与 `novelWriter` 仅作为世界观资料和长篇组织的先例调研，未复制代码、数据格式或文本（SillyTavern 为 AGPL-3.0，novelWriter 为 GPL-3.0，均只作参考）。

## 备选方案

- **选择指令资源而非新后端。** Ghidra/IDA 桥、交战数据库服务、云 SDK 集成各自都需要包、界面与覆盖率工作。手册包先交付可用能力，引擎集成继续走既有 MCP 与工具接缝。
- **一个包三套手册而非三个包。** 单提供方避免三套清单与门禁；手册名互不重叠，预设只挂载一套。
- **用脚本而非新工具。** `casefile.mjs` 与 `sample.mjs` 不需要工具 schema、展示与会话事件，直接通过既有命令执行工具运行。代价是没有执行能力的组合只能读手册，不能跑脚本。
- **原创文本而非导入现成手册。** 导入 HackTricks 或 PayloadsAllTheThings 正文会带来许可义务，也会把过时或风格不合的内容放进模型上下文。点名工具既保持许可干净，也控制篇幅。

## 影响

- 三个专门化模式现有 22 份可加载手册、配套参考文件和两个可运行脚本；人设按名称路由。
- 跨对话复用是文件约定而非隐藏状态：新会话读取案件目录或设定集即可继续。
- 手册不能安装工具、提供许可证或替代分析引擎；README 与 TODO 记录这一边界。
- 后续引擎集成（Ghidra/IDA MCP、交战界面、代理、记忆）通过既有接缝接入，无需重写手册。
