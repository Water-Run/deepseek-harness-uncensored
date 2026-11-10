---
description: "本地安装升级验收涉及的发布范围。"
---

# 安装升级的发布状态

[English](README.md) | 中文

## 本地证据

[安装升级验收](../README.zh.md)记录本地包与安装器的观测结果。验收回执不代表获准上传二进制文件、修改公开更新源或替换发行版。

## 发布

原 COS 测试发布器及 `publish-installed-update.ts` 操作流程已移除。保留入口会以退出码 1 提示迁移，传入 `--execute` 也不会上传文件、修改更新源或解密凭据。

保留已有本地产物和报告。每个新验收批次固定独立的 DSHU GitHub 发行标签及 `nightly.yml` 资产 URL。同版本和升级场景使用不同的预发布。`files` 命令生成供审阅的本地证据。发布任一预发布均须按 [DSHU 发布说明](../../../publishing/README.zh.md)另行授权。真实 GitHub 下载与签名安装升级需分别验收。
