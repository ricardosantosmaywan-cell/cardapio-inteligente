"use client";
import Link from "next/link";
import { resetDemo, useDB, useTick } from "@/lib/store";
import { ClientOnly, Qr, mesaUrl } from "@/components/ui";
import { openSession, tableState } from "@/lib/utils";

const STATE_LABEL = { livre: "Livre", ocupada: "Ocupada", conta: "Pediu a conta", chamou: "Chamou" } as const;

function Hub() {
  const db = useDB();
  useTick();
  return (
    <div className="hub-bg">
    <main className="hub">
      <header className="hub-hero stack">
        <span className="badge brand" style={{ alignSelf: "flex-start" }}>DEMO · dados de demonstração</span>
        <h1>🍽️ {db.establishment.name} — Cardápio por Mesa</h1>
        <p>
          Abra cada perfil numa aba ou janela diferente. Tudo sincroniza em tempo real entre as abas: peça no
          “telemóvel”, veja chegar no “tablet do garçom” e edite o cardápio no “painel do dono”.
        </p>
      </header>

      <section className="grid two">
        <Link href="/garcom" className="card stack" target="_blank">
          <h2>🧑‍🍳 Garçom (tablet)</h2>
          <p className="muted small">Mesas, pedidos novos, esgotados, fechar mesa e renovar QR.</p>
          <span className="btn primary">Abrir tablet do garçom ↗</span>
        </Link>
        <Link href="/dono" className="card stack" target="_blank">
          <h2>🛠️ Dono (gestão)</h2>
          <p className="muted small">Produtos, fotos, categorias, ofertas do dia, mesas e QR codes.</p>
          <span className="btn primary">Abrir painel do dono ↗</span>
        </Link>
      </section>

      <section className="stack">
        <div className="row between wrap">
          <h2>📱 Cliente — leia o QR de uma mesa</h2>
          <button
            className="btn sm danger"
            onClick={() => confirm("Repor todos os dados de demonstração?") && resetDemo()}
          >
            Repor dados da demo
          </button>
        </div>
        <p className="muted small">
          Cada aba funciona como um telemóvel diferente. Abra a mesma mesa em duas abas para testar a aprovação
          de um segundo cliente. A Mesa 3 já tem uma conta em curso.
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
                <Qr value={mesaUrl(t.token)} />
                <Link href={`/mesa/${t.token}`} target="_blank" className="btn block">
                  Abrir como cliente ↗
                </Link>
                {openSession(db, t.id) ? null : <span className="muted small">Sem sessão aberta</span>}
              </div>
            );
          })}
        </div>
        <div className="alert info small">
          Para testar num telemóvel real na mesma rede Wi‑Fi, abra este endereço com o IP do computador em vez de
          “localhost”. Os dados ficam no navegador de cada dispositivo, por isso a sincronização entre aparelhos
          diferentes só vem com o Supabase (fase seguinte).
        </div>
      </section>
    </main>
    </div>
  );
}

export default function Page() {
  return (
    <ClientOnly>
      <Hub />
    </ClientOnly>
  );
}
