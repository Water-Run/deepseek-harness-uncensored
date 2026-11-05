/**
 * Security-proxy settings surface: registration of the Modes-section area, the
 * proxy-off reminder, and the Remote port the controller drives.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { SecurityProxyController, type SecurityProxyPort } from './controller.ts'
import { SecurityProxySection } from './SecurityProxySection.tsx'
import { SecurityProxyBanner } from './SecurityProxyBanner.tsx'
import type { SecurityProxyInjected } from './SecurityProxySection.tsx'
import { en, zh, type SecurityProxyKey } from './locales.ts'
import { TargetSettingsController } from './target-protection-controller.ts'
import { TargetProtectionSection } from './TargetProtectionSection.tsx'

export type { SecurityProxyInjected } from './SecurityProxySection.tsx'
export type { SecurityProxyKey } from './locales.ts'
export type { SecurityProxyViewState } from './controller.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'settings.securityProxy': SecurityProxyKey }
}

/** Services required by this surface. */
export const inject = ['slots', 'locale', 'remote']

/** Unwrap one Remote answer or throw its typed failure. */
async function unwrap<T>(request: Promise<RemoteResult<T>>): Promise<T> {
  const result = await request
  if (!result.ok) throw result.error
  return result.value
}

/**
 * Register the security-proxy settings area and its reminder.
 * @param ctx - client plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('settings.securityProxy', { en, zh }), 'security-proxy: dictionaries')

  ctx.inject(['remote.targetProtectionSettings'], (scope) => {
    const controller = new TargetSettingsController(scope.remote.targetProtectionSettings)
    scope.on('connection/reset', () => controller.reset())
    scope.effect(() => () => controller.dispose(), 'target-protection: settings requests')
    scope.slots.inject('settings.mode.materials', () => scope.slots.register({
      name: 'settings.mode.materials', id: 'security-target-protection', order: 21, locale: 'settings.securityProxy',
      inject: () => ({ hooks: { targetSettings: controller.state }, load: controller.load, save: controller.save,
        updateCountry: controller.updateCountry }),
    }, TargetProtectionSection))
  })

  ctx.inject(['remote.securityProxy'], (scope) => {
    const port: SecurityProxyPort = {
      get: () => unwrap(scope.remote.securityProxy.get()),
      configure: patch => unwrap(scope.remote.securityProxy.configure(patch)),
      setPassword: password => unwrap(scope.remote.securityProxy.setPassword(password)),
      test: () => unwrap(scope.remote.securityProxy.test()),
      list: query => unwrap(scope.remote.securityProxy.list(query)),
      detail: id => unwrap(scope.remote.securityProxy.detail(id)),
      clear: () => unwrap(scope.remote.securityProxy.clear()),
      pause: paused => unwrap(scope.remote.securityProxy.pause(paused)),
    }
    const controller = new SecurityProxyController(port)
    scope.effect(() => () => controller.dispose(), 'security-proxy: settings requests')
    controller.load()
    const sectionInject = (): SecurityProxyInjected => ({
      hooks: { securityProxy: controller.state },
      load: controller.load,
      refreshFlows: controller.refreshFlows,
      configure: controller.configure,
      setPassword: controller.setPassword,
      test: controller.test,
      pause: controller.setPaused,
      clear: controller.clear,
      openFlow: controller.openFlow,
      closeFlow: controller.closeFlow,
      setFilter: controller.setFilter,
      dismissFeedback: controller.dismiss,
    })
    scope.slots.inject('settings.mode.materials', () => scope.slots.register({
      name: 'settings.mode.materials',
      id: 'security-proxy',
      order: 20,
      locale: 'settings.securityProxy',
      inject: sectionInject,
    }, SecurityProxySection))
    scope.slots.inject('conversation.mode.notice', () => scope.slots.register({
      name: 'conversation.mode.notice', id: 'security-proxy', locale: 'settings.securityProxy',
      inject: () => ({ hooks: { securityProxy: controller.state }, load: controller.load, configure: controller.configure }),
    }, SecurityProxyBanner))
  })
}
