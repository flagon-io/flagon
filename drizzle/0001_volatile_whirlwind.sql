CREATE TABLE "feature_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"email" text,
	"user_id" uuid,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
