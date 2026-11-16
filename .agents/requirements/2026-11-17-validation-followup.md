# 完整检查的后续整理

完整 lint 检查发现两个已有 Worker SQLite 测试文件的九处写法问题：读取未绑定的 `node:path.posix` 方法，以及在断言回调中隐式返回 `void`。测试改为显式调用方法和带语句块的回调，不修改运行时行为或断言条件。两个所属文件共 12 项通过。

全仓 Markdown 链接检查仍报告 30 处已有断链，涉及 13 份未在 SSH 关闭确认变更中修改的文档，包含已移除的文档站、工作流及历史路径。与 `e60188f0c5` 核对，这些来源均未变化，三种代表性目标在该提交中已不存在。不能把定向链接通过报告成全仓通过，也不为消除报错修改冻结的旧升级指南。

SSH 本轮修改的九份 Markdown 使用原校验器检查，相对链接及锚点均通过。材料在 `%USERPROFILE%/DSHU-Deliveries/20261116/`：`ssh-close-adjacent-worker.log`、`ssh-close-full-lint.log`、`ssh-close-full-lint-final.log`、`ssh-close-md-links.log` 与 `ssh-close-scoped-links.{mts,log}`。文档断链继续列为文档整理事项，不降低校验规则。
