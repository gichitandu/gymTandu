CREATE TABLE `app_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`build_id` text NOT NULL,
	`generation` integer DEFAULT 1 NOT NULL,
	`requested_at` integer NOT NULL,
	`requested_by` text,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
