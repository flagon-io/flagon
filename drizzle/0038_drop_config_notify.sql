-- Configuration-change detection moved off PostgreSQL LISTEN/NOTIFY.
--
-- A serverless function cannot hold a live LISTEN connection across freezes, so
-- the NOTIFY channel never reliably invalidated on the platform that matters.
-- Changes now propagate through the ConfigStore: a save writes the org's
-- artifact through to the store (republishConfig), OFREP evaluation reads it
-- back conditionally by ETag, and the /events stream polls that same ETag. The
-- notify triggers and their function are therefore unused - drop them.
DROP TRIGGER IF EXISTS feature_flags_notify_configuration_changed ON feature_flags;
DROP TRIGGER IF EXISTS segments_notify_configuration_changed ON segments;
DROP FUNCTION IF EXISTS notify_flag_configuration_changed();
