/**
 * Route Registration for ARI Backend
 * 
 * ARCHITECTURE NOTES:
 * -------------------
 * This file registers all API routes for the ARI backend.
 * Routes are organized by feature area and prefixed with /api.
 * 
 * SECURITY DESIGN:
 * - Health endpoint is public (for infrastructure monitoring)
 * - Trigger endpoint requires authentication
 * - Sessions endpoint handles fingerprint-bound sessions
 * - Audit endpoint is admin-only, read-only
 * - Simulation endpoint is admin-only for security testing
 */

import type { Express } from 'express';
import { createServer, type Server } from 'node:http';

import healthRouter from './routes/health';
import triggerRouter from './routes/trigger';
import sessionsRouter from './routes/sessions';
import auditRouter from './routes/audit';
import simulationRouter from './routes/simulation';

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint - PUBLIC
  // Used by load balancers and monitoring systems
  app.use('/api/health', healthRouter);

  // Trigger endpoint - AUTHENTICATED
  // Core endpoint for ARI activation flow
  app.use('/api/trigger', triggerRouter);

  // Sessions endpoint - FINGERPRINT BOUND
  // InterceptX session management with cryptographic binding
  app.use('/api/sessions', sessionsRouter);

  // Audit endpoint - ADMIN ONLY, READ ONLY
  // Append-only audit log access for forensic analysis
  app.use('/api/audit', auditRouter);

  // Simulation endpoint - ADMIN ONLY
  // Controlled security testing for hijack/replay attacks
  app.use('/api/simulation', simulationRouter);

  const httpServer = createServer(app);

  return httpServer;
}
