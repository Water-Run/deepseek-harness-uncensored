# 16.07 依赖声明审计

状态：进行中，不代表整合发行的许可核对已完成。用户的 GPL 许可偏好、上游 Credit 和各组件原有许可保持不变。

## 已落地

- [x] 从系统安装版 `538f99e405` 的实际 ASAR 核对 759 个 dsh npm 包，保留包名、版本、声明许可证和文件摘要。
- [x] 新增构建步骤 `runtime:notices`，在完整性封装前写入 `dsh/third-party-runtime.json`。文件包含精确版本的 REA 集中声明、独立许可文件及 README 中的授权文字候选；候选存在不等于法律审查通过。
- [x] 对六个缺少独立许可文件的包补入四份上游原文：cfworker 4.1.4、Pi AI/Telemetry 1.3.0、sherpa-onnx Node/Windows 1.13.8、Standard Webhooks 1.1.1。来源与 SHA-256 固定于 `LICENSES/npm/sources.json`；更新版本不会自动沿用旧记录，文件缺失或被修改时准备失败。
- [x] 原文随 `LICENSES` 资源分发，并在准备树中按实际依赖复制到 `dsh/licenses`；没有更改第三方代码或声明其重新授权。
- [x] 六项新增测试覆盖嵌套/作用域包、内部 package.json 排除、精确版本、README 授权文字、未解决项、摘要拒绝和 I/O 错误。

## 仍需核查的 13 项

| 包与版本 | 剩余核查 |
| --- | --- |
| @aws-sdk/credential-provider-http 3.972.82 | 本包无独立许可文件；核对同仓声明适用范围及分发记录 |
| @aws-sdk/credential-provider-login 3.972.87 | 同上 |
| @aws-sdk/nested-clients 3.997.54 | 同上 |
| @deepseek-ai/dsh-experimental-inspector 0.2.2-alpha.2 | 项目 MIT 声明和内嵌 DevTools 声明分别确认；不能互相替代 |
| @deepseek-ai/libreoffice-kit-win32-x64 0.1.5 | 引擎内部集中许可、组件记录及 MPL 源码获取信息 |
| @koromix/koffi-win32-x64 3.1.1 | 与主 Koffi 包许可文本、预构建组件的对应关系 |
| brotli 1.3.3 | npm 包及固定源提交没有根许可原文，继续核对派生实现与内嵌代码 |
| clean-git-ref 2.0.1 | REA 明确记录的上游原文/署名缺项，保留待核查 |
| dfa 1.2.0 | npm 包及固定源提交没有独立许可原文 |
| fontkit 2.0.4 | 固定源树仅找到测试字体许可，不能当作库本身的许可 |
| frida 17.23.2 | REA 已保留 LGPL 与例外文本，Node 绑定和预构建组件署名仍有缺项 |
| minimisted 2.0.1 | REA 明确记录的上游原文/署名缺项，保留待核查 |
| proxy-agent-negotiate 1.1.0 | 发布包与对应 tag 没有本包许可文件；相邻代理包文件不能未经核准直接替用 |

其他平台、Electron 外壳、独立 Node/Python 分发及源码提供义务另行核对；上述 759 项清点不能覆盖这些范围。新清单与补充文件已进入源码构建路径，当前系统安装仍为 `538f99e405`，未为此次纯声明变更重复卸载安装。

## 证据与恢复

实际安装内容的只读投影及结果：`.dsh-build/packaged-notice-projection-PYDZsU`、`.dsh-build/runtime-notices-audit-20261103.json`。原始 npm 元数据、固定提交查询和原文摘要为 `.dsh-build/license-sources-20261103.json`、`license-supplements-20261103/sources.json`。投影只提取清单和声明文件，不是新的可运行安装包。

实现入口：`apps/desktop/scripts/runtime-notices.ts`、`prepare-dsh.ts` 与 `tests/runtime-notices.spec.ts`。当前范围不新增用户设置或运行时检查；源码中的私有测试目录不参与发布。
