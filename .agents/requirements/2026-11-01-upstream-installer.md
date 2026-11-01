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
- [ ] 使用现有黑化矢量 Logo 重建浅色、深色、1x/2x 欢迎与卸载图片，明确显示 DSHU / DeepSeek Harness Uncensored。
- [ ] 统一欢迎、安装中、完成、卸载、窗口标题、安装目录、快捷方式及系统程序列表的产品身份，清楚说明与官方版独立并存。
- [ ] 核对打包后的 package name、注册表身份、更新缓存及卸载清理候选目录；当前 uninstall.nsh 仍读取 DSH_HOME，而非 DSH_UNCENSORED_HOME。不能清理官方版或两版共享的候选目录，也不能误删自定义 DSHU 数据目录。
- [ ] 更新仍写官方版文件名的 installer-packaging.spec.ts 断言；用本轮专用目录/注册表夹具验证安装与卸载，不动用户真实数据。
- [ ] 在浅深色、不同 DPI 下实际打开安装器验收。打包与系统安装按用户后续明确要求操作；此前“只卸载旧版并打开向导，余下我操作”的限制继续适用于系统安装。

两项均在实现中，当前尚未升级内核或替换安装器资产。
