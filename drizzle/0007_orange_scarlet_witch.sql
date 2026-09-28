CREATE TABLE "calibration_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text NOT NULL,
	"target_count" integer NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "calibration_campaign_target_range" CHECK ("calibration_campaign"."target_count" between 1 and 500),
	CONSTRAINT "calibration_campaign_status_valid" CHECK ("calibration_campaign"."status" in ('active', 'complete'))
);
--> statement-breakpoint
CREATE TABLE "calibration_capture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"image" "bytea" NOT NULL,
	"image_mime" varchar(24) NOT NULL,
	"image_width" integer NOT NULL,
	"image_height" integer NOT NULL,
	"image_size" integer NOT NULL,
	"fingerprint" varchar(32) NOT NULL,
	"metrics" jsonb NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"device" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calibration_capture_sequence_positive" CHECK ("calibration_capture"."sequence" > 0),
	CONSTRAINT "calibration_capture_image_size_range" CHECK ("calibration_capture"."image_size" between 1 and 750000),
	CONSTRAINT "calibration_capture_mime_valid" CHECK ("calibration_capture"."image_mime" in ('image/jpeg', 'image/webp'))
);
--> statement-breakpoint
ALTER TABLE "calibration_campaign" ADD CONSTRAINT "calibration_campaign_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_capture" ADD CONSTRAINT "calibration_capture_campaign_id_calibration_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."calibration_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calibration_campaign_owner_idx" ON "calibration_campaign" USING btree ("created_by","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "calibration_capture_sequence_idx" ON "calibration_capture" USING btree ("campaign_id","sequence");--> statement-breakpoint
CREATE INDEX "calibration_capture_campaign_idx" ON "calibration_capture" USING btree ("campaign_id","created_at");