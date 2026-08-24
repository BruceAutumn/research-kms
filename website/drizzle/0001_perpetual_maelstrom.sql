CREATE TABLE `annotations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`paper_id` integer NOT NULL,
	`page` integer DEFAULT 1 NOT NULL,
	`type` text DEFAULT 'highlight' NOT NULL,
	`color` text DEFAULT 'yellow' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`rects_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_annotations_user_paper` ON `annotations` (`user_id`,`paper_id`,`page`);--> statement-breakpoint
ALTER TABLE `llm_settings` ADD `protocol` text DEFAULT 'openai' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `folder` text DEFAULT 'Inbox' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `properties` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `pinned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `collection_name` text DEFAULT '收件箱' NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `favorite` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `reading_progress` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_papers_user_collection` ON `papers` (`user_id`,`collection_name`);