-- When a search last ran for a bucket (owner 0 = the shared store). A bucket searched recently is not searched again,
-- so a search that finds nothing new, or whose results were all reported, cannot be paid for again and again.
CREATE TABLE IF NOT EXISTS research_searched(
  bucket_key TEXT NOT NULL, owner INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(bucket_key, owner));
