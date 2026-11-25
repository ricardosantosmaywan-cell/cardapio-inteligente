-- Tela da cozinha (tarefa 3). Corra DEPOIS de schema-multiloja.sql (ou das fases de segurança).
-- Pode correr mais de uma vez. Se voltar a correr schema-multiloja.sql, corra este ficheiro outra vez a seguir.
--
-- O que muda:
--   1. Novo papel `cozinha` na tabela membros (o dono cria o acesso em Equipe).
--   2. A cozinha NÃO lê nem altera app_state (onde estão celulares, nomes dos clientes e preços):
--      app_private.eh_equipa passa a aceitar só dono e garçom.
--   3. A cozinha vê e muda os pedidos só por duas funções no servidor:
--        cozinha_pedidos(p_slug)                      -> pedidos das mesas abertas, sem preços nem dados do cliente
--        cozinha_marcar(p_slug, p_pedido, p_estado)   -> novo | preparo | pronto
--      O dono, o garçom e o administrador também podem usar estas funções.
--
-- Configuração por loja (no estado, gravada pelo dono): establishment.kitchen = { enabled, alertMin }.
-- Estado de cada pedido na cozinha: orders[].kitchen ('novo' quando falta), prepStartedAt, readyAt (ms).

-- ---------------------------------------------------------------- 1. papel cozinha
alter table public.membros drop constraint if exists membros_papel_check;
alter table public.membros add constraint membros_papel_check check (papel in ('dono', 'garcom', 'cozinha'));

-- ---------------------------------------------------------------- 2. app_state só para dono e garçom
create or replace function app_private.eh_equipa(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select app_private.is_super_admin()
      or (app_private.loja_ativa(s) and exists (
            select 1 from public.membros m
            where m.user_id = auth.uid() and m.loja = s and m.papel in ('dono', 'garcom')))
$$;

-- quem pode usar a tela da cozinha: cozinha, garçom, dono ou administrador
create or replace function app_private.eh_cozinha(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select app_private.is_super_admin()
      or (app_private.loja_ativa(s) and exists (
            select 1 from public.membros m
            where m.user_id = auth.uid() and m.loja = s and m.papel in ('dono', 'garcom', 'cozinha')))
$$;
-- só é usada dentro das funções da cozinha (que correm como dono da base de dados)
revoke execute on function app_private.eh_cozinha(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. funções da cozinha

-- Pedidos para a cozinha: só mesas abertas, pedidos ainda não entregues e com algum item ativo.
-- Devolve mesa, hora, itens (nome e quantidade), observação e estado. Nunca preços, nomes nem celulares.
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
                 from jsonb_array_elements(coalesce(o->'items', '[]'::jsonb)) i), '[]'::jsonb))
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
                where not coalesce((i->>'cancelled')::boolean, false));

  return jsonb_build_object(
    'ok', true,
    'ativa', coalesce((cfg->>'enabled')::boolean, false),
    'alertaMin', coalesce((cfg->>'alertMin')::int, 15),
    'agora', app_private.agora_ms(),
    'pedidos', peds);
end $$;

-- Muda o estado de um pedido na cozinha: novo, preparo ou pronto.
create or replace function public.cozinha_marcar(p_slug text, p_pedido text, p_estado text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; o jsonb; agora bigint;
begin
  if auth.uid() is null or not app_private.eh_cozinha(p_slug) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  if p_estado is null or p_estado not in ('novo', 'preparo', 'pronto') then
    return jsonb_build_object('ok', false, 'erro', 'estado_invalido');
  end if;
  select data into v from public.app_state where id = p_slug for update;
  if v is null then return jsonb_build_object('ok', false, 'erro', 'loja_indisponivel'); end if;
  if coalesce((v->'establishment'->'kitchen'->>'enabled')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'erro', 'cozinha_desligada');
  end if;
  select x into o from jsonb_array_elements(coalesce(v->'orders', '[]'::jsonb)) x where x->>'id' = p_pedido limit 1;
  if o is null then return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado'); end if;
  if o->>'status' = 'entregue' then return jsonb_build_object('ok', false, 'erro', 'pedido_entregue'); end if;

  agora := app_private.agora_ms();
  o := o || jsonb_build_object('kitchen', p_estado);
  if p_estado = 'novo' then
    o := o - 'prepStartedAt' - 'readyAt';
  elsif p_estado = 'preparo' then
    o := (o - 'readyAt') || jsonb_build_object('prepStartedAt', coalesce(o->'prepStartedAt', to_jsonb(agora)));
  else
    o := o || jsonb_build_object('prepStartedAt', coalesce(o->'prepStartedAt', to_jsonb(agora)), 'readyAt', agora);
  end if;

  v := jsonb_set(v, '{orders}', (select jsonb_agg(case when x->>'id' = p_pedido then o else x end)
                                   from jsonb_array_elements(v->'orders') x));
  perform app_private.gravar(p_slug, v);
  return jsonb_build_object('ok', true);
end $$;

-- só utilizadores com sessão (a função confirma o papel); o público sem login não as chama
revoke execute on function public.cozinha_pedidos(text) from public, anon;
revoke execute on function public.cozinha_marcar(text, text, text) from public, anon;
grant execute on function public.cozinha_pedidos(text) to authenticated;
grant execute on function public.cozinha_marcar(text, text, text) to authenticated;
