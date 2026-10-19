-- Existing jobs predate the ingestion-side description fingerprint. Backfill
-- it so scans can detect changed descriptions without transferring every
-- description on each pass. MD5 is used only as a non-security change token.

update public.jobs
set content_hash = md5(coalesce(description, ''))
where content_hash is null;
