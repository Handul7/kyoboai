CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`url` text NOT NULL,
	`body_hash` text NOT NULL,
	`title` text NOT NULL,
	`published_at` text NOT NULL,
	`body` text NOT NULL,
	`received_at` text NOT NULL,
	`permission_note` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_url_unique` ON `articles` (`url`);--> statement-breakpoint
CREATE INDEX `articles_published_at_idx` ON `articles` (`published_at`);--> statement-breakpoint
CREATE INDEX `articles_source_id_idx` ON `articles` (`source_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `judgments` (
	`article_id` text PRIMARY KEY NOT NULL,
	`body_hash` text NOT NULL,
	`pipeline_version` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`run_key` text NOT NULL,
	`department_id` text NOT NULL,
	`window_id` text NOT NULL,
	`window_json` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_run_key_unique` ON `reports` (`run_key`);--> statement-breakpoint
CREATE INDEX `reports_department_status_idx` ON `reports` (`department_id`,`status`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_key` text NOT NULL,
	`window_id` text NOT NULL,
	`department_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`error` text,
	`counts` text DEFAULT '{}' NOT NULL,
	`lease_until` text NOT NULL,
	`owner_token` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_run_key_unique` ON `runs` (`run_key`);--> statement-breakpoint
CREATE TABLE `source_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`body_allowed` integer DEFAULT 0 NOT NULL,
	`ai_allowed` integer DEFAULT 0 NOT NULL,
	`permission_note` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
