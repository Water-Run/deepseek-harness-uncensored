# DeepSeek Harness Uncensored

Uncensored 是这个仓库的唯一产品形态：它不是一个装在官方 DSH 之上的补丁工具，而是把破甲能力做进了源码本身，与官方 DSH 平行存在、互不干扰。

## 与官方 DSH 的共存边界

| 项 | 官方 DSH | 本仓库 |
|---|---|---|
| 产品名 | DeepSeek Harness | DeepSeek Harness Uncensored |
| 用户数据目录 | `~/.dsh` | `~/.dsh-uncensored` |
| CLI | `dsh` | `dsh-uncensored` |
| `dsh web` 默认端口 | `3080` | `3099` |
| OS 深链 | `dsh://` | `dshu://` |
| 桌面 appId | 由 `DSH_DESKTOP_APP_ID` 决定 | `com.deepseek.dsh.uncensored`（打包时设置） |
| 图标 | 白底黑鲸 | 黑底白鲸 |

用户数据目录不同，因此两套安装的会话、凭据、profile 完全隔离；`DSH_HOME` 环境变量仍然可以显式覆盖。

## 内置而非注入

`dsh-purge` 通过改写已构建的 `lib/*.js` 与注入 `prompt-inject.md` 生效；本仓库把同样的效果落到源码层：

- **破甲提示词**：`@deepseek-ai/dsh-uncensored-armor` 把提示词注册成普通的 system prompt section（`uncensored:armor`，order 取 `HARNESS_IDENTITY` 之前），随会话写入日志、可重放、可压缩。语言由 `DSH_UNCENSORED_ARMOR=zh|en|none` 决定，默认 `zh`。
- **身份剥离**：`system-prompt.includeHarnessIdentity` 在各 bundle 里默认 `false`，不再出现 "You are an AI agent powered by DeepSeek Harness."。
- **完全权限**：`sandbox-policy.mode` 默认 `danger-full-access`，`user-approval.policy` 在完全权限下为 `never`。
- **去掉摩擦项**：`repeat-tool-reminder` 与 `tool-result-pruner` 默认关闭，工具结果原样进上下文。

这些默认值都在 `packages/bundle/*/cordis.patch.yml` 里，改一处即改全产品形态，无需再跑安装器。

## 界面

- 顶栏字标在 HARNESS 徽标右侧多一个黄底 UNCENSORED 标记，标识当前构建形态。
- 桌面/网页图标为黑底白鲸。

## 已知的未完成项

计划中的下一批（见 issue 与后续提交）：工作区"不在工作区工作"、余额并排与曲线统计、中国大陆域名保护、模式三选一（缺省/写作/网安）、更新改走 GitHub Release、关于页版本/仓库/协议、系统动画补全。
