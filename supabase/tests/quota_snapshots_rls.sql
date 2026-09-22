begin;

select plan(7);

select has_table('public', 'quota_snapshots', 'quota_snapshots table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.quota_snapshots'::regclass),
  'row level security is enabled'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'quota_snapshots'),
  3,
  'exactly three RLS policies exist'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'quota_snapshots'
      and grantee = 'anon'
  ),
  'anonymous role has no table privileges'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'quota_snapshots'
      and roles <> array['authenticated']::name[]
  ),
  'all policies target authenticated users only'
);

select ok(
  (select qual like '%auth.uid%' from pg_policies
   where schemaname = 'public' and tablename = 'quota_snapshots' and cmd = 'SELECT'),
  'select policy checks auth.uid'
);

select ok(
  (select qual like '%auth.uid%' and with_check like '%auth.uid%'
   from pg_policies
   where schemaname = 'public' and tablename = 'quota_snapshots' and cmd = 'UPDATE'),
  'update policy checks ownership before and after'
);

select * from finish();
rollback;

