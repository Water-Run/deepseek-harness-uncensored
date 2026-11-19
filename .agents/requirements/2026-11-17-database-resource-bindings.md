# 原生数据库资源关联

状态：PostgreSQL/MySQL 的服务器及数据库关联已完成源码、定向回归和构建模块检查，并随[本地 17.6](2026-11-17.6-delivery.md)打包安装；两平台实际包内模块通过。本次没有创建、上传或发布 Release。本项推进 09.04–09.08、09.11，不代表物理数据文件身份或所有协议已经验收。

## 实现

可选 `databases[].resourceIds` 将绑定关联到多个中央 UUID。数据库资源作用于配置的主机、端口及启动库，服务器资源覆盖该端点的所有数据库。执行时从当前规则修订派生网络别名，保留原选择器及其保护等级，不改写中央持久数据。所有声明引用须在提供方激活时存在，且不能是域名资源；删除引用或修改保护策略后，后续操作按新状态执行。

原生提供方使用独立的 `database` 准入范围。启用且只有路径选择器的生产资源，必须具有关联端点或明确网络别名；未确认时拒绝请求，不能从另一个不带关联的绑定绕过。生产保护仍优先于测试例外。服务器关联不会被缩小为单库，停用资源不会被重新开启，原有网络选择器继续生效。

完全保护在连接及凭据解析前拒绝；只读审计继续使用固定查询、TLS、原始名称及协议身份核验。测试 SQL、表写入、角色、表结构、权限和提交确认仍走原有执行器与开关。默认关联列表为空，进阶保护默认关闭。迁移步骤见[指南](../../docs/upgrade-guide/v0.2.2-rc.3/database-resource-bindings/guide.zh.md)。

## 验证

- Windows 定向 112 项通过；Linux 扩大 120 项通过，包含已有 SSH 中央映射的实际 helper 回归。
- 三个 keyless 场景通过：`postgres-target-protection`、`postgres-shared-write-protection` 和 `mysql-test-write-protection`。原始 Session JSONL、提示词、工具 schema 及 writer 预期未修改。
- PostgreSQL 使用实际 TLS 和协议驱动连接受控端点，核对只读目录、生产优先、测试写入及提交确认。MySQL 核对完全保护、未知关联和测试握手取消；保护拒绝后监听计数为零。
- 构建后的两个原生提供方均拒绝映射的完整保护资源，未关联绑定以身份未确认拒绝；实际监听计数为零。该检查使用生成的库，不是源码替身。
- 完整构建 10 项、398 个 NodeNext 声明 API、导出 JSDoc、升级指南和未知类型断言检查通过。公开 API 目录已重生成；全仓 lint 检出的四处行长问题已修复，两份修订文件补验通过。
- 所属目录生成器 10 项、2 项文档测试、两组双语配对及 2,358 份文档的链接检查通过。
- 故障对照将派生策略中的完全保护错误降为审计，服务器保护用例检出错误允许；源码随后逐字节恢复并核对 SHA-256。首个对照被既有选择器校验提前拒绝，未将其作为越权检测证据。

首批检查使用受控协议端点，不能据此推定数据库引擎落盘。后续已由 Linux 17.6 实包完成 PostgreSQL 16.15 和 MySQL 8.0.46 的实际引擎验证：增删改独立回读、超限保护、服务器审计及存储重开均通过，见[实际引擎记录](2026-11-17-native-database-engines.md)。这些是自建实例，没有连接用户或生产数据库；实体服务器和通用物理身份仍未验收。

材料在 `%USERPROFILE%/DSHU-Deliveries/20261117/`，前缀 `database-resources-`，主要为 `native-scope.log`、`linux-final.log`、`snapshots-final.log`、`build.log`、`built-smoke.log`、`declarations.log`、`contracts.log`、`lint-corrected.log`、`negative-policy.log` 与 `negative-policy-restored.json`。

## Windows 录制兼容复验

当前 Windows 源码 `5e78ec0755` 在会话取消修复后重新通过 `postgres-target-protection`、`postgres-shared-write-protection`、`mysql-test-write-protection` 三条既有回放。普通回放核对会话输出、工具声明和完整工作区结果。使用隔离夹具，保留原录制和 writer 预期。会话关闭时的取消由[定向测试](2026-10-26-target-protection.md#audit-and-execution)单独覆盖。Windows 回执为 `%USERPROFILE%/DSHU-Deliveries/20261119/windows-network-database-session-replay.log`，新版实装验收仍待完成。

## 只读审计的规则修订（2026-11-19）

PostgreSQL 和 MySQL 的只读审计在连接前持有已核验的规则修订。规则服务保存新版本前会取消在途连接并等待清理，其他规则库连接在租约期间写入会收到忙状态。PostgreSQL TLS 夹具验证清理期间收到撤销时丢弃尚未交付的结果。MySQL 握手夹具验证保存后连接已关闭。69 项定向测试和 PostgreSQL 录制回放通过，证据为 `%USERPROFILE%/DSHU-Deliveries/20261118/database-audit-rule-retention-verified.log` 与 `database-audit-rule-retention-replay.log`。本轮使用隔离协议夹具，修复待下次打包。

## 后续

原生绑定与实际远端物理数据文件的对应关系、更多协议、实体服务器、独立 Worker 和入站验收继续保留在 [TODO](../TODO.md)。本项没有改变 Session、SQLite 或 SDK 事件字段，也没有自动修改所有者的已有规则或配置。
