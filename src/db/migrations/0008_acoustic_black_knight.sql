CREATE TABLE `biomarker_reference_range` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`biomarker_id` integer NOT NULL,
	`sex` text,
	`age_min_years` integer,
	`age_max_years` integer,
	`condition` text,
	`ref_low` real,
	`ref_high` real,
	`optimal_low` real,
	`optimal_high` real,
	FOREIGN KEY (`biomarker_id`) REFERENCES `biomarker`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `biomarker_ref_range_idx` ON `biomarker_reference_range` (`biomarker_id`);