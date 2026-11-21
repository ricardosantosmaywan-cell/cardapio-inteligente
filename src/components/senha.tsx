"use client";
import { FormEvent, useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { Modal, useToast } from "@/components/ui";

export const SENHA_MIN = 8;

const traduz = (msg: string) =>
  /different from the old/i.test(msg) ? "A nova senha deve ser diferente da atual."
  : /weak|at least|characters/i.test(msg) ? `Escolha uma senha mais forte, com pelo menos ${SENHA_MIN} caracteres.`
  : "Não foi possível alterar a senha. Tente de novo.";

/**
 * Troca a senha de quem está logado. Confirma a senha atual (entra de novo com ela) e só depois altera.
 * Também limpa a marca "senha temporária" (trocar_senha). Devolve a mensagem de erro, ou null se correu bem.
 */
export async function trocarSenha(email: string, atual: string, nova: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "A troca de senha precisa do Supabase.";
  if (nova.length < SENHA_MIN) return `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (nova === atual) return "A nova senha deve ser diferente da atual.";
  const { error: e1 } = await sb.auth.signInWithPassword({ email, password: atual });
  if (e1) return "Senha atual incorreta.";
  const { error: e2 } = await sb.auth.updateUser({ password: nova, data: { trocar_senha: false } });
  return e2 ? traduz(e2.message) : null;
}

function Campos({ email, atualLabel, onFeito, onCancelar }: { email: string; atualLabel: string; onFeito: () => void; onCancelar?: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [rep, setRep] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (nova !== rep) return setErr("As duas senhas novas não são iguais.");
    setBusy(true);
    const r = await trocarSenha(email, atual, nova);
    setBusy(false);
    if (r) setErr(r);
    else onFeito();
  };

  return (
    <form className="stack" onSubmit={enviar}>
      <div className="field">
        <label htmlFor="sn-atual">{atualLabel}<span className="req"> *</span></label>
        <input id="sn-atual" className="input" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="sn-nova">Nova senha<span className="req"> *</span></label>
        <input id="sn-nova" className="input" type="password" autoComplete="new-password" minLength={SENHA_MIN} value={nova} onChange={(e) => setNova(e.target.value)} required />
        <span className="hint">Pelo menos {SENHA_MIN} caracteres.</span>
      </div>
      <div className="field">
        <label htmlFor="sn-rep">Repetir a nova senha<span className="req"> *</span></label>
        <input id="sn-rep" className="input" type="password" autoComplete="new-password" value={rep} onChange={(e) => setRep(e.target.value)} required />
      </div>
      {err && <div className="alert bad" role="alert">{err}</div>}
      <div className="row">
        {onCancelar && <button type="button" className="btn grow" onClick={onCancelar}>Cancelar</button>}
        <button className="btn primary grow" disabled={busy || !atual || !nova || !rep}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
      </div>
    </form>
  );
}

/** Botão "Senha" do topo: abre a janela para trocar a própria senha. */
export function BotaoSenha({ email }: { email: string }) {
  const [aberto, setAberto] = useState(false);
  const toast = useToast();
  return (
    <>
      <button className="btn sm" onClick={() => setAberto(true)} aria-label="Alterar a minha senha">
        <KeyRound className="icon" size={17} aria-hidden="true" />Senha
      </button>
      {aberto && (
        <Modal title="Alterar senha" onClose={() => setAberto(false)}>
          <p className="muted small">Conta: <b>{email}</b></p>
          <Campos email={email} atualLabel="Senha atual" onCancelar={() => setAberto(false)} onFeito={() => { setAberto(false); toast.show("Senha alterada"); }} />
        </Modal>
      )}
      {toast.node}
    </>
  );
}

/** Ecrã obrigatório no 1.º acesso com senha temporária: o utilizador escolhe a sua própria senha. */
export function SenhaObrigatoria({ email, onSair }: { email: string; onSair: () => void }) {
  return (
    <div className="screen-center">
      <span className="logo xl" style={{ alignSelf: "center" }} aria-hidden="true"><KeyRound size={34} /></span>
      <div className="center stack" style={{ gap: 6 }}>
        <h1>Defina a sua senha</h1>
        <p className="muted">Você entrou com uma senha temporária. Escolha uma senha só sua para continuar.</p>
        <p className="muted small">Conta: <b>{email}</b></p>
      </div>
      {/* ao guardar, a sessão atualiza-se sozinha e o acesso abre */}
      <Campos email={email} atualLabel="Senha temporária" onFeito={() => {}} />
      <button className="btn ghost block" onClick={onSair}><LogOut className="icon" size={17} aria-hidden="true" />Sair</button>
    </div>
  );
}
