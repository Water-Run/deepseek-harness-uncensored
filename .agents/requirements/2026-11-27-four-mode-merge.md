# DSHU 2026.11.27.0 四模式并档与缺口记录

更新于 2026-11-27。记录把上一正式版 `v2026.11.24.3` 的专项能力并回 `0.2.3-alpha.2` 候选树的过程、已完成的验收证据，以及仍未移植的部分。候选身份：DSHU `2026.11.27.0`、DSH `0.2.3-alpha.2`、上游 `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`、候选树 `e6b3c3ab66e18d42f670cf17b5e80a99f642434a`。

## 背景

此前的 `0.2.3-alpha.2` 候选只装配缺省与写作两种模式：上一正式版有、候选缺的专项包共 12 个（破甲核心、REA、网安代理与真实目标保护、拒答重试、设置插件页、工作目录工具、个性化推荐、CUA/PT 运行时）。交接文档把四模式与组件交付留给专项维护者，长期未完成；因此候选安装包无法包含破甲与 REA，关于页如实显示“未包含”。

## 本轮已移植并验证

| 能力 | 包/文件 | 验收 |
| --- | --- | --- |
| 破甲提示词 | `packages/context/uncensored-armor`（含 `armor-core.lock.json`：dsh-purge Community v1.7.20，commit `e519253d5b01`） | 片段摘要与锁一致（`core-sync` 用例）；`sync-armor-core --check`；挂载进 base 组合 `uncensored-armor` 行 |
| 拒答重试 | `packages/guard/refusal-retry` | 挂载 `refusal-retry` 行（arms `[1]`，每轮 2 次、每会话 6 次上限） |
| REA 逆向 | `packages/mcp/rea` + `rea-core.json`（REA 6.9.0，commit `d74549e495c0`，toolCount 255） | `tauri` 编译 0 错；`packages/mcp/rea/tests` 9 项通过；`reverse` 预设 `@deepseek-ai/dsh-rea/agent` |
| 逆向模式 | `packages/bundle/web-app/presets/reverse.patch.yml` | 注册进 web-app `dsh.bundle.patch` 顺序 |
| 网安模式预设 | `packages/bundle/web-app/presets/security.patch.yml` | 同上；模式入口、敏感确认与案件资料沿用 alpha.2 的 `agent-preset-registry` |
| 网安出口代理 | `packages/guard/security-proxy`、`security-proxy-local` | `tsc` 0 错；`security-proxy-local` 76 项测试通过；base 组合 `security-proxy` 行，headless 关闭 |
| 联网地址钉扎 | `packages/web/web-fetch-http`（新增 `authorization.ts`、`network.ts`、`ip.ts`，扩展 `provider.ts`/`index.ts`） | 129 项测试通过；`web-fetch/authorize` 事件已登记；`HttpFetchDestination`/`HttpFetchRejection` 类型分级 |
| 工作目录工具 | `packages/session/tool-working-directory` | base 与 sdk-minimal 组合行；工具目录生成；14 项测试通过 |
| 安全/逆向手册 | `packages/skill/skill-playbooks/assets/{security,reverse,shared}` | 13 项手册用例通过（含台账脚本、样本清单） |
| 关于页组件状态 | `release-components.ts` 改为读取构建期封入的组件身份；`about-locales.ts` 8 种语言改为“随包提供”；`scripts/client-build-environment.ts` 从 `armor-core.lock.json` 与 `rea-core.json` 注入 `DSH_CLIENT_PURGE_*`/`DSH_CLIENT_REA_*` | `.dsh-build/client-build-environment.json` 已含 18 个公开值（含两类组件版本、提交、时间、许可、仓库）；组件缺失时组件区自动隐藏 |

组合与生成物同步：`packages/bundle/base/{package.json,cordis.patch.yml}`、`packages/bundle/web-app/{package.json,cordis.patch.yml,presets/*}`、`packages/bundle/headless`、`packages/bundle/sdk-minimal`、根 `package.json` devDependencies、`tsconfig.base.json`（含 `@deepseek-ai/dsh-security-proxy/types` 手写别名）、`tsconfig.host.json` 项目引用，以及 `scripts/gen-{tsconfig-paths,cordis-catalog,tool-catalog}.ts` 的登记表。

## 验收结果

- `pnpm run build`：10 项构建检查全部通过（Host/Client Typert、编译、打包、聚合检查、Web 构建）。
- `pnpm run build:check`：Host 与 Client 聚合检查通过。
- 定向测试：`uncensored-armor`、`mcp/rea`、`refusal-retry`、`security-proxy-local`、`web-fetch-http`、`tool-working-directory` 共 237 项通过。
- 目录生成：`verify-client-catalog`、`verify-config-catalog`、`verify-cordis-catalog`、`verify-tool-catalog`、`verify-persistence-catalog`、`verify-cordis-config` 全部通过。
- 候选树可复现：`node scripts/prepare-kernel-candidate.mjs <新目录>` 由补丁还原得到同一树 `e6b3c3ab66e1`。

## 仍未移植（与上一正式版相比的缺口）

| 缺口 | 现状 | 影响 |
| --- | --- | --- |
| `target-protection`（真实目标保护） | 未移植。实测编译缺 100 项接口，横跨 `ssh`、`fs-local`、`win32-process`、`subprocess-local`、`ptc-runtime`、`agent-preset-registry`、`browser-use`、`mcp-client`，约 2.8k 行新增；其中文件授权钩子、Windows Job 对象、SSH 传输形态都是安全边界 | 网安模式下没有按域名/主机/数据库的保护规则与审计联动；`web-fetch/authorize` 事件目前只有传输层钉扎，无策略监听者 |
| `client-ui-security-proxy` | 未移植（依赖上项与 Host Remote 服务） | 网安模式没有代理设置面板、连通性测试与流量查看器 |
| `client-ui-settings-plugins` | 未移植（alpha.2 的 `settings.plugins.tab` 插槽被重排） | 设置中没有“内置插件”分区；插件清单仍由 `ui-settings-plugin-inventory` 提供 |
| `experimental/ptc-runtime-python` | 未移植（PTC 运行结果类型已变） | PTC 的 Python 运行时不可用 |
| `experimental/personalized-recommendations` | 未移植（`cordis-plugin-include` 的 `entryListSchema`/`overlays` 已变） | 个性化推荐未随包 |
| `experimental/cua-macos` | 未移植；候选已有 alpha.2 的 `@deepseek-ai/dsh-cua-macos` | 桌面 CUA 使用上游实现 |
| `uncensored-armor` 的提示词装配用例 | rc.5 测试的直连 `apply` 与 alpha.2 的服务注入不兼容；本轮保留片段锁用例，删除装配用例 | 破甲文本挂载只由片段摘要与真实构建覆盖，缺少装配级单测 |

## 复验入口

```sh
node scripts/prepare-kernel-candidate.mjs --verify-build <候选目录>
pnpm run build
node_modules/.bin/vitest run packages/context/uncensored-armor/tests packages/mcp/rea/tests packages/guard/security-proxy-local/tests packages/web/web-fetch-http/tests packages/session/tool-working-directory/tests packages/skill/skill-playbooks/tests --testTimeout=30000
pnpm run verify-client-catalog && pnpm run verify-cordis-catalog && pnpm run verify-tool-catalog
```

## 产物

Windows x64 未签名安装包、差分索引与安装后 `app.asar` 的摘要见下一节回填。关于页应显示“随包组件与许可”以及 `dsh-purge Community 1.7.20`、`REA 6.9.0` 的版本、提交与许可；缺失时该区块不显示组件。

（产物摘要待本轮打包完成后回填。）
