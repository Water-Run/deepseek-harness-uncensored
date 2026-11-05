# 17.06 PDF 阅读器 Factory 验收

状态：本节点源码已随 `7db7e35015` 检查包安装，安装器实际载荷和实装隔离运行验证通过。原有其他交付范围继续保留，安装证据见 [HANDOFF](../HANDOFF.md)。

## 已完成

- [x] `PdfBodyInjected` 仅保留标签保留回调和表面类名，移除 `ZoomViewport` 组件值。主包组件通过 Factory 的局部 `viewport` 位置选择，惰性正文调用框架提供的 `useFactorySlot`。
- [x] 具名 `sidebar.document.pdf.reader` Factory 统一原生 PDF 和 Office 转换 PDF。入口只转发明确的文档输入和已有标签读取器，不把整份标准 props、store 或组件放进输入数据。
- [x] 阅读状态由根作用域的声明 store 按标签保存；两个标签互不影响，正文暂时卸载后可恢复，标签结束或插件释放时清理。PDF 加载、分页、缩放与文本选择逻辑保留在原来的惰性正文中。
- [x] 真实 Factory/Renderer 组合验证局部视口身份稳定、输入更新保留内容、隐藏重开保留阅读状态和标签取消清理。真实 Sidebar 文档入口另验证绑定的标签读取器可传入惰性 Factory，并选中主包视口。
- [x] 文档预览包 57 个文件、608 项回归通过；补充真实文档入口后该文件 9 项通过。公开声明 395 项、领域图、运行时 UI 目录、完整产物构建及其后的 Host/Client 检查通过。
- [x] 实际打包的惰性 PDF/表格块许可、模块加载与依赖闭合用例通过，未增加从 PDF 惰性块直接引用主包实现的通道。独立 NodeNext 消费者只读取公开入口，验证输入类型与 Factory 声明可达，并拒绝把组件放进文档输入；未使用源码别名。回执 `.dsh-build/pdf-factory-external-types-20261106-result.json`。
- [x] 移除一条测试中的旧 `as unknown` 断言，基线从 1,277 降至 1,276，没有增加允许项。

## 证据

本节点日志前缀 `.dsh-build/pdf-factory-`：`regression-20261106.log` 为整包回归，`runtime-20261106.log` 为真实 Factory 组合，`bound-document-20261106.log` 为真实文档入口，`published-20261106.log` 为实包测试。产物构建为 `artifacts-final-20261106.log`，后续编译检查为 `check-final-20261106.log`，公开声明为 `types-20261106.log`。

未修改 Session 字段、SDK 事件或模式提示；没有使用 Computer Use。原有关闭竞态、跨平台、历史回放和原图终验仍未完成，打包及无界面运行不替代 PDF 桌面交互终验。
