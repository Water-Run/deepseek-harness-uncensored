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

/** Japanese copy, checked against the English keys. */
export const ja = {
  'nav': 'プラグイン',
  'title': 'プラグイン',
  'intro': 'プラグインをインストール、有効化、設定します。',
  'tabs': 'プラグインビュー',
  'empty': 'このデプロイメントにはプラグインビューがありません。',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  nav: 'Complementos',
  title: 'Complementos',
  intro: 'Instale, active y configure complementos.',
  tabs: 'Vistas de complementos',
  empty: 'Esta implementación no expone vistas de complementos.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  nav: 'Plugins',
  title: 'Plugins',
  intro: 'Installez, activez et configurez des plugins.',
  tabs: 'Vues des plugins',
  empty: "Ce déploiement n'expose aucune vue de plugin.",
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  nav: 'Plugins',
  title: 'Plugins',
  intro: 'Plugins installieren, aktivieren und konfigurieren.',
  tabs: 'Plugin-Ansichten',
  empty: 'Diese Bereitstellung stellt keine Plugin-Ansichten bereit.',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  nav: 'Плагины',
  title: 'Плагины',
  intro: 'Устанавливайте, включайте и настраивайте плагины.',
  tabs: 'Просмотры плагинов',
  empty: 'Это развертывание не предоставляет никаких представлений плагинов.',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  nav: 'Plug-ins',
  title: 'Plug-ins',
  intro: 'Instale, ative e configure plug-ins.',
  tabs: 'Visualizações de plug-in',
  empty: 'Esta implantação não expõe visualizações de plug-ins.',
} satisfies Record<keyof typeof en, string>
