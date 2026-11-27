/** Deterministic Messages image preparation for Files references and bounded inline fallback. */
import { contentHasImage, LlmError, offloadedImageText, projectOffloadedImages } from '@deepseek-ai/dsh-llm';
import { requestImageBudgetFailure, uniqueRequestImageRefs } from '@deepseek-ai/dsh-llm/message';
import { resolveRequestImageTarget } from "./request-pricing.js";
export { deepSeekImageRequestPricing as imagePricing } from "./request-pricing.js";
/** Require durable offload under the budget of this Messages transport attempt. */
function assertImagesFit(messages, versions, connection, representation) {
    const failure = requestImageBudgetFailure(messages, versions, {
        representation,
        maxBytes: representation === 'raw' ? connection.maxRequestFilesBytes : connection.maxInlineRequestImageBytes,
        maxImages: connection.maxImagesPerRequest,
        byteQuantum: representation === 'raw' ? connection.imageOffloadByteQuantum : connection.inlineImageOffloadByteQuantum,
        countQuantum: connection.imageOffloadCountQuantum,
    }, `DeepSeek Messages ${representation} request images exceed the route budget`);
    if (failure !== undefined)
        throw LlmError.fromFailure(failure);
}
function* imageRefs(blocks) {
    for (const block of blocks) {
        if (block.type === 'image')
            yield block.attachment;
    }
}
/** Normalize retained image references before converting Messages content.
 * @param history - durable history; never mutated.
 * @param connection - request-local image budgets.
 * @param modelId - target model id.
 * @param attachments - mounted attachment store, required only for image requests.
 * @param access - current execution-world path resolver.
 * @param signal - request cancellation.
 * @returns projected history and prepared image bytes keyed by attachment id.
 */
export async function prepareImages(history, connection, modelId, attachments, access, signal) {
    const versions = new Map();
    const messages = projectOffloadedImages(history, ref => offloadedImageText(ref, access(ref)));
    const refs = uniqueRequestImageRefs(messages);
    if (refs.length === 0)
        return { messages, versions };
    const model = connection.models.find(entry => entry.id === modelId);
    if (model?.inputModalities?.includes('image') !== true || attachments === undefined) {
        throw new LlmError('DeepSeek Messages image input requires a vision model and attachment service', 'UNSUPPORTED_CONTENT');
    }
    if (messages.some(message => message.role !== 'user' && message.role !== 'tool' && contentHasImage(message.content))) {
        throw new LlmError('DeepSeek Messages supports images only in user messages and tool results', 'UNSUPPORTED_CONTENT');
    }
    for (const ref of refs) {
        versions.set(ref.attachmentId, await attachments.readImageRequest(ref, resolveRequestImageTarget(model, ref), signal));
    }
    assertImagesFit(messages, versions, connection, 'raw');
    return { messages, versions };
}
/** Require logged offload before retrying images that exceed the inline budget.
 * @param messages - history already within the Files budget.
 * @param versions - normalized versions prepared for retained references.
 * @param connection - resolved inline bounds.
 * @returns unchanged history within both byte and image-count limits.
 */
export function inlineImages(messages, versions, connection) {
    assertImagesFit(messages, versions, connection, 'base64');
    return messages;
}
/** Resolve retained images to Files ids, recording every occurrence for failure diagnostics.
 * @param messages - history within the Files byte/count budget.
 * @param versions - normalized versions for every retained reference.
 * @param files - request-owned Files resolution and recovery.
 * @returns ids keyed by durable attachment identity.
 */
export async function prepareFileIds(messages, versions, files) {
    const ids = await files.resolveAll(versions);
    for (const [index, message] of messages.entries()) {
        let image = 0;
        for (const ref of imageRefs(message.content)) {
            const version = versions.get(ref.attachmentId);
            files.record(version, ids.get(ref.attachmentId), { message: index + 1, image: ++image });
        }
    }
    return ids;
}
//# sourceMappingURL=images.js.map