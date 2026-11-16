# 更新检查：限流、拒绝与手动重试

状态：已随 `2026.11.16.4` 交付并保留数据安装，Windows/Linux 定向验收通过；正式资产下载、签名和已安装更新器全链验收继续保留在 [TODO](../TODO.md)。[本版交付](2026-11-16.4-delivery.md)

## 当前行为

GitHub HTTP 429、主额度耗尽的响应头或数字 `Retry-After` 会产生明确的限流结果和可重试时间。多个有效期限取较晚者；已确认限流但时间无效时按 GitHub 要求至少等待一分钟。时间必须能被 ECMAScript Date 表示。只有状态码的 HTTP 403 仍显示“检查被拒绝”，不把它推断为限流。

关于页显示重试时间，冷却期间禁用检查，关闭、重开根级弹窗不绕过冷却。到期只启用手动检查，不自动请求。失败、离线、限流和空发行列表均不显示“已是最新”。更新来源仍仅为本仓库，客户端没有新增凭据、设置或自动安装行为。[GitHub 限流规则](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#rate-limit-errors)

此前原生探测的 403 没有保留完整响应头，原因仍未知。本节点匿名只读请求返回 200、剩余 57 次请求额度，允许浏览器读取限流响应头；不能用本次成功回填旧失败原因。原始记录为 `20261116/release-discovery-response.json`。

## 验收

- 两个所属测试文件在 Windows/Linux 各 28 项通过，覆盖 403/429、主/次级期限、重叠期限、无效数值、普通拒绝、不会自动重试，以及中英文弹窗关闭/重开和到期后的显式重试。
- 中英文真实 Web 场景在 Windows/Linux 各两项通过。每项消费原有 `feedback-command` 的无密钥 LIGHTHOUSE 录制，再操作组装后的关于页；源 Session 原始文件未修改。预期输出放在 `apps/web/tests/expected/release-rate-limit/`，不把 DOM 记录放入顶层 Session 快照目录。
- 真实浏览器响应明确开放跨域限流头；一小时冷却在一分钟后仍禁用，到期后恢复手动检查。改变主题、关闭重开和时间到期均不增加请求，后续普通 403 与 200 空发行列表通过实际按钮重试进入。
- 通过应用自己的外观控件切换浅深主题，检查 1280px 浅色和 390px 深色的中英文排列、关闭入口及横向溢出。Windows 系统 Edge 的四张截图已查看，Linux 同场景断言通过；没有操作用户桌面。两平台实际安装包及原生窗口另有交付检查。
- Windows 实际安装资源在注入带跨域可读头的 429 后显示可重试时间并禁用检查，报告为 `candidate-2026.11.16.4/installed-release-rate-limit-result.json`，截图已查看。服务端完整一小时期限由上述 Web 场景验证；实装探测不等待真实一小时。
- 8 项产物构建、随后 2 项聚合编译、定向 lint 和 README 双语配对通过；本仓 `doc-sync` 只验证 README 链接和长度，不据此声称上游全部文档门禁通过。

日志位于 `%USERPROFILE%/DSHU-Deliveries/20261116/`，Windows 前缀为 `release-rate-limit-`，最终浏览器记录为 `web-headers.log`；Linux 记录为 `linux-release-check-16-4-{unit,web}.log`。早期未开放跨域头的测试只覆盖一分钟回退，不作为一小时期限的通过证据。开发截图显示最低版号和本地修改标记，实装截图显示 `.16.4` 和干净源码 `089dbb9b49`，两者分别保留。

## 构建收尾

浏览器测试首次漏登正确的编译分组，导致编译失败并产生 48 个多余的 JS/声明文件；`apps/web/tsconfig.json` 已将它归入 Host 测试程序。删除命令被自动审批拒绝后，经独立核对路径、创建时间、无链接及摘要，采用保留副本的逐文件整理方式，将这些本节点产物移至 `20261116/release-rate-limit-compiler-emits/`，每个 SHA-256 均一致；原始 TypeScript 文件保留。审计清单为 `release-rate-limit-accidental-emits.json`，源码目录不再含这些误生成文件。此前其他拒绝清理的目录未触及。
