<!-- 英文源文件由 scripts/gen-doc-graphs.ts 生成；本中文文件维护经核对的说明及相同关系数据。 -->

# 文档关系图索引

[English](graph-atlas.md) | 中文

这些图展示生成目录未呈现的关系，可用于查找包依赖、能力边界、事件流、模型工具、应用组合与运行生命周期。精确签名和类型定义仍由[子系统页面](subsystems/core.zh.md)中的类型及 Cordis API 生成区域和[工具目录](tool-catalog.zh.md)持有。

本索引的过程决策保存在[文档关系图说明](../.agents/notes/archived/process/2026-07-03-documentation-graph-atlas.md)。

| 关系图 | 模式 |
| --- | --- |
| [模块依赖图](module-graph.zh.md) | `generated` |
| [工具 schema 目录与包映射](tool-catalog.zh.md) | `generated` |
| [能力边界与核心服务](capability-seams.zh.md) | `hybrid generated` |
| [DSH 共享基础组合](../apps/cli/composition.md) | `hybrid generated` |
| [事件生产方与消费方矩阵](event-producer-consumer.zh.md) | `hybrid generated` |
| [Agent 轮次与步骤生命周期](agent-lifecycle.zh.md) | `curated` |
| [工具执行管线](tool-execution-pipeline.zh.md) | `curated` |

运行 `pnpm run gen-doc-graphs` 重新生成，运行 `pnpm run verify-doc-graphs` 检查新鲜度。

维护模式：混合模式；各链接页面分别声明生成、混合或人工维护方式。
