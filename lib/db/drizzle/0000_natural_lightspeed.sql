CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"image_url" text,
	"goal" real DEFAULT 0 NOT NULL,
	"raised" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"latitude" real,
	"longitude" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"summary" text NOT NULL,
	"image_url" text,
	"published_at" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"message" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"int_value" integer,
	"float_value" real,
	CONSTRAINT "stats_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"message" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"age" text,
	"district" text,
	"availability" text NOT NULL,
	"skills" text,
	"interests" text,
	"motivation" text,
	"prior_experience" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"amount" numeric(12,2) NOT NULL,
	"payment_method" text NOT NULL,
	"message" text,
	"anonymous" boolean DEFAULT false NOT NULL,
	"public_proof" boolean DEFAULT false NOT NULL,
	"receipt_url" text,
	"receipt_note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donation_proofs" (
	"id" serial PRIMARY KEY NOT NULL,
	"donation_id" integer NOT NULL,
	"image_url" text NOT NULL,
	"public_id" text,
	"mime_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"image_url" text NOT NULL,
	"caption" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"date" text NOT NULL,
	"responsible" text,
	"observations" text,
	"receipt_url" text,
	"receipt_type" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"media_url" text NOT NULL,
	"media_type" text DEFAULT 'image' NOT NULL,
	"evidence_type" text DEFAULT 'activity' NOT NULL,
	"date" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"description" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"location" text NOT NULL,
	"urgency" text DEFAULT 'medium' NOT NULL,
	"photos" text[],
	"reporter_name" text NOT NULL,
	"reporter_phone" text,
	"reporter_email" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"campaign_id" integer,
	"featured_on_home" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"breed" text,
	"sex" text NOT NULL,
	"age_category" text NOT NULL,
	"age_approx" text,
	"size" text DEFAULT 'medium' NOT NULL,
	"photos" text[],
	"description" text NOT NULL,
	"history" text,
	"health_status" text DEFAULT 'good' NOT NULL,
	"vaccinated" boolean DEFAULT false NOT NULL,
	"sterilized" boolean DEFAULT false NOT NULL,
	"dewormed" boolean DEFAULT false NOT NULL,
	"adoption_requirements" text,
	"location" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"urgent" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'reviewing' NOT NULL,
	"submitted_by_public" boolean DEFAULT false NOT NULL,
	"featured_on_home" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adoption_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"pet_id" integer NOT NULL,
	"requester_name" text NOT NULL,
	"requester_age" text NOT NULL,
	"requester_phone" text NOT NULL,
	"requester_email" text,
	"requester_address" text NOT NULL,
	"has_pet_experience" boolean DEFAULT false NOT NULL,
	"previous_pets" text,
	"housing_type" text NOT NULL,
	"has_yard" boolean DEFAULT false NOT NULL,
	"adoption_reason" text NOT NULL,
	"accepts_follow_up" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'empresa' NOT NULL,
	"logo" text,
	"description" text,
	"website" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'moderador' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	"password_changed_at" timestamp,
	"two_factor_secret" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text,
	"label" varchar(200),
	"group" varchar(50) DEFAULT 'general',
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"username" text,
	"action" text NOT NULL,
	"resource" text,
	"resource_id" text,
	"ip_address" text,
	"user_agent" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "donation_proofs" ADD CONSTRAINT "donation_proofs_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_movements" ADD CONSTRAINT "campaign_movements_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;