---
description: "ctx.web 的匿名公共 HTTP(S) 抓取后端：部署方如何挂载有界、安全的 URL 抓取，含同源重定向与仅文本解码。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-fetch-http

[English](README.md) | 中文

## 概述

抓取公开 HTTP(S) 页面，返回有界、已解码的内容，目标请求不带身份凭据。直连会校验并固定公开地址；配置的代理通常在远端解析目标。需要执行目标规则的部署可启用字面 IP 代理隧道。重定向限定同源，抓取受时间、字节和字符上限约束。非 2xx 响应仍作为结果；无效目标与不支持的内容会失败。`dsh-tool-web` 中的 `web_fetch` 工具负责呈现这些结果。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已加载 web 服务的组合中挂载本提供方；它以 `http` 抓取提供方身份注册，因此当它是唯一可用的抓取后端时，`ctx.web.fetch()` 会自动解析到它——也可以用 `fetchProvider: http` 固定。

### 何时选择

需要有界公开页面、匿名目标请求和同源重定向时选择本后端。直连会固定公开地址；普通代理模式由代理解析 DNS，需要验证代理目标的部署采用下文的字面 CONNECT 模式。

### 最小配置

加载 web 服务与本提供方；可配置上限都有安全默认值，并在插件构造时验证，因此无效值会直接报错，而不是构造出上限荒谬的提供方。URL 安全上限固定为 2,048 个字符。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-fetch-http'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxResponseBytes` | `5,000,000` | 响应主体最大字节数 |
| `maxBodyChars` | `100,000` | 解码主体最大字符数 |
| `timeoutMs` | `30,000` | 抓取超时——资源兜底，不是面向模型的工具预算 |
| `maxRedirects` | `5` | 同源重定向最大跳数（`0` 表示不跟随） |
| `userAgent` | `deepseek-harness/…` | 每次请求发送的 `User-Agent` 标头 |

[配置声明](src/index.ts)列出全部支持字段及其 JSDoc。

### 抓取返回什么

成功调用产生 `WebFetchResult`：允许的重定向之后的最终 URL、HTTP 状态码、分类为 `html` 或 `text` 的解码正文，以及 `truncated` 标志。非 2xx 响应是结果而非错误——状态码是被抓取资源状态的一部分；`WebError` 只用于无法安全获取或表示资源的失败。

```text
const page = await ctx.web.fetch({ url: 'https://example.com' })
// page.body.kind === 'html' | 'text'; page.statusCode === 200 | 404 | ...
```

### 传输行为

提供方保持请求匿名且有界：只接受不含内嵌凭据且不超过 2,048 个字符的 `http:` 与 `https:` URL。它只解析一次主机名；只要结果中有任何 IPv4 或 IPv6 地址不是公共单播地址，就拒绝整个结果，并把连接固定到已校验的地址集合。IPv6 检查会发现活动 DNS64 前缀，并拒绝指向非公开 IPv4 的转换地址。每次同源重定向都会重复解析与固定；跨源重定向会失败并要求重新调用。提供方还强制执行字节、字符、跳数和时间上限，拒绝不支持的内容类型，并发送显式产品 `User-Agent`。

### 失败与恢复

失败会抛出 `WebError`，其中包含可供程序路由的错误码：`WEB_INVALID_URL`、`WEB_BLOCKED_URL`、`WEB_FETCH_TOO_LARGE`、`WEB_FETCH_TIMEOUT`、`WEB_REDIRECT_BLOCKED`、`WEB_UNSUPPORTED_CONTENT_TYPE`、`WEB_ABORTED` 或 `WEB_PROVIDER_ERROR`。直接调用方可以按错误码路由；面向模型的 `web_fetch` 工具会在自己的错误包装层内把失败文本呈现给模型。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释提供方背后的设计决策；可观察行为已在[使用本包](#use-this-package)中完整说明。

### 设计理念

本包基于一项职责分离和一套分层超时机制：

- **安全获取与呈现分离。** 本提供方拥有 URL 校验、公开地址强制规则、连接固定、HTTP 传输、重定向策略、上限、charset 解码与二进制拒绝；`dsh-tool-web` 拥有 HTML→markdown 与截断格式化。非 2xx 响应是数据，不是失败。
- **两层超时。** 提供方的 `timeoutMs` 是直接 `ctx.web.fetch()` 调用方的资源兜底；面向模型的工具调用预算属于 `dsh-tool-call-timeout-policy`，由它触发 `exec.signal`。外层截止期限先到时，提供方报告 `WEB_ABORTED`，策略再以 `TOOL_TIMEOUT` 替换；因此 `WEB_FETCH_TIMEOUT` 标识的是提供方预算耗尽的直接服务调用方。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、上限验证、提供方注册 |
| [`src/provider.ts`](src/provider.ts) | `HttpFetchProvider`：固定连接、重定向跟随、有界读取、charset 解码 |
| [`src/network.ts`](src/network.ts) | 公开地址解析、DNS64 发现与连接固定 |
| [`src/policy.ts`](src/policy.ts) | URL 校验、同源检查、内容类型分类、charset 解析 |

### 读取路径

抓取先校验 URL，只解析一次主机名，结果中只要有非公开地址就拒绝，并把连接固定到已接受地址。每次同源重定向都重复该检查；跨源重定向或非公开目标在接收响应字节前失败。最终响应按 `Content-Type` 分类、依声明的 charset 解码，并在字节上限内读取；解码后的文本再截断到字符上限。

已装配的提供方在每跳解析前和连接前派发 `web-fetch/authorize`。监听器可返回拒绝，产生 `WEB_TARGET_PROTECTED`，不能覆盖其他监听器的拒绝。第二次检查同时报告原始目标身份与实际固定的地址集合；由代理解析时，地址明确为 `null`。查询参数和凭据不进入这些身份信息。异步检查后若已取消，不会建立连接。该执行检查接口本身不负责分类保护目标，部署需要提供规则策略；直接创建 `HttpFetchProvider` 的调用方可在第三个构造参数传入同等校验函数。

第四个构造参数 `literal-connect` 在本地解析并校验代理目标。独立的 Undici 代理调度器向首个已校验 IP 发起 CONNECT，保留原始 Host、TLS 名称及证书校验，不以直连重试。每次重定向均重新校验。DNS 查询由配置的解析器处理；HTTP 代理收到字面目标地址，不解析其名称。此模式要求代理支持 IP CONNECT；普通插件配置仍使用远端代理 DNS。

`resolveHttpFetchLimits(config)` 向其他消费者提供相同的默认值与校验，包括必须依赖目标保护的包装提供方。包装提供方不会绕过共享传输限制。

`resolvePublicAddresses` 供提供已核实 DNS 证据的消费者复用；可选的 `translatedIpv4` 元数据保留已发现的 NAT64 目标以供策略检查，实际连接仍固定到原 IPv6 地址。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。它们从共享词汇逐步进入服务、面向模型的工具与设计依据。

- [Web 类型](../web/src/types.ts)——抓取请求／结果字段与错误码。
- [web 包映射](../README.zh.md)——六包家族与各角色。
- [dsh-web](../web/README.zh.md)——本提供方注册进入的 web 服务。
- [dsh-tool-web](../tool-web/README.zh.md)——渲染本提供方正文的面向模型 `web_fetch` 工具。
- [配置源码](src/index.ts)——支持字段、默认值与校验。
- [web 能力 seam 决策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜索与抓取为何共用一项提供方选择服务。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过 `dsh-tool-web`：该工具把本提供方经 `maxBodyChars` 限制的解码文本或由 HTML 转换得到的 markdown 置于抓取结果包装层内，而重定向、标头与传输上限保持隐藏。

#### KV Cache 影响

不会直接导致 KV Cache 失效；请求前缀变更由上述消费方负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明提供方何时不安全或不合适。它们是当前包约束。

- **只解码文本内容**——包括 html/xhtml 与 `text/*` 加 JSON/XML 家族；缺少 `Content-Type` 或任何二进制类型都会抛出 `WEB_UNSUPPORTED_CONTENT_TYPE`，可提取文本的 PDF 解码属于明确的延期工作。
- **charset 只来自 `Content-Type` 标头**（默认 UTF-8）——HTML `<meta charset>` 声明会被忽略；声明但无法识别的 charset 标签会抛出异常，而非回退。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
