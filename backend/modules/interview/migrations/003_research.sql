-- Distilled interview questions found by web research. user_id is NULL when the store is shared across users.
CREATE TABLE IF NOT EXISTS research_questions(
  id INTEGER PRIMARY KEY, user_id INTEGER, bucket_key TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL,
  question TEXT NOT NULL, source_url TEXT NOT NULL, source_name TEXT NOT NULL DEFAULT '', fetched INTEGER NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0, embedding BLOB, model TEXT NOT NULL DEFAULT '', dims INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_research_questions_bucket ON research_questions(bucket_key, flagged);

-- What each search provider has been asked to spend this month, in the provider's own unit (credits, or millionths of a dollar).
CREATE TABLE IF NOT EXISTS research_usage(
  provider TEXT NOT NULL, month TEXT NOT NULL, units INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(provider, month));

CREATE TABLE IF NOT EXISTS research_user_quota(
  user_id INTEGER NOT NULL, month TEXT NOT NULL, runs INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, month));

-- One editable question bank per role.
CREATE TABLE IF NOT EXISTS question_banks(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, role_id INTEGER NOT NULL, body_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL, error TEXT, job_id TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL,
  UNIQUE(user_id, role_id));
