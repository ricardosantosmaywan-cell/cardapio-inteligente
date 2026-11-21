-- Segurança dos clientes: FASE 2 (fecha o acesso aberto).
-- Correr SÓ depois de a app nova estar publicada (a app antiga lia e escrevia sem login).
-- Depois disto: ninguém sem login lê ou altera os dados de uma loja.
-- Pode correr mais de uma vez.

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
