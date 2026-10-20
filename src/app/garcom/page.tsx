"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDB, useTick } from "@/lib/store";
import { TableIcon } from "@/components/ui";
import { ago, beep, eur, openSession, sessionTotal, tableState } from "@/lib/utils";

const LABEL = { livre: "Livre", ocupada: "Ocupada", conta: "Pediu a conta", chamou: "Chamou o garçom" } as const;
const BADGE = { livre: "", ocupada: "info", conta: "warn", chamou: "bad" } as const;

export default function Mesas() {
  const db = useDB();
  useTick(10000);

  const openIds = new Set(db.sessions.filter((s) => !s.closedAt).map((s) => s.id));
  const novos = db.orders
    .filter((o) => o.status === "enviado" && openIds.has(o.sessionId))
    .sort((a, b) => a.createdAt - b.createdAt);

  // Som discreto quando chega pedido novo (G3).
  const prev = useRef<number | null>(null);
  const [sound, setSound] = useState(true);
  useEffect(() => {
    if (prev.current !== null && novos.length > prev.current && sound) beep();
    prev.current = novos.length;
  }, [novos.length, sound]);

  const tableOf = (sessionId: string) => {
    const s = db.sessions.find((x) => x.id === sessionId);
    return db.tables.find((t) => t.id === s?.tableId);
  };

  return (
    <main className="shell">
      <div className="row between wrap">
        <h1>Mesas</h1>
        <label className="row small">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Som de aviso
        </label>
      </div>

      {novos.length > 0 && (
        <div className="banner" role="alert">
          <div>
            <b>🔔 {novos.length} {novos.length === 1 ? "pedido novo" : "pedidos novos"}</b>
            <div className="small">
              {novos.slice(0, 3).map((o) => `${tableOf(o.sessionId)?.name} · ${o.author}`).join("  |  ")}
            </div>
          </div>
          {tableOf(novos[0].sessionId) && (
            <Link href={`/garcom/mesa/${tableOf(novos[0].sessionId)!.id}`} className="btn sm">
              Ver mesa
            </Link>
          )}
        </div>
      )}

      <div className="grid tables">
        {db.tables.map((t) => {
          const st = tableState(db, t);
          const s = openSession(db, t.id);
          const guests = s ? db.guests.filter((g) => g.sessionId === s.id && g.status === "aprovado") : [];
          const pend = s ? db.guests.filter((g) => g.sessionId === s.id && g.status === "pendente").length : 0;
          const novosMesa = s ? novos.filter((o) => o.sessionId === s.id).length : 0;
          return (
            <Link key={t.id} href={`/garcom/mesa/${t.id}`} className={`card table-card ${st}`}>
              <TableIcon name={t.name} state={st} guests={guests.length} />
              <div className="row between">
                <h2>{t.name}</h2>
                <span className={`badge ${BADGE[st]}`}>{LABEL[st]}</span>
              </div>
              {s ? (
                <>
                  <div className="small muted">{guests.map((g) => g.name).join(", ") || "—"}</div>
                  <div className="row between" style={{ marginTop: "auto" }}>
                    <b style={{ fontSize: "1.2rem" }}>{eur(sessionTotal(db, s.id))}</b>
                    <span className="small muted">aberta {ago(s.openedAt)}</span>
                  </div>
                  <div className="row wrap">
                    {novosMesa > 0 && <span className="badge brand">🔔 {novosMesa} novo(s)</span>}
                    {pend > 0 && <span className="badge info">👤 {pend} a entrar</span>}
                    {t.calledAt && <span className="badge bad">🛎️ chamou {ago(t.calledAt)}</span>}
                    {t.billRequestedAt && <span className="badge warn">🧾 conta {ago(t.billRequestedAt)}</span>}
                  </div>
                </>
              ) : (
                <div className="muted small" style={{ marginTop: "auto" }}>Livre · sem clientes</div>
              )}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
