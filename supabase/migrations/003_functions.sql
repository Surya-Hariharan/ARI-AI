-- ============================================================
-- ARI Database Migration — 003: Functions & Stored Procedures
-- ============================================================

-- Function to automatically update timestamps on modified rows
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Alias for compatibility across voice schemas
CREATE OR REPLACE FUNCTION touch_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
