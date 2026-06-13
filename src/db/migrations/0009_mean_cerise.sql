ALTER TABLE `medication` ADD `as_needed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` ADD `pregnancy_status` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `code_status` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `organ_donor` integer;