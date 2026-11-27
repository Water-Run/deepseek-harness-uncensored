import type { AccountNotification, AccountNotificationBatch, AccountNotificationEvent, AccountNotificationId } from './types.ts';
/**
 * Read unconsumed notifications for one captured account credential.
 * @param origin - configured account API origin.
 * @param token - captured account grant.
 * @param signal - credential lifetime and request timeout.
 * @param headers - deployment and client identity headers.
 * @returns supported notifications in server order and the next query delay in seconds; malformed entries are skipped,
 * while HTTP and list-envelope failures reject.
 */
export declare function readNotifications(origin: string, token: string, signal: AbortSignal, headers: Record<string, string>): Promise<AccountNotificationBatch>;
/**
 * Read localized content without changing notification consumption.
 * @param origin - configured account API origin.
 * @param token - captured token for this request's credential lifetime.
 * @param id - notification whose content is requested.
 * @param signal - credential lifetime and request timeout.
 * @param headers - deployment and client identity headers.
 * @returns content with the requested identity; mismatched IDs and malformed responses reject.
 */
export declare function readNotificationContent(origin: string, token: string, id: AccountNotificationId, signal: AbortSignal, headers: Record<string, string>): Promise<AccountNotification>;
/**
 * Report an interaction; the response's consumption decision never closes the local card.
 * @param origin - configured account API origin.
 * @param token - captured token for this request's credential lifetime.
 * @param id - notification the user interacted with.
 * @param event - displayed frame, business-action click, or explicit dismissal.
 * @param signal - credential lifetime and request timeout.
 * @param headers - deployment and client identity headers.
 * @returns after the server accepts the event; HTTP and malformed responses reject.
 */
export declare function sendNotificationEvent(origin: string, token: string, id: AccountNotificationId, event: AccountNotificationEvent, signal: AbortSignal, headers: Record<string, string>): Promise<void>;
//# sourceMappingURL=notifications.d.ts.map