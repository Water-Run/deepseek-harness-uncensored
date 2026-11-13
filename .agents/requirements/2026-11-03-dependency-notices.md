# 16.07 依赖声明审计

状态：进行中，不代表整合发行的许可核对已完成。用户的 GPL 许可偏好、上游 Credit 和各组件原有许可保持不变。

当前 Windows 检查版 `0.1.0-test.20261113.4` 包含 917 个 npm 包、21 份补充声明，7 项待核查。实际安装器内适用的补充原文逐项匹配固定摘要，Electron 与安装器声明核对通过。Linux `.linux.3` 实际两种归档均为 919 个 npm 包、26 份补充声明和 9 项待核查，WASM Office 三份原文及补充文本摘要通过；旧包数量保留为历史。现存交付证据见 [HANDOFF](../HANDOFF.md)。

当前 7 项分别为 `brotli@1.3.3`、`dfa@1.2.0`、`fontkit@2.0.4`、`frida@17.23.2`、`proxy-agent-negotiate@1.1.0`、`clean-git-ref@2.0.1`、`minimisted@2.0.1`。自动清点的待核查标志继续保留，不能以安装器已能运行推定许可证义务已完成。下文各版本和数量属于其注明日期的验证。

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

## 最新检查包仍需核查的 7 项

| 包与版本 | 剩余核查 |
| --- | --- |
| brotli 1.3.3 | 已补 Google 解码器、固定子模块和 Emscripten 运行时声明，包装代码原始署名、精确编译器版本及链接组件清单待核对 |
| clean-git-ref 2.0.1 | 已补所声明的 Apache 2.0 正文，上游专属署名和整合发行核对仍待完成 |
| dfa 1.2.0 | npm 包及固定源提交没有独立许可原文 |
| fontkit 2.0.4 | 已补八张 Mac 编码表的归属声明。该版本的完整许可原文与 Apple 数据分发条款仍待核对 |
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
