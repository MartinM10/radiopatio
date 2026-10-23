-- ─────────────────────────────────────────────────────────────────────────────
-- Esquema de base de datos para Radio Patio / Alerta Vecinal
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(36) PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_lat DOUBLE PRECISION,
    last_lng DOUBLE PRECISION,
    last_at TIMESTAMPTZ,
    trust_level INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(36) PRIMARY KEY,
    category VARCHAR(32) NOT NULL,
    grid_x INTEGER NOT NULL,
    grid_y INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmations_count INTEGER NOT NULL DEFAULT 0,
    flags_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    device_hash VARCHAR(64) NOT NULL
);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS hex_key VARCHAR(64);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS hex_lat DOUBLE PRECISION;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS hex_lng DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS idx_incidents_hex ON incidents(hex_key);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS judge_score DOUBLE PRECISION;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS judge_reason VARCHAR(120);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS judge_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_incidents_judge ON incidents(judge_score DESC);

-- Estado 'pending' (cuarentena de ráfagas) además de active/hidden/deleted.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('active', 'hidden', 'deleted', 'pending'));

CREATE TABLE IF NOT EXISTS incident_confirmations (
    incident_id VARCHAR(36) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    device_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (incident_id, device_hash)
);

CREATE TABLE IF NOT EXISTS incident_flags (
    incident_id VARCHAR(36) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    device_hash VARCHAR(64) NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (incident_id, device_hash)
);

-- Auditoría de moderación (DSA): toda decisión se registra.
CREATE TABLE IF NOT EXISTS moderation_log (
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(36) NOT NULL,
    action VARCHAR(40) NOT NULL,
    actor VARCHAR(80) NOT NULL,
    reason VARCHAR(280),
    at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_active ON incidents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_zone ON incidents(grid_x, grid_y);
CREATE INDEX IF NOT EXISTS idx_incidents_lat_lng ON incidents(lat, lng);
CREATE INDEX IF NOT EXISTS idx_incidents_device ON incidents(device_hash);
CREATE INDEX IF NOT EXISTS idx_confirmations_device ON incident_confirmations(device_hash);
CREATE INDEX IF NOT EXISTS idx_flags_device ON incident_flags(device_hash);
CREATE INDEX IF NOT EXISTS idx_devices_created ON devices(created_at);
