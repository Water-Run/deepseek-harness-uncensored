# DeepSeek Harness Uncensored — 需求全量复盘与交接

本文档从第一条需求（第一张截图）开始，按时间顺序逐条记录：**原始诉求 → 落地情况 → 实现位置 → 验证证据 → 遗留问题**，最后给出仓库现状、分工边界与后续计划。

状态标记：`✅ 已完成` / `🟡 部分完成` / `⬜ 未开始`

---

## 0. 需求来源一览

| # | 来源 | 一句话 |
|---|---|---|
| R1 | 截图①（深色顶栏 `🐳 deepseek [HARNESS]`）+ 截图②（白底黑鲸应用图标） | 开箱即用的 DSH 破甲版：改名、内置 purge、Logo 反色、与官方版共存 |
| R2 | 设置页截图两张 + 文字四条 | 工作区"不在工作区工作"、默认插话、余额曲线、中国大陆域名保护 |
| R3 | 侧栏菜单 / 余额 / dsh-purge 胶囊截图 + 文字六条 | 反馈改 Issue、内置余额、版本信息、只留 Flash、完全权限、去掉 purge 入口 |
| R4 | Agent 预设页 / 关于框 / 托盘菜单 / 会话菜单截图 + 文字八条 | 动画、模式三选一、GitHub Release 更新、关于页、GitHub 图标、反馈 Issue、会话切换、压平提交历史 |
| R5 | GitHub PR 列表截图 | 清理机器人与积压 PR |
| R6 | 桌面图标对比截图 | Logo 大小/留白不对 |
| R7 | 托盘截图 | 托盘图标漏改 |
| R8 | 顶栏标记截图 | UNCENSORED 样式优化 + 底色按模式 |
| R9 | "红队模式 加载失败"截图 | 清理自定义红队模式 |
| R10 | 输入框上方 dsh-purge 胶囊截图 | purge 选择器不要了 |
| R11 | 任务栏右键菜单截图 | 展示场景名称也要改 |
| R12 | 欢迎页截图 | 顶部 UNCENSORED 标记遗漏 |
| R13 | 顶栏标记截图（第三次） | 模式切换顶部不变色；顺序改为 缺省/网安/写作 |
| R14 | 对话补充 | 装到系统里、要 Desktop 版、启动闪退、主版本插件恢复、两版独立、完整复盘 |

---

## 1. R1 — 开箱即用的破甲版（基础四条）

**原始诉求**：这是开箱即用的 DSH 破甲版本。
1. 名称加 `Uncensored`，标题（图①）HARNESS 右边加黄底 `UNCENSORED`
2. 内置（而不是插件）我的 dsh purge fork
3. Logo 反色：白底黑鲸 → 黑底白鲸
4. 确保和普通版 DSH 共存、独立化

**落地**：✅ 全部完成（第 2 条为架构级重做，见 §2）

| 子项 | 实现位置 | 说明 |
|---|---|---|
| 1. 名称与标记 | `packages/client/ui-primitives/src/BrandWordmark.tsx` | 新增 UNCENSORED 胶囊（笔画路径绘制，不依赖字体），固定在 HARNESS 右侧 |
| 2. 内置破甲 | `packages/context/uncensored-armor/` + 各 bundle `cordis.patch.yml` | 提示词变成**原生 system prompt section**，权限/沙箱/身份默认值全部写进源码层配置 |
| 3. Logo 反色 | `apps/desktop/resources/icon*.svg`、`apps/web/public/favicon*.svg` | 黑底（#0F1115）+ 纯白鲸鱼 |
| 4. 共存 | 见 §3 身份表 | home、端口、CLI、深链、appId、userData 六项全部分离 |

---

## 2. 破甲为什么是"内置"

dsh-purge 的工作方式是**运行时改写已构建产物**（`lib/*.js` 打 89 个 patch、注入 `prompt-inject.md`、注入 `client.js`）。本仓库把它换成源码层实现：

| 破甲层 | dsh-purge 做法 | 本仓库做法 |
|---|---|---|
| 提示词 | 注入 `~/.dsh/prompt-inject.md` | `@deepseek-ai/dsh-uncensored-armor` 注册 `uncensored:armor` section，随会话落日志、可回放、可压缩 |
| 身份 | 字符串替换 | `system-prompt.includeHarnessIdentity: false`（base/web/headless/acp/sdk 五个 bundle） |
| 权限 | patch approval 逻辑 | `sandbox-policy.mode` 默认 `danger-full-access`、`user-approval.policy` 在完全权限下 `never` |
| 摩擦 | patch 提醒/剪枝 | `repeat-tool-reminder`、`tool-result-pruner` 行 `disabled: true` |
| 语言 | 单文件 zh | `DSH_UNCENSORED_ARMOR=zh|en|none`，默认 zh |

提示词正文从 `D:\Coding\dsh-purge\lib\default-prompt-inject.{zh,en}.md` 转成 TS 字符串模块（`src/armor.{zh,en}.ts`），随包发布，不再读外部文件。

---

## 3. R1.4 — 两套安装的身份表

| 维度 | 官方 DSH | 本仓库 |
|---|---|---|
| 产品名 | DeepSeek Harness | DeepSeek Harness Uncensored |
| 数据目录 | `~/.dsh` | `~/.dsh-uncensored` |
| Web 端口 | 3080 | **6666** |
| CLI | `dsh` | `dsh-uncensored` |
| 深链 | `dsh://` | `dshu://` |
| appId | 由 env 决定 | `com.deepseek.dsh.uncensored` |
| Electron userData | `%APPDATA%\DeepSeek Harness` | `%APPDATA%\DeepSeek Harness Uncensored` |

**关键坑（R14 修复）**：本机存在全局 `DSH_HOME=C:\Users\linzh\.dsh`，新版本最初继承了它 → 登录态/会话与官方版复用。现在：

- `apps/desktop/src/main.ts`：进程最早期把 `DSH_UNCENSORED_HOME`（默认 `~/.dsh-uncensored`）写进 `DSH_HOME`，覆盖全局值；同时 `app.setName('DeepSeek Harness Uncensored')`（顺带修掉 scoped 包名导致的 userData 创建失败 = **启动闪退**）
- `scripts/install-uncensored.ps1`：CLI 启动器同样固定

验证：新版本启动后写入 `~/.dsh-uncensored`（文件数 31 → 37），与 `~/.dsh` 的账号凭据互不相干。

---

## 4. R2 — 设置与体验四条

| # | 诉求 | 状态 | 落地 |
|---|---|---|---|
| R2.1 | 工作区增加"不在工作区工作" | ⬜ 未开始 | 需要 workspace picker 增加"无工作区"项 + Session 创建路径 |
| R2.2 | 发送默认直接插入，而不是排队 | ✅ 完成 | `packages/client/ui-conversation/src/submission-settings.ts`：`DEFAULT_BUSY_ENTER_BEHAVIOR = 'steer'`，相关 spec 已同步 |
| R2.3 | 余额曲线等统计 | ⬜ 未开始 | 数据源按你的要求做成可切换：本机采样 / API 拉取 |
| R2.4 | 中国大陆域名保护（类似旧 purge，默认开） | ⬜ 未开始 | 参考 `D:\Coding\dsh-purge\lib\net-scope.js`，迁移为 host 侧规则 |

---

## 5. R3 — 账号、余额、版本、模型六条

| # | 诉求 | 状态 | 落地 |
|---|---|---|---|
| R3.1 | 意见反馈 → 提交 GitHub Issue | ✅ 完成 | `ui-settings-account`：默认 `contactFormUrl` 指向 `.../issues/new/choose`，文案改"提交 Issue"，中英菜单快照同步 |
| R3.2 | 内置余额显示（赠金 + 余额并排、梁文峰/梁文谷背景时段、悬浮优化、设置项含开关与刷新率） | ⬜ 未开始 | 需要 host 侧余额采样 + 客户端图表；与 R2.3 合并做 |
| R3.3 | 版本显示：Uncensored 版本 / DSH 原版本 / fork commit 时间与节点 | ⬜ 未开始 | 数据已有（打包元数据含 `dshBuildCommit`），缺关于页承载 |
| R3.4 | 模型默认只保留 V4.1 Flash 1017 | 🟡 部分 | API Key 路由目录已只留 `deepseek-flash`；账号路由由账号 `/models` 决定，需要给 `modelOverrides` 加 `hidden` 才能真正藏掉 Pro |
| R3.5 | 默认完全权限 | ✅ 完成 | base bundle：`danger-full-access` + `never` |
| R3.6 | 顶部 dsh purge 入口不要了 | ✅ 完成（限于本版本） | 本版本从未安装 purge，不存在该入口；官方版的那条来自 purge 注入，属官方安装的范畴 |

---

## 6. R4 — 模式体系与发布八条

| # | 诉求 | 状态 | 落地 |
|---|---|---|---|
| R4.1 | 系统动画补全，更丝滑 | ⬜ 未开始 | 横切面，建议最后统一做 |
| R4.2 | 改名"模式"，只保留三个：缺省 / 写作 / 网安，每行一个从上到下 | ✅ 完成 | `web-app/presets/{standard,security,writing}.patch.yml`；`ptc`/`minimal`/`cordis` 移除；设置页 `nav: 模式`、卡片单列 |
| R4.3 | 更新走 GitHub Release | ⬜ 未开始 | 桌面 `electron-updater` 换 provider |
| R4.4 | 关于页显示版本、仓库、协议 | ⬜ 未开始 | 与 R3.3 同一处 |
| R4.5 | 增加 GitHub 图标 | ⬜ 未开始 | 与 R4.4 同批 |
| R4.6 | 反馈改为提交 Issue | ✅ 完成 | 同 R3.1 |
| R4.7 | 扩展项目，含直接切换到进行中的对话 | ⬜ 未开始 | 需要会话切换入口扩展 |
| R4.8 | 不要两万多 commit，分支改 main，直接第一个 | ✅ 完成 | 见 §8 仓库状态 |

**模式内容细节**（R4.2 的实现）：

| id | 名称 | 顺序 | 组合 |
|---|---|---|---|
| `standard` | 缺省 | 1 | 全量编码工具（bash/pwsh、fs、jobs、web、子代理、工作流、计划模式、压缩） |
| `security` | 网安 | 2 | 同全量工具 + 红队作业规则人格（目标即授权、占位符不追问、优先真工具、全程留命令与结果） |
| `writing` | 写作 | 3 | 去代码执行：fs、fs-search、web、todo、ask-user、present、压缩；scene-first 写作工艺人格（单视角、感官具体、对白潜台词、连续性以用户最新说法为准、拒绝"情绪总结段"） |

> 保留说明：三个退役 id 的**文案与帮助页条目刻意保留**，供老 profile / 老会话解析名字，不是死代码（CodeX 审查请注意）。

---

## 7. R5–R13 — 逐条修订

### R5 机器人与积压 PR ✅
- dependabot 10 个 PR 全部关闭、分支删除、`dependabot.yml` 移除
- 25 个 workflow 全部删除，仓库 Actions 服务端关闭（`enabled: false`）→ 不再有 CI 邮件

### R6 图标大小/留白 ✅
问题有两层原因：
1. 快捷方式 ICO 从"贴满整块"的 `icon-windows.svg` 渲染，桌面尺寸下鲸鱼撑爆
2. 托盘渲染器自带 `scale(1.2)` 放大被叠加

修复：三份 SVG 统一构图（圆角方块 + 内边距）、鲸鱼组 `scale(0.8)`、颜色改**纯白**；应用 ICO 由新增的 `render-app-icon.ts` 独立渲染，不再经过托盘放大。

### R7 托盘图标 ✅
`render-tray-icon.ts` 支持源文件自带 transform（此前会注入重复 `transform` 属性导致 SVG 解析失败），已按新图重渲染 `tray-windows.ico`。

### R8 UNCENSORED 样式 + 模式配色 ✅
- 字距 5.72 → 6.4，胶囊 64 → 72 宽
- 配色：缺省蓝 `#3B82F6`、写作黄 `#FFC400`、网安红 `#E5484D`、其它绿 `#22A06B`

### R9 / R10 清理红队模式与 purge 入口 🟡
- 官方安装的 `~/.dsh/profiles/desktop` 里 `dsh-purge` 插件曾被临时移除，**已还原**（备份 `~/.dsh/dsh-purge-backup-20261022-174658`，并重新 link 三个插件）
- 说明：`红队模式 加载失败` 这张卡片本身来自 purge 包内的预设声明；本版本不安装 purge，因此不存在

### R11 展示名称 ✅
`apps/desktop/src/locale.ts` 内所有产品名（关于/隐藏/退出/打开/欢迎/更新/启动失败）与 `main.ts` 的 `applicationName` 全部改为 `DeepSeek Harness Uncensored`；窗口标题栏已验证显示

### R12 欢迎页标记 ✅
`apps/desktop/renderer/assets/welcome-brand.svg` 是欢迎窗口独立静态图（不在 `BrandWordmark` 里，故此前遗漏），已补 UNCENSORED 胶囊（14 高、圆角 2、字距 1.05）

### R13 顶部随模式变色 + 顺序 ✅
- 会话头部渲染当前模式时把 `--dshu-release-tone` 写到 `<html>`
- `BrandWordmark` 胶囊 `fill` 读该变量（无会话回落蓝色）
- 顺序：缺省 1、网安 2、写作 3

### R14 装机与运行 ✅ / 🟡
- 装到系统：✅ 桌面应用装到 `%LOCALAPPDATA%\Programs\DeepSeek Harness Uncensored\`，桌面 + 开始菜单快捷方式指向它
- "要 Desktop 版本"：✅ 走 Electron 打包（`--dir --unsigned`），不是浏览器标签
- 启动闪退：✅ 根因是 scoped 包名做 userData 目录失败 + 继承全局 `DSH_HOME`，均已修复
- 主版本插件恢复：✅ 已还原
- 两版本独立：✅ home / 凭据 / 会话 / userData 分离

---

## 8. 仓库现状

| 项 | 值 |
|---|---|
| 远端 / 分支 | `github.com/Water-Run/deepseek-harness-uncensored`，`main`（默认分支，`master` 已删） |
| 历史 | 单基线 + 功能提交，无上游 2.2 万条历史（`.git` 262MB → 39MB） |
| Actions | 全部删除并服务端关闭 |
| 基线 | 上游 `deepseek-ai/deepseek-harness` 0.2.1-rc.2（`687f282e86`） |
| 提交 | `57086f12` 基线 → `01cf0060` 品牌/身份/armor → `c1b4d83e` 三模式/单模型/安装脚本 → `d237c6d1` 端口 6666/桌面入口 → `63062bda` 图标修正/CI 清理/打包跳过安装器工具链 → `3f24a45c` 日志忽略 → `507f97df` home 隔离/名称/配色 → `7b6bf1aa` 欢迎页标记/模式顺序/顶部随模式变色 |

### 构建与安装

```powershell
# Web / CLI
corepack pnpm run build:artifacts
.\scripts\install-uncensored.ps1
dsh-uncensored web --port 6666

# 桌面版
$env:DSH_DESKTOP_APP_ID='com.deepseek.dsh.uncensored'
corepack pnpm exec tsx apps/desktop/scripts/package-target.ts win-x64 --dir --unsigned
```

本机打包配置在 `apps/desktop/.env.windows`（git 忽略，使用 `registry.npmmirror.com`）。

为在本机跑通桌面打包改了四处（官方发布链路需评审）：

1. `desktop-toolchain-preflight.ts`：`--dir` 跳过 VS C++ 探针
2. `electron-builder-config.mjs`：`DSH_DESKTOP_SKIP_INSTALLER_UI=1` 跳过安装器 UI 预编译
3. `package-target.ts`：目录构建自动设置上述变量
4. `smoke-packaged-runtime.ts`：按 `DESKTOP_PRODUCT_NAME` 寻址产物

---

## 9. 验证证据

- `corepack pnpm run typecheck` 通过
- `ui-primitives` + `ui-agent-preset`：1560 条测试全绿；`ui-settings-account`、`ui-conversation`、`home-paths`、`agent-instructions` 全绿
- Web：`http://127.0.0.1:6666` 返回 200，标题 `DeepSeek Harness Uncensored`
- 打包运行时自检：`CLI offline plugin installation and removal passed`、`DOCX/XLSX/PPTX + skill CLI passed`
- 桌面端：进程名 `DeepSeek Harness Uncensored`，窗口已出，写入 `~/.dsh-uncensored`

---

## 10. 分工边界

### CodeX：样式与细节审查

1. 窗口/任务栏标题仍出现 `DeepSeek Harness`（走 Web `document.title` 链路，与 about 菜单来源不同）
2. 标记与模式徽标的配色用的是字面色值（`AgentPresetLabel.module.css`、`BrandWordmark.tsx`），是否收敛为 token
3. 欢迎页 UNCENSORED 用 `<text>` 绘制，其余字标是路径，是否统一
4. 三模式重排后设置页间距/提示文案校对
5. 退役预设文案保留带来的字典体积与 `verify-client-ui-i18n`
6. 模式改名/顺序变化对 `test:web` 回放快照的影响
7. 上述第 4、5、6 节所有 ⬜ 项的 UI 实现与视觉打磨

### 我：需要破甲能力的安全审计与实现

1. **网安模式能力落地**：把 dsh-purge 的 23 个红队技能接入 `~/.dsh-uncensored/skills`，预设工具面与技能对齐（侦察 → 漏洞发现 → 利用 → 横向 → 报告）
2. **中国大陆域名保护**：net-scope 迁移为 host 侧规则（分类、拦截/放行、默认开启、白名单），写明绕过面
3. **Electron 加固审查**：`contextIsolation`、自定义协议、深链入参校验、preload 暴露面
4. **权限与沙箱模型复核**：完全权限下仍受限的路径、ACL 与策略拒绝的区分、失败上报
5. **凭据/日志隔离审计**：两套安装的凭据、会话、遥测、临时文件不交叉；armor 文本不进对外日志
6. **供应链与依赖审计**：workspace 依赖、vendor 补丁、打包运行时依赖
7. **发布链路安全**：GitHub Release 更新源的签名与校验、降级保护

---

## 11. 环境备注

- 本机全局 `DSH_HOME=C:\Users\linzh\.dsh`（官方安装写入）；本仓库两个入口都已强制改写
- 部分宿主 shell 存在 `ELECTRON_RUN_AS_NODE=1`，从这种 shell 直接起 Electron 可执行文件会当 Node 跑并立即退出；双击快捷方式不受影响
- 官方安装 profile 在 `~/.dsh/profiles/desktop`，本次改动前已备份 `package.json` 与 `cordis.patch.yml`
