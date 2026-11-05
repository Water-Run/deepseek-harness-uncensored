# 16.07 依赖声明审计

状态：进行中，不代表整合发行的许可核对已完成。用户的 GPL 许可偏好、上游 Credit 和各组件原有许可保持不变。

## 当前安装包（2026-11-05）

`4cf9f1cbfa` 检查包已从实际安装器解包验收，并安装至系统。清单来自实装 ASAR，共 874 个 npm 包、9 份补充声明、11 个自动标记的待核查项。精确记录位于 `.dsh-build/deliverables/DSHU-20261105-4cf9f1-third-party-runtime.json`，摘要保存在同目录安装清单。此前源码投影中的九项继续保留；当前实包另外标记 `@cfworker/json-schema 4.1.6` 和 `@koromix/koffi-win32-x64 3.3.6`，需要核对对应精确版本的许可原文。不能直接沿用其他版本的补充记录。新包未签名、未发布 Release。

## 已落地

- [x] 从系统安装版 `538f99e405` 的实际 ASAR 核对 759 个 dsh npm 包，保留包名、版本、声明许可证和文件摘要。
- [x] 新增构建步骤 `runtime:notices`，在完整性封装前写入 `dsh/third-party-runtime.json`。文件包含精确版本的 REA 集中声明、独立许可文件及 README 中的授权文字候选；候选存在不等于法律审查通过。
- [x] 对六个缺少独立许可文件的包补入四份上游原文：cfworker 4.1.4、Pi AI/Telemetry 1.3.0、sherpa-onnx Node/Windows 1.13.8、Standard Webhooks 1.1.1。来源与 SHA-256 固定于 `LICENSES/npm/sources.json`；更新版本不会自动沿用旧记录，文件缺失或被修改时准备失败。
- [x] 原文随 `LICENSES` 资源分发，并在准备树中按实际依赖复制到 `dsh/licenses`；没有更改第三方代码或声明其重新授权。
- [x] 六项新增测试覆盖嵌套/作用域包、内部 package.json 排除、精确版本、README 授权文字、未解决项、摘要拒绝和 I/O 错误。

## 前序源码投影中的 9 项

| 包与版本 | 剩余核查 |
| --- | --- |
| @deepseek-ai/libreoffice-kit-win32-x64 0.1.5 | 引擎内部集中许可、组件记录及 MPL 源码获取信息 |
| brotli 1.3.3 | npm 包及固定源提交没有根许可原文，继续核对派生实现与内嵌代码 |
| clean-git-ref 2.0.1 | REA 明确记录的上游原文/署名缺项，保留待核查 |
| dfa 1.2.0 | npm 包及固定源提交没有独立许可原文 |
| fontkit 2.0.4 | 固定源树仅找到测试字体许可，不能当作库本身的许可 |
| frida 17.23.2 | REA 已保留 LGPL 与例外文本，Node 绑定和预构建组件署名仍有缺项 |
| minimisted 2.0.1 | REA 明确记录的上游原文/署名缺项，保留待核查 |
| proxy-agent-negotiate 1.1.0 | 发布包与对应 tag 没有本包许可文件；相邻代理包文件不能未经核准直接替用 |
| tr46 0.0.3 | 核对发布提交的 MIT 原文和 Unicode 映射数据的声明 |

其他平台、Electron 外壳、独立 Node/Python 分发及源码提供义务另行核对；早期 759 项清点不能覆盖这些范围。新清单与补充文件已进入源码构建路径，当前安装状态以本页开头的实包记录为准。

## 证据与恢复

2026-11-03 收尾包 bcbae27d56 包含浏览器提供方后，清点增至 809 个 npm 记录。待核查变为 17 处（16 种包版本）：原 13 项保留，新增 `@puppeteer/browsers@3.2.2`、`tr46@0.0.3`，以及两处 `undici-types@5.26.5`。这些新增项仅列入清单，尚未完成声明对应关系审核；不把构建通过当作许可审核完成。实际清单见该交付包及其回执。

2026-11-04 检查包 f3f7315880 清点为 811 个 npm 记录，当时待核查 17 处、16 种包版本。该包证据为 `DSHU-20261104-f3f731-manifest.json` 和安装包中的 `dsh/third-party-runtime.json`。

2026-11-04 以 `4564b41285` 实际安装包的 811 条记录复算。补入 `@puppeteer/browsers@3.2.2` 与 `undici-types@5.26.5` 的上游原文，来源同时匹配 npm 发布提交和上游标签，固定值见 `LICENSES/npm/sources.json`。两处相同版本的 undici-types 均匹配同一原文。用源码生成器重跑后余 14 处待核查。此次验证的是下一次打包的清单输出，当前安装仍保留原包的清单。结果为 `.dsh-build/runtime-notices-audit-4564b4-20261104.json`。

2026-11-05 的 `rc.1` 准备树仍有 811 条，版本变动使待核查增至 15 处。`@cfworker/json-schema@4.1.5` 的 npm 发布提交与 Git 标签一致，其许可原文与已存副本逐字相同。Inspector 随包新增对应 DSH `rc.1` 原样 MIT 文件，内嵌 DevTools 声明单独保留并通过哈希核对。使用新源码生成器在准备树的独立投影复算，剩余 13 处。证据 `.dsh-build/rc1-notice-projection-20261105.json`。已通过解包验收的 `c4685cedb7` 检查包记录修复前的 15 处。

同日核对三个 AWS SDK 包的 npm 版本和源码清单，均匹配 AWS 发布提交 `258c14447eefd8e028db1a50ab49aac8312c0af9`。使用该提交的根 Apache-2.0 文本，按仓库规则补一个末尾换行。原始文件 SHA-256 为 `edea91454b811f127fbdea3d86f378f6719bd372ed440abf82b232f6fca06c3d`，分发文件摘要见 `LICENSES/npm/sources.json`。[AWS SDK 原文](https://raw.githubusercontent.com/aws/aws-sdk-js-v3/258c14447eefd8e028db1a50ab49aac8312c0af9/LICENSE)

`koffi@3.1.1` 的 npm 发布清单锁定同版本 Windows x64 二进制包，两个归档均通过锁文件的 SHA-512 校验，实际准备树中的 `koffi.node` 与二进制包一致。随二进制条目记录主包的 `LICENSE.txt`、`vendor/node-addon-api/LICENSE.md` 和 `vendor/node-api-headers/LICENSE` 三份原文。独立投影的 811 条记录余 9 处待核查，证据 `.dsh-build/rc1-notice-projection-aws-koffi-20261105.json`。[Koffi 主包归档](https://registry.npmjs.org/koffi/-/koffi-3.1.1.tgz)

实际安装内容的只读投影及结果：`.dsh-build/packaged-notice-projection-PYDZsU`、`.dsh-build/runtime-notices-audit-20261103.json`。原始 npm 元数据、固定提交查询和原文摘要为 `.dsh-build/license-sources-20261103.json`、`license-supplements-20261103/sources.json`。投影只提取清单和声明文件，不是新的可运行安装包。

实现入口：`apps/desktop/scripts/runtime-notices.ts`、`prepare-dsh.ts` 与 `tests/runtime-notices.spec.ts`。当前范围不新增用户设置或运行时检查；源码中的私有测试目录不参与发布。
