---
description: "内置的网安、逆向与写作作战手册，为专门化会话模式提供可加载的现场手册、参考表和辅助脚本，而不是只有人设文字。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-playbooks

[English](README.md) | 中文

## 概要

这个包内置三套原创作战手册，并把所选的一套注册到 `ctx.skills`。预设只挂载一种模式对应的手册，因此网安、逆向、写作三个模式各自带有一批现场手册、参考表和零依赖 Node 脚本。目录摘要始终可见，手册正文只在模型选择时才加载。仓库不内嵌第三方代码：工具只以文字形式点名，随包脚本均为本项目原创。

## 目录

- [使用这个包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用这个包

与技能注册表和 `dsh-tool-skill` 一同挂载。`@deepseek-ai/dsh-web-app` 的三个专门化模式预设已经这样配置。

```yaml
- name: '@deepseek-ai/dsh-skill-playbooks'
  config:
    packs:
      - security
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `packs` | 空 | 要提供的作战手册。空列表不注册提供者，适合只保留本地技能发现的组合。 |
| `assetRoot` | 包内 `assets/` | 包含三个手册目录的绝对路径。 |

| 手册 | 技能 | 辅助脚本 |
|---|---|---|
| `security` | 交战流程、侦察、Web 攻击、网络利用、载荷实验、云与容器、报告 | `shared/scripts/casefile.mjs` |
| `reverse` | 初筛、静态、动态、协议、补丁与注册机、移动端、恶意样本、案件簿 | `shared/scripts/casefile.mjs`、`shared/scripts/sample.mjs` |
| `writing` | 写作基本功、声音、场景、黑暗素材、连续性、文风参考、长篇结构 | 无；写作模式通过文件工具落盘 |

两个脚本只使用 Node 内置模块。案件账本按 `.security/<slug>` 或 `.reverse/<slug>` 保存 `case.json`，记录目标、证据与发现，并可渲染 Markdown 报告；样本清点脚本一次流式读取文件，输出哈希、格式、熵与可打印字符串。技能加载时会打印资源目录，手册因此可以用 `../../shared/scripts/...` 直接调用脚本。

<a id="understand-the-implementation"></a>
## 实现说明

<details>
<summary>实现细节——点击展开</summary>

注册时同步读取每个手册目录，解析 YAML frontmatter；缺少手册、缺少描述或重名都会立即失败。正文按需读取，文件被删除时返回 `undefined` 而不是旧内容。候选使用 `bundled` 来源和标准内置优先级，注销时由技能注册表统一移除。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 手册发现、frontmatter 解析、候选目录、按需加载。 |
| [`assets/`](assets/) | 三套手册与共享脚本。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [技能注册表](../skill/README.zh.md) —— 提供者优先级与目录合并。
- [技能工具](../tool-skill/README.zh.md) —— 模型可见目录与 `skill` 加载器。
- [Web 应用包](../../bundle/web-app/README.zh.md) —— 挂载各手册的预设行。

-----

<a id="model-experience"></a>
## 模型体验

通过 `dsh-tool-skill` 间接体现：初始目录列出所选手册的摘要，`skill(name)` 返回正文及资源目录。手册再自行引导到参考文件与脚本。

#### KV 缓存影响

技能结果追加到历史，不改变工具声明。目录摘要很小，正文只在被选择时加载，加载后保留到会话结束。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 手册是指令与本地脚本，不是分析引擎；具体工具、许可证和网络访问由宿主提供。
- 网安与逆向手册假定存在内置命令执行工具；没有执行能力的组合只能阅读，无法运行账本或清点脚本。
- 写作模式刻意不挂载终端，因此连续性流程依赖文件工具而不是脚本。
- 参考表中的工具与许可证信息有日期，再分发内嵌第三方工具的产物前需要重新核实。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

手册参考的开源项目（REA、ida-pro-mcp、GhidraMCP、PayloadsAllTheThings 以及正文点名的工具）与许可证记录在 `.agents/notes/`。这些项目没有任何内容被复制进资源目录，脚本为原创。
</details>
