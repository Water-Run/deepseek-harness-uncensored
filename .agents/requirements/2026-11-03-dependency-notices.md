# 16.07 依赖声明审计

状态：进行中，不代表整合发行的许可核对已完成。用户的 GPL 许可偏好、上游 Credit 和各组件原有许可保持不变。

## 当前安装包（2026-11-06）

`7db7e35015` 检查包已从实际安装器解包验收，并安装至系统。清单来自实装 ASAR，共 874 个 npm 包、14 份补充声明、10 个自动标记的待核查项。精确记录位于 `.dsh-build/deliverables/DSHU-20261106-7db7e3-third-party-runtime.json`，摘要保存在同目录安装清单。该安装包未签名、未发布 Release。

与前次 `09ad1610d3` 包相比，三个 AWS 包解析到了新版本：credential-provider-http `3.972.82 → 3.972.83`、credential-provider-login `3.972.87 → 3.972.88`、nested-clients `3.997.54 → 3.998.0`。原安装包的十项记录保留；下述源码补充不改写原 ASAR 或交付清单。

## 源码补充与锁定依赖（2026-11-06）

六个精确 AWS 版本已核对 npm 归档的 SHA-512、发布 manifest 和对应源码 manifest。工作区锁定的 http 3.972.74、login 3.972.79、nested 3.997.46 对应发布提交 `c68e50e4a6e0469a20c2894fe8a29c140553ebb8`；当前安装包的三个新版本对应 `80cb7896f530f5d7cb33b3c5abbdae1212dbd768`。依赖字段仅展开发布时的 `workspace:` 前缀后比较。nested-clients 的源码实际位于 `packages-internal/nested-clients`，其发布 manifest 仍写旧目录，未据旧目录的 404 放弃对应关系核对。

两处固定提交的根 Apache-2.0 原文均与已保存文本逐字一致，只保留原有的末尾换行处理；新增精确版本记录，不放宽为版本范围。[工作区版本原文](https://raw.githubusercontent.com/aws/aws-sdk-js-v3/c68e50e4a6e0469a20c2894fe8a29c140553ebb8/LICENSE)、[安装包版本原文](https://raw.githubusercontent.com/aws/aws-sdk-js-v3/80cb7896f530f5d7cb33b3c5abbdae1212dbd768/LICENSE)。核对回执 `.dsh-build/aws-lock-licenses-20261106-result.json`。

原安装包 874 项和新准备树 859 项分别建立只读投影，均仅有上述三个 AWS 标记由待核查变为已补充，剩余七项不变。原包、原准备树及用户数据未改写，临时投影已清理；回执 `.dsh-build/aws-lock-notice-projection-20261106-result.json`。准备树的包名集合与原包相同，版本与重复实例数变化不能据总数推断功能减少。新的锁定流程及实际构建验收见[运行时锁定记录](2026-11-06-runtime-lock.md)。源码补充尚需随新的完整安装包交付，不能把投影当作新安装包或最终许可兼容性结论。

## 补充声明与复算（2026-11-06）

先在 `4cf9f1cbfa` 实装 ASAR 的只读投影上复算，874 个包的待核查项从 11 项降至 7 项；原包、原 ASAR 和用户数据未被改写。投影保留实际包清单和逐一校验摘要的声明文件，回执 `.dsh-build/notice-projection-4cf9f1-20261106-final-result.json`。补充与清点修复已进入 `09ad1610d3` 检查包，该实包结果同为七项；最新包保留这些修复，另外记录上述版本变化。投影本身不是可运行安装。

- [x] `@cfworker/json-schema 4.1.6`：npm 发布提交与同名 Git 标签均为 `1a0aa37471850c28a4673e12e871e010ea6c26e0`；该提交的 MIT 原文与已保存文本逐字相同，新增精确版本对应。[固定原文](https://raw.githubusercontent.com/cfworker/cfworker/1a0aa37471850c28a4673e12e871e010ea6c26e0/LICENSE.md)
- [x] `@koromix/koffi-win32-x64 3.3.6`：主包与二进制包通过 npm SHA-512 校验；主包明确依赖同版本二进制。实装二进制与该归档逐字相同。补入主包 MIT、Node addon API 和 Node API headers 三份原文，摘要固定于 `LICENSES/npm/sources.json`。证据 `.dsh-build/license-supplements-20261105-result.json`。[版本归档](https://registry.npmjs.org/koffi/-/koffi-3.3.6.tgz)
- [x] Windows Office 引擎 `0.1.5`：五份许可/声明已经随包分发，清点器此前漏读嵌套目录。现记录三份 `licenses/` 文件及 `program/NOTICE`、`program/license.txt`；缺少或空白的预期文件仍待核查，不能用另一份根许可证代替。实包声明的 90 份源码、构建与修改材料均存在；上游核心修订 `bce0998afefdbc355585ca324285661a2170ba77` 可读取，版本为 `26.8.0.3`。其他平台和最终兼容性另行核对。证据 `.dsh-build/office-source-identity-20261105.log`。[核心源码](https://github.com/LibreOffice/core/tree/bce0998afefdbc355585ca324285661a2170ba77)
- [x] `tr46 0.0.3`：发布提交 `a8009f9ce80ff5dbe71dd71e203afe4e4c878d28` 的直接后继 `3a6f29721e7063b9ffd421e461a54beae6170001` 只增加 MIT 文件，代码和版本均未变。发布包中的 8,179 条映射与 Unicode 8.0.0 原始数据按上游算法转换后的结果逐条一致；7.0 和 6.3 不匹配。补入 MIT 原文、Unicode 数据许可及明示 JSON 转换说明。许可段从 Unicode 官方 ICU 56.1 固定提交的 HTML 提取为纯文本，移除行尾空格，保留原文文字。证据 `.dsh-build/tr46-notice-20261106-result.json`、`.dsh-build/tr46-data-20261106-result.json`。[MIT 提交](https://github.com/jsdom/tr46/commit/3a6f29721e7063b9ffd421e461a54beae6170001)、[Unicode 原始数据](https://www.unicode.org/Public/idna/8.0.0/IdnaMappingTable.txt)、[数据许可原文](https://raw.githubusercontent.com/unicode-org/icu/24c90c0693a0ba7aea00986c34676b55f766cfac/icu4c/license.html)

11 项定向回归通过，包括版本不匹配、声明不完整、空白文件、I/O 失败与补充文件摘要变动。缺少上游正文或有其他已记录缺项的包继续保留待核查标记；不以清点器通过替代许可兼容性结论。

## 已落地

- [x] 从系统安装版 `538f99e405` 的实际 ASAR 核对 759 个 dsh npm 包，保留包名、版本、声明许可证和文件摘要。
- [x] 新增构建步骤 `runtime:notices`，在完整性封装前写入 `dsh/third-party-runtime.json`。文件包含精确版本的 REA 集中声明、独立许可文件及 README 中的授权文字候选；候选存在不等于法律审查通过。
- [x] 对六个缺少独立许可文件的包补入四份上游原文：cfworker 4.1.4、Pi AI/Telemetry 1.3.0、sherpa-onnx Node/Windows 1.13.8、Standard Webhooks 1.1.1。来源与 SHA-256 固定于 `LICENSES/npm/sources.json`；更新版本不会自动沿用旧记录，文件缺失或被修改时准备失败。
- [x] 原文随 `LICENSES` 资源分发，并在准备树中按实际依赖复制到 `dsh/licenses`；没有更改第三方代码或声明其重新授权。
- [x] 六项新增测试覆盖嵌套/作用域包、内部 package.json 排除、精确版本、README 授权文字、未解决项、摘要拒绝和 I/O 错误。

## 仍需核查的 10 项

| 包与版本 | 剩余核查 |
| --- | --- |
| @aws-sdk/credential-provider-http 3.972.83 | 核对新版归档与固定源码，不能直接套用 3.972.82 的声明记录 |
| @aws-sdk/credential-provider-login 3.972.88 | 核对新版归档与固定源码，不能直接套用 3.972.87 的声明记录 |
| @aws-sdk/nested-clients 3.998.0 | 核对新版归档与固定源码，不能直接套用 3.997.54 的声明记录 |
| brotli 1.3.3 | npm 包及固定源提交没有根许可原文，继续核对派生实现与内嵌代码 |
| clean-git-ref 2.0.1 | REA 明确记录的上游原文/署名缺项，保留待核查 |
| dfa 1.2.0 | npm 包及固定源提交没有独立许可原文 |
| fontkit 2.0.4 | 官方仓库已新增 LICENSE；仍需核对其与发布代码及单独版权片段的对应关系 |
| frida 17.23.2 | 版本及源码链已核对，Node 绑定和预构建组件的完整署名仍待核查 |
| minimisted 2.0.1 | REA 明确记录的上游原文/署名缺项，保留待核查 |
| proxy-agent-negotiate 1.1.0 | 发布包与对应 tag 没有本包许可文件；相邻代理包文件不能未经核准直接替用 |

其他平台、Electron 外壳、独立 Node/Python 分发及源码提供义务另行核对；早期 759 项清点不能覆盖这些范围。新清单与补充文件已进入源码构建路径，当前安装状态以本页开头的实包记录为准。

Fontkit 的 [PR 300](https://github.com/foliojs/fontkit/pull/300) 于 2026-11-02 合并，提交为 `d65a577ea30bfce9ce84dc8045860b2abbc1968b`；它与 npm 发布提交之间有 62 个提交，包含运行时代码变化，尚未按后来的文本替旧版本作结论。Frida 总仓库 `17.23.2` 标签对应 `9adf8ed33ab6f1122b17399ee96dcbe101b941c9`，其中 Node 子模块恰为 npm 声明的 `11d56293686c5494f538247ccf89f08ab57912ef`；这一关系不代表所有预编译组件声明已核查完毕。

## 证据与恢复

2026-11-03 收尾包 bcbae27d56 包含浏览器提供方后，清点增至 809 个 npm 记录。待核查变为 17 处（16 种包版本）：原 13 项保留，新增 `@puppeteer/browsers@3.2.2`、`tr46@0.0.3`，以及两处 `undici-types@5.26.5`。这些新增项仅列入清单，尚未完成声明对应关系审核；不把构建通过当作许可审核完成。实际清单见该交付包及其回执。

2026-11-04 检查包 f3f7315880 清点为 811 个 npm 记录，当时待核查 17 处、16 种包版本。该包证据为 `DSHU-20261104-f3f731-manifest.json` 和安装包中的 `dsh/third-party-runtime.json`。

2026-11-04 以 `4564b41285` 实际安装包的 811 条记录复算。补入 `@puppeteer/browsers@3.2.2` 与 `undici-types@5.26.5` 的上游原文，来源同时匹配 npm 发布提交和上游标签，固定值见 `LICENSES/npm/sources.json`。两处相同版本的 undici-types 均匹配同一原文。用源码生成器重跑后余 14 处待核查。此次验证的是下一次打包的清单输出，当前安装仍保留原包的清单。结果为 `.dsh-build/runtime-notices-audit-4564b4-20261104.json`。

2026-11-05 的 `rc.1` 准备树仍有 811 条，版本变动使待核查增至 15 处。`@cfworker/json-schema@4.1.5` 的 npm 发布提交与 Git 标签一致，其许可原文与已存副本逐字相同。Inspector 随包新增对应 DSH `rc.1` 原样 MIT 文件，内嵌 DevTools 声明单独保留并通过哈希核对。使用新源码生成器在准备树的独立投影复算，剩余 13 处。证据 `.dsh-build/rc1-notice-projection-20261105.json`。已通过解包验收的 `c4685cedb7` 检查包记录修复前的 15 处。

同日核对三个 AWS SDK 包的 npm 版本和源码清单，均匹配 AWS 发布提交 `258c14447eefd8e028db1a50ab49aac8312c0af9`。使用该提交的根 Apache-2.0 文本，按仓库规则补一个末尾换行。原始文件 SHA-256 为 `edea91454b811f127fbdea3d86f378f6719bd372ed440abf82b232f6fca06c3d`，分发文件摘要见 `LICENSES/npm/sources.json`。[AWS SDK 原文](https://raw.githubusercontent.com/aws/aws-sdk-js-v3/258c14447eefd8e028db1a50ab49aac8312c0af9/LICENSE)

`koffi@3.1.1` 的 npm 发布清单锁定同版本 Windows x64 二进制包，两个归档均通过锁文件的 SHA-512 校验，实际准备树中的 `koffi.node` 与二进制包一致。随二进制条目记录主包的 `LICENSE.txt`、`vendor/node-addon-api/LICENSE.md` 和 `vendor/node-api-headers/LICENSE` 三份原文。独立投影的 811 条记录余 9 处待核查，证据 `.dsh-build/rc1-notice-projection-aws-koffi-20261105.json`。[Koffi 主包归档](https://registry.npmjs.org/koffi/-/koffi-3.1.1.tgz)

实际安装内容的只读投影及结果：`.dsh-build/packaged-notice-projection-PYDZsU`、`.dsh-build/runtime-notices-audit-20261103.json`。原始 npm 元数据、固定提交查询和原文摘要为 `.dsh-build/license-sources-20261103.json`、`license-supplements-20261103/sources.json`。投影只提取清单和声明文件，不是新的可运行安装包。

实现入口：`apps/desktop/scripts/runtime-notices.ts`、`prepare-dsh.ts` 与 `tests/runtime-notices.spec.ts`。当前范围不新增用户设置或运行时检查；源码中的私有测试目录不参与发布。
