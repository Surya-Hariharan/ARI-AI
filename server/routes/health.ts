/**
 * Health Check Endpoint for ARI Backend
 * 
 * DESIGN INTENT:
 * --------------
 * Public endpoint for infrastructure monitoring.
 * This endpoint is intentionally unauthenticated to allow
 * load balancers and health checkers to verify service status.
 * 
 * SECURITY NOTE:
 * This endpoint reveals minimal information about the service.
 * It does NOT expose internal state, configuration, or debug info.
 */

import { Router } from 'express';
import { sendSuccess } from '../utils/response';

const router = Router();

/**
 * GET /api/health
 * 
 * Returns basic health status of the ARI backend service.
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "status": "ok",
 *     "service": "ARI-backend",
 *     "timestamp": 1234567890
 *   }
 * }
 */
router.get('/', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    service: 'ARI-backend',
    timestamp: Date.now(),
  });
});

export default router;
