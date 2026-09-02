-- Hand-written (drizzle can't model virtual tables): global search now stores a
-- precomputed destination `route` per indexed record, so nested rows (a lab
-- result inside a panel, a prescription under a visit) can open the page that
-- actually shows them instead of a bare section list.
--
-- FTS5 has no ALTER TABLE ADD COLUMN, so the table is recreated. This is not a
-- data migration: `fts_records` is a derived index rebuilt from the source
-- tables on demand (see `ensureSearchIndex`), so dropping it loses nothing that
-- is not regenerated on the next search. No user table is touched.
DROP TABLE IF EXISTS `fts_records`;
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `fts_records` USING fts5(
	`entity_type` UNINDEXED,
	`entity_id` UNINDEXED,
	`profile_id` UNINDEXED,
	`title` UNINDEXED,
	`subtitle` UNINDEXED,
	`date` UNINDEXED,
	`route` UNINDEXED,
	`content`
);
