CREATE TABLE IF NOT EXISTS hub_targets(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, level TEXT NOT NULL DEFAULT '', company TEXT,
  jd_text TEXT, role_id INTEGER, score_run_id INTEGER, date TEXT, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_hub_targets_user ON hub_targets(user_id, created);

CREATE TABLE IF NOT EXISTS hub_state(user_id INTEGER PRIMARY KEY, active_target_id INTEGER);
