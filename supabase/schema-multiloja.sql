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
-- Segurança (resumo):
--   - O público (sem login) só lê o cardápio (public.cardapio_publico).
--   - O cliente à mesa age por funções no servidor (entrar_mesa, estado_mesa, enviar_pedido,
--     chamar_garcom, pedir_conta, decidir_convidado), que validam o QR e uma chave secreta do
--     convidado e calculam os preços. Nunca lê nem escreve app_state diretamente.
--   - app_state (mesas, clientes, celulares, pedidos): só a equipe da própria loja, com login.
--   - O garçom não altera cardápio, preços, ofertas nem número de mesas.

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


-- Realtime: pedidos aparecem nos outros aparelhos sem recarregar.
alter table public.app_state replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.app_state;
exception when duplicate_object then null; end $$;


-- ================================================================ SEGURANÇA DOS CLIENTES (fase 1)

-- ---------------------------------------------------------------- cardápio público
-- Só o que qualquer pessoa pode ver: nome da loja, categorias, produtos e ofertas.
-- NUNCA inclui mesas, tokens, clientes, celulares nem pedidos.
create table if not exists public.cardapio_publico (
  id         text primary key references public.lojas (slug) on delete cascade,
  data       jsonb not null,
  version    bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.cardapio_publico enable row level security;
drop policy if exists "cardapio publico leitura" on public.cardapio_publico;
create policy "cardapio publico leitura" on public.cardapio_publico for select using (app_private.loja_ativa(id));

create or replace function app_private.cardapio_de(d jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'version', coalesce(d->'version', '1'::jsonb),
    'establishment', coalesce(d->'establishment', '{}'::jsonb),
    'categories', coalesce(d->'categories', '[]'::jsonb),
    'products', coalesce(d->'products', '[]'::jsonb),
    'offers', coalesce(d->'offers', '[]'::jsonb));
$$;

-- mantém o cardápio público igual ao estado da loja, sempre que a equipe grava
create or replace function app_private.sync_cardapio_publico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.cardapio_publico (id, data, version)
  values (new.id, app_private.cardapio_de(new.data), new.version)
  on conflict (id) do update set data = excluded.data, version = excluded.version, updated_at = now();
  return new;
end $$;
revoke execute on function app_private.sync_cardapio_publico() from public, anon, authenticated;

drop trigger if exists app_state_sync_publico on public.app_state;
create trigger app_state_sync_publico after insert or update on public.app_state
  for each row execute function app_private.sync_cardapio_publico();

insert into public.cardapio_publico (id, data, version)
select id, app_private.cardapio_de(data), version from public.app_state
on conflict (id) do update set data = excluded.data, version = excluded.version, updated_at = now();

-- ---------------------------------------------------------------- ajudantes (privados)
create or replace function app_private.agora_ms() returns bigint
language sql volatile as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function app_private.novo_id(p text) returns text
language sql volatile as $$ select p || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10) $$;

create or replace function app_private.fuso_loja(d jsonb) returns text
language sql immutable as $$ select case when d->'establishment'->>'currency' = 'EUR' then 'Europe/Lisbon' else 'America/Sao_Paulo' end $$;

-- a oferta está a valer agora (mesma regra do ecrã: ativa, dia da semana e horário, com viragem da meia-noite)
create or replace function app_private.oferta_ativa(o jsonb, tz text) returns boolean
language plpgsql stable as $$
declare
  agora timestamp := (now() at time zone tz);
  dow int := extract(dow from agora)::int;
  cur int := extract(hour from agora)::int * 60 + extract(minute from agora)::int;
  a int; b int;
begin
  if coalesce((o->>'active')::boolean, false) is not true then return false; end if;
  if not (coalesce(o->'days', '[]'::jsonb) @> to_jsonb(dow)) then return false; end if;
  a := split_part(o->>'start', ':', 1)::int * 60 + split_part(o->>'start', ':', 2)::int;
  b := split_part(o->>'end', ':', 1)::int * 60 + split_part(o->>'end', ':', 2)::int;
  return case when a <= b then cur >= a and cur <= b else cur >= a or cur <= b end;
end $$;

create or replace function app_private.achar_mesa(v jsonb, p_token text) returns jsonb
language sql stable as $$
  select t from jsonb_array_elements(coalesce(v->'tables', '[]'::jsonb)) t
  where p_token is not null and t->>'token' = p_token limit 1 $$;

create or replace function app_private.achar_convidado(v jsonb, p_id text, p_secret text) returns jsonb
language sql stable as $$
  select g from jsonb_array_elements(coalesce(v->'guests', '[]'::jsonb)) g
  where p_id is not null and p_secret is not null and g->>'id' = p_id and g->>'secret' = p_secret limit 1 $$;

create or replace function app_private.sessao_de(v jsonb, p_id text) returns jsonb
language sql stable as $$
  select s from jsonb_array_elements(coalesce(v->'sessions', '[]'::jsonb)) s where s->>'id' = p_id limit 1 $$;

-- valida QR + convidado + sessão; com p_bloquear, bloqueia a linha da loja para escrever
create or replace function app_private.validar_convidado(
  p_slug text, p_token text, p_guest text, p_secret text, p_bloquear boolean,
  out erro text, out v jsonb, out t jsonb, out g jsonb, out s jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if p_bloquear then
    select data into v from public.app_state where id = p_slug for update;
  else
    select data into v from public.app_state where id = p_slug;
  end if;
  if v is null or not app_private.loja_ativa(p_slug) then erro := 'loja_indisponivel'; return; end if;
  t := app_private.achar_mesa(v, p_token);
  if t is null then erro := 'qr_invalido'; return; end if;
  g := app_private.achar_convidado(v, p_guest, p_secret);
  if g is null then erro := 'convidado_invalido'; return; end if;
  s := app_private.sessao_de(v, g->>'sessionId');
  if s is null or s->>'tableId' <> t->>'id' then erro := 'convidado_invalido'; return; end if;
end $$;
revoke execute on function app_private.validar_convidado(text, text, text, text, boolean) from public, anon, authenticated;

create or replace function app_private.gravar(p_slug text, v jsonb) returns void
language sql security definer set search_path = public as $$
  update public.app_state set data = v, version = version + 1, updated_at = now() where id = p_slug $$;
revoke execute on function app_private.gravar(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- funções do cliente à mesa (públicas, de propósito)

-- Entrar na mesa: cria o convidado (a aguardar aprovação) e devolve a chave secreta dele.
create or replace function public.entrar_mesa(p_slug text, p_token text, p_nome text, p_telefone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb; t jsonb; s jsonb; g jsonb; agora bigint; segredo text; nome text; tel text; n int;
begin
  nome := left(btrim(coalesce(p_nome, '')), 40);
  tel := nullif(left(btrim(coalesce(p_telefone, '')), 20), '');
  if nome = '' then return jsonb_build_object('ok', false, 'erro', 'nome_obrigatorio'); end if;
  select data into v from public.app_state where id = p_slug for update;
  if v is null or not app_private.loja_ativa(p_slug) then return jsonb_build_object('ok', false, 'erro', 'loja_indisponivel'); end if;
  t := app_private.achar_mesa(v, p_token);
  if t is null then return jsonb_build_object('ok', false, 'erro', 'qr_invalido'); end if;
  agora := app_private.agora_ms();
  select x into s from jsonb_array_elements(coalesce(v->'sessions', '[]'::jsonb)) x
    where x->>'tableId' = t->>'id' and (x->>'closedAt') is null limit 1;
  if s is null then
    s := jsonb_build_object('id', app_private.novo_id('s'), 'tableId', t->>'id', 'openedAt', agora);
    v := jsonb_set(v, '{sessions}', coalesce(v->'sessions', '[]'::jsonb) || jsonb_build_array(s));
    v := jsonb_set(v, '{tables}', (select jsonb_agg(case when x->>'id' = t->>'id' then x - 'billRequestedAt' - 'calledAt' else x end)
                                     from jsonb_array_elements(v->'tables') x));
  end if;
  select count(*) into n from jsonb_array_elements(coalesce(v->'guests', '[]'::jsonb)) x where x->>'sessionId' = s->>'id';
  if n >= 30 then return jsonb_build_object('ok', false, 'erro', 'mesa_cheia'); end if;
  segredo := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  g := jsonb_build_object('id', app_private.novo_id('g'), 'sessionId', s->>'id', 'name', nome, 'status', 'pendente', 'secret', segredo);
  if tel is not null then g := g || jsonb_build_object('phone', tel); end if;
  v := jsonb_set(v, '{guests}', coalesce(v->'guests', '[]'::jsonb) || jsonb_build_array(g));
  perform app_private.gravar(p_slug, v);
  return jsonb_build_object('ok', true, 'guestId', g->>'id', 'secret', segredo);
end $$;

-- Estado da mesa para o ecrã do cliente. Sem credenciais, só diz se o QR é válido.
-- Nunca devolve celulares, chaves nem dados de outras mesas.
create or replace function public.estado_mesa(p_slug text, p_token text, p_guest_id text default null, p_secret text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; mesa jsonb; ords jsonb; pend jsonb; conv jsonb; sess jsonb; v jsonb; t jsonb;
begin
  select data into v from public.app_state where id = p_slug;
  if v is null or not app_private.loja_ativa(p_slug) then return jsonb_build_object('ok', false, 'erro', 'loja_indisponivel'); end if;
  t := app_private.achar_mesa(v, p_token);
  if t is null then return jsonb_build_object('ok', false, 'erro', 'qr_invalido'); end if;
  mesa := jsonb_build_object('id', t->>'id', 'name', t->>'name');
  if p_guest_id is null then return jsonb_build_object('ok', true, 'mesa', mesa, 'convidado', null); end if;

  select * into r from app_private.validar_convidado(p_slug, p_token, p_guest_id, p_secret, false);
  if r.erro is not null then return jsonb_build_object('ok', true, 'mesa', mesa, 'convidado', null, 'invalido', true); end if;

  conv := jsonb_build_object('id', r.g->>'id', 'name', r.g->>'name', 'status', r.g->>'status');
  sess := jsonb_build_object('id', r.s->>'id', 'closedAt', r.s->'closedAt');
  ords := '[]'::jsonb; pend := '[]'::jsonb;
  if r.g->>'status' = 'aprovado' then
    mesa := mesa || jsonb_build_object('billRequestedAt', r.t->'billRequestedAt', 'calledAt', r.t->'calledAt');
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', o->>'id', 'sessionId', o->>'sessionId', 'guestId', null, 'author', o->>'author',
        'createdAt', (o->>'createdAt')::bigint, 'status', o->>'status', 'note', coalesce(o->>'note', ''),
        'items', coalesce((select jsonb_agg(jsonb_build_object('id', i->>'id', 'productId', i->>'productId', 'name', i->>'name',
                    'price', (i->>'price')::int, 'qty', (i->>'qty')::int,
                    'cancelled', coalesce((i->>'cancelled')::boolean, false), 'delivered', i->'delivered'))
                  from jsonb_array_elements(o->'items') i), '[]'::jsonb))
      order by (o->>'createdAt')::bigint desc), '[]'::jsonb)
      into ords from jsonb_array_elements(coalesce(r.v->'orders', '[]'::jsonb)) o where o->>'sessionId' = r.s->>'id';
    select coalesce(jsonb_agg(jsonb_build_object('id', x->>'id', 'name', x->>'name')), '[]'::jsonb)
      into pend from jsonb_array_elements(coalesce(r.v->'guests', '[]'::jsonb)) x
      where x->>'sessionId' = r.s->>'id' and x->>'status' = 'pendente';
  end if;
  return jsonb_build_object('ok', true, 'mesa', mesa, 'convidado', conv, 'sessao', sess, 'pedidos', ords, 'pendentes', pend);
end $$;

-- Enviar pedido: os preços e a disponibilidade vêm SEMPRE do servidor, nunca do ecrã do cliente.
create or replace function public.enviar_pedido(p_slug text, p_token text, p_guest_id text, p_secret text, p_linhas jsonb, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; tz text; itens jsonb := '[]'::jsonb; l jsonb; lid text; qtd int; it jsonb; o jsonb; nped int; nlin int := 0;
begin
  select * into r from app_private.validar_convidado(p_slug, p_token, p_guest_id, p_secret, true);
  if r.erro is not null then return jsonb_build_object('ok', false, 'erro', r.erro); end if;
  if r.g->>'status' <> 'aprovado' then return jsonb_build_object('ok', false, 'erro', 'nao_aprovado'); end if;
  if r.s->'closedAt' is not null and r.s->>'closedAt' is not null then return jsonb_build_object('ok', false, 'erro', 'mesa_encerrada'); end if;
  if jsonb_typeof(p_linhas) <> 'array' then return jsonb_build_object('ok', false, 'erro', 'pedido_invalido'); end if;
  tz := app_private.fuso_loja(r.v);

  for l in select * from jsonb_array_elements(p_linhas) loop
    nlin := nlin + 1;
    if nlin > 40 then return jsonb_build_object('ok', false, 'erro', 'pedido_invalido'); end if;
    lid := l->>'id';
    begin qtd := (l->>'qty')::int; exception when others then qtd := 0; end;
    if lid is null or qtd is null or qtd < 1 or qtd > 99 then return jsonb_build_object('ok', false, 'erro', 'pedido_invalido'); end if;
    if left(lid, 6) = 'offer:' then
      select x into it from jsonb_array_elements(coalesce(r.v->'offers', '[]'::jsonb)) x where x->>'id' = substr(lid, 7) limit 1;
      if it is null or not app_private.oferta_ativa(it, tz) then return jsonb_build_object('ok', false, 'erro', 'item_indisponivel'); end if;
      itens := itens || jsonb_build_array(jsonb_build_object('id', app_private.novo_id('i'), 'productId', lid,
                 'name', it->>'title', 'price', (it->>'price')::int, 'qty', qtd, 'cancelled', false));
    else
      select x into it from jsonb_array_elements(coalesce(r.v->'products', '[]'::jsonb)) x where x->>'id' = lid limit 1;
      if it is null or coalesce((it->>'available')::boolean, false) is not true then return jsonb_build_object('ok', false, 'erro', 'item_indisponivel'); end if;
      itens := itens || jsonb_build_array(jsonb_build_object('id', app_private.novo_id('i'), 'productId', it->>'id',
                 'name', it->>'name', 'price', (it->>'price')::int, 'qty', qtd, 'cancelled', false));
    end if;
  end loop;
  if jsonb_array_length(itens) = 0 then return jsonb_build_object('ok', false, 'erro', 'pedido_invalido'); end if;

  select count(*) into nped from jsonb_array_elements(coalesce(r.v->'orders', '[]'::jsonb)) x where x->>'sessionId' = r.s->>'id';
  if nped >= 200 then return jsonb_build_object('ok', false, 'erro', 'limite_pedidos'); end if;

  o := jsonb_build_object('id', app_private.novo_id('or'), 'sessionId', r.s->>'id', 'guestId', r.g->>'id', 'author', r.g->>'name',
         'createdAt', app_private.agora_ms(), 'status', 'enviado', 'note', left(btrim(coalesce(p_nota, '')), 200), 'items', itens);
  perform app_private.gravar(p_slug, jsonb_set(r.v, '{orders}', coalesce(r.v->'orders', '[]'::jsonb) || jsonb_build_array(o)));
  return jsonb_build_object('ok', true);
end $$;

-- Chamar o garçom e pedir a conta (só convidados aprovados de uma mesa aberta)
create or replace function app_private.marcar_mesa(p_slug text, p_token text, p_guest_id text, p_secret text, p_campo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v jsonb;
begin
  select * into r from app_private.validar_convidado(p_slug, p_token, p_guest_id, p_secret, true);
  if r.erro is not null then return jsonb_build_object('ok', false, 'erro', r.erro); end if;
  if r.g->>'status' <> 'aprovado' then return jsonb_build_object('ok', false, 'erro', 'nao_aprovado'); end if;
  if r.s->>'closedAt' is not null then return jsonb_build_object('ok', false, 'erro', 'mesa_encerrada'); end if;
  v := jsonb_set(r.v, '{tables}', (select jsonb_agg(case when x->>'id' = r.t->>'id' then x || jsonb_build_object(p_campo, app_private.agora_ms()) else x end)
                                     from jsonb_array_elements(r.v->'tables') x));
  perform app_private.gravar(p_slug, v);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function app_private.marcar_mesa(text, text, text, text, text) from public, anon, authenticated;

create or replace function public.chamar_garcom(p_slug text, p_token text, p_guest_id text, p_secret text)
returns jsonb language sql security definer set search_path = public as $$
  select app_private.marcar_mesa(p_slug, p_token, p_guest_id, p_secret, 'calledAt') $$;

create or replace function public.pedir_conta(p_slug text, p_token text, p_guest_id text, p_secret text)
returns jsonb language sql security definer set search_path = public as $$
  select app_private.marcar_mesa(p_slug, p_token, p_guest_id, p_secret, 'billRequestedAt') $$;

-- Um convidado já aprovado aprova ou recusa quem quer entrar na mesma mesa
create or replace function public.decidir_convidado(p_slug text, p_token text, p_guest_id text, p_secret text, p_alvo text, p_aprovar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v jsonb; alvo jsonb; vazia boolean;
begin
  select * into r from app_private.validar_convidado(p_slug, p_token, p_guest_id, p_secret, true);
  if r.erro is not null then return jsonb_build_object('ok', false, 'erro', r.erro); end if;
  if r.g->>'status' <> 'aprovado' then return jsonb_build_object('ok', false, 'erro', 'nao_aprovado'); end if;
  if r.s->>'closedAt' is not null then return jsonb_build_object('ok', false, 'erro', 'mesa_encerrada'); end if;
  select x into alvo from jsonb_array_elements(coalesce(r.v->'guests', '[]'::jsonb)) x
    where x->>'id' = p_alvo and x->>'sessionId' = r.s->>'id' and x->>'status' = 'pendente' limit 1;
  if alvo is null then return jsonb_build_object('ok', false, 'erro', 'convidado_nao_encontrado'); end if;
  v := jsonb_set(r.v, '{guests}', (select jsonb_agg(case when x->>'id' = p_alvo
                 then jsonb_set(x, '{status}', to_jsonb(case when p_aprovar then 'aprovado' else 'recusado' end)) else x end)
               from jsonb_array_elements(r.v->'guests') x));
  if not p_aprovar then
    select not exists (select 1 from jsonb_array_elements(v->'guests') x where x->>'sessionId' = r.s->>'id' and x->>'status' <> 'recusado')
       and not exists (select 1 from jsonb_array_elements(coalesce(v->'orders', '[]'::jsonb)) o where o->>'sessionId' = r.s->>'id')
      into vazia;
    if vazia then
      v := jsonb_set(v, '{sessions}', (select jsonb_agg(case when x->>'id' = r.s->>'id' then x || jsonb_build_object('closedAt', app_private.agora_ms()) else x end)
                                         from jsonb_array_elements(v->'sessions') x));
    end if;
  end if;
  perform app_private.gravar(p_slug, v);
  return jsonb_build_object('ok', true);
end $$;

-- só estas funções ficam chamáveis pelo público; tudo o resto é privado
revoke execute on function public.entrar_mesa(text, text, text, text) from public;
revoke execute on function public.estado_mesa(text, text, text, text) from public;
revoke execute on function public.enviar_pedido(text, text, text, text, jsonb, text) from public;
revoke execute on function public.chamar_garcom(text, text, text, text) from public;
revoke execute on function public.pedir_conta(text, text, text, text) from public;
revoke execute on function public.decidir_convidado(text, text, text, text, text, boolean) from public;
grant execute on function public.entrar_mesa(text, text, text, text) to anon, authenticated;
grant execute on function public.estado_mesa(text, text, text, text) to anon, authenticated;
grant execute on function public.enviar_pedido(text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.chamar_garcom(text, text, text, text) to anon, authenticated;
grant execute on function public.pedir_conta(text, text, text, text) to anon, authenticated;
grant execute on function public.decidir_convidado(text, text, text, text, text, boolean) to anon, authenticated;

-- ================================================================ SEGURANÇA DOS CLIENTES (fase 2)
-- quem é da equipe da loja (dono ou garçom) ou administrador
create or replace function app_private.eh_equipa(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select app_private.is_super_admin()
      or (app_private.loja_ativa(s) and exists (select 1 from public.membros m where m.user_id = auth.uid() and m.loja = s))
$$;

-- app_state (mesas, clientes, celulares, pedidos): só a equipe da própria loja
drop policy if exists "estado leitura" on public.app_state;
drop policy if exists "estado atualizacao" on public.app_state;
drop policy if exists "estado leitura equipa" on public.app_state;
drop policy if exists "estado atualizacao equipa" on public.app_state;
create policy "estado leitura equipa" on public.app_state for select using (app_private.eh_equipa(id));
create policy "estado atualizacao equipa" on public.app_state for update
  using (app_private.eh_equipa(id)) with check (app_private.eh_equipa(id));

-- O garçom mexe na operação (mesas, clientes, pedidos, esgotado), mas NÃO no cardápio nem nos preços.
-- Quem não tem sessão (funções do cliente à mesa, chave de serviço) não passa por aqui.
create or replace function app_private.limita_garcom() returns trigger
language plpgsql security definer set search_path = public as $$
declare papel text;
begin
  if auth.uid() is null or app_private.is_super_admin() then return new; end if;
  select m.papel into papel from public.membros m where m.user_id = auth.uid() and m.loja = new.id;
  if papel is distinct from 'garcom' then return new; end if;

  if new.data->'establishment' is distinct from old.data->'establishment'
     or new.data->'categories' is distinct from old.data->'categories'
     or new.data->'offers' is distinct from old.data->'offers' then
    raise exception 'O garçom não pode alterar o cardápio, as categorias nem as ofertas.' using errcode = 'P0001';
  end if;
  -- produtos: só o campo "esgotado" (available) pode mudar
  if (select coalesce(jsonb_agg(p - 'available'), '[]'::jsonb) from jsonb_array_elements(coalesce(new.data->'products', '[]'::jsonb)) p)
     is distinct from
     (select coalesce(jsonb_agg(p - 'available'), '[]'::jsonb) from jsonb_array_elements(coalesce(old.data->'products', '[]'::jsonb)) p) then
    raise exception 'O garçom só pode marcar produtos como esgotados; não altera preços nem produtos.' using errcode = 'P0001';
  end if;
  -- mesas: o garçom não cria nem remove mesas
  if jsonb_array_length(coalesce(new.data->'tables', '[]'::jsonb)) is distinct from jsonb_array_length(coalesce(old.data->'tables', '[]'::jsonb)) then
    raise exception 'O garçom não pode criar nem remover mesas.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app_private.limita_garcom() from public, anon, authenticated;

drop trigger if exists app_state_limita_garcom on public.app_state;
create trigger app_state_limita_garcom before update on public.app_state
  for each row execute function app_private.limita_garcom();

-- ---------------------------------------------------------------- primeiro super admin
-- 1) Crie o utilizador em Authentication > Users (email + senha).
-- 2) Descomente e corra, com o seu email:
-- insert into public.super_admins (user_id)
--   select id from auth.users where email = 'SEU-EMAIL-AQUI' on conflict do nothing;
