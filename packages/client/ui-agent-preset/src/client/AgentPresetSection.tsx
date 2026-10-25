/** Preset selection settings: the roster, its default, mode help, the per-mode configuration, and the Creator-mode entry. */
import type { ReactNode } from 'react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  Button, IconBrowseOutlineRegular, IconPlusOutlineRegular, IconWarningOutlineRegular, Modal, SegmentedTabs, Tag, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SegmentedTab } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentPresetSectionState } from './section-store.ts'
import { isBuiltInPreset, presetDisplayText } from './locales.ts'
import { requiresCodingTools } from './settings-store.ts'
import { PresetGuideDialog, presetGuide, trapPresetReaderTab, type PresetGuidePage } from './PresetGuideDialog.tsx'
import css from './AgentPresetSection.module.css'
import { PresetIcon } from './PresetIcon.tsx'
import { ModeSwitchSetting, type ModeSwitchInjected } from './mode-switch.tsx'

/**
 * Main-view selection; an absent identity uses the current default until a draft exists.
 * `sessionId` names the main conversation, absent before one exists.
 */
export interface CurrentModeState { id?: string; sessionId?: string; blank: boolean; busy: boolean }

/** Settings actions and their shared controller state. */
export interface AgentPresetSectionInjected extends ModeSwitchInjected {
  hooks: ModeSwitchInjected['hooks'] & {
    agentPresetSection: SnapshotStore<AgentPresetSectionState>
    currentMode: SnapshotStore<CurrentModeState>
    /** Shared Coding Tools preference; off hides the built-in PTC and Minimal cards. */
    developerTools: ObservableSnapshot<boolean>
    /** Preset ids that contributed a configuration panel; the page shows one tab per id it can resolve. */
    configurableModes: SnapshotStore<readonly string[]>
  }
  /** Stage the `cordis` preset and start a Creator-mode task; absent without a conversation flow. */
  startCreatorDraft?: () => void
  load: () => Promise<void>
  /** Open one preset's declared composition in the read-only viewer. */
  view: (id: string) => Promise<void>
  /** Close the read-only viewer. */
  closeView: () => void
  makeDefault: (id: string) => Promise<void>
  selectCurrent: (id: string) => Promise<void>
}
/** Props assembled by the settings renderer. */
export type AgentPresetSectionProps = PropsRuntime<'settings.section'>
  & PropsRenderSlots<'settings.mode.materials'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetSectionInjected>

function CardDescription({ text }: { text: string }): ReactNode {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [truncated, setTruncated] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    /* v8 ignore next -- the ref is attached before layout effects run. */
    if (el === null) return
    const measure = () => { setTruncated(el.scrollHeight > el.clientHeight) }
    measure()
    // Card width follows the settings pane, which resizes with the window.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [text])
  return (
    // Capped near the card's own width: the default half-viewport bubble would
    // spill a description out of the settings dialog and across the app behind it.
    <Tooltip label={text} side="bottom" delayMs={400} disabled={!truncated} maxWidth={360}>
      {/* The empty title stops the card body's native tooltip from climbing to
        this span: a cut-off description answers with one bubble, not two. */}
      <span ref={ref} className={css.cardDesc} title="">{text}</span>
    </Tooltip>
  )
}

/** Render the roster with its default, mode help, per-mode configuration, composition viewer, and Creator-mode guidance.
 * @param props Settings actions, snapshot hooks and localized text.
 * @returns The preset settings section.
 */
export function AgentPresetSection(props: AgentPresetSectionProps) {
  const {
    useAgentPresetSection, load, view, closeView, startCreatorDraft,
    close: closeSettings, useDeveloperTools, useCurrentMode, useModePolicy, useModeSwitchState, useConfigurableModes,
    selectCurrent, dismissNotice, renderSlot, t,
  } = props
  const state = useAgentPresetSection(value => value)
  const current = useCurrentMode(value => value)
  const permission = useModePolicy(value => value)
  const notice = useModeSwitchState(value => value.notice)
  // A refusal belongs to the page that reported it, so it leaves with the page
  // instead of outliving the explanation that produced it.
  const noticeId = notice?.id
  useEffect(() => () => { if (noticeId !== undefined) dismissNotice(noticeId) }, [noticeId, dismissNotice])
  const selectedId = current.id ?? state.rows.find(row => row.isDefault)?.id
  const selectionLocked = !current.blank && (permission.status !== 'ready' || !permission.value.allowExistingSessionSwitch)
  const developerTools = useDeveloperTools(enabled => enabled)
  const configurableModes = useConfigurableModes(value => value)
  // The configuration target is its own choice: configuring a mode must not
  // require making it the current conversation's mode.
  const [configChoice, setConfigChoice] = useState<string | undefined>(undefined)
  const tabBase = useId()
  const [guide, setGuide] = useState<{
    content: NonNullable<ReturnType<typeof presetGuide>>
    page: PresetGuidePage
  } | null>(null)
  const viewTrigger = useRef<HTMLButtonElement | null>(null)
  const closeViewOnUnmount = useRef(closeView)
  useEffect(() => { void load() }, [load])
  useLayoutEffect(() => { closeViewOnUnmount.current = closeView }, [closeView])
  useEffect(() => () => { closeViewOnUnmount.current() }, [])
  const closeViewer = () => { closeView(); viewTrigger.current?.focus() }
  const viewed = state.view
  const viewedRow = viewed === null ? undefined : state.rows.find(row => row.id === viewed.id)
  const viewedTitle = viewed === null ? '' : viewedRow === undefined ? viewed.title : presetDisplayText(viewedRow, t).name
  const configRows = state.rows.filter(row => configurableModes.includes(row.id))
  // Until someone picks a tab, the page opens on the mode in use (when that
  // mode has configuration) and otherwise on the first configurable one.
  const configRow = configRows.find(row => row.id === (configChoice ?? selectedId)) ?? configRows[0]
  const tabs = configRows.map((row) => {
    const name = presetDisplayText(row, t).name
    return {
      value: row.id,
      // Equal-width tabs cannot grow with a long preset name; the label
      // ellipsizes instead of wrapping past the tab's fixed height.
      label: <span className={css.tabLabel} title={name}>{name}</span>,
      id: `${tabBase}-tab-${row.id}`,
      panelId: `${tabBase}-panel`,
    }
  })
  // A single configurable mode needs no tab strip; the panel names it instead.
  const [firstTab, ...restTabs] = tabs
  const tabItems: [SegmentedTab, ...SegmentedTab[]] | undefined = firstTab === undefined || restTabs.length === 0
    ? undefined
    : [firstTab, ...restTabs]
  const activeTab = tabs.find(tab => tab.value === configRow?.id)
  const panelProps = configRow === undefined ? {} : tabItems !== undefined && activeTab !== undefined
    ? { role: 'tabpanel' as const, id: activeTab.panelId, 'aria-labelledby': activeTab.id }
    : { role: 'region' as const, 'aria-label': presetDisplayText(configRow, t).name }
  // Creator mode authors presets in conversation; it needs the flow to land a
  // session in and the self-referential preset on the roster.
  const creator = startCreatorDraft !== undefined && state.rows.some(row => row.id === 'cordis') ? startCreatorDraft : undefined
  /* The custom group is where a preset of one's own appears, so its entry
     stays on screen even while the group is empty. */
  const creatorButton = creator === undefined
    ? null
    : (
      <button
        type="button"
        className={css.creatorButton}
        disabled={state.saving}
        onClick={() => { creator(); closeSettings() }}
      >
        <IconPlusOutlineRegular size={14} />
        {t('creatorDraft')}
      </button>
    )
  return <section className={css.section}>
    <h2 className={css.title}>{t('pageTitle')}</h2>
    <p className={css.intro}>{t('sectionIntro')}</p>
    {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
    <h3 className={css.sectionHead}>{t('currentMode')}</h3>
    {notice !== null
      ? (
        <p role="alert" className={css.notice}>
          <IconWarningOutlineRegular size={14} className={css.noticeIcon} />
          <span>{notice.text}</span>
        </p>
      )
      : selectionLocked ? <p className={css.locked}>{t('modeSwitch.locked')}</p> : null}
    {([true, false] as const).map((builtIn) => {
      const rows = state.rows.filter(row => isBuiltInPreset(row) === builtIn
        && (developerTools || !requiresCodingTools(row)))
      const entry = builtIn ? null : creatorButton
      if (rows.length === 0 && entry === null) return null
      return <section key={String(builtIn)} className={css.group}>
        <h4 className={css.groupHead}>{t(builtIn ? 'builtInGroup' : 'customGroup')}</h4>
        {rows.length === 0 ? null : <ul className={css.cards}>
          {rows.map((row) => {
            const display = presetDisplayText(row, t)
            const help = presetGuide(row.id, builtIn ? 'system' : 'user')
            const selected = row.id === selectedId
            const selectionAction = row.broken !== undefined ? t('brokenBadge')
              : t(selected ? 'selected' : 'selectCurrent')
            // A locked or busy card stays focusable: activating it asks the
            // owner, which announces why the conversation keeps its mode.
            const blocked = !selected && (selectionLocked || current.busy)
            return <li key={row.id} data-agent-preset-id={row.id} className={[
              css.card, row.broken === undefined ? undefined : css.cardBroken,
              selected ? css.cardActive : undefined,
            ].filter(Boolean).join(' ')}>
              <button type="button" className={css.cardMain} aria-pressed={selected}
                disabled={selected || (row.broken === undefined && state.saving)}
                aria-disabled={row.broken !== undefined || blocked}
                aria-label={`${selectionAction}: ${display.name}`} title={blocked ? t('modeSwitch.blocked') : selectionAction}
                onClick={() => { if (row.broken === undefined) void selectCurrent(row.id) }}>
                <span className={css.cardHead}>
                  <span className={css.cardIdentity}>
                    <PresetIcon id={row.id} size={18} className={css.cardIcon} />
                    <span className={css.cardName} title={display.name}>{display.name}</span>
                    {row.broken === undefined ? null : <span className={css.brokenBadge}>
                      {t('brokenBadge')}<span className={css.brokenTip} aria-hidden="true">{row.broken}</span>
                    </span>}
                    <Tag tone="outline">
                      {row.isDefault ? t('inUse') : t(builtIn ? 'builtInGroup' : 'customGroup')}
                    </Tag>
                  </span>
                  <code className={css.cardId} title={row.id}>{row.id}</code>
                </span>
                <CardDescription text={display.description ?? t('noDescription')} />
                {row.broken === undefined ? null : <span className={css.cardBrokenReason} role="alert">{row.broken}</span>}
              </button>
              {/* One footer group for every card: the same actions in the same
                  order, so the row reads as a row rather than as a layout that
                  changes with the mode. */}
              <div className={css.cardFoot}>
                {configurableModes.includes(row.id) ? <Button variant="ghost" className={css.helpButton}
                  onClick={() => { setConfigChoice(row.id) }}>
                  {t('configure')}
                </Button> : null}
                {/* One button opens the reader; it carries both the explanation
                    and the usage pages as tabs, so the footer does not repeat
                    them as two separate entries. */}
                {help === undefined ? null : <Button variant="ghost" className={css.helpButton}
                  aria-label={`${t('modeExplanation')}: ${display.name}`}
                  onClick={() => { setGuide({ content: help, page: 'explanation' }) }}>{t('modeExplanation')}</Button>}
                {/* Reading the declaration is the one thing this page offers
                  beyond choosing: a broken preset's YAML is also where its
                  diagnostic points, so the viewer stays available for it. */}
                <Tooltip label={`${t('view')}: ${display.name}`} side="top" align="end" portal>
                  <button type="button" className={css.iconButton} aria-label={`${t('view')}: ${display.name}`}
                    onClick={(event) => { viewTrigger.current = event.currentTarget; void view(row.id) }}>
                    <IconBrowseOutlineRegular />
                  </button>
                </Tooltip>
              </div>
            </li>
          })}
        </ul>}
        {entry}
      </section>
    })}
    <div className={css.prefs}>
      <ModeSwitchSetting {...props} />
    </div>
    {/* Configuration belongs to the mode named on its tab, not to whatever the
        current conversation runs, so this block sits outside the selection. */}
    {configRow === undefined ? null : <section className={css.config}>
      <h3 className={css.sectionHead}>{t('modeConfig')}</h3>
      <p className={css.configHint}>{t('modeConfigHint')}</p>
      {tabItems === undefined ? null : <SegmentedTabs items={tabItems}
        value={configRow.id} onChange={(id) => { setConfigChoice(id) }} label={t('modeConfigTabs')} />}
      <div className={css.materials} {...panelProps}>
        {renderSlot('settings.mode.materials', { modeId: configRow.id })}
      </div>
    </section>}
    {guide === null ? null : <PresetGuideDialog guide={guide.content} initialPage={guide.page} t={t} onClose={() => { setGuide(null) }} />}
    <Modal open={viewed !== null} onClose={closeViewer} closeLabel={t('close')}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          closeViewer()
        } else trapPresetReaderTab(event)
      }}
      title={viewed === null ? '' : `${t('view')} · ${viewedTitle}`} className={css.dialog as string}
      footer={<Button variant="outline" autoFocus onClick={closeViewer}>{t('close')}</Button>}>
      {viewed === null ? null : <pre className={css.viewerCode}>{viewed.content}</pre>}
    </Modal>
  </section>
}
