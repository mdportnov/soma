CREATE TABLE `chat_thread_record` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`relation` text NOT NULL,
	`hits` integer DEFAULT 1 NOT NULL,
	`first_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_thread_record_uq` ON `chat_thread_record` (`thread_id`,`entity_type`,`entity_id`,`relation`);--> statement-breakpoint
CREATE INDEX `chat_thread_record_entity_idx` ON `chat_thread_record` (`entity_type`,`entity_id`);--> statement-breakpoint
ALTER TABLE `chat_thread` ADD `title_source` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_thread` ADD `archived_at` text;--> statement-breakpoint
UPDATE `chat_thread` SET `archived_at` = `updated_at` WHERE `status` = 'archived' AND `archived_at` IS NULL;
