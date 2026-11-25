-- Fotos no Supabase Storage (tarefa 5). Corra DEPOIS de schema-multiloja.sql. Pode correr mais de uma vez.
--
-- O que faz:
--   1. Cria o bucket PÚBLICO `fotos`: qualquer pessoa vê uma foto se tiver o endereço (o cardápio é público),
--      mas ninguém sem login consegue listar os ficheiros. Só aceita WebP, JPEG e PNG até 2 MB
--      (a app já envia imagens reduzidas, por volta de 100 a 200 KB).
--   2. Cada loja só escreve na sua pasta: o ficheiro fica em `<slug-da-loja>/<nome-aleatório>.webp`.
--      Só o dono dessa loja (ou o administrador) envia, lê a lista, substitui e apaga.
--      O garçom e a cozinha não escrevem fotos.
--   3. No estado da loja passa a guardar-se só o endereço da imagem, em vez da imagem inteira.
--
-- As fotos antigas (guardadas dentro dos dados da loja) migram pelo botão
-- "Mover fotos para o armazenamento", em Produtos (painel do dono). Não perde nenhuma.

-- ---------------------------------------------------------------- 1. bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- 2. quem escreve
-- dono da loja `s` (ou administrador). É usada nas regras do Storage, por isso o utilizador com login pode executá-la.
create or replace function app_private.eh_dono(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select app_private.is_super_admin()
      or (app_private.loja_ativa(s) and exists (
            select 1 from public.membros m
            where m.user_id = auth.uid() and m.loja = s and m.papel = 'dono'))
$$;
revoke execute on function app_private.eh_dono(text) from public, anon;
grant execute on function app_private.eh_dono(text) to authenticated;

-- limpa regras antigas só deste bucket e recria
drop policy if exists "fotos dono ve" on storage.objects;
drop policy if exists "fotos dono envia" on storage.objects;
drop policy if exists "fotos dono substitui" on storage.objects;
drop policy if exists "fotos dono apaga" on storage.objects;

-- O caminho tem de ser `<loja>/<ficheiro>` (uma pasta só) e a loja tem de ser do utilizador.
create policy "fotos dono ve" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and app_private.eh_dono((storage.foldername(name))[1]));

create policy "fotos dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and array_length(storage.foldername(name), 1) = 1
              and app_private.eh_dono((storage.foldername(name))[1]));

create policy "fotos dono substitui" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and app_private.eh_dono((storage.foldername(name))[1]))
  with check (bucket_id = 'fotos' and array_length(storage.foldername(name), 1) = 1
              and app_private.eh_dono((storage.foldername(name))[1]));

create policy "fotos dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and app_private.eh_dono((storage.foldername(name))[1]));
