/**
 * Session Interception Simulation for InterceptX
 * 
 * SECURITY NOTE:
 * --------------
 * This is a SIMULATION module for controlled security testing.
 * It does NOT perform actual session hijacking.
 * 
 * PURPOSE:
 * - Clone sessions with altered fingerprint components
 * - Detect if the system correctly identifies the anomaly
 * - Generate timeline of compromise events
 * - Log all simulation activity for audit
 * 
 * USAGE:
 * Admins use this to test and demonstrate the security system.
 */

import {
    processFingerprint,
    createAlteredFingerprint,
    type FingerprintComponents,
    type ProcessedFingerprint,
} from '../security/fingerprint';
import { signSession, generateTraceId } from '../security/crypto';
import { logSimulationEvent } from '../security/audit';
import { SessionStatus } from '@shared/schema';

// ============================================================================
// TYPES
// ============================================================================

export interface SimulationConfig {
    // Which fingerprint components to alter
    alterations: Partial<FingerprintComponents>;

    // Admin initiating the simulation
    adminId: string;

    // Optional custom session duration
    sessionDurationMs?: number;
}

export interface SimulationResult {
    originalSessionId: string;
    clonedSessionId: string;
    detected: boolean;
    detectionMethod?: string;
    timeline: TimelineEvent[];
    driftScore: number;
    alteredComponents: string[];
}

export interface TimelineEvent {
    timestamp: Date;
    event: string;
    details: Record<string, unknown>;
}

// ============================================================================
// SIMULATION ENGINE
// ============================================================================

/**
 * Simulate a session hijack by creating a cloned session with altered fingerprint.
 * 
 * FLOW:
 * 1. Clone the original session's fingerprint
 * 2. Apply specified alterations
 * 3. Create new session with altered fingerprint
 * 4. Track whether system detects the anomaly
 * 5. Return detailed timeline and results
 */
export function simulateHijack(
    originalSession: {
        id: string;
        userId?: string;
        fingerprintComponents: FingerprintComponents;
        fingerprintSalt: string;
    },
    config: SimulationConfig
): SimulationResult {
    const timeline: TimelineEvent[] = [];
    const startTime = new Date();

    // 1. Record simulation start
    timeline.push({
        timestamp: startTime,
        event: 'simulation_start',
        details: {
            type: 'hijack',
            originalSessionId: originalSession.id,
            alterations: Object.keys(config.alterations),
        },
    });

    // 2. Create altered fingerprint
    const alteredComponents = createAlteredFingerprint(
        originalSession.fingerprintComponents,
        config.alterations
    );

    timeline.push({
        timestamp: new Date(),
        event: 'fingerprint_altered',
        details: {
            alteredFields: Object.keys(config.alterations),
        },
    });

    // 3. Process altered fingerprint (simulating attacker's attempt)
    // Use a NEW salt - attacker doesn't have the original salt
    const attackerProcessed = processFingerprint(alteredComponents);

    // 4. Compare against legitimate session's fingerprint
    // The system should detect mismatch because:
    // - Different salt means completely different hash
    // - Even with same salt, altered components would drift
    const legitProcessed = processFingerprint(
        originalSession.fingerprintComponents,
        originalSession.fingerprintSalt
    );

    // 5. Detection logic
    const hashMatch = attackerProcessed.hash === legitProcessed.hash;
    const detected = !hashMatch;

    timeline.push({
        timestamp: new Date(),
        event: 'detection_check',
        details: {
            hashMatch,
            detected,
            detectionMethod: detected ? 'fingerprint_mismatch' : 'none',
        },
    });

    // 6. Create cloned session ID for tracking
    const clonedSessionId = `sim_${generateTraceId()}`;

    // 7. Calculate drift score (percentage of altered signals)
    const totalSignals = Object.keys(originalSession.fingerprintComponents).length;
    const alteredSignalCount = Object.keys(config.alterations).length;
    const driftScore = Math.round((alteredSignalCount / totalSignals) * 100);

    // 8. Record simulation completion
    timeline.push({
        timestamp: new Date(),
        event: 'simulation_complete',
        details: {
            durationMs: Date.now() - startTime.getTime(),
            detected,
            driftScore,
        },
    });

    // 9. Log to audit trail
    logSimulationEvent(
        'hijack',
        originalSession.id,
        config.adminId,
        {
            clonedSessionId,
            detected,
            driftScore,
            alteredCount: alteredSignalCount,
        }
    );

    return {
        originalSessionId: originalSession.id,
        clonedSessionId,
        detected,
        detectionMethod: detected ? 'fingerprint_hash_mismatch' : undefined,
        timeline,
        driftScore,
        alteredComponents: Object.keys(config.alterations),
    };
}

/**
 * Simulate gradual fingerprint drift.
 * 
 * USAGE: Test tolerance-based detection by incrementally
 * changing fingerprint components.
 */
export function simulateDrift(
    originalSession: {
        id: string;
        fingerprintComponents: FingerprintComponents;
        fingerprintSalt: string;
    },
    driftSteps: Partial<FingerprintComponents>[],
    adminId: string
): {
    steps: Array<{
        step: number;
        alterations: Partial<FingerprintComponents>;
        detected: boolean;
        cumulativeDrift: number;
    }>;
} {
    const results: Array<{
        step: number;
        alterations: Partial<FingerprintComponents>;
        detected: boolean;
        cumulativeDrift: number;
    }> = [];

    let cumulativeAlterations: Partial<FingerprintComponents> = {};

    for (let i = 0; i < driftSteps.length; i++) {
        // Accumulate alterations
        cumulativeAlterations = {
            ...cumulativeAlterations,
            ...driftSteps[i],
        };

        // Test detection
        const simulation = simulateHijack(originalSession, {
            alterations: cumulativeAlterations,
            adminId,
        });

        results.push({
            step: i + 1,
            alterations: driftSteps[i],
            detected: simulation.detected,
            cumulativeDrift: simulation.driftScore,
        });

        // If detected, stop simulation
        if (simulation.detected) {
            break;
        }
    }

    return { steps: results };
}

/**
 * Get suggested alterations for testing different attack scenarios.
 */
export function getSuggestedAlterations(): Record<string, Partial<FingerprintComponents>> {
    return {
        // Different browser
        browserChange: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },

        // Different device
        deviceChange: {
            screenWidth: 1920,
            screenHeight: 1080,
            pixelRatio: 1,
            hardwareConcurrency: 8,
        },

        // Different location
        locationChange: {
            timezone: 'America/New_York',
            timezoneOffset: -300,
        },

        // Full device spoof (high detection)
        fullSpoof: {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            platform: 'MacIntel',
            screenWidth: 1440,
            screenHeight: 900,
            pixelRatio: 2,
            timezone: 'Europe/London',
            timezoneOffset: 0,
        },

        // Subtle change (low detection)
        subtleChange: {
            colorDepth: 24,
        },
    };
}
