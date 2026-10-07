-- Automated access-rule tests. Fails (non-zero exit) on the first broken guarantee.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(uid text, aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, false) $$;
create or replace function pg_temp.must_fail(q text, why text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then return; end;
  raise exception 'SECURITY TEST FAILED: % (statement succeeded: %)', why, q;
end $$;
create or replace function pg_temp.must_fail_with(q text, msg text, why text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm <> msg then raise exception 'TEST FAILED: % (wrong error: %)', why, sqlerrm; end if;
    return;
  end;
  raise exception 'TEST FAILED: % (statement succeeded: %)', why, q;
end $$;
create or replace function pg_temp.affected(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
create or replace function pg_temp.must_equal(got bigint, want bigint, why text) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'TEST FAILED: % (got %, want %)', why, got, want; end if; end $$;
create or replace function pg_temp.must_true(got boolean, why text) returns void language plpgsql as $$
begin if got is not true then raise exception 'TEST FAILED: %', why; end if; end $$;

insert into storage.buckets (id, name, public) values ('wedding-files', 'wedding-files', false) on conflict do nothing;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x.io'),('22222222-2222-2222-2222-222222222222','b@x.io'),('33333333-3333-3333-3333-333333333333','eve@x.io');
select pg_temp.must_equal((select count(*) from public.profiles), 3, 'profile created per user');

set role authenticated;
-- ---------------------------------------------------------------- owner A
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select public.create_wedding('Alice','Bob','2028-05-20',100,'chf','{"vat":10}') as wid \gset
select public.create_partner_invite(:'wid') as code \gset
select pg_temp.must_fail($q$insert into public.weddings (partner1_name) values ('x')$q$, 'weddings only via create_wedding');
select pg_temp.must_fail(format($q$update public.weddings set premium = true where id = %L$q$, :'wid'), 'client cannot unlock premium');
select pg_temp.must_fail(format($q$update public.weddings set created_by = null where id = %L$q$, :'wid'), 'client cannot change authorship');
select pg_temp.must_equal(pg_temp.affected(format($q$update public.weddings set partner2_name = 'Ben', settings = '{"vat":7}' where id = %L$q$, :'wid')), 1, 'members edit wedding settings');
select pg_temp.must_equal((select count(*) from public.wedding_invites where code_hash = replace(:'code','-','')), 0, 'invite code stored only as hash');
select pg_temp.must_fail(format($q$insert into public.wedding_members values (%L, '33333333-3333-3333-3333-333333333333', 'owner')$q$, :'wid'), 'members cannot add people directly');

select pg_temp.must_true((select ok from public.put_entity(:'wid','guest','g1','{"fn":"Sam","plusOn":true,"kids":0}',null)), 'create guest');
select pg_temp.must_true((select ok from public.put_entity(:'wid','guest','g1','{"fn":"Sam B","plusOn":true,"kids":0}',1)), 'update with matching revision');
select pg_temp.must_true((select not ok and data->>'fn' = 'Sam B' from public.put_entity(:'wid','guest','g1','{"fn":"stale"}',1)), 'stale revision rejected and server version returned');
select pg_temp.must_fail(format($q$select public.put_entity(%L,'guest','../x','{}',null)$q$, :'wid'), 'item ids are validated');
select pg_temp.must_fail(format($q$select public.put_entity(%L,'secret','x','{}',null)$q$, :'wid'), 'unknown item kinds rejected');
select pg_temp.must_fail(format($q$select public.put_entity(%L,'guest','big',jsonb_build_object('x', repeat('a', 300000)),null)$q$, :'wid'), 'oversized items rejected');
select pg_temp.must_equal(pg_temp.affected('delete from public.entities'), 0, 'items cannot be hard-deleted by clients');

-- ---------------------------------------------------------------- stranger E
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.must_equal((select count(*) from public.weddings) + (select count(*) from public.entities) + (select count(*) from public.wedding_invites) + (select count(*) from public.wedding_members), 0, 'stranger sees nothing');
select pg_temp.must_fail(format($q$select public.put_entity(%L,'guest','x','{"fn":"x"}',null)$q$, :'wid'), 'stranger cannot create items');
select pg_temp.must_fail(format($q$select public.put_entity(%L,'guest','g1','{"fn":"pwned"}',2)$q$, :'wid'), 'stranger cannot overwrite items');
select pg_temp.must_fail(format($q$select data from public.put_entity(%L,'guest','g1','{}',99)$q$, :'wid'), 'stranger cannot read items through conflicts');
select pg_temp.must_equal(pg_temp.affected($q$update public.entities set data='{"fn":"pwned"}'$q$), 0, 'stranger cannot update');
select pg_temp.must_fail($q$select public.accept_partner_invite('AAAAA-BBBBB')$q$, 'wrong invite code rejected');
select pg_temp.must_fail(format($q$select public.create_partner_invite(%L)$q$, :'wid'), 'stranger cannot create invites');
select pg_temp.must_fail(format($q$insert into storage.objects (bucket_id,name) values ('wedding-files', %L)$q$, :'wid' || '/vp/x1.jpg'), 'stranger cannot upload files');

-- ---------------------------------------------------------------- partner B
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select public.accept_partner_invite(lower(:'code')) as joined \gset
select pg_temp.must_equal((select count(*) from public.weddings where id = :'joined'), 1, 'partner joins with code');
select pg_temp.must_equal((select count(*) from public.entities), 1, 'partner sees items');
select pg_temp.must_fail(format($q$select public.accept_partner_invite(%L)$q$, :'code'), 'invite code single use');
select public.create_wedding('Bob','X',null,null,'EUR') as wid2 \gset

-- free tier: 30 people (guest + companion + children) and 2 venues
select pg_temp.must_true((select ok from public.put_entity(:'wid','guest','g2','{"fn":"Big","plusOn":true,"kids":20}',null)), 'guest with family');
select pg_temp.must_true((select ok from public.put_entity(:'wid','guest','g3','{"fn":"C","kids":5}',null)), 'fills up to 30 people');
select pg_temp.must_fail_with(format($q$select public.put_entity(%L,'guest','g4','{"fn":"31st"}',null)$q$, :'wid'), 'FREE_LIMIT_GUESTS', 'free tier capped at 30 people');
select pg_temp.must_fail_with(format($q$select public.put_entity(%L,'guest','g3','{"fn":"C","kids":6}',1)$q$, :'wid'), 'FREE_LIMIT_GUESTS', 'adding children above the limit blocked');
select pg_temp.must_true((select ok from public.put_entity(:'wid','guest','g3','{"fn":"C renamed","kids":5}',1)), 'editing at the limit works');
select pg_temp.must_true((select ok and deleted from public.put_entity(:'wid','guest','g3','{"fn":"C"}',2,true)), 'guest deleted');
select pg_temp.must_equal((select count(*) from public.entities where id = 'g3' and data = '{}'::jsonb), 1, 'deleting wipes personal data');
select pg_temp.must_true((select ok from public.put_entity(:'wid','guest','g4','{"fn":"New"}',null)), 'space freed after deleting');
select pg_temp.must_true((select ok from public.put_entity(:'wid','loc','l1','{"name":"A"}',null)), 'venue 1');
select pg_temp.must_true((select ok from public.put_entity(:'wid','loc','l2','{"name":"B"}',null)), 'venue 2');
select pg_temp.must_fail_with(format($q$select public.put_entity(%L,'loc','l3','{"name":"C"}',null)$q$, :'wid'), 'FREE_LIMIT_VENUES', 'free tier capped at 2 venues');

-- files
insert into storage.objects (bucket_id, name) values ('wedding-files', :'wid' || '/vp/photo1.jpg');
select pg_temp.must_fail(format($q$insert into storage.objects (bucket_id,name) values ('wedding-files', %L)$q$, :'wid' || '/../x.jpg'), 'file paths are validated');
select pg_temp.must_fail(format($q$insert into storage.objects (bucket_id,name) values ('wedding-files', %L)$q$, :'wid' || '/vp/x.exe'), 'file types are validated');
insert into storage.objects (bucket_id, name) select 'wedding-files', :'wid' || '/pf/f' || i || '.pdf' from generate_series(1, 39) i;
select pg_temp.must_fail(format($q$insert into storage.objects (bucket_id,name) values ('wedding-files', %L)$q$, :'wid' || '/pf/f41.pdf'), 'free tier capped at 40 files');
select pg_temp.must_equal((select count(*) from storage.objects), 40, 'members see their files');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.must_equal((select count(*) from storage.objects), 0, 'stranger sees no files');
select pg_temp.must_equal(pg_temp.affected('delete from storage.objects'), 0, 'stranger cannot delete files');

-- ---------------------------------------------------------------- two-factor accounts
reset role;
insert into auth.mfa_factors (user_id, status) values ('11111111-1111-1111-1111-111111111111', 'verified');
set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'aal1');
select pg_temp.must_equal((select count(*) from public.entities) + (select count(*) from public.weddings) + (select count(*) from storage.objects), 0, 'without second factor no data access');
select pg_temp.must_fail(format($q$select public.put_entity(%L,'task','t1','{}',null)$q$, :'wid'), 'without second factor no writes');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'aal2');
select pg_temp.must_true((select count(*) from public.entities) > 0, 'with second factor data is accessible');

-- ---------------------------------------------------------------- anonymous
reset role; set role anon;
select pg_temp.must_fail('select * from public.entities', 'anonymous has no table access');
select pg_temp.must_fail($q$select public.create_wedding('a','b',null,null,'EUR')$q$, 'anonymous cannot call functions');

-- ---------------------------------------------------------------- account deletion
reset role; set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.must_equal((select count(*) from public.prepare_account_deletion() d where d = :'wid2'), 1, 'solo wedding deleted and reported for file cleanup');
reset role;
select pg_temp.must_equal((select count(*) from public.weddings where id = :'wid'), 1, 'shared wedding survives');
select pg_temp.must_equal((select count(*) from public.weddings where id = :'wid2'), 0, 'solo wedding removed');
select pg_temp.must_equal((select count(*) from public.wedding_members where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'membership removed');

select 'ALL SECURITY TESTS PASSED';
