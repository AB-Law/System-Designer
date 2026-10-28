CREATE TABLE IF NOT EXISTS readiness_events(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, module TEXT NOT NULL, topic TEXT NOT NULL,
  signal TEXT NOT NULL, strength REAL NOT NULL, ref TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_readiness_user ON readiness_events(user_id, at);
CREATE INDEX IF NOT EXISTS ix_readiness_ref ON readiness_events(user_id, module, ref);
