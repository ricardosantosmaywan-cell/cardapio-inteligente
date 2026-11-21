import { adminClient, json, naoAutorizado, newToken, requireSuperAdmin, seguro, SLUG_RE, tempPassword } from "@/lib/server-admin";
import { makeStoreSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/** Lista as lojas, com o e-mail do dono de cada uma. */
export const GET = (req: Request) => seguro(() => listar(req));
async function listar(req: Request) {
  const ctx = await requireSuperAdmin(req);
  if (!ctx) return naoAutorizado();
  const { sb } = ctx;
  const { data: lojas, error } = await sb.from("lojas").select("slug,nome,moeda,ativo,criado_em,limite_mesas").order("criado_em", { ascending: false });
  if (error) return json({ erro: error.message }, 500);
  const { data: membros } = await sb.from("membros").select("user_id,loja,papel").eq("papel", "dono");
  const emails = new Map<string, string>();
  for (const id of new Set((membros ?? []).map((m) => m.user_id))) {
    const { data } = await sb.auth.admin.getUserById(id);
    if (data.user?.email) emails.set(id, data.user.email);
  }
  // mesas em uso: tamanho da lista `tables` no estado de cada loja
  const { data: estados } = await sb.from("app_state").select("id, tables:data->tables");
  const usadas = new Map<string, number>();
  for (const e of (estados ?? []) as unknown as { id: string; tables: unknown }[]) usadas.set(e.id, Array.isArray(e.tables) ? e.tables.length : 0);
  return json(
    (lojas ?? []).map((l) => ({
      ...l,
      mesas_usadas: usadas.get(l.slug) ?? 0,
      donos: (membros ?? []).filter((m) => m.loja === l.slug).map((m) => emails.get(m.user_id)).filter(Boolean),
    })),
  );
}

/** Cria uma loja: linha em `lojas`, estado inicial com as mesas e, se houver e-mail, o login do dono. */
export const POST = (req: Request) => seguro(() => criar(req));
async function criar(req: Request) {
  const ctx = await requireSuperAdmin(req);
  if (!ctx) return naoAutorizado();
  const { sb } = ctx;

  const b = (await req.json().catch(() => null)) as { nome?: string; slug?: string; moeda?: string; mesas?: number; emailDono?: string } | null;
  const nome = b?.nome?.trim() ?? "";
  const slug = b?.slug?.trim() ?? "";
  const moeda = b?.moeda === "EUR" ? "EUR" : "BRL";
  const mesas = Math.floor(Number(b?.mesas ?? 5));
  const emailDono = b?.emailDono?.trim().toLowerCase() ?? "";

  if (nome.length < 2 || nome.length > 80) return json({ erro: "Informe o nome da loja (2 a 80 letras)." }, 400);
  if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 40) return json({ erro: "Endereço inválido: use 3 a 40 letras minúsculas, números e hífen." }, 400);
  if (!Number.isFinite(mesas) || mesas < 1 || mesas > 60) return json({ erro: "Número de mesas entre 1 e 60." }, 400);
  if (emailDono && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDono)) return json({ erro: "E-mail do dono inválido." }, 400);

  const { error: eLoja } = await sb.from("lojas").insert({ slug, nome, moeda, limite_mesas: mesas });
  if (eLoja) return json({ erro: eLoja.code === "23505" ? "Já existe uma loja com esse endereço." : eLoja.message }, eLoja.code === "23505" ? 409 : 500);

  const rollback = async (erro: string) => {
    await sb.from("lojas").delete().eq("slug", slug); // apaga também app_state e membros (cascade)
    return json({ erro }, 500);
  };

  const seed = makeStoreSeed({
    name: nome,
    currency: moeda,
    tableNames: Array.from({ length: mesas }, (_, i) => `Mesa ${i + 1}`),
    tokens: Array.from({ length: mesas }, () => newToken()),
  });
  const { error: eEstado } = await sb.from("app_state").insert({ id: slug, data: seed, version: 0 });
  if (eEstado) return rollback(eEstado.message);

  let senhaTemporaria: string | undefined;
  let donoJaExistia = false;
  if (emailDono) {
    const senha = tempPassword();
    const created = await sb.auth.admin.createUser({ email: emailDono, password: senha, email_confirm: true, user_metadata: { trocar_senha: true } });
    let userId = created.data.user?.id;
    if (created.error || !userId) {
      // e-mail já registado: liga a conta existente, sem mexer na senha dela
      const { data: lista } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = lista?.users.find((u) => u.email?.toLowerCase() === emailDono)?.id;
      if (!userId) return rollback(created.error?.message ?? "Não foi possível criar o login do dono.");
      donoJaExistia = true;
    } else senhaTemporaria = senha;
    const { error: eMembro } = await sb.from("membros").insert({ user_id: userId, loja: slug, papel: "dono" });
    if (eMembro) return rollback(eMembro.message);
  }

  return json({ slug, senhaTemporaria, donoJaExistia }, 201);
}
