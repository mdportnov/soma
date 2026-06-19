ALTER TABLE `lab_result` ADD `source_page` integer;--> statement-breakpoint
ALTER TABLE `lab_result` ADD `confidence` text;--> statement-breakpoint
ALTER TABLE `lab_result` ADD `reviewed_at` text;--> statement-breakpoint
UPDATE `lab_result` SET `reviewed_at` = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE `reviewed_at` IS NULL;