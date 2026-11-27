/** Retained request-image references and per-occurrence transport budgets. */
import { IMAGE_OFFLOAD_REQUIRED_CODE } from "./error.js";
/** Base64 length of raw image bytes, including padding. */
function base64Length(bytes) {
    return Math.ceil(bytes / 3) * 4;
}
/** Retained image occurrences in wire order, including repeated references. */
function* retainedImageBlocks(messages) {
    for (const message of messages) {
        for (const block of message.content) {
            if (block.type === 'image' && block.offloaded !== true)
                yield block;
        }
    }
}
/**
 * Collect one reference per retained attachment for request encoding.
 * @param messages - request history with its logged offload decisions.
 * @returns the first retained reference for each attachment id, in message order.
 */
export function uniqueRequestImageRefs(messages) {
    const refs = new Map();
    for (const { attachment } of retainedImageBlocks(messages)) {
        if (!refs.has(attachment.attachmentId))
            refs.set(attachment.attachmentId, attachment);
    }
    return [...refs.values()];
}
/**
 * Number of oldest retained image occurrences one route budget removes, in
 * whole count and byte quanta, once the budget is exceeded. The result depends
 * only on the represented lengths, so every route names the count the same
 * way.
 * @param lengths - represented byte length of every retained occurrence, oldest first.
 * @param budget - count/byte budgets and removal quanta; unbounded when absent.
 * @returns how many leading occurrences to offload.
 */
function offloadedImagePrefixCount(lengths, budget) {
    const total = lengths.reduce((sum, bytes) => sum + bytes, 0);
    const excessCount = budget.maxImages === undefined ? 0 : Math.max(0, lengths.length - budget.maxImages);
    const excessBytes = budget.maxBytes === undefined ? 0 : Math.max(0, total - budget.maxBytes);
    if (excessCount === 0 && excessBytes === 0)
        return 0;
    const countQuantum = budget.countQuantum ?? 1;
    const byteQuantum = budget.byteQuantum ?? 1;
    const removeCount = excessCount === 0 ? 0 : Math.ceil(excessCount / countQuantum) * countQuantum;
    const removeBytes = excessBytes === 0 ? 0 : Math.ceil(excessBytes / byteQuantum) * byteQuantum;
    let count = 0;
    let removedBytes = 0;
    for (const imageBytes of lengths) {
        const byteTargetMet = removeBytes === 0
            || (byteQuantum === 1 ? removedBytes >= removeBytes : removedBytes > removeBytes);
        if (count >= removeCount && byteTargetMet)
            break;
        removedBytes += imageBytes;
        count += 1;
    }
    return count;
}
/**
 * Number of oldest retained occurrences a route must still offload before a
 * derived request fits its budget at the exact byte length the route sends;
 * zero when the request fits. A route fails with `IMAGE_OFFLOAD_REQUIRED`
 * carrying this count instead of offloading on its own.
 * @param messages - derived request history carrying the surface's `offloaded` marks.
 * @param budget - route representation, budgets, and removal quanta.
 * @param versionBytes - exact request-version byte length of one retained occurrence.
 * @returns how many more leading retained occurrences to offload.
 */
export function requiredImageOffload(messages, budget, versionBytes) {
    const lengths = [];
    for (const block of retainedImageBlocks(messages)) {
        const bytes = versionBytes(block);
        lengths.push(budget.representation === 'base64' ? base64Length(bytes) : bytes);
    }
    return offloadedImagePrefixCount(lengths, budget);
}
/**
 * Check every retained occurrence against the budget of the selected wire representation.
 * @param messages - request history, including any repeated or offloaded images.
 * @param versions - encoded request version for each retained attachment id.
 * @param budget - route limits for this transport attempt.
 * @param overflowMessage - adapter diagnostic identifying the exceeded budget.
 * @returns the structured offload failure, or undefined when the retained images fit.
 */
export function requestImageBudgetFailure(messages, versions, budget, overflowMessage) {
    const offloadImages = requiredImageOffload(messages, budget, block => versions.get(block.attachment.attachmentId).bytes);
    if (offloadImages === 0)
        return undefined;
    return {
        code: IMAGE_OFFLOAD_REQUIRED_CODE,
        message: `${overflowMessage}; ${offloadImages} more oldest occurrence(s) must be offloaded.`,
        offloadImages,
    };
}
//# sourceMappingURL=request-images.js.map