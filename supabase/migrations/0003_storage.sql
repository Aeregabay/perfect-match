-- Photos and documents (venue photos, visit photos, offers as PDF).
-- Private bucket; every object lives under "<wedding id>/<area>/<random id>.<ext>" and is readable only by that wedding's members.
-- Images are re-encoded on the device before upload, which also strips location and camera metadata.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wedding-files', 'wedding-files', false, 12582912, array['image/jpeg', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.file_wedding(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(ph|vp|pf)/[A-Za-z0-9_-]{1,64}\.(jpg|pdf)$'
              then split_part(p_name, '/', 1)::uuid end
$$;

-- Upload allowed for members, within the wedding's file quota (free 40 files, unlocked 2000).
create or replace function public.can_add_file(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare w uuid := public.file_wedding(p_name); n integer; prem boolean;
begin
  if w is null or not public.is_member(w) then return false; end if;
  select premium into prem from public.weddings where id = w;
  select count(*) into n from storage.objects o where o.bucket_id = 'wedding-files' and o.name like w::text || '/%';
  return n < case when coalesce(prem, false) then 2000 else 40 end;
end $$;

grant execute on function public.file_wedding(text), public.can_add_file(text) to authenticated;

create policy wedding_files_select on storage.objects for select to authenticated
  using (bucket_id = 'wedding-files' and public.is_member(public.file_wedding(name)));
create policy wedding_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wedding-files' and public.can_add_file(name));
create policy wedding_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wedding-files' and public.is_member(public.file_wedding(name)));
-- No update policy: files are immutable; a replaced photo gets a new name.
