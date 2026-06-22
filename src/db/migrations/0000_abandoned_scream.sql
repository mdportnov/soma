CREATE TABLE `allergy` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`allergen` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`severity` text NOT NULL,
	`reaction` text,
	`onset_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `allergy_profile_idx` ON `allergy` (`profile_id`);--> statement-breakpoint
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
	`is_custom` integer DEFAULT false NOT NULL,
	`is_user_modified` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `biomarker_name_idx` ON `biomarker` (`canonical_name`);--> statement-breakpoint
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
CREATE INDEX `biomarker_ref_range_idx` ON `biomarker_reference_range` (`biomarker_id`);--> statement-breakpoint
CREATE TABLE `bp_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`systolic` integer NOT NULL,
	`diastolic` integer NOT NULL,
	`heart_rate_bpm` integer,
	`position` text,
	`arm_side` text,
	`notes` text,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bp_log_profile_date_idx` ON `bp_log` (`profile_id`,`date`);--> statement-breakpoint
CREATE TABLE `diagnosis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`name` text NOT NULL,
	`icd_code` text,
	`date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`resolved_date` text,
	`visit_id` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `diagnosis_profile_idx` ON `diagnosis` (`profile_id`);--> statement-breakpoint
CREATE TABLE `imaging_record` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`date` text NOT NULL,
	`modality_type` text NOT NULL,
	`body_area` text NOT NULL,
	`findings` text,
	`radiologist_name` text,
	`clinic` text,
	`city` text,
	`country` text,
	`visit_id` integer,
	`attachment_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visit`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `imaging_profile_date_idx` ON `imaging_record` (`profile_id`,`date`);--> statement-breakpoint
CREATE TABLE `lab_panel` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`date` text NOT NULL,
	`lab_name` text,
	`city` text,
	`country` text,
	`sample_types` text DEFAULT '["blood"]' NOT NULL,
	`cost` real,
	`collection_time` text,
	`fasting` integer,
	`menstrual_cycle_day` integer,
	`notes` text,
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
	`source_page` integer,
	`confidence` text,
	`reviewed_at` text,
	FOREIGN KEY (`panel_id`) REFERENCES `lab_panel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`biomarker_id`) REFERENCES `biomarker`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lab_result_panel_idx` ON `lab_result` (`panel_id`);--> statement-breakpoint
CREATE INDEX `lab_result_biomarker_idx` ON `lab_result` (`biomarker_id`);--> statement-breakpoint
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
CREATE TABLE `medication` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'supplement' NOT NULL,
	`dose_amount` real,
	`dose_unit` text,
	`schedule` text,
	`as_needed` integer DEFAULT false NOT NULL,
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
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`birth_date` text,
	`sex` text,
	`height_cm` real,
	`weight_kg` real,
	`target_weight_kg` real,
	`target_weight_date` text,
	`target_weight_start_date` text,
	`target_weight_start_kg` real,
	`blood_type` text,
	`rh_factor` text,
	`ethnicity` text,
	`activity_level` text,
	`smoking` text,
	`alcohol` text,
	`conditions` text,
	`unit_system` text DEFAULT 'metric' NOT NULL,
	`emergency_contact_name` text,
	`emergency_contact_phone` text,
	`emergency_contact_relation` text,
	`citizenship` text,
	`languages` text,
	`insurer` text,
	`insurance_policy_number` text,
	`insurance_phone` text,
	`emergency_notes` text,
	`pregnancy_status` text,
	`code_status` text,
	`organ_donor` integer,
	`onboarded_at` text,
	`ui_prefs` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
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
CREATE INDEX `retest_schedule_profile_idx` ON `retest_schedule` (`profile_id`);--> statement-breakpoint
CREATE TABLE `symptom_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`symptom_name` text NOT NULL,
	`severity` integer NOT NULL,
	`notes` text,
	`visit_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `symptom_profile_date_idx` ON `symptom_log` (`profile_id`,`date`);--> statement-breakpoint
CREATE INDEX `symptom_name_idx` ON `symptom_log` (`symptom_name`);--> statement-breakpoint
CREATE TABLE `vaccine` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`vaccine_name` text NOT NULL,
	`date` text NOT NULL,
	`manufacturer` text,
	`batch_number` text,
	`dose` integer,
	`expires_at` text,
	`administered_by` text,
	`country` text,
	`notes` text,
	`attachment_id` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vaccine_profile_date_idx` ON `vaccine` (`profile_id`,`date`);--> statement-breakpoint
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
CREATE INDEX `visit_profile_date_idx` ON `visit` (`profile_id`,`date`);--> statement-breakpoint
CREATE TABLE `weight_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL,
	`notes` text,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `weight_log_profile_date_idx` ON `weight_log` (`profile_id`,`date`);