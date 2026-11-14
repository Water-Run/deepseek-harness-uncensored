/** Register optional language definitions through the public client plugin protocol. */
window.__ModuleLoader__.load({
  id: '@fixture/language-pack',
  factory() {
    return {
      inject: ['locale'],
      apply(ctx) {
        for (const [id, label] of [
          ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'],
          ['ru', 'Русский'], ['pt', 'Português'], ['ja', '日本語'],
        ]) {
          ctx.effect(() => ctx.locale.addLanguage({ id, label, fallback: 'en' }))
        }
      },
    }
  },
})
