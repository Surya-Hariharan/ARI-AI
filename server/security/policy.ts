/**
 * Policy Enforcement Module for ARI Backend
 * 
 * SECURITY DESIGN INTENT:
 * -----------------------
 * This module implements server-side policy enforcement for ARI triggers.
 * 
 * KEY SECURITY PRINCIPLES:
 * 1. ALL policy decisions happen server-side - never trust the client
 * 2. Policies are the final gate before any action is allowed
 * 3. Policy evaluation is logged for audit purposes
 * 4. Policies can incorporate multiple factors (device, user, time, rate limits)
 * 
 * BOUNDED LISTENING DESIGN:
 * The policy system enforces that audio capture is:
 * - Explicitly triggered by user action (verified via trigger event)
 * - Time-bounded (client reports timestamp, server validates recency)
 * - Device-specific (device_id is tracked)
 */

import type { JWTPayload } from './jwt';

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface TriggerEvent {
  event: string;
  device_id: string;
  timestamp: number;
}

/**
 * Policy configuration
 * 
 * PRODUCTION NOTES:
 * These would typically come from environment variables or a config service.
 * They define the bounds of acceptable trigger behavior.
 */
const POLICY_CONFIG = {
  // Maximum age of a trigger event (in milliseconds)
  // Triggers older than this are rejected to prevent replay attacks
  MAX_TRIGGER_AGE_MS: 30000, // 30 seconds
  
  // Allowed event types
  ALLOWED_EVENTS: ['voice_trigger'],
  
  // Maximum triggers per device per minute (for rate limiting)
  MAX_TRIGGERS_PER_MINUTE: 10,
};

/**
 * In-memory rate limit store
 * 
 * PRODUCTION NOTE:
 * This should be replaced with Redis or similar for distributed rate limiting.
 * The in-memory store only works for single-instance deployments.
 */
const rateLimitStore: Map<string, { count: number; windowStart: number }> = new Map();

/**
 * Validates that the trigger event type is allowed
 * 
 * SECURITY INTENT:
 * Only specific, pre-approved event types can trigger actions.
 * This prevents injection of arbitrary event types.
 */
function validateEventType(event: string): boolean {
  return POLICY_CONFIG.ALLOWED_EVENTS.includes(event);
}

/**
 * Validates trigger event timestamp
 * 
 * SECURITY INTENT:
 * Prevents replay attacks by rejecting stale trigger events.
 * The client-provided timestamp must be within acceptable bounds.
 */
function validateTimestamp(timestamp: number): boolean {
  const now = Date.now();
  const age = now - timestamp;
  
  // Reject if timestamp is in the future (clock skew tolerance: 5 seconds)
  if (timestamp > now + 5000) {
    return false;
  }
  
  // Reject if timestamp is too old
  if (age > POLICY_CONFIG.MAX_TRIGGER_AGE_MS) {
    return false;
  }
  
  return true;
}

/**
 * Checks rate limits for a device
 * 
 * SECURITY INTENT:
 * Prevents abuse by limiting how frequently a device can trigger actions.
 * This protects against both malicious actors and buggy clients.
 */
function checkRateLimit(deviceId: string): boolean {
  const now = Date.now();
  const windowDuration = 60000; // 1 minute
  
  const existing = rateLimitStore.get(deviceId);
  
  if (!existing || (now - existing.windowStart) > windowDuration) {
    // New window
    rateLimitStore.set(deviceId, { count: 1, windowStart: now });
    return true;
  }
  
  if (existing.count >= POLICY_CONFIG.MAX_TRIGGERS_PER_MINUTE) {
    return false;
  }
  
  existing.count++;
  return true;
}

/**
 * Validates device identity
 * 
 * SECURITY INTENT:
 * Ensures the device_id in the trigger matches the device_id in the JWT.
 * This prevents token theft/misuse across devices.
 */
function validateDeviceIdentity(
  triggerDeviceId: string,
  jwtPayload: JWTPayload | undefined
): boolean {
  // In scaffold mode, we're lenient about device matching
  // In production, this would be strictly enforced
  if (!jwtPayload?.device_id) {
    // No device_id in JWT - allow for scaffold purposes
    return true;
  }
  
  return triggerDeviceId === jwtPayload.device_id;
}

/**
 * Main policy evaluation function
 * 
 * SECURITY DESIGN:
 * ----------------
 * This function is the SINGLE POINT of policy enforcement.
 * All trigger requests must pass through this evaluation.
 * 
 * The evaluation order is intentional:
 * 1. Event type validation (fast, prevents invalid events early)
 * 2. Timestamp validation (prevents replay attacks)
 * 3. Device identity validation (ensures token-device binding)
 * 4. Rate limiting (protects against abuse)
 * 
 * Each check has a specific security purpose and provides
 * clear feedback about why a request was denied.
 */
export function evaluatePolicy(
  triggerEvent: TriggerEvent,
  jwtPayload: JWTPayload | undefined
): PolicyEvaluationResult {
  // 1. Validate event type
  if (!validateEventType(triggerEvent.event)) {
    return {
      allowed: false,
      reason: 'invalid_event_type',
      metadata: {
        provided: triggerEvent.event,
        allowed: POLICY_CONFIG.ALLOWED_EVENTS,
      },
    };
  }
  
  // 2. Validate timestamp (bounded listening enforcement)
  if (!validateTimestamp(triggerEvent.timestamp)) {
    return {
      allowed: false,
      reason: 'stale_trigger',
      metadata: {
        triggerAge: Date.now() - triggerEvent.timestamp,
        maxAge: POLICY_CONFIG.MAX_TRIGGER_AGE_MS,
      },
    };
  }
  
  // 3. Validate device identity
  if (!validateDeviceIdentity(triggerEvent.device_id, jwtPayload)) {
    return {
      allowed: false,
      reason: 'device_mismatch',
    };
  }
  
  // 4. Check rate limits
  if (!checkRateLimit(triggerEvent.device_id)) {
    return {
      allowed: false,
      reason: 'rate_limit_exceeded',
      metadata: {
        limit: POLICY_CONFIG.MAX_TRIGGERS_PER_MINUTE,
        window: '1 minute',
      },
    };
  }
  
  // All checks passed
  return {
    allowed: true,
    reason: 'policy_passed',
    metadata: {
      device_id: triggerEvent.device_id,
      event: triggerEvent.event,
      evaluatedAt: Date.now(),
    },
  };
}
