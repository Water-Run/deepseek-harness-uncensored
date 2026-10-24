---
description: "通过声明式 preset 选择 Agent 的工具、提示词和技能。同一进程可以运行多种组合。配置失败会显示在列表中；现有 Agent 保留已经使用的组合。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-preset-registry

[English](README.md) | 中文

## 概述

通过声明式 preset 选择 Agent 的工具、提示词和技能。同一进程可以运行多种组合。配置失败会显示在列表中；现有 Agent 保留已经使用的组合。

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

首次网安确认在去除首尾空白并进行 NFKC 规范化后比较声明。字符宽度不影响结果；签发的声明、阅读间隔、会话身份和保护版本仍须匹配。

公开选择列表不包含标记为 `hidden` 的定义。历史解析和挂载仍使用它们各自的插件组成，因此从选择器隐藏旧选项不会把旧会话的工具集替换成另一模式。

### 最小配置

```yaml
- id: agent-preset-registry
  name: '@deepseek-ai/dsh-agent-preset-registry'
  config:
    default: standard
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    plugins: []
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `default` | 必填 | 未显式指定时使用的 preset ID |
| `securityEntryPreset` | `security` | 需要首次进入确认的 preset |
| `requireSecurityEntryAcknowledgement` | `false` | 新主对话是否必须每次 Host 生命周期确认一次该 preset |

Web 内置定义来自 `dsh-web-app` bundle。定义使用普通插件行；注册表不扫描目录，也不接受 preset 路径。新会话使用部署的 `default`，本发行的 Web 配置固定为 `standard`。旧字段 `selectedDefault` 仍可解析但不再生效；各会话仍可显式选择模式。profile patch 仍可能带有已废弃的 `modeSelectionEnabled` 字段；注册表未声明该字段，既不读取也不重写它。

已有对话仅在空闲且经过所有者确认后才能切换模式。`beginModeSwitch` 签发一次性确认标识，`confirmModeSwitch` 校验单调时钟计时已满十秒，`disableModeSwitch` 撤销权限及待确认标识。标识五分钟后过期。每次注册表启动时权限均关闭，且不持久保存。旧配置字段 `allowExistingSessionSwitch` 仍可读取但不生效，编辑它不能授予切换权限。新对话不需要这项确认即可选择模式。

### 网安首次进入确认

Web 配置开启 `requireSecurityEntryAcknowledgement: true`。新主对话首次进入 `securityEntryPreset` 前，`select` 会以 `security-entry/required` 拒绝选择，直到 Host 记录本次启动的确认。`beginSecurityEntry` 签发一次性挑战，绑定应用所有者、注册表生命周期、一个空白主对话以及保护提供方的修订号。`confirmSecurityEntry` 校验单调时钟计时已满十秒、消费挑战，并在保护修订号变化时以 `security-entry/changed` 拒绝。`cancelSecurityEntry` 丢弃挑战但不授予确认。只有应用所有者可开始、确认或取消。

确认仅保存在内存中，同一 Host 的所有窗口共享。Host 重启后重新询问；页面刷新只读取现有状态。已有对话继续使用独立的临时切换权限，不走这项确认。`assertNewConversationPreset` 对显式创建网安对话的调用方施加同一要求。

`securityEntryState()` 同时报告部署策略和实时保护状态。部署可提供 `securityProtection` 服务，其 `read(): SecurityProtectionStatus` 返回状态；状态或修订号变化后，提供方必须发出 `security-protection/changed`，使已打开的挑战失效并让客户端重新计时。没有提供方时状态为 `unavailable`，对话框按未启用处理，挑战要求输入本地化声明。声明文本由 Host 签发并逐字校验，客户端不另存一份。

注册表不写入任何声明。`read` Remote 把一条声明的子插件列表按 entry-list YAML 方言（含 `!!js` 条件）渲染回来，供客户端展示 preset 的组成；没有任何接口接受 YAML 写回。新建 preset 或覆盖内置 preset 都是 bundle 补丁：插入一行 `@deepseek-ai/dsh-agent-preset`，或按该行 id 写覆盖补丁，再用 `plugin_manager` 安装到 profile；创造模式在对话中编写这类 bundle。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

每个声明在启动时创建注册表拥有的 scope 和内存 Loader 树。更新或移除声明会让旧代际退役；Agent、子 Agent 和临时历史读取各自持有引用，最后一个引用释放后才销毁插件树。插件注册继承 preset scope，Agent scope 的父链接决定可见性；Agent loop 仍由宿主共享。

preset 的服务提供方及其消费方必须共享同一个 `cordis:group` 隔离 realm。条目局部隔离不会沿 Agent 注册 scope 传播：组外的普通 Context 查找（包括 `agent.ctx`）仍选择 Host realm。`agentPresets.serviceFor()` 显式检查保留的组合，不改变普通服务查找。

激活审计检查导入失败、缺失服务和向全局泄漏的服务。导入失败、激活失败和泄漏会拒绝挂载。等待 Host 服务的行保持挂载，每次读取和绑定都在 Host Loader 树结算后重新审计，因此启动顺序不决定结果。失败只禁用该定义的新绑定。会话日志保存 preset ID 和空白会话的切换记录；重启恢复使用该 ID 的当前定义，缺失时拒绝恢复。若空白会话已记录所请求的 preset 且正运行其当前版本，`select` 不做任何改动，也不追加切换记录或触发 `tools/change`。

`inspectCompositions()` 读取本注册表仍保留的全部代际；传入 Agent 上下文时只选择它绑定的精确代际，在此没有绑定时返回空列表。每个 `AgentPresetInspection` 包含 preset ID、纯数据形式的活动模块引用及解析基址，以及泄漏的服务名。检查器查询运行中的服务，而不是模块级挂载表；结果不包含 Loader 树或 fiber。这些记录定义在 [composition-inventory.ts](src/composition-inventory.ts) 中。

| 文件 | 职责 |
|---|---|
| [index.ts](src/index.ts) | 注册、代际、Agent 绑定与 Remote 策略 |
| [security-entry.ts](src/security-entry.ts) | 首次进入挑战、声明与单调计时 |
| [mount.ts](src/mount.ts) | 隔离插件树与激活审计 |

</details>

<a id="further-exploration"></a>
## 延伸阅读

- [Scope](../../core/scope/README.zh.md) — 注册隔离。
- [Agent](../../core/agent/README.zh.md) — 会话运行时。
- [Cordis](../../../vendor/cordis/README.md) — 插件配置与生命周期。

<a id="model-experience"></a>
## 模型体验

### Preset 选择

#### 模型看到的内容

没有直接内容：所选 preset 的 `plugins` 拥有模型可见的工具和提示词片段。

#### Token 影响

本包自身没有；每个挂载的 `plugins` 行声明自己的工具和片段。

#### KV Cache effect

已有 Agent 保留插件和提示词。新 Agent 从当前定义构建前缀。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- preset 不是安全沙箱：YAML 及插件可以执行 Host 代码。用户覆盖替换完整子插件列表，不自动合并内置列表的未来更新。进程退出后不保存旧代际的插件实现。
- Web 产品尚未组合 `securityProtection` 提供方，首次进入对话框因此显示保护不可用并要求输入声明；保护开启分支目前只由测试提供方覆盖，需等延后的目标保护执行工作恢复后才有生产实现。
- 确认只记录操作者在本次 Host 生命周期内的声明，不执行目标保护，也不构成对任何第三方目标的事实授权证明。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
