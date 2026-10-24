---
description: "网安模式出口代理提供者：一个配置的上游、按对话隔离的回环链式代理，以及默认脱敏且有界的流量捕获存储。"
kind: "package-reference"
---

# @deepseek-ai/dsh-security-proxy-local

[English](README.md) | 中文

## 概述

本提供者让网安代理真正生效。它拥有上游地址与凭据引用、真正穿过上游发起 CONNECT 的连接检查、为每个网安对话提供一个回环监听（子进程因此能到达代理而不必改动 Host 环境），以及一个有界的交换记录存储。只有 `security` 预设被覆盖；模型 API、登录、余额、更新检查和其他模式保持原有路径，因为本插件从不安装进程级 dispatcher。

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
| 捕获存储 | `capture.ts` | 记录条数、正文字节和保留时长三重上限的环形缓冲；请求头与 JSON/表单密钥字段在写入时一次性脱敏。 |
| 上游传输 | `upstream.ts` | 使用配置的 `http:`/`https:` 地址构造 `ProxyAgent`；CONNECT 是通过校验的 `node:http(s)` 请求，TLS 验证从不放宽。 |
| 每会话链式代理 | `chain.ts` | 仅监听回环：明文 HTTP 完整转发并捕获；CONNECT 只建立隧道并记录元信息。 |
| 引擎 | `engine.ts` | 拥有 dispatcher、监听、状态机、受控抓取，以及每对话一次的提醒。 |
| Remote 界面 | `service.ts` | `get`、`configure`、`setPassword`、`test`、`list`、`detail`、`clear`、`pause`；写操作要求应用所有者身份。 |

受控抓取只跟随同源重定向，复用 web 提供者的内容分类与字符集解码，限制正文字符数，并记录它真正发出和收到的交换。这解释了一个事实：同一个工具的 HTTPS 目标是完整可见的，而子进程的 HTTPS 隧道不是——没有任何地方拦截 TLS，明文只存在于应用自己写出请求的那一层。

状态为 `off`、`connecting`、`ready` 或 `failed`，失败时带机器原因（`invalid-config`、`unreachable`、`timeout`、`auth`、`tls`、`unknown`）。检查失败绝不显示可用，详情行不含凭据。关闭功能会关闭 dispatcher 与全部监听；修改地址、协议或凭据同样先关闭再重新验证。

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

- **覆盖范围** —— `web_fetch` 与一次性 shell 工具被路由。浏览器工具、MCP、常驻终端、委派子代理，以及忽略代理环境变量的程序不被覆盖；设置界面如实说明，而不暗示已覆盖。
- **不做拦截** —— 子进程承载的 HTTPS 正文保持加密。只有本应用自己写出的明文会被捕获。
- **回环信任** —— 每个会话监听绑定 `127.0.0.1` 与系统分配的端口，本地不做身份验证；监听打开期间，同机其他进程也能使用。它随对话、设置变更与 Host 退出关闭。
- **记录生命周期** —— 流量只存在内存中，重启即丢失。保留受条数、正文字节与时间三重限制。
- **目标保护** —— 本构建没有真正执行的目标保护提供者，因此代理既不调用它，也不声称它已生效。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

链式监听之所以存在，是因为子进程需要的是一个地址，而不是策略对象。每个对话一个监听也让归属判定变得诚实：一条流量的会话就是收到它的那个监听，而不是事后猜测。

</details>
