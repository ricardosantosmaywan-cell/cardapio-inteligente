import { json, naoAutorizado, requireSuperAdmin, seguro, tempPassword } from "@/lib/server-admin";

export const dynamic = "force-dynamic";

/** Suspende/reativa a loja ou redefine a senha do dono (devolve a nova senha uma única vez). */
export const PATCH = (req: Request, ctx: { params: { slug: string } }) => seguro(() => alterar(req, ctx));
async function alterar(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireSuperAdmin(req);
  if (!ctx) return naoAutorizado();
  const { sb } = ctx;
  const b = (await req.json().catch(() => null)) as { ativo?: boolean; resetSenha?: boolean; limiteMesas?: number } | null;

  if (typeof b?.ativo === "boolean") {
    const { error } = await sb.from("lojas").update({ ativo: b.ativo }).eq("slug", params.slug);
    if (error) return json({ erro: error.message }, 500);
    return json({ ok: true });
  }

  if (b?.limiteMesas !== undefined) {
    const n = Math.floor(Number(b.limiteMesas));
    if (!Number.isFinite(n) || n < 1 || n > 500) return json({ erro: "O limite de mesas deve estar entre 1 e 500." }, 400);
    const { error } = await sb.from("lojas").update({ limite_mesas: n }).eq("slug", params.slug);
    if (error) return json({ erro: error.message }, 500);
    return json({ ok: true, limiteMesas: n });
  }

  if (b?.resetSenha) {
    const { data: m } = await sb.from("membros").select("user_id").eq("loja", params.slug).eq("papel", "dono").limit(1).maybeSingle();
    if (!m) return json({ erro: "Esta loja ainda não tem dono." }, 404);
    const senha = tempPassword();
    const { error } = await sb.auth.admin.updateUserById(m.user_id, { password: senha, user_metadata: { trocar_senha: true } });
    if (error) return json({ erro: error.message }, 500);
    return json({ senhaTemporaria: senha });
  }

  return json({ erro: "Nada para alterar." }, 400);
}
