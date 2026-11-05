/** Locale bundles for the agent-preset hero chip, header label, and management section. */

import { guideEn, guideJa, guideEs, guideFr, guideDe, guideRu, guidePt, guideZh, type PresetGuideKey } from './guide-locales.ts'

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | 'modeSwitch.allow' | 'modeSwitch.hint' | 'modeSwitch.choose' | 'modeSwitch.current' | 'modeSwitch.running'
  | 'modeSwitch.done' | 'modeSwitch.failed' | 'modeSwitch.saved' | 'modeSwitch.saveFailed'
  | 'modeSwitch.confirmTitle' | 'modeSwitch.warning' | 'modeSwitch.sessionOnly' | 'modeSwitch.countdown'
  | 'modeSwitch.confirm' | 'modeSwitch.cancel' | 'modeSwitch.retry' | 'modeSwitch.locked'
  | 'modeSwitch.blocked' | 'modeSwitch.disabled' | 'modeSwitch.reload'
  | 'sensitive.allow' | 'sensitive.hint' | 'sensitive.confirmTitle' | 'sensitive.warning' | 'sensitive.off'
  | 'sensitive.countdown' | 'sensitive.confirm' | 'sensitive.cancel' | 'sensitive.retry'
  | 'sensitive.saved' | 'sensitive.offSaved' | 'sensitive.saveFailed' | 'sensitive.reload'
  | 'pageTitle' | 'currentMode' | 'modeConfig' | 'modeConfigHint' | 'modeConfigTabs' | 'configure'
  | 'selectCurrent' | 'selected'
  | 'securityEntry.title' | 'securityEntry.responsibility' | 'securityEntry.scope'
  | 'securityEntry.protectionLabel' | 'securityEntry.protection.checking'
  | 'securityEntry.protection.enabled' | 'securityEntry.protection.disabled' | 'securityEntry.protection.unavailable'
  | 'securityEntry.protection.enabledDetail' | 'securityEntry.protection.disabledDetail'
  | 'securityEntry.protection.unavailableDetail' | 'securityEntry.protection.capabilitiesLabel'
  | 'securityEntry.capability.mainlandDomains' | 'securityEntry.capability.targetRules'
  | 'securityEntry.declarationLabel' | 'securityEntry.declarationHint'
  | 'securityEntry.countdown' | 'securityEntry.ready' | 'securityEntry.confirm'
  | 'securityEntry.cancel' | 'securityEntry.retry' | 'securityEntry.loading' | 'securityEntry.retryHint'
  | 'securityEntry.error.changed' | 'securityEntry.error.declaration' | 'securityEntry.error.disconnected'
  | 'securityEntry.error.expired' | 'securityEntry.error.failed'
  | 'securityEntry.settings' | 'securityEntry.noDeclaration'
  | PresetGuideKey
  | 'builtInGroup'
  | 'customGroup'
  | 'seatHint'
  | 'headerHint'
  | 'nav'
  | 'sectionIntro'
  | 'setDefault'
  | 'view'
  | 'presetStandardName'
  | 'presetStandardDescription'
  | 'presetWritingName'
  | 'presetWritingDescription'
  | 'presetSecurityName'
  | 'presetSecurityDescription'
  | 'presetReverseName'
  | 'presetReverseDescription'
  | 'presetPtcName'
  | 'presetPtcDescription'
  | 'presetMinimalName'
  | 'presetMinimalDescription'
  | 'presetCordisName'
  | 'presetCordisDescription'
  | 'inUse'
  | 'noDescription'
  | 'brokenBadge'
  | 'switchRefused'
  | 'standardUnavailable'
  | 'close'
  | 'creatorDraft'
  | 'createPlugin'
  | 'createPluginDescription'
  | 'createPluginChecking'
  | 'createPluginUnavailable'
  | 'createPluginMissing'

/** English copy. */
export const en: Record<AgentPresetSettingsKey, string> = {
  'modeSwitch.allow': 'Allow mode changes in existing conversations',
  'modeSwitch.hint': 'Off by default and reset on restart. New conversations can always select a mode; existing conversations must be idle.',
  'modeSwitch.choose': 'Change conversation mode',
  'modeSwitch.current': 'Conversation mode: {mode}',
  'modeSwitch.running': 'Wait for the current task to finish before changing mode',
  'modeSwitch.done': 'Conversation mode changed',
  'modeSwitch.failed': 'Could not change mode. Check that switching is enabled and the task is idle.',
  'modeSwitch.saved': 'Mode switching permission updated',
  'modeSwitch.saveFailed': 'Could not save the preference. Try again.',
  'modeSwitch.confirmTitle': 'Allow mode changes in existing conversations?',
  'modeSwitch.warning': 'Changing mode replaces the tools and instructions used by an existing conversation. Its earlier messages remain and may conflict with the new mode. Stop running tasks and review the conversation before changing its mode.',
  'modeSwitch.sessionOnly': 'This permission applies until the application restarts. New conversations do not need it.',
  'modeSwitch.countdown': 'Read and confirm ({seconds}s)',
  'modeSwitch.confirm': 'Allow for this launch',
  'modeSwitch.cancel': 'Cancel',
  'modeSwitch.retry': 'Restart confirmation',
  'modeSwitch.reload': 'Retry permission check',
  'modeSwitch.locked': 'This conversation keeps its current mode. You can enable temporary switching below or choose a mode for a new conversation.',
  'modeSwitch.blocked': 'The mode was not changed because this conversation keeps its current mode. Enable temporary switching below, or choose a mode for a new conversation.',
  'modeSwitch.disabled': 'Changing the mode of an existing conversation is off. Enable it under Settings → Modes.',
  'sensitive.allow': 'Confirm sensitive actions',
  'sensitive.hint': 'On by default. When on, entering Security mode, changing an existing conversation and similar actions ask for a countdown or a typed statement first. Turning it off removes those dialogs for every mode.',
  'sensitive.confirmTitle': 'Turn off sensitive-action confirmations?',
  'sensitive.warning': 'Without confirmations, entering Security mode and changing an existing conversation no longer stop for a countdown or a typed statement. The actions themselves still run under the same tools and permissions.',
  'sensitive.off': 'Turning this off takes effect after a confirmed countdown. Turning it back on applies immediately.',
  'sensitive.countdown': 'Turn off after ({seconds}s)',
  'sensitive.confirm': 'Turn off confirmations',
  'sensitive.cancel': 'Cancel',
  'sensitive.retry': 'Restart confirmation',
  'sensitive.saved': 'Sensitive-action confirmations are on',
  'sensitive.offSaved': 'Sensitive-action confirmations are off',
  'sensitive.saveFailed': 'Could not save the preference. Try again.',
  'sensitive.reload': 'Retry preference check',
  pageTitle: 'Modes',
  modeConfig: 'Mode configuration',
  modeConfigHint: 'Configure one mode here. This never changes the mode of the current conversation.',
  modeConfigTabs: 'Modes with configuration',
  configure: 'Configure',
  'securityEntry.title': 'Before entering Security mode',
  'securityEntry.responsibility': 'Security mode runs real commands and reaches target systems. You are responsible for the targets and actions you choose.',
  'securityEntry.scope': 'Use it only on systems you are authorized to test and within an agreed scope. The software does not decide whether a target is authorized.',
  'securityEntry.protectionLabel': 'Mainland website protection',
  'securityEntry.protection.checking': 'Checking',
  'securityEntry.protection.enabled': 'Enabled and available',
  'securityEntry.protection.disabled': 'Off',
  'securityEntry.protection.unavailable': 'Cannot be confirmed',
  'securityEntry.protection.enabledDetail': 'The guarded web fetch and independent proxy apply protection before connecting.',
  'securityEntry.protection.disabledDetail': 'Protection is off. This confirmation records only your acknowledgement.',
  'securityEntry.protection.unavailableDetail': 'The required network protection or country data is unavailable. A written acknowledgement is required.',
  'securityEntry.protection.capabilitiesLabel': 'Capabilities currently enforced:',
  'securityEntry.capability.mainlandDomains': 'Mainland website domains',
  'securityEntry.capability.targetRules': 'Target and production rules',
  'securityEntry.declarationLabel': 'Acknowledgement',
  'securityEntry.declarationHint': 'Type the hinted statement. Full-width and half-width forms are equivalent.',
  'securityEntry.countdown': 'Read and confirm ({seconds}s)',
  'securityEntry.ready': 'Ready to confirm',
  'securityEntry.confirm': 'Confirm and enter Security mode',
  'securityEntry.cancel': 'Cancel',
  'securityEntry.retry': 'Retry',
  'securityEntry.loading': 'Preparing the confirmation',
  'securityEntry.retryHint': 'Retry to read the current protection state.',
  'securityEntry.error.changed': 'Protection changed. Read the updated status and confirm again',
  'securityEntry.error.declaration': 'The statement does not match. Type it exactly as shown',
  'securityEntry.error.disconnected': 'The connection was lost. Retry',
  'securityEntry.error.expired': 'The confirmation expired. Retry',
  'securityEntry.error.failed': 'Confirmation failed. Retry',
  'securityEntry.settings': 'Open mode settings',
  'securityEntry.noDeclaration': 'Protection is enabled and available. Confirm after the countdown.',
  currentMode: 'Current mode', selectCurrent: 'Select mode', selected: 'Selected',
  ...guideEn,
  builtInGroup: 'Built-in', customGroup: 'Custom',
  sectionIntro: 'Choose the mode the current conversation uses. Each mode\'s own configuration sits below and never changes that choice.',

  seatHint: 'Choose the agent preset for your new task',
  headerHint: 'The mode currently used by this conversation',
  nav: 'Modes',

  setDefault: 'Set as default',
  view: 'View configuration',

  presetStandardName: 'Default',
  presetStandardDescription:
    'Development and everyday work: edit files, run commands, research, and delegate tasks.',
  presetWritingName: 'Writing',
  presetWritingDescription:
    'Fiction, scripts, and long-form writing: research, continue, and revise while preserving characters, viewpoint, and continuity.',
  presetSecurityName: 'Security',
  presetReverseName: 'Reverse engineering',
  presetReverseDescription: 'Trace application behavior, inspect binaries and protocols, and connect findings to verifiable evidence.',
  presetSecurityDescription:
    'Security analysis and testing: inspect code and configuration, reproduce issues, verify fixes, and retain evidence.',
  presetPtcName: 'PTC mode',
  presetPtcDescription: 'Includes all Default mode capabilities.',
  presetMinimalName: 'Minimal mode',
  presetMinimalDescription: 'Terminal and image reading with context compaction.',
  presetCordisName: 'Creator mode',
  presetCordisDescription: 'Customize DSH by conversation.',

  inUse: 'New task default',

  noDescription: 'No description.',
  brokenBadge: 'Failed to load',

  switchRefused: 'Could not switch to {name}: {reason}',
  standardUnavailable: 'Default mode is unavailable. Restore it or choose another available mode.',

  close: 'Close',

  creatorDraft: 'Let the agent help me create a preset',
  createPlugin: 'Let the agent create a plugin',
  createPluginDescription: 'Enter Creator mode and make your own DSH plugin',
  createPluginChecking: 'Checking whether Creator mode is available',
  createPluginUnavailable: 'Temporarily unavailable. Reopen this menu to retry',
  createPluginMissing: 'Creator mode is not included in this configuration',

}

/** Simplified Chinese copy. */
export const zh: Record<AgentPresetSettingsKey, string> = {
  'modeSwitch.allow': '允许已有会话切换模式',
  'modeSwitch.hint': '默认关闭，重启后自动关闭。新对话始终可以选择模式，已有对话仅在空闲时允许切换。',
  'modeSwitch.choose': '切换会话模式',
  'modeSwitch.current': '会话模式：{mode}',
  'modeSwitch.running': '当前任务结束后才能切换模式',
  'modeSwitch.done': '会话模式已切换',
  'modeSwitch.failed': '切换失败，请确认已开启切换权限，并等待当前任务结束',
  'modeSwitch.saved': '模式切换权限已更新',
  'modeSwitch.saveFailed': '设置保存失败，请重试',
  'modeSwitch.confirmTitle': '允许已有对话切换模式？',
  'modeSwitch.warning': '切换会替换已有对话使用的工具和指令。历史消息仍会保留，可能与新模式发生冲突。请先结束运行中的任务，并确认当前对话适合切换。',
  'modeSwitch.sessionOnly': '仅本次启动有效，软件重启后自动关闭。新对话选择模式不受影响。',
  'modeSwitch.countdown': '阅读后确认（{seconds} 秒）',
  'modeSwitch.confirm': '本次启动允许切换',
  'modeSwitch.cancel': '取消',
  'modeSwitch.retry': '重新确认',
  'modeSwitch.reload': '重新读取权限',
  'modeSwitch.locked': '当前对话保持原模式。可在下方临时允许切换，或为新对话选择模式。',
  'modeSwitch.blocked': '当前对话保持原模式，未执行切换。可在下方临时允许切换，或为新对话选择模式。',
  'modeSwitch.disabled': '已有对话默认不能切换模式，可在“设置 → 模式”中临时允许。',
  'sensitive.allow': '敏感操作需要确认',
  'sensitive.hint': '默认开启。开启时，进入网安模式、切换已有对话的模式等操作会先要求阅读倒计时或输入声明；关闭后这些确认弹窗对所有模式都不再出现。',
  'sensitive.confirmTitle': '关闭敏感操作确认？',
  'sensitive.warning': '关闭后，进入网安模式和切换已有对话的模式不再要求倒计时或输入声明。操作本身仍受原有工具和权限限制。',
  'sensitive.off': '关闭需要倒计时确认后生效；重新开启立即生效。',
  'sensitive.countdown': '关闭并确认（{seconds} 秒）',
  'sensitive.confirm': '关闭确认',
  'sensitive.cancel': '取消',
  'sensitive.retry': '重新确认',
  'sensitive.saved': '敏感操作确认已开启',
  'sensitive.offSaved': '敏感操作确认已关闭',
  'sensitive.saveFailed': '设置保存失败，请重试',
  'sensitive.reload': '重新读取设置',
  pageTitle: '模式',
  modeConfig: '模式配置',
  modeConfigHint: '在这里配置某个模式的资料与选项，不会切换当前对话的模式。',
  modeConfigTabs: '可配置的模式',
  configure: '配置',
  'securityEntry.title': '进入网安模式前的确认',
  'securityEntry.responsibility': '网安模式会执行真实命令并访问目标系统。你对自己选择的目标和操作负责。',
  'securityEntry.scope': '只在已获得授权、范围明确的系统上使用。软件不会判断某个目标是否已获授权。',
  'securityEntry.protectionLabel': '境内网站保护',
  'securityEntry.protection.checking': '读取中',
  'securityEntry.protection.enabled': '已启用且可用',
  'securityEntry.protection.disabled': '已关闭',
  'securityEntry.protection.unavailable': '无法确认',
  'securityEntry.protection.enabledDetail': '受控网页抓取和独立代理会在连接前执行检查',
  'securityEntry.protection.disabledDetail': '保护未启用，本次确认只记录你的责任声明。',
  'securityEntry.protection.unavailableDetail': '执行后端或地区数据当前不可用，需输入责任声明',
  'securityEntry.protection.capabilitiesLabel': '当前生效的保护能力：',
  'securityEntry.capability.mainlandDomains': '境内网站域名保护',
  'securityEntry.capability.targetRules': '目标与生产规则',
  'securityEntry.declarationLabel': '责任声明',
  'securityEntry.declarationHint': '请按提示完整输入声明，全角与半角视为相同。',
  'securityEntry.countdown': '阅读并确认（{seconds} 秒）',
  'securityEntry.ready': '阅读完毕，可以确认',
  'securityEntry.confirm': '确认并进入网安模式',
  'securityEntry.cancel': '取消',
  'securityEntry.retry': '重试',
  'securityEntry.loading': '正在准备确认',
  'securityEntry.retryHint': '重试以读取当前保护状态。',
  'securityEntry.error.changed': '保护状态已变化，请重新阅读并确认',
  'securityEntry.error.declaration': '声明不一致，请按原文完整输入',
  'securityEntry.error.disconnected': '连接已断开，请重试',
  'securityEntry.error.expired': '确认已过期，请重试',
  'securityEntry.error.failed': '确认失败，请重试',
  'securityEntry.settings': '打开模式设置',
  'securityEntry.noDeclaration': '保护已启用且可用，阅读倒计时结束后即可确认。',
  currentMode: '当前模式', selectCurrent: '选择模式', selected: '当前选择',
  ...guideZh,
  builtInGroup: '内置', customGroup: '自定义',
  sectionIntro: '选择当前对话使用的模式。各模式自己的配置在下方，与这个选择无关。',

  seatHint: '选择新会话的模式',
  headerHint: '本会话当前使用的模式',
  nav: '模式',

  setDefault: '设为默认',
  view: '查看配置',

  presetStandardName: '缺省',
  presetStandardDescription: '开发与日常任务：读写文件、执行命令、检索资料，并拆分任务协作。',
  presetWritingName: '写作',
  presetWritingDescription: '小说、剧本与长文创作：整理资料、续写和润色，保持人物、视角与情节一致。',
  presetSecurityName: '网安',
  presetReverseName: '逆向',
  presetReverseDescription: '分析程序、二进制与协议，追踪调用和运行行为，用证据还原实现。',
  presetSecurityDescription: '安全分析与测试：检查代码和配置、复现问题、验证修复，并保留可复核的操作与结果。',
  presetPtcName: 'PTC 模式',
  presetPtcDescription: '包含标准模式的所有能力。',
  presetMinimalName: '极简模式',
  presetMinimalDescription: '终端与图片读取，支持上下文压缩。',
  presetCordisName: '创造模式',
  presetCordisDescription: '用对话定制 DSH。',

  inUse: '新任务默认',

  noDescription: '暂无描述。',
  brokenBadge: '加载失败',

  switchRefused: '无法切换到「{name}」：{reason}',
  standardUnavailable: '缺省模式不可用，请恢复该模式或选择其他可用模式。',

  close: '关闭',

  creatorDraft: '让 Agent 帮我创建预设模式',
  createPlugin: '让 Agent 创建插件',
  createPluginDescription: '进入创造模式，制作属于你的 DSH 插件',
  createPluginChecking: '正在确认创造模式是否可用',
  createPluginUnavailable: '暂时不可用，请重新打开菜单重试',
  createPluginMissing: '当前配置未提供创造模式',

}

// The resolution itself is the shared fold in `dsh-agent-preset-registry/display`,
// re-exported here so every surface in this plugin reads one path; the
// Settings plugin list inlines the same fold over this plugin's dictionaries.
export { isBuiltInPreset, presetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
export type { PresetDisplaySource, PresetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'

/** Japanese copy, checked against the English keys. */
export const ja = {
  ...en,
  ...guideJa,
  'builtInGroup': '組み込み',
  'customGroup': 'カスタム',
  'sectionIntro': 'エージェントのツールと動作を選択します。日々のタスクには標準モードを、DSH に機能を追加するにはクリエイターモードを使用してください。',
  'seatHint': '新しいタスクで使用するエージェントプリセットを選択',
  'headerHint': 'このタスクの開始時に選択されたエージェントプリセット',
  'nav': 'エージェントプリセット',
  'setDefault': '新しいタスクの既定に設定',
  'view': '設定を表示',
  'presetStandardName': '標準モード',
  'presetStandardDescription': 'コード、ファイル、情報を扱います。検索、編集、ターミナルコマンドなどのツールを必要に応じて利用でき、ほとんどのタスクに適しています。',
  'presetPtcName': 'PTC モード',
  'presetPtcDescription': '標準モードのすべての機能を含みます。ツールを一括で呼び出し、その結果を絞り込み、整理、重複排除、集計、要約するタスクに適しています。',
  'presetMinimalName': '最小モード',
  'presetMinimalDescription': 'エージェントはターミナルと画像読み取りを使用し、コンテキスト圧縮にも対応します。基本的な性能のテストや比較に役立ちます。',
  'presetCordisName': 'クリエイターモード',
  'presetCordisDescription': '会話を通じて DSH をカスタマイズします。機能や UI を追加するプラグインをエージェントに書かせたり、ツールとプロンプトを組み合わせて独自のモードを作成したりできます。',
  'inUse': '新しいタスクの既定',
  'noDescription': '説明はありません。',
  'brokenBadge': '読み込みに失敗',
  'switchRefused': '{name} に切り替えられませんでした: {reason}',
  'standardUnavailable': '標準モードは利用できません。復元するか、利用可能な別のモードを選択してください。',
  'close': '閉じる',
  'creatorDraft': 'エージェントにプリセット作成を手伝ってもらう',
  'createPlugin': 'エージェントにプラグインを作成してもらう',
  'createPluginDescription': 'クリエイターモードに入り、独自の DSH プラグインを作成',
  'createPluginChecking': 'クリエイターモードが利用可能か確認中',
  'createPluginUnavailable': '一時的に利用できません。このメニューを開き直して再試行してください',
  'createPluginMissing': 'この構成にはクリエイターモードが含まれていません',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  ...en,
  ...guideEs,
  builtInGroup: 'Incorporado', customGroup: 'personalizado',
  sectionIntro: 'Elija las herramientas del agente y cómo funciona. Utilice el modo Estándar para las tareas diarias o el modo Creador para agregar capacidades a DSH.',

  seatHint: 'Elija el agente preestablecido para su nueva tarea',
  headerHint: 'El agente preestablecido elegido cuando comenzó esta tarea',
  nav: 'Ajustes preestablecidos del agente',

  setDefault: 'Establecer como nueva tarea predeterminada',
  view: 'Ver configuración',

  presetStandardName: 'Modo estándar',
  presetStandardDescription:
    'Trabaje con código, archivos e información. Adecuado para la mayoría de las tareas, con búsqueda, edición, comandos de terminal y otras herramientas disponibles según sea necesario.',
  presetPtcName: 'Modo PTC',
  presetPtcDescription:
    'Incluye todas las capacidades del modo Estándar. Más adecuado para tareas que llaman a herramientas en lotes y luego filtran, organizan, deduplican, cuentan o resumen los resultados.',
  presetMinimalName: 'modo mínimo',
  presetMinimalDescription:
    'El agente utiliza un terminal y lectura de imágenes, con compactación de contexto. Útil para probar y comparar su rendimiento básico.',
  presetCordisName: 'Modo creador',
  presetCordisDescription:
    'Personaliza DSH a través de la conversación. Deje que el agente escriba complementos que agreguen funciones o interfaz de usuario, o combine herramientas e indicaciones para crear su propio modo.',

  inUse: 'Nueva tarea predeterminada',

  noDescription: 'Sin descripción.',
  brokenBadge: 'No se pudo cargar',

  switchRefused: 'No se pudo cambiar a {name}: {reason}',
  standardUnavailable: 'El modo estándar no está disponible. Restáuralo o elige otro modo disponible.',

  close: 'Cerrar',

  creatorDraft: 'Deja que el agente me ayude a crear un preset',
  createPlugin: 'Deje que el agente cree un complemento',
  createPluginDescription: 'Ingrese al modo Creador y cree su propio complemento DSH',
  createPluginChecking: 'Comprobando si el modo Creador está disponible',
  createPluginUnavailable: 'Temporalmente no disponible. Vuelve a abrir este menú para volver a intentarlo.',
  createPluginMissing: 'El modo creador no está incluido en esta configuración.',

} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  ...en,
  ...guideFr,
  builtInGroup: 'Intégré', customGroup: 'Personnalisé',
  sectionIntro: 'Choisissez les outils de l’agent et son fonctionnement. Utilisez le mode Standard pour les tâches quotidiennes ou le mode Créateur pour ajouter des fonctionnalités à DSH.',

  seatHint: "Choisissez le préréglage d'agent pour votre nouvelle tâche",
  headerHint: "Le préréglage d'agent choisi au démarrage de cette tâche",
  nav: "Préréglages d'agent",

  setDefault: 'Définir comme nouvelle tâche par défaut',
  view: 'Afficher la configuration',

  presetStandardName: 'Mode standard',
  presetStandardDescription:
    'Travaillez avec du code, des fichiers et des informations. Convient à la plupart des tâches, avec recherche, édition, commandes de terminal et autres outils disponibles selon les besoins.',
  presetPtcName: 'Mode PTC',
  presetPtcDescription:
    'Inclut toutes les fonctionnalités du mode Standard. Mieux adapté aux tâches qui appellent des outils par lots, puis filtrent, organisent, dédupliquent, comptent ou résument les résultats.',
  presetMinimalName: 'Mode minimal',
  presetMinimalDescription:
    "L'agent utilise un terminal et une lecture d'image, avec compactage du contexte. Utile pour tester et comparer ses performances de base.",
  presetCordisName: 'Mode Créateur',
  presetCordisDescription:
    "Personnalisez DSH via la conversation. Laissez l'agent écrire des plugins qui ajoutent des fonctionnalités ou une interface utilisateur, ou combinez des outils et des invites pour créer votre propre mode.",

  inUse: 'Nouvelle tâche par défaut',

  noDescription: 'Aucune description.',
  brokenBadge: 'Échec du chargement',

  switchRefused: 'Impossible de passer à {name} : {reason}',
  standardUnavailable: "Le mode standard n'est pas disponible. Restaurez-le ou choisissez un autre mode disponible.",

  close: 'Fermer',

  creatorDraft: "Laissez l'agent m'aider à créer un préréglage",
  createPlugin: "Laissez l'agent créer un plugin",
  createPluginDescription: 'Entrez en mode Créateur et créez votre propre plugin DSH',
  createPluginChecking: 'Vérifier si le mode Créateur est disponible',
  createPluginUnavailable: 'Temporairement indisponible. Rouvrez ce menu pour réessayer',
  createPluginMissing: "Le mode Créateur n'est pas inclus dans cette configuration",

} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  ...en,
  ...guideDe,
  builtInGroup: 'Eingebaut', customGroup: 'Benutzerdefiniert',
  sectionIntro: 'Wählen Sie die Tools des Agenten und deren Funktionsweise aus. Verwenden Sie den Standardmodus für alltägliche Aufgaben oder den Creator-Modus, um DSH Funktionen hinzuzufügen.',

  seatHint: 'Wählen Sie die Agentenvoreinstellung für Ihre neue Aufgabe',
  headerHint: 'Die Agentenvoreinstellung, die beim Start dieser Aufgabe ausgewählt wurde',
  nav: 'Agentenvoreinstellungen',

  setDefault: 'Als Standard für neue Aufgabe festlegen',
  view: 'Konfiguration anzeigen',

  presetStandardName: 'Standardmodus',
  presetStandardDescription:
    'Arbeiten Sie mit Code, Dateien und Informationen. Geeignet für die meisten Aufgaben, da bei Bedarf Suche, Bearbeitung, Terminalbefehle und andere Tools verfügbar sind.',
  presetPtcName: 'PTC-Modus',
  presetPtcDescription:
    'Beinhaltet alle Funktionen des Standardmodus. Besser geeignet für Aufgaben, bei denen Tools stapelweise aufgerufen und die Ergebnisse dann gefiltert, organisiert, dedupliziert, gezählt oder zusammengefasst werden.',
  presetMinimalName: 'Minimalmodus',
  presetMinimalDescription:
    'Der Agent verwendet ein Terminal und das Lesen von Bildern mit Kontextkomprimierung. Nützlich zum Testen und Vergleichen der Grundleistung.',
  presetCordisName: 'Erstellermodus',
  presetCordisDescription:
    'Passen Sie DSH durch Gespräche an. Lassen Sie den Agenten Plugins schreiben, die Funktionen oder Benutzeroberflächen hinzufügen, oder kombinieren Sie Tools und Eingabeaufforderungen, um Ihren eigenen Modus zu erstellen.',

  inUse: 'Neuer Aufgabenstandard',

  noDescription: 'Keine Beschreibung.',
  brokenBadge: 'Laden fehlgeschlagen',

  switchRefused: 'Konnte nicht zu {name} wechseln: {reason}',
  standardUnavailable: 'Der Standardmodus ist nicht verfügbar. Stellen Sie es wieder her oder wählen Sie einen anderen verfügbaren Modus.',

  close: 'Schließen',

  creatorDraft: 'Lassen Sie sich vom Agenten beim Erstellen einer Voreinstellung helfen',
  createPlugin: 'Lassen Sie den Agenten ein Plugin erstellen',
  createPluginDescription: 'Wechseln Sie in den Erstellermodus und erstellen Sie Ihr eigenes DSH-Plugin',
  createPluginChecking: 'Prüfen, ob der Creator-Modus verfügbar ist',
  createPluginUnavailable: 'Vorübergehend nicht verfügbar. Öffnen Sie dieses Menü erneut, um es erneut zu versuchen',
  createPluginMissing: 'Der Creator-Modus ist in dieser Konfiguration nicht enthalten',

} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  ...en,
  ...guideRu,
  builtInGroup: 'Встроенный', customGroup: 'Пользовательский',
  sectionIntro: 'Выбирайте инструменты агента и то, как они работают. Используйте стандартный режим для повседневных задач или режим Creator, чтобы расширить возможности DSH.',

  seatHint: 'Выберите предустановку агента для вашей новой задачи',
  headerHint: 'Предварительная настройка агента, выбранная при запуске этой задачи',
  nav: 'Настройки агента',

  setDefault: 'Установить в качестве новой задачи по умолчанию',
  view: 'Посмотреть конфигурацию',

  presetStandardName: 'Стандартный режим',
  presetStandardDescription:
    'Работайте с кодом, файлами и информацией. Подходит для большинства задач, с поиском, редактированием, командами терминала и другими инструментами, доступными по мере необходимости.',
  presetPtcName: 'Режим PTC',
  presetPtcDescription:
    'Включает все возможности стандартного режима. Лучше подходит для задач, которые вызывают инструменты в пакетном режиме, а затем фильтруют, организуют, дедуплицируют, подсчитывают или суммируют результаты.',
  presetMinimalName: 'Минимальный режим',
  presetMinimalDescription:
    'Агент использует терминал и чтение изображений со сжатием контекста. Полезно для тестирования и сравнения его базовой производительности.',
  presetCordisName: 'Режим автора',
  presetCordisDescription:
    'Настройте DSH через разговор. Позвольте агенту писать плагины, которые добавляют функции или пользовательский интерфейс, или комбинируйте инструменты и подсказки для создания собственного режима.',

  inUse: 'Новая задача по умолчанию',

  noDescription: 'Нет описания.',
  brokenBadge: 'Не удалось загрузить',

  switchRefused: 'Не удалось переключиться на {name}: {reason}',
  standardUnavailable: 'Стандартный режим недоступен. Восстановите его или выберите другой доступный режим.',

  close: 'Закрыть',

  creatorDraft: 'Позвольте агенту помочь мне создать пресет',
  createPlugin: 'Позвольте агенту создать плагин',
  createPluginDescription: 'Войдите в режим Creator и создайте свой собственный плагин DSH.',
  createPluginChecking: 'Проверка доступности режима Creator',
  createPluginUnavailable: 'Временно недоступен. Откройте это меню еще раз, чтобы повторить попытку.',
  createPluginMissing: 'Режим Creator не включен в эту конфигурацию.',

} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  ...en,
  ...guidePt,
  builtInGroup: 'Integrado', customGroup: 'Personalizado',
  sectionIntro: 'Escolha as ferramentas do agente e como funciona. Use o modo Padrão para tarefas diárias ou o modo Criador para adicionar recursos ao DSH.',

  seatHint: 'Escolha a predefinição de agente para sua nova tarefa',
  headerHint: 'A predefinição do agente escolhida quando esta tarefa foi iniciada',
  nav: 'Predefinições de agente',

  setDefault: 'Definir como nova tarefa padrão',
  view: 'Ver configuração',

  presetStandardName: 'Modo padrão',
  presetStandardDescription:
    'Trabalhe com código, arquivos e informações. Adequado para a maioria das tarefas, com pesquisa, edição, comandos de terminal e outras ferramentas disponíveis conforme necessário.',
  presetPtcName: 'modo PTC',
  presetPtcDescription:
    'Inclui todos os recursos do modo Padrão. Mais adequado para tarefas que chamam ferramentas em lotes e depois filtram, organizam, desduplicam, contam ou resumem os resultados.',
  presetMinimalName: 'Modo mínimo',
  presetMinimalDescription:
    'O agente utiliza terminal e leitura de imagens, com compactação de contexto. Útil para testar e comparar seu desempenho básico.',
  presetCordisName: 'Modo criador',
  presetCordisDescription:
    'Personalize DSH por meio de conversa. Deixe o agente escrever plug-ins que adicionem recursos ou UI, ou combine ferramentas e prompts para criar seu próprio modo.',

  inUse: 'Novo padrão de tarefa',

  noDescription: 'Nenhuma descrição.',
  brokenBadge: 'Falha ao carregar',

  switchRefused: 'Não foi possível mudar para {name}: {reason}',
  standardUnavailable: 'O modo padrão não está disponível. Restaure-o ou escolha outro modo disponível.',

  close: 'Fechar',

  creatorDraft: 'Deixe o agente me ajudar a criar uma predefinição',
  createPlugin: 'Deixe o agente criar um plugin',
  createPluginDescription: 'Entre no modo Criador e crie seu próprio plug-in DSH',
  createPluginChecking: 'Verificando se o modo Criador está disponível',
  createPluginUnavailable: 'Temporariamente indisponível. Reabra este menu para tentar novamente',
  createPluginMissing: 'O modo criador não está incluído nesta configuração',

} satisfies Record<keyof typeof en, string>
