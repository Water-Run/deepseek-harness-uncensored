---
description: "DSHU 发行目标及原官方发布工具停用后的迁移说明。"
---

# DSHU 发布

[English](README.md) | 中文

## 概要

DSHU 使用[自己的 GitHub Releases](https://github.com/Water-Run/deepseek-harness-uncensored/releases)。构建安装包不会上传文件或创建发行标签。DSHU 产品版本与内嵌 DSH 引擎版本独立。

## 分发

使用[打包命令](../packaging/README.zh.md)准备并校验本地产物。每次交付保留源码提交、产品与引擎版本、编译时间、摘要和验证结果。未签名检查包与签名发行包分别记录，修改文件名不代表通过发行验收。

签名包使用本仓库 GitHub 最新发行的资产目录作为更新源。差分下载每次请求一个字节范围。Windows 缺少必要的块映射或缓存安装器时会下载完整签名包。未签名包不包含自动安装更新源。发布发行版和签名安装升级验收不能用本地构建成功替代。

## 已停用的官方工具

COS 传输、EdgeOne 缓存刷新、原保留产物/发布/回滚实现和凭据解密启动器已移除。旧上传、发布、回滚、保留产物及发布预检入口会在读取部署配置或凭据前，以退出码 1 提示迁移至 GitHub Releases。没有新增自动发布发行版的替代命令。

停止调用 `upload-target.ts`、`publish-desktop-ci.ts`、`publish-installed-update.ts`、`rollback-desktop-channel.ts`、`retain-desktop-ci.ts`、`resolve-desktop-publish-ci.ts`、`resolve-retained-desktop-publish-ci.ts`、`archive-desktop-ci.ts`、`publish-desktop-rollout-ci.ts`、`publish-website-ci.ts`、两个 `preflight-desktop-publish*.mjs` 入口及 `upload-with-credentials.ps1`。已有本地安装包和验收记录不会被移除。DSHU 不复用原下载域名、存储桶、云密钥或发布路由文件。

当前仓库没有启用的发行工作流，见 [CI 状态](ci/README.zh.md)。后续发行须明确选择本仓库及已审查的 DSHU 产物。
