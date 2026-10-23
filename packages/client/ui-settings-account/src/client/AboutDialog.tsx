/** Build details and source links for the Uncensored distribution. */
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountMenuProps } from './AccountMenu.tsx'
import css from './AboutDialog.module.css'

/**
 * Display build identity without reading account credentials.
 * @param props - Localized labels and dismissal callback.
 * @returns The about dialog.
 */
export function AboutDialog({ t, close }: { t: AccountMenuProps['t']; close: () => void }) {
  const repository = 'https://github.com/Water-Run/deepseek-harness-uncensored'
  const commit = process.env.DSH_CLIENT_COMMIT_HASH
  return <Modal open onClose={close} closeLabel={t('close')} title={t('about')}>
    <div className={css.content}>
      <p className={css.product}>{t('productName')}</p>
      <dl className={css.facts}>
        <dt>{t('forkVersion')}</dt><dd>{process.env.DSH_CLIENT_FORK_VERSION ?? t('developmentBuild')}</dd>
        <dt>{t('upstreamVersion')}</dt><dd>{process.env.DSH_CLIENT_UPSTREAM_VERSION ?? t('unknownBuild')}</dd>
        <dt>{t('buildCommit')}</dt><dd>{commit === undefined ? t('unknownBuild') : <a href={`${repository}/commit/${commit}`} target="_blank" rel="noreferrer">{commit}</a>}{process.env.DSH_CLIENT_GIT_DIRTY === 'true' && ` · ${t('modifiedBuild')}`}</dd>
        <dt>{t('commitDate')}</dt><dd>{process.env.DSH_CLIENT_COMMIT_DATE ?? t('unknownBuild')}</dd>
        <dt>{t('purgeCommit')}</dt><dd>{process.env.DSH_CLIENT_PURGE_COMMIT === undefined ? t('unknownBuild') : <a href={`https://github.com/Water-Run/dsh-purge/commit/${process.env.DSH_CLIENT_PURGE_COMMIT}`} target="_blank" rel="noreferrer">{process.env.DSH_CLIENT_PURGE_COMMIT.slice(0, 12)}</a>}</dd>
        <dt>{t('purgeDate')}</dt><dd>{process.env.DSH_CLIENT_PURGE_DATE ?? t('unknownBuild')}</dd>
        <dt>{t('buildTime')}</dt><dd>{process.env.DSH_CLIENT_BUILD_TIME ?? t('unknownBuild')}</dd>
        <dt>{t('license')}</dt><dd><a href={`${repository}/blob/main/LICENSE`} target="_blank" rel="noreferrer">{t('licenseName')}</a></dd>
      </dl>
      <a href={repository} target="_blank" rel="noreferrer">{t('repository')}</a>
    </div>
  </Modal>
}
