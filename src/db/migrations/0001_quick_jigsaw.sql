ALTER TABLE `profile` ADD `height_cm` real;--> statement-breakpoint
ALTER TABLE `profile` ADD `weight_kg` real;--> statement-breakpoint
ALTER TABLE `profile` ADD `target_weight_kg` real;--> statement-breakpoint
ALTER TABLE `profile` ADD `blood_type` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `rh_factor` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `ethnicity` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `activity_level` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `smoking` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `alcohol` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `conditions` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `unit_system` text DEFAULT 'metric' NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` ADD `onboarded_at` text;