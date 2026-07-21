-- Projects describe themselves, instead of the README doing it for them.
--
-- The About rail was deriving its summary from the first paragraph of
-- overview_markdown. That reads fine when a README opens with a sentence about
-- the project, and badly the rest of the time: the first paragraph is often a
-- warning, a status badge, or a table of contents, and a project with no
-- README had no summary at all. A description is also a different kind of
-- writing from a README - one line, for someone scanning a list - so asking
-- for it once is not asking for the README twice.
--
-- Website and topics come along because they answer the same question ("what
-- is this and where does it live?") and are the two other things a person
-- reaches for the moment a project list gets long enough to need scanning.
--
-- Text, not null, defaulting to empty: the console distinguishes "no website"
-- from "" nowhere, and a nullable text column would make every reader handle
-- both. Topics is a text[] rather than its own table because a topic has no
-- attributes, no lifecycle, and no meaning outside the project that carries it
-- - the day one of those stops being true it earns a table.
--
-- No new GRANT: 0000 granted SELECT/INSERT/UPDATE/DELETE on `projects` at the
-- TABLE level, which covers columns added later, and the tenant policy on the
-- table already governs every row these columns live on.

ALTER TABLE projects
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN website text NOT NULL DEFAULT '',
  ADD COLUMN topics text[] NOT NULL DEFAULT '{}';

-- Cheap guardrails at the storage layer, matching src/lib/projects.ts. The
-- application validates first and reports a usable message; these exist so a
-- direct write (a script, a future service) cannot leave a row the console
-- would have to defend itself against.
ALTER TABLE projects
  ADD CONSTRAINT projects_description_length CHECK (length(description) <= 350),
  ADD CONSTRAINT projects_website_length CHECK (length(website) <= 255),
  -- A CHECK cannot contain a subquery, so the per-topic rule is expressed by
  -- joining the array on spaces (a character no valid topic contains) and
  -- matching the whole thing at once: up to 20 topics, each starting
  -- alphanumeric and at most 35 characters of [a-z0-9-]. An empty array joins
  -- to '' and is matched by the optional group.
  ADD CONSTRAINT projects_topics_bounds CHECK (
    cardinality(topics) <= 20
    AND array_to_string(topics, ' ') ~ '^([a-z0-9][a-z0-9-]{0,34}( [a-z0-9][a-z0-9-]{0,34})*)?$'
    -- Joining on a space is what makes the rule above readable, and also its
    -- one blind spot: {"two words"} joins to the same string as {two,words}
    -- and would pass. Concatenating with no delimiter catches it.
    AND array_to_string(topics, '') !~ '\s'
  );
