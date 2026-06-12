CREATE VIRTUAL TABLE IF NOT EXISTS fts_records USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  profile_id UNINDEXED,
  title UNINDEXED,
  subtitle UNINDEXED,
  date UNINDEXED,
  content,
  tokenize='unicode61'
);
