CREATE TABLE `attachment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`linked_entity_type` text,
	`linked_entity_id` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `biomarker` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text,
	`canonical_name` text NOT NULL,
	`category` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`default_unit` text NOT NULL,
	`ref_low` real,
	`ref_high` real,
	`optimal_low` real,
	`optimal_high` real,
	`direction` text DEFAULT 'range' NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `biomarker_name_idx` ON `biomarker` (`canonical_name`);--> statement-breakpoint
CREATE TABLE `diagnosis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`name` text NOT NULL,
	`icd_code` text,
	`date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`visit_id` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `diagnosis_profile_idx` ON `diagnosis` (`profile_id`);--> statement-breakpoint
CREATE TABLE `lab_panel` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`date` text NOT NULL,
	`lab_name` text,
	`city` text,
	`country` text,
	`panel_type` text DEFAULT 'blood' NOT NULL,
	`source_file_id` integer,
	`import_method` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_file_id`) REFERENCES `attachment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lab_panel_profile_date_idx` ON `lab_panel` (`profile_id`,`date`);--> statement-breakpoint
CREATE TABLE `lab_result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`panel_id` integer NOT NULL,
	`biomarker_id` integer NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`unit_normalized` text,
	`value_normalized` real,
	`out_of_range` integer DEFAULT false NOT NULL,
	`flag` text,
	`raw_label` text,
	FOREIGN KEY (`panel_id`) REFERENCES `lab_panel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`biomarker_id`) REFERENCES `biomarker`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lab_result_panel_idx` ON `lab_result` (`panel_id`);--> statement-breakpoint
CREATE INDEX `lab_result_biomarker_idx` ON `lab_result` (`biomarker_id`);--> statement-breakpoint
CREATE TABLE `medication` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'supplement' NOT NULL,
	`dose_amount` real,
	`dose_unit` text,
	`schedule` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`purpose` text,
	`prescription_id` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prescription_id`) REFERENCES `prescription`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `medication_profile_idx` ON `medication` (`profile_id`);--> statement-breakpoint
CREATE TABLE `medication_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`medication_id` integer NOT NULL,
	`taken_at` text NOT NULL,
	`taken` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`medication_id`) REFERENCES `medication`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `medication_log_med_idx` ON `medication_log` (`medication_id`);--> statement-breakpoint
CREATE TABLE `prescription` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visit_id` integer NOT NULL,
	`notes` text,
	`source_links` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `visit`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`birth_date` text,
	`sex` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `visit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`date` text NOT NULL,
	`doctor_name` text,
	`clinic` text,
	`city` text,
	`country` text,
	`specialty` text,
	`notes` text,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `visit_profile_date_idx` ON `visit` (`profile_id`,`date`);