/**
 * Download the current UTC month, falling back one month only if it has not been published.
 * Requests inherit the process-owned Host dispatcher without closing it.
 * @param now - Time at which the owner requested the check.
 * @param maxBytes - Hard cap on the streamed response body.
 * @param signal - Combined request, provider and download deadline.
 * @returns The complete candidate bytes and requested UTC month.
 */
export declare function downloadCountry(now: number, maxBytes: number, signal: AbortSignal): Promise<{
    bytes: Buffer;
    month: string;
}>;
//# sourceMappingURL=country-download.d.ts.map