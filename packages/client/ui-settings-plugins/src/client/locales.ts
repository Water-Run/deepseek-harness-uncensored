/** Locale bundles for the built-in plugins settings section. */

/** Locale keys the section renders. */
export type PluginsSettingsLocaleKey = 'nav' | 'title' | 'intro' | 'tabs' | 'empty'

/** English copy. */
export const en: Record<PluginsSettingsLocaleKey, string> = {
  nav: 'Plugins',
  title: 'Plugins',
  intro: 'Install, enable and configure plugins.',
  tabs: 'Plugin views',
  empty: 'This deployment exposes no plugin views.',
}

/** Simplified Chinese copy. */
export const zh: Record<PluginsSettingsLocaleKey, string> = {
  nav: '插件',
  title: '插件',
  intro: '安装、启用和配置插件',
  tabs: '插件视图',
  empty: '本部署没有开放任何插件视图。',
}
