CREATE TABLE "card_best_price" (
	"card_id" varchar(96) PRIMARY KEY NOT NULL,
	"card_variant_id" varchar(128) NOT NULL,
	"market" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_best_price" ADD CONSTRAINT "card_best_price_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_best_price_market_idx" ON "card_best_price" USING btree ("market" DESC NULLS LAST);