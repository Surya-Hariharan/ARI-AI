/**
 * API Client for ARI Mobile App
 * 
 * SECURITY DESIGN INTENT:
 * -----------------------
 * This module handles all communication with the ARI backend.
 * 
 * KEY SECURITY PRINCIPLES:
 * 1. JWT tokens are passed via Authorization header (never in URL)
 * 2. All requests use HTTPS (enforced by server configuration)
 * 3. Tokens are never logged or exposed in error messages
 * 4. Device ID is generated per-device and sent with triggers
 */

import { fetch } from 'expo/fetch';
import { getApiUrl } from './query-client';

/**
 * Mock JWT token for scaffold purposes
 * 
 * SECURITY NOTE:
 * In production, this would be obtained through a proper authentication flow
 * (e.g., OAuth, email/password login) and stored securely.
 * 
 * For the scaffold, we use a mock token that the backend will accept.
 */
function getMockJWT(): string {
  // This is a mock JWT for scaffold purposes only
  // Format: header.payload.signature (all base64-encoded)
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: 'user_mock_id',
    device_id: getDeviceId(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }));
  const signature = btoa('mock_signature');
  
  return `${header}.${payload}.${signature}`;
}

/**
 * Generates or retrieves a device ID
 * 
 * SECURITY NOTE:
 * In production, this would use a more robust device fingerprinting
 * approach or a device-bound credential system.
 */
let cachedDeviceId: string | null = null;

function getDeviceId(): string {
  if (!cachedDeviceId) {
    // Generate a unique device ID
    cachedDeviceId = `device_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }
  return cachedDeviceId;
}

export interface HealthResponse {
  success: true;
  data: {
    status: string;
    service: string;
    timestamp: number;
  };
}

export interface TriggerResponse {
  success: true;
  data: {
    allowed: boolean;
    reason: string;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Checks the health of the ARI backend
 * 
 * This is a public endpoint and doesn't require authentication.
 */
export async function checkHealth(): Promise<HealthResponse> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/health', baseUrl);
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Sends a trigger event to the ARI backend
 * 
 * SECURITY FLOW:
 * 1. Includes JWT in Authorization header
 * 2. Sends device_id to bind trigger to device
 * 3. Includes timestamp for replay protection
 * 
 * BOUNDED LISTENING:
 * This function is called ONLY after explicit user action.
 * The server validates the trigger and returns allow/deny.
 */
export async function sendTrigger(): Promise<TriggerResponse | ErrorResponse> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/trigger', baseUrl);
  
  const token = getMockJWT();
  const deviceId = getDeviceId();
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      event: 'voice_trigger',
      device_id: deviceId,
      timestamp: Date.now(),
    }),
  });
  
  return response.json();
}
