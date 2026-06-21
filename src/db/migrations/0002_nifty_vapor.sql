CREATE TABLE `lifestyle_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`date` text NOT NULL,
	`sleep_hours` real,
	`sleep_quality` integer,
	`training_minutes` integer,
	`training_intensity` text,
	`steps` integer,
	`resting_heart_rate` integer,
	`stress_level` integer,
	`energy_level` integer,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lifestyle_log_profile_date_uq` ON `lifestyle_log` (`profile_id`,`date`);--> statement-breakpoint
CREATE TABLE `retest_schedule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`label` text NOT NULL,
	`biomarker_id` integer,
	`interval_months` integer NOT NULL,
	`last_tested_date` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`biomarker_id`) REFERENCES `biomarker`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `retest_schedule_profile_idx` ON `retest_schedule` (`profile_id`);