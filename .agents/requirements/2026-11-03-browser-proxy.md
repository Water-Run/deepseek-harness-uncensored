# 10.02 浏览器与 MCP 独立代理

本项延续原独立代理范围，不替代 10.05 的目标保护。代理仍默认关闭，仅网安会话使用。

- [x] Playwright MCP：新启动的 Chromium 使用会话代理，普通回环目标也经过代理。
- [x] Chrome DevTools MCP：同样接入会话代理，保留控制进程与 Host 的网络环境。
- [x] Stagehand：网页请求使用代理；本浏览器的 CDP 使用专用本机域名，Node 初始化仅映射对应控制地址。真实导航、后续新标签与控制连接未进入网页代理均已验证。
- [x] 实际 Agent 决定路由；其他模式保留原路由。代理准备取消后不创建 MCP 子进程，缺失或错误的本机端点在执行前失败。
- [x] 设置页明确列出三种 launch 提供方与尚未覆盖的路径，保留 HTTPS 正文不解密的说明。
- [x] Windows 三种真实无界面浏览器场景通过；路由/生命周期、设置及引擎测试通过，完整构建与最终聚合检查通过。
- [x] Linux 三项无密钥 Session 回放通过。两份旧 MCP 提示词头更新为当前已有的产品提示词；未修改任何已提交的 Session JSONL。其 Bash 工具头明确按 POSIX 验证，Windows 另由真实浏览器场景覆盖。
- [x] 桌面浏览器侧栏接入：从冷会话记录解析实际模式，独立分区保留同会话存储并隔离普通标签；受影响的标签随模式和代理重连。真实 Electron HTTP、归属、正文及 Host 阻止通过，详见 10.08。
- [x] 普通 MCP 工具与资源使用实际 Agent 的代理。真实本机 HTTP 调用与资源读取、stdio 出站和进程状态隔离、关闭后的普通路由通过。启动发现仍由应用路由负责。
- [x] ACP、Codex、Claude Code 和 DSH SDK 外部委派在启动时接入父会话代理。四种真实进程均以本机响应验证出站及流量归属，ACP 另验模式切换。DSH SDK 保留配置档的本机回环直连规则。
- [x] 四个外部提供方已打包，使用固定版本的本地注册表通过实际 Desktop CLI 安装到隔离配置，并在已安装版的 Host 注册成功。Codex 与 Claude Code 功能包由插件入口选中，ACP 和 DSH SDK 通过隔离配置声明启动。
- [ ] 对正式发布源验收按需安装、升级与回滚。Web 内嵌页继续使用宿主浏览器网络。
- [x] bcbae27d56 桌面检查包已验证实际安装器、完整文件清单、浏览器模块入口、四模式及终端代理；尚未安装到系统。
- [x] 11 月 4 日从实际安装器启动独立 profile，Playwright 与 Chrome DevTools 的真实导航及会话代理捕获通过。
- [x] Stagehand 实包导航发现 SDK 扩展路径位于 ASAR 内；已补物理扩展目录、Worker 显式路径及打包检查。11 月 4 日 f3f7315880 新安装器的三种浏览器真实导航、会话代理及响应正文检查通过。
- [ ] 正式安装后的实际浏览器工作流验收，保持与源码环境的三项真实浏览器检查分开记录。

普通 MCP 验证日志为 `mcp-routing-regression-20261104.log`，共 17 文件、200 项。录制回放的 Windows 提示事件差异见 [HANDOFF](../HANDOFF.md)。

迁移说明：独立代理开启时，外部浏览器的 attach 模式无法接管代理，会在启动前报错；改用 launch。代理和模式在浏览器启动时确定，修改后重建浏览器会话。Stagehand 扩展的模型请求随浏览器路由，应用本身的模型接口保持原路由。

主要证据位于 `.dsh-build`：`browser-proxy-real-final-20261103.log`、`browser-proxy-regression-20261103.log`、`browser-proxy-routing-tests-final-20261103.log`、`browser-proxy-ui-engine-20261103.log`、`browser-proxy-complete-build-20261103.log`、`browser-proxy-final-aggregate-20261103.log`、`browser-proxy-linux-replay-20261103.log`。本项不代表完整目标保护或任意第三方程序的全流量代理已经实现。

新包证据：`delivery-f3f731-verification-20261104.log`、`packaged-browser-20261104-all-result.json` 及 `DSHU-20261104-f3f731-manifest.json`。旧构建的大体积副本已清理，保留日志和哈希；当前实际安装器副本与冻结清单见 HANDOFF。

10.08 源码证据（2026-11-04）：`sidebar-proxy-final-tests-20261104.log`（25 文件、192 项）、`sidebar-proxy-build-20261104-verified.log`（10 个构建步骤）、`sidebar-proxy-electron-real-20261104-commit-event.log`（真实 Electron）及 Web 侧栏录制快照。实际 Native fixture 使用产品 preload 与 guest broker；普通测试分区用直连控制网络变量，产品不覆盖普通分区的系统代理。原录制 JSONL 未修改，仅新增 Web carrier 的可见结果。新源码未进入 f3f731 检查包。
