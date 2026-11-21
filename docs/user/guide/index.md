# Use the Web UI

English | [中文](index.zh.md)

Start the Web UI through the [development guide](../../development.md#application-commands); the command prints its URL. This guide begins after that server is running. For the fork's modes, side conversations, spending controls, and defaults, use the [DSHU user guide](dshu.md). A fresh Web UI has no selected project; you can add one or choose to work without a workspace.

## Configure a model

Open **Settings → Models**, enter a [DeepSeek API key](https://platform.deepseek.com/), and save it. The model route becomes usable immediately without restarting the server.

The [model configuration guide](./providers.md) covers other providers and custom OpenAI-compatible endpoints.

## Choose a workspace

Click **Choose workspace**, add the intended project directory, and select it. For general questions, choose **Work without a workspace**; a project directory is not required to send a message.

## Run a task

Start a session and send:

> Summarize this repository and identify its main packages.

The agent can read and edit workspace files, run commands, delegate work, and maintain a plan. The Web UI asks before operations that require approval under the active permission policy.

## Continue

- [DSHU user guide](./dshu.md)
- [Configure models](./providers.md)
- [Use the Python SDK](./python-sdk.md)
- [Publish the Web UI behind a reverse proxy](./public-deployments.md)
- [Uninstall DSH Desktop](./desktop-uninstall-cleanup.md)
- [Use other CLI modes](../../../apps/cli/README.md)
- [Develop a plugin](../develop/basic/index.md)
