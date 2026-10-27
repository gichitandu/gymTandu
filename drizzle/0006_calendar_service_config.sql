CREATE TABLE IF NOT EXISTS `calendar_service_config` (
 `id` text PRIMARY KEY NOT NULL,
 `secret` text NOT NULL,
 `configured_by` text NOT NULL,
 `configured_at` integer NOT NULL
);
