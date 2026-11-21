-- Segurança dos clientes: FASE 1 (aditiva, não tira nenhum acesso).
-- Acrescenta o cardápio público e as funções do cliente à mesa.
-- A app nova já usa isto; a app antiga continua a funcionar até à FASE 2.
-- Pode correr mais de uma vez.

create schema if not exists app_private;
grant usage on schema app_private to anon, authenticated;

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
