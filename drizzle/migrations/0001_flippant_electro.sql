CREATE TABLE `bluesky_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`status` text NOT NULL,
	`text` text NOT NULL,
	`post_uri` text,
	`post_cid` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE cascade
);
