/**
 * Audit Log API Routes for InterceptX
 * 
 * SECURITY DESIGN:
 * ----------------
 * - ALL endpoints are READ-ONLY
 * - Admin authentication required (TODO: implement proper auth)
 * - All access is logged
 * - No modification of audit logs is possible via API
 * 
 * ENDPOINTS:
 * - GET /api/audit/logs - Query audit logs
 * - GET /api/audit/logs/:traceId - Get trace timeline
 * - GET /api/audit/sessions/:id - Get session audit trail
 * - GET /api/audit/stats - Get audit statistics
 * - GET /api/audit/verify - Verify chain integrity
 */

import { Router, type Request, type Response } from 'express';
import {
    queryAuditLogs,
    getSessionAuditTrail,
    getTraceTimeline,
    verifyAuditChainIntegrity,
    getAuditStats,
    logAdminAction,
} from '../security/audit';
import { success, error } from '../utils/response';
import { generateTraceId } from '../security/crypto';

const router = Router();

// ============================================================================
// MIDDLEWARE: Admin check (placeholder)
// ============================================================================

/**
 * TODO: Implement proper admin authentication.
 * For now, we accept a mock admin header.
 */
function requireAdmin(req: Request, res: Response, next: Function) {
    const adminId = req.header('X-Admin-Id');

    if (!adminId) {
        return error(res, 401, 'ADMIN_REQUIRED', 'Admin authentication required');
    }

    // Attach admin ID to request for logging
    (req as any).adminId = adminId;
    next();
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/audit/logs
 * Query audit logs with filters
 * 
 * Query params:
 * - action: Filter by action type
 * - actor: Filter by actor
 * - target: Filter by target
 * - result: Filter by result
 * - startTime: Filter from timestamp (ISO)
 * - endTime: Filter to timestamp (ISO)
 * - limit: Max results (default 100)
 * - offset: Pagination offset
 */
router.get('/logs', requireAdmin, (req: Request, res: Response) => {
    const adminId = (req as any).adminId;

    try {
        const options = {
            action: req.query.action as string | undefined,
            actor: req.query.actor as string | undefined,
            target: req.query.target as string | undefined,
            result: req.query.result as string | undefined,
            startTime: req.query.startTime
                ? new Date(req.query.startTime as string)
                : undefined,
            endTime: req.query.endTime
                ? new Date(req.query.endTime as string)
                : undefined,
            limit: req.query.limit
                ? parseInt(req.query.limit as string, 10)
                : 100,
            offset: req.query.offset
                ? parseInt(req.query.offset as string, 10)
                : 0,
        };

        const logs = queryAuditLogs(options);

        // Log admin access
        logAdminAction('view_audit_logs', adminId, undefined, {
            filters: options,
            resultCount: logs.length,
        }, req.ip);

        return success(res, {
            logs,
            count: logs.length,
            offset: options.offset,
            limit: options.limit,
        });

    } catch (err) {
        return error(res, 500, 'QUERY_FAILED', 'Failed to query audit logs');
    }
});

/**
 * GET /api/audit/logs/:traceId
 * Get timeline for a specific trace ID
 */
router.get('/logs/:traceId', requireAdmin, (req: Request, res: Response) => {
    const adminId = (req as any).adminId;
    const { traceId } = req.params;

    try {
        const timeline = getTraceTimeline(traceId);

        logAdminAction('view_trace_timeline', adminId, traceId, {
            eventCount: timeline.length,
        }, req.ip);

        return success(res, {
            traceId,
            timeline,
            eventCount: timeline.length,
        });

    } catch (err) {
        return error(res, 500, 'QUERY_FAILED', 'Failed to get trace timeline');
    }
});

/**
 * GET /api/audit/sessions/:id
 * Get full audit trail for a session
 */
router.get('/sessions/:id', requireAdmin, (req: Request, res: Response) => {
    const adminId = (req as any).adminId;
    const { id } = req.params;

    try {
        const trail = getSessionAuditTrail(id);

        logAdminAction('view_session_audit', adminId, id, {
            eventCount: trail.length,
        }, req.ip);

        return success(res, {
            sessionId: id,
            auditTrail: trail,
            eventCount: trail.length,
        });

    } catch (err) {
        return error(res, 500, 'QUERY_FAILED', 'Failed to get session audit trail');
    }
});

/**
 * GET /api/audit/stats
 * Get audit log statistics
 */
router.get('/stats', requireAdmin, (req: Request, res: Response) => {
    const adminId = (req as any).adminId;

    try {
        const stats = getAuditStats();

        logAdminAction('view_audit_stats', adminId, undefined, undefined, req.ip);

        return success(res, stats);

    } catch (err) {
        return error(res, 500, 'QUERY_FAILED', 'Failed to get audit statistics');
    }
});

/**
 * GET /api/audit/verify
 * Verify audit chain integrity
 * 
 * SECURITY: This endpoint allows admins to verify the audit log
 * has not been tampered with.
 */
router.get('/verify', requireAdmin, (req: Request, res: Response) => {
    const adminId = (req as any).adminId;

    try {
        const result = verifyAuditChainIntegrity();

        logAdminAction('verify_audit_chain', adminId, undefined, {
            valid: result.valid,
        }, req.ip);

        return success(res, {
            chainValid: result.valid,
            invalidIndex: result.invalidIndex,
            reason: result.reason,
            verifiedAt: new Date().toISOString(),
        });

    } catch (err) {
        return error(res, 500, 'VERIFICATION_FAILED', 'Failed to verify audit chain');
    }
});

export default router;
