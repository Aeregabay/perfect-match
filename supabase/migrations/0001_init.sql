-- Perfect Match – core schema
-- Principles:
--   * Every record belongs to exactly one wedding; access is decided by membership (RLS on every table).
--   * Accounts with two-factor authentication only get data access with a second-factor session (aal2).
--   * Privileged steps run in SECURITY DEFINER functions with an empty search_path.
--   * Secrets (invite codes) are stored only as SHA-256 hashes.
--   * Free-tier limits and premium status are enforced in the database, not only in the app.
--   * Planner data is stored per item (venue, guest, task, …) with a revision number, so two partners can
--     edit at the same time; the app merges concurrent edits field by field.

create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum ('owner', 'editor');

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------- second factor
-- True when the session satisfies the user's own security level:
-- users without a verified second factor pass with a password/OAuth session, users with one need aal2.
create or replace function public.aal_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- weddings
create table public.weddings (
  id             uuid primary key default gen_random_uuid(),
  partner1_name  text not null default '' check (char_length(partner1_name) <= 80),
  partner2_name  text not null default '' check (char_length(partner2_name) <= 80),
  wedding_date   date,
  guest_capacity integer check (guest_capacity between 1 and 5000),
  currency       char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- Planner settings: event days, preferred months, accommodation and menu options, default VAT, website link.
  settings       jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 65536),
  premium        boolean not null default false,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger weddings_touch before update on public.weddings
  for each row execute function public.touch_updated_at();

create table public.wedding_members (
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.member_role not null default 'editor',
  joined_at  timestamptz not null default now(),
  primary key (wedding_id, user_id)
);
create index wedding_members_user_idx on public.wedding_members (user_id);

-- Membership checks used by every policy. SECURITY DEFINER avoids recursive RLS on wedding_members.
create or replace function public.is_member(w uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.aal_ok() and exists (select 1 from public.wedding_members m where m.wedding_id = w and m.user_id = auth.uid())
$$;
create or replace function public.is_owner(w uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.aal_ok() and exists (select 1 from public.wedding_members m where m.wedding_id = w and m.user_id = auth.uid() and m.role = 'owner')
$$;

-- Premium and authorship may only be changed by the backend (purchase verification), never by a client.
create or replace function public.guard_wedding() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and
     (new.premium is distinct from old.premium or new.created_by is distinct from old.created_by or new.id <> old.id) then
    raise exception 'field can only be changed by the backend' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger weddings_guard before update on public.weddings
  for each row execute function public.guard_wedding();

-- ---------------------------------------------------------------- partner invites
create table public.wedding_invites (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  code_hash   text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  used_by     uuid references auth.users (id) on delete set null,
  used_at     timestamptz
);

-- ---------------------------------------------------------------- planner items
-- kind: loc = venue (incl. checklist answers, planning, photo references), guest, task, agenda = schedule item,
--       table = seating table, cfg = shared configuration (custom questions, planning services).
-- Deleting an item wipes its data immediately and keeps an empty tombstone so other devices learn about it.
create table public.entities (
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  kind       text not null check (kind in ('loc', 'guest', 'task', 'agenda', 'table', 'cfg')),
  id         text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data       jsonb not null default '{}'::jsonb
             check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 262144),
  rev        bigint not null default 1,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (wedding_id, kind, id),
  check (not deleted or data = '{}'::jsonb)
);
create index entities_changes_idx on public.entities (wedding_id, updated_at);

create or replace function public.stamp_entity() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.deleted then new.data := '{}'::jsonb; end if;
  return new;
end $$;
create trigger entities_stamp before insert or update on public.entities
  for each row execute function public.stamp_entity();

-- People in one guest entry: the guest, an optional companion and children.
create or replace function public.guest_heads(d jsonb) returns integer
language sql immutable set search_path = '' as $$
  select 1
    + case when d -> 'plusOn' = 'true'::jsonb then 1 else 0 end
    + case
        when jsonb_typeof(d -> 'kids') = 'number' then least(greatest(floor((d ->> 'kids')::numeric), 0), 20)::integer
        when jsonb_typeof(d -> 'kids') = 'string' and d ->> 'kids' ~ '^\d{1,2}$' then least((d ->> 'kids')::integer, 20)
        else 0
      end
$$;

-- Free tier: 30 people and 2 venues per wedding; at most 5000 items per wedding in any case.
create or replace function public.enforce_entity_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare prem boolean; others integer; n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.wedding_id::text, 0));
  if tg_op = 'INSERT' and (select count(*) from public.entities e where e.wedding_id = new.wedding_id) >= 5000 then
    raise exception 'ITEM_LIMIT' using errcode = 'P0001';
  end if;
  if new.deleted or new.kind not in ('guest', 'loc') then return new; end if;
  select w.premium into prem from public.weddings w where w.id = new.wedding_id;
  if coalesce(prem, false) then return new; end if;

  if new.kind = 'guest' then
    -- Edits that do not add people are always allowed, so nobody gets stuck above the limit.
    if tg_op = 'UPDATE' and not old.deleted and public.guest_heads(new.data) <= public.guest_heads(old.data) then return new; end if;
    select coalesce(sum(public.guest_heads(e.data)), 0) into others from public.entities e
      where e.wedding_id = new.wedding_id and e.kind = 'guest' and not e.deleted and e.id <> new.id;
    if others + public.guest_heads(new.data) > 30 then
      raise exception 'FREE_LIMIT_GUESTS' using errcode = 'P0001', hint = 'The free version includes up to 30 guests.';
    end if;
  else
    if tg_op = 'UPDATE' and not old.deleted then return new; end if;
    select count(*) into n from public.entities e
      where e.wedding_id = new.wedding_id and e.kind = 'loc' and not e.deleted and e.id <> new.id;
    if n >= 2 then
      raise exception 'FREE_LIMIT_VENUES' using errcode = 'P0001', hint = 'The free version includes up to 2 venues.';
    end if;
  end if;
  return new;
end $$;
create trigger entities_limits before insert or update on public.entities
  for each row execute function public.enforce_entity_limits();

-- Optimistic write: succeeds when p_base matches the stored revision (or the item is new).
-- On a mismatch nothing is written and the current server version is returned for merging.
create or replace function public.put_entity(p_wedding uuid, p_kind text, p_id text, p_data jsonb, p_base bigint, p_deleted boolean default false)
returns table (rev bigint, ok boolean, data jsonb, deleted boolean)
language plpgsql set search_path = '' as $$
declare r public.entities;
begin
  if p_deleted then p_data := '{}'::jsonb; end if;
  if p_base is null then
    insert into public.entities as e (wedding_id, kind, id, data, deleted)
      values (p_wedding, p_kind, p_id, coalesce(p_data, '{}'::jsonb), coalesce(p_deleted, false))
      on conflict on constraint entities_pkey do nothing
      returning e.* into r;
  else
    update public.entities as e set data = coalesce(p_data, '{}'::jsonb), deleted = coalesce(p_deleted, false), rev = e.rev + 1
      where e.wedding_id = p_wedding and e.kind = p_kind and e.id = p_id and e.rev = p_base
      returning e.* into r;
  end if;
  if r.wedding_id is not null then
    return query select r.rev, true, null::jsonb, r.deleted;
    return;
  end if;
  select e.* into r from public.entities e where e.wedding_id = p_wedding and e.kind = p_kind and e.id = p_id;
  if r.wedding_id is null then
    if not public.is_member(p_wedding) then raise exception 'not allowed' using errcode = '42501'; end if;
    -- The item vanished on the server (wedding reset); write it as new.
    insert into public.entities as e (wedding_id, kind, id, data, deleted)
      values (p_wedding, p_kind, p_id, coalesce(p_data, '{}'::jsonb), coalesce(p_deleted, false))
      returning e.* into r;
    return query select r.rev, true, null::jsonb, r.deleted;
    return;
  end if;
  return query select r.rev, false, r.data, r.deleted;
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.profiles        enable row level security;
alter table public.weddings        enable row level security;
alter table public.wedding_members enable row level security;
alter table public.wedding_invites enable row level security;
alter table public.entities        enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.wedding_members a join public.wedding_members b using (wedding_id)
    where a.user_id = auth.uid() and b.user_id = profiles.id and public.aal_ok()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy weddings_select on public.weddings for select to authenticated using (public.is_member(id));
create policy weddings_update on public.weddings for update to authenticated using (public.is_member(id)) with check (public.is_member(id));
create policy weddings_delete on public.weddings for delete to authenticated using (public.is_owner(id));

create policy members_select on public.wedding_members for select to authenticated using (public.is_member(wedding_id));
create policy members_delete on public.wedding_members for delete to authenticated
  using ((user_id = auth.uid() and public.aal_ok()) or public.is_owner(wedding_id));

create policy invites_select on public.wedding_invites for select to authenticated using (public.is_member(wedding_id));
create policy invites_delete on public.wedding_invites for delete to authenticated using (public.is_member(wedding_id));

create policy entities_select on public.entities for select to authenticated using (public.is_member(wedding_id));
create policy entities_insert on public.entities for insert to authenticated with check (public.is_member(wedding_id));
create policy entities_update on public.entities for update to authenticated
  using (public.is_member(wedding_id)) with check (public.is_member(wedding_id));
-- No delete policy: items are tombstoned through put_entity; whole weddings are deleted by their owner.

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on public.wedding_members, public.wedding_invites from authenticated;
grant delete on public.wedding_members, public.wedding_invites to authenticated;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ---------------------------------------------------------------- RPCs
create or replace function public.create_wedding(p_partner1 text, p_partner2 text, p_date date, p_capacity integer, p_currency text, p_settings jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare wid uuid;
begin
  if auth.uid() is null or not public.aal_ok() then raise exception 'not signed in' using errcode = '42501'; end if;
  if (select count(*) from public.wedding_members where user_id = auth.uid()) >= 5 then
    raise exception 'too many weddings' using errcode = 'P0001';
  end if;
  insert into public.weddings (partner1_name, partner2_name, wedding_date, guest_capacity, currency, settings, created_by)
  values (left(coalesce(p_partner1, ''), 80), left(coalesce(p_partner2, ''), 80), p_date, p_capacity,
          upper(coalesce(p_currency, 'EUR')), coalesce(p_settings, '{}'::jsonb), auth.uid())
  returning id into wid;
  insert into public.wedding_members (wedding_id, user_id, role) values (wid, auth.uid(), 'owner');
  return wid;
end $$;

-- Returns the plain code exactly once; only its hash is stored.
create or replace function public.create_partner_invite(p_wedding uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text := ''; b bytea; i int;
begin
  if not public.is_member(p_wedding) then raise exception 'not allowed' using errcode = '42501'; end if;
  if (select count(*) from public.wedding_invites where wedding_id = p_wedding and used_at is null and expires_at > now()) >= 5 then
    raise exception 'too many open invites' using errcode = 'P0001';
  end if;
  b := extensions.gen_random_bytes(10);
  for i in 0..9 loop code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); end loop;
  insert into public.wedding_invites (wedding_id, code_hash, created_by)
  values (p_wedding, encode(extensions.digest(code, 'sha256'), 'hex'), auth.uid());
  return substr(code, 1, 5) || '-' || substr(code, 6, 5);
end $$;

create or replace function public.accept_partner_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.wedding_invites; clean text;
begin
  if auth.uid() is null or not public.aal_ok() then raise exception 'not signed in' using errcode = '42501'; end if;
  clean := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into inv from public.wedding_invites
   where code_hash = encode(extensions.digest(clean, 'sha256'), 'hex') and used_at is null and expires_at > now()
   for update;
  if not found then raise exception 'INVITE_INVALID' using errcode = 'P0001'; end if;
  if (select count(*) from public.wedding_members where user_id = auth.uid()) >= 5 then
    raise exception 'too many weddings' using errcode = 'P0001';
  end if;
  insert into public.wedding_members (wedding_id, user_id, role) values (inv.wedding_id, auth.uid(), 'editor')
    on conflict do nothing;
  update public.wedding_invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return inv.wedding_id;
end $$;

-- Called by the delete-account function before the auth user is removed.
-- Weddings the user shares keep running (ownership passes on); weddings only they belong to are deleted.
-- Returns the deleted wedding ids so their files can be removed from storage.
create or replace function public.prepare_account_deletion() returns setof uuid
language plpgsql security definer set search_path = '' as $$
declare r record; heir uuid;
begin
  if auth.uid() is null or not public.aal_ok() then raise exception 'not signed in' using errcode = '42501'; end if;
  for r in select wedding_id, role from public.wedding_members where user_id = auth.uid() loop
    select user_id into heir from public.wedding_members
      where wedding_id = r.wedding_id and user_id <> auth.uid() order by joined_at limit 1;
    if heir is null then
      delete from public.weddings where id = r.wedding_id;
      return next r.wedding_id;
    else
      if r.role = 'owner' then update public.wedding_members set role = 'owner' where wedding_id = r.wedding_id and user_id = heir; end if;
      delete from public.wedding_members where wedding_id = r.wedding_id and user_id = auth.uid();
    end if;
  end loop;
end $$;

-- Tombstones carry no personal data; they are removed after 30 days (schedule with pg_cron, see docs/SETUP.md).
create or replace function public.purge_tombstones() returns integer
language sql security definer set search_path = '' as $$
  with d as (delete from public.entities where deleted and updated_at < now() - interval '30 days' returning 1)
  select count(*)::integer from d
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_wedding(text, text, date, integer, text, jsonb) to authenticated;
grant execute on function public.create_partner_invite(uuid) to authenticated;
grant execute on function public.accept_partner_invite(text) to authenticated;
grant execute on function public.prepare_account_deletion() to authenticated;
grant execute on function public.put_entity(uuid, text, text, jsonb, bigint, boolean) to authenticated;
grant execute on function public.is_member(uuid), public.is_owner(uuid), public.aal_ok(), public.guest_heads(jsonb) to authenticated;
revoke execute on function public.purge_tombstones() from authenticated;
