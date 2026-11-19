# 16.07 依赖声明审计

状态：进行中，不代表整合发行的许可核对已完成。用户的 GPL 许可偏好、上游 Credit 和各组件原有许可保持不变。

本地 [Windows 18.11](2026-11-18.11-delivery.md) 实装 ASAR 含 920 个 npm 包、23 份补充声明及 6 项待核查。1,157 条声明引用所对应的 931 个文件均与清单摘要一致。Linux 最近验收的 [17.8](2026-11-17.8-delivery.md) 含 922 个 npm 包、26 份补充声明及 8 项待核查。

Windows 18.9 的逐文件回读在 `candidate-2026.11.18.9/installed-notice-digests.json`。打包直接写入已校验的补充文本字节，校验时缺失或摘要不符会中止准备。移动已校验源文件的隔离回归和原清点器共 19 项测试通过。修复已随 18.10 实装。

当前 `2026.11.17.5` Windows 公开预发布包含 919 个 npm 包、21 份补充声明、6 项待核查；Linux 包含 921 个包、26 份补充声明、8 项待核查。本次直接读取 Windows 已安装 ASAR 和已验收 Linux tar.gz 的 ASAR，核对产品版本、构建源码和唯一 npm 声明清单；两种 Linux 归档的 ASAR 摘要相同，见[本版交付记录](2026-11-17.5-delivery.md)。适用补充原文、Electron、安装器及 Office 声明的摘要核对保留。旧版本数量在下文保留为历史。

Windows 的六项为 `brotli@1.3.3`、`dfa@1.2.0`、`fontkit@2.0.4`、`frida@17.23.2`、`proxy-agent-negotiate@1.1.0`、`minimisted@2.0.1`。Linux 另有 `@img/sharp-libvips-linux-x64@1.3.4` 和 `sherpa-onnx-linux-x64@1.13.8`。`clean-git-ref@2.0.1` 的材料缺口已核查，不再列入当前待核查项。不能以程序可运行或清点通过推定总体许可兼容性结论。

公开 17.5 的实包清点证据为 `%USERPROFILE%/DSHU-Deliveries/20261117/notice-review/current-17-5-inventory.json`，读取入口为交付目录的 `read-current-17-5-notices.mjs`。两平台产品版本均为 `2026.1117.5`，构建源码均为 `7a5d82454ad380b65f9abc18a2e126de2ba40c74`。仅提取清单，不修改安装、第三方记录或审查标记；前版清点原样保留。

## Frida 17.23.2 许可原文

Frida Node 绑定的固定发布提交声明 `LGPL-2.0 WITH WxWindows-exception-3.1`。打包清单按 `frida@17.23.2` 关联 GNU Library GPL v2 原文，字节与 REA 6.9.0 固定的 GNU 原文及 SHA-256 一致。已有 Frida Core 和 Gum 的 COPYING 同时随包保留。Node 绑定源码树缺少独立许可与版权文件，预构建组件的完整署名仍待核查。[绑定声明](https://github.com/frida/frida-node/blob/11d56293686c5494f538247ccf89f08ab57912ef/package.json#L90) · [GNU 原文](https://www.gnu.org/licenses/old-licenses/lgpl-2.0.txt) · [REA 摘要](https://github.com/morluto/rea/blob/d74549e495c58eb4a560279fd9f05508401ea0a0/licenses/upstream-sources.json#L67-L71)

以 Windows 18.6 实装的 920 个包复算，补充声明从 22 份增至 23 份，仅 Frida 记录增加一项，待核查仍为 6 项。实装 ASAR 摘要保持一致，其中的绑定二进制也与已核对的官方 Windows 预构建摘要一致。18 项清点器测试通过。复算回执位于 `%USERPROFILE%/DSHU-Deliveries/20261118/license-review/frida-lgpl-17.23.2-notice-projection.json`。

Frida 17.23.2 的 npm 发布元数据、对应源码和 Windows 18.11 实装包均声明 `LGPL-2.0 WITH WxWindows-exception-3.1`。打包按此版本补入 SPDX 3.29.0 的例外原文，核对了 Git blob 和 SHA-256。用实装 920 个包复算，声明从 23 份增至 24 份，仅 Frida 记录变化，6 项待核查保留。实装 ASAR 摘要一致，19 项清点器测试通过。新文件随下次打包分发，回执为 `frida-wx-exception-17.23.2-notice-projection.json`。[npm 发布记录](https://registry.npmjs.org/frida/17.23.2) · [固定例外原文](https://raw.githubusercontent.com/spdx/license-list-data/31ba1a50e5397e00a304dbadc76531740e89ee48/text/WxWindows-exception-3.1.txt)

### QuickJS 与 V8 运行时原文

Windows 与 Linux x64 的 Frida 17.23.2 预构建归档均与官方发行摘要一致。两个绑定二进制含 QuickJS 后端标识和 `10.9.42-frida` 版本字符串，Windows 18.11 实装二进制与官方 Windows 归档字节一致。固定 SDK 配置与 Gum 的构建声明共同核对 QuickJS 提交 `247bfdcbd3`，V8 头文件与 SDK 配置核对 `a07af89242`。随包新增 QuickJS 的 MIT 原文及 V8 的 `LICENSE` 和 `LICENSE.v8`。三份原文的 Git blob 均匹配，QuickJS 的 `LICENSE` 和 V8 的 `LICENSE` 只规范空白。[官方发布](https://github.com/frida/frida/releases/tag/17.23.2) · [固定 SDK 配置](https://github.com/frida/releng/blob/4e51c61880b8e41aa4b80ae7fb8eb191d9335e08/deps.toml#L394) · [声明来源清单](../../LICENSES/npm/sources.json)

用 Windows 18.11 的 920 个实装依赖复算，包含此前待分发的文本，补充声明合计 29 份。19 项清点器测试通过，实装 ASAR 摘要一致。Frida 仍保留待核查标记，Windows 待核查共 6 项。回执及复算脚本位于 `%USERPROFILE%/DSHU-Deliveries/20261119/frida-runtime-notices/`。新增文本已进入后续源码打包路径。

### Capstone 与 V8 衍生代码原文

Frida 17.23.2 的 Gum 构建配置与 SDK 同时固定 Capstone 提交 `d536b1577f`。Windows 和 Linux x64 的官方归档均复核摘要，两个二进制均含 Capstone 和 V8 标识。为该版本补入 Capstone 本体与所附 LLVM 声明，以及固定 V8 提交的 fdlibm、Strongtalk 声明。四份文件与对应 Git blob 逐字一致。[Gum 固定配置](https://raw.githubusercontent.com/frida/frida-gum/2b0e6a661702097d77474223ebc429ece092cb46/subprojects/capstone.wrap) · [V8 声明](https://raw.githubusercontent.com/frida/v8/a07af892420dfd873b33bd4ce4ba9d963072e1b9/LICENSE) · [声明来源清单](../../LICENSES/npm/sources.json)

用 Windows 18.11 的 920 个实装依赖复算，补充声明合计 33 份，待核查仍为 6 项。19 项清点器测试通过，实装 ASAR 摘要一致。新增声明的实包分发及其余 Frida 组件署名仍待核查。回执为 `%USERPROFILE%/DSHU-Deliveries/20261119/frida-derived-notices/`。

## 代理认证实现的原始许可（2026-11-19）

`proxy-agent-negotiate@1.1.0` 的 `createNegotiateAuth` 来自上游 PR #420 的 HTTP 代理实现。去除导出修饰、注释和排版后，函数与拆分后的声明一致，拆分提交与发布提交的入口源码逐字一致。npm 发布归档通过 SHA-512 校验，Windows 18.11 实装的 `dist/index.js` 与归档逐字一致。源码清单关联该原始实现所属的版权和 MIT 原文，独立包的完整署名仍待核查。[上游 PR](https://github.com/TooTallNate/proxy-agents/pull/420) · [固定许可原文](https://github.com/TooTallNate/proxy-agents/blob/663669853ea993d66da628aea9f9902e1a6916d8/packages/http-proxy-agent/LICENSE)

清点器对该精确版本继续保留待核查标记。基于同一 Windows 18.11 实装的 920 个包复算，补充声明合计 34 份，待核查仍为 6 项，ASAR 摘要一致。19 项定向测试通过。源码比对与清点回执位于 `%USERPROFILE%/DSHU-Deliveries/20261119/proxy-negotiate-notices/`。新增文本待候选安装包核验分发。

## Fontkit 2.0.4 的 Unicode 12.0 数据署名（2026-11-19）

Windows 18.11 实装的 121 个 `src/` 文件及 4 个入口与锁定的 npm 归档逐字一致。对应发布提交包含其中 116 个 `src/` 文件，其余 5 个由发布脚本生成。对照后来加入 `LICENSE` 的上游提交，只有 3 个文件的路径和 Git blob 同时一致。2.0.4 本体的完整许可与 Apple 编码表的分发条款仍待核查。[npm 发布源码](https://github.com/foliojs/fontkit/tree/fbf3b9ef21eebd219eb73e666faed573af0fba09) · [后续许可提交](https://github.com/foliojs/fontkit/pull/300)

发布提交的锁文件固定 `codepoints@1.3.0`。其 13 个数据文件与 Unicode 12.0.0 官方 UCD 归档逐字一致。分别用两组数据运行发布脚本，生成的 `data.trie`、`indic.trie`、`use.trie`、`indic.json` 和 `use.json` 均与实装字节匹配。补充声明保留 Unicode Consortium 在 ICU 64.1 发布中附带的 Unicode 12 数据版权与许可正文。[发布锁文件](https://github.com/foliojs/fontkit/blob/fbf3b9ef21eebd219eb73e666faed573af0fba09/package-lock.json) · [官方 UCD 12.0.0](https://www.unicode.org/Public/zipped/12.0.0/UCD.zip) · [同期 Unicode 许可](https://github.com/unicode-org/icu/blob/2f2aec5f91cffe49b7526d9b0d18a9acbdd0cc89/icu4c/LICENSE)

使用 920 个实装依赖复算后，补充声明合计 35 份，待核查仍为 6 项，ASAR 摘要一致。19 项定向测试通过。生成数据、文件摘要和清点回执在 `%USERPROFILE%/DSHU-Deliveries/20261119/fontkit-license-provenance/`。新增声明待候选安装包核验分发。[声明清单](../../LICENSES/npm/sources.json)

## minimisted 与 Git 运行入口（2026-11-19）

`minimisted@2.0.1` 的 npm 归档通过 SHA-512 核验，入口 `index.js` 同时匹配 Windows 准备树的 SHA-256 和发布提交的 Git blob。发布提交的九个文件没有独立许可或版权文件，README 和 npm 元数据均声明 MIT。上游仓库已归档，待核查标记保留。[发布源码](https://github.com/kt3k/minimisted/tree/95fdfb8d6efb9546c1117854fe3a58105f6332ce) · [npm 发布记录](https://www.npmjs.com/package/minimisted/v/2.0.1)

Windows 准备树中，REA 的参考资料导入调用 `isomorphic-git@1.38.7` 的 `resolveRef` 和 `getConfig`。在本地合成仓库中阻止加载 `minimisted` 后，两项读取均通过。同一探针运行 `isogit` 命令行入口时命中阻止条件。复核对象是准备树的库入口，正式候选仍需实测参考资料导入。上游 `isomorphic-git@1.44.17` 的发布元数据仍声明该依赖。[新版发布清单](https://github.com/isomorphic-git/isomorphic-git/blob/514544e88230197e101c07f082cf26902503f4f0/package.json) · [新版发行记录](https://github.com/isomorphic-git/isomorphic-git/releases/tag/v1.44.17)

先核实候选是否需要提供 `isogit` 命令。保留该命令时继续核对原始署名。若候选仅需 Git 库接口，评估在同一构建中排除命令行入口及其依赖，并验证参考资料导入、产物依赖图和清点结果。本轮未调整依赖。复验记录位于 `%USERPROFILE%/DSHU-Deliveries/20261119/minimisted-runtime-review/result.json`。

## Windows 18.4 实装依赖路径

实装中 LibreOffice Kit 0.2.3 引入 Fontkit 2.0.4，后者引入 Brotli 1.3.3 和 dfa 1.2.0。HTTP 与 HTTPS Proxy Agent 9.1.0 均引入 proxy-agent-negotiate 1.1.0。REA 6.9.0 引入 Frida 17.23.2，isomorphic-git 1.38.7 引入 minimisted 2.0.1。入口分别对应 Office、代理、REA 和 Git，后续替换须验证受影响的功能。实装清单与路径回执位于 `%USERPROFILE%/DSHU-Deliveries/20261118/candidate-2026.11.18.4/installed-notice-inventory.json`。

查到 Fontkit 3.0.0 改为依赖 dfa `^2.0.0`。dfa 2.0.0 的 npm 元数据仍标记 MIT，对应发布提交的完整 Git 树仍没有独立 LICENSE、COPYING 或 NOTICE 文件。现有 Office 依赖保持锁定，待核查标记保留。[Fontkit 3.0.0 发布记录](https://registry.npmjs.org/fontkit/3.0.0) · [dfa 2.0.0 固定源码](https://github.com/devongovett/dfa/tree/0205982a2a4fff76a43ca0b678460925b409e1e9)

Windows 18.4 实装的 `frida_binding.node` 与 Frida 17.23.2 官方预构建逐字一致，归档摘要与发布记录一致。发布版固定 Frida Core 提交 `78028da11b850329cb4bfa665a6034bf49b78249`，源码构建清单已补入该提交的 COPYING 原文及 SHA-256。独立绑定和其他预构建组件的署名仍待核查。新原文已随 18.5 打包分发，18.4 安装包保留原有清单。证据位于 `20261118/license-review/frida-core-17.23.2-license-proof.json`。[官方预构建](https://github.com/frida/frida/releases/tag/17.23.2) · [固定原文](https://github.com/frida/frida-core/blob/78028da11b850329cb4bfa665a6034bf49b78249/COPYING)

从实装 ASAR 提取的 920 项清单和声明文件已在独立目录复算。只有 Frida 记录增加一份原文，仍有 6 项待核查，实装 ASAR 摘要一致。18 项清点器测试通过。复算回执为同目录 `frida-core-17.23.2-notice-projection.json`。

## 固定版本材料复核（2026-11-18）

`dfa@1.2.0`、`minimisted@2.0.1` 和 `proxy-agent-negotiate@1.1.0` 的 npm 归档分别按发布元数据的 SHA-512 完整性值复核，共含 6、7、5 个文件。前两者的 README 仅标注 MIT，后者没有许可正文或版权头；清单中的审查标记保持不变。元数据中的固定提交分别为 `3f5e603e5082caedabefefdf53e8a6ca3111e966` 和 `95fdfb8d6efb9546c1117854fe3a58105f6332ce`；不推定作者字段等同于完整版权声明。[dfa 发布记录](https://registry.npmjs.org/dfa/1.2.0) · [minimisted 发布记录](https://registry.npmjs.org/minimisted/2.0.1)

`proxy-agent-negotiate@1.1.0` 没有 `gitHead` 字段，其 [npm 公开构建声明](https://registry.npmjs.org/-/npm/v1/attestations/proxy-agent-negotiate@1.1.0)指向 `TooTallNate/proxy-agents` 的 `.github/workflows/release.yml`、提交 `b7e5f7ccce1a3ac5b339cc4c587974e8989cbc16`。该固定 Git 树的根目录及 `packages/negotiate` 仍没有许可文件；相邻包的文本继续保留为待核准材料。本轮读取声明字段，没有把它当作完整签名验证或许可授权文件。[固定源码](https://github.com/TooTallNate/proxy-agents/tree/b7e5f7ccce1a3ac5b339cc4c587974e8989cbc16/packages/negotiate)

本轮查询时，minimisted 与 proxy-agent-negotiate 的最新版本仍为 2.0.1 和 1.1.0，没有采用新的运行时版本。归档、发布元数据、逐文件摘要及检查结果在 `%USERPROFILE%/DSHU-Deliveries/20261118/license-review/`；本地 17.8 的待核查数仍为 Windows 6 项、Linux 8 项。

### dfa 内嵌的 PEG.js 解析器

`dfa@1.2.0` 的固定 Makefile 调用 PEG.js 生成解析器。npm 归档的编译器源码映射注明生成器为 PEG.js 0.10.0，七处解析器模板片段与该版本上游源码和分发的 `compile.js` 一致。归档通过锁文件 SHA-512 核验，`compile.js` 与 Windows 18.11 实装中的文件逐字一致。清单附入 PEG.js 0.10.0 的 MIT 许可和版权原文，dfa 本体署名仍待核查。[dfa 构建规则](https://github.com/devongovett/dfa/blob/3f5e603e5082caedabefefdf53e8a6ca3111e966/Makefile) · [PEG.js 模板](https://github.com/pegjs/pegjs/blob/671166bbe82150042b71d5756405c0ee067df961/lib/compiler/passes/generate-js.js) · [PEG.js 许可](https://github.com/pegjs/pegjs/blob/671166bbe82150042b71d5756405c0ee067df961/LICENSE)

使用 Windows 18.11 的 920 项实装依赖复算，继 Frida 和 Fontkit 补充之后只增加 dfa 的一份声明，合计 26 份，仍有 6 项待核查。19 项清点器测试通过，实装 ASAR 摘要一致。新增原文待下次打包分发。回执位于 `%USERPROFILE%/DSHU-Deliveries/20261118/license-review/dfa-pegjs/dfa-pegjs-notice-projection.json`。

## Office 0.2.3 声明清点（2026-11-13）

实际 Windows 载荷中的五份原生引擎声明，以及 Linux 工作区中的三份 WASM 引擎声明，均与各自 0.2.3 `prebuilds.json` 的固定摘要一致。清点器现按确切版本记录这些嵌套文件，保留 0.1.5 记录；缺失或空白的原文仍标记待核查。声明路径和摘要回执为当前交付目录中的 `office-023-notice-verification.json` 和 `office-wasm-023-notice-verification.json`。

对 Windows `.13.3` 的 917 项实包输入执行只读副本复算，仅 Office 条目发生变化，待核查从 8 项降为 7 项。该次复算保持原安装和实包清单不变；随后 `.13.4` 实际安装器已核对五份 Office 原文并完成原位更新。回执为 `office-023-notice-projection.json`。这些结果只核对文本覆盖，不代表内嵌组件及整合发行义务审查完成。

## clean-git-ref 的 Apache 许可正文（2026-11-11）

`clean-git-ref 2.0.1` 的 npm 归档通过锁文件 SHA-512 校验，发布提交为 `bf3c8afc8032bcdc6a53634c18b601dc6df478fb`。源码和归档均声明 Apache-2.0，作者字段为 Eli White。Windows `.6` 实装和 Linux `.5` 便携包的入口文件均与 npm 归档逐字一致。打包后的 manifest 只移除了 `scripts`，其余字段与发布源码一致。该版本的归档和源码树均缺少独立许可正文。[发布源码](https://github.com/TheSavior/clean-git-ref/tree/bf3c8afc8032bcdc6a53634c18b601dc6df478fb)

补入 Apache 基金会提供的 Apache 2.0 正文，SHA-256 为 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`，仅匹配 `2.0.1`。原 REA 汇总声明和该包的待核查状态继续保留，上游专属署名与整合发行核对仍待完成。12 项清点器回归及 Host/Client 聚合检查通过。Windows 和 Linux 的实包输入复算分别为 859 和 861 个包、22 和 27 份补充声明，待核查数量分别为 7 和 9。复算包含此前尚未交付的补充声明，新原文随下次打包分发。回执位于 `.dsh-build/clean-git-ref-license-20261111/`。[Apache 正文](https://www.apache.org/licenses/LICENSE-2.0.txt)

## Linux x64 图像与语音依赖（2026-11-11）

校验 Linux `.5` tar.gz 与 ASAR 的交付摘要。实包中的 `libvips-cpp.so.8.18.7` 和 Sherpa-ONNX 的四个二进制与 npm 归档逐字一致。两个 npm 归档均通过 `pnpm-lock.yaml` 的 SHA-512 核对，发布提交与上游标签一致。[Sharp libvips 1.3.4](https://github.com/lovell/sharp-libvips/releases/tag/v1.3.4) · [Sherpa-ONNX 1.13.8](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.8)

libvips 补入 Sharp 构建的第三方清单、libvips 8.18.7 的源码许可文件及该构建采用的 LGPL 3.0 原文。Sherpa-ONNX 使用对应版本 Apache 2.0 原文。其 `libonnxruntime.so` 与 Sherpa 构建固定的 ONNX Runtime 1.28.2 Linux 归档逐字一致，随包补入该归档的 LICENSE 和 ThirdPartyNotices。[Sharp 第三方清单](https://github.com/lovell/sharp-libvips/blob/v1.3.4/THIRD-PARTY-NOTICES.md) · [libvips 源码许可](https://github.com/libvips/libvips/blob/v8.18.7/LICENSE) · [Sherpa 固定的 ONNX 构建](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/cmake/onnxruntime-linux-x86_64.cmake)

使用实包中的 861 个包清单及声明原文复算。补充声明记录由 19 份增至 24 份，仅两个 Linux 平台条目变化。清点器继续标记这两项，待核对内嵌库署名及对应发行义务。二进制摘要与复算回执位于 `.dsh-build/platform-native-notices-20261111/`。新增原文随下一次 Linux 打包进入载荷。

### Sherpa-ONNX Linux 内嵌许可（2026-11-19）

Linux 17.8 便携包的 SHA-256 与交付记录一致。包内 `libsherpa-onnx-c-api.so` 与运行时清单的摘要一致。ELF 符号确认 Piper phonemize、eSpeak NG、uni-algo 和 KissFFT 的实现随此文件分发。Sherpa-ONNX 1.13.8 的构建锁定 Piper 与 eSpeak 的提交。KissFFT 的提交由该构建锁定的 kaldi-native-fbank 1.22.3 指定。[Piper 构建输入](https://github.com/k2-fsa/sherpa-onnx/blob/11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf/cmake/piper-phonemize.cmake) · [eSpeak 构建输入](https://github.com/k2-fsa/sherpa-onnx/blob/11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf/cmake/espeak-ng-for-piper.cmake) · [KissFFT 构建输入](https://github.com/csukuangfj/kaldi-native-fbank/blob/v1.22.3/cmake/kissfft.cmake)

五份许可文本按固定 Git blob 核对。KissFFT 的 COPYING 移除一处末尾空行，其余四份按原始字节封存。清单只把新增文件关联到 `sherpa-onnx-linux-x64@1.13.8`。使用 17.8 实包提取的目标包清单和 README 调用打包清点器，逐字保留原 3 份声明并新增 5 份，8 份文件的摘要全部匹配。19 项清点器测试通过。其他内嵌组件署名和对应源码提供范围仍待核查，待审标记保留。回执位于 `%USERPROFILE%/DSHU-Deliveries/20261119/sherpa-onnx-linux-x64-1.13.8/notice-projection-result.json`。[固定许可文本清单](../../LICENSES/npm/sources.json)

### libvips Linux 图像编解码许可（2026-11-19）

Linux 17.8 便携包的摘要与交付记录一致。提取的 `libvips-cpp.so.8.18.7`、`versions.json`、包清单和 README 与打包运行时清单中的摘要一致。实包版本表与 Sharp 1.3.4 构建锁定的 AOM 3.15.1、libwebp 1.6.0、libpng 1.6.58、libimagequant 2.4.1 和 MozJPEG `0826579` 一致。二进制的编译信息记录了 AV1 版本、WebP 和 PNG 支持及 imagequant，JPEG 入口保留 IJG 系的版权文字。[Sharp 固定版本表](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/versions.properties) · [构建脚本](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/build/posix.sh)

清单为 `@img/sharp-libvips-linux-x64@1.3.4` 补入 8 份文本，含 AOM 和 WebP 的专利声明。原文均核对固定 Git blob。AOM 两份文本及 WebP 的 COPYING 各去除一个多余末尾空行。以 17.8 实包输入做单包复算，原 3 份声明保留，新增 8 份，合计 11 份的摘要均一致。19 项打包清点测试通过。其余内嵌库署名、对应源码范围和新包分发仍待核查。回执位于 `%USERPROFILE%/DSHU-Deliveries/20261119/sharp-libvips-linux-x64-1.3.4/notice-projection-result.json`。[固定许可文本清单](../../LICENSES/npm/sources.json)

## Electron 与 Windows 安装器声明（2026-11-11）

Windows `.6` 的 `StdUtils.dll` 与作者 1.14 发行归档和 NSIS Resources 3.4.1 中的 Unicode DLL 逐字一致。作者单独发布的源码归档解压后，与同一二进制归档内的源码 tar 一致，内含 LGPL 文本及作者说明。源码归档及 ANSI、Unicode DLL 摘要固定在 `LICENSES/installer/stdutils-1.14.json`。[StdUtils 1.14 发行](https://github.com/lordmulder/stdutils/releases/tag/1.14)

Windows 安装器构建会核对所用 StdUtils DLL 和源码归档，并嵌入 `StdUtils-1.14-sources.tbz2`。验收从外层 NSIS 读取归档与 DLL 并同暂存输入比对。

`.6` 安装器的 `UAC.dll` 和 `WinShell.dll` 均与作者归档中的 Unicode 版本逐字一致，NSIS Resources 3.4.1 中的 ANSI 版本也分别匹配。UAC 0.2.4c 归档附有 zlib 条款，现随包携带 `UAC-0.2.4c-LICENSE.txt`，仅统一换行和文件末尾空白。打包与外层 NSIS 验收核对 DLL 和声明。[UAC 作者归档](https://nsis.sourceforge.io/UAC_plug-in)

WinShell 作者页标注 Freeware，归档只有两种 DLL，未找到明确再分发条款。当前安装器改用 Windows Shell API 写入快捷方式 AppID、取消固定旧链接并清理对应应用的跳转列表。新编译的中英文夹具均在安装时写入正确 AppID，卸载时移除两个快捷方式。双层检查确认安装器和内嵌卸载器均已移除 WinShell DLL。旧 `.6` 仍保留该组件，完整 Windows 包须用新源码重建。[WinShell 作者页](https://nsis.sourceforge.io/WinShell_plug-in) · [Windows AppUserModelID](https://learn.microsoft.com/en-us/windows/win32/properties/props-system-appusermodel-id)

校验 [Electron 44.7.0](https://github.com/electron/electron/releases/tag/v44.7.0) 的 Windows x64 和 Linux x64 分发归档。Windows `.6` 实装、Linux `.5` 的 deb 和 tar.gz 均保留与对应分发包逐字一致的 `LICENSE.electron.txt` 和 `LICENSES.chromium.html`。Windows 和 Linux 打包后的检查现会拒绝缺失、空文件或内容变动的声明。

Windows `.6` 安装器的解包器及两份 7-Zip 原文均与构建工具集一致。`System.dll` 和 `nsDialogs.dll` 与 [NSIS 3.0.4.1 归档](https://github.com/electron-userland/electron-builder-binaries/releases/tag/nsis-3.0.4.1)的 x86 Unicode 成员逐字一致，`UAC.dll`、`StdUtils.dll` 和 `WinShell.dll` 对应 [NSIS Resources 3.4.1](https://github.com/electron-userland/electron-builder-binaries/releases/tag/nsis-resources-3.4.1)。插件二进制归属已核对，个别插件的源码与许可对应关系仍待核查。

Windows 安装器现随包附带实际编译工具集的 `COPYING` 原文，文件名为 `nsis-installer-COPYING.txt`。原文 15,488 字节，SHA-256 `3c8de989f6504d52f5f8dfafedb6668cd47201f5d01f1319570727c091425dd6`。该声明随下一次 Windows 打包分发。证据见 `.dsh-build/installer-license-20261111/` 及同轮 `desktop-notices-*` 日志。

安装升级检查器已从新编译的中英文夹具复核外层 NSIS 与内层应用。三份工具集声明逐字匹配暂存原文。旧 `.6` 因缺少 NSIS 声明在解包前被拒绝。证据见 `.dsh-build/installer-archive-20261111-result.json`。[双层校验入口](../../apps/desktop/tests/installed-update/README.zh.md)

## 当前检查包（2026-11-11）

源码 `1408c12cc1` 的 Windows `.6` 实装包含 859 个 npm 包，7 项待核查。Linux `.5` 的 deb 与 tar.gz 包含同一 ASAR，包含 861 个 npm 包，9 项待核查。两边都分发 19 份补充声明，并从实际载荷核对 Frida Gum 原文摘要。完整清单保存在 `.dsh-build/deliverables/`，交付回执与摘要见 [HANDOFF](../HANDOFF.md)。

## Fontkit 内嵌的 Mac 编码表（2026-11-11）

按锁文件 SHA-512 校验 Fontkit 2.0.4 归档，从 Windows `.6` 实装核对 `src/encodings.js` 和四个打包入口的完整字节。编码源文件还与 npm 对应的 Git 发布提交一致。将八张表的 1,024 个字节映射与 Apple 发布的数据逐项比较，八张表各有 127 项匹配，唯一差异均为 `0xCA` 从 U+00A0 改为 U+0020。四个打包入口也都包含同样的映射。[发布源码](https://github.com/foliojs/fontkit/tree/fbf3b9ef21eebd219eb73e666faed573af0fba09) · [Apple 映射说明](https://www.unicode.org/Public/MAPPINGS/VENDORS/APPLE/Readme.txt)

补充声明列明六张表的 Apple 版权和 Gaelic、Inuit 表所注明的 Michael Everson 作者归属。实装输入复算仅改变 Fontkit 条目，补充声明记录由 19 增至 20。保留 Fontkit 的待核查状态，继续核对 2.0.4 本体的原始许可和 Apple 数据的具体分发条款。映射数据摘要、逐项比较和复算回执在 `.dsh-build/fontkit-apple-20261111/`。[Unicode 使用条款](https://www.unicode.org/copyright.html)

八张源表的标准头部还包含商标、免责声明和原始数据说明。重新读取的文件均与既有映射证据的摘要一致，去掉注释前缀和行尾空白后，八份头部逐字相同。现将这段原文一并保留在精确匹配 `fontkit@2.0.4` 的补充声明中，文件 SHA-256 为 `731d2f298c322c6bc349c4bba17bdccde980acc3830fc7eec0b037c76b860365`。Windows `.6` 和 Linux `.5` 实包清单复算通过，分别仍有 7 和 9 项待核查，两个临时投影均已清理。12 项清点器测试通过，新文本待下次打包分发。复算入口与原文比对在 `.dsh-build/license-gaps-20261111/`。[Croatian 源表标准头部](https://www.unicode.org/Public/MAPPINGS/VENDORS/APPLE/CROATIAN.TXT) · [Inuit 源表标准头部](https://www.unicode.org/Public/MAPPINGS/VENDORS/APPLE/INUIT.TXT)

Fontkit 2.0.4 的发布源码注明 Base64 解码器改编自 `base64-arraybuffer`。锁定的 npm 归档与 Windows 18.11 实装包中，解码源文件和四个分发入口逐文件字节相同。各入口的解码写入表达式与 `base64-arraybuffer` v0.1.5 固定源码一致。按 `fontkit@2.0.4` 随包保留该实现的 MIT 许可与版权原文。[Fontkit 发布源码](https://github.com/foliojs/fontkit/blob/fbf3b9ef21eebd219eb73e666faed573af0fba09/src/utils.js) · [解码器固定源码](https://github.com/niklasvh/base64-arraybuffer/blob/e9457ccb7b140f5ae54a2880c8e9b967ffb03a7d/lib/base64-arraybuffer.js) · [MIT 原文](https://github.com/niklasvh/base64-arraybuffer/blob/e9457ccb7b140f5ae54a2880c8e9b967ffb03a7d/LICENSE-MIT)

用 Windows 18.11 的 920 个包复算，继 Frida 例外声明后只增加一份 Fontkit 声明，合计 25 份，待核查仍为 6 项。19 项清点器测试通过，实装 ASAR 摘要一致。两份新声明待下次打包分发。复算回执位于 `%USERPROFILE%/DSHU-Deliveries/20261118/license-review/fontkit-base64/fontkit-base64-2.0.4-notice-projection.json`。

## Brotli 编码器内嵌的 Emscripten 运行时（2026-11-11）

按 npm 发布完整性校验 Brotli 1.3.0、1.3.1、1.3.2 和 1.3.3 的归档，四版的 `build/encode.js` 与 `build/mem.js` 逐字相同，最早比对的发行日期为 2016 年 9 月 11 日。Windows `.6` 的这两个文件及包装代码 `compress.js`、`enc/pre.js` 与 1.3.3 归档一致。发行源码的 Makefile 使用 `emcc`，编译结果保留三个可在同时期 Emscripten 运行时源码中核对的字符串。[Brotli 构建规则](https://github.com/foliojs/brotli.js/blob/e36051345f6d27a56e5f39ea70d2f789b8574046/Makefile) · [Emscripten 运行时源码](https://github.com/emscripten-core/emscripten/blob/365212e71060771e167e88e9d0d337684f7587c5/src/shell.js)

随包清单补入同时期 Emscripten 的 MIT 与 NCSA 原文，仅统一行尾空白和文件末尾换行。核对的 1.36.3、1.36.7、1.36.8 和 1.37.0 根许可文件逐字一致。用 Windows `.6` 实装 ASAR 的 859 项清单复算，Brotli 和 Fontkit 各新增一份文本，补充声明从 19 份增至 21 份，其余条目一致。待核查仍为 7 项，Brotli 的包装代码原始署名、精确编译器版本和链接组件清单继续保留。复算回执为 `.dsh-build/brotli-encoder-projection-20261111.json`。[Emscripten 许可原文](https://raw.githubusercontent.com/emscripten-core/emscripten/365212e71060771e167e88e9d0d337684f7587c5/LICENSE)

## Frida 预构建二进制（2026-11-11）

Windows `.4` 实装和 Linux `.4` tar.gz 内的 `frida_binding.node` 与 [Frida 17.23.2 官方预构建归档](https://github.com/frida/frida/releases/tag/17.23.2)逐字一致。两份归档先比对 GitHub 提供的 SHA-256，再以流式读取核对二进制摘要。结果见 `.dsh-build/frida-prebuild-projection-20261111.json`。

发布版 Node 绑定依赖 Frida Core，Core 的 [Gum 版本声明](https://github.com/frida/frida-core/blob/78028da11b850329cb4bfa665a6034bf49b78249/subprojects/frida-gum.wrap)固定 `17.23.2`。新增该版本 Gum 的 [COPYING 原文](https://github.com/frida/frida-gum/blob/2b0e6a661702097d77474223ebc429ece092cb46/COPYING)，核对 Git blob 与 SHA-256。Frida 仍标记待核查，剩余内容包括绑定独立声明及预构建中其他组件的完整署名。

以 Windows `.4` 实装 ASAR 的 859 项包清单复算，补充声明由 18 份增至 19 份，7 项待核查保持。仅 Frida 条目增加 Gum 原文，实装 ASAR 摘要保持一致。12 项清点器回归通过。复算回执为 `.dsh-build/frida-notice-projection-20261111-result.json`。随后 `.5` 安装器完成实包原文摘要核对，详见 [HANDOFF](../HANDOFF.md)。

## 上一检查版实装（2026-11-10）

`9df061a06a` 的 Windows `0.1.0-test.20261110.4` 已安装并重新打开。实际安装器包含 859 个 npm 包、18 份补充声明及 7 项待核查。独立运行时清单包含 3 个组件、14 个 Python 发行包及 88 份声明文件。清单和安装证据位于 `.dsh-build/deliverables/DSHU-20261110-9df061-manifest.json` 及同前缀的 npm 与独立运行时清单。

## Linux Office 与 Koffi 声明（2026-11-10）

Linux `.3` 实包原清单为 861 个 npm 包和 12 项待核查。`@deepseek-ai/libreoffice-kit-wasm@0.1.5` 随包提供 `licenses/DeepSeek-Harness-MIT.txt`、`licenses/LICENSE` 和 `licenses/NOTICE`。三份文本在实际归档内与该包 `prebuilds.json` 的摘要一致，清点器按版本记录这些路径。实包中的两个 Koffi 主包明确锁定同版本 Linux x64 二进制包，现将已固定的主包、Node addon API 和 Node API headers 声明关联到 `3.1.1` 与 `3.3.6`。来源见 [Koffi 3.1.1 归档](https://registry.npmjs.org/koffi/-/koffi-3.1.1.tgz)及 [Koffi 3.3.6 归档](https://registry.npmjs.org/koffi/-/koffi-3.3.6.tgz)。

校验 Linux `.3` tar.gz 和 ASAR 摘要后，以归档中的清单和声明建立只读投影。新版清点器复算为 9 项待核查，只有上述三个记录变化。12 项定向测试和两项构建聚合检查通过。复算回执为 `.dsh-build/linux-notice-projection-20261110-result.json`。随后 Linux `.4` 干净打包，实际 deb 与 tar.gz 包含同一份 ASAR，实包清单为 861 个 npm 包及 9 项待核查。清单为 `.dsh-build/deliverables/DSHU-20261110-linux-d8c7f8-third-party-runtime.json`。剩余 Linux 平台项包括 libvips 与 sherpa-onnx 二进制，其余范围继续见下文。

## 独立脚本运行时（2026-11-10）

共享构建器新增 `runtime/primary-runtime/third-party-runtime.json`，覆盖独立 Node、Python、pnpm 及已安装 Python 发行包。记录声明路径、SHA-256、包元数据与版本，保留嵌套组件原文。按 Python 元数据版本定位 `License-File`，缺失和空白文件标为待核查，缺失或版本不符的已声明发行包会中止准备。组装标识已更新，旧运行时副本不会因复用而漏掉报告。

当前实装的只读复算与从锁定归档重新准备的结果完全相同，Node 24.22.1、Python 3.12.14、pnpm 11.28.5 共 88 份声明文件，14 个 Python 发行包含解释器自带 pip；声明指定的文件没有缺失。Windows 原生解释器、库导入、pip 依赖与 Office 读写 smoke 通过。回执为 `.dsh-build/installed-primary-notices-20261110.json` 和 `primary-notice-build-20261110-result.json`。这不是完整安装包重建，系统应用未修改。

这些结果证明文本随包保留与声明路径可核对，不代替内嵌组件来源、许可兼容性及源码提供义务审查。npm 的七个待核查项不变；Electron、安装器和其他平台继续保留在范围内。

## 上一检查包与源码补充（2026-11-10）

上一实装源码 `3dda4cf411`，检查版 `0.1.0-test.20261110.2`，包含 859 个 npm 包、15 份补充声明和 7 项待核查。实包记录为 `.dsh-build/deliverables/DSHU-20261110-3dda4c-third-party-runtime.json`。

源码补入 `brotli 1.3.3` 的 Google 解码器版权头、Apache-2.0 原文和固定 Google Brotli 子模块的 MIT 原文。七个解码器文件已逐字比对 npm 归档、发布提交及当前实装内容，归档通过 npm SHA-512 校验。版权头只去除注释起始符并截取至许可段结束，其他原文仅统一末尾换行。包装代码与编译编码器的声明范围仍未核清，清点器继续标记此包待核查。[发布源码](https://github.com/foliojs/brotli.js/tree/e36051345f6d27a56e5f39ea70d2f789b8574046)、[所固定的 Google Brotli 许可](https://raw.githubusercontent.com/google/brotli/5ce9bf11b3fe0924d87b2a2d47eb7a53a76a4421/LICENSE)、[Apache-2.0 原文](https://www.apache.org/licenses/LICENSE-2.0.txt)。

实装 ASAR 的独立清单复算包含 859 个包、18 份补充声明和相同的 7 项待核查。除 brotli 增加三份文本外，逐包记录完全相同；实装 ASAR 摘要未变。回执 `.dsh-build/brotli-notices-20261110-result.json` 与 `.dsh-build/brotli-notice-projection-20261110-result.json` 保存固定来源、文件摘要和复算结果。11 项定向回归验证精确版本、缺失与篡改文件，以及部分补充后的待核查状态。

## 历史检查包（2026-11-06）

`bc9fdc59d5` 的 `0.1.0-test.20261106.2` 完整安装器已通过实际载荷与运行验收，含 859 个 npm 包、15 份补充声明、7 项自动待核查；尚未安装。清单 `.dsh-build/deliverables/DSHU-20261106-bc9fdc-third-party-runtime.json` 与安装器摘要均由实际 ASAR 提取，记录在同目录交付清单中。剩余七项及其他平台范围保留。

## 历史安装包（2026-11-06）

`7db7e35015` 检查包已从实际安装器解包验收，并安装至系统。清单来自实装 ASAR，共 874 个 npm 包、14 份补充声明、10 个自动标记的待核查项。精确记录位于 `.dsh-build/deliverables/DSHU-20261106-7db7e3-third-party-runtime.json`，摘要保存在同目录安装清单。该安装包未签名、未发布 Release。

与前次 `09ad1610d3` 包相比，三个 AWS 包解析到了新版本：credential-provider-http `3.972.82 → 3.972.83`、credential-provider-login `3.972.87 → 3.972.88`、nested-clients `3.997.54 → 3.998.0`。原安装包的十项记录保留；下述源码补充不改写原 ASAR 或交付清单。

## 源码补充与锁定依赖（2026-11-06）

六个精确 AWS 版本已核对 npm 归档的 SHA-512、发布 manifest 和对应源码 manifest。工作区锁定的 http 3.972.74、login 3.972.79、nested 3.997.46 对应发布提交 `c68e50e4a6e0469a20c2894fe8a29c140553ebb8`；当前安装包的三个新版本对应 `80cb7896f530f5d7cb33b3c5abbdae1212dbd768`。依赖字段仅展开发布时的 `workspace:` 前缀后比较。nested-clients 的源码实际位于 `packages-internal/nested-clients`，其发布 manifest 仍写旧目录，未据旧目录的 404 放弃对应关系核对。

两处固定提交的根 Apache-2.0 原文均与已保存文本逐字一致，只保留原有的末尾换行处理；新增精确版本记录，不放宽为版本范围。[工作区版本原文](https://raw.githubusercontent.com/aws/aws-sdk-js-v3/c68e50e4a6e0469a20c2894fe8a29c140553ebb8/LICENSE)、[安装包版本原文](https://raw.githubusercontent.com/aws/aws-sdk-js-v3/80cb7896f530f5d7cb33b3c5abbdae1212dbd768/LICENSE)。核对回执 `.dsh-build/aws-lock-licenses-20261106-result.json`。

原安装包 874 项和新准备树 859 项分别建立只读投影，均仅有上述三个 AWS 标记由待核查变为已补充，剩余七项不变。原包、原准备树及用户数据未改写，临时投影已清理；回执 `.dsh-build/aws-lock-notice-projection-20261106-result.json`。准备树的包名集合与原包相同，版本与重复实例数变化不能据总数推断功能减少。新的锁定流程及实际构建验收见[运行时锁定记录](2026-11-06-runtime-lock.md)。补充已随最新完整检查包交付，实包结果为七项，仍不等于最终许可兼容性结论。

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

## 最新检查包的材料核查

当前数量与版本以本页开头的实包清点为准。下表列出仍需处理的材料及发行核查；clean-git-ref 已完成项见[发布归属复核](#clean-git-ref-发布归属复核)。

| 包与版本 | 平台 | 剩余核查 |
| --- | --- | --- |
| brotli 1.3.3 | Windows/Linux | 已补 Google 解码器、固定子模块和 Emscripten 运行时声明，包装代码原始署名、精确编译器版本及链接组件清单待核对 |
| dfa 1.2.0 | Windows/Linux | 已补 PEG.js 0.10.0 解析器许可原文。dfa 本体署名仍待核对 |
| fontkit 2.0.4 | Windows/Linux | 已补八张 Mac 编码表的归属、Base64 解码器的 MIT 和生成整形数据的 Unicode 12.0 声明。Fontkit 本体原文与 Apple 数据分发条款仍待核对 |
| frida 17.23.2 | Windows/Linux | 已补 QuickJS、V8、Capstone 与所附 LLVM 声明。Node 绑定和其余内嵌组件的完整署名仍待核查 |
| minimisted 2.0.1 | Windows/Linux | REA 明确记录的上游原文/署名缺项，保留待核查 |
| proxy-agent-negotiate 1.1.0 | Windows/Linux | 已留存可追溯的原始 HTTP 代理实现版权和 MIT 原文，独立包的完整署名待核查 |
| @img/sharp-libvips-linux-x64 1.3.4 | Linux | 已补 Sharp 第三方清单及匹配的 libvips 原文；内嵌库署名与发行要求仍待复核 |
| sherpa-onnx-linux-x64 1.13.8 | Linux | 已补 Sherpa-ONNX 及匹配的 ONNX Runtime 原文；内嵌库署名与发行要求仍待复核 |

其他平台、Electron 外壳、独立 Node/Python 分发及源码提供义务另行核对；早期 759 项清点不能覆盖这些范围。新清单与补充文件已进入源码构建路径，当前安装状态以本页开头的实包记录为准。

## clean-git-ref 发布归属复核

`clean-git-ref@2.0.1` 的 npm 归档已按发布的 SHA-512 完整性值复核，共三个文件。npm 固定提交 `bf3c8afc8032bcdc6a53634c18b601dc6df478fb` 的完整 Git 树没有独立 LICENSE 或 NOTICE；发布归档中没有额外版权头，包中声明 Apache-2.0，作者为 Eli White。所声明的 Apache 正文已在补充声明中分发。

Windows `.16.1` 实际 ASAR 中的 `lib/index.js` 和 README 与发布归档逐字节一致；package.json 只有 `scripts` 被准备流程移除，名称、版本、作者、许可、仓库与主页字段均保留。由此完成原待办的发布归属与整合分发核对，清点器不再将该精确版本标为材料缺口。其他版本不沿用此结论，错误版本与摘要变动继续拒绝。`.16.2` 实际清单已复算为 Windows 6 项、Linux 8 项待核查，原包记录仍保留；此项不替代总体许可兼容性审查。

证据在 `20261116/notice-review/` 的 npm 归档、`clean-git-ref-2.0.1-inventory.json`、`clean-git-ref-installed.json` 与 `read-installed-clean-git.mjs`。原始登记为 `20261116/clean-git-ref-2.0.1-registry.json`。[发布归档](https://registry.npmjs.org/clean-git-ref/-/clean-git-ref-2.0.1.tgz) · [固定提交](https://github.com/elicwhite/clean-git-ref/tree/bf3c8afc8032bcdc6a53634c18b601dc6df478fb)

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
