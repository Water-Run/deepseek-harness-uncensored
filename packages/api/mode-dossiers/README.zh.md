---
description: "Mode-owned dossier storage and its settings surface: security and reverse-engineering case ledgers, the writing-materials registry with its request context, and read-only sample inventory."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-mode-dossiers

[English](README.md) | 中文

## Summary

本包管理各个特化模式已经在用的文件。网安与逆向案件是 `casefile.mjs` 在 `.security/`、`.reverse/` 下维护的 `case.json` 账本；写作资料是 `story/style/`、`story/bible/` 下的文档，以及记录哪些文档会随写作请求发送的登记表。本包拥有存储与请求上下文；设置面板在 `@deepseek-ai/dsh-client-ui-mode-materials`。

每次读写都经过组合后的文件系统并使用工作区相对路径，请求无法指向它绑定工作区之外的文件。写入会带上编辑器打开时的版本：如果文件之后被另一个窗口或脚本改过，就报告冲突并保持原文件不变。

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

把本包与 `dsh-fs`、Workspace 注册表和 Typert Gateway 一起挂载。客户端部分在 `@deepseek-ai/dsh-client-ui-mode-materials`，向 `settings.mode.materials` 注册三个面板，该槽位由模式设置分组在模式卡片下方渲染。

| 方法 | 返回 | 用途 |
|---|---|---|
| `inventory(scope)` | `DossierInventory` | 工作区身份、两类案件列表、写作登记表，以及本机实际能用的工具状态 |
| `readCase({ kind, slug })` | `DossierCaseView` | 一个校验过的账本及其版本标记 |
| `createCase({ kind, slug, objective })` | `DossierCaseView` | 一个空账本，与 `casefile.mjs init` 一致 |
| `mutateCase({ kind, slug, expectedVersion, mutation })` | `DossierCaseView` | 在版本保护下应用一次编辑 |
| `report({ kind, slug })` | `DossierReport` | `casefile.mjs report` 输出的同一份 Markdown 报告 |
| `readStory({ path })` | `StoryEntryDocument` | 一篇写作文档及其版本 |
| `writeStory({ path, expectedVersion, markdown })` | `StoryEntryDocument` | 在版本保护下替换一篇文档 |
| `createStory({ section, name, title, markdown })` | `StoryEntryDocument` | 新建一篇文档并登记为选中 |
| `adoptStory({ path })` | `DossierInventory` | 把工作区已有的文档纳入登记表 |
| `removeStory({ path })` | `{ selected }` | 删除登记记录，文档本身保留 |
| `selectStory({ selected })` | `{ selected }` | 替换写作请求会收到的资料集合 |
| `inspectSample({ path })` | `SampleInspection` | 只读字节得出的哈希、容器格式、熵与有界字符串 |

### Storage layout

网安案件是 `.security/<slug>/case.json`；逆向案件是 `.reverse/<slug>/case.json`。两者都是格式版本 1 的文档，含 `targets`、`evidence`、`findings`、`notes` 四个数组，因此这里写出的文件就是手册脚本读取的文件，反之亦然。本版本不理解的字段——其他工具加在顶层的键、记录上的额外字段——都会留在磁盘上：编辑直接修改解析后的对象，只替换自己负责的字段。

写作资料是 `story/style/*.md` 与 `story/bible/*.md`。登记表 `story/materials.json` 记录受管理的路径、标题、类别和当前选择。这两个目录里尚未登记过的 Markdown 文件会列为“未纳入”，可以纳入而不是被覆盖。

### Version guards and conflicts

这里没有锁文件。写入会比较文件当前版本与请求携带的版本，并使用后端自身的受保护替换，因此并发写入的结果是 `mode-dossier/conflict`，而不是静默丢失一次编辑。冲突的请求不会被应用，其文本也不会落盘。

### Failures

存储层的问题会作为 `inventory` 上的已报告问题返回——没有工作区、工作区目录已消失、目录不可读、文件损坏、或本版本不认识的格式版本——其他方法则以相同代码作为 Remote 失败返回。损坏的账本会与可用的账本一起列出，而不会让整张列表消失。格式错误的输入绝不会改写已存文件。

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/casefile.ts` 负责账本校验、编辑、序列化与报告渲染；`src/story.ts` 负责登记表、文档读写和选择；`src/sample.ts` 从字节计算清点结果；`src/tools.ts` 给出工具状态；`src/index.ts` 是 Remote 服务与 pre-step 上下文。面板位于 `@deepseek-ai/dsh-client-ui-mode-materials`。

## Further Exploration

- [模式特化手册](../skill/skill-playbooks/README.md) —— 读取这些文件并记录其格式的技能。
- [工作区文件服务](../workspace-files/README.zh.md) —— 本包没有重复实现的只读文件接口。

<a id="model-experience"></a>
## Model Experience

本包只贡献一项模型可见输入：登记表中有选中资料的写作模式请求，会收到一条 user 角色消息，按 `### <路径>` 小标题列出选中的文档。这条消息就是普通的会话历史——像其他 user 消息一样持久化、重放和压缩——且在选择的资料变化时发送一次，而不是每一步都发送。未被选中的文档不会进入这条消息；存储不可读时请求保持原样。token 开销由 `contextBytes`（默认 16 KiB）限制，并受单文档上限约束，被截断的文档会标注截断。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- 目标保护（境内域名、生产服务器与数据库）尚未实现。目标在这里只是案件资料，记录目标不会阻止任何操作，面板上也写明了这一点。
- 代理流量与结构化记忆由各自服务管理；案件文件仍是工作区文档。
- 仅应用所有者可调用 `reaSettings`、`configureRea`、`probeRea`，读取 REA 启动配置、按版本写入设置或进行临时 MCP 握手。检测报告实际版本与目录，检查已配置的引擎路径并关闭进程；不会安装软件或认证可选引擎。实际分析由 REA Agent 消费端负责。
- 删除写作资料只删除登记记录，文档保留。删除案件记录会重写 `case.json`，不会触碰任何样本或证据文件。
- `inspectSample` 通过 `readBytes` 读取整个文件，上限约束的是内存，而不是流式处理超大样本。

<a id="dev-note"></a>
## Dev Note

<details>
<summary>维护者工作上下文——点击展开</summary>

设置分组拥有 `settings.mode.materials` 槽位，本包只向它贡献内容。槽位的拥有者传入 `modeId`，每个面板只在拥有该模式时渲染。新增第四种模式时请保持这一约定：面板收到的是当前模式的身份，而不是模式列表的副本。

</details>
