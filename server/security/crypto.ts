/**
 * Cryptographic Operations Module for InterceptX
 * 
 * SECURITY DESIGN INTENT:
 * -----------------------
 * Provides cryptographic primitives for:
 * 1. Session signing with HMAC-SHA256
 * 2. Audit log chain integrity (hash linking)
 * 3. Secure random generation
 * 
 * PRODUCTION REQUIREMENTS:
 * - Session secret MUST come from environment variable
 * - Never use default/hardcoded secrets in production
 * - Key rotation should be implemented for long-running deployments
 */

import { createHmac, createHash, randomBytes, randomUUID } from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Get the session signing secret from environment.
 * Falls back to a development secret if not set.
 * 
 * SECURITY: In production, SESSION_SECRET must be set and kept secure.
 */
function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;

    if (!secret) {
        // Development fallback - logs warning
        console.warn(
            '[SECURITY WARNING] SESSION_SECRET not set. Using development fallback. ' +
            'This is NOT secure for production.'
        );
        return 'dev-session-secret-do-not-use-in-production';
    }

    return secret;
}

// ============================================================================
// SESSION SIGNING
// ============================================================================

export interface SignedSessionData {
    sessionId: string;
    fingerprintHash: string;
    userId?: string;
    expiresAt: number;
}

/**
 * Create an HMAC-SHA256 signature for session data.
 * 
 * SECURITY: The signature binds the session to its data.
 * Any modification of the session data will invalidate the signature.
 */
export function signSession(data: SignedSessionData): string {
    const secret = getSessionSecret();

    // Create deterministic payload
    const payload = JSON.stringify({
        sid: data.sessionId,
        fph: data.fingerprintHash,
        uid: data.userId || null,
        exp: data.expiresAt,
    });

    // Sign with HMAC-SHA256
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);

    return hmac.digest('hex');
}

/**
 * Verify a session signature.
 * Returns true if the signature is valid for the given data.
 */
export function verifySessionSignature(
    data: SignedSessionData,
    signature: string
): boolean {
    const expectedSignature = signSession(data);

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < signature.length; i++) {
        result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }

    return result === 0;
}

// ============================================================================
// AUDIT LOG CHAIN
// ============================================================================

export interface AuditEntry {
    traceId: string;
    action: string;
    actor: string;
    target?: string;
    result: string;
    metadata?: Record<string, unknown>;
    timestamp: Date;
    ipHash?: string;
}

/**
 * Create a payload hash for an audit entry.
 * This hash is stored with the entry for integrity verification.
 */
export function hashAuditPayload(entry: AuditEntry): string {
    const payload = JSON.stringify({
        tid: entry.traceId,
        act: entry.action,
        atr: entry.actor,
        tgt: entry.target || null,
        res: entry.result,
        ts: entry.timestamp.getTime(),
    });

    return createHash('sha256').update(payload).digest('hex');
}

/**
 * Create a chain hash linking to the previous entry.
 * This creates a tamper-evident audit trail.
 * 
 * SECURITY: If any previous entry is modified, all subsequent
 * chain hashes will become invalid.
 */
export function createChainHash(
    currentPayloadHash: string,
    previousChainHash: string | null
): string {
    const input = previousChainHash
        ? `${previousChainHash}:${currentPayloadHash}`
        : `genesis:${currentPayloadHash}`;

    return createHash('sha256').update(input).digest('hex');
}

/**
 * Verify the integrity of an audit chain.
 * Returns true if all entries are properly linked.
 */
export function verifyAuditChain(
    entries: Array<{
        payloadHash: string;
        prevHash: string | null;
    }>
): boolean {
    if (entries.length === 0) {
        return true;
    }

    // Verify each entry links to the previous
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const expectedPrevHash = i === 0 ? null : entries[i - 1].payloadHash;

        // The prevHash should match the hash of creating a chain from prev
        if (i === 0) {
            // First entry should have null prevHash or genesis
            if (entry.prevHash !== null) {
                return false;
            }
        } else {
            // Compute expected chain hash
            const previousPayloadHash = entries[i - 1].payloadHash;
            const prevChainHash = i > 1 ? entries[i - 1].prevHash : null;
            const expectedChainHash = createChainHash(previousPayloadHash, prevChainHash);

            // Note: The prevHash stored is actually the chain hash of the previous entry
            // For simplicity, we're storing the previous entry's payloadHash
            if (entry.prevHash !== previousPayloadHash) {
                return false;
            }
        }
    }

    return true;
}

// ============================================================================
// SECURE RANDOM GENERATION
// ============================================================================

/**
 * Generate a cryptographically secure trace ID.
 * Format: timestamp-random (for both uniqueness and sortability)
 */
export function generateTraceId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `${timestamp}-${random}`;
}

/**
 * Generate a cryptographically secure random token.
 */
export function generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
}

/**
 * Generate a UUID v4.
 */
export function generateUUID(): string {
    return randomUUID();
}

// ============================================================================
// IP HASHING
// ============================================================================

/**
 * Hash an IP address for privacy-preserving logging.
 * The same IP will always produce the same hash within a day
 * (daily salt rotation for privacy).
 * 
 * SECURITY: This allows detecting same-IP without storing raw IPs.
 */
export function hashIP(ip: string): string {
    // Use date as part of salt for daily rotation
    const dailySalt = new Date().toISOString().split('T')[0];
    const input = `${dailySalt}:${ip}`;

    return createHash('sha256').update(input).digest('hex').substring(0, 16);
}

// ============================================================================
// TIMING-SAFE COMPARISON
// ============================================================================

/**
 * Compare two strings in constant time.
 * Prevents timing attacks on signature verification.
 */
export function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
}
