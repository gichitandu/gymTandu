CREATE TABLE `design_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`kind` text NOT NULL,
	`delta` text NOT NULL,
	FOREIGN KEY (`revision`) REFERENCES `design_revisions`(`revision`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `design_drafts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`base_revision` integer NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `design_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `design_presets_user` ON `design_presets` (`user_id`);--> statement-breakpoint
CREATE TABLE `design_revisions` (
	`revision` integer PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`config` text NOT NULL,
	`checksum` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`kind` text NOT NULL,
	`source_revision` integer,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_revisions_operation_id_unique` ON `design_revisions` (`operation_id`);--> statement-breakpoint
CREATE TABLE `design_state` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`config` text NOT NULL,
	`updated_at` integer,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "design_state_current" CHECK("design_state"."id" = 'current')
);
--> statement-breakpoint
-- Preserve the current app and every existing personal theme until an explicit publication.
INSERT INTO design_state (id,revision,config) VALUES ('current',0,'{"schemaVersion":1,"enabled":true,"presetId":"app_default","global":{},"pages":{},"instances":{}}');
