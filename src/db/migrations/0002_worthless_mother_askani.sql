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
ALTER TABLE `profile` ADD `emergency_contact_name` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `emergency_contact_phone` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `emergency_contact_relation` text;