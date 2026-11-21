import { adminClient, json, naoAutorizado, requireDonoOuAdmin, seguro, tempPassword } from "@/lib/server-admin";

export const dynamic = "force-dynamic";
type Ctx = { params: { slug: string; userId: string } };

/** Garante que o alvo é mesmo garçom DESTA loja (nunca o dono, nem de outra loja). */
async function garcomDaLoja(sb: ReturnType<typeof adminClient>, slug: string, userId: string) {
  const { data } = await sb.from("membros").select("papel").eq("user_id", userId).eq("loja", slug).eq("papel", "garcom").maybeSingle();
  return !!data;
}

/** Nova senha temporária para um garçom. Só se a conta não for usada noutra loja ou como administrador. */
export const PATCH = (req: Request, ctx: Ctx) =>
  seguro(async () => {
    const auth = await requireDonoOuAdmin(req, ctx.params.slug);
    if (!auth) return naoAutorizado();
    const { sb } = auth;
    const { slug, userId } = ctx.params;
    if (!(await garcomDaLoja(sb, slug, userId))) return json({ erro: "Garçom não encontrado nesta loja." }, 404);

    const { count: outras } = await sb.from("membros").select("user_id", { count: "exact", head: true }).eq("user_id", userId).neq("loja", slug);
    const { data: sa } = await sb.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
    if ((outras ?? 0) > 0 || sa) {
      return json({ erro: "Esta conta também é usada noutra loja ou como administrador. Peça ao administrador para alterar a senha." }, 409);
    }

    const body = (await req.json().catch(() => null)) as { resetSenha?: boolean } | null;
    if (!body?.resetSenha) return json({ erro: "Nada para alterar." }, 400);
    const senha = tempPassword();
    const { error } = await sb.auth.admin.updateUserById(userId, { password: senha, user_metadata: { trocar_senha: true } });
    if (error) return json({ erro: error.message }, 500);
    return json({ senhaTemporaria: senha });
  });

/** Remove o garçom da loja (corta o acesso dele a esta loja; a conta não é apagada). */
export const DELETE = (req: Request, ctx: Ctx) =>
  seguro(async () => {
    const auth = await requireDonoOuAdmin(req, ctx.params.slug);
    if (!auth) return naoAutorizado();
    const { sb } = auth;
    const { slug, userId } = ctx.params;
    if (!(await garcomDaLoja(sb, slug, userId))) return json({ erro: "Garçom não encontrado nesta loja." }, 404);
    const { error } = await sb.from("membros").delete().eq("user_id", userId).eq("loja", slug).eq("papel", "garcom");
    if (error) return json({ erro: error.message }, 500);
    return json({ ok: true });
  });
