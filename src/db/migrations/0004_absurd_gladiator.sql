PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_prescription` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visit_id` integer,
	`drug_name` text,
	`dose_amount` real,
	`dose_unit` text,
	`frequency` text,
	`duration_days` integer,
	`refills` integer,
	`notes` text,
	`source_links` text DEFAULT '[]' NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`visit_id`) REFERENCES `visit`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_prescription`("id", "visit_id", "drug_name", "dose_amount", "dose_unit", "frequency", "duration_days", "refills", "notes", "source_links", "archived_at") SELECT "id", "visit_id", NULL, NULL, NULL, NULL, NULL, NULL, "notes", "source_links", NULL FROM `prescription`;--> statement-breakpoint
DROP TABLE `prescription`;--> statement-breakpoint
ALTER TABLE `__new_prescription` RENAME TO `prescription`;--> statement-breakpoint
PRAGMA foreign_keys=ON;