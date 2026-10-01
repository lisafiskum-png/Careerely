-- Searches page (Phase D5): a search's optional minimum compensation carries
-- its own currency (decision 2026-10-01). Previously the engine only applied a
-- search minimum when the Career Profile had a currency, which Step 3 never
-- collects, so a minimum typed on a search would have been silently ignored.
--   * amount and currency are set together, or both left empty;
--   * the amount is annual compensation in that currency (ISO 4217 code);
--   * blank on the search = the Career Profile's minimum, only if the profile
--     has both an amount and a currency; otherwise no minimum.

alter table public.searches add column if not exists compensation_currency text;

-- Existing rows keep their current engine behaviour: a search minimum was
-- applied in the profile's currency when the profile had one (copy it), and
-- had no effect without one (clear it).
update public.searches s
set compensation_currency = cp.compensation_currency
from public.career_profiles cp
where cp.user_id = s.user_id
  and s.min_compensation is not null
  and s.compensation_currency is null
  and cp.compensation_currency ~ '^[A-Z]{3}$';

update public.searches
set min_compensation = null
where min_compensation is not null and compensation_currency is null;

alter table public.searches drop constraint if exists searches_compensation_currency_format;
alter table public.searches add constraint searches_compensation_currency_format
  check (compensation_currency is null or compensation_currency ~ '^[A-Z]{3}$');

alter table public.searches drop constraint if exists searches_compensation_pair;
alter table public.searches add constraint searches_compensation_pair
  check ((min_compensation is null) = (compensation_currency is null));

grant insert (compensation_currency) on public.searches to authenticated;
grant update (compensation_currency) on public.searches to authenticated;
