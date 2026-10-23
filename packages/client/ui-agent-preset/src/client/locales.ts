/** Locale bundles for the agent-preset hero chip, header label, and management section. */

import { guideEn, guideZh, type PresetGuideKey } from './guide-locales.ts'

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | 'modeSwitch.allow' | 'modeSwitch.hint' | 'modeSwitch.choose' | 'modeSwitch.current' | 'modeSwitch.running'
  | 'modeSwitch.done' | 'modeSwitch.failed' | 'modeSwitch.saved' | 'modeSwitch.saveFailed'
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
  'modeSwitch.hint': 'Off by default. New conversations always allow mode selection; existing conversations must be idle.',
  'modeSwitch.choose': 'Change conversation mode',
  'modeSwitch.current': 'Conversation mode: {mode}',
  'modeSwitch.running': 'Wait for the current task to finish before changing mode',
  'modeSwitch.done': 'Conversation mode changed',
  'modeSwitch.failed': 'Could not change mode. Check that switching is enabled and the task is idle.',
  'modeSwitch.saved': 'Mode switching preference saved',
  'modeSwitch.saveFailed': 'Could not save the preference. Try again.',
  ...guideEn,
  builtInGroup: 'Built-in', customGroup: 'Custom',
  sectionIntro: 'Choose the tools and working style for new conversations. Existing conversations keep their mode by default.',

  seatHint: 'Choose the agent preset for your new task',
  headerHint: 'The mode currently used by this conversation',
  nav: 'Modes',

  setDefault: 'Set as new task default',
  view: 'View configuration',

  presetStandardName: 'Default mode',
  presetStandardDescription:
    'Development and everyday work: edit files, run commands, research, and delegate tasks.',
  presetWritingName: 'Writing mode',
  presetWritingDescription:
    'Fiction, scripts, and long-form writing: research, continue, and revise while preserving characters, viewpoint, and continuity.',
  presetSecurityName: 'Security mode',
  presetReverseName: 'Reverse engineering mode',
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
  'modeSwitch.hint': '默认关闭。新会话始终可以选择模式，已有会话需空闲后才能切换。',
  'modeSwitch.choose': '切换会话模式',
  'modeSwitch.current': '会话模式：{mode}',
  'modeSwitch.running': '当前任务结束后才能切换模式',
  'modeSwitch.done': '会话模式已切换',
  'modeSwitch.failed': '切换失败，请确认已开启切换权限，并等待当前任务结束',
  'modeSwitch.saved': '模式切换设置已保存',
  'modeSwitch.saveFailed': '设置保存失败，请重试',
  ...guideZh,
  builtInGroup: '内置', customGroup: '自定义',
  sectionIntro: '为新会话选择工具与工作方式。已有会话默认保持原模式。',

  seatHint: '选择新会话的模式',
  headerHint: '本会话当前使用的模式',
  nav: '模式',

  setDefault: '设为新任务默认',
  view: '查看配置',

  presetStandardName: '缺省模式',
  presetStandardDescription: '开发与日常任务：读写文件、执行命令、检索资料，并拆分任务协作。',
  presetWritingName: '写作模式',
  presetWritingDescription: '小说、剧本与长文创作：整理资料、续写和润色，保持人物、视角与情节一致。',
  presetSecurityName: '网安模式',
  presetReverseName: '逆向模式',
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
