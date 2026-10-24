/** Locale bundles for the agent-preset hero chip, header label, and management section. */

import { guideEn, guideZh, type PresetGuideKey } from './guide-locales.ts'

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | 'modeSwitch.allow' | 'modeSwitch.hint' | 'modeSwitch.choose' | 'modeSwitch.current' | 'modeSwitch.running'
  | 'modeSwitch.done' | 'modeSwitch.failed' | 'modeSwitch.saved' | 'modeSwitch.saveFailed'
  | 'modeSwitch.confirmTitle' | 'modeSwitch.warning' | 'modeSwitch.sessionOnly' | 'modeSwitch.countdown'
  | 'modeSwitch.confirm' | 'modeSwitch.cancel' | 'modeSwitch.retry' | 'modeSwitch.locked'
  | 'modeSwitch.reload'
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
  | 'currentMode' | 'selectCurrent' | 'selected'
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
  'securityEntry.title': 'Before entering Security mode',
  'securityEntry.responsibility': 'Security mode runs real commands and reaches target systems. You are responsible for the targets and actions you choose.',
  'securityEntry.scope': 'Use it only on systems you are authorized to test and within an agreed scope. The software does not decide whether a target is authorized.',
  'securityEntry.protectionLabel': 'Mainland website protection',
  'securityEntry.protection.checking': 'Checking',
  'securityEntry.protection.enabled': 'Enabled and available',
  'securityEntry.protection.disabled': 'Off',
  'securityEntry.protection.unavailable': 'Cannot be confirmed',
  'securityEntry.protection.enabledDetail': 'The protection provider reports it is enabled. Your target settings and permissions still apply.',
  'securityEntry.protection.disabledDetail': 'Protection is off. This confirmation records only your acknowledgement.',
  'securityEntry.protection.unavailableDetail': 'No protection backend is available; this is treated as protection off. Protection cannot be confirmed.',
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
  sectionIntro: 'Choose the mode for the current conversation. New conversations always start in Standard.',

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
  presetPtcDescription: 'Includes all Standard mode capabilities.',
  presetMinimalName: 'Minimal mode',
  presetMinimalDescription: 'Terminal and image reading with context compaction.',
  presetCordisName: 'Creator mode',
  presetCordisDescription: 'Customize DSH by conversation.',

  inUse: 'New task default',

  noDescription: 'No description.',
  brokenBadge: 'Failed to load',

  switchRefused: 'Could not switch to {name}: {reason}',
  standardUnavailable: 'Standard mode is unavailable. Restore it or choose another available mode.',

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
  'securityEntry.title': '进入网安模式前的确认',
  'securityEntry.responsibility': '网安模式会执行真实命令并访问目标系统。你对自己选择的目标和操作负责。',
  'securityEntry.scope': '只在已获得授权、范围明确的系统上使用。软件不会判断某个目标是否已获授权。',
  'securityEntry.protectionLabel': '境内网站保护',
  'securityEntry.protection.checking': '读取中',
  'securityEntry.protection.enabled': '已启用且可用',
  'securityEntry.protection.disabled': '已关闭',
  'securityEntry.protection.unavailable': '无法确认',
  'securityEntry.protection.enabledDetail': '保护提供方报告保护已启用。操作仍受你的目标设置和权限限制。',
  'securityEntry.protection.disabledDetail': '保护未启用，本次确认只记录你的责任声明。',
  'securityEntry.protection.unavailableDetail': '当前没有可用的保护后端，按未启用处理，无法确认保护已生效。',
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
  sectionIntro: '选择当前对话的模式。新对话默认使用缺省，可在开始前手动选择其他模式。',

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
