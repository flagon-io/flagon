-- Drop the entities feature (entities + entity_attributes).
--
-- Entities were only ever a lightweight attribute-name dictionary that fed
-- targeting-rule autocomplete; the richer model (typed attributes, enum labels)
-- was never wired into the condition builder or evaluation, so the feature is
-- being removed until it can be built properly. No customer has entity data.
--
-- Safe: nothing references these tables by FK (entity_attributes -> entities is
-- the only relationship, dropped here), and evaluation never consulted them (the
-- OFREP engine matches raw context attributes an SDK sends). DROP removes the
-- tables' RLS policies and grants with them.
DROP TABLE IF EXISTS "entity_attributes";
DROP TABLE IF EXISTS "entities";
