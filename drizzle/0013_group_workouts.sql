CREATE TABLE `group_members` (
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`payload` text NOT NULL,
	`joined_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`left_at` integer,
	PRIMARY KEY(`session_id`, `user_id`),
	FOREIGN KEY (`session_id`) REFERENCES `group_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `group_members_user` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `group_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`invite_token` text NOT NULL,
	`host_id` text NOT NULL,
	`day_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ended_at` integer,
	`registrations` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_sessions_invite_token_unique` ON `group_sessions` (`invite_token`);--> statement-breakpoint
CREATE INDEX `group_sessions_code` ON `group_sessions` (`code`);--> statement-breakpoint
CREATE INDEX `group_sessions_host` ON `group_sessions` (`host_id`);