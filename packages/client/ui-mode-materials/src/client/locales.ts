/** Locale bundles for the mode-materials settings surface. */

/** Locale keys this surface renders. */
export type ModeMaterialsKey =
  | 'reverse.empty' | 'reverse.builtin.ledger' | 'reverse.builtin.ledgerDetail'
  | 'reverse.builtin.inventory' | 'reverse.builtin.inventoryDetail' | 'reverse.builtin.report' | 'reverse.builtin.reportDetail'
  | 'rea.engine.configured' | 'rea.engine.discover' | 'rea.engine.missing' | 'rea.engine.unreadable'
  | 'rea.title'
  | 'rea.intro'
  | 'rea.enable'
  | 'rea.unavailable'
  | 'rea.nodePath'
  | 'rea.cliPath'
  | 'rea.ghidraPath'
  | 'rea.javaHome'
  | 'rea.idaConfig'
  | 'rea.nodePathHint'
  | 'rea.cliPathHint'
  | 'rea.ghidraPathHint'
  | 'rea.javaHomeHint'
  | 'rea.idaConfigHint'
  | 'rea.provider'
  | 'rea.auto'
  | 'rea.note'
  | 'rea.check'
  | 'rea.saved'
  | 'rea.failed'
  | 'rea.connected'
  | 'rea.engineNote'
  | 'rea.catalog'
  | 'rea.search'
  | 'nav'
  | 'memory.manage'
  | 'scope.label' | 'scope.none' | 'scope.noneHint' | 'scope.choose' | 'scope.pickFailed' | 'scope.range'
  | 'loading' | 'reload' | 'save' | 'saving' | 'cancel' | 'close' | 'delete' | 'edit' | 'add' | 'view' | 'back'
  | 'unknownError' | 'conflict' | 'conflictHint' | 'unsaved'
  | 'problem.no-workspace' | 'problem.workspace-missing' | 'problem.unreadable'
  | 'problem.corrupt' | 'problem.unsupported-version' | 'problem.conflict'
  | 'security.title' | 'security.intro' | 'security.empty' | 'security.new' | 'security.newTitle'
  | 'security.slug' | 'security.slugHint' | 'security.objective' | 'security.create' | 'security.open'
  | 'security.records' | 'security.targets' | 'security.evidence' | 'security.findings' | 'security.notes'
  | 'security.report' | 'security.reportTitle' | 'security.broken' | 'security.protection'
  | 'security.extraKeys' | 'security.updatedAt' | 'security.counts' | 'security.noRecords'
  | 'reverse.title' | 'reverse.intro' | 'reverse.tools' | 'reverse.toolsHint'
  | 'reverse.toolAvailable' | 'reverse.toolUnavailable'
  | 'reverse.sample' | 'reverse.samplePath' | 'reverse.inspect' | 'reverse.inspectHint'
  | 'reverse.samplePlaceholder'
  | 'reverse.sampleResult' | 'reverse.hash' | 'reverse.format' | 'reverse.formatUnknown'
  | 'reverse.entropy' | 'reverse.strings' | 'reverse.stringsTruncated' | 'reverse.sampleEmpty'
  | 'writing.title' | 'writing.intro' | 'writing.selection' | 'writing.selectionHint'
  | 'writing.selectedCount' | 'writing.style' | 'writing.bible' | 'writing.empty' | 'writing.unregistered'
  | 'writing.adopt' | 'writing.new' | 'writing.newTitle' | 'writing.name' | 'writing.section'
  | 'writing.titleField' | 'writing.content' | 'writing.select' | 'writing.deselect'
  | 'writing.deleteTitle' | 'writing.deleteBody' | 'writing.missing' | 'writing.bytes'
  | 'writing.saved' | 'writing.injectionNote'
  | 'field.value' | 'field.label' | 'field.note' | 'field.kind' | 'field.ref' | 'field.title'
  | 'field.severity' | 'field.target' | 'field.cvss' | 'field.evidence' | 'field.status' | 'field.body'
  | 'record.add' | 'record.edit' | 'record.deleteTitle' | 'record.deleteBody' | 'record.evidenceHint'
  | 'record.saved' | 'record.created'

/** English copy. */
export const en: Record<ModeMaterialsKey, string> = {
  'reverse.empty': 'This workspace has no reverse analysis cases yet.',
  'reverse.builtin.ledger': 'Analysis case ledger',
  'reverse.builtin.ledgerDetail': 'Manage targets, evidence, findings and notes under .reverse/<slug>/case.json.',
  'reverse.builtin.inventory': 'Sample inventory',
  'reverse.builtin.inventoryDetail': 'Read hashes, formats, entropy and strings without executing samples.',
  'reverse.builtin.report': 'Analysis report',
  'reverse.builtin.reportDetail': 'Generate a Markdown report from the saved case evidence.',
  'rea.engine.configured': 'Path found; analysis not yet checked',
  'rea.engine.discover': 'Detected by REA when needed',
  'rea.engine.missing': 'Configured path is missing or has the wrong type',
  'rea.engine.unreadable': 'Configured path could not be checked',
  'rea.title': 'REA external analysis',
  'rea.intro': 'Connect an installed REA runtime and discover its full tool catalog on demand. Each reverse conversation owns its analysis process.',
  'rea.enable': 'Enable REA',
  'rea.unavailable': 'REA settings cannot be saved in this profile',
  'rea.nodePath': 'Node executable',
  'rea.cliPath': 'REA entry file',
  'rea.ghidraPath': 'Ghidra installation',
  'rea.javaHome': 'Java home',
  'rea.idaConfig': 'IDA MCP configuration',
  'rea.nodePathHint': 'Full path to the Node executable',
  'rea.cliPathHint': 'Full path to rea-agents/scripts/rea.mjs',
  'rea.ghidraPathHint': 'Optional; let REA discover it when empty',
  'rea.javaHomeHint': 'Optional; let REA discover it when empty',
  'rea.idaConfigHint': 'Optional; path to existing IDA MCP configuration',
  'rea.provider': 'Native analysis engine',
  'rea.auto': 'Automatic',
  'rea.note': 'Saving closes existing REA connections; reopen samples to continue. External engines require full access and are unavailable to quick questions.',
  'rea.check': 'Check connection',
  'rea.saved': 'Configuration saved',
  'rea.failed': 'REA connection or configuration failed: {reason}',
  'rea.connected': 'Connected · {count} tools',
  'rea.engineNote': 'The connection check confirms REA availability. Optional engines such as Ghidra, IDA and Hopper validate versions and dependencies when opening a sample and report missing requirements.',
  'rea.catalog': 'View tool catalog',
  'rea.search': 'Search tool names',
  'memory.manage': 'Manage memory for this mode',
  nav: 'Mode materials',
  'scope.label': 'Workspace',
  'scope.none': 'No workspace selected',
  'scope.noneHint': 'Mode materials live inside a workspace. Choose one to see the cases and writing documents it already holds.',
  'scope.choose': 'Choose a workspace…',
  'scope.pickFailed': 'Could not open the directory picker: {reason}',
  'scope.range': 'Materials are read from and written to this workspace only.',
  loading: 'Reading…',
  reload: 'Read again',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  close: 'Close',
  delete: 'Delete',
  edit: 'Edit',
  add: 'Add',
  view: 'View',
  back: 'Back to list',
  unknownError: 'The request failed: {reason}',
  conflict: 'This file changed in another window or script, so the edit was not saved.',
  conflictHint: 'Read it again, then reapply the edit.',
  unsaved: 'Unsaved changes',
  'problem.no-workspace': 'Select a workspace to manage its mode materials.',
  'problem.workspace-missing': 'The workspace directory is no longer available.',
  'problem.unreadable': 'The materials could not be read with the current permissions.',
  'problem.corrupt': 'A stored file is malformed and was not opened.',
  'problem.unsupported-version': 'A stored file uses a newer format than this build understands.',
  'problem.conflict': 'The file changed since it was opened.',

  'security.title': 'Security materials',
  'security.intro': 'Cases, targets, evidence, findings, and notes live in .security/<slug>/case.json, the same format casefile.mjs reads.',
  'security.empty': 'This workspace has no security case yet.',
  'security.new': 'New case',
  'security.newTitle': 'New security case',
  'security.slug': 'Case directory name',
  'security.slugHint': 'Letters, digits, dot, underscore, and hyphen.',
  'security.objective': 'Objective',
  'security.create': 'Create case',
  'security.open': 'Open case',
  'security.records': 'Case records',
  'security.targets': 'Targets',
  'security.evidence': 'Evidence',
  'security.findings': 'Findings',
  'security.notes': 'Notes',
  'security.report': 'Report',
  'security.reportTitle': 'Case report',
  'security.broken': '{slug} cannot be read: {reason}',
  'security.protection': 'A target is case data here. Domestic-domain and production protection are not enforced by this build, so recording a target never blocks an operation.',
  'security.extraKeys': '{count} field(s) in this file are not edited here and stay untouched when saving.',
  'security.updatedAt': 'Updated {time}',
  'security.counts': '{targets} targets · {evidence} evidence · {findings} findings · {notes} notes',
  'security.noRecords': 'No records yet.',

  'reverse.title': 'Reverse-engineering materials',
  'reverse.intro': 'Analysis cases live in .reverse/<slug>/case.json. Inventory only reads sample bytes; it never executes a sample.',
  'reverse.tools': 'Tool status',
  'reverse.toolsHint': 'Only what this machine actually reaches is listed as available. An unconnected bridge is reported here and never downloaded or installed.',
  'reverse.toolAvailable': 'Available',
  'reverse.toolUnavailable': 'Not connected',
  'reverse.sample': 'Sample inventory',
  'reverse.samplePath': 'Sample path, relative to the workspace',
  'reverse.inspect': 'Read and inventory',
  'reverse.inspectHint': 'Computes hash, container format, entropy, and printable strings from the bytes. The sample is never executed or loaded.',
  'reverse.samplePlaceholder': 'samples/file.bin',
  'reverse.sampleResult': 'Inventory result',
  'reverse.hash': 'SHA-256',
  'reverse.format': 'Format',
  'reverse.formatUnknown': 'Unrecognized',
  'reverse.entropy': 'Entropy',
  'reverse.strings': 'Strings',
  'reverse.stringsTruncated': 'Only the first {count} runs are shown',
  'reverse.sampleEmpty': 'Read a sample to inventory it.',

  'writing.title': 'Writing materials',
  'writing.intro': 'Style cards and canon live in story/style and story/bible. Selected materials are sent with every writing request.',
  'writing.selection': 'Materials used by writing requests',
  'writing.selectionHint': 'Clearing a selection or deleting a record never deletes the source document.',
  'writing.selectedCount': '{count} selected',
  'writing.style': 'Style cards',
  'writing.bible': 'Story bible',
  'writing.empty': 'This workspace has no writing material yet.',
  'writing.unregistered': 'Documents outside the registry',
  'writing.adopt': 'Add to registry',
  'writing.new': 'New material',
  'writing.newTitle': 'New writing material',
  'writing.name': 'File name without .md',
  'writing.section': 'Section',
  'writing.titleField': 'Title',
  'writing.content': 'Content (Markdown)',
  'writing.select': 'Use for writing',
  'writing.deselect': 'Stop using',
  'writing.deleteTitle': 'Delete this material record?',
  'writing.deleteBody': 'The record for {path} and its selection are removed. The source document under story/ stays in the workspace.',
  'writing.missing': 'Source document is missing',
  'writing.bytes': '{count} bytes',
  'writing.saved': 'Saved',
  'writing.injectionNote': 'Only checked materials enter writing requests; the other files in story/ are never sent.',

  'field.value': 'Value',
  'field.label': 'Label',
  'field.note': 'Note',
  'field.kind': 'Kind',
  'field.ref': 'Reference',
  'field.title': 'Title',
  'field.severity': 'Severity',
  'field.target': 'Target',
  'field.cvss': 'CVSS',
  'field.evidence': 'Evidence ids',
  'field.status': 'Status',
  'field.body': 'Body',
  'record.add': 'Add {collection}',
  'record.edit': 'Edit {collection}',
  'record.deleteTitle': 'Delete this record?',
  'record.deleteBody': 'The record is removed from case.json. Samples, evidence files, and other workspace documents are untouched.',
  'record.evidenceHint': 'Comma-separated evidence ids, for example E-0001, E-0002.',
  'record.saved': 'Record saved',
  'record.created': 'Record added',
}

/** Simplified Chinese copy. */
export const zh: Record<ModeMaterialsKey, string> = {
  'reverse.empty': '这个工作区还没有逆向分析案件',
  'reverse.builtin.ledger': '分析案件',
  'reverse.builtin.ledgerDetail': '在 .reverse/<slug>/case.json 中管理目标、证据、发现与笔记',
  'reverse.builtin.inventory': '样本清点',
  'reverse.builtin.inventoryDetail': '读取哈希、格式、熵与字符串，不执行样本',
  'reverse.builtin.report': '分析报告',
  'reverse.builtin.reportDetail': '根据已保存的案件证据生成 Markdown 报告',
  'rea.engine.configured': '路径存在 · 待实际分析验证',
  'rea.engine.discover': '由 REA 在调用时检测',
  'rea.engine.missing': '配置路径不存在或类型不符',
  'rea.engine.unreadable': '无法检查配置路径',
  'rea.title': 'REA 外部分析',
  'rea.intro': '连接已安装的 REA，按需使用其完整工具目录；每个逆向会话拥有独立的分析进程。',
  'rea.enable': '启用 REA',
  'rea.unavailable': '当前配置无法保存 REA 设置',
  'rea.nodePath': 'Node 可执行文件',
  'rea.cliPath': 'REA 入口文件',
  'rea.ghidraPath': 'Ghidra 安装目录',
  'rea.javaHome': 'Java 安装目录',
  'rea.idaConfig': 'IDA MCP 配置文件',
  'rea.nodePathHint': 'Node 可执行文件的完整路径',
  'rea.cliPathHint': 'rea-agents/scripts/rea.mjs 的完整路径',
  'rea.ghidraPathHint': '可选；留空由 REA 检测',
  'rea.javaHomeHint': '可选；留空由 REA 检测',
  'rea.idaConfigHint': '可选；现有 IDA MCP 配置路径',
  'rea.provider': '原生分析引擎',
  'rea.auto': '自动选择',
  'rea.note': '保存配置会关闭已有 REA 连接；重新打开样本后继续分析。外部引擎需要完全权限，随问不会启动它们。',
  'rea.check': '检测连接',
  'rea.saved': '配置已保存',
  'rea.failed': 'REA 连接或配置失败：{reason}',
  'rea.connected': '连接成功 · {count} 个工具',
  'rea.engineNote': '连接成功仅确认 REA 可用。Ghidra、IDA、Hopper 等可选引擎在实际打开样本时检查版本和依赖；缺失时会返回具体原因。',
  'rea.catalog': '查看工具目录',
  'rea.search': '搜索工具名称',
  'memory.manage': '管理此模式的记忆',
  nav: '模式资料',
  'scope.label': '工作区',
  'scope.none': '尚未选择工作区',
  'scope.noneHint': '模式资料保存在工作区里。选择工作区后，这里会显示它已有的案件与写作资料。',
  'scope.choose': '选择工作区…',
  'scope.pickFailed': '无法打开目录选择器：{reason}',
  'scope.range': '资料只读写这个工作区内的文件。',
  loading: '正在读取…',
  reload: '重新读取',
  save: '保存',
  saving: '保存中…',
  cancel: '取消',
  close: '关闭',
  delete: '删除',
  edit: '编辑',
  add: '添加',
  view: '查看',
  back: '返回列表',
  unknownError: '操作失败：{reason}',
  conflict: '文件已在其他窗口或脚本中修改，本次修改没有保存。',
  conflictHint: '请重新读取后再修改。',
  unsaved: '有未保存的修改',
  'problem.no-workspace': '请选择一个工作区来管理模式资料。',
  'problem.workspace-missing': '工作区目录已不可用。',
  'problem.unreadable': '当前权限无法读取这些资料。',
  'problem.corrupt': '有文件格式损坏，未打开。',
  'problem.unsupported-version': '有文件使用了本版本不认识的格式版本。',
  'problem.conflict': '文件在打开后已被修改。',

  'security.title': '网安资料',
  'security.intro': '案件、目标、证据、发现与备注写入 .security/<slug>/case.json，与 casefile.mjs 使用同一格式。',
  'security.empty': '这个工作区还没有网安案件。',
  'security.new': '新建案件',
  'security.newTitle': '新建网安案件',
  'security.slug': '案件目录名',
  'security.slugHint': '只允许字母、数字、点、下划线和连字符。',
  'security.objective': '目标',
  'security.create': '创建案件',
  'security.open': '打开案件',
  'security.records': '案件记录',
  'security.targets': '目标',
  'security.evidence': '证据',
  'security.findings': '发现',
  'security.notes': '备注',
  'security.report': '报告',
  'security.reportTitle': '案件报告',
  'security.broken': '无法读取 {slug}：{reason}',
  'security.protection': '这里的目标只是案件资料。本版本尚未执行境内域名与生产环境保护，记录目标不会阻止任何操作。',
  'security.extraKeys': '文件里有 {count} 个字段不由本界面编辑，保存时会原样保留。',
  'security.updatedAt': '更新于 {time}',
  'security.counts': '{targets} 个目标 · {evidence} 条证据 · {findings} 个发现 · {notes} 条备注',
  'security.noRecords': '还没有记录。',

  'reverse.title': '逆向资料',
  'reverse.intro': '分析案件写入 .reverse/<slug>/case.json。清点只读取样本字节，不执行样本。',
  'reverse.tools': '工具状态',
  'reverse.toolsHint': '这里只列出本机实际可用的能力。未连接的外部工具如实显示，不会自动下载或安装。',
  'reverse.toolAvailable': '可用',
  'reverse.toolUnavailable': '未接入',
  'reverse.sample': '样本清点',
  'reverse.samplePath': '样本路径（相对于工作区）',
  'reverse.inspect': '读取并清点',
  'reverse.inspectHint': '只读取文件内容计算哈希、容器格式、熵与可打印字符串，不执行、不加载样本。',
  'reverse.samplePlaceholder': 'samples/文件.bin',
  'reverse.sampleResult': '清点结果',
  'reverse.hash': 'SHA-256',
  'reverse.format': '格式',
  'reverse.formatUnknown': '未识别',
  'reverse.entropy': '熵',
  'reverse.strings': '字符串',
  'reverse.stringsTruncated': '只显示前 {count} 条',
  'reverse.sampleEmpty': '读取一个样本后显示清点结果。',

  'writing.title': '写作资料',
  'writing.intro': '文风卡与设定保存在 story/style 与 story/bible。选中的资料会随每次写作请求发送。',
  'writing.selection': '写作请求使用的资料',
  'writing.selectionHint': '取消选择或删除记录都不会删除源文件。',
  'writing.selectedCount': '已选择 {count} 份',
  'writing.style': '文风卡',
  'writing.bible': '设定集',
  'writing.empty': '这个工作区还没有写作资料。',
  'writing.unregistered': '未纳入的资料',
  'writing.adopt': '纳入列表',
  'writing.new': '新建资料',
  'writing.newTitle': '新建写作资料',
  'writing.name': '文件名（不含 .md）',
  'writing.section': '类别',
  'writing.titleField': '标题',
  'writing.content': '正文（Markdown）',
  'writing.select': '用于写作',
  'writing.deselect': '取消使用',
  'writing.deleteTitle': '删除这条资料记录？',
  'writing.deleteBody': '将删除 {path} 的资料记录并从选择中移除。story 目录里的源文件会保留。',
  'writing.missing': '源文件不存在',
  'writing.bytes': '{count} 字节',
  'writing.saved': '已保存',
  'writing.injectionNote': '只有勾选的资料会进入写作请求；story/ 下未选中的文件不会被发送。',

  'field.value': '值',
  'field.label': '标签',
  'field.note': '说明',
  'field.kind': '类型',
  'field.ref': '引用',
  'field.title': '标题',
  'field.severity': '严重级别',
  'field.target': '目标',
  'field.cvss': 'CVSS',
  'field.evidence': '证据编号',
  'field.status': '状态',
  'field.body': '正文',
  'record.add': '添加{collection}',
  'record.edit': '编辑{collection}',
  'record.deleteTitle': '删除这条记录？',
  'record.deleteBody': '将从 case.json 删除这条记录。工作区里的样本、证据文件和其他资料不会被删除。',
  'record.evidenceHint': '用英文逗号分隔证据编号，例如 E-0001, E-0002。',
  'record.saved': '记录已保存',
  'record.created': '记录已添加',
}
