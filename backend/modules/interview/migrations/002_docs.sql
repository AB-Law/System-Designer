CREATE TABLE IF NOT EXISTS interview_docs(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, file_id INTEGER NOT NULL, name TEXT NOT NULL,
  scope TEXT NOT NULL, role_id INTEGER, status TEXT NOT NULL, error TEXT, chunk_count INTEGER NOT NULL DEFAULT 0,
  job_id TEXT, bytes INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_interview_docs_user ON interview_docs(user_id, created);
CREATE INDEX IF NOT EXISTS ix_interview_docs_scope ON interview_docs(user_id, scope, role_id);
