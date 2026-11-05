---
description: "网安模式出口代理接缝的服务定义：工具如何判断某个对话的目标流量是否经过独立代理。"
kind: "package-reference"
---

# @deepseek-ai/dsh-security-proxy

[English](README.md) | 中文

## 概述

网安对话可以让目标流量统一经过用户配置的上游代理。本包只拥有每个消费者都要问的问题：这次执行是否被覆盖、子进程需要什么环境、以及如何经代理取回一个目标。它不安装传输、不读取设置、也不保存流量；这三件事都由 [`@deepseek-ai/dsh-security-proxy-local`](../security-proxy-local/README.zh.md) 提供。

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

消费者以可选方式接入，因此没有提供者的组合保持原有行为：

```ts
const proxy = ctx.get('securityProxy')
const route = proxy?.route(exec.agent, 'web_fetch')
const result = route === undefined
  ? await ctx.web.fetch({ url }, exec.signal)
  : await proxy.fetchTarget(exec.agent, url, exec.signal)
```

`route` 接收正在执行的 `Agent`，不接受模式参数：提供者读取会话日志中记录的预设。没有 Agent 的调用，或记录预设不是 `security` 的会话，一律不覆盖。

提供者注册为 `ctx.securityProxy`。`browserEnvironment` 根据实际拥有侧栏的 Agent 解析本机端点；只有应用所有者可通过 Remote 请求。

原生执行保护使用仅限 Host 的 `openEgress`，传入实际 Agent、停止并等待回收的回调和完整执行期限。已开启网安模式代理时返回配置的上游及有界捕获入口；未覆盖的调用不取得资源。可单独指定启动取消信号，公布租约后解除该信号。调用方在整个进程范围及网关关闭后报告释放；无法确认清理时报告失败，保留依赖并拒绝后续原生委派。上游凭据和原始捕获输入只从 Host 入口导出，不属于客户端安全载荷模块或 Remote 方法。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

入口是一个抽象 `Service`，定义路由选择、子进程/浏览器环境、受控抓取、原生出口委派和管理界面。`route` 返回流量归属的会话身份与工具名；`environment` 返回只用于一次 spawn 的环境覆盖；`fetchTarget` 返回 web 接缝已定义的 `WebFetchResult`，因此被覆盖与未被覆盖的抓取交给模型的是同一种值。

`fetchTarget` 的失败使用接缝的开放 `WebError` 代码（`SECURITY_PROXY_NOT_COVERED`、`SECURITY_PROXY_UNREACHABLE`、`SECURITY_PROXY_AUTH`，以及 web 提供者自身的超时与取消码），因此工具结果能说明是代理还是目标出了问题。

本包同时声明 `security-proxy/warning` Host 事件、Remote 失败码 `security-proxy/owner-required`，以及本接缝读取的 `agent-preset/selected` 会话事件。该事件由预设包所有；预设包没有发布 session 子路径，因此在这里声明让编译器认识这套词汇。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [提供者](../security-proxy-local/README.zh.md) —— 配置的上游、回环链式代理、捕获存储与设置界面。
- [设置界面](../../client/ui-security-proxy/README.zh.md) —— 模式分组中的区域与流量查看器。
- [Web 接缝](../../web/web/README.zh.md) —— `ctx.web`，本接缝返回它的 `WebFetchResult`。

-----

<a id="model-experience"></a>
## 模型体验

无。本接缝不添加工具、schema 或提示词。被覆盖的 `web_fetch` 与未覆盖的返回同一种结果结构，只有传输与捕获不同。

#### KV 缓存影响

无影响：接缝不改变请求内容与工具目录。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **模式权威** —— 覆盖范围来自会话已提交的预设与选择事件；工具参数不能自称模式。
- **不做拦截** —— 被覆盖的 HTTPS 抓取在受控客户端层记录；纯隧道流量按设计保持不可见。
- **不与目标保护联动** —— 本构建没有挂载真正执行的目标保护提供者，因此接缝不暴露保护钩子。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

三个操作存在，是因为三类消费者需求不同：工具需要判定，子进程需要环境，网页抓取需要传输。放在同一接缝上，避免每个消费者各自从设置里重建覆盖判定。

</details>
