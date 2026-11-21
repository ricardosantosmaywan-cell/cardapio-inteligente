-- Para um projeto que já correu a versão anterior (funções em `public`):
-- move as funções auxiliares para o esquema privado e tira-as da API pública (RPC).
create schema if not exists app_private;
grant usage on schema app_private to anon, authenticated;

alter function public.is_super_admin() set schema app_private;
alter function public.loja_ativa(text) set schema app_private;
alter function public.app_state_limite_mesas() set schema app_private;

revoke execute on function app_private.app_state_limite_mesas() from public, anon, authenticated;
