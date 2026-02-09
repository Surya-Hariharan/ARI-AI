/**
 * Database Schema for InterceptX + KeyBridge
 * 
 * SECURITY DESIGN:
 * ----------------
 * - Sessions are cryptographically signed
 * - Fingerprints are hashed with server-side salt (never stored raw)
 * - Audit logs are append-only with hash-chain integrity
 * - All tables include timestamps and trace IDs for forensic replay
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// USERS TABLE (existing)
// ============================================================================

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============================================================================
// SESSIONS TABLE
// Cryptographically signed sessions bound to device fingerprints
// ============================================================================

export const sessions = pgTable("sessions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // User binding (optional - sessions can be anonymous)
  userId: varchar("user_id").references(() => users.id),

  // Fingerprint binding - hash only, never raw
  fingerprintHash: text("fingerprint_hash").notNull(),

  // Cryptographic signature for session integrity
  signature: text("signature").notNull(),

  // Session status: 'active' | 'intercepted' | 'degraded' | 'terminated'
  status: text("status").notNull().default("active"),

  // Degradation reason (if status is 'degraded' or 'intercepted')
  degradationReason: text("degradation_reason"),

  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),

  // Trace ID for audit correlation
  traceId: varchar("trace_id").notNull(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
  lastActivityAt: true,
});

export const selectSessionSchema = createSelectSchema(sessions);

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// ============================================================================
// FINGERPRINTS TABLE
// Hashed device fingerprints with tolerance metadata
// ============================================================================

export const fingerprints = pgTable("fingerprints", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Session binding
  sessionId: varchar("session_id")
    .notNull()
    .references(() => sessions.id),

  // Combined hash of all fingerprint components (SHA-256)
  hash: text("hash").notNull(),

  // Server-side salt used for hashing (random per fingerprint)
  salt: text("salt").notNull(),

  // Hash of individual component hashes (for tolerance checking)
  // This allows detecting which components changed without storing raw values
  componentsHash: text("components_hash").notNull(),

  // Number of signals used in this fingerprint
  signalCount: integer("signal_count").notNull(),

  // Confidence score (0-100) based on signal entropy
  confidenceScore: integer("confidence_score").notNull(),

  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFingerprintSchema = createInsertSchema(fingerprints).omit({
  id: true,
  createdAt: true,
});

export type InsertFingerprint = z.infer<typeof insertFingerprintSchema>;
export type Fingerprint = typeof fingerprints.$inferSelect;

// ============================================================================
// AUDIT LOGS TABLE
// Append-only, tamper-evident audit trail
// ============================================================================

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Trace ID for request correlation
  traceId: varchar("trace_id").notNull(),

  // Action performed: 'session.create' | 'session.validate' | 'simulation.hijack' | etc.
  action: text("action").notNull(),

  // Actor: user ID, 'system', or 'admin:<id>'
  actor: text("actor").notNull(),

  // Target resource (session ID, fingerprint ID, etc.)
  target: text("target"),

  // Result: 'success' | 'failure' | 'blocked'
  result: text("result").notNull(),

  // Additional context (never contains raw secrets)
  metadata: jsonb("metadata"),

  // Hash of the payload for integrity verification
  payloadHash: text("payload_hash").notNull(),

  // Hash of the previous log entry (chain integrity)
  prevHash: text("prev_hash"),

  // Timestamp (server-side, not client-provided)
  timestamp: timestamp("timestamp").notNull().defaultNow(),

  // IP address (hashed for privacy)
  ipHash: text("ip_hash"),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  timestamp: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============================================================================
// SIMULATION EVENTS TABLE
// Tracks simulated interception attempts and their outcomes
// ============================================================================

export const simulationEvents = pgTable("simulation_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Original session being simulated
  originalSessionId: varchar("original_session_id")
    .notNull()
    .references(() => sessions.id),

  // Cloned session (if hijack simulation created one)
  clonedSessionId: varchar("cloned_session_id")
    .references(() => sessions.id),

  // Simulation type: 'hijack' | 'replay' | 'fingerprint_drift'
  simulationType: text("simulation_type").notNull(),

  // Which fingerprint components were altered
  alteredComponents: jsonb("altered_components"),

  // Detection result: 'detected' | 'undetected' | 'partial'
  detectionResult: text("detection_result"),

  // Timeline of events during simulation
  timeline: jsonb("timeline"),

  // Admin who initiated the simulation
  initiatedBy: text("initiated_by").notNull(),

  // Timestamps
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertSimulationEventSchema = createInsertSchema(simulationEvents).omit({
  id: true,
  startedAt: true,
});

export type InsertSimulationEvent = z.infer<typeof insertSimulationEventSchema>;
export type SimulationEvent = typeof simulationEvents.$inferSelect;

// ============================================================================
// SESSION STATUS ENUM (for type safety)
// ============================================================================

export const SessionStatus = {
  ACTIVE: 'active',
  INTERCEPTED: 'intercepted',
  DEGRADED: 'degraded',
  TERMINATED: 'terminated',
} as const;

export type SessionStatusType = typeof SessionStatus[keyof typeof SessionStatus];

// ============================================================================
// AUDIT ACTION ENUM (for type safety)
// ============================================================================

export const AuditAction = {
  SESSION_CREATE: 'session.create',
  SESSION_VALIDATE: 'session.validate',
  SESSION_TERMINATE: 'session.terminate',
  SESSION_DEGRADE: 'session.degrade',
  FINGERPRINT_MISMATCH: 'fingerprint.mismatch',
  FINGERPRINT_DRIFT: 'fingerprint.drift',
  SIMULATION_HIJACK: 'simulation.hijack',
  SIMULATION_REPLAY: 'simulation.replay',
  ADMIN_VIEW: 'admin.view',
  ADMIN_ACTION: 'admin.action',
} as const;

export type AuditActionType = typeof AuditAction[keyof typeof AuditAction];
