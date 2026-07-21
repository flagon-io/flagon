-- Variants are a VALUE plus an optional human label; the key is machinery.
--
-- The console used to ask for a variant key next to its value, so the meaning
-- of a variant often lived in the key: "control" for the value "blue". The
-- create form no longer asks (it derives the key from the value and freezes
-- it), and nothing in the UI renders a variant key any more - `variantLabel`
-- shows the label, falling back to the raw value.
--
-- For flags created under the old form that is a silent LOSS of information:
-- a variant a person deliberately called "control" would start rendering as
-- "blue", and the word they chose would exist only in the OFREP payload. This
-- copies that word into `label`, where the new UI reads it.
--
-- Only for variants whose key SAYS SOMETHING the value does not. A key that is
-- just the derived slug of its own value ("blue" for "blue"), or that slug
-- with the collision suffix `deriveVariantKey` appends ("blue-2"), carries no
-- information, and labelling it would put the same word on screen twice.
--
-- Scope is string/integer/float. Boolean keys are on/off, which variantLabel
-- already renders as On/Off, and JSON variants have no readable value so
-- variantLabel still falls back to their key - neither loses anything.

WITH exploded AS (
  SELECT
    f.id,
    v.ord,
    v.variant,
    v.variant ->> 'key' AS variant_key,
    -- suggestFlagKey() in SQL: lowercase, non-key characters to hyphens, drop
    -- a leading non-letter run, drop trailing hyphens. Kept deliberately close
    -- to src/lib/flags.ts so "Dark Blue" derives to dark-blue here too.
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(v.variant ->> 'value', '')), '[^a-z0-9._-]+', '-', 'g'),
        '^[^a-z]+', ''
      ),
      '-+$', ''
    ) AS derived
  FROM feature_flags f
  CROSS JOIN LATERAL jsonb_array_elements(f.variants) WITH ORDINALITY AS v(variant, ord)
  WHERE f.type IN ('string', 'integer', 'float')
),
relabelled AS (
  SELECT
    id,
    jsonb_agg(
      CASE
        WHEN jsonb_exists(variant, 'label')
             AND btrim(coalesce(variant ->> 'label', '')) <> ''
          THEN variant
        WHEN variant_key = derived
          THEN variant
        -- The collision suffix: "blue-2" against a derived "blue".
        WHEN derived <> ''
             AND left(variant_key, length(derived)) = derived
             AND substring(variant_key from length(derived) + 1) ~ '^-[0-9]+$'
          THEN variant
        -- Keys nobody chose. `deriveVariantKey` falls back to "variant" when a
        -- value slugifies to nothing (a hex colour, "!!!"), the old create form
        -- seeded "default" for number and JSON flags, and the definition editor
        -- names new rows "value-2". Copying those onto the screen as a label
        -- would be the migration inventing a name, which is worse than the
        -- value standing on its own.
        WHEN variant_key ~ '^(variant|value|default)(-[0-9]+)?$'
          THEN variant
        ELSE variant || jsonb_build_object('label', variant_key)
      END
      ORDER BY ord
    ) AS variants
  FROM exploded
  GROUP BY id
)
UPDATE feature_flags f
SET variants = r.variants,
    -- The row is only touched when something actually changed, so updated_at
    -- stays honest for every flag this migration decides to leave alone.
    updated_at = now()
FROM relabelled r
WHERE f.id = r.id
  AND f.variants IS DISTINCT FROM r.variants;
