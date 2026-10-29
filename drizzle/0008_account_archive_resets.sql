CREATE TABLE `account_archive_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`reset_id` text NOT NULL,
	`completed_at` integer,
	`recovery_key` text,
	`retain_until` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_archive_resets_user_id_unique` ON `account_archive_resets` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_archive_resets_scope_unique` ON `account_archive_resets` (`scope`);