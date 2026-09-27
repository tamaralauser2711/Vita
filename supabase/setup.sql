-- Vita: Datenbank einrichten.
-- In Supabase: SQL Editor -> New query -> alles einfügen -> Run.

create table if not exists public.kv (
  k  text primary key,          -- was gespeichert ist, z.B. "vitaMealLogs@2026-09-28"
  v  text not null,             -- der Inhalt (JSON als Text)
  ts bigint not null default 0, -- wann zuletzt geändert
  by text                       -- welches Handy es geändert hat
);

alter table public.kv enable row level security;

-- Nur angemeldete Nutzer (euer Haushalts-Login) dürfen lesen und schreiben.
drop policy if exists "vita read"   on public.kv;
drop policy if exists "vita insert" on public.kv;
drop policy if exists "vita update" on public.kv;
drop policy if exists "vita delete" on public.kv;
create policy "vita read"   on public.kv for select to authenticated using (true);
create policy "vita insert" on public.kv for insert to authenticated with check (true);
create policy "vita update" on public.kv for update to authenticated using (true) with check (true);
create policy "vita delete" on public.kv for delete to authenticated using (true);

-- Live-Updates zwischen euren Handys
do $$
begin
  alter publication supabase_realtime add table public.kv;
exception when duplicate_object then null;
end $$;
