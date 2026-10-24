/** Build identity and this fork's GitHub release status. */
import { useEffect, useState } from 'react'
import { FishLogo, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountMenuProps } from './AccountMenu.tsx'
import { GitHubIcon } from './GitHubIcon.tsx'
import { loadForkRelease, type ReleaseNotice } from './release-status.ts'
import css from './AboutDialog.module.css'

const REPOSITORY = 'https://github.com/Water-Run/deepseek-harness-uncensored'

function recorded(value: string | undefined, unknown: string): string {
  return value === undefined || value === '' ? unknown : value
}

function formatWhen(value: string | undefined, unknown: string): string {
  const text = recorded(value, unknown)
  const time = Date.parse(text)
  if (Number.isNaN(time)) return text
  const date = new Date(time)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
}

function statusText(notice: ReleaseNotice, t: AccountMenuProps['t']): string {
  switch (notice.phase) {
    case 'checking': return t('aboutChecking')
    case 'latest': return t('aboutLatest')
    case 'available': return t(notice.severity === 'major' ? 'aboutMajor' : notice.severity === 'minor' ? 'aboutMinor' : 'aboutPatch')
    case 'offline': return t('aboutOffline')
    case 'failed': return t('aboutFailed')
    default: {
      const unreachable: never = notice.phase
      return unreachable
    }
  }
}

/**
 * Display build identity and the live GitHub release check.
 * @param props - Localized labels and dismissal callback.
 * @returns The about dialog.
 */
export function AboutDialog({ t, close }: { t: AccountMenuProps['t']; close: () => void }) {
  const commit = process.env.DSH_CLIENT_COMMIT_HASH
  const version = process.env.DSH_CLIENT_FORK_VERSION
  const [notice, setNotice] = useState<ReleaseNotice>({ phase: 'checking' })
  useEffect(() => {
    const controller = new AbortController()
    void loadForkRelease((input, init) => fetch(input, { ...init, signal: controller.signal }), version ?? '').then((next) => {
      if (!controller.signal.aborted) setNotice(next)
    })
    return () => { controller.abort() }
  }, [version])
  return <Modal open onClose={close} closeLabel={t('close')} title={t('about')}>
    <div className={css.content}>
      <div className={css.identity}>
        <FishLogo size={36} className={css.logo} />
        <div>
          <p className={css.product}>{t('productName')}</p>
          <p className={css.status} data-phase={notice.phase} role="status">{t('aboutStatus')} · {statusText(notice, t)}{notice.phase === 'available' && notice.version !== undefined ? ` · ${notice.version}` : ''}</p>
        </div>
      </div>
      <section className={css.card}>
        <h3>{t('aboutSectionVersion')}</h3>
        <dl>
          <dt>{t('forkVersion')}</dt><dd>{recorded(version, t('developmentBuild'))}</dd>
          <dt>{t('upstreamVersion')}</dt><dd>{recorded(process.env.DSH_CLIENT_UPSTREAM_VERSION, t('unknownBuild'))}</dd>
          <dt>{t('buildTime')}</dt><dd>{formatWhen(process.env.DSH_CLIENT_BUILD_TIME, t('unknownBuild'))}</dd>
        </dl>
      </section>
      <section className={css.card}>
        <h3>{t('aboutSectionSource')}</h3>
        <dl>
          <dt>{t('buildCommit')}</dt><dd>{commit === undefined ? t('unknownBuild') : <a href={`${REPOSITORY}/commit/${commit}`} target="_blank" rel="noreferrer">{commit.slice(0, 12)}</a>}{process.env.DSH_CLIENT_GIT_DIRTY === 'true' && ` · ${t('modifiedBuild')}`}</dd>
          <dt>{t('commitDate')}</dt><dd>{formatWhen(process.env.DSH_CLIENT_COMMIT_DATE, t('unknownBuild'))}</dd>
          <dt>{t('purgeCommit')}</dt><dd>{process.env.DSH_CLIENT_PURGE_COMMIT === undefined ? t('unknownBuild') : <a href={`https://github.com/Water-Run/dsh-purge/commit/${process.env.DSH_CLIENT_PURGE_COMMIT}`} target="_blank" rel="noreferrer">{process.env.DSH_CLIENT_PURGE_COMMIT.slice(0, 12)}</a>}</dd>
          <dt>{t('purgeDate')}</dt><dd>{formatWhen(process.env.DSH_CLIENT_PURGE_DATE, t('unknownBuild'))}</dd>
        </dl>
      </section>
      <section className={css.links}>
        <h3>{t('aboutSectionLinks')}</h3>
        <a className={css.github} href={REPOSITORY} target="_blank" rel="noreferrer"><GitHubIcon />{t('repository')}</a>
        <a href={`${REPOSITORY}/blob/main/LICENSE`} target="_blank" rel="noreferrer">{t('licenseName')}</a>
        {notice.url !== undefined && <a href={notice.url} target="_blank" rel="noreferrer">{t('aboutAvailable', { version: notice.version ?? '' })}</a>}
      </section>
    </div>
  </Modal>
}
