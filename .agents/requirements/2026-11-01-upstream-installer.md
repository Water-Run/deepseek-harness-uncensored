# DSH 内核与独立安装器

纳入当前 Goal「实现DSHU」，不替代已有目标保护、数据库、审计与其他未完成项目。

## 02.10 跟进最新 DSH 内核

- [x] 核对官方发布：当前产品记录为 DSH 0.2.1-rc.3，源节点 1f81c047fc48fa190a683e469daa699857e9afe8。2026-11-01 查到主线发布版本为 [0.2.2-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2)，另有 10 月 30 日发布的 [0.2.1-rc.5](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.5) 维护线补丁。
- [x] 拉取两个发布标签用于对照，不创建额外本地分支。目前为浅克隆，HEAD 与新标签未取得可用 merge-base；不能直接当作普通无冲突快进。
- [ ] 以最新主线发布 0.2.2-alpha.2 为迁移目标，同时核准 rc.5 的思考展示修复是否已包含。固定发布节点，不把未发布 master 的版本字符串当作已适配证据。
- [ ] 基于 product.json 记录的源树逐项核对：alpha.2 的 packages/apps/scripts/native/vendor 等范围约 6026 个文件变化，不能仅改版本号。核准 Node >=24.9、Session retained projection、按步骤工具准入、Agent 级 PTC/原生工具拆分、SSH 协议和插件更新接口。
- [ ] 保留 DSHU 独立 v0.1.0、数据目录、更新源、armor 内容及顺序、四模式、旁问/随问、额度、记忆、REA 与受保护执行器；原有冻结 Session 代际不可覆盖。
- [ ] 先适配能力与持久化/API 消费者，再验证 UI 和安装包。上游 vendor 如有更新，按 vendoring 规则记录版本及本地补丁并完成其要求的检查。
- [ ] 构建、针对性回放及真实功能验收通过后，才更新 product.json、关于信息与 README 的内核版本和节点。

## 02.11 安装器明确属于独立 DSHU

- [x] 已确认：productName 与产物文件名含 Uncensored，但 installer/assets/brand.png 仍是原白底鲸鱼及 deepseek HARNESS 图，没有 DSHU 标识。
- [x] 从现有黑化矢量 Logo 重建浅色/深色、1x/2x 欢迎图与卸载图片，显示 DSHU / DeepSeek Harness Uncensored；已查看输出图，保留可重现生成脚本。
- [x] 欢迎、安装中、完成、卸载、窗口标题及包元数据均明确独立 DSHU；发布者 WaterRun。产品全名与安装目录保持原 DSHU 名称，前台布局实测见末项。
- [x] 打包后的 package name 改为 deepseek-harness-uncensored；校验拒绝两个已知官方应用 ID（含大小写变体），示例及本地默认配置改用独立 ID。卸载同时保留 DSHU 和官方主目录，不删除旧共用包名目录；主目录别名或无法确认时保留数据。
- [x] 修正旧文件名/官方发布校验断言，原生中英夹具各 7 种安装/卸载场景通过，包含别名、无效目录和官方主目录嵌套。实际 dshu/dsh 协议注册项逐项前后比较未变；夹具使用独立测试协议。
- [ ] 在浅深色、不同 DPI 下实际打开安装器验收。用户于 2026-11-01 选择“先继续后台开发”，当前不打开前台测试窗口，也不安装正式应用；只运行隔离的静默夹具。此前“只卸载旧版并打开向导，余下我操作”的限制继续适用于正式系统安装。

内核迁移仍在实现中，版本尚未升级；三方源码预览发现约 347 个冲突路径，当前尚未应用到 main。安装器代码与后台测试已完成，前台验收按用户要求延后。

构建配置迁移：旧值 com.deepseek.harness 和 com.deepseek.dsh 不再允许用于 DSHU。已有私有打包配置须选择 com.deepseek.dsh.uncensored 或其他独立 ID；不要改写官方版的配置或安装。公开迁移说明集中在 README 和桌面包说明中，不恢复已精简的独立文档站。
