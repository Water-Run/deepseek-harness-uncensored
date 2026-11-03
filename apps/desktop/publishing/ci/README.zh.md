---
description: "DSHU 当前的 CI 发布状态。"
---

# DSHU 发行自动化

[English](README.md) | 中文

## 状态

当前工作区没有启用的 GitHub Actions 发行工作流。[打包入口](../../packaging/README.zh.md)仍可在本地构建，不会发布产物。

原机器选择、保留构建批次存储、云发布和渠道回滚已停用。保留的旧命令文件只提示迁移目标并返回非零状态，包含 `--check`、`--publish` 和 `--execute` 调用。它们不读取 GitHub 作业记录、机器发布配置或上传凭据。

## 发行准备

本地验证与发布分别进行。保留完成的产物清单和摘要，核对产品身份与源码提交后，再为 [DSHU 仓库](https://github.com/Water-Run/deepseek-harness-uncensored/releases)选择资产。签名、真实下载/安装验收及后续发布工作流仍是单独的交付工作。

不通过恢复原 COS 作业获得发行自动化。[发布说明](../README.zh.md)维护当前分发目标和迁移要求。
