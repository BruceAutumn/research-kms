CREATE TABLE `rate_limits` (
	`user_id` text NOT NULL,
	`bucket` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rate_limits_user_bucket` ON `rate_limits` (`user_id`,`bucket`);