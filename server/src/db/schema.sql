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

-- Identidad verificada (Google/SMS): HMAC con secreto, nunca el id en claro.
-- Un identity_hash solo puede existir en un dispositivo: una cuenta, una identidad.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS identity_hash VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_identity ON devices(identity_hash) WHERE identity_hash IS NOT NULL;

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

-- Notificaciones. El servidor solo guarda lo mínimo para avisar:
--  · device_hash: hash estable del dispositivo (el que llevan los avisos), para
--    localizar al autor de un aviso cuando alguien lo confirma.
--  · push_token: token de Expo Push (opcional; sin él solo hay bandeja en la app).
--  · area_*: centro de la celda hex (~450 m) donde está el vecino, nunca la posición exacta.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_devices_hash ON devices(device_hash);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS push_token VARCHAR(200);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS notify_confirmations BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS notify_nearby BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS notify_watched BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS area_lat DOUBLE PRECISION;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS area_lng DOUBLE PRECISION;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS area_at TIMESTAMPTZ;

-- Zonas vigiladas: sitios donde el vecino no está pero le importan.
CREATE TABLE IF NOT EXISTS watched_zones (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(36) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    label VARCHAR(60) NOT NULL,
    hex_key VARCHAR(64) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_watched_device ON watched_zones(device_id);

-- Bandeja de notificaciones (la app la consulta; el push es un extra).
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(36) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    incident_id VARCHAR(36),
    title VARCHAR(120) NOT NULL,
    body VARCHAR(280) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_device ON notifications(device_id, created_at DESC);

-- Foto opcional de un aviso (solo en categorías sin "culpable" que retratar:
-- objeto/mascota perdida, servicios y emergencias). Se guarda ya recomprimida
-- y sin metadatos EXIF (el servidor la reprocesa con sharp antes de guardar,
-- lo que también limpia la ubicación GPS que pudiera llevar el original). No
-- hay almacenamiento externo: cabe en la fila y desaparece con el aviso.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS photo BYTEA;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS photo_mime VARCHAR(20);

-- Chat anónimo por aviso: ni el autor ni quien escribe se identifican entre
-- sí, solo "Tú" / "Un vecino" (TRUST.md, mismo principio que las
-- confirmaciones). Cae en cascada con el aviso, a las 72 horas o antes.
CREATE TABLE IF NOT EXISTS incident_messages (
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(36) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    device_hash VARCHAR(64) NOT NULL,
    body VARCHAR(280) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incident_messages_incident ON incident_messages(incident_id, created_at);

-- Avisarme cuando escriban en un aviso mío o en una conversación en la que participo.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS notify_messages BOOLEAN NOT NULL DEFAULT TRUE;

-- Municipio del aviso (de la geocodificación inversa del servidor). Solo se
-- usa para el recuento diario y desaparece con el aviso.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS municipality VARCHAR(80);

-- Recuento diario anónimo: lo único que queda de un aviso tras purgarlo. Sin
-- texto, calle, celda ni autor. municipality = '' si no se pudo determinar.
CREATE TABLE IF NOT EXISTS incident_daily_counts (
    day DATE NOT NULL,
    municipality VARCHAR(80) NOT NULL,
    category VARCHAR(32) NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    confirmed INTEGER NOT NULL DEFAULT 0,
    verified INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, municipality, category)
);
