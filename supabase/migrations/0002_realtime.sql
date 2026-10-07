-- Live updates between partners. Realtime applies the same RLS policies, so nobody receives other weddings' changes.
alter publication supabase_realtime add table public.entities, public.weddings;
