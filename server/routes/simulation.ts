/**
 * Simulation API Routes for InterceptX
 * 
 * SECURITY DESIGN:
 * ----------------
 * - Admin authentication required
 * - All simulations are logged to audit trail
 * - No actual session compromise occurs
 * - For controlled security testing only
 * 
 * ENDPOINTS:
 * - POST /api/simulation/hijack - Simulate session hijack
 * - POST /api/simulation/replay - Simulate replay attack
 * - GET /api/simulation/scenarios - Get predefined scenarios
 */

import { Router, type Request, type Response } from 'express';
import { simulateHijack, simulateDrift, getSuggestedAlterations } from '../simulation/intercept';
import { simulateReplay, captureRequest, getReplayScenarios } from '../simulation/replay';
import { success, error } from '../utils/response';
import { sessionStore } from '../routes/sessions';
import type { FingerprintComponents } from '../security/fingerprint';

const router = Router();

// ============================================================================
// MIDDLEWARE: Admin check
// ============================================================================

function requireAdmin(req: Request, res: Response, next: Function) {
    const adminId = req.header('X-Admin-Id');

    if (!adminId) {
        return error(res, 401, 'ADMIN_REQUIRED', 'Admin authentication required');
    }

    (req as any).adminId = adminId;
    next();
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/simulation/hijack
 * Simulate a session hijack attempt
 * 
 * Body: {
 *   sessionId: string,
 *   alterations: Partial<FingerprintComponents>,
 *   fingerprintComponents: FingerprintComponents (original)
 * }
 */
router.post('/hijack', requireAdmin, (req: Request, res: Response) => {
    const adminId = (req as any).adminId;

    try {
        const { sessionId, alterations, fingerprintComponents } = req.body;

        if (!sessionId || !alterations || !fingerprintComponents) {
            return error(res, 400, 'MISSING_PARAMS', 'sessionId, alterations, and fingerprintComponents required');
        }

        // Get session from store
        const session = sessionStore.get(sessionId);

        if (!session) {
            return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
        }

        // Run hijack simulation
        const result = simulateHijack(
            {
                id: session.id,
                userId: session.userId,
                fingerprintComponents,
                fingerprintSalt: session.fingerprintSalt,
            },
            {
                alterations,
                adminId,
            }
        );

        return success(res, result);

    } catch (err) {
        return error(res, 500, 'SIMULATION_FAILED', 'Failed to run hijack simulation');
    }
});

/**
 * POST /api/simulation/drift
 * Simulate gradual fingerprint drift
 * 
 * Body: {
 *   sessionId: string,
 *   driftSteps: Partial<FingerprintComponents>[],
 *   fingerprintComponents: FingerprintComponents
 * }
 */
router.post('/drift', requireAdmin, (req: Request, res: Response) => {
    const adminId = (req as any).adminId;

    try {
        const { sessionId, driftSteps, fingerprintComponents } = req.body;

        if (!sessionId || !driftSteps || !fingerprintComponents) {
            return error(res, 400, 'MISSING_PARAMS', 'sessionId, driftSteps, and fingerprintComponents required');
        }

        const session = sessionStore.get(sessionId);

        if (!session) {
            return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
        }

        const result = simulateDrift(
            {
                id: session.id,
                fingerprintComponents,
                fingerprintSalt: session.fingerprintSalt,
            },
            driftSteps,
            adminId
        );

        return success(res, result);

    } catch (err) {
        return error(res, 500, 'SIMULATION_FAILED', 'Failed to run drift simulation');
    }
});

/**
 * POST /api/simulation/replay
 * Simulate a replay attack
 * 
 * Body: {
 *   sessionId: string,
 *   modifications: ReplayModifications
 * }
 */
router.post('/replay', requireAdmin, (req: Request, res: Response) => {
    const adminId = (req as any).adminId;

    try {
        const { sessionId, modifications } = req.body;

        if (!sessionId) {
            return error(res, 400, 'MISSING_PARAMS', 'sessionId required');
        }

        const session = sessionStore.get(sessionId);

        if (!session) {
            return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
        }

        // Capture the current session state
        const capturedRequest = captureRequest(
            session.id,
            session.fingerprintHash,
            session.userId,
            session.expiresAt.getTime()
        );

        // Run replay simulation
        const result = simulateReplay({
            originalRequest: capturedRequest,
            modifications: modifications || {},
            adminId,
        });

        return success(res, result);

    } catch (err) {
        return error(res, 500, 'SIMULATION_FAILED', 'Failed to run replay simulation');
    }
});

/**
 * GET /api/simulation/scenarios
 * Get predefined simulation scenarios
 */
router.get('/scenarios', requireAdmin, (req: Request, res: Response) => {
    try {
        return success(res, {
            hijackAlterations: getSuggestedAlterations(),
            replayModifications: getReplayScenarios(),
        });

    } catch (err) {
        return error(res, 500, 'FETCH_FAILED', 'Failed to get scenarios');
    }
});

export default router;
