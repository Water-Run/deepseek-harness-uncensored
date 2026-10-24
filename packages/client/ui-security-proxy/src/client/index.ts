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
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { SecurityProxyController, type SecurityProxyPort } from './controller.ts'
import { SecurityProxySection, SecurityProxyWarning } from './SecurityProxySection.tsx'
import type { SecurityProxyInjected, SecurityProxyWarningInjected } from './SecurityProxySection.tsx'
import { en, zh, type SecurityProxyKey } from './locales.ts'

export type { SecurityProxyInjected, SecurityProxyWarningInjected } from './SecurityProxySection.tsx'
export type { SecurityProxyKey } from './locales.ts'
export type { SecurityProxyViewState } from './controller.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'settings.securityProxy': SecurityProxyKey }
  interface SlotMap {
    /**
     * The mode configuration seat declared by ui-agent-preset, where this panel
     * joins the Security mode's tab. Declared here as well so this package
     * compiles and its contribution waits for the declaration instead of
     * failing when the seat is absent.
     */
    'settings.mode.materials': { kind: 'list'; scope: 'root'; owner: { readonly modeId: string | undefined } }
  }
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
  const warning = createSnapshotStore<{ id: number } | null>(null)
  let warningSequence = 0
  const stopWarning = ctx.remote.$on('security-proxy/warning', () => {
    warningSequence += 1
    warning.set({ id: warningSequence })
  })
  ctx.effect(() => () => { stopWarning() }, 'security-proxy: proxy-off reminder subscription')

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
  })

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'security-proxy-warning',
    locale: 'settings.securityProxy',
    inject: (): SecurityProxyWarningInjected => ({
      hooks: { securityProxyWarning: warning },
      dismissWarning: (id) => {
        if (warning.getSnapshot()?.id === id) warning.set(null)
      },
    }),
  }, SecurityProxyWarning))
}
