CREATE TABLE `archive_heads` (
	`scope` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`object_key` text NOT NULL,
	`updated_at` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`content_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `archive_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`revision` integer NOT NULL,
	`object_key` text NOT NULL,
	`updated_at` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`content_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_versions_scope_revision` ON `archive_versions` (`scope`,`revision`);