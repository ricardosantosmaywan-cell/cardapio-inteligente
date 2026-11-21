/**
 * Só para código de servidor (rotas /api/admin). Usa a chave de serviço do Supabase,
 * que NUNCA pode ir para o navegador: não a coloque em variáveis NEXT_PUBLIC_*.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta configurar a chave secreta do servidor (SUPABASE_SERVICE_ROLE_KEY) na Vercel e fazer Redeploy.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Confirma que quem chama está logado e é super admin. Devolve null se não for. */
export async function requireSuperAdmin(req: Request) {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const sb = adminClient();
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: row } = await sb.from("super_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return row ? { sb, userId: data.user.id } : null;
}

export const tempPassword = () => randomBytes(9).toString("base64url");
export const newToken = () => randomBytes(18).toString("hex");

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const naoAutorizado = () => json({ erro: "Sem permissão." }, 403);

/** Corre o código da rota e devolve o erro real em JSON (ex.: variável de ambiente em falta). */
export async function seguro(f: () => Promise<Response>): Promise<Response> {
  try {
    return await f();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado no servidor.";
    return json({ erro: msg }, 500);
  }
}
