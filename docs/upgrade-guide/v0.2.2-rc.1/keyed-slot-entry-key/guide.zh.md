---
kind: upgrade-guide
description: "TypeScript 调用在渲染 keyed 子 Slot 时需要显式传入 entryKey。"
---

# Keyed Slot 渲染选项

[English](guide.md) | 中文

## 变更

客户端 Slot API 的 `PropsRenderSlots` 要求渲染 keyed 子 Slot 的 `renderSlot` 调用传入 `entryKey`，包括使用 `hookContext` 的子 Slot。以前省略键时仍可编译，并会渲染 fallback。传入的键没有已注册条目时，仍渲染 fallback。

## 迁移

1. 找到通过 `renderSlot` 渲染的各个 keyed 子 Slot，将分派键传给 `opts.entryKey`，并保留该键对应的 owner props 和本次渲染的上下文。
2. 调用方尚未选出键时，在该分支直接渲染 fallback。
3. 测试若为两类 Slot 提供自定义 `renderSlot` 实现，请显式标注参数类型。
4. 构建产物后运行 `pnpm run build:check`，核对调用方。
