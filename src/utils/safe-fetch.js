// SSRF-safe outbound fetch: validate the target, pin DNS to the validated IP.
// Moved verbatim from server.js during the 2026-06 architecture refactor.

import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import { promisify } from 'util';
import fetch from 'node-fetch';

const dnsLookup = promisify(dns.lookup);

export function isPrivateIP(ip) {
    if (typeof ip !== 'string') return true;
    const family = net.isIP(ip);
    if (family === 4) {
        const parts = ip.split('.').map(Number);
        return (
            parts[0] === 127 ||
            parts[0] === 10 ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            (parts[0] === 169 && parts[1] === 254) || // link-local incl. AWS/GCP metadata 169.254.169.254
            (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // CGNAT
            parts[0] === 0
        );
    }
    if (family === 6) {
        const lower = ip.toLowerCase();
        // ::1, unspecified, link-local fe80::/10, unique-local fc00::/7,
        // and IPv4-mapped (::ffff:0:0/96) — also treat any '::ffff:'-mapped private v4 as private.
        if (lower === '::1' || lower === '::') return true;
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
        if (lower.startsWith('::ffff:')) {
            const v4 = lower.slice(7);
            return isPrivateIP(v4);
        }
        return false;
    }
    return true; // unknown family → treat as private
}

/**
 * Validate a URL is safe to fetch from the server.
 * Returns the resolved IP so the caller can pin DNS to it during fetch
 * (closing the DNS-rebinding window between validation and use).
 */
export async function validateUrlForFetch(urlString) {
    let parsed;
    try {
        parsed = new URL(urlString);
    } catch {
        return { safe: false, reason: 'Invalid URL' };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { safe: false, reason: 'Only HTTP/HTTPS URLs are allowed' };
    }

    const hostname = parsed.hostname;
    if (hostname === 'localhost') {
        return { safe: false, reason: 'Local addresses are not allowed' };
    }
    // Direct-IP hostnames bypass DNS — validate them immediately.
    if (net.isIP(hostname)) {
        if (isPrivateIP(hostname)) {
            return { safe: false, reason: 'URL targets a private IP address' };
        }
        return { safe: true, ip: hostname, family: net.isIP(hostname), parsed };
    }

    try {
        // Resolve all addresses, validate every one (defense against round-robin DNS
        // returning a mix of public and private IPs), then pin to the first.
        const addresses = await dnsLookup(hostname, { all: true });
        if (!addresses.length) {
            return { safe: false, reason: 'Hostname did not resolve' };
        }
        for (const { address } of addresses) {
            if (isPrivateIP(address)) {
                return { safe: false, reason: 'URL resolves to a private IP address' };
            }
        }
        const pinned = addresses[0];
        return { safe: true, ip: pinned.address, family: pinned.family, parsed };
    } catch {
        return { safe: false, reason: 'Could not resolve hostname' };
    }
}

/**
 * Fetch a URL with DNS pinned to the IP that was validated.
 * Closes the DNS-rebinding window: between `validateUrlForFetch` resolving
 * and the actual TCP connect, an attacker-controlled DNS server cannot
 * flip the answer to an internal IP. The pin uses a custom `lookup` on
 * the http(s).Agent so SNI / Host header behavior is unchanged.
 *
 * Throws an Error with code 'URL_BLOCKED' when validation fails.
 */
export async function safeFetch(urlString, options = {}) {
    const validation = await validateUrlForFetch(urlString);
    if (!validation.safe) {
        const err = new Error(`URL blocked: ${validation.reason}`);
        err.code = 'URL_BLOCKED';
        err.reason = validation.reason;
        throw err;
    }
    const { ip, family, parsed } = validation;
    const AgentCtor = parsed.protocol === 'https:' ? https.Agent : http.Agent;
    const agent = new AgentCtor({
        keepAlive: false,
        // Pin DNS to the validated IP for this connection. `lookup` is the only
        // resolution that runs after this point. Node ≥20 enables
        // autoSelectFamily by default, which calls lookup with {all: true} and
        // expects an ARRAY of {address, family} — the legacy 3-arg callback
        // form then fails every request with "Invalid IP address: undefined".
        lookup: (_hostname, opts, cb) => {
            const fam = family || 4;
            if (opts && opts.all) return cb(null, [{ address: ip, family: fam }]);
            return cb(null, ip, fam);
        },
    });
    return fetch(urlString, { ...options, agent });
}
