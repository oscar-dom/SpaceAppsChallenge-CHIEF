CREATE TABLE `inventory_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`at` text NOT NULL,
	`day` integer NOT NULL,
	`delta` real NOT NULL,
	`reason` text NOT NULL,
	`ref` text,
	`note` text,
	`crew_id` text,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`crew_id`) REFERENCES `crew_members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inventory_events_at_format" CHECK("inventory_events"."at" GLOB '????-??-??T??:??:??Z'),
	CONSTRAINT "inventory_events_reason_valid" CHECK("inventory_events"."reason" IN ('consumption', 'recovery', 'resupply', 'adjustment')),
	CONSTRAINT "inventory_events_day_positive" CHECK("inventory_events"."day" > 0),
	CONSTRAINT "inventory_events_delta_not_zero" CHECK("inventory_events"."delta" <> 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_events_ref_uq` ON `inventory_events` (`item_id`,`reason`,`ref`);--> statement-breakpoint
CREATE INDEX `inventory_events_item_day_idx` ON `inventory_events` (`item_id`,`day`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`purpose` text NOT NULL,
	`initial_quantity` real NOT NULL,
	`expected_daily_use` real NOT NULL,
	`recovery_rate` real DEFAULT 0 NOT NULL,
	`caution_days` real NOT NULL,
	`critical_days` real NOT NULL,
	`source` text NOT NULL,
	CONSTRAINT "inventory_items_category_valid" CHECK("inventory_items"."category" IN ('medication', 'food', 'water')),
	CONSTRAINT "inventory_items_initial_not_negative" CHECK("inventory_items"."initial_quantity" >= 0),
	CONSTRAINT "inventory_items_recovery_range" CHECK("inventory_items"."recovery_rate" >= 0 AND "inventory_items"."recovery_rate" < 1),
	CONSTRAINT "inventory_items_source_required" CHECK(json_valid("inventory_items"."source") AND length(trim(coalesce(json_extract("inventory_items"."source", '$.document'), ''))) > 0)
);
