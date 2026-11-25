-- Cozinha v2. Corra DEPOIS de cozinha.sql. Pode correr mais de uma vez.
-- Se voltar a correr schema-multiloja.sql, corra cozinha.sql e este ficheiro outra vez a seguir.
--
-- O que muda:
--   1. Categorias fora da cozinha (categories[].skipKitchen = true, ex.: bebidas): os produtos delas não
--      aparecem na tela da cozinha. Um pedido só com esses produtos não vai para a cozinha.
--   2. O cliente à mesa recebe o estado do pedido na cozinha (estado_mesa devolve `kitchen` e `readyAt`),
--      para ver "Em preparação" e "Pronto". Não muda mais nada do que o cliente vê.

-- ---------------------------------------------------------------- 1. item passa pela cozinha?
-- Ofertas e produtos que já não existem passam; produtos de categorias com skipKitchen não passam.
create or replace function app_private.item_cozinha(v jsonb, i jsonb) returns boolean
language sql stable as $$
  select case when left(coalesce(i->>'productId', ''), 6) = 'offer:' then true else coalesce((
    select not coalesce((c->>'skipKitchen')::boolean, false)
    from jsonb_array_elements(coalesce(v->'products', '[]'::jsonb)) p
    join jsonb_array_elements(coalesce(v->'categories', '[]'::jsonb)) c on c->>'id' = p->>'categoryId'
    where p->>'id' = i->>'productId' limit 1), true) end
$$;
revoke execute on function app_private.item_cozinha(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.cozinha_pedidos(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; peds jsonb; cfg jsonb;
begin
  if auth.uid() is null or not app_private.eh_cozinha(p_slug) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  select data into v from public.app_state where id = p_slug;
  if v is null then return jsonb_build_object('ok', false, 'erro', 'loja_indisponivel'); end if;
  cfg := coalesce(v->'establishment'->'kitchen', '{}'::jsonb);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o->>'id',
      'mesa', coalesce(tt.t->>'name', 'Mesa'),
      'createdAt', (o->>'createdAt')::bigint,
      'kitchen', coalesce(o->>'kitchen', 'novo'),
      'prepStartedAt', o->'prepStartedAt',
      'readyAt', o->'readyAt',
      'note', coalesce(o->>'note', ''),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', i->>'id', 'name', i->>'name', 'qty', (i->>'qty')::int,
                   'cancelled', coalesce((i->>'cancelled')::boolean, false)))
                 from jsonb_array_elements(coalesce(o->'items', '[]'::jsonb)) i
                 where app_private.item_cozinha(v, i)), '[]'::jsonb))
    order by (o->>'createdAt')::bigint), '[]'::jsonb)
  into peds
  from jsonb_array_elements(coalesce(v->'orders', '[]'::jsonb)) o
  join lateral (select s from jsonb_array_elements(coalesce(v->'sessions', '[]'::jsonb)) s
                where s->>'id' = o->>'sessionId' limit 1) ss on true
  left join lateral (select t from jsonb_array_elements(coalesce(v->'tables', '[]'::jsonb)) t
                     where t->>'id' = ss.s->>'tableId' limit 1) tt on true
  where (ss.s->>'closedAt') is null
    and coalesce(o->>'status', '') <> 'entregue'
    and exists (select 1 from jsonb_array_elements(coalesce(o->'items', '[]'::jsonb)) i
                where not coalesce((i->>'cancelled')::boolean, false) and app_private.item_cozinha(v, i));

  return jsonb_build_object(
    'ok', true,
    'ativa', coalesce((cfg->>'enabled')::boolean, false),
    'alertaMin', coalesce((cfg->>'alertMin')::int, 15),
    'agora', app_private.agora_ms(),
    'pedidos', peds);
end $$;
revoke execute on function public.cozinha_pedidos(text) from public, anon;
grant execute on function public.cozinha_pedidos(text) to authenticated;

-- ---------------------------------------------------------------- 2. cliente vê o estado na cozinha
-- Igual à versão de schema-multiloja.sql, mais os campos `kitchen` e `readyAt` de cada pedido.
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
        'kitchen', o->'kitchen', 'readyAt', o->'readyAt',
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
revoke execute on function public.estado_mesa(text, text, text, text) from public;
grant execute on function public.estado_mesa(text, text, text, text) to anon, authenticated;
