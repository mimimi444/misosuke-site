CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`ip` text NOT NULL,
	`attempted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_ip_at` ON `login_attempts` (`ip`,`attempted_at`);--> statement-breakpoint
ALTER TABLE `images` ADD `original_r2_key` text;--> statement-breakpoint
-- 圧縮導入前の画像は、公開用と元画像が同じファイル
UPDATE `images` SET `original_r2_key` = `r2_key` WHERE `original_r2_key` IS NULL;
