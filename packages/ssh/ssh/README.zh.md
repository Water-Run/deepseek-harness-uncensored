---
description: "面向组合 POSIX 文件、进程与沙箱提供方的部署者，说明 OpenSSH 连接配置及远端辅助进程生命周期。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ssh

[English](README.md) | 中文

## 概述

POSIX 客户端可使用 OpenSSH 提供方；Windows、Linux 和 macOS 客户端可使用 `./direct`。二者都连接已安装的 POSIX helper，供文件系统、子进程和沙箱提供方共享。OpenSSH 使用部署方持有的别名；直连提供方要求明确的端点、已核实的主机指纹和凭据引用。连接丢失或租期到期后，由 helper 负责远端清理。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在自定义 `dsh` 配置组合中，将本服务与 [`fs-ssh`](../fs-ssh/README.zh.md)、[`subprocess-ssh`](../subprocess-ssh/README.zh.md) 和 [`sandbox-ssh`](../sandbox-ssh/README.zh.md) 组合。主机运行 Harness、模型传输和 Session 存储；远端机器提供文件与进程。headless 配置组合支持这种安排。

### 部署前提

默认 OpenSSH 提供方要求两端均运行 Linux 或 macOS。本地 `ssh` 命令必须支持连接复用与 Unix 套接字转发，服务器也必须允许该转发。启动前配置主机别名、凭据与已知主机记录：本服务启用 `BatchMode`、要求严格检查主机密钥、禁用认证代理转发，且不提供交互认证流程。

安装 [SSH helper 可执行文件发行包](../ssh-helper-runtime/README.zh.md)，或已构建的 helper 脚本及其匹配的 Node 依赖。运行时必须位于工作区和可写临时目录之外，也必须位于后端会替换的临时目录树之外，例如 bwrap 的私有 `/tmp`；工作区仍可位于 `/tmp` 下。摘要校验在辅助程序启动后发现非预期的已安装产物；它不能保证可写部署文件的执行安全，也不能认证恶意 SSH 主机。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `host` | 必填 | 已有的 OpenSSH 主机别名 |
| `launch` | 必填 | `{ kind: "executable" }`，或 `{ kind: "node-script", node: "/absolute/node" }` |
| `helper`、`workspace` | 必填 | 远端 helper 入口和默认工作区的绝对路径 |
| `helperHash` | 必填 | 已安装辅助程序入口的小写 SHA-256 |
| `launch.bootstrapPath`、`launch.bootstrapHash` | 省略 | 成对提供的远端 PTC 脚本及摘要；仅用于 `node-script` |
| `requestTimeoutMs` | `30000` | 连接与管理请求的截止时限，范围为 1 至 2,147,483,647 毫秒 |
| `maxFrameBytes` | `67108864` | 每条 JSON 消息的负载上限，最大为 64 MiB |
| `maxPending` | `128` | 普通未完成请求的数量上限；心跳与有界清理请求使用预留容量 |
| `leaseMs` | `30000` | 辅助进程心跳租期，范围为 3000 至 600000 毫秒 |

将验证后的 `ctx.ssh.ptcLaunch` 作为 [`NodePtcRuntime`](../../ptc-runtime/ptc-runtime-node/README.zh.md) 的 `launch` 配置。可执行文件部署包含 worker；脚本部署使用 PTC 时需要两个引导字段，仅使用文件系统和 Bash 时可以省略。脚本引导未配置时，getter 会拒绝访问。客户端在就绪前拒绝不匹配的协议版本、运行形式和 helper 摘要。

<a id="direct-connection"></a>
### 显式直连

使用 `@deepseek-ai/dsh-ssh/direct` 替换包根提供方，并挂载 `credentials`。它使用 [ssh2](https://github.com/mscdex/ssh2)，不启动本地 OpenSSH，也不读取别名、`ProxyCommand`、认证代理或代理环境变量。连接固定到一个已解析的字面 IP，不自动改换路由。服务器仍需 POSIX helper；进程通道需要 Unix 流转发，shell 需提供 `sha256sum` 或 `shasum` 以在执行前校验 helper。已安装运行时及 shell 启动配置必须可信，并位于 Agent 可写工作区之外。

直连提供方保留上方 helper 与限制字段，使用以下字段替换 `host`。主机指纹须独立核实；不会自动信任首次遇到的密钥。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `hostname`、`username` | 必填 | 明确的 DNS/IP 目标和 SSH 账号 |
| `port` | `22` | 目标服务端口 |
| `hostKeySha256` | 必填 | 已核实的 SSH 主机密钥指纹，接受十六进制 SHA-256 或 `SHA256:` base64 |
| `privateKeyRef` | 省略 | 保存私钥的凭据引用 |
| `passphraseRef` | 省略 | 私钥口令的凭据引用；需同时提供 `privateKeyRef` |
| `passwordRef` | 省略 | 保存账号密码的凭据引用 |

至少提供一种认证引用。每次建连解析凭据；已建立连接不会悄悄重新认证或重连。直连传输不经过网安模式的 HTTP 代理。需要目标准入时，应改为挂载 [`target-protection/ssh`](../../guard/target-protection/README.zh.md)；仅加载规则服务不会保护普通 SSH 提供方。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

OpenSSH 主连接承载私有管理 RPC。每条程序流使用独立转发的 Unix 套接字和独立 SSH 通道。程序 stdout 无法伪造管理回复，也不会占用控制流的通道窗口；SSH 传输拥塞仍会影响共享连接。

每个流预留项都有一个随机 256 位 TLS 预共享密钥，仅由管理 RPC 传递。TLS 认证两端并保护流中的每个字节；密钥绝不作为流前缀发送。套接字目录为私有目录（`0700`），套接字使用 `0600` 权限。替换可写套接字路径无法冒充端点或获知流密钥；攻击者仍可中断服务或转发不透明的 TLS 记录。

连接释放会先等待转发与取消子进程，以及尚在建立的流结束，再删除本地资源。传输丢失会拒绝待处理操作并使连接失效。辅助进程在 SSH EOF、终止信号或心跳到期时启动托管清理。断连客户端无法确认远端结果；操作不会自动重连或重放。

启动或进程结果失败后，预留项在原生进程范围清空后释放；有界完成缓存保留原始拒绝结果，供后续读取。辅助程序关闭也会等待已在进行的端点与目录清理。

终端启用 shell 活动观察时，根进程退出会保留 reservation 及其剩余工作。活动 RPC 继续访问 provider；明确终止时先等待进程范围完全停稳，再释放端点并记录完成结果。helper 连接卸载和租约到期仍保留原有的终止权限。

连接会禁用 helper 的 SIGUSR1 调试器激活：脚本调用使用 `--disable-sigusr1`，可执行文件调用通过 `NODE_OPTIONS` 提供该标志。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [SSH 提供方](../README.zh.md) — 传输、文件系统和进程提供方。
- [POSIX SSH 决策](../../../.agents/notes/implemented/architecture/2026-09-11-posix-ssh-runtime.zh.md) — 理由、替代方案及必要验证。

-----

<a id="model-experience"></a>
## 模型体验

无，因为主机别名、认证与流能力令牌属于私有部署细节，每项面向模型的操作均由消费方负责。

#### KV Cache 影响

本提供方不贡献请求前缀内容。面向模型的工具与结果由消费方负责。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- helper 仍要求 POSIX。默认 OpenSSH 客户端仍仅支持 POSIX；`./direct` 支持 Windows 客户端。不提供自动配置远端环境、重连或重放。
- Web 工作区界面的路径仍假定可访问主机文件系统；请使用 headless 或所有消费方都遵守提供方路径语义的自定义组合。
- TLS 流密钥不防御远端操作系统级进程内存检查或调试。文件效果策略保留所选沙箱后端的限制。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
