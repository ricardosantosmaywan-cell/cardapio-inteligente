"use client";
import Link from "next/link";
import { resetDemo, useDB, useTick } from "@/lib/store";
import { ClientOnly, Qr, mesaUrl } from "@/components/ui";
import { useLoja } from "@/components/loja";
import { REMOTE } from "@/lib/supabase";
import { openSession, tableState } from "@/lib/utils";

const STATE_LABEL = { livre: "Livre", ocupada: "Ocupada", conta: "Pediu a conta", chamou: "Chamou" } as const;

/** Com Supabase: só o nome e os acessos. Os tokens das mesas nunca aparecem aqui (são o segredo de cada QR). */
function Entrada() {
  const db = useDB();
  const { base } = useLoja();
  return (
    <div className="hub-bg">
      <main className="hub">
        <header className="hub-hero stack">
          <h1>🍽️ {db.establishment.name}</h1>
          <p>Cardápio digital por mesa. Clientes: leiam o QR code da sua mesa para ver o cardápio e pedir.</p>
        </header>
        <section className="grid two">
          <Link href={`${base}/garcom`} className="card stack">
            <h2>🧑‍🍳 Garçom</h2>
            <p className="muted small">Mesas, pedidos novos, produtos em falta e fechamento de conta.</p>
            <span className="btn primary">Entrar como garçom</span>
          </Link>
          <Link href={`${base}/dono`} className="card stack">
            <h2>🛠️ Dono</h2>
            <p className="muted small">Produtos, fotos, categorias, ofertas do dia, mesas e QR codes.</p>
            <span className="btn primary">Entrar como dono</span>
          </Link>
        </section>
      </main>
    </div>
  );
}

/** Modo local (sem Supabase): demo completa com os QR de todas as mesas. */
function Demo() {
  const db = useDB();
  const { base, slug } = useLoja();
  useTick();
  return (
    <div className="hub-bg">
      <main className="hub">
        <header className="hub-hero stack">
          <div className="row between wrap">
            <span className="badge brand">DEMO · modo local</span>
            <Link href="/admin" className="btn sm">⚙️ Administração (criar lojas)</Link>
          </div>
          <h1>🍽️ {db.establishment.name} — Cardápio por Mesa</h1>
          <p>
            Abra cada perfil numa aba ou janela diferente. Tudo sincroniza em tempo real entre as abas: peça no
            “celular”, veja chegar no “tablet do garçom” e edite o cardápio no “painel do dono”.
          </p>
        </header>

        <section className="grid two">
          <Link href={`${base}/garcom`} className="card stack" target="_blank">
            <h2>🧑‍🍳 Garçom (tablet)</h2>
            <p className="muted small">Mesas, pedidos novos, esgotados, fechar mesa e renovar QR.</p>
            <span className="btn primary">Abrir tablet do garçom ↗</span>
          </Link>
          <Link href={`${base}/dono`} className="card stack" target="_blank">
            <h2>🛠️ Dono (gestão)</h2>
            <p className="muted small">Produtos, fotos, categorias, ofertas do dia, mesas e QR codes.</p>
            <span className="btn primary">Abrir painel do dono ↗</span>
          </Link>
        </section>

        <section className="stack">
          <div className="row between wrap">
            <h2>📱 Cliente — leia o QR de uma mesa</h2>
            <button className="btn sm danger" onClick={() => confirm("Repor todos os dados de demonstração?") && resetDemo()}>
              Repor dados da demo
            </button>
          </div>
          <p className="muted small">
            Cada aba funciona como um celular diferente. Abra a mesma mesa em duas abas para testar a aprovação de um
            segundo cliente. A Mesa 3 já tem uma conta em curso.
          </p>
          <div className="grid tables">
            {db.tables.map((t) => {
              const st = tableState(db, t);
              return (
                <div key={t.id} className="card stack center" style={{ alignItems: "center" }}>
                  <div className="row between" style={{ width: "100%" }}>
                    <h3>{t.name}</h3>
                    <span className={`badge ${st === "livre" ? "" : st === "ocupada" ? "info" : st === "conta" ? "warn" : "bad"}`}>
                      {STATE_LABEL[st]}
                    </span>
                  </div>
                  <Qr value={mesaUrl(slug, t.token)} />
                  <Link href={`${base}/mesa/${t.token}`} target="_blank" className="btn block">
                    Abrir como cliente ↗
                  </Link>
                  {openSession(db, t.id) ? null : <span className="muted small">Sem sessão aberta</span>}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function Page() {
  return <ClientOnly>{REMOTE ? <Entrada /> : <Demo />}</ClientOnly>;
}
