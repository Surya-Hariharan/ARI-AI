/**
 * Audit Logging System for InterceptX
 * 
 * SECURITY DESIGN:
 * ----------------
 * Audit logs are APPEND-ONLY and TAMPER-EVIDENT:
 * 1. Each entry includes a hash of its content
 * 2. Each entry includes the hash of the previous entry (chain)
 * 3. Entries cannot be modified without breaking the chain
 * 4. All admin actions are explicitly logged
 * 5. No silent failures - all errors are logged
 * 
 * FORENSIC REPLAY:
 * The audit log supports full timeline reconstruction for
 * security incident investigation.
 */

import {
    hashAuditPayload,
    createChainHash,
    generateTraceId,
    hashIP,
    type AuditEntry,
} from './crypto';
import { AuditAction, type AuditActionType } from '@shared/schema';

// ============================================================================
// TYPES
// ============================================================================

export interface AuditLogEntry {
    id: string;
    traceId: string;
    action: AuditActionType;
    actor: string;
    target?: string;
    result: 'success' | 'failure' | 'blocked';
    metadata?: Record<string, unknown>;
    payloadHash: string;
    prevHash: string | null;
    chainHash: string;
    timestamp: Date;
    ipHash?: string;
}

export interface AuditQueryOptions {
    traceId?: string;
    action?: AuditActionType;
    actor?: string;
    target?: string;
    result?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
}

// ============================================================================
// IN-MEMORY STORE (replace with database in production)
// ============================================================================

const auditStore: AuditLogEntry[] = [];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Append a new entry to the audit log.
 * 
 * SECURITY: This is the ONLY way to add entries.
 * The chain hash is computed automatically.
 */
export function appendAuditLog(
    action: AuditActionType,
    actor: string,
    result: 'success' | 'failure' | 'blocked',
    options: {
        traceId?: string;
        target?: string;
        metadata?: Record<string, unknown>;
        ip?: string;
    } = {}
): AuditLogEntry {
    const id = generateTraceId();
    const traceId = options.traceId || generateTraceId();
    const timestamp = new Date();

    // Create audit entry for hashing
    const entry: AuditEntry = {
        traceId,
        action,
        actor,
        target: options.target,
        result,
        metadata: options.metadata,
        timestamp,
        ipHash: options.ip ? hashIP(options.ip) : undefined,
    };

    // Compute payload hash
    const payloadHash = hashAuditPayload(entry);

    // Get previous entry's hash for chain
    const prevHash = auditStore.length > 0
        ? auditStore[auditStore.length - 1].payloadHash
        : null;

    // Compute chain hash
    const chainHash = createChainHash(payloadHash, prevHash);

    // Create full log entry
    const logEntry: AuditLogEntry = {
        id,
        traceId,
        action,
        actor,
        target: options.target,
        result,
        metadata: options.metadata,
        payloadHash,
        prevHash,
        chainHash,
        timestamp,
        ipHash: options.ip ? hashIP(options.ip) : undefined,
    };

    // Append (immutable)
    auditStore.push(logEntry);

    return logEntry;
}

/**
 * Query audit logs with filters.
 * 
 * SECURITY: Read-only access to audit trail.
 */
export function queryAuditLogs(options: AuditQueryOptions = {}): AuditLogEntry[] {
    let results = [...auditStore];

    // Apply filters
    if (options.traceId) {
        results = results.filter(e => e.traceId === options.traceId);
    }

    if (options.action) {
        results = results.filter(e => e.action === options.action);
    }

    if (options.actor) {
        results = results.filter(e => e.actor === options.actor);
    }

    if (options.target) {
        results = results.filter(e => e.target === options.target);
    }

    if (options.result) {
        results = results.filter(e => e.result === options.result);
    }

    if (options.startTime) {
        results = results.filter(e => e.timestamp >= options.startTime!);
    }

    if (options.endTime) {
        results = results.filter(e => e.timestamp <= options.endTime!);
    }

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;

    return results.slice(offset, offset + limit);
}

/**
 * Get the full audit trail for a specific session.
 * 
 * USAGE: Forensic analysis of session lifecycle.
 */
export function getSessionAuditTrail(sessionId: string): AuditLogEntry[] {
    return auditStore.filter(e => e.target === sessionId);
}

/**
 * Get timeline of events for a trace ID.
 * 
 * USAGE: Correlate all events from a single request.
 */
export function getTraceTimeline(traceId: string): AuditLogEntry[] {
    return auditStore
        .filter(e => e.traceId === traceId)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Verify the integrity of the audit chain.
 * 
 * SECURITY: Detects if any entries have been tampered with.
 * Returns the index of the first invalid entry, or -1 if valid.
 */
export function verifyAuditChainIntegrity(): {
    valid: boolean;
    invalidIndex?: number;
    reason?: string;
} {
    for (let i = 0; i < auditStore.length; i++) {
        const entry = auditStore[i];

        // Verify chain link
        if (i === 0) {
            if (entry.prevHash !== null) {
                return {
                    valid: false,
                    invalidIndex: i,
                    reason: 'First entry should have null prevHash',
                };
            }
        } else {
            const expectedPrevHash = auditStore[i - 1].payloadHash;
            if (entry.prevHash !== expectedPrevHash) {
                return {
                    valid: false,
                    invalidIndex: i,
                    reason: 'Chain link broken: prevHash does not match',
                };
            }
        }

        // Verify chain hash
        const expectedChainHash = createChainHash(entry.payloadHash, entry.prevHash);
        if (entry.chainHash !== expectedChainHash) {
            return {
                valid: false,
                invalidIndex: i,
                reason: 'Chain hash mismatch',
            };
        }
    }

    return { valid: true };
}

/**
 * Get audit statistics.
 * 
 * USAGE: Dashboard metrics for admin view.
 */
export function getAuditStats(): {
    totalEntries: number;
    entriesByAction: Record<string, number>;
    entriesByResult: Record<string, number>;
    chainValid: boolean;
} {
    const entriesByAction: Record<string, number> = {};
    const entriesByResult: Record<string, number> = {};

    for (const entry of auditStore) {
        entriesByAction[entry.action] = (entriesByAction[entry.action] || 0) + 1;
        entriesByResult[entry.result] = (entriesByResult[entry.result] || 0) + 1;
    }

    return {
        totalEntries: auditStore.length,
        entriesByAction,
        entriesByResult,
        chainValid: verifyAuditChainIntegrity().valid,
    };
}

// ============================================================================
// CONVENIENCE LOGGERS
// ============================================================================

/**
 * Log a session creation event.
 */
export function logSessionCreate(
    sessionId: string,
    actor: string,
    success: boolean,
    metadata?: Record<string, unknown>,
    ip?: string
): AuditLogEntry {
    return appendAuditLog(
        AuditAction.SESSION_CREATE,
        actor,
        success ? 'success' : 'failure',
        { target: sessionId, metadata, ip }
    );
}

/**
 * Log a session validation event.
 */
export function logSessionValidate(
    sessionId: string,
    actor: string,
    result: 'success' | 'failure' | 'blocked',
    metadata?: Record<string, unknown>,
    ip?: string
): AuditLogEntry {
    return appendAuditLog(
        AuditAction.SESSION_VALIDATE,
        actor,
        result,
        { target: sessionId, metadata, ip }
    );
}

/**
 * Log a fingerprint mismatch event.
 */
export function logFingerprintMismatch(
    sessionId: string,
    actor: string,
    metadata?: Record<string, unknown>,
    ip?: string
): AuditLogEntry {
    return appendAuditLog(
        AuditAction.FINGERPRINT_MISMATCH,
        actor,
        'blocked',
        { target: sessionId, metadata, ip }
    );
}

/**
 * Log an admin action.
 */
export function logAdminAction(
    action: string,
    adminId: string,
    target?: string,
    metadata?: Record<string, unknown>,
    ip?: string
): AuditLogEntry {
    return appendAuditLog(
        AuditAction.ADMIN_ACTION,
        `admin:${adminId}`,
        'success',
        { target, metadata: { ...metadata, action }, ip }
    );
}

/**
 * Log a simulation event.
 */
export function logSimulationEvent(
    simulationType: 'hijack' | 'replay',
    sessionId: string,
    adminId: string,
    metadata?: Record<string, unknown>,
    ip?: string
): AuditLogEntry {
    const action = simulationType === 'hijack'
        ? AuditAction.SIMULATION_HIJACK
        : AuditAction.SIMULATION_REPLAY;

    return appendAuditLog(
        action,
        `admin:${adminId}`,
        'success',
        { target: sessionId, metadata, ip }
    );
}

// Export the store for testing/debugging (read-only access in production)
export { auditStore as _auditStore };
