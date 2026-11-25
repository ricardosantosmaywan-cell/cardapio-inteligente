"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Circle, CircleCheck, Hand, Receipt, UserPlus, Users, Volume2, VolumeX } from "lucide-react";
import { useDB, useTick } from "@/lib/store";
import { TableIcon } from "@/components/ui";
import { useLoja } from "@/components/loja";
import { ago, beep, kitchenCfg, kitchenStatus, money, openSession, orderHasKitchen, sessionTotal, tableState } from "@/lib/utils";

const LABEL = { livre: "Livre", ocupada: "Ocupada", conta: "Pediu a conta", chamou: "Chamou o garçom" } as const;
const BADGE = { livre: "", ocupada: "info", conta: "warn", chamou: "bad" } as const;
const STATE_ICON = { livre: Circle, ocupada: Users, conta: Receipt, chamou: Bell } as const;

export default function Mesas() {
  const { base } = useLoja();
  const db = useDB();
  useTick(10000);

  const openIds = new Set(db.sessions.filter((s) => !s.closedAt).map((s) => s.id));
  const novos = db.orders
    .filter((o) => o.status === "enviado" && openIds.has(o.sessionId))
    .sort((a, b) => a.createdAt - b.createdAt);

  const entrando = db.guests
    .filter((g) => g.status === "pendente" && openIds.has(g.sessionId))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Com a tela da cozinha ligada: pedidos que a cozinha marcou como prontos e ainda não foram entregues.
  const cozinhaOn = kitchenCfg(db).enabled;
  const prontos = cozinhaOn
    ? db.orders
        .filter((o) => kitchenStatus(o) === "pronto" && o.status !== "entregue" && openIds.has(o.sessionId) && orderHasKitchen(db, o))
        .sort((a, b) => (a.readyAt ?? a.createdAt) - (b.readyAt ?? b.createdAt))
    : [];

  // Som discreto quando chega pedido novo, alguém pede para entrar ou a cozinha acaba um pedido.
  const prev = useRef<number | null>(null);
  const [sound, setSound] = useState(true);
  const avisos = novos.length + entrando.length + prontos.length;
  useEffect(() => {
    if (prev.current !== null && avisos > prev.current && sound) beep();
    prev.current = avisos;
  }, [avisos, sound]);

  const tableOf = (sessionId: string) => {
    const s = db.sessions.find((x) => x.id === sessionId);
    return db.tables.find((t) => t.id === s?.tableId);
  };

  // "Mesa 3 (2) · Mesa 5 (1)": pedidos novos por mesa
  const novosPorMesa = new Map<string, number>();
  for (const o of novos) {
    const nome = tableOf(o.sessionId)?.name;
    if (nome) novosPorMesa.set(nome, (novosPorMesa.get(nome) ?? 0) + 1);
  }
  const prontosPorMesa = new Map<string, number>();
  for (const o of prontos) {
    const nome = tableOf(o.sessionId)?.name;
    if (nome) prontosPorMesa.set(nome, (prontosPorMesa.get(nome) ?? 0) + 1);
  }

  return (
    <main className="shell">
      <div className="row between wrap">
        <h1>Mesas</h1>
        <div className="card" style={{ padding: "0 16px" }}>
          <div className="switch">
            <button type="button" role="switch" aria-checked={sound} aria-label="Som de aviso" onClick={() => setSound(!sound)} />
            <span>Som de aviso</span>
            {sound ? <Volume2 size={18} aria-hidden="true" className="muted" /> : <VolumeX size={18} aria-hidden="true" className="muted" />}
          </div>
        </div>
      </div>

      {(entrando.length > 0 || novos.length > 0 || prontos.length > 0) && (
        <div className="notices">
          {prontos.length > 0 && (
            <div className="notice ok" role="alert">
              <span className="ic"><CircleCheck size={24} aria-hidden="true" /></span>
              <div className="body">
                <b>{prontos.length} {prontos.length === 1 ? "pedido pronto para servir" : "pedidos prontos para servir"}</b>
                <span>{[...prontosPorMesa.entries()].slice(0, 3).map(([n, q]) => `${n} (${q})`).join(" · ")}</span>
              </div>
              {tableOf(prontos[0].sessionId) && (
                <Link href={`${base}/garcom/mesa/${tableOf(prontos[0].sessionId)!.id}`} className="btn">Ver mesa</Link>
              )}
            </div>
          )}
          {entrando.length > 0 && (
            <div className="notice" role="status">
              <span className="ic"><Hand size={24} aria-hidden="true" /></span>
              <div className="body">
                <b>{entrando.length} {entrando.length === 1 ? "cliente quer entrar" : "clientes querem entrar"}</b>
                <span>{entrando.slice(0, 3).map((g) => `${tableOf(g.sessionId)?.name} · ${g.name}`).join("   |   ")}</span>
              </div>
              {tableOf(entrando[0].sessionId) && (
                <Link href={`${base}/garcom/mesa/${tableOf(entrando[0].sessionId)!.id}`} className="btn">Ver mesa</Link>
              )}
            </div>
          )}
          {novos.length > 0 && (
            <div className="notice warn" role="alert">
              <span className="ic"><Bell size={24} aria-hidden="true" /></span>
              <div className="body">
                <b>{novos.length} {novos.length === 1 ? "pedido novo" : "pedidos novos"}</b>
                <span>{[...novosPorMesa.entries()].slice(0, 3).map(([n, q]) => `${n} (${q})`).join(" · ")}</span>
              </div>
              {tableOf(novos[0].sessionId) && (
                <Link href={`${base}/garcom/mesa/${tableOf(novos[0].sessionId)!.id}`} className="btn">Ver mesa</Link>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid mesas">
        {db.tables.map((t) => {
          const st = tableState(db, t);
          const s = openSession(db, t.id);
          const guests = s ? db.guests.filter((g) => g.sessionId === s.id && g.status === "aprovado") : [];
          const pend = s ? db.guests.filter((g) => g.sessionId === s.id && g.status === "pendente").length : 0;
          const novosMesa = s ? novos.filter((o) => o.sessionId === s.id).length : 0;
          const prontosMesa = s ? prontos.filter((o) => o.sessionId === s.id).length : 0;
          const Icon = STATE_ICON[st];
          return (
            <Link key={t.id} href={`${base}/garcom/mesa/${t.id}`} className={`tcard ${st}`} aria-label={`Abrir ${t.name}`}>
              <div className="row" style={{ gap: 14 }}>
                <TableIcon name={t.name} state={st} guests={guests.length} />
                <div className="stack grow" style={{ gap: 6 }}>
                  <div className="name">{t.name}</div>
                  <span className={`badge ${BADGE[st]}`} style={{ alignSelf: "flex-start" }}><Icon size={14} aria-hidden="true" />{LABEL[st]}</span>
                </div>
              </div>
              {s ? (
                <div className="stack" style={{ gap: 8 }}>
                  <div style={{ fontWeight: 500 }}>{guests.map((g) => g.name).join(", ") || "—"}</div>
                  <div className="row between">
                    <span className="total">{money(sessionTotal(db, s.id))}</span>
                    <span className="small muted">aberta {ago(s.openedAt)}</span>
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {novosMesa > 0 && <span className="mini brand"><Bell size={13} aria-hidden="true" />{novosMesa} novo(s)</span>}
                    {prontosMesa > 0 && <span className="mini ok"><CircleCheck size={13} aria-hidden="true" />{prontosMesa} pronto(s)</span>}
                    {pend > 0 && <span className="mini info"><UserPlus size={13} aria-hidden="true" />{pend} a entrar</span>}
                    {t.calledAt && <span className="mini bad"><Bell size={13} aria-hidden="true" />chamou {ago(t.calledAt)}</span>}
                    {t.billRequestedAt && <span className="mini warn"><Receipt size={13} aria-hidden="true" />conta {ago(t.billRequestedAt)}</span>}
                  </div>
                </div>
              ) : (
                <div className="muted" style={{ fontWeight: 500 }}>Livre · sem clientes</div>
              )}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
