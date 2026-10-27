CREATE TABLE IF NOT EXISTS embedding_chunks(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, source_kind TEXT NOT NULL, source_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL, page INTEGER NOT NULL DEFAULT 1, text TEXT NOT NULL, embedding BLOB NOT NULL,
  model TEXT NOT NULL, dims INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_embedding_chunks_source ON embedding_chunks(user_id, source_kind, source_id);
CREATE INDEX IF NOT EXISTS ix_embedding_chunks_user ON embedding_chunks(user_id, source_kind);
