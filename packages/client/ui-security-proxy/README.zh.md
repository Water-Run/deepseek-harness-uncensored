---
description: "设置 → 模式中的网安代理区域：开关、地址、凭据、真实连接检查、覆盖范围与已捕获流量查看器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-security-proxy

[English](README.md) | 中文

## 概述

本插件在模式卡片下方渲染网安模式自己的网络设置：启用开关、协议、地址、端口、由凭据系统保存的密码、以真实代理状态为准的连接检查、如实的覆盖范围列表，以及有界的已捕获交换查看器。提醒开启时，网安对话顶部持续显示独立代理未开启的横幅。横幅开关可关闭提醒，不改变代理状态。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Web 应用以浏览器行加载，无需另行安装。该区域注册进 `settings.mode.materials`，也就是预设卡片下方的模式资料座；只有当前选中模式是 `security` 时才绘制。它使用的 Remote 命名空间是 [`@deepseek-ai/dsh-security-proxy-local`](../../guard/security-proxy-local/README.zh.md) 的 `securityProxy`。

-----

<a id="understand-the-implementation"></a>
命令覆盖项包含一次性命令和持久 shell 终端，需由应用遵守代理环境变量；已捕获的 HTTP 与保持加密的 HTTPS 隧道分别标注。

## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

`controller.ts` 拥有该区域的读取与写入：单一串行写槽、代际计数（慢读不会覆盖已提交的写），以及把筛选条件转换成 Remote 查询。`SecurityProxySection.tsx` 通过注入的 `hooks` 组件从该存储渲染；组件本地状态只保存未保存的草稿与密码输入。

查看器展示已捕获的请求/响应头（在 Host 侧已脱敏）、有界正文、仅 CONNECT 行的隧道说明，以及明确的截断标记。隧道行绝不伪装携带正文。设置反馈使用共享 toast 原语。提醒使用 `conversation.mode.notice`，读取当前对话模式并共享设置控制器；开启代理或关闭提醒后隐藏。

全部文案都在带类型的语言字典（`en`/`zh`）中，组件内没有硬编码界面文字。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [提供者](../../guard/security-proxy-local/README.zh.md) —— 本界面驱动的设置、状态与捕获。
- [服务定义](../../guard/security-proxy/README.zh.md) —— 路由判定背后的接缝。
- [插槽包](../ui-slots/README.zh.md) —— 模式资料座的组合方式。

-----

<a id="model-experience"></a>
## 模型体验

无。本界面只读写配置，不发送任何模型可见内容。

#### KV 缓存影响

无影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **不提供导出** —— 查看器支持筛选、详情、暂停与清理；不实现流量导出，因此不存在绕过脱敏的导出路径。
- **记录仅在内存** —— 重启会随 Host 的捕获存储一并清空列表。
- **依赖模式资料座** —— 该区域注册进模式设置页渲染的 `settings.mode.materials`，只有选中模式为 `security` 时才绘制。
- **提醒展示** —— 持续横幅需要已连接的图形界面；不改变命令行执行或代理路由。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

该区域刻意不做轮询：设置页在打开时读取、按需刷新，每次写入返回已提交状态，因此界面不会显示 Host 未确认的值。

</details>
