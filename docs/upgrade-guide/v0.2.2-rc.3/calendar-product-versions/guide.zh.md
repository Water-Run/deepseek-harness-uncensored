---
kind: upgrade-guide
description: "DSHU 安装包和用户可见版本改用 YYYY.MM.DD.N 日期编号。"
---

# 产品日期版本

[English](guide.md) | 中文

## 变更

DSHU 的界面、安装包名称和 Windows 卸载登记使用 `YYYY.MM.DD.N`。包声明和更新元数据以 `YYYY.MMDD.N` 表示同一可排序版本；DSH 内核版本独立保留。此前 `0.1.0` 安装可以升级到日期版本。

## 迁移

1. 本地使用 `--build-version auto`，或传入 `2026.11.14.2` 等公开日期版本，为 Windows/Linux 指定同一源码构建。清理构建缓存时保留交付文件。
2. CI 的 `build-number` 模式要求为当天每次尝试分配唯一的 `PACKAGE_BUILD_SEQUENCE`；手动模式接受公开日期版本。旧的运行编号/重试后缀只适用于以前的语义产品版本。
3. 保留生成的更新元数据中的内部版本；其中安装包路径使用公开日期格式。安装后核对关于页、CLI 和 Windows 卸载登记均展示预期的公开版本。
