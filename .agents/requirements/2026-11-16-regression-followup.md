# 完整回归后续核验

当前安装版仍为 `2026.11.15.9`。本页记录[完整基线](2026-11-15-regression-baseline.md#新基线)之后的定向核验，不替换该基线的 1,073 通过、12 失败和 34 条件跳过。

## 主题、首页与设置入口

- 首次配置与滚动条测试显式选择初始浅色主题，再通过真实设置切换深色。原问题来自默认日出日落主题在夜间进入深色，而预期仍要求浅色；没有修改产品默认主题或颜色值。
- 首页点击诊断记录到 `data-dsh-theme-reveal` 仍存在，命中的是过渡画面而非首页内容。场景等待该状态结束后再点击，保留光点像素、浅深色、窄屏、减少动效与输入独立断言，没有增加固定睡眠或重试。
- 模拟 macOS 收起侧栏后，账号按钮在 DOM 中仍可能可见，却已被中栏覆盖。设置助手按实际收起状态展开侧栏，并区分专用入口与列内同名按钮；继续通过账号菜单打开设置。用例明确核对两种起始状态的入口和控件可达性，不把展开后的模态布局描述成收起侧栏布局。
- Windows 工作树的滚动条几何预期残留 CRLF，与提交内容转换为 LF 后完全相同。恢复该文件的已提交 LF 字节后，原颜色和几何预期通过，没有修改预期值或放宽正常化规则。

Windows 首页 5 项、首次配置 4 项通过；滚动条 9 项通过后，LF 修正对应的几何项单独通过，共 10 项取得通过记录。窗口拖拽最初 18 项中 2 项出现目录选择/启动超时，之后定向 2 项通过，最终整文件 18 项只读复验全部通过；旧失败保留，不能将后续通过等同于根因已修复。启动失败现在会记录页面错误、警告与截图。

证据位于同日交付目录：`cohort-u-whale-diagnostic`、`cohort-u-whale-click.json`、`cohort-u-windows-readonly`、`cohort-u-windows-scrollbar`、`cohort-u-windows-scrollbar-lf`、`cohort-u-windows-drag-focused` 和 `cohort-u-windows-drag-final`。

## Worker 预览候选

Worker 预览仍未通过完整验收。当前候选补齐裸 `node:assert` 的导入及 CommonJS 可调用语义；4 项新回归在修复前失败，修复后通过。浏览器 Fetch 适配支持平台请求与响应，拒绝自定义分发器、原生连接池和代理，不会把要求代理的请求改为直连。候选还修正了 Windows 静态测试服务器的 URL 分隔符映射。

模块导入修正后，实际预览暴露的下一处阻塞是 `node:sqlite`：Worker 没有真实 SQLite 账本，额度守卫继续拒绝付费请求。既有拒绝用例验证提供方请求次数为零；未关闭额度守卫，也未将该错误从预览检查中滤掉。这里不能以显示正常或原生 Desktop 的 SQLite 通过代替 Worker 后端验收。

相关 46 项单测及相邻拒绝/模块表用例通过，产物构建及 Host/Client 聚合检查通过；实际预览仍失败，日志为 `worker-fetch-preview`。候选代码留在当前工作树，不包含在本轮完成项提交中；已另存到 `%USERPROFILE%/DSHU-Deliveries/20261115/worker-preview-candidate`，包含逐文件摘要、完整文件与 tracked patch。后续先核对 `manifest.json` 与工作树，避免覆盖或丢失这些改动。

## Ubuntu 迁移窗口

用户在 C 盘迁移对话明确授权“和他沟通，进行迁移”。本对话已确认 Ubuntu 测试结束并回复“Ubuntu 可以暂停迁移”；收到迁移完成通知前不启动该发行版。Goal 保持活动，当前仅进行 Windows 工作，不更改 WSL 配置或操作 Docker。

私有检出 `/home/linzh/.cache/dshu-verification/linux-rc2-20261113.iLMw1C/source` 保留候选测试与界面预期。本批迁移前的 Linux 运行是 48 通过、2 失败的候选刷新，不能称为整批最终只读通过。交接回执为 `ubuntu-migration-handoff.json`。

迁移对话随后通知已完成：Ubuntu 注册于 `D:/WSL/Ubuntu`，已确认私有检出可访问且有 8 条未提交状态，可以恢复使用。完整导出备份位于 `D:/Codex-disk-relief/ubuntu-pre-migration-2026-11-15/ubuntu-backup.tar`。继续前仍需保留、核对这些候选文件；本记录尚未将待验场景改为完成。

## 旧 Minimal 界面预期

迁移后已核对并保存三份候选及原始预期，逐文件摘要位于 `minimal-candidate-after-migration/manifest.json`。差异仅为顶部旧模式标识由 `minimal` 显示为本地化的 `Minimal mode`，与已有产品修复一致；未修改 Session JSONL、命令、提示词或工具输出。三份界面预期已按审阅结果同步到主仓库。

在私有 Linux 检出以 `DSH_SNAPSHOT=replay` 执行原始 `minimal-preset.snapshot.ts`，13 项全部通过，包含命令、手动压缩、图片与持久化重开。日志和 JSON 为 `minimal-after-migration.*`。此项定向通过不改写原完整基线的失败数字；Worker 预览的 SQLite 缺口仍保留。
