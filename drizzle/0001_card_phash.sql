ALTER TABLE "card" ADD COLUMN "image_phash" varchar(32);--> statement-breakpoint
ALTER TABLE "card" ADD COLUMN "image_phash_source" text;--> statement-breakpoint
CREATE INDEX "card_phash_missing_idx" ON "card" USING btree ("id") WHERE "card"."image_phash" is null and "card"."image_base_url" is not null;