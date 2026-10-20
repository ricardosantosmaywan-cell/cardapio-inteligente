"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  cancelItem, closeTable, decideGuest, dismissCall, openTableSession, renewQr, sendOrder, setOrderStatus, useDB, useTick,
} from "@/lib/store";
import { Modal, ProductThumb, useToast } from "@/components/ui";
import { ago, eur, hhmm, openSession, orderTotal, sessionTotal, tableState } from "@/lib/utils";

const STATUS = { enviado: "Enviado", visto: "Visto", entregue: "Entregue" } as const;

export default function DetalheMesa() {
  const { id } = useParams<{ id: string }>();
  const db = useDB();
  useTick(10000);
  const toast = useToast();
  const [launch, setLaunch] = useState(false);
  const [confirm, setConfirm] = useState<"fechar" | "qr" | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const table = db.tables.find((t) => t.id === id);
  if (!table) {
    return (
      <main className="shell">
        <p>Mesa não encontrada.</p>
        <Link className="btn" href="/garcom">← Mesas</Link>
      </main>
    );
  }
  const session = openSession(db, table.id);
  const st = tableState(db, table);
  const guests = session ? db.guests.filter((g) => g.sessionId === session.id) : [];
  const pend = guests.filter((g) => g.status === "pendente");
  const orders = session ? db.orders.filter((o) => o.sessionId === session.id).sort((a, b) => b.createdAt - a.createdAt) : [];
  const total = session ? sessionTotal(db, session.id) : 0;
  const cats = [...db.categories].sort((a, b) => a.order - b.order);

  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([productId, qty]) => ({ productId, qty }));
  const launchTotal = lines.reduce((s, l) => s + (db.products.find((p) => p.id === l.productId)?.price ?? 0) * l.qty, 0);

  return (
    <main className="shell">
      <div className="row between wrap">
        <div className="row">
          <Link href="/garcom" className="btn sm ghost">← Mesas</Link>
          <h1>{table.name}</h1>
          <span className={`badge ${st === "ocupada" ? "info" : st === "conta" ? "warn" : st === "chamou" ? "bad" : ""}`}>
            {st === "livre" ? "Livre" : st === "conta" ? "Pediu a conta" : st === "chamou" ? "Chamou" : "Ocupada"}
          </span>
        </div>
        {session && <b style={{ fontSize: "1.5rem" }}>{eur(total)}</b>}
      </div>

      {!session && (
        <div className="card stack center">
          <p className="muted">A mesa está livre. O primeiro cliente que ler o QR abre a conta, ou abra‑a você para lançar pedidos.</p>
          <button className="btn primary" style={{ alignSelf: "center" }} onClick={() => openTableSession(table.id)}>Abrir mesa</button>
        </div>
      )}

      {table.calledAt && (
        <div className="alert bad row between wrap">
          <span>🛎️ A mesa chamou o garçom {ago(table.calledAt)}.</span>
          <button className="btn sm" onClick={() => dismissCall(table.id)}>Já atendi</button>
        </div>
      )}
      {table.billRequestedAt && (
        <div className="alert warn">🧾 A mesa pediu a conta {ago(table.billRequestedAt)}. Receba fora do sistema e depois feche a mesa.</div>
      )}

      {pend.map((g) => (
        <div key={g.id} className="alert info row between wrap">
          <span>👤 <b>{g.name}</b> quer entrar na mesa.</span>
          <span className="row">
            <button className="btn sm ok" onClick={() => decideGuest(g.id, true)}>Aprovar</button>
            <button className="btn sm danger" onClick={() => decideGuest(g.id, false)}>Recusar</button>
          </span>
        </div>
      ))}

      {session && (
        <>
          <div className="card small">
            <b>Clientes:</b> {guests.filter((g) => g.status === "aprovado").map((g) => g.name + (g.phone ? ` (${g.phone})` : "")).join(" · ") || "—"}
          </div>

          <div className="row wrap">
            <button className="btn primary" onClick={() => setLaunch(true)}>＋ Lançar pedido</button>
            <button className="btn" onClick={() => setConfirm("qr")}>🔄 Renovar QR</button>
            <button className="btn danger" onClick={() => setConfirm("fechar")}>Fechar mesa</button>
          </div>

          <h2>Pedidos</h2>
          {orders.length === 0 && <p className="muted">Ainda sem pedidos.</p>}
          <div className="grid two">
            {orders.map((o) => (
              <div key={o.id} className="card stack" style={{ gap: 8, borderColor: o.status === "enviado" ? "var(--brand)" : undefined }}>
                <div className="row between">
                  <span><b>{o.author}</b> · <span className="muted">{hhmm(o.createdAt)} ({ago(o.createdAt)})</span></span>
                  <span className={`badge ${o.status === "entregue" ? "ok" : o.status === "visto" ? "info" : "warn"}`}>{STATUS[o.status]}</span>
                </div>
                <div>
                  {o.items.map((i) => (
                    <div key={i.id} className={`line${i.cancelled ? " cancelled" : ""}`}>
                      <span>{i.qty}× {i.name}</span>
                      <span className="row">
                        {eur(i.price * i.qty)}
                        {!i.cancelled && o.status !== "entregue" && (
                          <button className="btn sm danger" onClick={() => cancelItem(o.id, i.id)} aria-label={`Cancelar ${i.name}`}>✕</button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {o.note && <div className="alert warn small">📝 {o.note}</div>}
                <div className="row between">
                  <b>{eur(orderTotal(o))}</b>
                  <span className="row">
                    {o.status === "enviado" && <button className="btn sm primary" onClick={() => setOrderStatus(o.id, "visto")}>Marcar visto</button>}
                    {o.status !== "entregue" && <button className="btn sm ok" onClick={() => setOrderStatus(o.id, "entregue")}>Entregue</button>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {launch && session && (
        <Modal title={`Lançar pedido — ${table.name}`} onClose={() => setLaunch(false)}>
          {cats.map((c) => (
            <div key={c.id} className="stack" style={{ gap: 8 }}>
              <h3>{c.name}</h3>
              {db.products.filter((p) => p.categoryId === c.id).map((p) => (
                <div key={p.id} className="row" style={{ opacity: p.available ? 1 : 0.5 }}>
                  <ProductThumb p={p} />
                  <div className="grow">
                    <div className="bold">{p.name}</div>
                    <div className="small">{eur(p.price)} {!p.available && <span className="badge bad">Esgotado</span>}</div>
                  </div>
                  {p.available && (
                    <div className="stepper">
                      {(cart[p.id] ?? 0) > 0 && (
                        <>
                          <button onClick={() => setCart((x) => ({ ...x, [p.id]: x[p.id] - 1 }))} aria-label="Menos">−</button>
                          <span>{cart[p.id]}</span>
                        </>
                      )}
                      <button onClick={() => setCart((x) => ({ ...x, [p.id]: (x[p.id] ?? 0) + 1 }))} aria-label="Mais">+</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="field">
            <label htmlFor="gobs">Observação</label>
            <textarea id="gobs" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button
            className="btn primary block"
            disabled={!lines.length}
            onClick={() => {
              sendOrder(session.id, null, "Garçom", lines, note.trim());
              setCart({}); setNote(""); setLaunch(false);
              toast.show("Pedido lançado");
            }}
          >
            Lançar pedido · {eur(launchTotal)}
          </button>
        </Modal>
      )}

      {confirm === "fechar" && (
        <Modal title="Fechar mesa" onClose={() => setConfirm(null)}>
          <p>Confirme o total de <b>{eur(total)}</b> antes de fechar. O pagamento é feito fora do sistema.</p>
          <p className="muted small">Todos os telemóveis desta mesa passam para “Obrigado pela visita” e a mesa fica livre.</p>
          <div className="row">
            <button className="btn grow" onClick={() => setConfirm(null)}>Cancelar</button>
            <button className="btn primary grow" onClick={() => { closeTable(table.id); setConfirm(null); }}>Fechar mesa</button>
          </div>
        </Modal>
      )}
      {confirm === "qr" && (
        <Modal title="Renovar QR da mesa" onClose={() => setConfirm(null)}>
          <p>O QR impresso atual deixa de funcionar para novos clientes e passa a mostrar “QR não reconhecido”. Terá de imprimir o novo código no painel do dono.</p>
          <div className="row">
            <button className="btn grow" onClick={() => setConfirm(null)}>Cancelar</button>
            <button className="btn primary grow" onClick={() => { renewQr(table.id); setConfirm(null); toast.show("QR renovado 🔄"); }}>Renovar</button>
          </div>
        </Modal>
      )}
      {toast.node}
    </main>
  );
}
