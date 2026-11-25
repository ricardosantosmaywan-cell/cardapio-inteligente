"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CookingPot, KeyRound, Trash2, UserPlus } from "lucide-react";
import { Copiavel, EmptyState, ErrorState, Modal, Skeleton, Switch, useToast } from "@/components/ui";
import { useLoja } from "@/components/loja";
import { getSupabase, REMOTE } from "@/lib/supabase";
import { setKitchenConfig, useDB } from "@/lib/store";
import { kitchenCfg } from "@/lib/utils";

type Papel = "garcom" | "cozinha";
type Membro = { id: string; email: string; papel: Papel };
const PAPEL_LABEL: Record<Papel, string> = { garcom: "Garçom", cozinha: "Cozinha" };

/** Chama a API da equipe com a sessão do dono. */
async function api<T>(slug: string, path: string, method: string, body?: unknown): Promise<T> {
  const { data } = await getSupabase()!.auth.getSession();
  const r = await fetch(`/api/loja/${slug}/equipe${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 403) throw new Error("Sua sessão expirou ou você não tem permissão. Clique em Sair e entre de novo.");
  if (!r.ok) throw new Error(j.erro || "Erro inesperado.");
  return j as T;
}

/** Liga ou desliga a tela da cozinha desta loja e define a partir de quantos minutos um pedido fica destacado. */
function CozinhaConfig() {
  const db = useDB();
  const { base } = useLoja();
  const cfg = kitchenCfg(db);
  const [min, setMin] = useState(String(cfg.alertMin));
  useEffect(() => setMin(String(cfg.alertMin)), [cfg.alertMin]);
  const n = Number(min);
  const valido = Number.isInteger(n) && n >= 1 && n <= 120;

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (valido) setKitchenConfig({ ...cfg, alertMin: n });
  };

  return (
    <section className="card stack" aria-labelledby="cz-titulo">
      <div className="row between wrap">
        <h2 id="cz-titulo" className="row" style={{ gap: 10 }}><CookingPot size={24} aria-hidden="true" />Tela da cozinha</h2>
        <Switch checked={cfg.enabled} onChange={(v) => setKitchenConfig({ ...cfg, enabled: v })} label="Usar nesta loja" />
      </div>
      <p className="muted small">
        A cozinha vê os pedidos das mesas abertas (mesa, itens, quantidades e observações), sem preços nem dados dos clientes,
        e marca cada um como <b>em preparação</b> e <b>pronto</b>. O garçom é avisado quando fica pronto. Num espaço pequeno o
        garçom pode bastar: deixe desligada.
      </p>
      <form className="row wrap" style={{ alignItems: "flex-end" }} onSubmit={guardar}>
        <div className={`field${valido ? "" : " error"}`} style={{ maxWidth: 320 }}>
          <label htmlFor="cz-min">Destacar pedidos à espera há mais de (minutos)</label>
          <input id="cz-min" className="input" type="number" min={1} max={120} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} />
          {!valido && <span className="error-text">Entre 1 e 120 minutos.</span>}
        </div>
        <button className="btn" type="submit" disabled={!valido || n === cfg.alertMin}>Guardar</button>
        {cfg.enabled && <Link href={`${base}/cozinha`} className="btn primary">Abrir a tela da cozinha ↗</Link>}
      </form>
    </section>
  );
}

export default function Equipe() {
  const { slug } = useLoja();
  const db = useDB();
  const toast = useToast();
  const [lista, setLista] = useState<Membro[] | null>(null);
  const [erro, setErro] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("garcom");
  const [formErro, setFormErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [senha, setSenha] = useState<{ titulo: string; email: string; papel: Papel; senha?: string; ligada?: boolean } | null>(null);
  const [remover, setRemover] = useState<Membro | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await api<Membro[]>(slug, "", "GET"));
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [slug]);
  useEffect(() => {
    if (REMOTE) void carregar();
  }, [carregar]);

  const copiar = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.show("Copiado"));

  if (!REMOTE) {
    return (
      <main className="shell">
        <h1>Equipe</h1>
        <CozinhaConfig />
        <div className="alert info">A gestão da equipe precisa do Supabase. No modo local de demonstração o login do garçom e da cozinha é simulado.</div>
      </main>
    );
  }

  const adicionar = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormErro("");
    try {
      const r = await api<{ email: string; papel: Papel; senhaTemporaria?: string; jaTinhaConta: boolean }>(slug, "", "POST", { email, papel });
      setEmail("");
      setSenha({ titulo: `${PAPEL_LABEL[r.papel]}: acesso criado`, email: r.email, papel: r.papel, senha: r.senhaTemporaria, ligada: r.jaTinhaConta });
      await carregar();
    } catch (e) {
      setFormErro((e as Error).message);
    }
    setBusy(false);
  };

  const novaSenha = async (m: Membro) => {
    if (!confirm(`Gerar uma nova senha temporária para ${m.email}? A senha atual deixa de funcionar.`)) return;
    try {
      const r = await api<{ senhaTemporaria: string }>(slug, `/${m.id}`, "PATCH", { resetSenha: true });
      setSenha({ titulo: "Nova senha temporária", email: m.email, papel: m.papel, senha: r.senhaTemporaria });
    } catch (e) {
      toast.show((e as Error).message);
    }
  };

  const confirmarRemocao = async () => {
    if (!remover) return;
    try {
      await api(slug, `/${remover.id}`, "DELETE");
      setRemover(null);
      toast.show("Acesso removido");
      await carregar();
    } catch (e) {
      setRemover(null);
      toast.show((e as Error).message);
    }
  };

  return (
    <main className="shell">
      <div className="stack" style={{ gap: 6 }}>
        <h1>Equipe</h1>
        <p className="muted">
          Crie o acesso de cada pessoa. O <b>garçom</b> vê só as mesas, os pedidos e os produtos em falta, sem produtos, preços,
          ofertas nem relatório. A <b>cozinha</b> vê só os pedidos a preparar, sem preços nem dados dos clientes.
        </p>
      </div>

      <CozinhaConfig />

      <form className="card stack" onSubmit={adicionar}>
        <div className="row wrap" style={{ alignItems: "flex-end" }}>
          <div className="field grow" style={{ minWidth: 240 }}>
            <label htmlFor="eq-email">E-mail</label>
            <input id="eq-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" required />
          </div>
          <div className="field">
            <label htmlFor="eq-papel">Função</label>
            <select id="eq-papel" className="select" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              <option value="garcom">Garçom</option>
              <option value="cozinha">Cozinha</option>
            </select>
          </div>
          <button className="btn primary" disabled={busy || !email.trim()}><UserPlus className="icon" size={19} aria-hidden="true" />{busy ? "Adicionando…" : "Adicionar"}</button>
        </div>
        <span className="hint small muted">Criamos o acesso com uma senha temporária que aparece uma única vez. Envie-a por um canal seguro.</span>
        {formErro && <div className="alert bad" role="alert">{formErro}</div>}
      </form>

      {erro ? (
        <div className="card"><ErrorState title="Não foi possível carregar a equipe" hint={erro} onRetry={() => void carregar()} /></div>
      ) : !lista ? (
        <div className="card stack" aria-busy="true" aria-label="Carregando"><Skeleton h={22} w="30%" /><Skeleton h={48} /><Skeleton h={48} /></div>
      ) : lista.length === 0 ? (
        <div className="card"><EmptyState title="Ainda não há ninguém na equipe" hint="Adicione o e-mail do primeiro garçom ou da cozinha acima." /></div>
      ) : (
        <div className="card table-scroll">
          <table className="data">
            <thead><tr><th>E-mail</th><th>Função</th><th>Ações</th></tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td className="bold" data-label="E-mail">{m.email}</td>
                  <td data-label="Função"><span className={`badge${m.papel === "cozinha" ? " info" : ""}`}>{PAPEL_LABEL[m.papel] ?? m.papel}</span></td>
                  <td className="right" data-label="">
                    <button className="btn sm" onClick={() => novaSenha(m)}><KeyRound className="icon" size={15} aria-hidden="true" />Nova senha</button>{" "}
                    <button className="btn sm danger" onClick={() => setRemover(m)}><Trash2 className="icon" size={15} aria-hidden="true" />Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {senha && (
        <Modal title={senha.titulo} onClose={() => setSenha(null)}>
          <p>{PAPEL_LABEL[senha.papel]}: <b>{senha.email}</b></p>
          {senha.senha ? (
            <>
              <span className="small muted" style={{ fontWeight: 600 }}>Senha temporária</span>
              <Copiavel valor={senha.senha} label="senha temporária" onCopiar={copiar} />
              <div className="alert warn small"><b>Esta senha aparece só agora.</b> Envie-a por um canal seguro.</div>
            </>
          ) : (
            <div className="alert info small"><b>O e-mail já tinha conta e foi ligado a esta loja.</b> Entra com a senha que já usa.</div>
          )}
          <p className="muted small">
            Entra pelo link da loja, em <b>{senha.papel === "cozinha" ? "Entrar na cozinha" : "Entrar como garçom"}</b>.
            {senha.papel === "cozinha" && !kitchenCfg(db).enabled && " Lembre-se de ligar a tela da cozinha acima."}
          </p>
          <button className="btn primary block" onClick={() => setSenha(null)}>Concluir</button>
        </Modal>
      )}

      {remover && (
        <Modal title={`Remover ${remover.email}?`} onClose={() => setRemover(null)}>
          <p>Deixa de conseguir entrar nesta loja. A conta não é apagada.</p>
          <div className="row">
            <button className="btn grow" onClick={() => setRemover(null)}>Cancelar</button>
            <button className="btn solid-danger grow" onClick={confirmarRemocao}>Remover</button>
          </div>
        </Modal>
      )}
      {toast.node}
    </main>
  );
}
