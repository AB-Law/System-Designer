CREATE TABLE IF NOT EXISTS interview_roles(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, level TEXT NOT NULL DEFAULT '', company TEXT,
  jd_text TEXT, jd_structured_json TEXT, source_score_run_id INTEGER, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_interview_roles_user ON interview_roles(user_id, created);

CREATE TABLE IF NOT EXISTS interview_sessions(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, role_id INTEGER NOT NULL, style_json TEXT NOT NULL, plan_json TEXT,
  status TEXT NOT NULL, error TEXT, plan_job_id TEXT, feedback_job_id TEXT, canvas_design_id INTEGER,
  score INTEGER, created INTEGER NOT NULL, ended INTEGER);
CREATE INDEX IF NOT EXISTS ix_interview_sessions_user ON interview_sessions(user_id, role_id, created);

CREATE TABLE IF NOT EXISTS interview_turns(
  session_id INTEGER NOT NULL, idx INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL, tag TEXT NOT NULL,
  text TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(session_id, idx));

CREATE TABLE IF NOT EXISTS interview_feedback(
  session_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, per_answer_json TEXT NOT NULL, summary_json TEXT NOT NULL,
  prompt_version TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
