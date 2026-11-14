CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`crew_id` text NOT NULL,
	`system` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`escalation` text NOT NULL,
	`metric_id` text,
	`due_at` text,
	`created_at` text NOT NULL,
	`acknowledged` integer DEFAULT false NOT NULL,
	`recommendation` text,
	FOREIGN KEY (`crew_id`) REFERENCES `crew_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`metric_id`) REFERENCES `metrics`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "alerts_system_valid" CHECK("alerts"."system" IN ('cardiovascular', 'musculoskeletal', 'blood-biochemistry', 'immune', 'vision', 'sleep-cognition', 'behavioral-health', 'radiation', 'nutrition')),
	CONSTRAINT "alerts_kind_valid" CHECK("alerts"."kind" IN ('anomaly', 'scheduled')),
	CONSTRAINT "alerts_severity_valid" CHECK("alerts"."severity" IN ('critical', 'caution', 'info')),
	CONSTRAINT "alerts_escalation_valid" CHECK("alerts"."escalation" IN ('self-care', 'crew-medical-officer', 'flight-surgeon')),
	CONSTRAINT "alerts_created_at_format" CHECK("alerts"."created_at" GLOB '????-??-??T??:??:??Z'),
	CONSTRAINT "alerts_due_at_format" CHECK("alerts"."due_at" GLOB '????-??-??T??:??:??Z'),
	CONSTRAINT "alerts_anomaly_has_metric" CHECK("alerts"."kind" = 'scheduled' OR "alerts"."metric_id" IS NOT NULL),
	CONSTRAINT "alerts_scheduled_has_due" CHECK("alerts"."kind" = 'anomaly' OR "alerts"."due_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `alerts_crew_idx` ON `alerts` (`crew_id`,`acknowledged`,`created_at`);--> statement-breakpoint
CREATE TABLE `crew_members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`agency` text NOT NULL,
	`age` integer NOT NULL,
	`sex` text NOT NULL,
	`avatar_url` text,
	`height_cm` real,
	`weight_kg` real,
	CONSTRAINT "crew_members_id_format" CHECK("crew_members"."id" GLOB 'C[0-9][0-9][0-9]'),
	CONSTRAINT "crew_members_age_positive" CHECK("crew_members"."age" > 0),
	CONSTRAINT "crew_members_sex_valid" CHECK("crew_members"."sex" IN ('female', 'male'))
);
--> statement-breakpoint
CREATE TABLE `formulary` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`indication` text NOT NULL,
	`dosage` text,
	`notes` text,
	`source` text NOT NULL,
	CONSTRAINT "formulary_source_required" CHECK(json_valid("formulary"."source") AND length(trim(coalesce(json_extract("formulary"."source", '$.document'), ''))) > 0)
);
--> statement-breakpoint
CREATE TABLE `measurements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`crew_id` text NOT NULL,
	`metric_id` text NOT NULL,
	`value` real NOT NULL,
	`taken_at` text NOT NULL,
	`simulated` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`crew_id`) REFERENCES `crew_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`metric_id`) REFERENCES `metrics`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "measurements_taken_at_format" CHECK("measurements"."taken_at" GLOB '????-??-??T??:??:??Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurements_crew_metric_time_uq` ON `measurements` (`crew_id`,`metric_id`,`taken_at`);--> statement-breakpoint
CREATE INDEX `measurements_metric_time_idx` ON `measurements` (`metric_id`,`taken_at`);--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`system` text NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`description` text NOT NULL,
	`spaceflight_effect` text,
	`origin` text NOT NULL,
	`cadence_minutes` integer NOT NULL,
	CONSTRAINT "metrics_system_valid" CHECK("metrics"."system" IN ('cardiovascular', 'musculoskeletal', 'blood-biochemistry', 'immune', 'vision', 'sleep-cognition', 'behavioral-health', 'radiation', 'nutrition')),
	CONSTRAINT "metrics_origin_valid" CHECK("metrics"."origin" IN ('sensor', 'lab', 'manual', 'in-app-test')),
	CONSTRAINT "metrics_cadence_positive" CHECK("metrics"."cadence_minutes" > 0)
);
--> statement-breakpoint
CREATE INDEX `metrics_system_idx` ON `metrics` (`system`);--> statement-breakpoint
CREATE TABLE `mission` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_at` text NOT NULL,
	`length_days` integer NOT NULL,
	`time_scale` real NOT NULL,
	`sim_time` text NOT NULL,
	CONSTRAINT "mission_single_row" CHECK("mission"."id" = 1),
	CONSTRAINT "mission_start_format" CHECK("mission"."start_at" GLOB '????-??-??T??:??:??Z'),
	CONSTRAINT "mission_sim_time_format" CHECK("mission"."sim_time" GLOB '????-??-??T??:??:??Z'),
	CONSTRAINT "mission_length_positive" CHECK("mission"."length_days" > 0),
	CONSTRAINT "mission_time_scale_positive" CHECK("mission"."time_scale" > 0),
	CONSTRAINT "mission_clock_not_before_start" CHECK("mission"."sim_time" >= "mission"."start_at")
);
--> statement-breakpoint
CREATE TABLE `thresholds` (
	`metric_id` text PRIMARY KEY NOT NULL,
	`ranges` text NOT NULL,
	`escalation` text NOT NULL,
	`fallback_recommendation` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`metric_id`) REFERENCES `metrics`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "thresholds_ranges_array" CHECK(json_valid("thresholds"."ranges") AND json_type("thresholds"."ranges") = 'array'),
	CONSTRAINT "thresholds_escalation_object" CHECK(json_valid("thresholds"."escalation") AND json_type("thresholds"."escalation") = 'object'),
	CONSTRAINT "thresholds_source_required" CHECK(json_valid("thresholds"."source") AND length(trim(coalesce(json_extract("thresholds"."source", '$.document'), ''))) > 0)
);
