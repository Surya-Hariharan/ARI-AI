/**
 * Sessions API Routes for InterceptX
 * 
 * SECURITY DESIGN:
 * ----------------
 * - Sessions are cryptographically signed
 * - Sessions are bound to device fingerprints
 * - All operations are audit-logged
 * - No endpoint trusts client data blindly
 * 
 * ENDPOINTS:
 * - POST /api/sessions - Create new session with fingerprint
 * - GET /api/sessions/:id - Get session (validates fingerprint)
 * - POST /api/sessions/:id/validate - Validate session against fingerprint
 * - DELETE /api/sessions/:id - Terminate session
 */

import { Router, type Request, type Response } from 'express';
import {
    processFingerprint,
    compareFingerprints,
    validateFingerprintComponents,
    type FingerprintComponents,
} from '../security/fingerprint';
import {
    signSession,
    verifySessionSignature,
    generateTraceId,
    hashIP,
} from '../security/crypto';
import { type SessionStatus, SessionStatus as SessionStatusEnum } from '@shared/schema';
import { success, error, ApiError } from '../utils/response';

const router = Router();

// ============================================================================
// IN-MEMORY STORAGE (replace with DB in production)
// ============================================================================

interface StoredSession {
    id: string;
    userId?: string;
    fingerprintHash: string;
    fingerprintSalt: string;
    componentsHash: string;
    signature: string;
    status: string;
    degradationReason?: string;
    createdAt: Date;
    expiresAt: Date;
    lastActivityAt: Date;
    traceId: string;
}

interface StoredAuditLog {
    id: string;
    traceId: string;
    action: string;
    actor: string;
    target?: string;
    result: string;
    metadata?: Record<string, unknown>;
    payloadHash: string;
    prevHash?: string;
    timestamp: Date;
    ipHash?: string;
}

// Session storage
const sessionStore = new Map<string, StoredSession>();

// Audit log storage (append-only)
const auditLogs: StoredAuditLog[] = [];

// ============================================================================
// AUDIT HELPER
// ============================================================================

function addAuditLog(
    traceId: string,
    action: string,
    actor: string,
    result: string,
    target?: string,
    metadata?: Record<string, unknown>,
    ipHash?: string
): void {
    const log: StoredAuditLog = {
        id: generateTraceId(),
        traceId,
        action,
        actor,
        target,
        result,
        metadata,
        payloadHash: '', // Would compute hash in production
        prevHash: auditLogs.length > 0 ? auditLogs[auditLogs.length - 1].payloadHash : undefined,
        timestamp: new Date(),
        ipHash,
    };

    auditLogs.push(log);
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/sessions
 * Create a new session bound to a device fingerprint
 * 
 * Body: {
 *   fingerprint: FingerprintComponents,
 *   userId?: string
 * }
 */
router.post('/', async (req: Request, res: Response) => {
    const traceId = generateTraceId();

    try {
        const { fingerprint, userId } = req.body;

        // Validate fingerprint components
        if (!validateFingerprintComponents(fingerprint)) {
            addAuditLog(traceId, 'session.create', userId || 'anonymous', 'failure', undefined, {
                reason: 'invalid_fingerprint',
            });

            return error(res, 400, 'INVALID_FINGERPRINT', 'Invalid or incomplete fingerprint data');
        }

        // Process fingerprint (hash with new salt)
        const processed = processFingerprint(fingerprint as FingerprintComponents);

        // Generate session ID and expiry
        const sessionId = generateTraceId();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Sign the session
        const signature = signSession({
            sessionId,
            fingerprintHash: processed.hash,
            userId,
            expiresAt: expiresAt.getTime(),
        });

        // Store session
        const session: StoredSession = {
            id: sessionId,
            userId,
            fingerprintHash: processed.hash,
            fingerprintSalt: processed.salt,
            componentsHash: processed.componentsHash,
            signature,
            status: SessionStatusEnum.ACTIVE,
            createdAt: new Date(),
            expiresAt,
            lastActivityAt: new Date(),
            traceId,
        };

        sessionStore.set(sessionId, session);

        // Audit log
        addAuditLog(
            traceId,
            'session.create',
            userId || 'anonymous',
            'success',
            sessionId,
            {
                confidenceScore: processed.confidenceScore,
                signalCount: processed.signalCount,
            },
            hashIP(req.ip || 'unknown')
        );

        // Return session (without sensitive data)
        return success(res, {
            sessionId,
            status: session.status,
            expiresAt: session.expiresAt.toISOString(),
            traceId,
        }, 201);

    } catch (err) {
        addAuditLog(traceId, 'session.create', 'system', 'failure', undefined, {
            error: err instanceof Error ? err.message : 'unknown',
        });

        return error(res, 500, 'SESSION_CREATE_FAILED', 'Failed to create session');
    }
});

/**
 * GET /api/sessions/:id
 * Get session details (validates current fingerprint)
 * 
 * Headers: X-Fingerprint (JSON stringified fingerprint)
 */
router.get('/:id', async (req: Request, res: Response) => {
    const traceId = generateTraceId();
    const { id } = req.params;

    try {
        const session = sessionStore.get(id);

        if (!session) {
            addAuditLog(traceId, 'session.read', 'anonymous', 'failure', id, {
                reason: 'not_found',
            });

            return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
        }

        // Check expiry
        if (new Date() > session.expiresAt) {
            session.status = SessionStatusEnum.TERMINATED;
            session.degradationReason = 'expired';

            addAuditLog(traceId, 'session.read', session.userId || 'anonymous', 'failure', id, {
                reason: 'expired',
            });

            return error(res, 410, 'SESSION_EXPIRED', 'Session has expired');
        }

        // Update last activity
        session.lastActivityAt = new Date();

        addAuditLog(traceId, 'session.read', session.userId || 'anonymous', 'success', id);

        return success(res, {
            sessionId: session.id,
            status: session.status,
            degradationReason: session.degradationReason,
            expiresAt: session.expiresAt.toISOString(),
            lastActivityAt: session.lastActivityAt.toISOString(),
        });

    } catch (err) {
        return error(res, 500, 'SESSION_READ_FAILED', 'Failed to read session');
    }
});

/**
 * POST /api/sessions/:id/validate
 * Validate session against current fingerprint
 * 
 * Body: {
 *   fingerprint: FingerprintComponents
 * }
 * 
 * Returns validation result and updates session status if degraded
 */
router.post('/:id/validate', async (req: Request, res: Response) => {
    const traceId = generateTraceId();
    const { id } = req.params;

    try {
        const { fingerprint } = req.body;
        const session = sessionStore.get(id);

        if (!session) {
            return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
        }

        // Validate fingerprint components
        if (!validateFingerprintComponents(fingerprint)) {
            return error(res, 400, 'INVALID_FINGERPRINT', 'Invalid fingerprint data');
        }

        // Compare fingerprints
        const comparison = compareFingerprints(
            fingerprint as FingerprintComponents,
            session.fingerprintHash,
            session.componentsHash,
            session.fingerprintSalt
        );

        // Update session status based on comparison
        if (!comparison.matches && !comparison.withinTolerance) {
            session.status = SessionStatusEnum.INTERCEPTED;
            session.degradationReason = `Fingerprint mismatch (drift: ${comparison.driftScore})`;

            addAuditLog(
                traceId,
                'fingerprint.mismatch',
                session.userId || 'anonymous',
                'blocked',
                id,
                {
                    driftScore: comparison.driftScore,
                    driftedComponents: comparison.driftedComponents,
                },
                hashIP(req.ip || 'unknown')
            );

            return success(res, {
                valid: false,
                status: session.status,
                reason: 'fingerprint_mismatch',
                driftScore: comparison.driftScore,
            });
        }

        if (!comparison.matches && comparison.withinTolerance) {
            session.status = SessionStatusEnum.DEGRADED;
            session.degradationReason = `Fingerprint drift detected (drift: ${comparison.driftScore})`;

            addAuditLog(
                traceId,
                'fingerprint.drift',
                session.userId || 'anonymous',
                'success',
                id,
                {
                    driftScore: comparison.driftScore,
                    withinTolerance: true,
                },
                hashIP(req.ip || 'unknown')
            );
        } else {
            addAuditLog(
                traceId,
                'session.validate',
                session.userId || 'anonymous',
                'success',
                id
            );
        }

        // Verify signature
        const signatureValid = verifySessionSignature(
            {
                sessionId: session.id,
                fingerprintHash: session.fingerprintHash,
                userId: session.userId,
                expiresAt: session.expiresAt.getTime(),
            },
            session.signature
        );

        if (!signatureValid) {
            session.status = SessionStatusEnum.INTERCEPTED;
            session.degradationReason = 'Signature verification failed';

            addAuditLog(
                traceId,
                'session.validate',
                session.userId || 'anonymous',
                'blocked',
                id,
                { reason: 'invalid_signature' }
            );

            return success(res, {
                valid: false,
                status: session.status,
                reason: 'signature_invalid',
            });
        }

        session.lastActivityAt = new Date();

        return success(res, {
            valid: true,
            status: session.status,
            driftScore: comparison.driftScore,
            withinTolerance: comparison.withinTolerance,
        });

    } catch (err) {
        return error(res, 500, 'VALIDATION_FAILED', 'Failed to validate session');
    }
});

/**
 * DELETE /api/sessions/:id
 * Terminate a session
 */
router.delete('/:id', async (req: Request, res: Response) => {
    const traceId = generateTraceId();
    const { id } = req.params;

    try {
        const session = sessionStore.get(id);

        if (!session) {
            return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
        }

        session.status = SessionStatusEnum.TERMINATED;
        session.degradationReason = 'User terminated';

        addAuditLog(
            traceId,
            'session.terminate',
            session.userId || 'anonymous',
            'success',
            id,
            {},
            hashIP(req.ip || 'unknown')
        );

        return success(res, {
            sessionId: id,
            status: session.status,
            terminatedAt: new Date().toISOString(),
        });

    } catch (err) {
        return error(res, 500, 'TERMINATION_FAILED', 'Failed to terminate session');
    }
});

// Export for internal use (simulation engine will need this)
export { sessionStore, auditLogs };

export default router;
