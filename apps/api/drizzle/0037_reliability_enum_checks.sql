-- Defense-in-depth CHECK constraints on the reliability enums. Every write already
-- goes through a zod enum, so these never reject valid traffic; they stop a future
-- direct writer or bug from persisting a value that would break the escalation sweep
-- or the serializers (e.g. an out-of-range status the sweep's "not resolved" filter
-- would then never clear). Data today is zod-gated, so the constraints validate clean.
ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_status_check"
  CHECK ("status" IN ('open', 'investigating', 'identified', 'monitoring', 'resolved'));
--> statement-breakpoint
ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_severity_check"
  CHECK ("severity" IN ('sev1', 'sev2', 'sev3', 'sev4'));
--> statement-breakpoint
ALTER TABLE "oncall_escalation_levels"
  ADD CONSTRAINT "oncall_escalation_levels_target_type_check"
  CHECK ("target_type" IN ('schedule', 'team', 'user'));
--> statement-breakpoint
ALTER TABLE "incident_action_items"
  ADD CONSTRAINT "incident_action_items_status_check"
  CHECK ("status" IN ('open', 'in_progress', 'done'));
--> statement-breakpoint
ALTER TABLE "notification_channels"
  ADD CONSTRAINT "notification_channels_type_check"
  CHECK ("type" IN ('email', 'sms', 'voice', 'push'));
