CREATE TABLE "campaign_leftovers" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"item" text NOT NULL,
	"quantity" real DEFAULT 1 NOT NULL,
	"unit" text,
	"notes" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
