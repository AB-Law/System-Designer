CREATE TABLE IF NOT EXISTS usage(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, module TEXT NOT NULL, model TEXT NOT NULL, kind TEXT NOT NULL,
  tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, cost_micro INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_usage_user ON usage(user_id, created);

CREATE TABLE IF NOT EXISTS bg_jobs(
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL DEFAULT '{}',
  result TEXT, error TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_bg_jobs_user ON bg_jobs(user_id, created);
CREATE INDEX IF NOT EXISTS ix_bg_jobs_status ON bg_jobs(status);

CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  data BLOB NOT NULL, text TEXT, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_files_user ON files(user_id, created);
