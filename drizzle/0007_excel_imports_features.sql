CREATE TABLE IF NOT EXISTS `app_features` (
	`id` text PRIMARY KEY NOT NULL,
	`nutrition_enabled` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`updated_at` integer,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `excel_import_files` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`plan_id` text NOT NULL,
	`source_name` text NOT NULL,
	`content_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`weeks` integer NOT NULL,
	`plan_name` text NOT NULL,
	`imported_at` integer NOT NULL,
	`confirmed_at` integer,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `excel_import_files_account_hash_start` ON `excel_import_files` (`user_id`,`content_hash`,`start_date`);