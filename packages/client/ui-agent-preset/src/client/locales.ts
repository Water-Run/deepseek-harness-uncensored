/** Locale bundles for the agent-preset hero chip, header label, and management section. */

import { guideEn, guideZh, type PresetGuideKey } from './guide-locales.ts'

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
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
  ...guideEn,
  builtInGroup: 'Built-in', customGroup: 'Custom',
  sectionIntro: 'Choose the agent’s tools and how it works. Use Standard mode for everyday tasks, or Creator mode to add capabilities to DSH.',

  seatHint: 'Choose the agent preset for your new task',
  headerHint: 'The agent preset chosen when this task started',
  nav: 'Modes',

  setDefault: 'Set as new task default',
  view: 'View configuration',

  presetStandardName: 'Default mode',
  presetStandardDescription:
    'Everyday default: code, files, terminal, and research tools all mounted.',
  presetWritingName: 'Writing mode',
  presetWritingDescription:
    'Free writing for fiction, scripts, and long continuations. File, research, and presentation tools only; no code execution.',
  presetSecurityName: 'Security mode',
  presetSecurityDescription:
    'Strongest composition available: every execution, delegation, and workflow tool, under red-team operating rules.',

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
  ...guideZh,
  builtInGroup: '内置', customGroup: '自定义',
  sectionIntro: '选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展 DSH 的能力用「创造模式」。',

  seatHint: '选择新任务使用的 Agent 预设',
  headerHint: '本任务的 Agent 预设，在任务开始时确定',
  nav: '模式',

  setDefault: '设为新任务默认',
  view: '查看配置',

  presetStandardName: '缺省模式',
  presetStandardDescription: '日常默认：代码、文件、终端和检索工具全开。',
  presetWritingName: '写作模式',
  presetWritingDescription: '自由写作：小说、剧本与长篇续写。只挂文件、检索与呈现工具，不做代码执行。',
  presetSecurityName: '网安模式',
  presetSecurityDescription: '本版最强组合：全量执行、委派与工作流工具，按红队作业规则运行。',

  inUse: '新任务默认',

  noDescription: '暂无描述。',
  brokenBadge: '加载失败',

  switchRefused: '无法切换到「{name}」：{reason}',
  standardUnavailable: '标准模式不可用，请恢复该模式或选择其他可用模式。',

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
