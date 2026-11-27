var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
/** Bind the name chain and connection addresses from the same DNS answer packets. @module */
import { getServers } from 'node:dns';
import { isIP } from 'node:net';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import * as packet from 'dns-packet';
import { deadline } from '@deepseek-ai/dsh-timeout';
import { canonicalDnsName, canonicalTargetHost } from "./rules.js";
import { exchangeDns, parseDnsServer } from "./dns-transport.js";
import { TargetProtectionError } from "./errors.js";
import { readLocalSource } from "./local-source.js";
/**
 * Select the platform's ordinary hosts file without changing OS configuration.
 * @returns The Windows or POSIX hosts-file path.
 */
export function systemHostsFile() {
    return process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts') : '/etc/hosts';
}
async function hosts(host, options, signal) {
    if (options.hostsFile === '')
        return undefined;
    let text;
    try {
        const bytes = await readLocalSource(options.hostsFile, options.maxHostsBytes, signal);
        text = bytes.toString('utf8');
    }
    catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
            return undefined;
        throw error;
    }
    const addresses = new Map();
    const namesByAddress = new Map();
    for (const line of text.split(/\r?\n/u)) {
        const fields = line.split('#')[0]?.trim().split(/\s+/u) ?? [];
        const ip = fields[0];
        if (ip === undefined || !isIP(ip))
            continue;
        const aliases = fields.slice(1).map(canonicalDnsName);
        const selected = aliases.includes(host);
        if (!selected && ip.includes('%'))
            continue;
        const address = canonicalTargetHost(ip);
        const names = namesByAddress.get(address) ?? new Set();
        for (const alias of aliases)
            names.add(alias);
        namesByAddress.set(address, names);
        if (selected)
            addresses.set(address, { address, family: isIP(address) === 4 ? 4 : 6 });
    }
    if (addresses.size === 0)
        return undefined;
    const names = new Set([host]);
    for (const address of addresses.keys()) {
        for (const name of namesByAddress.get(address) ?? [])
            names.add(name);
    }
    if (addresses.size > options.maxRecords || names.size > options.maxRecords)
        throw new Error('Hosts entry exceeds the configured record limit.');
    return { hostname: host, names: [...names], addresses: [...addresses.values()], source: 'hosts' };
}
function validateReply(bytes, id, host, type, maxRecords) {
    let response;
    try {
        response = packet.decode(bytes);
    }
    catch (error) {
        throw new TargetProtectionError('unavailable', 'DNS reply could not be decoded.', { cause: error });
    }
    const question = response.questions?.[0];
    if (response.type !== 'response' || response.id !== id || response.flag_tc || response.questions?.length !== 1
        || question?.type !== type || question.class !== 'IN' || canonicalDnsName(question.name) !== host) {
        throw new TargetProtectionError('unavailable', 'DNS reply does not match the pending question.');
    }
    if ((response.flags ?? 0) & 15)
        throw new TargetProtectionError('unavailable', 'DNS resolver did not return a successful answer.');
    if ((response.answers?.length ?? 0) > maxRecords)
        throw new TargetProtectionError('unavailable', 'DNS answer exceeds the configured record limit.');
    return response;
}
async function query(host, type, options, signal) {
    const servers = options.servers.length === 0 ? getServers() : options.servers;
    if (servers.length === 0)
        throw new Error('No DNS resolver is configured.');
    const failures = [];
    for (const value of servers) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            signal.throwIfAborted();
            const timeout = __addDisposableResource(env_1, deadline(signal, options.queryTimeoutMs, 'TARGET_DNS_TIMEOUT'), false);
            const id = randomInt(65536);
            const request = packet.encode({ type: 'query', id, flags: packet.RECURSION_DESIRED, questions: [{ name: host, type, class: 'IN' }] });
            try {
                return validateReply(await exchangeDns(request, parseDnsServer(value), timeout.signal), id, host, type, options.maxRecords);
            }
            catch (error) {
                signal.throwIfAborted();
                if (error instanceof TargetProtectionError)
                    throw error;
                failures.push(error);
            }
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    throw new TargetProtectionError('unavailable', 'Configured DNS resolvers could not verify this destination.', { cause: new AggregateError(failures) });
}
async function family(host, type, options, signal) {
    const names = [host];
    const seen = new Set();
    let current = host;
    for (;;) {
        const response = await query(current, type, options, signal);
        const answers = (response.answers ?? []).filter(answer => 'class' in answer && answer.class === 'IN');
        let advanced = false;
        for (;;) {
            const relevant = answers.filter(answer => canonicalDnsName(answer.name) === current);
            const aliases = relevant.filter((answer) => answer.type === 'CNAME');
            const alias = aliases[0];
            if (aliases.length > 1 || (alias !== undefined && relevant.some(answer => answer.type === 'A' || answer.type === 'AAAA'))) {
                throw new TargetProtectionError('unavailable', 'Conflicting DNS records for the same name.');
            }
            if (alias !== undefined) {
                if (seen.has(current) || names.length > options.maxCnameDepth)
                    throw new Error('DNS alias chain is cyclic or too deep.');
                seen.add(current);
                current = canonicalDnsName(alias.data);
                if (seen.has(current))
                    throw new Error('DNS alias chain is cyclic.');
                names.push(current);
                advanced = true;
                continue;
            }
            const addressRecords = relevant.filter((answer) => answer.type === type);
            if (addressRecords.length > 0) {
                const expected = type === 'A' ? 4 : 6;
                const addresses = addressRecords.map((record) => {
                    if (isIP(record.data) !== expected)
                        throw new Error('DNS returned an invalid address record.');
                    const address = canonicalTargetHost(record.data);
                    return { address, family: isIP(address) === 4 ? 4 : 6 };
                });
                return { hostname: host, names, addresses, source: 'dns' };
            }
            if (!advanced)
                return { hostname: host, names, addresses: [], source: 'dns' };
            break;
        }
    }
}
/**
 * Resolve a target with its names and pinned addresses from hosts data or complete DNS packets.
 * @param hostname - URL hostname; IP literals require no DNS traffic.
 * @param options - Explicit resolver limits and source selection.
 * @param signal - Complete resolution deadline and cancellation.
 * @returns Complete evidence for both address families; uncertainty rejects the operation.
 */
export async function resolveTargetDns(hostname, options, signal) {
    signal.throwIfAborted();
    const literal = hostname.replace(/^\[([^\]]+)\]$/u, '$1');
    if (isIP(literal)) {
        const address = canonicalTargetHost(literal);
        return { hostname: address, names: [address], addresses: [{ address, family: isIP(address) === 4 ? 4 : 6 }], source: 'literal' };
    }
    const host = canonicalDnsName(hostname);
    if (host === 'localhost' || host.endsWith('.localhost')) {
        return { hostname: host, names: [host], addresses: [{ address: '127.0.0.1', family: 4 }, { address: '::1', family: 6 }], source: 'localhost' };
    }
    const local = await hosts(host, options, signal);
    if (local !== undefined)
        return local;
    const results = await Promise.allSettled([family(host, 'A', options, signal), family(host, 'AAAA', options, signal)]);
    signal.throwIfAborted();
    const failures = [];
    const names = new Set([host]), addresses = new Map();
    // A record owner maps to its CNAME, or to null when it owns addresses directly.
    const ownerRecords = new Map();
    for (const result of results) {
        if (result.status === 'rejected') {
            failures.push(result.reason);
            continue;
        }
        const { names: chain, addresses: peers } = result.value;
        for (const [index, name] of chain.entries()) {
            names.add(name);
            const record = chain[index + 1] ?? (peers.length > 0 ? null : undefined);
            if (record === undefined)
                continue;
            const existing = ownerRecords.get(name);
            if (existing !== undefined && existing !== record) {
                throw new TargetProtectionError('unavailable', 'A and AAAA answers disagree about a DNS alias.');
            }
            ownerRecords.set(name, record);
        }
        for (const address of peers)
            addresses.set(address.address, address);
    }
    if (failures.length > 0 || addresses.size === 0 || addresses.size > options.maxRecords || names.size > options.maxRecords) {
        throw new TargetProtectionError('unavailable', 'DNS did not provide a complete bounded destination identity.', { cause: new AggregateError(failures) });
    }
    return { hostname: host, names: [...names], addresses: [...addresses.values()], source: 'dns' };
}
//# sourceMappingURL=dns-resolution.js.map