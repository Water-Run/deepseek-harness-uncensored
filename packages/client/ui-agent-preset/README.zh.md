---
description: "在 Web 中选择当前对话的 Agent preset，查看各模式的说明与声明的配置。新对话默认使用缺省。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-agent-preset

[English](README.md) | 中文

## 概述

在 Web 中选择当前对话的 Agent preset，查看各模式的说明与声明的配置。新对话默认使用缺省。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

设置页高亮当前对话使用的模式。点击卡片切换当前选择。新对话默认使用缺省，设置中不能修改默认项。每张卡片提供只读 YAML 配置查看器。加载失败的预设仍可查看；Escape 仅关闭查看器并恢复焦点，离开设置页后丢弃迟到的读取结果。只有部署提供 `cordis` 且存在会话流程时，才显示创造入口。

本发行按顺序提供缺省、网安、逆向和写作。部署可提供其他预设。关闭代码工作工具时隐藏内置 PTC 和极简项，不隐藏有名称的自定义覆盖项。部署提供 `cordis` 时，创造入口使用该预设启动新任务。

模式设置同时提供已有对话切换的临时权限。启用需阅读十秒后明确确认，后端也会校验计时；取消则保持关闭。权限不写入配置，Host 重启后恢复关闭。授权后，已有对话仍须空闲才能切换。其他窗口会同步权限变化，迟到的读取结果不会覆盖更新的撤销操作。

关闭代码工作工具时清空尚未应用的选择，之后仍可重新选择可用预设。已有会话保留所选模式，即使该模式不在菜单中，其标签仍会显示。重新开启代码工作工具不会恢复已清除的选择。旧配置中保存的默认项不影响新对话。

已知的内置预设提供只读的模式说明与使用示例对话框。极简模式指南介绍图片读取、自动历史压缩以及会话空闲时的 `/compact` 命令。各页签保留各自的滚动位置；关闭后焦点回到打开它的操作。帮助不会改变新任务默认值。默认徽标取代卡片的分组徽标，预设 id 显示在标题旁。指南文案与示例归本包所有。

插件页**添加插件**箭头菜单中的**让 Agent 创建插件**进入与设置页相同的创造流程，不发送消息，并保留未发送的草稿。读取预设列表或创造模式不可用时，菜单项禁用并说明原因。Host 拒绝切换预设时，两处入口均通过 Toast 显示原因。

进入创造模式会为接收该选择的空白 Session 选择 `cordis`，不改变新任务默认值或代码工作工具设置。尚未绑定工作区或空白 Session 时，选择等待绑定完成后应用。应用后，创造 Session 保留该预设；之后真正创建的新 Session 使用配置的默认值，例如标准模式。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

`agentPresets/list` 提供列表并标记部署默认值，`agentPresets/read` 为查看器提供一条声明的 YAML。选择器、空白会话同步和只读会话标签使用记录的 preset 标识。连接重置和设置更新会刷新列表。

`CreatePluginMenuItem` 使用共享的预设列表 store，向 `plugins.add.actions` 贡献菜单项。选择时先调用页面传入的 `onDismiss()`，再调用与设置页 `creatorDraft` 相同的 `startCreatorDraft` 回调。该回调通过 `AgentPresetSeatController` 暂存 `cordis`，再通过显式保留草稿并传入 `agentPreset: 'cordis'` 的 `uiWorkspace.startSession` 调用打开任务，由 Host 以创造模式组合被复用的空白 Session 或新 Session；没有目标工作区时，暂存选择在 Session 绑定可用时应用。暂存选择应用后即清除。代码工作工具开启或关闭时均使用同一个选择器和选择 store，`AgentPresetSeat` 通过共享的 `Toast` 组件显示拒绝原因。

</details>

<a id="further-exploration"></a>
## 延伸阅读

- [Scope](../../core/scope/README.zh.md) — 注册隔离。
- [Agent](../../core/agent/README.zh.md) — 会话运行时。
- [Cordis](../../../vendor/cordis/README.md) — 插件配置与生命周期。

<a id="model-experience"></a>
## 模型体验

通过选定的 preset 间接影响模型，其插件拥有模型可见能力。

#### KV Cache effect

选择变更只影响之后的任务，已有插件与提示词保持不变。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- Web 不创建也不编辑 preset：配置查看器是只读的；通过创造模式安装的 bundle 声明新 preset，或按行 id 覆盖内置 preset，覆盖会替换整个子插件列表。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
