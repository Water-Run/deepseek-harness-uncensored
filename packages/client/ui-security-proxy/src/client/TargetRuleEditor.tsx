/** Structured production and test rules with independently matched aliases. @module */
import { useState } from 'react'
import { Button, Input, Modal, Select, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TargetRule, TargetSelector } from '@deepseek-ai/dsh-target-protection/types'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import shared from './SecurityProxySection.module.css'
import css from './TargetProtectionSection.module.css'

type Translate = PropsLocale<'settings.securityProxy'>['t']
const kinds = ['domain', 'server', 'database'] as const
const environments = ['production', 'test'] as const
const protections = ['full', 'audit'] as const
const matches = ['host', 'domain', 'regex', 'cidr', 'path'] as const

interface SelectorDraft {
  key: string
  match: TargetSelector['match']
  address: string
  port: string
  database: string
}

function draftOf(selector?: TargetSelector): SelectorDraft {
  return { key: randomUUID(), match: selector?.match ?? 'host', address: selector?.address ?? '',
    port: selector?.port?.toString() ?? '', database: selector?.database ?? '' }
}

function matchAllowed(match: TargetSelector['match'], kind: TargetRule['kind'], environment: TargetRule['environment']): boolean {
  if (match === 'path') return kind !== 'domain'
  return environment === 'production' || match === 'host'
}

function selectorOf(draft: SelectorDraft, kind: TargetRule['kind'], environment: TargetRule['environment']): TargetSelector | undefined {
  const { match } = draft
  const address = draft.address.trim()
  if (address === '' || !matchAllowed(match, kind, environment)) return undefined
  if (match === 'path') return { match, address }
  const port = draft.port === '' ? undefined : Number(draft.port)
  if (port !== undefined && (!/^\d+$/u.test(draft.port) || port < 1 || port > 65_535)) return undefined
  return { match, address, ...port === undefined ? {} : { port },
    ...kind === 'database' && draft.database !== '' ? { database: draft.database } : {} }
}

function SelectorFields({ value, kind, environment, onChange, t }: {
  value: SelectorDraft
  kind: TargetRule['kind']
  environment: TargetRule['environment']
  onChange: (value: SelectorDraft) => void
  t: Translate
}) {
  return <div className={shared.grid}>
    <div className={shared.field}>
      <span>{t('target.match')}</span>
      <Select label={t('target.match')} value={value.match} invalid={!matchAllowed(value.match, kind, environment)}
        options={matches.map(match => ({ value: match,
          label: t(`target.match.${match}`), disabled: !matchAllowed(match, kind, environment) }))}
        onChange={match => onChange({ ...value, match })} />
    </div>
    <label className={shared.field}><span>{t('target.address')}</span>
      <Input value={value.address} maxLength={512} onChange={event => onChange({ ...value, address: event.currentTarget.value })} />
    </label>
    {value.match === 'path' ? null : <>
      <label className={shared.field}><span>{t('target.port')}</span>
        <Input value={value.port} inputMode="numeric" maxLength={5}
          onChange={event => onChange({ ...value, port: event.currentTarget.value })} />
      </label>
      {kind === 'database' && <label className={shared.field}><span>{t('target.database')}</span>
        <Input value={value.database} maxLength={128} onChange={event => onChange({ ...value, database: event.currentTarget.value })} />
      </label>}
    </>}
  </div>
}

/** Edit one rule in a modal and stage it for the explicit settings save. */
export function TargetRuleEditor({ rule, existing, onApply, onClose, t }: {
  rule: TargetRule
  existing: boolean
  onApply: (rule: TargetRule) => void
  onClose: () => void
  t: Translate
}) {
  const [name, setName] = useState(rule.name)
  const [kind, setKind] = useState(rule.kind)
  const [environment, setEnvironment] = useState(rule.environment)
  const [protection, setProtection] = useState(rule.protection)
  const [enabled, setEnabled] = useState(rule.enabled)
  const [primary, setPrimary] = useState(() => draftOf(rule))
  const [aliases, setAliases] = useState(() => (rule.aliases ?? []).map(draftOf))
  const selector = selectorOf(primary, kind, environment)
  const aliasSelectors = aliases.map(value => selectorOf(value, kind, environment))
  const valid = name.trim() !== '' && selector !== undefined && aliasSelectors.every(value => value !== undefined)
  const apply = (): void => {
    if (!valid || selector === undefined) return
    onApply({ id: rule.id, name: name.trim(), kind, environment, protection, enabled, ...selector,
      ...(aliasSelectors.length > 0 ? { aliases: aliasSelectors.filter(value => value !== undefined) } : {}) })
  }
  return <Modal open title={t(existing ? 'target.edit' : 'target.add')} closeLabel={t('target.cancel')} onClose={onClose}
    contentClassName={css.editor as string} footer={<>
      <Button variant="outline" onClick={onClose}>{t('target.cancel')}</Button>
      <Button variant="primary" onClick={apply} disabled={!valid}>{t('target.apply')}</Button>
    </>}>
    <label className={shared.field}><span>{t('target.name')}</span>
      <Input data-modal-autofocus value={name} maxLength={100} onChange={event => setName(event.currentTarget.value)} />
    </label>
    <div className={shared.grid}>
      <div className={shared.field}><span>{t('target.kind')}</span>
        <Select label={t('target.kind')} value={kind}
          options={kinds.map(value => ({ value, label: t(`target.kind.${value}`) }))} onChange={setKind} />
      </div>
      <div className={shared.field}><span>{t('target.environment')}</span>
        <Select label={t('target.environment')} value={environment}
          options={environments.map(value => ({ value, label: t(`target.environment.${value}`) }))} onChange={setEnvironment} />
      </div>
      {environment === 'production' && <div className={shared.field}><span>{t('target.protection')}</span>
        <Select label={t('target.protection')} value={protection}
          options={protections.map(value => ({ value, label: t(`target.protection.${value}`) }))} onChange={setProtection} />
      </div>}
    </div>
    <SelectorFields value={primary} kind={kind} environment={environment} onChange={setPrimary} t={t} />
    <div className={shared.row}><span>{t('target.enabled')}</span>
      <Switch label={t('target.enabled')} checked={enabled} onChange={setEnabled} />
    </div>
    <section className={css.aliases} aria-label={t('target.aliases')}>
      <div className={shared.row}><span>{t('target.aliases')}</span>
        <Button size="sm" variant="outline" onClick={() => setAliases(current => [...current, draftOf()])}>{t('target.addAlias')}</Button>
      </div>
      {aliases.map((alias, index) => <div key={alias.key} className={shared.coverage}>
        <div className={shared.row}><span>{t('target.alias', { number: index + 1 })}</span>
          <Button size="sm" variant="ghost" onClick={() => setAliases(current => current.filter(item => item.key !== alias.key))}>
            {t('target.remove')}
          </Button>
        </div>
        <SelectorFields value={alias} kind={kind} environment={environment} t={t}
          onChange={value => setAliases(current => current.map(item => item.key === value.key ? value : item))} />
      </div>)}
    </section>
  </Modal>
}
