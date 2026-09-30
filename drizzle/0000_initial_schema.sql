CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'conflicted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('collecting', 'searching', 'offering', 'awaiting_confirmation', 'booking', 'complete', 'abandoned');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_google_event_id_unique" UNIQUE("google_event_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"calendar_email" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"scope" text NOT NULL,
	"selected_calendar_id" text DEFAULT 'primary' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"eleven_conversation_id" text,
	"status" "conversation_status" DEFAULT 'collecting' NOT NULL,
	"scheduling_draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "conversations_eleven_conversation_id_unique" UNIQUE("eleven_conversation_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_user_starts_idx" ON "bookings" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connections_provider_account_unique" ON "calendar_connections" USING btree ("provider_account_id");--> statement-breakpoint
CREATE INDEX "calendar_connections_user_idx" ON "calendar_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_user_created_idx" ON "conversations" USING btree ("user_id","created_at");