import { acharUserPorEmail, json, naoAutorizado, requireDonoOuAdmin, seguro, tempPassword } from "@/lib/server-admin";

export const dynamic = "force-dynamic";
type Ctx = { params: { slug: string } };

/** Papéis que o dono gere em Equipe (o dono é criado só pelo /admin). */
const PAPEIS = ["garcom", "cozinha"] as const;
type Papel = (typeof PAPEIS)[number];
const NOME: Record<Papel, string> = { garcom: "garçom", cozinha: "cozinha" };

/** Lista a equipe da loja: garçons e cozinha (só o dono da loja ou o administrador). */
export const GET = (req: Request, ctx: Ctx) =>
  seguro(async () => {
    const auth = await requireDonoOuAdmin(req, ctx.params.slug);
    if (!auth) return naoAutorizado();
    const { sb } = auth;
    const { data: membros, error } = await sb.from("membros").select("user_id,papel").eq("loja", ctx.params.slug).in("papel", [...PAPEIS]);
    if (error) return json({ erro: error.message }, 500);
    const lista: { id: string; email: string; papel: Papel }[] = [];
    for (const m of membros ?? []) {
      const { data } = await sb.auth.admin.getUserById(m.user_id);
      lista.push({ id: m.user_id, email: data.user?.email ?? "(sem e-mail)", papel: m.papel as Papel });
    }
    lista.sort((a, b) => a.papel.localeCompare(b.papel) || a.email.localeCompare(b.email));
    return json(lista);
  });

/** Adiciona alguém à equipe: cria a conta (senha temporária mostrada uma única vez) ou liga uma conta que já existe. */
export const POST = (req: Request, ctx: Ctx) =>
  seguro(async () => {
    const auth = await requireDonoOuAdmin(req, ctx.params.slug);
    if (!auth) return naoAutorizado();
    const { sb } = auth;
    const slug = ctx.params.slug;

    const b = (await req.json().catch(() => null)) as { email?: string; papel?: string } | null;
    const email = b?.email?.trim().toLowerCase() ?? "";
    const papel: Papel = b?.papel === "cozinha" ? "cozinha" : "garcom";
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
      if (ja?.papel) return json({ erro: `Esse e-mail já está na equipe (${NOME[ja.papel as Papel] ?? ja.papel}).` }, 409);
    } else {
      const senha = tempPassword();
      const criado = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { trocar_senha: true } });
      if (criado.error || !criado.data.user) return json({ erro: criado.error?.message ?? `Não foi possível criar a conta (${NOME[papel]}).` }, 500);
      userId = criado.data.user.id;
      senhaTemporaria = senha;
    }

    const { error } = await sb.from("membros").insert({ user_id: userId, loja: slug, papel });
    if (error) {
      if (!jaTinhaConta && userId) await sb.auth.admin.deleteUser(userId); // não deixa conta órfã
      const semSql = /membros_papel_check/.test(error.message);
      return json({ erro: semSql ? "Falta aplicar supabase/cozinha.sql no Supabase para criar acessos da cozinha." : error.message }, 500);
    }
    return json({ id: userId, email, papel, senhaTemporaria, jaTinhaConta }, 201);
  });
