-- The project's icon/logo (a URL, typically an uploaded asset's public URL). A
-- favicon-style icon shown in the catalog in place of the generated monogram.
-- projects is an existing tenant table, so its RLS policy already covers this new
-- column; no new policy needed.
ALTER TABLE "projects" ADD COLUMN "image" text;
