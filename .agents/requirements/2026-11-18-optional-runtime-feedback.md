# 可选目标保护运行时反馈

修复已进入 [Windows 18.2](2026-11-18.2-delivery.md)，完成实包和保留数据安装验证。未挂载可选保护配置时，设置页明确提示加载配置后才可编辑规则；默认保护仍关闭，本改动不代替执行校验，也不启用任何保护规则。

## 行为

Connection 将一元 RPC 路由的 HTTP 404 转为 `connection/endpoint-unavailable`，释放响应体，不读取其 HTML 为业务数据。其他 HTTP 失败保持原传输处理。API Gateway 将该通用端点缺失状态映射为已定义的 `gateway/definition-unavailable`，由现有设置与审计界面显示未挂载状态。取消和过期连接检查仍先于结果发布。

模式资料文案改为说明案件仅记录目标与证据，执行规则仅约束已启用保护的工具，并指向实际覆盖范围；不再笼统声称本版本没有执行保护。

## 验证

- 三个受影响测试文件共 171 项通过，覆盖通用 RPC、Gateway 错误分支及目标设置；原 HTTP 503 和调用身份/取消检查继续通过。
- 最新完整构建十项通过，定向 lint、双语说明配对通过。
- 使用正式 `dsh web` 入口、独立数据目录与后台 Edge 验证真实缺失服务路径；显示明确的加载配置说明，旧通用失败不再显示。浅深主题及 1440/390 像素界面通过，无页面脚本错误。没有操作用户桌面，测试服务已停止。

本机证据在 `%USERPROFILE%/DSHU-Deliveries/20261118/`，包括 `optional-endpoint-tests-fixed.log`、`optional-endpoint-build.log`、`optional-endpoint-web-result.json` 和对应主题截图。Windows 已安装 18.2；Linux 新包及完整跨平台验收继续推进。
