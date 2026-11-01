/** Validate and capture the binding names available to one program. */
import { validatePtcBindings } from '@deepseek-ai/dsh-ptc-runtime'
import type { PtcBindingFunction, PtcBindingNamespace, PtcJsonValue, PtcRunRequest } from '@deepseek-ai/dsh-ptc-runtime'
import { snapshotJsonValue } from '@deepseek-ai/dsh-util-values'
import { encodePtcJsonWire, type PtcJsonWire } from './json-wire.ts'
/**
 * Reject unusable namespaces before starting a process.
 * @param request - Host-owned binding declarations.
 * @returns Namespaces keyed by their declared global.
 */
export function validateBindings(request: PtcRunRequest): Map<string, PtcBindingNamespace> {
  return validatePtcBindings(request, 'dsh-ptc-runtime-node')
}
/**
 * Invoke a host binding and encode its lossless result.
 * @param binding - Current evaluation's function, absent if it was removed.
 * @param args - Validated JSON arguments detached from the program.
 * @returns Flat lossless JSON; unavailable bindings and invalid results reject.
 */
export async function invokeBinding(binding: PtcBindingFunction | undefined, args: PtcJsonValue): Promise<PtcJsonWire> {
  if (!binding) throw new Error('binding is unavailable in this evaluation; reacquire the current tool')
  const value = snapshotJsonValue(await binding(args))
  if (value === undefined) throw new Error('binding resolution must be lossless JSON')
  return encodePtcJsonWire(value)
}
