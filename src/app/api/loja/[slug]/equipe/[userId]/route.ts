import { adminClient, json, naoAutorizado, requireDonoOuAdmin, seguro, tempPassword } from "@/lib/server-admin";

export const dynamic = "force-dynamic";
type Ctx = { params: { slug: string; userId: string } };

/** Papéis que o dono gere em Equipe. Nunca o dono, nem membros de outra loja. */
const PAPEIS = ["garcom", "cozinha"];

/** Garante que o alvo é garçom ou cozinha DESTA loja (nunca o dono, nem de outra loja). */
async function membroDaEquipe(sb: ReturnType<typeof adminClient>, slug: string, userId: string) {
  const { data } = await sb.from("membros").select("papel").eq("user_id", userId).eq("loja", slug).in("papel", PAPEIS).maybeSingle();
  return !!data;
}

/** Nova senha temporária. Só se a conta não for usada noutra loja ou como administrador. */
export const PATCH = (req: Request, ctx: Ctx) =>
  seguro(async () => {
    const auth = await requireDonoOuAdmin(req, ctx.params.slug);
    if (!auth) return naoAutorizado();
    const { sb } = auth;
    const { slug, userId } = ctx.params;
    if (!(await membroDaEquipe(sb, slug, userId))) return json({ erro: "Pessoa não encontrada na equipe desta loja." }, 404);

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

/** Remove a pessoa da equipe (corta o acesso a esta loja; a conta não é apagada). */
export const DELETE = (req: Request, ctx: Ctx) =>
  seguro(async () => {
    const auth = await requireDonoOuAdmin(req, ctx.params.slug);
    if (!auth) return naoAutorizado();
    const { sb } = auth;
    const { slug, userId } = ctx.params;
    if (!(await membroDaEquipe(sb, slug, userId))) return json({ erro: "Pessoa não encontrada na equipe desta loja." }, 404);
    const { error } = await sb.from("membros").delete().eq("user_id", userId).eq("loja", slug).in("papel", PAPEIS);
    if (error) return json({ erro: error.message }, 500);
    return json({ ok: true });
  });
