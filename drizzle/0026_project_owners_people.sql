-- People can own projects, not just teams.
--
-- Catalog ownership documents WHO IS RESPONSIBLE, and on a real org chart that
-- answer is frequently a person: the one maintainer of an internal tool, the
-- engineer who owns a migration, the person on point before a team forms
-- around it. Forcing that to be expressed as a single-member team made people
-- create throwaway teams to say something simple, which is how a catalog stops
-- being trusted.
--
-- One row is one owner and names exactly one subject, enforced by a CHECK
-- rather than by convention. The alternative shape - a subject_type/subject_id
-- pair like project_roles uses - was rejected here because it cannot carry
-- foreign keys to both tables, and a catalog of owners that can outlive the
-- people in it is worse than no catalog.

ALTER TABLE project_owners ALTER COLUMN team_id DROP NOT NULL;

-- users.id is text (BetterAuth), not uuid; see src/db/auth-schema.ts.
ALTER TABLE project_owners
  ADD COLUMN user_id text REFERENCES users(id) ON DELETE CASCADE;

-- Exactly one subject per row: never both, never neither.
ALTER TABLE project_owners
  ADD CONSTRAINT project_owners_one_subject
  CHECK ((team_id IS NULL) <> (user_id IS NULL));

-- One row per person per project. Partial, because the pre-existing
-- UNIQUE (project_id, team_id) does the same job for teams and would not
-- constrain user rows at all (their team_id is NULL, and NULLs never collide).
CREATE UNIQUE INDEX project_owners_project_user_idx
  ON project_owners (project_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX project_owners_user_id_idx ON project_owners (user_id);

-- project_owners already has its tenant policy and grants (drizzle/0022);
-- adding a column changes neither, and the tenancy audit is unaffected.
