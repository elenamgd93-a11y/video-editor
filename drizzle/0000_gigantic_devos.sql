CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`media_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exports_project_idx` ON `exports` (`project_id`);--> statement-breakpoint
CREATE INDEX `exports_media_idx` ON `exports` (`media_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`duration_ms` integer,
	`width` integer,
	`height` integer,
	`r2_key` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_owner_idx` ON `media` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_media` (
	`project_id` text NOT NULL,
	`media_id` text NOT NULL,
	PRIMARY KEY(`project_id`, `media_id`)
);
--> statement-breakpoint
CREATE INDEX `project_media_media_idx` ON `project_media` (`media_id`);--> statement-breakpoint
CREATE TABLE `project_shares` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `project_shares_user_idx` ON `project_shares` (`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`aspect` text NOT NULL,
	`timeline` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`save_id` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE TABLE `template_media` (
	`template_id` text NOT NULL,
	`media_id` text NOT NULL,
	PRIMARY KEY(`template_id`, `media_id`)
);
--> statement-breakpoint
CREATE INDEX `template_media_media_idx` ON `template_media` (`media_id`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`aspect` text NOT NULL,
	`timeline` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
