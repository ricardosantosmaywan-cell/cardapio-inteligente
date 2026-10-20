"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  callWaiter, CartLine, decideGuest, getGuestId, joinTable, requestBill, sendOrder, useDB, useTick,
} from "@/lib/store";
import { ClientOnly, ProductThumb, Thumb, useToast } from "@/components/ui";
import { eur, hhmm, offerLive, orderTotal, sessionTotal } from "@/lib/utils";

const STATUS_LABEL = { enviado: "Enviado", visto: "Visto pelo garçom", entregue: "Entregue" } as const;

function NotRecognized() {
  return (
    <div className="screen-center center">
      <div className="big-emoji">🔍</div>
      <h1>QR não reconhecido</h1>
      <p className="muted">Este código é antigo, inválido ou foi removido. Peça ao garçom para ver o QR atual da mesa.</p>
      <button className="btn primary block" onClick={() => location.reload()}>Tentar outra vez</button>
    </div>
  );
}

function Customer() {
  const { token } = useParams<{ token: string }>();
  const db = useDB();
  useTick();
  const toast = useToast();

  const [guestId, setGuestIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setGuestIdState(getGuestId(token));
    setReady(true);
  }, [token]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [view, setView] = useState<"menu" | "cart" | "orders">("menu");
  const [cat, setCat] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const guest = guestId ? db.guests.find((g) => g.id === guestId) : undefined;
  const session = guest ? db.sessions.find((s) => s.id === guest.sessionId) : undefined;
  const table = session ? db.tables.find((t) => t.id === session.tableId) : db.tables.find((t) => t.token === token);

  const categories = useMemo(() => [...db.categories].sort((a, b) => a.order - b.order), [db.categories]);
  const offers = useMemo(
    () => db.offers.filter((o) => offerLive(o)).sort((a, b) => a.order - b.order),
    [db.offers],
  );

  if (!ready) return null;
  if (!table) return <NotRecognized />;

  const reset = () => setGuestIdState(null);

  /* ---------- Entrada (C1) ---------- */
  if (!guest || !session) {
    return (
      <div className="screen-center">
        <div className="big-emoji">🍽️</div>
        <div className="center">
          <h1>{db.establishment.name}</h1>
          <p className="muted">{table.name}</p>
        </div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setGuestIdState(joinTable(token, name.trim(), phone.trim()));
          }}
        >
          <div className="field">
            <label htmlFor="n">O seu nome</label>
            <input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required placeholder="Ex.: Marta" />
          </div>
          <div className="field">
            <label htmlFor="p">Telemóvel (opcional)</label>
            <input id="p" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="9XX XXX XXX" />
          </div>
          <button className="btn primary block" type="submit">Entrar na mesa</button>
        </form>
        <p className="muted small center">
          🔒 [Espaço reservado para o aviso de privacidade — texto legal por definir.] Recolhemos apenas o nome e, se
          quiser, o telemóvel. Não usamos o telemóvel para marketing.
        </p>
      </div>
    );
  }

  /* ---------- Sessão encerrada (C11) ---------- */
  if (session.closedAt) {
    return (
      <div className="screen-center center">
        <div className="big-emoji">🙏</div>
        <h1>Obrigado pela visita!</h1>
        <p className="muted">A mesa foi encerrada. Esperamos vê-lo em breve, {guest.name}.</p>
        <button className="btn block" onClick={reset}>Voltar a pedir (ler o QR outra vez)</button>
      </div>
    );
  }

  /* ---------- Aprovação (C2) ---------- */
  if (guest.status === "pendente") {
    return (
      <div className="screen-center center">
        <div className="big-emoji">⏳</div>
        <h1>A aguardar aprovação</h1>
        <p className="muted">
          A {table.name} já tem uma conta aberta. O garçom ou alguém da mesa vai aprovar a sua entrada.
        </p>
      </div>
    );
  }
  if (guest.status === "recusado") {
    return (
      <div className="screen-center center">
        <div className="big-emoji">✋</div>
        <h1>Entrada não aprovada</h1>
        <p className="muted">Fale com o garçom se achar que é um engano.</p>
        <button className="btn block" onClick={reset}>Tentar outra vez</button>
      </div>
    );
  }

  /* ---------- App da mesa ---------- */
  const total = sessionTotal(db, session.id);
  const orders = db.orders.filter((o) => o.sessionId === session.id).sort((a, b) => b.createdAt - a.createdAt);
  const pendingGuests = db.guests.filter((g) => g.sessionId === session.id && g.status === "pendente");
  const activeCat = cat ?? categories[0]?.id;
  const products = db.products.filter((p) => p.categoryId === activeCat);

  const lineInfo = (id: string) => {
    if (id.startsWith("offer:")) {
      const o = db.offers.find((x) => x.id === id.slice(6));
      return o ? { name: o.title, price: o.price, emoji: o.emoji, photo: o.photo, ok: offerLive(o) } : null;
    }
    const p = db.products.find((x) => x.id === id);
    return p ? { name: p.name, price: p.price, emoji: p.emoji, photo: p.photo, ok: p.available } : null;
  };
  const lines: CartLine[] = Object.entries(cart).filter(([, q]) => q > 0).map(([productId, qty]) => ({ productId, qty }));
  const cartQty = lines.reduce((s, l) => s + l.qty, 0);
  const cartTotal = lines.reduce((s, l) => s + (lineInfo(l.productId)?.price ?? 0) * l.qty, 0);
  const blocked = lines.filter((l) => !lineInfo(l.productId)?.ok);

  const setQty = (id: string, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));

  const submit = () => {
    if (!lines.length || blocked.length) return;
    if (sendOrder(session.id, guest.id, guest.name, lines, note.trim())) {
      setCart({});
      setNote("");
      setView("orders");
      toast.show("Pedido enviado ao garçom ✅");
    } else toast.show("Não foi possível enviar. Reveja o carrinho.");
  };

  const billAsked = !!table.billRequestedAt;

  return (
    <div className="phone">
      <header className="phone-head">
        <div className="grow">
          <div className="bold">{table.name} · {guest.name}</div>
          <div className="small muted">Total estimado da mesa</div>
        </div>
        <div className="bold" style={{ fontSize: "1.25rem" }}>{eur(total)}</div>
        <button
          className="btn sm"
          onClick={() => { callWaiter(table.id); toast.show("Garçom chamado 🛎️"); }}
          aria-label="Chamar garçom"
        >
          🛎️ Chamar
        </button>
      </header>

      <div className="phone-body">
        {pendingGuests.length > 0 && (
          <div className="alert info stack">
            {pendingGuests.map((g) => (
              <div key={g.id} className="row between">
                <span><b>{g.name}</b> quer entrar na mesa.</span>
                <span className="row">
                  <button className="btn sm ok" onClick={() => decideGuest(g.id, true)}>Aprovar</button>
                  <button className="btn sm danger" onClick={() => decideGuest(g.id, false)}>Recusar</button>
                </span>
              </div>
            ))}
          </div>
        )}

        {view === "menu" && (
          <>
            {offers.length > 0 && (
              <section aria-label="Ofertas do dia" className="stack">
                <h2>Ofertas do dia</h2>
                <div className="carousel">
                  {offers.map((o) => (
                    <div key={o.id} className="offer">
                      <Thumb emoji={o.emoji} photo={o.photo} />
                      <div className="grow stack" style={{ gap: 4 }}>
                        <span className="tag" style={{ alignSelf: "flex-start" }}>{o.tag}</span>
                        <div className="bold">{o.title}</div>
                        <div><b>{eur(o.price)}</b> <s>{eur(o.normalPrice)}</s></div>
                        <button className="btn sm" style={{ alignSelf: "flex-start", background: "#fff", color: "#2a211c", borderColor: "#fff" }} onClick={() => setQty(`offer:${o.id}`, 1)} aria-label={`Adicionar ${o.title}`}>
                          {cart[`offer:${o.id}`] ? `+1 (${cart[`offer:${o.id}`]})` : "Adicionar"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="chips" role="tablist">
              {categories.map((c) => (
                <button key={c.id} role="tab" aria-selected={c.id === activeCat} className={`chip${c.id === activeCat ? " on" : ""}`} onClick={() => setCat(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>

            <div className="stack">
              {products.map((p) => (
                <div key={p.id} className={`card product${p.available ? "" : " out"}`}>
                  <ProductThumb p={p} />
                  <div className="grow">
                    <div className="bold">{p.name}</div>
                    <div className="small muted">{p.description}</div>
                    <div className="row" style={{ marginTop: 4 }}>
                      <b>{eur(p.price)}</b>
                      {!p.available && <span className="badge bad">Esgotado</span>}
                    </div>
                  </div>
                  {p.available && (
                    <div className="stepper">
                      {(cart[p.id] ?? 0) > 0 && (
                        <>
                          <button onClick={() => setQty(p.id, -1)} aria-label={`Menos ${p.name}`}>−</button>
                          <span>{cart[p.id]}</span>
                        </>
                      )}
                      <button onClick={() => setQty(p.id, 1)} aria-label={`Mais ${p.name}`}>+</button>
                    </div>
                  )}
                </div>
              ))}
              {products.length === 0 && <p className="muted center">Sem produtos nesta categoria.</p>}
            </div>
          </>
        )}

        {view === "cart" && (
          <section className="stack">
            <div className="row between">
              <h2>O seu pedido</h2>
              <button className="btn sm ghost" onClick={() => setView("menu")}>← Cardápio</button>
            </div>
            {lines.length === 0 && <p className="muted">O carrinho está vazio.</p>}
            {lines.map((l) => {
              const info = lineInfo(l.productId);
              if (!info) return null;
              return (
                <div key={l.productId} className="card product">
                  <Thumb emoji={info.emoji} photo={info.photo} />
                  <div className="grow">
                    <div className="bold">{info.name}</div>
                    <div className="small">{eur(info.price)} × {l.qty} = <b>{eur(info.price * l.qty)}</b></div>
                    {!info.ok && <span className="badge bad">Esgotado</span>}
                  </div>
                  {info.ok ? (
                    <div className="stepper">
                      <button onClick={() => setQty(l.productId, -1)} aria-label="Menos">−</button>
                      <span>{l.qty}</span>
                      <button onClick={() => setQty(l.productId, 1)} aria-label="Mais">+</button>
                    </div>
                  ) : (
                    <button className="btn sm danger" onClick={() => setCart((c) => ({ ...c, [l.productId]: 0 }))}>Retirar</button>
                  )}
                </div>
              );
            })}
            {blocked.length > 0 && (
              <div className="alert bad">
                ⚠️ {blocked.map((l) => lineInfo(l.productId)?.name).join(", ")} {blocked.length > 1 ? "esgotaram" : "esgotou"}.
                Retire {blocked.length > 1 ? "esses itens" : "esse item"} para poder enviar o pedido.
              </div>
            )}
            <div className="field">
              <label htmlFor="obs">Observação para este pedido</label>
              <textarea id="obs" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: sem cebola, bife bem passado…" />
            </div>
            <div className="row between"><span>Total deste pedido</span><b style={{ fontSize: "1.2rem" }}>{eur(cartTotal)}</b></div>
            <button className="btn primary block" disabled={!lines.length || blocked.length > 0} onClick={submit}>
              Enviar pedido ao garçom
            </button>
          </section>
        )}

        {view === "orders" && (
          <section className="stack">
            <h2>Meus pedidos</h2>
            {orders.length === 0 && <p className="muted">Ainda não há pedidos nesta mesa.</p>}
            {orders.map((o) => (
              <div key={o.id} className="card stack" style={{ gap: 6 }}>
                <div className="row between">
                  <span><b>{o.author}</b> · <span className="muted">{hhmm(o.createdAt)}</span></span>
                  <span className={`badge ${o.status === "entregue" ? "ok" : o.status === "visto" ? "info" : "warn"}`}>
                    {STATUS_LABEL[o.status]}
                  </span>
                </div>
                {o.items.map((i) => (
                  <div key={i.id} className={`line${i.cancelled ? " cancelled" : ""}`}>
                    <span>{i.qty}× {i.name}{i.cancelled && " (cancelado)"}</span>
                    <span>{eur(i.price * i.qty)}</span>
                  </div>
                ))}
                {o.note && <p className="small muted">📝 {o.note}</p>}
                <div className="line bold"><span>Valor</span><span>{eur(orderTotal(o))}</span></div>
              </div>
            ))}
            <div className="card stack">
              <div className="row between"><span>Total estimado da mesa</span><b style={{ fontSize: "1.25rem" }}>{eur(total)}</b></div>
              <p className="small muted">Valor informativo, não é um documento fiscal. O pagamento é feito com o garçom.</p>
              {billAsked ? (
                <div className="alert ok stack">
                  <b>O garçom já vem 🙂</b>
                  <button className="btn sm block" onClick={() => { requestBill(table.id); toast.show("Pedido de conta reenviado"); }}>
                    Pedir outra vez
                  </button>
                </div>
              ) : (
                <button className="btn block" onClick={() => requestBill(table.id)}>🧾 Pedir a conta</button>
              )}
            </div>
          </section>
        )}
      </div>

      <div className="bottom-bar">
        <div className="bottom-inner">
          {view === "menu" && cartQty > 0 && (
            <button className="btn primary block" onClick={() => setView("cart")}>
              Ver pedido · {cartQty} {cartQty === 1 ? "item" : "itens"} · {eur(cartTotal)}
            </button>
          )}
          <div className="tabs">
            <button className={`btn${view !== "orders" ? " primary" : ""}`} onClick={() => setView("menu")}>Cardápio</button>
            <button className={`btn${view === "orders" ? " primary" : ""}`} onClick={() => setView("orders")}>Meus pedidos</button>
          </div>
        </div>
      </div>
      {toast.node}
    </div>
  );
}

export default function Page() {
  return (
    <ClientOnly>
      <Customer />
    </ClientOnly>
  );
}
