-- Cole isto no Supabase: SQL Editor > New query > Run.
-- Todo o estado da demo vive numa única linha (jsonb); `version` evita que duas
-- escritas simultâneas (cliente + garçom) se sobreponham.
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Demo: qualquer visitante lê e escreve. Antes de produção, trocar por Auth + políticas por papel.
drop policy if exists "demo read" on public.app_state;
drop policy if exists "demo insert" on public.app_state;
drop policy if exists "demo update" on public.app_state;
create policy "demo read" on public.app_state for select using (true);
create policy "demo insert" on public.app_state for insert with check (true);
create policy "demo update" on public.app_state for update using (true) with check (true);

-- Realtime: pedidos aparecem nos outros aparelhos sem recarregar.
alter table public.app_state replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.app_state;
exception when duplicate_object then null; end $$;
