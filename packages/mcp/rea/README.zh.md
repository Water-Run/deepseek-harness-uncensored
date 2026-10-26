---
description: "配置已安装的 REA，在独立的逆向分析对话中使用其工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-rea

[English](README.md) | 中文

## 概述

根服务管理 REA 启动配置和外部进程，`./agent` 消费端仅由逆向预设装配。REA 默认关闭；配置不会下载软件或修改其他客户端的设置。

## 配置

打开设置 → 模式 → 逆向配置，填写实际的 Node 可执行文件和 `rea-agents/scripts/rea.mjs` 路径，启用 REA、保存并检测连接。可选字段指定 Ghidra、Java、IDA MCP 配置和原生分析引擎。检测会启动临时 MCP 进程，报告版本与工具，检查已配置的路径，然后关闭进程。握手成功不代表可选引擎已通过分析验证；打开样本时才会检查引擎版本和依赖。

全部偏好由 Loader 设置系统管理。`startupTimeoutMs` 默认 60000，`toolTimeoutMs` 默认 180000，`catalogPageSize` 默认 20。保存配置变更会关闭现有进程；对话需要重置连接并重新打开样本。

已验证 REA 6.8.0、Node 24.22.1、Ghidra 12.1.4 和 Java 27。该 REA 版本会拒绝 Ghidra 12.2，其支持版本检查保持启用。REA 与可选引擎需分别安装，并遵守各自许可。

## 对话归属

`rea_tools` 搜索工具名称和说明，分页读取完整目录，并按精确名称启用工具。选中工具以 `mcp__rea__*` 注册到正常工具系统，保留上游参数定义、标准 MCP 结果与可持久化的图片处理。参数在发送给外部进程前验证。模型可通过现有 reverse-casebook 流程，将发现与样本身份和证据一起记录到案件中。

每个活跃 Agent 独立持有进程与已选工具。同一进程的调用串行执行，其他 Agent 使用独立进程。发现工具及每次外部调用都检查当前对话的完全权限。子对话不能调用父对话的已选工具，只读随问不能启动 REA。重置、Agent 释放、配置变更和插件卸载会关闭所属进程；取消会中断请求，失败后不会自动重放调用。

## 模型体验

逆向对话初始只增加 `rea_tools`。发现结果说明可用工具，启用名称后只把选中的定义加入后续请求。工具结果和可用性变更沿用现有 Session 日志。已验证版本的全部 229 个工具均可发现，无需把完整目录加入每次请求。

#### KV 缓存影响

增加或重置已选工具会改变工具前缀；选项稳定时保持名称和参数定义不变。发现与引擎调用不会额外请求模型。

## 已知限制与后续工作

外部引擎在本机运行，需要完全权限。桥接不提供沙盒、远程执行环境或独立流量代理。应用不打包 REA、供 REA 使用的 Node、Ghidra、IDA、Hopper 或 Frida。这里接入 REA 工具目录，尚未适配 MCP 资源、提示词模板或要求任务扩展的工具。本次验收未运行 Frida 和商业引擎。

## 验证

`tests/rea.spec.ts` 使用自有本地进程检查隔离、参数验证、取消、重置及实时权限变更。`tests/rea.e2e.ts` 使用显式的 `DSH_REA_TEST_NODE` 与 `DSH_REA_TEST_CLI` 路径；可选原生分析还需指定 `DSH_REA_TEST_GHIDRA`、`DSH_REA_TEST_JAVA_HOME` 和自有样本 `DSH_REA_TEST_BINARY`。测试关闭进程，并只清理自身临时目录。

## 参考

[REA](https://github.com/morluto/rea) 由 morluto 维护，采用 MIT 许可。本包复用其已安装的 MCP 服务，不复制或替换 REA 分析实现。结果校验和呈现参见共享 [MCP 适配器](../mcp-client/README.zh.md)。
