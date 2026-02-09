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
 */

import type { Express } from 'express';
import { createServer, type Server } from 'node:http';

import healthRouter from './routes/health';
import triggerRouter from './routes/trigger';

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint - PUBLIC
  // Used by load balancers and monitoring systems
  app.use('/api/health', healthRouter);
  
  // Trigger endpoint - AUTHENTICATED
  // Core endpoint for ARI activation flow
  app.use('/api/trigger', triggerRouter);

  const httpServer = createServer(app);

  return httpServer;
}
