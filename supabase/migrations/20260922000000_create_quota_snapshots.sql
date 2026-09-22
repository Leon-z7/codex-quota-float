begin;

create table if not exists public.quota_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  source_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint quota_snapshots_payload_is_object
    check (jsonb_typeof(payload) = 'object')
);

alter table public.quota_snapshots enable row level security;

revoke all on table public.quota_snapshots from anon, authenticated;
grant select, insert, update on table public.quota_snapshots to authenticated;

drop policy if exists "Users read their own quota snapshot" on public.quota_snapshots;
create policy "Users read their own quota snapshot"
on public.quota_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own quota snapshot" on public.quota_snapshots;
create policy "Users create their own quota snapshot"
on public.quota_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own quota snapshot" on public.quota_snapshots;
create policy "Users update their own quota snapshot"
on public.quota_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

comment on table public.quota_snapshots is
  'Latest Codex quota snapshot per authenticated user. No ChatGPT credentials or conversation content.';

commit;

