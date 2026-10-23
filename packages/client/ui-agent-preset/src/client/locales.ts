/** Locale bundles for the agent-preset hero chip, header label, and management section. */

import { guideEn, guideZh, type PresetGuideKey } from './guide-locales.ts'

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | 'modeSwitch.allow' | 'modeSwitch.hint' | 'modeSwitch.choose' | 'modeSwitch.current' | 'modeSwitch.running'
  | 'modeSwitch.done' | 'modeSwitch.failed' | 'modeSwitch.saved' | 'modeSwitch.saveFailed'
  | 'modeSwitch.confirmTitle' | 'modeSwitch.warning' | 'modeSwitch.sessionOnly' | 'modeSwitch.countdown'
  | 'modeSwitch.confirm' | 'modeSwitch.cancel' | 'modeSwitch.retry' | 'modeSwitch.locked'
  | 'modeSwitch.reload'
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
