# 17.06 稳定性检查

状态：进行中。本页修复已随源码 `7db7e35015`、检查版 `0.1.0-test.20261106.1` 安装，实际载荷及实装隔离运行验证通过。安装证据见 [HANDOFF](../HANDOFF.md)，保留全部原始交付范围。

## 已完成

- [x] **hygiene**：完整初查 23 项，17 项通过、6 项失败。下表六项修复后分别通过；其余检查没有相关依赖或入口变更，不重复运行。完整初查日志 `.dsh-build/hygiene-baseline-20261106.log`，修复后日志 `.dsh-build/hygiene-fixed-*-20261106.log`。
- [x] **地区数据路由**：下载继承 Host 当前传输与代理策略，不再另建或销毁代理。真实 undici 测试覆盖当月 404 后的上月请求，以及下载后传输仍可用。编译公开提供方另验证更新缓存及校验结果：`.dsh-build/hygiene-country-built-20261106-result.json`。没有访问真实下载端点或修改用户地区数据。
- [x] **定向回归**：六个测试文件共 532 项分批通过，日志 `.dsh-build/hygiene-isolation-rescope-20261106.log` 与 `.dsh-build/hygiene-country-payload-final-20261106.log`。
- [x] **编译**：`build:artifacts` 八项、随后 `build:check` 两项通过，日志前缀 `.dsh-build/hygiene-`。

| 检查 | 修复与验证 |
| --- | --- |
| `rescope-vendor:check` | 使用 vendor 现有 V17 标识；保留工具目录中的 `cordis` 预设 ID，仅重命名真实包引用。vendor 内容未修改。同步现有四模式与 Markdown 变换测试。 |
| `constraints` | 保留 CLI 发布包中的显式目标保护示例；拒绝遗漏或混入其他配置。目标保护文件列表按既有规则排序，发布文件集合未减少。 |
| `verify-default-product-isolation` | 保留 README 已要求的三个浏览器提供方及公共运行时随包分发。仅 Desktop Host 的明确依赖边和四个固定包可作为未启用载荷；依赖图继续检查。默认源码导入、默认配置、别名、其他消费者和额外实验依赖仍被拒绝。 |
| `verify-product-use` | 删除过时的目标保护包级 optional 声明。默认界面引用其代码不等于装配执行后端，后端仍需明确启用。 |
| `verify-no-bare-dispatcher` | 地区数据下载不覆盖 Host 的统一路由。 |
| `verify-no-unknown-casts` | 删除上一节点已移除断言的陈旧基线；剩 1,277 项，没有新增允许项。 |

## 领域依赖图与后续验收

- [x] **客户端领域依赖图**：初查报告 85 处，已在[客户端层验收](2026-11-06-client-layers.md)分类修正并通过。原始输出 `.dsh-build/hygiene-client-domain-20261106.log`，按包统计 `.dsh-build/hygiene-client-domain-20261106-summary.json`。本轮已区分共享 API、实际实现依赖、图片误分类和重复计数；原报告不是 85 个运行故障。

| 界面包 | 初查数量 |
| --- | ---: |
| `ui-chat` | 1 |
| `ui-conversation` | 3 |
| `ui-settings-account` | 15 |
| `ui-sidebar-browser` | 19 |
| `ui-sidebar-documentpreview` | 41 |
| `ui-tool` | 1 |
| `ui-workspace` | 5 |

- [ ] **其他验收**：关闭竞态、历史回放、跨平台、原始截图和完整编号终验继续保留；本轮检查不能证明这些项目完成。
