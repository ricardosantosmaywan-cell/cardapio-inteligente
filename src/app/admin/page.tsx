"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabase, REMOTE } from "@/lib/supabase";
import { Check, Copy, ExternalLink, KeyRound, LogOut, Pause, Pencil, Play, Plus, Store, UserRound } from "lucide-react";
import { ClientOnly, Copiavel, EmptyState, ErrorState, Modal, Skeleton, useToast } from "@/components/ui";
import { BotaoSenha } from "@/components/senha";
import { createLocal, listLocal, setAtivoLocal, setLimiteLocal, usadasLocal } from "@/lib/local-lojas";

type Loja = { slug: string; nome: string; moeda: "BRL" | "EUR"; ativo: boolean; criado_em: string; donos: string[]; limite_mesas: number; mesas_usadas: number };
type Criada = { slug: string; nome: string; senhaTemporaria?: string; donoJaExistia?: boolean; email?: string };

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { data } = await getSupabase()!.auth.getSession();
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 403) throw new Error("Sua sessão expirou ou você não tem permissão. Clique em Sair e entre de novo.");
  if (!r.ok) throw new Error(j.erro || "Erro inesperado.");
  return j as T;
}

type Novo = { nome: string; slug: string; moeda: "BRL" | "EUR"; mesas: number; emailDono: string };

/** Duas origens para a mesma tela: Supabase (real) ou localStorage (modo local). */
type Backend = {
  local: boolean;
  listar: () => Promise<Loja[]>;
  criar: (n: Novo) => Promise<{ slug: string; senhaTemporaria?: string; donoJaExistia?: boolean }>;
  alternar: (slug: string, ativo: boolean) => Promise<void>;
  alterarLimite: (slug: string, n: number) => Promise<void>;
  redefinir?: (slug: string) => Promise<string>;
};

const remoteBackend: Backend = {
  local: false,
  listar: () => api<Loja[]>("/api/admin/lojas", "GET"),
  criar: (n) => api("/api/admin/lojas", "POST", n),
  alternar: async (slug, ativo) => void (await api(`/api/admin/lojas/${slug}`, "PATCH", { ativo })),
  alterarLimite: async (slug, n) => void (await api(`/api/admin/lojas/${slug}`, "PATCH", { limiteMesas: n })),
  redefinir: async (slug) => (await api<{ senhaTemporaria: string }>(`/api/admin/lojas/${slug}`, "PATCH", { resetSenha: true })).senhaTemporaria,
};

const localBackend: Backend = {
  local: true,
  listar: async () => listLocal().map((l) => ({ ...l, donos: [], mesas_usadas: usadasLocal(l.slug) })),
  criar: async (n) => {
    createLocal(n);
    return { slug: n.slug };
  },
  alternar: async (slug, ativo) => setAtivoLocal(slug, ativo),
  alterarLimite: async (slug, n) => {
    if (!Number.isFinite(n) || n < 1 || n > 500) throw new Error("O limite de mesas deve estar entre 1 e 500.");
    if (slug !== "demo") setLimiteLocal(slug, n);
  },
};

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await getSupabase()!.auth.signInWithPassword({ email: email.trim(), password: senha });
    setBusy(false);
    if (error) setErr("E-mail ou senha incorretos.");
    else onDone();
  };
  return (
    <div className="screen-center">
      <span className="logo xl" style={{ alignSelf: "center", borderRadius: 22 }} aria-hidden="true"><Store size={34} /></span>
      <div className="center stack" style={{ gap: 4 }}>
        <h1>Administração</h1>
        <p className="muted">Plataforma Cardápio inteligente</p>
      </div>
      <form className="stack" onSubmit={submit}>
        <div className="field"><label htmlFor="ae">E-mail<span className="req"> *</span></label><input id="ae" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="as">Senha<span className="req"> *</span></label><input id="as" className="input" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></div>
        {err && <div className="alert bad" role="alert">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}

function NovaLoja({ backend, onClose, onCriada }: { backend: Backend; onClose: () => void; onCriada: (c: Criada) => void }) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [moeda, setMoeda] = useState<"BRL" | "EUR">("BRL");
  const [mesas, setMesas] = useState("5");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const slugErr = /já existe/i.test(err);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await backend.criar({ nome, slug, moeda, mesas: Number(mesas), emailDono: email });
      onCriada({ ...r, nome, email: email.trim() || undefined });
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Modal title="Nova loja" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {err && !slugErr && <div className="alert bad" role="alert">{err}</div>}
        <div className="field">
          <label htmlFor="ln">Nome da loja<span className="req"> *</span></label>
          <input id="ln" className="input" value={nome} placeholder="Ex.: Hamburgueria do Zé" onChange={(e) => { setNome(e.target.value); if (!slugManual) setSlug(slugify(e.target.value)); }} required />
        </div>
        <div className={`field${slugErr ? " error" : ""}`}>
          <label htmlFor="ls">Endereço (link da loja)</label>
          <input id="ls" className="input" value={slug} onChange={(e) => { setSlugManual(true); setSlug(slugify(e.target.value)); }} required />
          {slugErr ? <span className="error-text">Este endereço já existe. Escolha outro.</span> : <span className="hint">Gerado a partir do nome. Você pode editar.</span>}
          <span className="hint">Prévia: <code>/l/{slug || "endereço"}</code></span>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="field grow">
            <label htmlFor="lm">Moeda</label>
            <select id="lm" className="select" value={moeda} onChange={(e) => setMoeda(e.target.value as "BRL" | "EUR")}>
              <option value="BRL">Real (R$)</option>
              <option value="EUR">Euro (€)</option>
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="lt">Mesas contratadas</label>
            <input id="lt" className="input" type="number" min={1} max={60} value={mesas} onChange={(e) => setMesas(e.target.value)} required />
            <span className="hint">De 1 a 60. É o limite de mesas da loja; você pode aumentar depois.</span>
          </div>
        </div>
        {backend.local ? (
          <div className="alert info small">Modo local: o login do dono é simulado (qualquer e-mail e senha entram). Com o Supabase configurado, aqui criamos o acesso real do dono.</div>
        ) : (
          <div className="field">
            <label htmlFor="le">E-mail do dono (opcional)</label>
            <input id="le" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dono@loja.com" />
            <span className="hint">Criamos o acesso do dono com uma senha temporária que aparece uma única vez.</span>
          </div>
        )}
        <div className="row">
          <button type="button" className="btn grow" onClick={onClose}>Cancelar</button>
          <button className="btn primary grow" disabled={busy}>{busy ? "Criando…" : "Criar loja"}</button>
        </div>
      </form>
    </Modal>
  );
}

function LimiteMesas({ loja, onClose, onSalvar }: { loja: Loja; onClose: () => void; onSalvar: (n: number) => Promise<string | void> }) {
  const [n, setN] = useState(String(loja.limite_mesas));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const valor = Math.floor(Number(n));
  const abaixo = Number.isFinite(valor) && valor < loja.mesas_usadas;
  return (
    <Modal title="Limite de mesas" onClose={onClose}>
      <p>Loja <b>{loja.nome}</b>. Em uso agora: <b>{loja.mesas_usadas}</b> {loja.mesas_usadas === 1 ? "mesa" : "mesas"}.</p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          const r = await onSalvar(valor);
          if (r) setErr(r);
          setBusy(false);
        }}
      >
        <div className="field">
          <label htmlFor="lim">Mesas contratadas</label>
          <input id="lim" className="input" type="number" min={1} max={500} value={n} onChange={(e) => setN(e.target.value)} required />
          <span className="hint">O dono só consegue criar mesas até este limite. De 1 a 500.</span>
        </div>
        {abaixo && <div className="alert warn small">A loja já usa mais mesas do que este limite. Nenhuma mesa é apagada, mas o dono não poderá criar novas até ficar abaixo dele.</div>}
        {err && <div className="alert bad" role="alert">{err}</div>}
        <div className="row">
          <button type="button" className="btn grow" onClick={onClose}>Cancelar</button>
          <button className="btn primary grow" disabled={busy || !Number.isFinite(valor)}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function Painel({ email, onSair, backend }: { email: string; onSair?: () => void; backend: Backend }) {
  const [lojas, setLojas] = useState<Loja[] | null>(null);
  const [erro, setErro] = useState("");
  const [nova, setNova] = useState(false);
  const [criada, setCriada] = useState<Criada | null>(null);
  const [reset, setReset] = useState<{ nome: string; senha: string } | null>(null);
  const [suspender, setSuspender] = useState<Loja | null>(null);
  const [limite, setLimite] = useState<Loja | null>(null);
  const toast = useToast();

  const carregar = useCallback(async () => {
    try {
      setLojas(await backend.listar());
      setErro("");
    } catch (e) {
      setErro((e as Error).message || "Não foi possível carregar as lojas");
    }
  }, [backend]);
  useEffect(() => void carregar(), [carregar]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const host = origin.replace(/^https?:\/\//, "");
  const copiar = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.show("Copiado"));

  const mudarEstado = async (l: Loja, ativo: boolean) => {
    try {
      await backend.alternar(l.slug, ativo);
      setSuspender(null);
      await carregar();
    } catch (e) {
      toast.show((e as Error).message);
    }
  };

  const redefinir = async (l: Loja) => {
    if (!confirm(`Gerar uma nova senha temporária para o dono de “${l.nome}”? A senha atual deixa de funcionar.`)) return;
    try {
      setReset({ nome: l.nome, senha: await backend.redefinir!(l.slug) });
    } catch (e) {
      toast.show((e as Error).message);
    }
  };

  return (
    <>
      <div className="topbar no-print">
        <div className="topbar-inner">
          <span className="logo" style={{ borderRadius: 11, width: 36, height: 36 }} aria-hidden="true"><Store size={20} /></span>
          <span className="brandname grow">Administração</span>
          <span className="row muted small" style={{ gap: 8 }}><UserRound size={16} aria-hidden="true" />{email}</span>
          {!backend.local && <BotaoSenha email={email} />}
          {onSair && <button className="btn sm" onClick={onSair}><LogOut className="icon" size={17} aria-hidden="true" />Sair</button>}
        </div>
      </div>
      <main className="shell">
        <div className="row between wrap">
          <h1>Lojas</h1>
          <button className="btn primary" onClick={() => setNova(true)}><Plus className="icon" size={19} aria-hidden="true" />Nova loja</button>
        </div>
        {backend.local && <div className="alert info small">Modo local (sem Supabase): as lojas ficam guardadas só neste navegador. Serve para experimentar; para uso real configure o Supabase (ver README).</div>}

        {erro ? (
          <div className="card"><ErrorState title="Não foi possível carregar as lojas" hint={erro === "Erro inesperado." ? "Verifique a internet e tente de novo." : erro} onRetry={() => void carregar()} /></div>
        ) : !lojas ? (
          <div className="card stack" aria-busy="true" aria-label="Carregando"><Skeleton h={22} w="30%" /><Skeleton h={48} /><Skeleton h={48} /><Skeleton h={48} /></div>
        ) : lojas.length === 0 ? (
          <div className="card"><EmptyState title="Ainda não há lojas." hint="Crie a primeira."><button className="btn primary" onClick={() => setNova(true)}><Plus className="icon" size={19} aria-hidden="true" />Nova loja</button></EmptyState></div>
        ) : (
          <div className="card table-scroll">
            <table className="data">
              <thead><tr><th>Loja</th><th>Endereço</th><th>Dono</th><th>Moeda</th><th>Mesas</th><th>Estado</th><th>Ações</th></tr></thead>
              <tbody>
                {lojas.map((l) => (
                  <tr key={l.slug}>
                    <td className="bold" data-label="Loja">{l.nome}</td>
                    <td data-label="Endereço"><code>/l/{l.slug}</code></td>
                    <td className="small" data-label="Dono">{backend.local ? <span className="muted">simulado</span> : l.donos.length ? l.donos.join(", ") : <span className="muted">sem dono</span>}</td>
                    <td data-label="Moeda">{l.moeda === "BRL" ? "R$" : "€"}</td>
                    <td data-label="Mesas">
                      <button
                        className="btn sm ghost"
                        style={{ fontVariantNumeric: "tabular-nums", color: l.mesas_usadas >= l.limite_mesas ? "var(--warn-fg)" : undefined }}
                        onClick={() => setLimite(l)}
                        aria-label={`Limite de mesas de ${l.nome}: ${l.mesas_usadas} de ${l.limite_mesas} em uso. Alterar`}
                        disabled={l.slug === "demo"}
                      >
                        <b>{l.mesas_usadas}</b> / {l.limite_mesas}{l.slug !== "demo" && <Pencil className="icon" size={14} aria-hidden="true" />}
                      </button>
                    </td>
                    <td data-label="Estado">
                      <span className={`badge ${l.ativo ? "ok" : "bad"}`}>{l.ativo ? <Check size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{l.ativo ? "Ativa" : "Suspensa"}</span>
                    </td>
                    <td data-label="">
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(130px, 1fr))", gap: 8, minWidth: 290 }}>
                        <Link className="btn sm" href={`/l/${l.slug}/dono`} target="_blank">Painel do dono<ExternalLink className="icon" size={15} aria-hidden="true" /></Link>
                        <button className="btn sm" onClick={() => copiar(`${origin}/l/${l.slug}`)}><Copy className="icon" size={15} aria-hidden="true" />Copiar link</button>
                        {backend.redefinir && l.donos.length > 0 ? <button className="btn sm" onClick={() => redefinir(l)}><KeyRound className="icon" size={15} aria-hidden="true" />Nova senha</button> : <span />}
                        {l.slug === "demo" ? <span /> : l.ativo
                          ? <button className="btn sm solid-danger" onClick={() => setSuspender(l)}><Pause className="icon" size={15} aria-hidden="true" />Suspender</button>
                          : <button className="btn sm" onClick={() => mudarEstado(l, true)}><Play className="icon" size={15} aria-hidden="true" />Reativar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {nova && (
        <NovaLoja
          backend={backend}
          onClose={() => setNova(false)}
          onCriada={(c) => { setNova(false); setCriada(c); void carregar(); }}
        />
      )}

      {limite && (
        <LimiteMesas
          loja={limite}
          onClose={() => setLimite(null)}
          onSalvar={async (n) => {
            try {
              await backend.alterarLimite(limite.slug, n);
              setLimite(null);
              toast.show("Limite de mesas atualizado");
              await carregar();
            } catch (e) {
              return (e as Error).message;
            }
          }}
        />
      )}

      {suspender && (
        <Modal title={`Suspender “${suspender.nome}”?`} onClose={() => setSuspender(null)}>
          <p>Os clientes deixam de ver o cardápio e a equipe não consegue entrar. Os dados não são apagados: você pode reativar a loja quando quiser.</p>
          <div className="row">
            <button className="btn grow" onClick={() => setSuspender(null)}>Cancelar</button>
            <button className="btn solid-danger grow" onClick={() => mudarEstado(suspender, false)}>Suspender</button>
          </div>
        </Modal>
      )}

      {criada && (
        <Modal title="Loja criada" onClose={() => setCriada(null)}>
          <div className="stack" style={{ gap: 6 }}>
            <b style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem" }}>{criada.nome}</b>
            <span className="small muted" style={{ fontWeight: 600 }}>Link da loja</span>
            <Copiavel valor={`${host}/l/${criada.slug}`} copia={`${origin}/l/${criada.slug}`} label="link da loja" onCopiar={copiar} />
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <b>Acesso do dono</b>
            {criada.senhaTemporaria ? (
              <>
                <div>{criada.email}</div>
                <span className="small muted" style={{ fontWeight: 600 }}>Senha temporária</span>
                <Copiavel valor={criada.senhaTemporaria} label="senha temporária" onCopiar={copiar} />
                <div className="alert warn small"><b>Esta senha aparece só agora.</b> Envie ao dono por um canal seguro.</div>
              </>
            ) : criada.donoJaExistia ? (
              <div className="alert info small"><b>O e-mail já tinha conta e foi ligado a esta loja.</b> O dono entra com a senha que já usa.</div>
            ) : backend.local ? (
              <div className="alert info small">Modo local: abra o painel do dono e entre com qualquer e-mail e senha.</div>
            ) : (
              <div className="alert info small"><b>Sem dono ainda.</b> A loja foi criada sem e-mail de dono.</div>
            )}
          </div>
          <p className="muted small">Próximo passo: abra o painel do dono e cadastre categorias e produtos.</p>
          <div className="row">
            <Link className="btn grow" href={`/l/${criada.slug}/dono`} target="_blank">Painel do dono<ExternalLink className="icon" size={16} aria-hidden="true" /></Link>
            <button className="btn primary grow" onClick={() => setCriada(null)}>Concluir</button>
          </div>
        </Modal>
      )}

      {reset && (
        <Modal title="Nova senha temporária" onClose={() => setReset(null)}>
          <p>Nova senha temporária para o dono de <b>{reset.nome}</b>.</p>
          <Copiavel valor={reset.senha} label="senha temporária" onCopiar={copiar} />
          <div className="alert warn small"><b>Esta senha aparece só agora.</b> Envie ao dono por um canal seguro.</div>
          <button className="btn primary block" onClick={() => setReset(null)}>Concluir</button>
        </Modal>
      )}
      {toast.node}
    </>
  );
}

function Admin() {
  const [st, setSt] = useState<{ state: "loading" } | { state: "out" } | { state: "denied"; email: string } | { state: "ok"; email: string }>({ state: "loading" });

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return setSt({ state: "out" });
    const { data: sa } = await sb.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    setSt(sa ? { state: "ok", email: user.email ?? "" } : { state: "denied", email: user.email ?? "" });
  }, []);

  useEffect(() => {
    void refresh();
    const sub = getSupabase()?.auth.onAuthStateChange(() => void refresh());
    return () => sub?.data.subscription.unsubscribe();
  }, [refresh]);

  const sair = () => void getSupabase()?.auth.signOut({ scope: "local" });

  if (!REMOTE) return <Painel email="modo local" backend={localBackend} />;
  if (st.state === "loading") return null;
  if (st.state === "out") return <Login onDone={() => void refresh()} />;
  if (st.state === "denied") {
    return (
      <div className="screen-center">
        <div className="big-emoji">🔒</div>
        <h1 className="center">Sem acesso</h1>
        <p className="muted center">{st.email} não é administrador.</p>
        <button className="btn block" onClick={sair}>Sair</button>
      </div>
    );
  }
  return <Painel email={st.email} onSair={sair} backend={remoteBackend} />;
}

export default function Page() {
  return <ClientOnly><Admin /></ClientOnly>;
}
