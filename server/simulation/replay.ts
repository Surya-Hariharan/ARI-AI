/**
 * Request Replay Simulation for InterceptX
 * 
 * SECURITY NOTE:
 * --------------
 * This is a SIMULATION module for controlled security testing.
 * It simulates replaying captured requests with mismatched signatures.
 * 
 * PURPOSE:
 * - Test replay attack detection
 * - Verify timestamp validation
 * - Verify signature verification
 * - Log all simulation activity
 * 
 * USAGE:
 * Admins use this to validate the system's replay attack prevention.
 */

import { signSession, verifySessionSignature, generateTraceId } from '../security/crypto';
import { logSimulationEvent } from '../security/audit';

// ============================================================================
// TYPES
// ============================================================================

export interface ReplayConfig {
    // Original request data
    originalRequest: {
        sessionId: string;
        fingerprintHash: string;
        userId?: string;
        expiresAt: number;
        timestamp: number;
        signature: string;
    };

    // Modifications to apply for replay
    modifications: {
        // Replay exact request (should fail timestamp check)
        useOriginalTimestamp?: boolean;

        // Modify signature
        alterSignature?: boolean;

        // Modify session data but keep signature (should fail verification)
        alterSessionId?: boolean;
        alterFingerprintHash?: boolean;
        alterExpiry?: boolean;
    };

    // Admin initiating the simulation
    adminId: string;
}

export interface ReplayResult {
    replayAttemptId: string;
    originalRequestId: string;
    blocked: boolean;
    blockReason?: string;
    timeline: ReplayTimelineEvent[];
    checks: {
        timestampValid: boolean;
        signatureValid: boolean;
        sessionIntact: boolean;
    };
}

export interface ReplayTimelineEvent {
    timestamp: Date;
    event: string;
    details: Record<string, unknown>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const REPLAY_CONFIG = {
    // Maximum age of a request before it's considered a replay attack
    MAX_REQUEST_AGE_MS: 30000, // 30 seconds

    // Clock skew tolerance
    CLOCK_SKEW_TOLERANCE_MS: 5000, // 5 seconds
};

// ============================================================================
// REPLAY SIMULATION
// ============================================================================

/**
 * Simulate a replay attack on a session request.
 * 
 * FLOW:
 * 1. Apply specified modifications to original request
 * 2. Run through validation checks
 * 3. Track which checks catch the attack
 * 4. Return detailed results
 */
export function simulateReplay(config: ReplayConfig): ReplayResult {
    const timeline: ReplayTimelineEvent[] = [];
    const startTime = new Date();
    const replayAttemptId = `replay_${generateTraceId()}`;

    const { originalRequest, modifications } = config;

    // 1. Record simulation start
    timeline.push({
        timestamp: startTime,
        event: 'replay_simulation_start',
        details: {
            originalSessionId: originalRequest.sessionId,
            modifications: Object.keys(modifications).filter(k => (modifications as any)[k]),
        },
    });

    // 2. Build replay request
    const replayRequest = buildReplayRequest(originalRequest, modifications);

    timeline.push({
        timestamp: new Date(),
        event: 'replay_request_built',
        details: {
            hasModifications: Object.values(modifications).some(v => v),
        },
    });

    // 3. Check timestamp
    const now = Date.now();
    const requestAge = now - replayRequest.timestamp;
    const timestampValid =
        requestAge <= REPLAY_CONFIG.MAX_REQUEST_AGE_MS &&
        replayRequest.timestamp <= now + REPLAY_CONFIG.CLOCK_SKEW_TOLERANCE_MS;

    timeline.push({
        timestamp: new Date(),
        event: 'timestamp_check',
        details: {
            requestAge,
            maxAge: REPLAY_CONFIG.MAX_REQUEST_AGE_MS,
            valid: timestampValid,
        },
    });

    // 4. Check signature
    const signatureValid = verifySessionSignature(
        {
            sessionId: replayRequest.sessionId,
            fingerprintHash: replayRequest.fingerprintHash,
            userId: replayRequest.userId,
            expiresAt: replayRequest.expiresAt,
        },
        replayRequest.signature
    );

    timeline.push({
        timestamp: new Date(),
        event: 'signature_check',
        details: {
            valid: signatureValid,
        },
    });

    // 5. Check session integrity
    const sessionIntact =
        replayRequest.sessionId === originalRequest.sessionId &&
        replayRequest.fingerprintHash === originalRequest.fingerprintHash &&
        replayRequest.expiresAt === originalRequest.expiresAt;

    timeline.push({
        timestamp: new Date(),
        event: 'integrity_check',
        details: {
            intact: sessionIntact,
        },
    });

    // 6. Determine overall result
    const blocked = !timestampValid || !signatureValid;
    let blockReason: string | undefined;

    if (!timestampValid) {
        blockReason = 'timestamp_expired_or_future';
    } else if (!signatureValid) {
        blockReason = 'signature_mismatch';
    }

    timeline.push({
        timestamp: new Date(),
        event: 'replay_simulation_complete',
        details: {
            blocked,
            blockReason,
            durationMs: Date.now() - startTime.getTime(),
        },
    });

    // 7. Log to audit
    logSimulationEvent(
        'replay',
        originalRequest.sessionId,
        config.adminId,
        {
            replayAttemptId,
            blocked,
            blockReason,
            checks: {
                timestampValid,
                signatureValid,
                sessionIntact,
            },
        }
    );

    return {
        replayAttemptId,
        originalRequestId: originalRequest.sessionId,
        blocked,
        blockReason,
        timeline,
        checks: {
            timestampValid,
            signatureValid,
            sessionIntact,
        },
    };
}

/**
 * Build a modified replay request.
 */
function buildReplayRequest(
    original: ReplayConfig['originalRequest'],
    modifications: ReplayConfig['modifications']
): ReplayConfig['originalRequest'] {
    const replay = { ...original };

    // Use original timestamp (for replay attack simulation)
    if (!modifications.useOriginalTimestamp) {
        replay.timestamp = Date.now();
    }

    // Alter session ID
    if (modifications.alterSessionId) {
        replay.sessionId = `altered_${original.sessionId}`;
    }

    // Alter fingerprint hash
    if (modifications.alterFingerprintHash) {
        replay.fingerprintHash = `altered_${original.fingerprintHash}`;
    }

    // Alter expiry
    if (modifications.alterExpiry) {
        replay.expiresAt = original.expiresAt + 3600000; // Add 1 hour
    }

    // Alter signature
    if (modifications.alterSignature) {
        replay.signature = `invalid_${original.signature.substring(0, 32)}`;
    }

    return replay;
}

/**
 * Create a captured request snapshot for replay testing.
 */
export function captureRequest(
    sessionId: string,
    fingerprintHash: string,
    userId?: string,
    expiresAt?: number
): ReplayConfig['originalRequest'] {
    const exp = expiresAt || Date.now() + 24 * 60 * 60 * 1000;

    const signature = signSession({
        sessionId,
        fingerprintHash,
        userId,
        expiresAt: exp,
    });

    return {
        sessionId,
        fingerprintHash,
        userId,
        expiresAt: exp,
        timestamp: Date.now(),
        signature,
    };
}

/**
 * Get predefined replay scenarios for testing.
 */
export function getReplayScenarios(): Record<string, ReplayConfig['modifications']> {
    return {
        // Exact replay (should fail timestamp)
        exactReplay: {
            useOriginalTimestamp: true,
        },

        // Modified signature
        tamperedSignature: {
            alterSignature: true,
        },

        // Session hijack attempt
        sessionHijack: {
            alterSessionId: true,
        },

        // Fingerprint swap
        fingerprintSwap: {
            alterFingerprintHash: true,
        },

        // Session extension attempt
        sessionExtension: {
            alterExpiry: true,
        },

        // Combined attack
        combinedAttack: {
            useOriginalTimestamp: true,
            alterSignature: true,
            alterFingerprintHash: true,
        },
    };
}
