"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { Copiavel, EmptyState, ErrorState, Modal, Skeleton, useToast } from "@/components/ui";
import { useLoja } from "@/components/loja";
import { getSupabase, REMOTE } from "@/lib/supabase";

type Membro = { id: string; email: string };

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

export default function Equipe() {
  const { slug } = useLoja();
  const toast = useToast();
  const [lista, setLista] = useState<Membro[] | null>(null);
  const [erro, setErro] = useState("");
  const [email, setEmail] = useState("");
  const [formErro, setFormErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [senha, setSenha] = useState<{ titulo: string; email: string; senha?: string; ligada?: boolean } | null>(null);
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
        <div className="alert info">A gestão da equipe precisa do Supabase. No modo local de demonstração o login do garçom é simulado.</div>
      </main>
    );
  }

  const adicionar = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormErro("");
    try {
      const r = await api<{ email: string; senhaTemporaria?: string; jaTinhaConta: boolean }>(slug, "", "POST", { email });
      setEmail("");
      setSenha({ titulo: "Garçom adicionado", email: r.email, senha: r.senhaTemporaria, ligada: r.jaTinhaConta });
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
      setSenha({ titulo: "Nova senha temporária", email: m.email, senha: r.senhaTemporaria });
    } catch (e) {
      toast.show((e as Error).message);
    }
  };

  const confirmarRemocao = async () => {
    if (!remover) return;
    try {
      await api(slug, `/${remover.id}`, "DELETE");
      setRemover(null);
      toast.show("Garçom removido");
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
          Crie o acesso de cada garçom. Ele entra em <b>Entrar como garçom</b> e vê só as mesas, os pedidos e os produtos em falta,
          sem produtos, preços, ofertas nem relatório.
        </p>
      </div>

      <form className="card stack" onSubmit={adicionar}>
        <div className="field">
          <label htmlFor="eq-email">E-mail do garçom</label>
          <div className="row" style={{ alignItems: "stretch" }}>
            <input id="eq-email" className="input grow" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="garcom@exemplo.com" required />
            <button className="btn primary" disabled={busy || !email.trim()}><UserPlus className="icon" size={19} aria-hidden="true" />{busy ? "Adicionando…" : "Adicionar"}</button>
          </div>
          <span className="hint">Criamos o acesso com uma senha temporária que aparece uma única vez. Envie-a ao garçom por um canal seguro.</span>
        </div>
        {formErro && <div className="alert bad" role="alert">{formErro}</div>}
      </form>

      {erro ? (
        <div className="card"><ErrorState title="Não foi possível carregar a equipe" hint={erro} onRetry={() => void carregar()} /></div>
      ) : !lista ? (
        <div className="card stack" aria-busy="true" aria-label="Carregando"><Skeleton h={22} w="30%" /><Skeleton h={48} /><Skeleton h={48} /></div>
      ) : lista.length === 0 ? (
        <div className="card"><EmptyState title="Ainda não há garçons" hint="Adicione o e-mail do primeiro garçom acima." /></div>
      ) : (
        <div className="card table-scroll">
          <table className="data">
            <thead><tr><th>Garçom</th><th>Ações</th></tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td className="bold">{m.email}</td>
                  <td className="right">
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
          <p>Garçom: <b>{senha.email}</b></p>
          {senha.senha ? (
            <>
              <span className="small muted" style={{ fontWeight: 600 }}>Senha temporária</span>
              <Copiavel valor={senha.senha} label="senha temporária" onCopiar={copiar} />
              <div className="alert warn small"><b>Esta senha aparece só agora.</b> Envie ao garçom por um canal seguro.</div>
            </>
          ) : (
            <div className="alert info small"><b>O e-mail já tinha conta e foi ligado a esta loja.</b> O garçom entra com a senha que já usa.</div>
          )}
          <p className="muted small">O garçom entra pelo link da loja, em <b>Entrar como garçom</b>.</p>
          <button className="btn primary block" onClick={() => setSenha(null)}>Concluir</button>
        </Modal>
      )}

      {remover && (
        <Modal title={`Remover ${remover.email}?`} onClose={() => setRemover(null)}>
          <p>O garçom deixa de conseguir entrar nesta loja. A conta dele não é apagada.</p>
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
