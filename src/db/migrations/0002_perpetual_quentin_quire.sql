CREATE TABLE `chat_change_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`change_set_id` integer NOT NULL,
	`operation` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`payload_json` text NOT NULL,
	`before_json` text,
	`status` text DEFAULT 'ready' NOT NULL,
	`warnings_json` text DEFAULT '[]' NOT NULL,
	`errors_json` text DEFAULT '[]' NOT NULL,
	`candidate_matches_json` text DEFAULT '[]' NOT NULL,
	`confidence` real,
	`selected` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`change_set_id`) REFERENCES `chat_change_set`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_change_item_set_idx` ON `chat_change_item` (`change_set_id`);--> statement-breakpoint
CREATE TABLE `chat_change_set` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`source_message_id` integer NOT NULL,
	`summary` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`risk_level` text DEFAULT 'standard' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`committed_at` text,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `chat_message`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chat_change_set_thread_idx` ON `chat_change_set` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_change_set_source_idx` ON `chat_change_set` (`source_message_id`);--> statement-breakpoint
CREATE TABLE `chat_message` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`turn_status` text DEFAULT 'completed' NOT NULL,
	`provider_id` text,
	`model_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_message_thread_created_idx` ON `chat_message` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_thread` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`title` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chat_thread_profile_updated_idx` ON `chat_thread` (`profile_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `chat_tool_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` integer NOT NULL,
	`tool_name` text NOT NULL,
	`arguments_json` text NOT NULL,
	`result_summary_json` text,
	`status` text NOT NULL,
	`duration_ms` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `chat_message`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_tool_event_message_idx` ON `chat_tool_event` (`message_id`);--> statement-breakpoint
CREATE TABLE `health_note` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`title` text,
	`summary` text,
	`original_text` text NOT NULL,
	`date` text,
	`date_precision` text DEFAULT 'unknown' NOT NULL,
	`date_raw` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `health_note_profile_date_idx` ON `health_note` (`profile_id`,`date`);--> statement-breakpoint
CREATE TABLE `record_audit_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`operation` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`source_type` text NOT NULL,
	`source_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `record_audit_entity_idx` ON `record_audit_event` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `record_provenance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`assertion_type` text NOT NULL,
	`verification_status` text NOT NULL,
	`raw_text` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `record_provenance_entity_idx` ON `record_provenance` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `record_relation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`source_entity_type` text NOT NULL,
	`source_entity_id` integer NOT NULL,
	`target_entity_type` text NOT NULL,
	`target_entity_id` integer NOT NULL,
	`relation_type` text NOT NULL,
	`assertion_type` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `record_relation_source_idx` ON `record_relation` (`source_entity_type`,`source_entity_id`);--> statement-breakpoint
CREATE INDEX `record_relation_target_idx` ON `record_relation` (`target_entity_type`,`target_entity_id`);