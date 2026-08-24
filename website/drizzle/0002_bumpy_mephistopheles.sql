CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`status` text NOT NULL,
	`prompt` text NOT NULL,
	`paper_id` integer,
	`note_id` integer,
	`step_count` integer DEFAULT 0 NOT NULL,
	`answer` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_runs_user_updated` ON `agent_runs` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `agent_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`tool_name` text NOT NULL,
	`input_json` text DEFAULT '{}' NOT NULL,
	`output_json` text,
	`status` text NOT NULL,
	`permission` text DEFAULT 'read' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_steps_run_sequence` ON `agent_steps` (`run_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_agent_steps_user_run` ON `agent_steps` (`user_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_user_updated` ON `conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `note_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`source_note_id` integer NOT NULL,
	`target_title` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_note_links_user_target` ON `note_links` (`user_id`,`target_title`);--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`kind` text NOT NULL,
	`manifest_json` text NOT NULL,
	`permissions_json` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`installed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_plugins_user_id` ON `plugins` (`user_id`,`id`);--> statement-breakpoint
ALTER TABLE `ai_messages` ADD `conversation_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `annotations` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `stable_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `revision` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE VIRTUAL TABLE `search_index` USING fts5(
	`entity_type` UNINDEXED,
	`entity_id` UNINDEXED,
	`user_id` UNINDEXED,
	`title`,
	`body`,
	tokenize='unicode61'
);
--> statement-breakpoint
INSERT INTO `search_index` (`entity_type`,`entity_id`,`user_id`,`title`,`body`)
SELECT 'paper', CAST(`id` AS TEXT), `user_id`, `title`, COALESCE(`authors`,'') || ' ' || COALESCE(`doi`,'') || ' ' || COALESCE(`abstract_text`,'') || ' ' || COALESCE(`extracted_text`,'') FROM `papers`;
--> statement-breakpoint
INSERT INTO `search_index` (`entity_type`,`entity_id`,`user_id`,`title`,`body`)
SELECT 'note', CAST(`id` AS TEXT), `user_id`, `title`, COALESCE(`folder`,'') || ' ' || COALESCE(`properties`,'') || ' ' || COALESCE(`content`,'') FROM `notes`;
--> statement-breakpoint
INSERT INTO `search_index` (`entity_type`,`entity_id`,`user_id`,`title`,`body`)
SELECT 'annotation', CAST(`id` AS TEXT), `user_id`, 'PDF annotation · page ' || CAST(`page` AS TEXT), COALESCE(`text`,'') || ' ' || COALESCE(`comment`,'') FROM `annotations`;
--> statement-breakpoint
INSERT INTO `search_index` (`entity_type`,`entity_id`,`user_id`,`title`,`body`)
SELECT 'conversation', CAST(`id` AS TEXT), `user_id`, `mode` || ' conversation', `content` FROM `ai_messages`;
