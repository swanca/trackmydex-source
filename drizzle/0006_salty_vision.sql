CREATE TABLE "collection_share" (
	"user_id" text PRIMARY KEY NOT NULL,
	"public_token" varchar(48) NOT NULL,
	"show_value" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_share" ADD CONSTRAINT "collection_share_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_share_token_idx" ON "collection_share" USING btree ("public_token");