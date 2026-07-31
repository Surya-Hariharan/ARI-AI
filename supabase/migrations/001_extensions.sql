-- ============================================================
-- ARI Database Migration — 001: Extensions & Base Types
-- ============================================================

-- Enable UUID generator extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Cryptographic functions extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
