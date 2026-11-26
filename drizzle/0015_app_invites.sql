CREATE TABLE `app_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`max_registrations` integer NOT NULL,
	`registrations` integer DEFAULT 0 NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_invites_token_unique` ON `app_invites` (`token`);--> statement-breakpoint
CREATE INDEX `app_invites_created_by` ON `app_invites` (`created_by`);