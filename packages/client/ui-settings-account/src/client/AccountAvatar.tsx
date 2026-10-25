/** Shared account picture with an icon fallback for missing or unavailable images. */
import { IconUserOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountAvatarSnapshot } from './account-avatar.ts'
import css from './AccountAvatar.module.css'

/**
 * Render a decorative avatar next to the account identity. The picture is
 * painted as soon as its URL is known — the shared loader's preload only
 * decides the fallback, so a slow or blocked image never leaves the generic
 * icon on screen while the picture itself is still arriving.
 * @param props - latest picture attempt and rendered-image failure reporter; absent or failed data uses the default icon.
 * @returns picture or the default account icon.
 */
export function AccountAvatar({ avatar, avatarFailed }: {
  avatar: AccountAvatarSnapshot | undefined
  avatarFailed: (snapshot: AccountAvatarSnapshot) => void
}) {
  return avatar !== undefined && avatar.status !== 'failed'
    ? <img className={css.image} src={avatar.url} alt="" referrerPolicy="no-referrer" decoding="async"
      onError={() => { avatarFailed(avatar) }} />
    : <IconUserOutlineMedium size={16} />
}
