-- Realtime OFREP clients need invalidation only; evaluated values are still
-- fetched through the authenticated bulk endpoint with the client's context.
CREATE OR REPLACE FUNCTION notify_flag_configuration_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify(
    'flagon_configuration_changed',
    COALESCE(NEW.organization_id, OLD.organization_id)::text
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER feature_flags_notify_configuration_changed
AFTER INSERT OR UPDATE OR DELETE ON feature_flags
FOR EACH ROW EXECUTE FUNCTION notify_flag_configuration_changed();

CREATE TRIGGER segments_notify_configuration_changed
AFTER INSERT OR UPDATE OR DELETE ON segments
FOR EACH ROW EXECUTE FUNCTION notify_flag_configuration_changed();
