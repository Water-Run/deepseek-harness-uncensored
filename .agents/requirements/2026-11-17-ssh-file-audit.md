# SSH 文件请求审计与结果确认

状态：请求结果、拒绝、会话归属及未交付游标清理已随 17.3 分发，当前 17.5 Windows 实装和 Linux 归档均包含这些实现。定向执行证据见下文，实际包内清单与恢复入口见[当前交付](2026-11-17.5-delivery.md)。本项推进 05.06、09.09–09.11、10.05，完整保护审计仍按末节范围跟进。

## 已实现

受保护 SSH 在已有连接准入之外，记录文件请求的已校验结果及实际拒绝。记录复用 `target/admission`，包含效应、修订、允许/拒绝/错误/取消，以及原发起会话。身份由经核验的 SSH 端点、主机密钥及请求路径生成带密钥指纹，不保存路径明文和文件内容；连接层的匹配规则记录保持原样。

流式读取保留打开时的文件身份。游标耗尽、关闭或读取失败时撤下索引；若结果无法交付，则关闭已分配的 helper 游标。上下文切换不改变原有会话归属，替换同 ID 会话也不会收到旧请求的结果。提供方撤下时，审计存储等待请求和清理结束后才关闭。

连接准入记录失败时不进行文件效果。远端请求已经返回、但最终审计确认失败时，抛出 `TargetAuditError/TARGET_AUDIT_UNCONFIRMED`，保留原因并要求先核验文件再重试；实际效果不会被报告为回滚。后续请求以 `TARGET_AUDIT_UNAVAILABLE` 在分派前停止。退出、取消、读取和移动的普通失败保留原始身份，不据错误推断零副作用。

没有增加 helper 协议字段、Session 事件类型或持久化字段，也未改变默认配置。使用方式与限制见[保护包说明](../../packages/guard/target-protection/README.zh.md)，升级处理见[恢复指南](../../docs/upgrade-guide/v0.2.2-rc.3/ssh-file-audit/guide.zh.md)。

## 验证

- Windows 85 项通过，6 项实际 Linux helper 场景按平台跳过。Linux 扩大回归 338 项通过、2 项条件跳过；两个独立进程并发各 80 项通过。
- 新增 5 项审计用例及 2 项流清理场景，使用私有目录、随机监听端口和自己的凭据。SQLite 故障通过另一个真实连接持有写锁触发，分别证明准入前零效果，以及写入后审计失败时文件确已改变。没有用固定睡眠判断完成。
- 两项负对照分别跳过最终审计和游标清理，检出错误返回成功及未释放资源；候选均逐字节恢复并核对摘要。日志为 `negative-{outcome,stream}.log`，恢复回执为 `negative-restored.json`。
- Linux keyless `ssh-target-protection` 重放通过；所属场景除审计拒绝外，还在实际文件写入后锁住 SQLite，核验未确认错误及真实文件结果。原始 Session JSONL、提示词、工具 schema 和 writer 预期不变。
- 最新产物构建 8 项、其后聚合编译 2 项、全仓 lint、导出 JSDoc 和 398 个 NodeNext 声明 API 通过。实际构建模块可导入 `TargetAuditError`，代码、名称和原因保留。公开 API 目录已重生成；恢复指南、README 同步、两组中英文配对及文档预算检查通过。

材料在 `%USERPROFILE%/DSHU-Deliveries/20261117/`，统一前缀 `ssh-file-audit-`。`linux-final.log` 为扩大回归，`concurrent-{1,2}.log` 为并发，`snapshot-final.log` 为最终 Session 重放，`storage.log` 为 SQLite 故障检查，`built-smoke.log` 为实际模块检查。首次 lint 的测试类型与未绑定方法问题已修复，失败日志保留；没有降低门槛。

打包前补验清理失败：helper 拒绝关闭未交付游标时，仍报告 `TargetAuditError/TARGET_AUDIT_UNCONFIRMED`，同时保留原审计错误及清理错误，不谎报游标已释放。完整 helper 关闭后再核对资源清空。该组 Windows/Linux 各 3 项通过，其后两项聚合编译通过；材料前缀为 `ssh-audit-cleanup-recovery-`。本次仅补充验收，运行时代码不变。

## 保留的缺口

17.5 安装包的文件记录关联请求身份，尚不证明 helper 实际匹配的中央资源 UUID，`ruleIds` 保持为空。后续源码已接通实际匹配回执，并完成 inode 别名、静态规则重叠及并发归属验证，见[资源回执](2026-11-17-ssh-resource-receipts.md)；该增强尚未进入新安装包。远端数据库映射、独立 Worker、入站、其他协议和实体部署继续按 [TODO](../TODO.md) 推进。两处冻结指南断链已按用户授权仅修 URL，并核对双语记录，原迁移步骤保留。
