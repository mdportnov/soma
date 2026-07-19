CREATE TABLE `lab_finding` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`panel_id` integer NOT NULL,
	`raw_label` text NOT NULL,
	`name_en` text,
	`value_text` text NOT NULL,
	`value_numeric` real,
	`unit` text,
	`ref_range_text` text,
	`source_page` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`panel_id`) REFERENCES `lab_panel`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lab_finding_panel_idx` ON `lab_finding` (`panel_id`);