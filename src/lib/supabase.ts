import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Com as duas variáveis definidas a app usa o Supabase; sem elas, cai para o modo local (demo). */
export const REMOTE = !!(URL_ && ANON);

let client: SupabaseClient | null = null;

/** Cliente do navegador, partilhado entre o store e o login (a sessão fica guardada no navegador). */
export function getSupabase(): SupabaseClient | null {
  if (!REMOTE || typeof window === "undefined") return null;
  return (client ??= createClient(URL_!, ANON!, { auth: { persistSession: true, autoRefreshToken: true } }));
}
