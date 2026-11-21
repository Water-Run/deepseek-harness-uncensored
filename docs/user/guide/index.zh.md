# 使用 Web UI

[English](index.md) | 中文

请先按照[开发指南](../../development.zh.md#application-commands)中的说明启动 Web UI；命令会打印其访问地址。本指南从服务器已经运行的状态开始。分支特有的模式、旁问、额度控制与默认设置见 [DSHU 使用手册](dshu.md)。全新的 Web UI 尚未选中项目，可添加项目或选择不在工作区工作。

## 配置模型

打开**设置 → 模型**，输入 [DeepSeek API 密钥](https://platform.deepseek.com/)并保存。模型路由会立即可用，不需要重启服务器。

[模型配置指南](./providers.zh.md)介绍其他提供方和自定义 OpenAI 兼容端点。

## 选择工作区

点击**选择工作区**，添加目标项目目录并选中。一般问答可选择**不在工作区工作**；发送消息不要求必须选择项目目录。

## 运行任务

启动一个会话并发送：

> Summarize this repository and identify its main packages.

Agent（智能体）可以读取和编辑工作区文件、运行命令、委派工作并维护计划。如果根据当前权限策略，某项操作需要审批，Web UI 会先询问你。

## 继续使用

- [DSHU 使用手册](./dshu.md)
- [配置模型](./providers.zh.md)
- [使用 Python SDK](./python-sdk.zh.md)
- [在反向代理之后发布 Web UI](./public-deployments.zh.md)
- [卸载 DSH 桌面端](./desktop-uninstall-cleanup.zh.md)
- [使用其他 CLI 模式](../../../apps/cli/README.zh.md)
- [开发插件](../develop/basic/index.zh.md)
