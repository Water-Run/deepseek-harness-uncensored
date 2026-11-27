import type { LlmModelBadge, LlmModelInfo, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import type { DeepSeekCatalogModel, DeepSeekConnectionOptions } from './types.ts';
/** Advertise one catalog entry.
 * @param provider - registered provider id.
 * @param model - advisory catalog entry.
 * @param badge - selector badge a model listing declares for the entry.
 * @returns selector metadata.
 */
export declare function catalogModelInfo(provider: string, model: DeepSeekCatalogModel, badge?: LlmModelBadge): LlmModelInfo;
/** Resolve model capabilities against one configuration generation.
 * @param connection - validated connection facts.
 * @param provider - registered provider id.
 * @param model - requested wire model id.
 * @returns effective model metadata for this operation.
 */
export declare function modelInfo(connection: DeepSeekConnectionOptions, provider: string, model: string): LlmResolvedModelInfo;
//# sourceMappingURL=model-info.d.ts.map