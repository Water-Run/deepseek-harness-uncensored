---
description: "Settings panels for the specialized modes: security and reverse-engineering case ledgers, the writing registry and its selection, and read-only sample inventory, all under the mode cards."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-mode-materials

[English](README.md) | 中文

## Summary

本包用于在“设置 → 模式”中管理各特化模式保存的文件。它向 `settings.mode.materials` 槽位为每种模式注册一个面板，该槽位由模式分组渲染在模式卡片下方；所有读写都通过 Host 的 `modeDossiers` Remote 命名空间完成。只有拥有当前模式的面板会渲染，其余面板保持挂载但不显示任何内容，因此切换模式不会关闭已打开的对话框，也不会丢弃已输入的文字。

各面板都可打开共享记忆管理器，并选中对应的模式筛选。新增记录沿用该模式，编辑器仍明确显示工作区与共享范围。

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

把本包挂在浏览器清单中 `@deepseek-ai/dsh-api-mode-dossiers` 旁边。它依赖模式分组的槽位声明（由 `@deepseek-ai/dsh-client-ui-agent-preset` 拥有）、用于选择工作区的 Workspace 界面服务，以及 Remote 命名空间。

| 面板 | 模式 | 内容 |
|---|---|---|
| `SecurityMaterials` | `security` | 案件列表、新建案件对话框、打开后的目标/证据/发现/备注与目标说明，以及渲染出的报告 |
| `ReverseMaterials` | `reverse` | `.reverse/` 的同一套案件工作台、本机实际可用的工具状态，以及只读样本清点表单 |
| `WritingMaterials` | `writing` | `story/style` 与 `story/bible` 资料、写作请求收到的选择、纳入未登记文档，以及正文编辑器 |

范围栏写明面板管理的工作区、它在 Host 上的路径，以及打开目录选择器的入口。没有工作区、或工作区目录已消失时，面板显示对应状态，而不会写到任何地方。

### Editing and conflicts

每个编辑对话框都会记住它打开时所在的工作区，因此之后切换工作区不会把保存写入另一个工作区。保存会带上文档打开时的版本；如果文件在此期间被改过，对话框与其文字都会保留并报告冲突，写作编辑器中的“覆盖”需要再点一次才会执行。

### Deleting

删除案件记录会从 `case.json` 删除该条记录，并明确说明；样本与证据文件不受影响。删除写作记录只删除登记条目与选择，对话框会写明 `story/` 下的文档仍保留在工作区。

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/client/index.ts` 负责 Remote 调用、清单 store 与三个注册；`src/client/contract.ts` 是面板收到的注入接口；`ModeMaterials.tsx` 是按模式分派的面板；`CaseWorkbench.tsx`、`ReversePanel.tsx`、`WritingPanel.tsx` 是具体面板；`ui.tsx` 与 `scope.tsx` 是共享的对话框与工作区部件。组件看不到 `ctx`：它们只接收普通数据、回调与绑定的清单 hook。

## Further Exploration

- [模式资料存储](../../api/mode-dossiers/README.zh.md) —— 本界面渲染的 Host 服务、文件格式与失败代码。
- [模式设置分组](../ui-agent-preset/README.zh.md) —— 本包所贡献槽位的拥有者。

<a id="model-experience"></a>
## Model Experience

本包不向模型请求添加任何内容。它编辑的文件随后由 Host 服务使用；写作选择对模型可见的效果由 `@deepseek-ai/dsh-api-mode-dossiers` 拥有并记录。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- 目标保护尚未实现。代理控件由 ui-security-proxy 提供；记忆入口打开共享管理器。
- 逆向面板配置已安装的 REA 可执行文件，按版本保存设置并检测临时连接。工具搜索展示已检测的目录，明确区分可选引擎路径与实际分析可用性。软件仍需单独安装。
- 清单按需读取并在每次保存后刷新，没有文件系统监视；其他进程的修改会在下次刷新后出现。
- 选择界面是每份资料一个复选框，没有拖拽排序；Host 按登记表顺序渲染资料。

<a id="dev-note"></a>
## Dev Note

<details>
<summary>维护者工作上下文——点击展开</summary>

每个面板都是 `settings.mode.materials` 的一个列表项，对其他模式返回 `null`。这正是切换模式后对话框状态仍保留的原因：卸载列表项会丢弃它。槽位拥有者传入 `modeId`，面板自己不读取模式列表。

</details>
