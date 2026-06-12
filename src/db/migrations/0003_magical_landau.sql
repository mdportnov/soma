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