/** Complete standard props for focused views, plus typed access to erased Slot injection factories. */
import type { GlobalStandardProps, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { allowAllAccess } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'

function unused(): never { throw new Error('This focused view read an unconfigured runtime dependency') }

/** Standard hooks that a focused view must explicitly replace before reading. */
export const unreadGlobalProps: GlobalStandardProps = {
  ...allowAllAccess,
  usePanelInfo: unused, useSessions: unused, useSessionStatus: unused,
  useSessionRetainInfo: unused, useWorkspaces: unused, useResource: unused, useContextMenu: unused,
}

/** Session hooks and actions that fail if a focused view unexpectedly uses them. */
export const unreadSessionProps: SessionStandardProps = {
  ...allowAllAccess,
  sessionId: SessionId('unused-fixture'), useSession: unused, useProjection: unused,
  useConversation: unused, useInput: unused, useChat: unused, useTrajectory: unused,
  inputActions: {
    insertQuote: unused, captureInsertion: unused, insertText: unused, setDraft: unused, persistDraft: unused,
    addAttachments: unused, removeAttachment: unused, pruneAttachments: unused, submit: unused,
  },
}

/**
 * Read a contribution without imposing the registry's dictionary index signature on its business face.
 * @param factory - Factory selected by the tested Slot and component identity.
 * @returns The same factory with an object result; the caller supplies the contribution's known signature.
 */
export function injectedFactory(
  factory: ((...args: never[]) => object) | undefined,
): (...args: never[]) => object {
  if (factory === undefined) throw new Error('The tested Slot has no injection factory')
  return factory
}
