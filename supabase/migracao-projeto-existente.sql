-- Cardápio inteligente: esquema MULTI-LOJA.
-- Cole no Supabase: SQL Editor > New query > Run. Pode correr mais de uma vez.
-- Substitui as políticas abertas do schema.sql da demo.
--
-- Modelo:
--   lojas         uma linha por loja (slug = id da linha em app_state)
--   app_state     o estado da loja (jsonb), uma linha por loja
--   membros       quem é dono ou garçom de cada loja (login real, Supabase Auth)
--   super_admins  quem pode criar e gerir lojas (o Ricardo)
--
-- ATENÇÃO (limite conhecido, a endurecer antes de clientes reais):
-- o cliente à mesa (anónimo) precisa de escrever em app_state para pedir.
-- Como o estado da loja é uma única linha jsonb, a política não consegue
-- separar "cliente" de "garçom" nessa escrita. Serve para um cliente de teste.
-- Fase seguinte: pedidos por funções no servidor e tabelas normalizadas.

-- ---------------------------------------------------------------- lojas
create table if not exists public.lojas (
  slug        text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40),
  nome        text not null,
  moeda       text not null default 'BRL' check (moeda in ('BRL', 'EUR')),
  limite_mesas integer not null default 5 check (limite_mesas between 1 and 500),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- Projetos que já tinham a tabela `lojas` (versão anterior deste ficheiro):
alter table public.lojas add column if not exists limite_mesas integer not null default 5 check (limite_mesas between 1 and 500);

create table if not exists public.membros (
  user_id  uuid not null references auth.users (id) on delete cascade,
  loja     text not null references public.lojas (slug) on delete cascade,
  papel    text not null check (papel in ('dono', 'garcom')),
  primary key (user_id, loja)
);

create table if not exists public.super_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- ---------------------------------------------------------------- app_state
create table if not exists public.app_state (
  id         text primary key,
  data       jsonb not null,
  version    bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- PROJETO QUE JÁ TINHA A DEMO ANTIGA: a linha 'main' de app_state passa a ser a loja 'main'.
-- Assim a chave estrangeira abaixo é satisfeita e a demo da Vercel (que usa o id 'main') continua a funcionar.
insert into public.lojas (slug, nome, moeda, limite_mesas)
select 'main', 'Demo antiga (Tasca do Largo)', 'EUR', 50
where exists (select 1 from public.app_state where id = 'main')
on conflict (slug) do nothing;

-- Cada linha de app_state é de uma loja: o id é o slug.
-- Se correr isto num projeto que já teve a demo, apague antes a linha antiga:
--   delete from public.app_state where id = 'main';
do $$ begin
  alter table public.app_state
    add constraint app_state_loja_fk foreign key (id) references public.lojas (slug) on delete cascade;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- funções
-- Funções auxiliares ficam num esquema PRIVADO: a API pública do Supabase não as expõe como RPC.
create schema if not exists app_private;
grant usage on schema app_private to anon, authenticated;

create or replace function app_private.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;

create or replace function app_private.loja_ativa(s text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lojas where slug = s and ativo);
$$;

-- Limite de mesas: o preço da loja depende do número de mesas contratadas.
-- O dono não consegue criar mesas acima de `lojas.limite_mesas`, nem alterando o estado
-- diretamente. Só o super admin muda o limite. Reduzir ou manter mesas é sempre permitido.
create or replace function app_private.app_state_limite_mesas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  novas integer := 0;
  antigas integer := 0;
  lim integer;
begin
  if jsonb_typeof(new.data->'tables') = 'array' then novas := jsonb_array_length(new.data->'tables'); end if;
  if jsonb_typeof(old.data->'tables') = 'array' then antigas := jsonb_array_length(old.data->'tables'); end if;
  if novas > antigas then
    select limite_mesas into lim from public.lojas where slug = new.id;
    if lim is not null and novas > lim then
      raise exception 'Limite de mesas da loja atingido (%). Peça ao administrador para liberar mais mesas.', lim using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists app_state_limite_mesas on public.app_state;
create trigger app_state_limite_mesas before update on public.app_state
  for each row execute function app_private.app_state_limite_mesas();
revoke execute on function app_private.app_state_limite_mesas() from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.lojas        enable row level security;
alter table public.membros      enable row level security;
alter table public.super_admins enable row level security;
alter table public.app_state    enable row level security;

-- limpa políticas antigas (demo e versões anteriores deste ficheiro)
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('lojas', 'membros', 'super_admins', 'app_state')
  loop execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- lojas: qualquer um lê (precisa do nome e de saber se está ativa); só super admin altera
create policy "lojas leitura"  on public.lojas for select using (true);
create policy "lojas escrita"  on public.lojas for all    using (app_private.is_super_admin()) with check (app_private.is_super_admin());

-- membros: cada um vê as suas linhas; super admin vê tudo. Escrita só pelo servidor (service role).
create policy "membros leitura" on public.membros for select
  using (user_id = auth.uid() or app_private.is_super_admin());

-- super_admins: cada um vê a sua linha. Escrita só por SQL.
create policy "super leitura" on public.super_admins for select using (user_id = auth.uid());

-- app_state: lê e atualiza quem estiver numa loja ativa. Criar e apagar só pelo servidor.
create policy "estado leitura"     on public.app_state for select using (app_private.loja_ativa(id));
create policy "estado atualizacao" on public.app_state for update
  using (app_private.loja_ativa(id)) with check (app_private.loja_ativa(id));

-- Realtime: pedidos aparecem nos outros aparelhos sem recarregar.
alter table public.app_state replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.app_state;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- primeiro super admin
-- 1) Crie o utilizador em Authentication > Users (email + senha).
-- 2) Descomente e corra, com o seu email:
-- insert into public.super_admins (user_id)
--   select id from auth.users where email = 'SEU-EMAIL-AQUI' on conflict do nothing;
