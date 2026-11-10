---
description: "网安模式出口代理提供者：一个配置的上游、按对话和工具隔离的回环链式代理，以及默认脱敏且有界的流量捕获存储。"
kind: "package-reference"
---

# @deepseek-ai/dsh-security-proxy-local

[English](README.md) | 中文

## 概述

本提供者让网安代理真正生效。它拥有上游地址与凭据引用、真正穿过上游发起 CONNECT 的连接检查、按网安对话和工具分别提供回环监听（子进程因此能到达代理而不必改动 Host 环境），以及一个有界的交换记录存储。只有 `security` 预设被覆盖；模型 API、登录、余额、更新检查和其他模式保持原有路径，因为本插件从不安装进程级 dispatcher。

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

基础组合已内置挂载，部署只声明设置文件位置：

```yaml
- id: security-proxy
  name: '@deepseek-ai/dsh-security-proxy-local'
  config:
    path: !!js dshHomePath('storages', 'security-proxy.json')
```

功能默认关闭。设置、状态、连接检查、流量列表与详情、暂停和清理都属于 Remote 命名空间 `securityProxy`，由[设置界面](../../client/ui-security-proxy/README.zh.md)驱动。

上游密码通过 `ctx.credentials` 保存在 `DSH_SECURITY_PROXY_PASSWORD` 下，并在每次操作时解析。它不会写入设置文件、流量记录或错误文案。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

| 部分 | 归属 | 边界 |
|---|---|---|
| 设置文档 | `settings.ts` | 先写临时文件再原子重命名，加载与每次修改都校验；文档损坏时保留默认值并说明原因。 |
| 捕获存储 | `capture.ts` | 限制记录条数、正文字节和保留时长的环形缓冲。写入时遮盖已识别的头部、URL 字段及 JSON/表单密钥。 |
| 上游传输 | `upstream.ts` | 使用配置的 `http:`/`https:` 地址构造 `ProxyAgent`；CONNECT 是通过校验的 `node:http(s)` 请求，TLS 验证从不放宽。与 CONNECT 响应头一起收到的首批数据保留给隧道消费者。 |
| 每会话链式代理 | `chain.ts` | 仅监听回环：明文 HTTP 完整转发并捕获；CONNECT 只建立隧道并记录元信息。 |
| 引擎 | `engine.ts` | 拥有 dispatcher、监听、状态机、受控抓取，以及每对话一次的提醒。 |
| Remote 界面 | `service.ts` | `get` 返回状态。应用所有者可以配置代理、保存密码、测试连接、读取捕获、清空及暂停捕获。 |

受控抓取只跟随同源重定向，复用 web 提供者的内容分类与字符集解码，限制正文字符数，并记录它真正发出和收到的交换。这解释了一个事实：同一个工具的 HTTPS 目标是完整可见的，而子进程的 HTTPS 隧道不是——没有任何地方拦截 TLS，明文只存在于应用自己写出请求的那一层。

状态为 `off`、`connecting`、`ready` 或 `failed`，失败时带机器原因（`invalid-config`、`unreachable`、`timeout`、`auth`、`tls`、`unknown`）。检查失败绝不显示可用，详情行不含凭据。关闭功能会关闭 dispatcher 与全部监听；修改地址、协议或凭据同样先关闭再重新验证。

设置、密码和捕获偏好的写入按顺序执行。变更上游时先取消已准入操作，再替换传输。关闭会等待请求、响应清理和正在退出的会话监听器，包括已从可见会话表移除的监听器。HTTP 转发遵循下游背压，客户端断开时取消上游请求。CONNECT 的期限只覆盖握手，普通已建立隧道持续到端点关闭或所有者取消。

原生出口租约共享此上游和捕获存储，不额外创建会话监听器。捕获入口绑定对话/工具归属，沿用暂停、脱敏及留存限制。重配置、对话撤销和提供方关闭会取消租约，等待受委派方完整回收后再释放依赖。清理失败会显示并阻止新的原生委派，直到 Host 重启。凭据查询期间取消会在委派前拒绝，不调用尚未公布工作的停止回调。

`mountSecurityProxy` 接收明确的引擎工厂。引擎的 HTTP、不透明隧道及连接探测方法提供执行校验入口。隧道字节数包含与 CONNECT 请求同时到达的负载。需要执行目标规则时，使用[受控提供方](../target-protection/README.zh.md)。

受保护的 `executionScope` 扩展点在公布监听器前绑定路由的 Session，受控抓取和转发回调在该作用域中运行。连接检查明确不分配会话。默认实现保持请求原样，受控提供方为审计库校验所有者。退出网安模式会撤下该会话的监听器。正在退出或已被替换的监听器会立即拒绝新转发，尚未就绪的监听器在撤下后不能公布地址。

`ChainOptions.executionScope` 包含每次完整的 HTTP 交换或 CONNECT 隧道，包括响应正文和检查后的请求。回调接收所有者的取消信号，并与监听器已有信号合并。省略此选项时沿用原传输行为。在响应头之后取消，也会先关闭下游与上游，再结束该作用域。

导出的 `SessionChainProxy` 拥有回环监听、转发、捕获和套接字回收。`ChainOptions` 的传输回调自行选择并校验路由；监听器不创建 dispatcher，也不假定存在上游。网安引擎提供独立上游，原生目标保护可提供逐次执行的固定地址路由；两者均将资源保留到转发与关闭完成。

没有会话的通用调用方使用 `sessionId: null`。未提供捕获存储时不留存流量；网安引擎仍提供有界存储和暂停回调。

所有者可提供 `inspectTunnel`，在确认 CONNECT 前授权，再使用检查传输处理连接。解密后的请求复用 HTTP 转发和捕获存储；检查器必须等待请求与套接字关闭后才返回。确认后的失败关闭传输，不向 TLS 中写入明文 HTTP。普通网安引擎未启用此检查。

提醒在“代理关闭且用户开启提醒”时，对每个对话最多触发一次；对话销毁时清除该记录。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [服务定义](../security-proxy/README.zh.md) —— 所有消费者依赖的接缝。
- [设置界面](../../client/ui-security-proxy/README.zh.md) —— 模式分组中的区域、连接检查与流量查看器。
- [出站代理库](../../util/http-proxy/README.zh.md) —— 本插件刻意不使用的启动环境策略。

-----

<a id="model-experience"></a>
## 模型体验

本包本身不改变模型体验；唯一例外需要说明：在网安对话中，`web_fetch` 经此代理取回目标，代理失败会以带类型的 `WebError` 代码进入工具结果。工具的 schema、描述与渲染不变。

#### KV 缓存影响

无影响：路由不改变请求内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **覆盖范围** —— 接入 `web_fetch`、遵守代理变量的命令和终端、桌面侧栏，以及新启动的 Playwright MCP、Chrome DevTools MCP 和 Stagehand。所有者的侧栏端点由 Host 解析实际 Agent，路由或模式变化后受影响的标签会重连。普通 MCP 工具与资源请求通过 Streamable HTTP 或 stdio 代理变量接入会话代理。新启动的 ACP、Codex、Claude Code 和 DSH SDK 委派接收父会话代理变量。启动发现、Web 内嵌页和外部浏览器附加连接走各自的路由。修改路由后须重建实验浏览器会话。Stagehand 扩展请求随浏览器代理，应用模型路由独立。
- **不做拦截** —— 子进程承载的 HTTPS 正文保持加密。只有本应用自己写出的明文会被捕获。
- **回环信任** —— 每个会话监听绑定 `127.0.0.1` 与系统分配的端口，本地不做身份验证；监听打开期间，同机其他进程也能使用。它随对话、设置变更与 Host 退出关闭。
- **记录生命周期** —— 流量只存在内存中，重启即丢失。保留受条数、正文字节与时间三重限制。
- **目标保护** —— 本普通提供者不执行目标规则；可选的 `dsh-target-protection/security-proxy` 实现需单独挂载，并遵循其已说明的限制。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

链式监听之所以存在，是因为子进程需要的是一个地址，而不是策略对象。每个监听保持固定的对话与工具身份，后开的命令不会改变已有终端流量的归属。

</details>
