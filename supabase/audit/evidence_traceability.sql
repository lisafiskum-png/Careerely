-- Evidence traceability audit (read-only).
--
-- Re-checks every stored evidence record against the source it claims to
-- quote, using the same rules as the engine's validator
-- (lib/engine/text.ts containsQuote, lib/engine/verify.ts):
--
--   * Sources are rebuilt exactly as the engine builds them:
--       resume_text      raw resume text + every line of the reviewed,
--                        structured resume (lib/engine/context.ts flattenResume),
--                        e.g. "Skills: AML, KYC" and "Title - Company (2021-present)"
--       job_description  the job document: "Title: ...", "Company: ...",
--                        "Location: ...", "Salary: min-max CUR" and the description
--       user_preference  the search preferences text
--       agent_inference  resume or job document
--   * Normalisation: NFKC (ligatures, no-break spaces), lower case, curly
--     quotes -> straight, dashes -> "-", bullets -> space, whitespace collapsed;
--     wrapping quotation marks, ellipses and end punctuation are ignored.
--   * The quote must start and end on word boundaries ("Excel" is not found in
--     "excellent") and lie within one segment: one line of the job document or
--     preferences, one field of the structured resume, or one paragraph/bullet
--     of the raw resume text.
--
-- Columns:
--   traceable        passes the current validator against the current sources
--   passed_old_rules passes the validator as it was before 2026-10-01
--                    (plain substring of the whole source)
--   verdict          traceable
--                    | weak_match       old validator accepted a sub-word or
--                                       cross-line match; current one rejects it
--                    | not_in_source    not in the source as it is now: fabricated,
--                                       or the source changed after evaluation
--
-- Safe to run in the Supabase SQL editor: it only reads, and its helper
-- functions are temporary (pg_temp), gone when the session ends.
--
-- This file is plain ASCII on purpose: non-ASCII characters are written as
-- U&'\XXXX' strings or \uXXXX regex escapes. Editors can silently drop
-- characters such as U+2029 when pasting, which once made every row of an
-- earlier version of this audit look untraceable. A self-test below stops
-- the audit if the rules have been altered.

create or replace function pg_temp.nfm(t text) returns text language sql immutable as $$
  select btrim(regexp_replace(
    translate(lower(normalize(coalesce(t, ''), nfkc)),
      U&'\2018\2019\201A\2032\201C\201D\201E\2033\2010\2011\2012\2013\2014\2015\2212\2022\00B7\25AA\25CF\25E6',
      $r$''''""""-------     $r$),
    '[[:space:]\u1680\u2028\u2029\ufeff]+', ' ', 'g'))
$$;

create or replace function pg_temp.nq(t text) returns text language sql immutable as $$
  select regexp_replace(pg_temp.nfm(t), '^[ "''.\u2026-]+|[ "''.\u2026-]+$', '', 'g')
$$;

-- Current rule: word-bounded match inside one segment.
create or replace function pg_temp.found(segments text[], quote text) returns boolean language sql immutable as $$
  select case when length(q) < 3 then false else exists (
    select 1
    from unnest(segments) s, regexp_split_to_table(s, '\n[ \t\r\f\v]*\n|\u2029|[\u2022\u25aa\u25cf\u25e6]') seg
    where pg_temp.nfm(seg) ~ (
      case when q ~ '^[[:alnum:]]' then '(^|[^[:alnum:]])' else '' end
      || regexp_replace(q, '([^[:alnum:] ])', '\\\1', 'g')
      || case when q ~ '[[:alnum:]]$' then '($|[^[:alnum:]])' else '' end)
  ) end
  from (select pg_temp.nq(quote) as q) x
$$;

-- Old rule: plain substring of the whole normalised source.
create or replace function pg_temp.found_old(source text, quote text) returns boolean language sql immutable as $$
  select length(q) >= 3 and strpos(pg_temp.nfm(source), q) > 0
  from (select pg_temp.nq(quote) as q) x
$$;

-- Self-test: stops here if the matching rules don't behave as in the engine,
-- e.g. because an editor altered this file when it was pasted.
do $$ begin
  if not (
    pg_temp.found(array['Target roles: Business Development Manager; Account Executive'], 'Business Development Manager')
    and pg_temp.found(array[U&'\2022 Led due diligence on complex crypto cases'], U&'\201CLed due diligence on complex crypto cases.\201D')
    and pg_temp.found(array[U&'Certi\FB01ed AML specialist for Nordic Bank\2019s largest\00A0clients'], 'Nordic Bank''s largest clients')
    and pg_temp.found(array[U&'Certi\FB01ed AML specialist'], 'Certified AML specialist')
    and pg_temp.found(array[U&'AML Analyst \2014 Nordic Bank (2021\2013present)'], 'AML Analyst - Nordic Bank (2021-present)')
    and pg_temp.found(array[E'Worked with sales on onboarding\nenterprise clients'], 'onboarding enterprise clients')
    and not pg_temp.found(array['Excellent stakeholder skills'], 'Excel')
    and not pg_temp.found(array[E'crypto cases\n' || U&'\2022 Worked with sales'], 'crypto cases Worked with sales')
    and not pg_temp.found(array[U&'Skills: AML, KYC\2029Languages: English'], 'KYC Languages')
  ) then
    raise exception 'Evidence audit self-test failed: this file was altered (e.g. by the SQL editor). Run it unmodified.';
  end if;
end $$;

-- Lines of the structured resume, in order (lib/engine/context.ts flattenResume).
create or replace function pg_temp.resume_lines(d jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(line order by s, i, j), '{}')
  from (
    select 0 s, v.i, 0 j, v.line
    from unnest(array[d->>'full_name', d->>'headline', d->>'location', d->>'summary']) with ordinality v(line, i)
    union all
    select 1, e.i, 0,
      (e.x->>'title') || U&' \2014 ' || (e.x->>'company')
      || case when coalesce(e.x->>'location', '') <> '' then ', ' || (e.x->>'location') else '' end
      || ' (' || (e.x->>'start') || U&'\2013' || case when (e.x->>'current')::boolean then 'present' else e.x->>'end' end || ')'
    from jsonb_array_elements(coalesce(d->'experience', '[]')) with ordinality e(x, i)
    union all
    select 1, e.i, h.j, U&'\2022 ' || h.h
    from jsonb_array_elements(coalesce(d->'experience', '[]')) with ordinality e(x, i),
         jsonb_array_elements_text(coalesce(e.x->'highlights', '[]')) with ordinality h(h, j)
    union all
    select 2, e.i, 0,
      (e.x->>'degree') || ' ' || (e.x->>'field') || ', ' || (e.x->>'institution') || ' (' || (e.x->>'start') || U&'\2013' || (e.x->>'end') || ')'
    from jsonb_array_elements(coalesce(d->'education', '[]')) with ordinality e(x, i)
    union all
    select 3, k.i, 0, k.label || ': ' || (select string_agg(v, ', ' order by n) from jsonb_array_elements_text(d->k.field) with ordinality a(v, n))
    from (values (1, 'Skills', 'skills'), (2, 'Languages', 'languages'), (3, 'Certifications', 'certifications')) k(i, label, field)
    where jsonb_array_length(coalesce(d->k.field, '[]')) > 0
  ) l
  where line is not null and btrim(line) <> ''
$$;

with src as (
  select
    e.id, e.opportunity_id, e.created_at, e.signal_type, e.source_type, e.outcome, e.source_text,
    j.title as job_title, j.company,
    -- resume: raw text + structured lines
    array[coalesce(c.resume_text, '')] || pg_temp.resume_lines(c.resume_data) as resume_segments,
    coalesce(c.resume_text, '') || E'\n\n' || array_to_string(pg_temp.resume_lines(c.resume_data), E'\n') as resume_old,
    -- job document (lib/engine/context.ts jobDocument)
    concat_ws(E'\n',
      'Title: ' || j.title,
      case when j.company is not null and j.company <> '' then 'Company: ' || j.company end,
      case when j.location is not null and j.location <> '' then 'Location: ' || j.location end,
      case when j.salary_min is not null or j.salary_max is not null then
        btrim('Salary: ' || coalesce(j.salary_min::text, '') || U&'\2013' || coalesce(j.salary_max::text, '') || ' ' || coalesce(j.salary_currency, '')) end
    ) || E'\n\n' || coalesce(j.description, '') as job_doc,
    -- preferences (lib/engine/context.ts preferencesText)
    concat_ws(E'\n',
      'Target roles: ' || array_to_string(s.target_roles, '; '),
      'Target industries: ' || coalesce(nullif(array_to_string(s.industries, '; '), ''), 'not specified'),
      'Work styles: ' || coalesce(nullif(array_to_string(array(
        select case w::text when 'remote' then 'Remote' when 'hybrid' then 'Hybrid' else 'On-site' end
        from unnest(s.work_styles) w), '; '), ''), 'not specified'),
      'Preferred locations: ' || coalesce(nullif(array_to_string(s.locations, '; '), ''), 'open to any location'),
      case when coalesce(s.min_compensation, c.min_compensation) > 0 and coalesce(c.compensation_currency, '') <> ''
        then 'Minimum compensation: ' || coalesce(s.min_compensation, c.min_compensation) || ' ' || c.compensation_currency end
    ) as prefs
  from public.evidence e
  join public.jobs j on j.id = e.job_id
  join public.opportunities o on o.id = e.opportunity_id
  left join public.searches s on s.id = o.search_id
  left join public.career_profiles c on c.user_id = e.user_id
  -- To audit one user, uncomment:
  -- where e.user_id = (select id from auth.users where email = 'you@example.com')
),
checked as (
  select src.*,
    case source_type
      when 'resume_text' then pg_temp.found(resume_segments, source_text)
      when 'job_description' then pg_temp.found(string_to_array(job_doc, E'\n'), source_text)
      when 'user_preference' then pg_temp.found(string_to_array(prefs, E'\n'), source_text)
      else pg_temp.found(resume_segments || string_to_array(job_doc, E'\n'), source_text)
    end as traceable,
    case source_type
      when 'resume_text' then pg_temp.found_old(resume_old, source_text)
      when 'job_description' then pg_temp.found_old(job_doc, source_text)
      when 'user_preference' then pg_temp.found_old(prefs, source_text)
      else pg_temp.found_old(resume_old, source_text) or pg_temp.found_old(job_doc, source_text)
    end as passed_old_rules
  from src
)
select
  case when traceable then 'traceable' when passed_old_rules then 'weak_match' else 'not_in_source' end as verdict,
  outcome, source_type, signal_type, source_text, job_title, company, id as evidence_id, opportunity_id, created_at
from checked
order by (traceable) asc, (passed_old_rules) asc, outcome, source_type;

-- Summary: replace the final select above with
--   select case when traceable then 'traceable' when passed_old_rules then 'weak_match' else 'not_in_source' end as verdict,
--          outcome, source_type, count(*)
--   from checked group by 1, 2, 3 order by 1, 2, 3;
