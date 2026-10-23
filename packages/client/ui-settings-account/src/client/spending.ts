/** Assemble the shared spending controls over the built-in Host ledger. */
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SpendSnapshot } from '@deepseek-ai/dsh-spend-limit/types'
import { SpendingController } from './spending-controller.ts'
import { SpendingSettings, SpendingSidebar, SpendingToast } from './SpendingView.tsx'
import type { SpendingInjected } from './SpendingView.tsx'

async function unwrap(request: Promise<RemoteResult<SpendSnapshot>>): Promise<SpendSnapshot> {
  const result = await request
  if (!result.ok) throw result.error
  return result.value
}

/**
 * Register spending controls and feedback.
 * @param ctx - Account plugin scope, independent of Settings panels.
 */
export function registerSpending(ctx: Context): void {
  ctx.inject(['remote.spending'], (scope) => {
    const controller = new SpendingController(() => unwrap(scope.remote.spending.get()))
    scope.effect(() => () => controller.dispose(), 'account: spending requests')
    const inject = (): SpendingInjected => ({ hooks: { spending: controller.state }, refreshSpending: controller.refresh,
      configureSpending: value => controller.mutate(() => unwrap(scope.remote.spending.configure(value))),
      resetSpending: () => controller.mutate(() => unwrap(scope.remote.spending.reset())),
      resumeSpending: () => controller.mutate(() => unwrap(scope.remote.spending.resume())), dismissSpendingToast: controller.dismiss })
    scope.slots.inject('settings.budget.item', () => scope.slots.register({ name: 'settings.budget.item', id: 'spending', order: 10, label: () => scope.locale.bind('settings.account')('spending.title'), locale: 'settings.account', inject }, SpendingSettings))
    scope.slots.inject('shell.overlay', () => scope.slots.register({ name: 'shell.overlay', id: 'spending-feedback', locale: 'settings.account', inject }, SpendingToast))
    scope.slots.inject('sidebar.footer.action', () => scope.slots.register({ name: 'sidebar.footer.action', id: 'spending-state', order: -11, locale: 'settings.account', inject }, SpendingSidebar))
  })
}
