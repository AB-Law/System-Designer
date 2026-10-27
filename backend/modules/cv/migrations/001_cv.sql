CREATE TABLE IF NOT EXISTS cv_cvs(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_cv_cvs_user ON cv_cvs(user_id, created);

CREATE TABLE IF NOT EXISTS cv_versions(
  id INTEGER PRIMARY KEY, cv_id INTEGER NOT NULL, user_id INTEGER NOT NULL, file_id INTEGER,
  raw_text TEXT NOT NULL, parse_quality INTEGER NOT NULL, warnings_json TEXT NOT NULL DEFAULT '[]',
  structured_json TEXT NOT NULL DEFAULT '{}', structure_source TEXT NOT NULL DEFAULT 'rules', edited INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_cv_versions_cv ON cv_versions(user_id, cv_id, created);

CREATE TABLE IF NOT EXISTS cv_score_runs(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, cv_version_id INTEGER NOT NULL,
  jd_title TEXT NOT NULL DEFAULT '', jd_text TEXT NOT NULL, jd_hash TEXT NOT NULL,
  mode TEXT NOT NULL, rubric_version TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', cache_key TEXT NOT NULL,
  status TEXT NOT NULL, job_id TEXT, total INTEGER, band TEXT,
  breakdown_json TEXT NOT NULL DEFAULT '{}', evidence_json TEXT NOT NULL DEFAULT '[]',
  analysis_json TEXT NOT NULL DEFAULT '{}', stages_json TEXT NOT NULL DEFAULT '{}',
  truncated INTEGER NOT NULL DEFAULT 0, error TEXT, rescored_from INTEGER, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_cv_runs_user ON cv_score_runs(user_id, created);
CREATE INDEX IF NOT EXISTS ix_cv_runs_cache ON cv_score_runs(user_id, cache_key);

CREATE TABLE IF NOT EXISTS cv_rewrite_proposals(
  id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL, user_id INTEGER NOT NULL, bullet_ref TEXT NOT NULL,
  original TEXT NOT NULL, proposed TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
  created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_cv_rewrites_run ON cv_rewrite_proposals(user_id, run_id);
