CREATE TABLE `ai_usage` (
	`day` text PRIMARY KEY NOT NULL,
	`neurons` integer DEFAULT 0 NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
