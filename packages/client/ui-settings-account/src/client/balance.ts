/** Assemble the built-in balance views over one observable controller. */
import type { Context } from '@deepseek-ai/cordis'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { BalancePreferences } from '@deepseek-ai/dsh-balance/types'
import type { AccountSnapshot } from './AccountSection.tsx'
import { accountClientMetadata } from './client-metadata.ts'
import { BalanceController } from './balance-controller.ts'
import { BalanceSettings, BalanceSidebar, type BalanceInjected } from './BalanceView.tsx'

/**
 * Bind balance settings and views to the account lifecycle.
 * @param ctx - Account plugin context.
 * @param account - Identity changes that invalidate the displayed balance.
 */
export function registerBalance(ctx: Context, account: HostObservable<AccountSnapshot>): void {
  ctx.inject(['remote.balance'], (scope) => {
    const form = scope.configForms.get<BalancePreferences>('balance')
    const controller = new BalanceController(form, async () => {
      const client = accountClientMetadata(scope.locale.getSnapshot().active, process.env.DSH_CLIENT_VERSION)
      const result = await scope.remote.balance.get(client)
      if (!result.ok) throw result.error
      return result.value
    })
    scope.effect(() => () => controller.dispose(), 'account: balance polling')
    scope.effect(() => {
      let identity = ''
      return account.subscribe(() => {
        const current = account.getSnapshot()
        const profile = current.details?.profile
        const next = `${current.view?.status ?? ''}:${profile?.status === 'ready' ? profile.value.id : ''}`
        if (identity !== next) { identity = next; controller.invalidate() }
      })
    }, 'account: balance identity')
    scope.effect(() => scope.remote.$on('credentials/reference-updated', controller.invalidate), 'account: balance credential changes')
    const injected = (): BalanceInjected => ({ hooks: { balance: controller.state, balancePreferences: form },
      refresh: controller.refresh, save: controller.save, dismissToast: controller.dismissToast })
    scope.slots.inject('sidebar.footer.budget', () => scope.slots.register({ name: 'sidebar.footer.budget', id: 'balance', order: 10,
      locale: 'settings.account', inject: injected }, BalanceSidebar))
    scope.slots.inject('settings.budget.item', () => {
      let unregister: (() => void) | undefined
      const sync = (): void => {
        if (form.getSnapshot().status === 'ready') unregister ??= scope.slots.register({ name: 'settings.budget.item', id: 'balance', order: 0,
          label: () => scope.locale.bind('settings.account')('balance.title'), locale: 'settings.account', inject: injected }, BalanceSettings)
        else { unregister?.(); unregister = undefined }
      }
      const stop = form.subscribe(sync)
      sync()
      return () => { stop(); unregister?.() }
    })
  })
}
