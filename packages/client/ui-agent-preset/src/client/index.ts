/** Mode selection for new conversations, policy-controlled changes for existing
 * conversations, and the settings roster with its default and composition reader. */

// Type-only: pulls the Session Controller service merge (ctx.sessions).
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { WeakMapWithValues } from '@deepseek-ai/dsh-util-values'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ctx.remote merge and the forwarded-event key face
// (the settings invalidation rides the allowlist) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the Workspace UI navigation service merge (ctx.uiWorkspace).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { CreatePluginMenuItem } from './CreatePluginMenuItem.tsx'
import type { AgentPresetLabelInjected } from './AgentPresetLabel.tsx'
import { AgentPresetSeat } from './AgentPresetSeat.tsx'
import type { AgentPresetSeatInjected } from './AgentPresetSeat.tsx'
import { AgentPresetSection } from './AgentPresetSection.tsx'
import type { AgentPresetSectionInjected } from './AgentPresetSection.tsx'
import { AgentPresetSeatController, type AgentPresetStage } from './seat-store.ts'
import { AgentPresetSectionController } from './section-store.ts'
import { en, zh, type AgentPresetSettingsKey } from './locales.ts'
import { AGENT_PRESET_SETTINGS_NS, AgentPresetSettingsController } from './settings-store.ts'
import { ModeSwitchController, ModeSwitchToast, SessionModeControl } from './mode-switch.tsx'
import type { ModeSwitchInjected } from './mode-switch.tsx'
import { SensitiveConfirmationsController } from './sensitive-confirmations-controller.ts'
import { SensitiveConfirmationsPrompt, SensitiveConfirmationsSetting } from './SensitiveConfirmations.tsx'
import type { SensitiveConfirmationsInjected } from './SensitiveConfirmations.tsx'
import { SecurityEntryController } from './security-entry-controller.ts'
import { SecurityEntryDialog } from './SecurityEntryDialog.tsx'
import type { SecurityEntryDialogInjected } from './SecurityEntryDialog.tsx'
import type { SecurityEntryLocale } from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { CurrentModeState } from './AgentPresetSection.tsx'
import { installModeAccent } from './mode-accent.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agent-preset surface copy. */
    'settings.agentPreset': AgentPresetSettingsKey
  }

  interface SlotMap {
    /**
     * Configuration of one mode, rendered under the mode page's configuration
     * tabs. A contribution registers under the preset id it configures, which
     * is what puts that preset on the page's tab list; every panel decides from
     * `modeId` alone whether it paints, so several panels can serve one mode.
     * `modeId` is the mode being configured, never the conversation's own mode,
     * so configuring a mode never requires selecting it.
     */
    'settings.mode.materials': { kind: 'list'; scope: 'root'; owner: ModeMaterialsOwnerProps }
  }
}

/** Owner share of the mode-materials seat: the mode whose configuration is shown. */
export interface ModeMaterialsOwnerProps {
  /** Preset identity being configured on the mode page, or undefined before a roster is available. */
  readonly modeId: string | undefined
}

export type { AgentPresetLabelInjected, AgentPresetLabelProps } from './AgentPresetLabel.tsx'
export type { SensitiveConfirmationsInjected } from './SensitiveConfirmations.tsx'
export type { SensitiveConfirmationsState } from './sensitive-confirmations-controller.ts'
export type { AgentPresetSeatInjected, AgentPresetSeatProps } from './AgentPresetSeat.tsx'
export type { AgentPresetSectionInjected, AgentPresetSectionProps } from './AgentPresetSection.tsx'
export type { AgentPresetSeatState } from './seat-store.ts'
export type { AgentPresetSectionState, PresetView } from './section-store.ts'
export type { AgentPresetOption, AgentPresetSettingsState } from './settings-store.ts'
export { AGENT_PRESET_SETTINGS_NS, writeDefaultPreset } from './settings-store.ts'

/** Required services (cordis fiber inject). */
export const inject = [
  'slots', 'sessions', 'locale', 'remote', 'remote.agentPresets', 'remote.settings', 'configForms',
]

/**
 * Mount the roster surfaces: hero chip, session-header label, settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const toolsSettings = ctx.configForms.get<{ enabled: boolean }>('ui-settings')
  const presetSettings = ctx.configForms.get(AGENT_PRESET_SETTINGS_NS)
  let active = true
  // Host preferences start at false before their first accepted document.
  const codingToolsDisabled = (): boolean => active && toolsSettings.getSnapshot().value?.enabled === false
  const controller = new AgentPresetSettingsController(ctx)
  const staged: AgentPresetStage = { id: undefined, introduce: false }
  const currentMode = createSnapshotStore<CurrentModeState>({ blank: true, busy: false })
  // Preset ids that publish a configuration panel. The mode page offers one
  // configuration tab per id it can also resolve in the roster; a contribution
  // therefore declares which mode it configures by registering under that id.
  const configurableModes = createSnapshotStore<readonly string[]>([])
  const syncConfigurableModes = (): void => {
    const ids = [...new Set(ctx.slots.entries('settings.mode.materials')
      .map(entry => entry.options.id)
      .filter((id): id is string => id !== undefined))].sort()
    const current = configurableModes.getSnapshot()
    if (current.length === ids.length && current.every((id, index) => id === ids[index])) return
    configurableModes.set(ids)
  }
  ctx.effect(() => {
    syncConfigurableModes()
    return ctx.slots.subscribe('settings.mode.materials', syncConfigurableModes)
  }, 'ui-agent-preset: configurable mode panels')
  const seats = new WeakMapWithValues<SessionBinding, AgentPresetSeatController>()
  const boundSeatDisposers = new Set<() => Promise<void>>()
  const securityEntry = new SecurityEntryController({
    read: async () => {
      const result = await ctx.remote.agentPresets.securityEntryState()
      if (!result.ok) throw result.error
      return result.value
    },
    begin: async (sessionId, locale) => {
      const result = await ctx.remote.agentPresets.beginSecurityEntry(sessionId, locale)
      if (!result.ok) throw result.error
      return result.value
    },
    confirm: async (id, sessionId, declaration) => {
      const result = await ctx.remote.agentPresets.confirmSecurityEntry(id, sessionId, declaration)
      if (!result.ok) throw result.error
      return result.value
    },
    cancel: async (id) => {
      const result = await ctx.remote.agentPresets.cancelSecurityEntry(id)
      if (!result.ok) throw result.error
      return result.value
    },
  }, (): SecurityEntryLocale => ctx.locale.getSnapshot().active.toLowerCase().startsWith('zh') ? 'zh' : 'en')
  ctx.effect(() => () => { securityEntry.dispose() }, 'ui-agent-preset: security entry confirmation')
  ctx.effect(() => async () => {
    await Promise.all([...boundSeatDisposers].map(dispose => dispose()))
  }, 'ui-agent-preset: bound selections')
  const unboundSeat = new AgentPresetSeatController(ctx, () => undefined, staged, securityEntry)
  const seatFor = (binding: SessionBinding): AgentPresetSeatController => {
    const existing = seats.get(binding)
    if (existing !== undefined) return existing
    const seat = new AgentPresetSeatController(ctx, () => {
      if (ctx.sessions.binding(binding.sessionId) !== binding) return undefined
      const summary = ctx.sessions.list.getSnapshot().byId[binding.sessionId]
      return summary !== undefined
        && (ctx.sessions.retainInfo(binding.sessionId).getSnapshot().retainedBy.mainView ?? 0) > 0
        ? summary
        : undefined
    }, staged, securityEntry)
    seats.set(binding, seat)
    const dispose = binding.ctx.effect(() => {
      const stop = ctx.sessions.list.subscribe(() => { void seat.apply() })
      const stopSeat = seat.store.subscribe(() => { refreshCurrentMode() })
      return () => {
        stop()
        stopSeat()
        seats.delete(binding)
        boundSeatDisposers.delete(dispose)
      }
    }, 'ui-agent-preset: Provider binding')
    boundSeatDisposers.add(dispose)
    return seat
  }
  const section = new AgentPresetSectionController(ctx)
  // Turning Developer tools off clears the shared stage before any apply can compose it.
  const developerTools = ctx.configForms.developerTools.enabled
  ctx.effect(() => developerTools.subscribe(() => {
    if (developerTools.getSnapshot()) return
    staged.id = undefined
    staged.introduce = false
    void unboundSeat.apply()
    for (const seat of seats.values) void seat.apply()
  }), 'ui-agent-preset: Developer tools gate')
  const mainBlankSeat = (): AgentPresetSeatController | undefined => {
    const summary = Object.values(ctx.sessions.list.getSnapshot().byId)
      .find((session) => {
        /* v8 ignore next -- retained source counts omit zero-valued entries. */
        return session.blank && (session.retainedBy.mainView ?? 0) > 0
      })
    const binding = summary === undefined ? undefined : ctx.sessions.binding(summary.id)
    return binding === undefined ? undefined : seatFor(binding)
  }

  ctx.effect(() => ctx.locale.register('settings.agentPreset', { zh, en }), 'ui-agent-preset: settings row dictionaries')
  const modeSwitch = new ModeSwitchController({
    read: async () => {
      const result = await ctx.remote.agentPresets.switchPolicy()
      if (!result.ok) throw result.error
      return result.value
    },
    begin: async () => {
      const result = await ctx.remote.agentPresets.beginModeSwitch()
      if (!result.ok) throw result.error
      return result.value
    },
    confirm: async (id) => {
      const result = await ctx.remote.agentPresets.confirmModeSwitch(id)
      if (!result.ok) throw result.error
      return result.value
    },
    disable: async () => {
      const result = await ctx.remote.agentPresets.disableModeSwitch()
      if (!result.ok) throw result.error
      return result.value
    },
  }, async (sessionId, preset) => {
    const result = await ctx.remote.agentPresets.select(sessionId, preset)
    if (!result.ok) throw result.error
  }, ctx.locale.bind('settings.agentPreset'))
  ctx.effect(() => () => modeSwitch.dispose(), 'ui-agent-preset: mode switching')
  const modeInjected = (): ModeSwitchInjected => ({
    hooks: { modePolicy: modeSwitch.policy, modeSwitchState: modeSwitch.state },
    savePolicy: value => modeSwitch.save(value), dismissModeToast: (id) => { modeSwitch.dismiss(id) },
    dismissNotice: (id) => { modeSwitch.dismissNotice(id) },
    confirmPolicy: () => modeSwitch.confirm(), cancelPolicy: () => { modeSwitch.cancel() }, loadPolicy: () => modeSwitch.load(),
  })
  const sensitive = new SensitiveConfirmationsController({
    read: async () => {
      const result = await ctx.remote.agentPresets.sensitiveConfirmationPolicy()
      if (!result.ok) throw result.error
      return result.value
    },
    begin: async (confirmations: boolean) => {
      const result = await ctx.remote.agentPresets.beginSensitiveConfirmation(confirmations)
      if (!result.ok) throw result.error
      return result.value
    },
    confirm: async (id) => {
      const result = await ctx.remote.agentPresets.confirmSensitiveConfirmation(id)
      if (!result.ok) throw result.error
      return result.value
    },
  }, ctx.locale.bind('settings.agentPreset'))
  ctx.effect(() => () => { sensitive.dispose() }, 'ui-agent-preset: sensitive confirmations')
  const sensitiveInjected = (): SensitiveConfirmationsInjected => ({
    hooks: { sensitiveConfirmations: sensitive.state },
    loadConfirmations: () => sensitive.load(),
    saveConfirmations: value => sensitive.save(value),
    confirmConfirmations: () => sensitive.confirm(),
    cancelConfirmations: () => { sensitive.cancel() },
    dismissConfirmations: (id) => { sensitive.dismiss(id) },
  })
  const refreshCurrentMode = (): void => {
    const current = Object.values(ctx.sessions.list.getSnapshot().byId).find(session => (session.retainedBy.mainView ?? 0) > 0)
    const binding = current === undefined ? undefined : ctx.sessions.binding(current.id)
    const seat = binding === undefined ? unboundSeat : seats.get(binding)
    const id = current?.blank === false ? current.projectionValues?.agentPreset
      : seat?.store.getSnapshot().current || current?.projectionValues?.agentPreset || staged.id
    currentMode.set({ ...(id == null || id === '' ? {} : { id }), ...(current === undefined ? {} : { sessionId: current.id }),
      blank: current?.blank !== false,
      busy: current !== undefined && (current.running || modeSwitch.state.getSnapshot().busy.has(current.id)
        || seat?.store.getSnapshot().busy === true) })
    securityEntry.sessionChanged(current?.id)
  }
  ctx.effect(() => {
    const stopList = ctx.sessions.list.subscribe(refreshCurrentMode)
    const stopSeat = unboundSeat.store.subscribe(refreshCurrentMode)
    const stopSwitch = modeSwitch.state.subscribe(refreshCurrentMode)
    const stopPolicy = ctx.remote.$on('agent-preset/switch-policy', (policy) => { modeSwitch.accept(policy) })
    const stopEntry = ctx.remote.$on('agent-preset/security-entry', (state) => { securityEntry.accept(state) })
    // The preference decides whether the other confirmations appear at all, so
    // an accepted change refreshes the security-entry policy and drops a dialog
    // that no longer applies.
    const stopSensitive = ctx.remote.$on('agent-preset/sensitive-confirmations', (policy) => {
      sensitive.accept(policy)
      if (!policy.confirmations) securityEntry.cancel()
      void securityEntry.load()
    })
    const stopConnection = ctx.on('connection/reset', () => {
      void modeSwitch.load()
      void sensitive.load()
      securityEntry.connectionLost()
      void securityEntry.load()
    })
    refreshCurrentMode()
    void modeSwitch.load()
    void sensitive.load()
    void securityEntry.load()
    return () => { stopList(); stopSeat(); stopSwitch(); stopPolicy(); stopEntry(); stopSensitive(); stopConnection() }
  }, 'ui-agent-preset: current selection and runtime policy')
  ctx.effect(() => installModeAccent(currentMode), 'ui-agent-preset: mode accent')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'mode-switch-feedback', order: 25, locale: 'settings.agentPreset', inject: modeInjected,
  }, ModeSwitchToast))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'sensitive-confirmations', order: 24, locale: 'settings.agentPreset', inject: sensitiveInjected,
  }, SensitiveConfirmationsPrompt))
  // The preference governs every mode, so its row lives in the General
  // section rather than on the Modes page.
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'sensitive-confirmations', order: 25, locale: 'settings.agentPreset',
    inject: sensitiveInjected,
  }, SensitiveConfirmationsSetting))
  const entryInjected = (): SecurityEntryDialogInjected => ({
    hooks: { securityEntry: securityEntry.store },
    confirm: (declaration) => { void securityEntry.confirm(declaration) },
    cancel: () => { securityEntry.cancel() },
    retry: () => { securityEntry.retry() },
    openSettings: () => {
      securityEntry.cancel()
      ctx.get('settingsNavigation')?.openSection('agent-presets')
    },
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'security-entry', order: 20, locale: 'settings.agentPreset', inject: entryInjected,
  }, SecurityEntryDialog))

  ctx.effect(() => {
    let requested = 0
    let pending: Promise<void> | undefined
    // Settings invalidations may land while a correction is waiting on a
    // person's selection. Recheck once that work settles using the latest values.
    const reconcile = (): void => {
      requested++
      pending ??= Promise.resolve().then(async () => {
        try {
          for (;;) {
            const revision = requested
            await section.reconcileCodingTools(codingToolsDisabled)
            if (!active || requested === revision) return
          }
        } finally { pending = undefined }
      })
    }
    // The roster reflects live declarations and the default is a settings field, so
    // both an external settings edit and a reconnect can move this row.
    const refresh = (): void => {
      void controller.load()
      // The section reads the same roster and marks the same default, so a
      // change made from either surface converges both.
      if (section.store.getSnapshot().status !== 'idle') void section.load()
      void unboundSeat.load()
      for (const seat of seats.values) void seat.load()
      // The confirmation preference is a settings field too, so an edit from
      // the settings document or another window must reach this page.
      void sensitive.load()
      reconcile()
    }
    const disposers = [
      toolsSettings.subscribe(reconcile),
      presetSettings.subscribe(reconcile),
      ctx.remote.$on('settings/document-updated', (ns) => {
        if (ns !== AGENT_PRESET_SETTINGS_NS) return
        refresh()
      }),
      ctx.on('connection/reset', refresh),
    ]
    reconcile()
    return async () => {
      active = false
      for (const dispose of disposers) dispose()
      await pending
    }
  }, 'ui-agent-preset: settings refresh')

  // The settings section's conversational authoring entry: stage the
  // self-referential preset and land a new session on it. Bound inside the
  // conversation scope below (the seat and the session flow live there) and
  // unbound with it, so the section's face reads the current binding per
  // render and simply hides the button while no flow exists.
  let creatorDraft: (() => void) | undefined
  ctx.inject(['slots', 'conversation', 'sessions', 'uiWorkspace'], (scope: ClientContext) => {
    const seatInjected = (sessionId: SessionId | undefined): AgentPresetSeatInjected => {
      const binding = sessionId === undefined ? undefined : ctx.sessions.binding(sessionId)
      const seat = binding === undefined ? unboundSeat : seatFor(binding)
      return {
        hooks: { agentPresetSeat: seat.store, developerTools: ctx.configForms.developerTools.enabled },
        load: () => seat.load(),
        select: (id: string) => seat.select(id),
        dismissRefusal: (error) => { seat.dismissRefusal(error) },
        introduced: () => { seat.introduced() },
      }
    }

    const labelInjected = (sessionId: SessionId): AgentPresetLabelInjected & ModeSwitchInjected & {
      selectPreset(id: string): Promise<void>
    } => ({
      ...modeInjected(),
      hooks: { ...modeInjected().hooks, agentPresets: controller.store },
      load: () => controller.load(),
      selectPreset: id => modeSwitch.change(sessionId, id),
    })

    const startCreatorDraft = () => {
      // The Host composes the reused draft or new Session; the stage only drives the chip's display and introduction.
      const seat = mainBlankSeat() ?? unboundSeat
      seat.stage('cordis', true)
      scope.uiWorkspace.startSession(undefined, { clearPreviousDraft: false, agentPreset: 'cordis' })
    }

    scope.effect(() => {
      creatorDraft = startCreatorDraft
      const chip = scope.slots.register({
        name: 'conversation.hero.agentPreset',
        locale: 'settings.agentPreset',
        inject: seatInjected,
      }, AgentPresetSeat)
      const label = scope.slots.register({
        name: 'conversation.session.header.actions',
        id: 'agent-preset',
        // Static session context occupies the header's leading negative-order band.
        order: -10,
        locale: 'settings.agentPreset',
        inject: labelInjected,
      }, SessionModeControl)
      return () => {
        creatorDraft = undefined
        chip()
        label()
      }
    }, 'ui-agent-preset: new-session chip and header label')

    scope.slots.inject('plugins.add.actions', () => scope.slots.register({
      name: 'plugins.add.actions',
      id: 'create-plugin',
      locale: 'settings.agentPreset',
      inject: () => ({
        hooks: { agentPresets: controller.store },
        load: () => controller.load(),
        startCreatorDraft,
      }),
    }, CreatePluginMenuItem))
  })

  const sectionInjected = (): AgentPresetSectionInjected => ({
    ...modeInjected(),
    hooks: {
      ...modeInjected().hooks,
      agentPresetSection: section.store, currentMode, configurableModes,
      developerTools: ctx.configForms.developerTools.enabled,
    },
    load: async () => {
      await section.load()
      await (mainBlankSeat() ?? unboundSeat).load()
      refreshCurrentMode()
    },
    view: (id: string) => section.view(id),
    closeView: () => { section.closeView() },
    ...creatorDraft === undefined ? {} : { startCreatorDraft: creatorDraft },
    makeDefault: (id: string) => section.makeDefault(id),
    selectCurrent: async (id: string) => {
      const current = Object.values(ctx.sessions.list.getSnapshot().byId).find(session => (session.retainedBy.mainView ?? 0) > 0)
      if (current?.blank === false) {
        // An established conversation keeps its mode until the temporary
        // permission is accepted and the task is idle. Both refusals say so
        // instead of leaving the click without an answer.
        const policy = modeSwitch.policy.getSnapshot()
        if (current.running) modeSwitch.refuse('running')
        else if (policy.status !== 'ready' || !policy.value.allowExistingSessionSwitch) modeSwitch.refuse('locked')
        else await modeSwitch.change(current.id, id)
      } else await (mainBlankSeat() ?? unboundSeat).select(id)
      refreshCurrentMode()
    },
  })

  // Ordered after Models: choosing a model is routine, and composing an
  // agent is the deployment-shaping act behind it.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'agent-presets',
    order: 30,
    label: () => ctx.locale.bind('settings.agentPreset')('nav'),
    locale: 'settings.agentPreset',
    inject: sectionInjected,
    children: { 'settings.mode.materials': { kind: 'list', scope: 'root' } },
  }, AgentPresetSection))
}
