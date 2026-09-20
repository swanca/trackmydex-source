CREATE TYPE "public"."sealed_kind" AS ENUM('booster_pack', 'booster_box', 'booster_case', 'elite_trainer_box', 'bundle', 'build_and_battle', 'blister', 'deck', 'tin', 'box_set', 'collection', 'other');--> statement-breakpoint
CREATE TYPE "public"."sealed_state" AS ENUM('sealed', 'opened', 'damaged');--> statement-breakpoint
ALTER TYPE "public"."sync_kind" ADD VALUE 'sealed';--> statement-breakpoint
CREATE TABLE "sealed_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"sealed_product_id" varchar(64) NOT NULL,
	"state" "sealed_state" DEFAULT 'sealed' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"purchase_price" numeric(12, 2),
	"purchase_currency" "currency",
	"purchase_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sealed_item_quantity_positive" CHECK ("sealed_item"."quantity" > 0),
	CONSTRAINT "sealed_item_purchase_price_non_negative" CHECK ("sealed_item"."purchase_price" is null or "sealed_item"."purchase_price" >= 0),
	CONSTRAINT "sealed_item_purchase_currency_paired" CHECK (("sealed_item"."purchase_price" is null) = ("sealed_item"."purchase_currency" is null))
);
--> statement-breakpoint
CREATE TABLE "sealed_price" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sealed_price_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sealed_product_id" varchar(64) NOT NULL,
	"provider" varchar(48) NOT NULL,
	"currency" "currency" NOT NULL,
	"market" numeric(12, 2),
	"low" numeric(12, 2),
	"mid" numeric(12, 2),
	"high" numeric(12, 2),
	"direct_low" numeric(12, 2),
	"source_url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sealed_price_snapshot" (
	"sealed_product_id" varchar(64) NOT NULL,
	"captured_on" date NOT NULL,
	"provider" varchar(48) NOT NULL,
	"currency" "currency" NOT NULL,
	"market" numeric(12, 2),
	CONSTRAINT "sealed_price_snapshot_sealed_product_id_captured_on_provider_pk" PRIMARY KEY("sealed_product_id","captured_on","provider")
);
--> statement-breakpoint
CREATE TABLE "sealed_product" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"source_product_id" integer NOT NULL,
	"source_group_id" integer NOT NULL,
	"source_group_name" text NOT NULL,
	"set_id" varchar(64),
	"name" text NOT NULL,
	"kind" "sealed_kind" DEFAULT 'other' NOT NULL,
	"language" "card_language" DEFAULT 'en' NOT NULL,
	"image_url" text,
	"product_url" text,
	"released_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sealed_item" ADD CONSTRAINT "sealed_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sealed_item" ADD CONSTRAINT "sealed_item_sealed_product_id_sealed_product_id_fk" FOREIGN KEY ("sealed_product_id") REFERENCES "public"."sealed_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sealed_price" ADD CONSTRAINT "sealed_price_sealed_product_id_sealed_product_id_fk" FOREIGN KEY ("sealed_product_id") REFERENCES "public"."sealed_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sealed_price_snapshot" ADD CONSTRAINT "sealed_price_snapshot_sealed_product_id_sealed_product_id_fk" FOREIGN KEY ("sealed_product_id") REFERENCES "public"."sealed_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sealed_product" ADD CONSTRAINT "sealed_product_set_id_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."set"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sealed_item_stack_idx" ON "sealed_item" USING btree ("user_id","sealed_product_id","state");--> statement-breakpoint
CREATE INDEX "sealed_item_user_recent_idx" ON "sealed_item" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sealed_item_product_idx" ON "sealed_item" USING btree ("sealed_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sealed_price_product_provider_idx" ON "sealed_price" USING btree ("sealed_product_id","provider");--> statement-breakpoint
CREATE INDEX "sealed_price_market_idx" ON "sealed_price" USING btree ("market");--> statement-breakpoint
CREATE INDEX "sealed_price_snapshot_day_idx" ON "sealed_price_snapshot" USING btree ("captured_on");--> statement-breakpoint
CREATE UNIQUE INDEX "sealed_product_source_idx" ON "sealed_product" USING btree ("source_product_id");--> statement-breakpoint
CREATE INDEX "sealed_product_group_idx" ON "sealed_product" USING btree ("source_group_id");--> statement-breakpoint
CREATE INDEX "sealed_product_set_idx" ON "sealed_product" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "sealed_product_kind_idx" ON "sealed_product" USING btree ("kind","language");--> statement-breakpoint
CREATE INDEX "sealed_product_released_idx" ON "sealed_product" USING btree ("released_on" DESC NULLS LAST);