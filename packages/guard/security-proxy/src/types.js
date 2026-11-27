/**
 * Client-safe payloads for the security-mode egress proxy seam. These values
 * cross the Host/Client Remote boundary, so they are plain JSON and never carry
 * proxy credentials: the password is addressed by an existing credential
 * reference and reported only as {@link SecurityProxySettings.hasPassword}.
 * @module @deepseek-ai/dsh-security-proxy/types
 */
export {};
//# sourceMappingURL=types.js.map