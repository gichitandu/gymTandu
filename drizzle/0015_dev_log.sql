CREATE TABLE `dev_build_usage` (
	`build` text NOT NULL,
	`route` text NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`build`, `route`)
);
--> statement-breakpoint
CREATE TABLE `dev_item_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`at` integer NOT NULL,
	`actor` text NOT NULL,
	`kind` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `dev_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dev_item_events_item` ON `dev_item_events` (`item_id`,`id`);--> statement-breakpoint
CREATE TABLE `dev_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`route` text,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`regression` integer DEFAULT 0 NOT NULL,
	`fingerprint` text,
	`occurrences` integer DEFAULT 0 NOT NULL,
	`first_seen` integer,
	`last_seen` integer,
	`last_build` text,
	`fixed_at` integer,
	`fix_summary` text,
	`fix_commit` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dev_items_fingerprint_unique` ON `dev_items` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `dev_items_status` ON `dev_items` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `dev_occurrences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`at` integer NOT NULL,
	`build` text NOT NULL,
	`route` text,
	`device` text,
	`message` text NOT NULL,
	`stack` text,
	FOREIGN KEY (`item_id`) REFERENCES `dev_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dev_occurrences_item` ON `dev_occurrences` (`item_id`,`id`);