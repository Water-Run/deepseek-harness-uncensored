---
kind: upgrade-guide
description: "Slot 渲染调用需要匹配目标的参数，渲染 keyed 子 Slot 时需要显式传入分派键。"
---

# Slot 渲染参数

[English](guide.md) | 中文

## 变更

客户端 Slot API 的 `PropsRenderSlots` 要求渲染 keyed 子 Slot 的 `renderSlot` 调用传入 `entryKey`，包括使用 `hookContext` 的子 Slot。以前省略键时仍可编译，并会渲染 fallback。传入的键没有已注册条目时，仍渲染 fallback。

Slot 名称或分派键独立于其他参数变化时，调用必须提供适用于每个可能目标的参数。对声明了按键参数表的 Slot，`KeyedRenderSlotArgs` 元组联合的每个分支都将键与对应参数放在一起。`renderSlotChain` 的 owner props 必须满足每个可能的 Slot。

## 迁移

1. 找到通过 `renderSlot` 渲染的各个 keyed 子 Slot，将分派键传给 `opts.entryKey`，并保留该键对应的 owner props 和本次渲染的上下文。
2. Slot 名称或分派键独立变化时，提供适用于每个候选的参数，或先缩窄名称或分派键再渲染。
3. Keyed Slot 的键与参数一同选定时，构造 `KeyedRenderSlotArgs` 元组并调用 `renderSlot(...args)`。
4. 调用方尚未选出键时，在该分支直接渲染 fallback。
5. 测试若为两类 Slot 提供自定义 `renderSlot` 实现，请显式标注参数类型。
6. 构建产物后运行 `pnpm run build:check`，核对调用方。
