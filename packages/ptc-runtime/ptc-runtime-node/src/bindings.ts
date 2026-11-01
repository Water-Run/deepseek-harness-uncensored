/** Validate and capture the binding names available to one program. */
import { validatePtcBindings } from '@deepseek-ai/dsh-ptc-runtime'
import type { PtcBindingFunction, PtcBindingNamespace, PtcJsonValue, PtcRunRequest } from '@deepseek-ai/dsh-ptc-runtime'
import { snapshotJsonValue } from '@deepseek-ai/dsh-util-values'
import { encodePtcJsonWire } from './json-wire.ts'
import type { ReplyMessage } from './protocol.ts'
/**
 * Reject unusable namespaces before starting a process.
 * @param request - Host-owned binding declarations.
 * @returns Namespaces keyed by their declared global.
 */
export function validateBindings(request: PtcRunRequest): Map<string, PtcBindingNamespace> {
  return validatePtcBindings(request, 'dsh-ptc-runtime-node')
}
/**
 * Invoke a host binding and encode its lossless result or bounded-channel rejection.
 * @param id - Program-issued correlation identifier.
 * @param binding - Current evaluation's declared function, absent if it was removed.
 * @param args - Validated JSON arguments detached from the program.
 * @returns A reply suitable for the runtime's bounded control channel.
 */
export async function replyToBinding(id: number, binding: PtcBindingFunction | undefined, args: PtcJsonValue): Promise<ReplyMessage> {
  try {
    if (!binding) throw new Error('binding is unavailable in this evaluation; reacquire the current tool')
    const value = snapshotJsonValue(await binding(args))
    if (value === undefined) throw new Error('binding resolution must be lossless JSON')
    return { type: 'reply', id, ok: true, value: encodePtcJsonWire(value) }
  } catch (error: unknown) {
    return { type: 'reply', id, ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
