CREATE TYPE "public"."card_language" AS ENUM('en', 'fr', 'de', 'es', 'it', 'pt', 'pt-br', 'ja', 'ko', 'zh-tw', 'zh-cn', 'id', 'th', 'nl', 'pl', 'ru');--> statement-breakpoint
CREATE TYPE "public"."condition" AS ENUM('mint', 'near_mint', 'excellent', 'good', 'light_played', 'played', 'poor');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('EUR', 'USD');--> statement-breakpoint
CREATE TYPE "public"."price_confidence" AS ENUM('exact', 'approximate');--> statement-breakpoint
CREATE TYPE "public"."sync_kind" AS ENUM('catalog', 'translations', 'prices', 'snapshot');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."variant_type" AS ENUM('normal', 'holo', 'reverse', 'firstEdition', 'firstEditionHolo', 'unlimited', 'wPromo', 'other');--> statement-breakpoint
CREATE TABLE "card" (
	"id" varchar(96) PRIMARY KEY NOT NULL,
	"set_id" varchar(64) NOT NULL,
	"local_id" varchar(24) NOT NULL,
	"sort_index" numeric(10, 3) DEFAULT '0' NOT NULL,
	"name" text NOT NULL,
	"category" varchar(24) DEFAULT 'Pokemon' NOT NULL,
	"rarity" text,
	"illustrator" text,
	"hp" integer,
	"types" text[] DEFAULT '{}' NOT NULL,
	"stage" text,
	"evolve_from" text,
	"regulation_mark" varchar(4),
	"dex_ids" integer[] DEFAULT '{}' NOT NULL,
	"image_base_url" text,
	"extra" jsonb,
	"provider_updated_at" timestamp with time zone,
	"content_hash" varchar(64),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_translation" (
	"card_id" varchar(96) NOT NULL,
	"language" "card_language" NOT NULL,
	"name" text NOT NULL,
	"local_id" varchar(24),
	"image_base_url" text,
	CONSTRAINT "card_translation_card_id_language_pk" PRIMARY KEY("card_id","language")
);
--> statement-breakpoint
CREATE TABLE "card_variant" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"card_id" varchar(96) NOT NULL,
	"variant_type" "variant_type" NOT NULL,
	"provider_variant_id" varchar(64),
	"size" varchar(24) DEFAULT 'standard' NOT NULL,
	"cardmarket_product_id" integer,
	"tcgplayer_product_id" integer,
	"mapping_locked" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "era" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_year" smallint NOT NULL,
	"end_year" smallint,
	"sort_order" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"era_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_translation" (
	"series_id" varchar(64) NOT NULL,
	"language" "card_language" NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	CONSTRAINT "series_translation_series_id_language_pk" PRIMARY KEY("series_id","language")
);
--> statement-breakpoint
CREATE TABLE "set" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"series_id" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"code" varchar(16),
	"release_date" date,
	"card_count_official" integer DEFAULT 0 NOT NULL,
	"card_count_total" integer DEFAULT 0 NOT NULL,
	"card_count_holo" integer,
	"card_count_reverse" integer,
	"card_count_first_ed" integer,
	"logo_url" text,
	"symbol_url" text,
	"legal_standard" boolean DEFAULT false NOT NULL,
	"legal_expanded" boolean DEFAULT false NOT NULL,
	"languages" "card_language"[] DEFAULT '{}' NOT NULL,
	"origin_language" "card_language" DEFAULT 'en' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_translation" (
	"set_id" varchar(64) NOT NULL,
	"language" "card_language" NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"symbol_url" text,
	"card_count_official" integer,
	"card_count_total" integer,
	CONSTRAINT "set_translation_set_id_language_pk" PRIMARY KEY("set_id","language")
);
--> statement-breakpoint
CREATE TABLE "card_price" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "card_price_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"card_variant_id" varchar(128) NOT NULL,
	"provider" varchar(48) NOT NULL,
	"currency" "currency" NOT NULL,
	"market" numeric(12, 2),
	"low" numeric(12, 2),
	"mid" numeric(12, 2),
	"high" numeric(12, 2),
	"trend" numeric(12, 2),
	"avg1" numeric(12, 2),
	"avg7" numeric(12, 2),
	"avg30" numeric(12, 2),
	"direct_low" numeric(12, 2),
	"confidence" "price_confidence" DEFAULT 'exact' NOT NULL,
	"approximation_reason" text,
	"source_product_id" varchar(64),
	"source_url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_price_snapshot" (
	"card_variant_id" varchar(128) NOT NULL,
	"provider" varchar(48) NOT NULL,
	"captured_on" date NOT NULL,
	"currency" "currency" NOT NULL,
	"market" numeric(12, 2),
	"low" numeric(12, 2),
	"trend" numeric(12, 2),
	CONSTRAINT "card_price_snapshot_card_variant_id_provider_captured_on_pk" PRIMARY KEY("card_variant_id","provider","captured_on")
);
--> statement-breakpoint
CREATE TABLE "fx_rate" (
	"base" varchar(3) NOT NULL,
	"quote" varchar(3) NOT NULL,
	"as_of" date NOT NULL,
	"rate" numeric(14, 6) NOT NULL,
	"source" varchar(48) DEFAULT 'static' NOT NULL,
	CONSTRAINT "fx_rate_base_quote_as_of_pk" PRIMARY KEY("base","quote","as_of")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"ui_locale" varchar(8) DEFAULT 'en' NOT NULL,
	"default_card_language" "card_language" DEFAULT 'en' NOT NULL,
	"display_currency" "currency" DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"card_id" varchar(96) NOT NULL,
	"card_variant_id" varchar(128) NOT NULL,
	"language" "card_language" NOT NULL,
	"condition" "condition" DEFAULT 'near_mint' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"purchase_price" numeric(12, 2),
	"purchase_currency" "currency",
	"purchase_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_item_quantity_positive" CHECK ("collection_item"."quantity" > 0),
	CONSTRAINT "collection_item_purchase_price_non_negative" CHECK ("collection_item"."purchase_price" is null or "collection_item"."purchase_price" >= 0),
	CONSTRAINT "collection_item_purchase_currency_paired" CHECK (("collection_item"."purchase_price" is null) = ("collection_item"."purchase_currency" is null))
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshot" (
	"user_id" text NOT NULL,
	"captured_on" date NOT NULL,
	"currency" "currency" NOT NULL,
	"total_value" numeric(14, 2) NOT NULL,
	"exact_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"unique_cards" integer DEFAULT 0 NOT NULL,
	"total_cards" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"card_id" varchar(96) NOT NULL,
	"card_variant_id" varchar(128) NOT NULL,
	"language" "card_language" NOT NULL,
	"target_price" numeric(12, 2),
	"target_currency" "currency",
	"priority" smallint DEFAULT 3 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_priority_range" CHECK ("wishlist_item"."priority" between 1 and 5),
	CONSTRAINT "wishlist_target_currency_paired" CHECK (("wishlist_item"."target_price" is null) = ("wishlist_item"."target_currency" is null))
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"key" varchar(160) PRIMARY KEY NOT NULL,
	"tokens" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_error" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid,
	"scope" varchar(32) NOT NULL,
	"ref" varchar(160),
	"message" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"triggered_by" varchar(64) DEFAULT 'cli' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_set_id_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_translation" ADD CONSTRAINT "card_translation_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_variant" ADD CONSTRAINT "card_variant_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_era_id_era_id_fk" FOREIGN KEY ("era_id") REFERENCES "public"."era"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_translation" ADD CONSTRAINT "series_translation_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set" ADD CONSTRAINT "set_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_translation" ADD CONSTRAINT "set_translation_set_id_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_price" ADD CONSTRAINT "card_price_card_variant_id_card_variant_id_fk" FOREIGN KEY ("card_variant_id") REFERENCES "public"."card_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_price_snapshot" ADD CONSTRAINT "card_price_snapshot_card_variant_id_card_variant_id_fk" FOREIGN KEY ("card_variant_id") REFERENCES "public"."card_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_card_variant_id_card_variant_id_fk" FOREIGN KEY ("card_variant_id") REFERENCES "public"."card_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshot" ADD CONSTRAINT "portfolio_snapshot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_card_variant_id_card_variant_id_fk" FOREIGN KEY ("card_variant_id") REFERENCES "public"."card_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_error" ADD CONSTRAINT "sync_error_sync_run_id_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_set_local_idx" ON "card" USING btree ("set_id","local_id");--> statement-breakpoint
CREATE INDEX "card_set_sort_idx" ON "card" USING btree ("set_id","sort_index");--> statement-breakpoint
CREATE INDEX "card_name_trgm_idx" ON "card" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "card_rarity_idx" ON "card" USING btree ("rarity");--> statement-breakpoint
CREATE INDEX "card_illustrator_idx" ON "card" USING btree ("illustrator");--> statement-breakpoint
CREATE INDEX "card_dex_idx" ON "card" USING gin ("dex_ids");--> statement-breakpoint
CREATE INDEX "card_translation_name_trgm_idx" ON "card_translation" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "card_translation_lang_idx" ON "card_translation" USING btree ("language");--> statement-breakpoint
CREATE INDEX "card_variant_card_idx" ON "card_variant" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_variant_card_type_size_idx" ON "card_variant" USING btree ("card_id","variant_type","size");--> statement-breakpoint
CREATE INDEX "card_variant_cardmarket_idx" ON "card_variant" USING btree ("cardmarket_product_id");--> statement-breakpoint
CREATE INDEX "card_variant_unmapped_idx" ON "card_variant" USING btree ("card_id") WHERE "card_variant"."cardmarket_product_id" is null;--> statement-breakpoint
CREATE INDEX "series_era_idx" ON "series" USING btree ("era_id","sort_order");--> statement-breakpoint
CREATE INDEX "set_series_idx" ON "set" USING btree ("series_id","sort_order");--> statement-breakpoint
CREATE INDEX "set_release_idx" ON "set" USING btree ("release_date");--> statement-breakpoint
CREATE INDEX "set_name_trgm_idx" ON "set" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "set_translation_name_trgm_idx" ON "set_translation" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "card_price_variant_provider_idx" ON "card_price" USING btree ("card_variant_id","provider");--> statement-breakpoint
CREATE INDEX "card_price_fetched_idx" ON "card_price" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "card_price_market_idx" ON "card_price" USING btree ("market");--> statement-breakpoint
CREATE INDEX "card_price_snapshot_date_idx" ON "card_price_snapshot" USING btree ("captured_on");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_item_stack_idx" ON "collection_item" USING btree ("user_id","card_variant_id","language","condition");--> statement-breakpoint
CREATE INDEX "collection_item_user_card_idx" ON "collection_item" USING btree ("user_id","card_id");--> statement-breakpoint
CREATE INDEX "collection_item_user_recent_idx" ON "collection_item" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "collection_item_variant_idx" ON "collection_item" USING btree ("card_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_snapshot_pk" ON "portfolio_snapshot" USING btree ("user_id","captured_on");--> statement-breakpoint
CREATE INDEX "portfolio_snapshot_user_idx" ON "portfolio_snapshot" USING btree ("user_id","captured_on" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_item_unique_idx" ON "wishlist_item" USING btree ("user_id","card_variant_id","language");--> statement-breakpoint
CREATE INDEX "wishlist_item_user_idx" ON "wishlist_item" USING btree ("user_id","priority");--> statement-breakpoint
CREATE INDEX "rate_limit_updated_idx" ON "rate_limit_bucket" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "sync_error_run_idx" ON "sync_error" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "sync_error_created_idx" ON "sync_error" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sync_run_kind_idx" ON "sync_run" USING btree ("kind","started_at" DESC NULLS LAST);