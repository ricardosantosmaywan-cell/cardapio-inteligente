import { acharUserPorEmail, json, naoAutorizado, requireDonoOuAdmin, seguro, tempPassword } from "@/lib/server-admin";

export const dynamic = "force-dynamic";
type Ctx = { params: { slug: string } };

/** Lista os garçons da loja (só o dono da loja ou o administrador). */
export const GET = (req: Request, ctx: Ctx) =>
  seguro(async () => {
    const auth = await requireDonoOuAdmin(req, ctx.params.slug);
    if (!auth) return naoAutorizado();
    const { sb } = auth;
    const { data: membros, error } = await sb.from("membros").select("user_id").eq("loja", ctx.params.slug).eq("papel", "garcom");
    if (error) return json({ erro: error.message }, 500);
    const lista: { id: string; email: string }[] = [];
    for (const m of membros ?? []) {
      const { data } = await sb.auth.admin.getUserById(m.user_id);
      lista.push({ id: m.user_id, email: data.user?.email ?? "(sem e-mail)" });
    }
    lista.sort((a, b) => a.email.localeCompare(b.email));
    return json(lista);
  });

/** Adiciona um garçom: cria a conta (senha temporária mostrada uma única vez) ou liga uma conta que já existe. */
export const POST = (req: Request, ctx: Ctx) =>
  seguro(async () => {
    const auth = await requireDonoOuAdmin(req, ctx.params.slug);
    if (!auth) return naoAutorizado();
    const { sb } = auth;
    const slug = ctx.params.slug;

    const b = (await req.json().catch(() => null)) as { email?: string } | null;
    const email = b?.email?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ erro: "Informe um e-mail válido." }, 400);

    let userId: string | undefined;
    let senhaTemporaria: string | undefined;
    let jaTinhaConta = false;

    const existente = await acharUserPorEmail(sb, email);
    if (existente) {
      userId = existente.id;
      jaTinhaConta = true;
      const { data: ja } = await sb.from("membros").select("papel").eq("user_id", userId).eq("loja", slug).maybeSingle();
      if (ja?.papel === "dono") return json({ erro: "Esse e-mail é o dono desta loja." }, 409);
      if (ja?.papel === "garcom") return json({ erro: "Esse e-mail já está na equipe." }, 409);
    } else {
      const senha = tempPassword();
      const criado = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { trocar_senha: true } });
      if (criado.error || !criado.data.user) return json({ erro: criado.error?.message ?? "Não foi possível criar a conta do garçom." }, 500);
      userId = criado.data.user.id;
      senhaTemporaria = senha;
    }

    const { error } = await sb.from("membros").insert({ user_id: userId, loja: slug, papel: "garcom" });
    if (error) {
      if (!jaTinhaConta && userId) await sb.auth.admin.deleteUser(userId); // não deixa conta órfã
      return json({ erro: error.message }, 500);
    }
    return json({ id: userId, email, senhaTemporaria, jaTinhaConta }, 201);
  });
