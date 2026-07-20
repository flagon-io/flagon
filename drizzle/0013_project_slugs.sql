-- Projects identify by "slug", matching the organization naming (one word
-- for one concept: the lowercase-hyphen identifier that appears in URLs and
-- the API). Renames the column and the unique constraint from 0000.

ALTER TABLE projects RENAME COLUMN key TO slug;
ALTER TABLE projects RENAME CONSTRAINT projects_organization_id_key_key
  TO projects_organization_id_slug_key;
