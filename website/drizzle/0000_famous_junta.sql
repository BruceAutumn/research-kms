CREATE TABLE `ai_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_messages_user_created` ON `ai_messages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`detail` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `llm_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider_name` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`api_key_cipher` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notes_user_updated` ON `notes` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `papers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`authors` text,
	`year` integer,
	`doi` text,
	`abstract_text` text,
	`extracted_text` text,
	`filename` text,
	`object_key` text,
	`content_type` text,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_papers_user_created` ON `papers` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
