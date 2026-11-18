CREATE TABLE `press_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`lease` text NOT NULL,
	`result` text
);
--> statement-breakpoint
CREATE INDEX `press_checks_started_idx` ON `press_checks` (`started_at`);--> statement-breakpoint
CREATE TABLE `press_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`fetched_at` text NOT NULL,
	`payload` text NOT NULL
);
