/**
 * Trigger Endpoint for ARI Backend
 * 
 * SECURITY DESIGN INTENT:
 * -----------------------
 * This is the core security-critical endpoint for ARI.
 * It receives trigger events from the mobile app and enforces:
 * 
 * 1. AUTHENTICATION: JWT validation (user must be authenticated)
 * 2. AUTHORIZATION: Policy evaluation (action must be allowed)
 * 
 * BOUNDED LISTENING PRINCIPLE:
 * The trigger endpoint is called AFTER the user explicitly activates ARI.
 * The mobile app is not continuously listening - it only captures audio
 * after this trigger is approved by the server.
 * 
 * TRUST BOUNDARY:
 * - The mobile app is UNTRUSTED
 * - All security decisions happen HERE, on the server
 * - The server can deny triggers based on policy
 */

import { Router } from 'express';
import { validateAuthHeader } from '../security/jwt';
import { evaluatePolicy, type TriggerEvent } from '../security/policy';
import { sendSuccess, sendError, sendUnauthorized, sendForbidden } from '../utils/response';

const router = Router();

/**
 * Request body validation
 * 
 * SECURITY NOTE:
 * We validate the structure of incoming requests before processing.
 * This prevents malformed data from reaching the policy engine.
 */
function validateTriggerRequest(body: unknown): TriggerEvent | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  
  const request = body as Record<string, unknown>;
  
  // Validate required fields
  if (typeof request.event !== 'string') {
    return null;
  }
  
  if (typeof request.device_id !== 'string') {
    return null;
  }
  
  if (typeof request.timestamp !== 'number') {
    return null;
  }
  
  return {
    event: request.event,
    device_id: request.device_id,
    timestamp: request.timestamp,
  };
}

/**
 * POST /api/trigger
 * 
 * Processes a trigger request from the mobile app.
 * 
 * SECURITY FLOW:
 * 1. Validate request body structure
 * 2. Validate JWT from Authorization header
 * 3. Evaluate policy against trigger event
 * 4. Return allow/deny decision
 * 
 * Request Headers:
 *   Authorization: Bearer <jwt_token>
 * 
 * Request Body:
 *   {
 *     "event": "voice_trigger",
 *     "device_id": "string",
 *     "timestamp": number (Unix timestamp in milliseconds)
 *   }
 * 
 * Success Response (200):
 *   {
 *     "success": true,
 *     "data": {
 *       "allowed": true,
 *       "reason": "policy_passed"
 *     }
 *   }
 * 
 * Error Responses:
 *   400 - Invalid request body
 *   401 - Missing or invalid JWT
 *   403 - Policy denied the trigger
 */
router.post('/', (req, res) => {
  // Step 1: Validate request body
  const triggerEvent = validateTriggerRequest(req.body);
  
  if (!triggerEvent) {
    return sendError(
      res,
      'INVALID_REQUEST',
      'Request body must include: event (string), device_id (string), timestamp (number)',
      400
    );
  }
  
  // Step 2: Validate JWT authentication
  // SECURITY INTENT: No trigger is processed without valid authentication
  const authResult = validateAuthHeader(req.headers.authorization);
  
  if (!authResult.valid) {
    // Log authentication failures for security monitoring
    console.log(`[SECURITY] Auth failed for device ${triggerEvent.device_id}: ${authResult.error}`);
    return sendUnauthorized(res, authResult.error);
  }
  
  // Step 3: Evaluate policy
  // SECURITY INTENT: Even authenticated users must pass policy checks
  const policyResult = evaluatePolicy(triggerEvent, authResult.payload);
  
  if (!policyResult.allowed) {
    // Log policy denials for security monitoring
    console.log(`[SECURITY] Policy denied for device ${triggerEvent.device_id}: ${policyResult.reason}`);
    return sendForbidden(res, policyResult.reason);
  }
  
  // Step 4: Trigger approved
  // Log successful triggers for audit trail
  console.log(`[TRIGGER] Approved for device ${triggerEvent.device_id}`);
  
  sendSuccess(res, {
    allowed: true,
    reason: policyResult.reason,
  });
});

export default router;
