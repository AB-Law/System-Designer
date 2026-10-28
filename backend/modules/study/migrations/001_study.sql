CREATE TABLE IF NOT EXISTS study_decks(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, parent_id INTEGER, name TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'manual', source_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ready', job_id TEXT, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_study_decks_user ON study_decks(user_id, created);
CREATE INDEX IF NOT EXISTS ix_study_decks_parent ON study_decks(user_id, parent_id);

CREATE TABLE IF NOT EXISTS study_cards(
  id INTEGER PRIMARY KEY, deck_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'basic', front TEXT NOT NULL, back TEXT NOT NULL,
  ease_factor REAL NOT NULL DEFAULT 2.5, interval_days INTEGER NOT NULL DEFAULT 1,
  due INTEGER NOT NULL, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_study_cards_deck ON study_cards(deck_id, user_id);
CREATE INDEX IF NOT EXISTS ix_study_cards_due ON study_cards(user_id, due);

CREATE TABLE IF NOT EXISTS study_reviews(
  id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  rating TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_study_reviews_card ON study_reviews(card_id, at);
CREATE INDEX IF NOT EXISTS ix_study_reviews_user ON study_reviews(user_id, at);

CREATE TABLE IF NOT EXISTS study_mindmaps(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, source_kind TEXT NOT NULL, source_ref TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'ready', job_id TEXT, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_study_maps_user ON study_mindmaps(user_id, created);

CREATE TABLE IF NOT EXISTS study_mindmap_nodes(
  map_id INTEGER NOT NULL, node_id TEXT NOT NULL, user_id INTEGER NOT NULL,
  label TEXT NOT NULL, parent_node_id TEXT, summary TEXT NOT NULL DEFAULT '',
  sources_json TEXT NOT NULL DEFAULT '[]', PRIMARY KEY(map_id, node_id));
CREATE INDEX IF NOT EXISTS ix_study_map_nodes_user ON study_mindmap_nodes(user_id, map_id);

CREATE TABLE IF NOT EXISTS study_mindmap_edges(
  map_id INTEGER NOT NULL, edge_id TEXT NOT NULL, user_id INTEGER NOT NULL,
  source TEXT NOT NULL, target TEXT NOT NULL, PRIMARY KEY(map_id, edge_id));
CREATE INDEX IF NOT EXISTS ix_study_map_edges_user ON study_mindmap_edges(user_id, map_id);
