---
kind: package-library
description: "解析日期产品版本，并转换为可排序的包管理器版本。"
---

# 产品日期版本

[English](README.md) | 中文

## 概述

DSHU 展示 `YYYY.MM.DD.N`，最后一项是当天构建序号，每天的第一个构建从 `0` 开始，`2026.11.14.10` 晚于 `2026.11.14.9`。更新器和包声明使用 `YYYY.MMDD.N`，由现有 SemVer 引擎按数字比较日期和序号。Windows 文件资源和产品界面使用四段日期。

## 使用方式

`parseCalendarVersion()` 校验两种表示，返回日期、序号及格式化结果。年份为 2000 至 9999，日期必须真实有效，序号为 0 至 65535，以兼容 Windows 版本字段。`calendarBuildVersion()` 接受明确的 `YYYYMMDD` 日期和序号；这些函数不读取时钟或分配构建号。

`displayProductVersion()` 和 `runtimeProductVersion()` 保留旧格式字符串；接受旧版本的调用方仍使用原有解析器校验。打包脚本可在构建产物生成前导入 `@deepseek-ai/dsh-product-version/bootstrap`；运行时消费者使用包入口。

## 开发说明

日期映射保持同日修订、跨月和跨年的比较顺序。测试覆盖闰日、非法字段、旧版本与升级排序。DSH 内核和 REA 保留各自的上游版本。
