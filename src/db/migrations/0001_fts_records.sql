-- Hand-written (drizzle can't model virtual tables): the FTS5 index behind
-- global search (src/db/search.ts). Only `content` is tokenized — the blob of
-- all searchable text per record; the rest are stored display/filter columns.
-- `IF NOT EXISTS` keeps a re-applied run (aborted before stamping) a no-op:
-- the migrator's CREATE TABLE rewrite does not cover CREATE VIRTUAL TABLE.
CREATE VIRTUAL TABLE IF NOT EXISTS `fts_records` USING fts5(
	`entity_type` UNINDEXED,
	`entity_id` UNINDEXED,
	`profile_id` UNINDEXED,
	`title` UNINDEXED,
	`subtitle` UNINDEXED,
	`date` UNINDEXED,
	`content`
);
