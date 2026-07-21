-- Flags are universally evaluable. Credential type selects OFREP's dynamic
-- (server) or static (client) evaluation mode; it is not a flag property.
ALTER TABLE feature_flags DROP COLUMN client_exposed;

-- Convert the first-pass flat rules to ordered criteria groups.
UPDATE feature_flags AS flag
SET rules = COALESCE((
  SELECT jsonb_agg(
    (rule - 'conditions' - 'segment') || jsonb_build_object(
      'criteria', jsonb_build_object(
        'operator', 'all',
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('kind', 'attribute') || condition)
          FROM jsonb_array_elements(COALESCE(rule->'conditions', '[]'::jsonb)) AS condition
        ), '[]'::jsonb) || CASE WHEN rule ? 'segment'
          THEN jsonb_build_array(jsonb_build_object('kind', 'segment', 'segment', rule->>'segment'))
          ELSE '[]'::jsonb END
      )
    )
  ) FROM jsonb_array_elements(flag.rules) AS rule
), '[]'::jsonb);

ALTER TABLE segments ADD COLUMN criteria jsonb;
UPDATE segments SET criteria = jsonb_build_object(
  'operator', 'all',
  'items', COALESCE(conditions, '[]'::jsonb)
);
ALTER TABLE segments ALTER COLUMN criteria SET NOT NULL;
ALTER TABLE segments DROP COLUMN conditions;
