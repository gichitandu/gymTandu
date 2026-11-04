CREATE TABLE `archive_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`revision` integer NOT NULL,
	`object_key` text NOT NULL,
	`updated_at` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`content_hash` text NOT NULL,
	`reason` text NOT NULL,
	`workout_id` text,
	`workout_date` text,
	`day_name` text
);
--> statement-breakpoint
CREATE INDEX `archive_checkpoints_scope_revision` ON `archive_checkpoints` (`scope`,`revision`);--> statement-breakpoint
CREATE INDEX `archive_checkpoints_object` ON `archive_checkpoints` (`object_key`);