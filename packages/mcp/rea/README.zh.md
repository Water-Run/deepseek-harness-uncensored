---
description: "使用内置的 REA，在独立的逆向分析对话中使用其工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-rea

[English](README.md) | 中文

## 概述

根服务管理 REA 启动配置和外部进程，`./agent` 消费端仅由逆向预设装配。REA 默认开启，使用时才启动进程；已保存的关闭设置保持不变。配置不会下载软件或修改其他客户端的设置。

## 配置

打开设置 → 模式 → 逆向配置，内置 REA 无需填写路径。桌面版提供 Node 24.22.1；源码启动使用当前 Node 或 `DSH_REA_NODE_PATH`。自定义 Node 和 CLI 路径为可选覆盖项，保存后可检测连接。可选字段指定 Ghidra、Java、IDA MCP 配置和原生分析引擎。检测会启动临时 MCP 进程，报告版本与工具，检查已配置的路径，然后关闭进程。握手成功不代表可选引擎已通过分析验证；打开样本时才会检查引擎版本和依赖。

全部偏好由 Loader 设置系统管理。`startupTimeoutMs` 默认 60000，`toolTimeoutMs` 默认 180000，`catalogPageSize` 默认 20。保存配置变更会关闭现有进程；对话需要重置连接并重新打开样本。

已验证 REA 6.9.0、Node 24.22.1、Ghidra 12.1.4、Java 27 和内置 Frida 17.23.2 绑定。其他引擎版本仍须通过上游版本校验。REA 6.9.0 固定到 [d74549e495c5](https://github.com/morluto/rea/commit/d74549e495c58eb4a560279fd9f05508401ea0a0)，可选分析引擎按各自许可另行配置。

## 对话归属

`rea_tools` 搜索工具名称和说明，分页读取完整目录，并按精确名称启用工具。选中工具以 `mcp__rea__*` 注册到正常工具系统，保留上游参数定义、标准 MCP 结果与可持久化的图片处理。参数在发送给外部进程前验证。模型可通过现有 reverse-casebook 流程，将发现与样本身份和证据一起记录到案件中。

每个活跃 Agent 独立持有进程与已选工具。同一进程的调用串行执行，其他 Agent 使用独立进程。发现工具及每次外部调用都检查当前对话的完全权限。子对话不能调用父对话的已选工具，只读随问不能启动 REA。重置、Agent 释放、配置变更和插件卸载会关闭所属进程；取消会中断请求，失败后不会自动重放调用。

可选的 [`target-protection/rea`](../../guard/target-protection/README.zh.md) 提供方替换根服务，执行必需校验。原生引擎无法将效果约束到允许目标时拒绝启动，完全权限和 MCP 只读声明不能绕过。策略撤销取消运行中及排队调用，等待实际 stdio 进程关闭后才释放规则所有者。普通提供方仍不受目标规则约束，不能代替该受控组合。

## 模型体验

逆向对话初始只增加 `rea_tools`。发现结果说明可用工具，启用名称后只把选中的定义加入后续请求。工具结果和可用性变更沿用现有 Session 日志。已验证版本的全部 255 个工具均可发现，无需把完整目录加入每次请求。

#### KV 缓存影响

增加或重置已选工具会改变工具前缀；选项稳定时保持名称和参数定义不变。发现与引擎调用不会额外请求模型。

## 已知限制与后续工作

外部引擎在本机运行，需要完全权限。桥接不提供沙盒、远程执行环境或独立流量代理。桌面版内置 REA、兼容的 Node 和 npm 依赖（含 Frida 绑定）。Ghidra、Java、IDA 和 Hopper 仍为可选外部引擎。这里接入 REA 工具目录，尚未适配 MCP 资源、提示词模板或要求任务扩展的工具。Frida 已验收自建 Windows 本地目标，以及 Linux 附加和启动目标。Linux 附加目标显式允许测试父进程及其后代调试。任意已有进程的附加、远程设备和商业引擎仍未验证，操作系统调试权限仍然适用。

DSHU 在源码与桌面安装中统一应用固定的 [REA 6.9.0 生命周期补丁](../../../patches/rea-agents@6.9.0.patch)。关闭自己启动且仍暂停的目标时，先卸载脚本、恢复目标，再分离会话。Windows 本地、无脚本的暂停目标会先通过同一注册与清理流程加载无操作脚本；初始化失败仍明确报告。清理失败仍明确报告，不终止附加的已有进程。上游版本及许可与本地补丁分别标识。

## 验证

`tests/rea.spec.ts` 使用自有本地进程检查隔离、参数验证、取消、重置及实时权限变更。`tests/rea.e2e.ts` 使用兼容的 `DSH_REA_TEST_NODE`，默认验证内置 npm 包，`DSH_REA_TEST_CLI` 为可选覆盖项；可选原生分析还需指定 `DSH_REA_TEST_GHIDRA`、`DSH_REA_TEST_JAVA_HOME` 和自有样本 `DSH_REA_TEST_BINARY`。测试关闭进程，并只清理自身临时目录。Frida 夹具同时保留原始失败与后续清理失败。

`tests/frida.e2e.ts` 使用相同的 Node、CLI 变量，并要求 `DSH_REA_TEST_FRIDA_TARGET` 指向 `tests/fixtures/frida-target.c` 的编译副本。编译时关闭优化并保留函数导出（Windows 使用 `cl /Od`，Linux 使用 `cc -O0 -rdynamic`）。测试将二进制复制到私有目录，只对自身创建的进程插桩，检查返回值变化、脚本卸载、连接重置、释放、暂停启动及目标退出。Linux 附加使用夹具显式提供的 `--allow-parent-debugger`：[Yama 的 `PR_SET_PTRACER`](https://docs.kernel.org/admin-guide/LSM/Yama.html)只允许测试父进程及其后代调试，不修改系统 `ptrace_scope`。运行 `pnpm exec vitest run --config vitest.e2e.config.ts packages/mcp/rea/tests/frida.e2e.ts --retry 0`，不调用模型。

## 参考

[REA](https://github.com/morluto/rea) 由 morluto 维护，采用 MIT 许可。本包分发固定版本的 npm MCP 服务并保留其许可。桌面版把服务及完整依赖树释放到 ASAR 外供独立 Node 使用，不替换 REA 分析实现。结果校验和呈现参见共享 [MCP 适配器](../mcp-client/README.zh.md)。
