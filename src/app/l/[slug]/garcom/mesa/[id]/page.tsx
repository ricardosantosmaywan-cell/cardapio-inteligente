"use client";
import Link from "next/link";
import { Bell, Check, CheckCheck, ChevronLeft, Circle, Clock, DoorClosed, Eye, Plus, Receipt, RefreshCw, StickyNote, UserPlus, Users, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  cancelItem, closeTable, decideGuest, dismissCall, openTableSession, renewQr, sendOrder, setItemDelivered, setOrderStatus, useDB, useTick,
} from "@/lib/store";
import { EmptyState, Modal, ProductThumb, useToast } from "@/components/ui";
import { useLoja } from "@/components/loja";
import { ago, money, hhmm, itemDelivered, openSession, orderTotal, sessionTotal, tableState } from "@/lib/utils";

const STATUS = { enviado: "Enviado", visto: "Visto", entregue: "Entregue" } as const;

export default function DetalheMesa() {
  const { id } = useParams<{ id: string }>();
  const { base } = useLoja();
  const db = useDB();
  useTick(10000);
  const toast = useToast();
  const [launch, setLaunch] = useState(false);
  const [confirm, setConfirm] = useState<"fechar" | "qr" | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ orderId: string; itemId: string; name: string } | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const table = db.tables.find((t) => t.id === id);
  if (!table) {
    return (
      <main className="shell">
        <h1>Mesa não encontrada.</h1>
        <Link className="btn" href={`${base}/garcom`}><ChevronLeft className="icon" size={20} aria-hidden="true" />Mesas</Link>
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

  const STATE_BADGE = st === "ocupada" ? "info" : st === "conta" ? "warn" : st === "chamou" ? "bad" : "";
  const STATE_TXT = st === "livre" ? "Livre" : st === "conta" ? "Pediu a conta" : st === "chamou" ? "Chamou o garçom" : "Ocupada";
  const StateIcon = st === "livre" ? Circle : st === "conta" ? Receipt : st === "chamou" ? Bell : Users;

  return (
    <main className="shell">
      <div className="mesa-head">
        <Link href={`${base}/garcom`} className="btn ghost" style={{ color: "var(--brand-strong)" }}><ChevronLeft className="icon" size={20} aria-hidden="true" />Mesas</Link>
        <h1>{table.name}</h1>
        <span className={`badge ${STATE_BADGE}`}><StateIcon size={14} aria-hidden="true" />{STATE_TXT}</span>
        <span className="grow" />
        <div className="mesa-total">
          <div className="l">{session ? "Total da conta (estimado)" : "Total da conta"}</div>
          <div className="v">{money(total)}</div>
        </div>
      </div>

      {!session && (
        <div className="card">
          <EmptyState title="A mesa está livre" hint="Abra a mesa para que os clientes possam entrar pelo QR code e fazer pedidos.">
            <button className="btn primary" onClick={() => openTableSession(table.id)}>Abrir mesa</button>
          </EmptyState>
        </div>
      )}

      {table.calledAt && (
        <div className="notice" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-bd)" }} role="alert">
          <span className="ic" style={{ color: "var(--danger-fg)" }}><Bell size={24} aria-hidden="true" /></span>
          <div className="body"><b>A mesa chamou o garçom {ago(table.calledAt)}</b></div>
          <button className="btn" onClick={() => dismissCall(table.id)}>Já atendi</button>
        </div>
      )}
      {table.billRequestedAt && (
        <div className="notice warn" role="status">
          <span className="ic"><Receipt size={24} aria-hidden="true" /></span>
          <div className="body">
            <b>A mesa pediu a conta {ago(table.billRequestedAt)}.</b>
            <span>Receba fora do sistema e depois feche a mesa.</span>
          </div>
        </div>
      )}

      {pend.map((g) => (
        <div key={g.id} className="notice" role="status">
          <span className="ic"><UserPlus size={24} aria-hidden="true" /></span>
          <div className="body"><b>{g.name} quer entrar na mesa</b></div>
          <button className="btn danger" onClick={() => decideGuest(g.id, false)}>Recusar</button>
          <button className="btn primary" onClick={() => decideGuest(g.id, true)}>Aprovar</button>
        </div>
      ))}

      {session && (
        <>
          <div className="panels">
            <div className="panel">
              <div className="ttl"><Users size={18} aria-hidden="true" className="muted" />Clientes</div>
              <div className="big">{guests.filter((g) => g.status === "aprovado").map((g) => g.name + (g.phone ? ` (${g.phone})` : "")).join(" · ") || "—"}</div>
            </div>
            <div className="panel" style={{ flex: "1.4 1 380px" }}>
              <div className="ttl">Ações da mesa</div>
              <div className="row wrap">
                <button className="btn primary" onClick={() => setLaunch(true)}><Plus className="icon" size={20} aria-hidden="true" />Lançar pedido</button>
                <button className="btn" onClick={() => setConfirm("qr")}><RefreshCw className="icon" size={20} aria-hidden="true" />Renovar QR</button>
                <button className="btn solid-danger" onClick={() => setConfirm("fechar")}><DoorClosed className="icon" size={20} aria-hidden="true" />Fechar mesa</button>
              </div>
            </div>
          </div>

          <h2>Pedidos</h2>
          {orders.length === 0 && <div className="card"><EmptyState title="Ainda sem pedidos." /></div>}
          <div className="grid two" style={{ alignItems: "start", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
            {orders.map((o) => (
              <div key={o.id} className={`ocard${o.status === "enviado" ? " novo" : ""}`}>
                <div className="row">
                  <div className="grow">
                    <div className="who">{o.author}</div>
                    <div className="when">{hhmm(o.createdAt)} · {ago(o.createdAt)}</div>
                  </div>
                  <span className={`badge ${o.status === "entregue" ? "ok" : o.status === "visto" ? "info" : "warn"}`}>
                    {o.status === "entregue" ? <Check size={14} aria-hidden="true" /> : o.status === "visto" ? <Eye size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
                    {STATUS[o.status]}
                  </span>
                </div>
                <div>
                  {o.items.map((i) => {
                    const done = itemDelivered(o, i);
                    if (i.cancelled) {
                      return (
                        <div key={i.id} className="irow cancelled">
                          <span className="nm">{i.qty}× {i.name}</span>
                          <span className="small">(cancelado)</span>
                          <span className="vl">{money(i.price * i.qty)}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={i.id} className="irow">
                        <span className="nm">{i.qty}× {i.name}</span>
                        <span className="vl">{money(i.price * i.qty)}</span>
                        <button
                          className={`btn sm ${done ? "ok" : ""}`}
                          onClick={() => setItemDelivered(o.id, i.id, !done)}
                          aria-label={done ? `Desmarcar entrega de ${i.name}` : `Marcar ${i.name} como entregue`}
                        >
                          {done ? <><Check className="icon" size={16} aria-hidden="true" />Entregue</> : "Entregar"}
                        </button>
                        {!done ? (
                          <button className="btn ghost icon-btn" style={{ color: "var(--brand-strong)" }} onClick={() => setCancelTarget({ orderId: o.id, itemId: i.id, name: i.name })} aria-label={`Cancelar ${i.name}`}>
                            <X size={22} aria-hidden="true" />
                          </button>
                        ) : (
                          <span style={{ width: 56, flex: "none" }} />
                        )}
                      </div>
                    );
                  })}
                </div>
                {o.note && <div className="note-box"><span className="ic"><StickyNote size={18} aria-hidden="true" /></span>{o.note}</div>}
                <div className="row">
                  <span className="muted small" style={{ fontWeight: 500 }}>Total do pedido</span>
                  <span className="grow" />
                  <b style={{ fontSize: "1.375rem" }}>{money(orderTotal(o))}</b>
                </div>
                <div className="row wrap">
                  {o.status === "enviado" && <button className="btn" onClick={() => setOrderStatus(o.id, "visto")}><Eye className="icon" size={20} aria-hidden="true" />Marcar visto</button>}
                  {o.items.some((i) => !i.cancelled && !itemDelivered(o, i)) && <button className="btn ok" onClick={() => setOrderStatus(o.id, "entregue")}><CheckCheck className="icon" size={20} aria-hidden="true" />Entregar tudo</button>}
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
                    <div className="small">{money(p.price)} {!p.available && <span className="badge bad">Esgotado</span>}</div>
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
            Lançar pedido · {money(launchTotal)}
          </button>
        </Modal>
      )}

      {confirm === "fechar" && (
        <Modal title="Fechar mesa" onClose={() => setConfirm(null)}>
          <p>Confirme o total de <b>{money(total)}</b> antes de fechar. O pagamento é feito fora do sistema.</p>
          <p className="muted small">Todos os celulares desta mesa passam para “Obrigado pela visita” e a mesa fica livre.</p>
          <div className="row">
            <button className="btn grow" onClick={() => setConfirm(null)}>Cancelar</button>
            <button className="btn primary grow" onClick={() => { closeTable(table.id); setConfirm(null); }}>Fechar mesa</button>
          </div>
        </Modal>
      )}
      {cancelTarget && (
        <Modal title="Cancelar item" onClose={() => setCancelTarget(null)}>
          <p>Você tem certeza que quer cancelar <b>{cancelTarget.name}</b>?</p>
          <p className="muted small">O item sai da conta da mesa e o cliente vê “cancelado”.</p>
          <div className="row">
            <button className="btn grow" onClick={() => setCancelTarget(null)}>Não, manter</button>
            <button className="btn danger grow" onClick={() => { cancelItem(cancelTarget.orderId, cancelTarget.itemId); setCancelTarget(null); toast.show("Item cancelado"); }}>Sim, cancelar</button>
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
