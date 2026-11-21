"use client";
import { useParams } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Ban, Bell, Check, Clock, Eye, Lock, Minus, Plus, Receipt, ShoppingBag, UtensilsCrossed } from "lucide-react";
import {
  callWaiter, CartLine, decideGuest, getGuestId, joinTable, requestBill, sendOrder, useDB, useTick,
} from "@/lib/store";
import { ClientOnly, EmptyState, ProductThumb, Thumb, useToast } from "@/components/ui";
import { useLoja } from "@/components/loja";
import { hhmm, ago, initials, itemDelivered, money, offerLive, orderTotal, sessionTotal } from "@/lib/utils";

const STATUS_LABEL = { enviado: "Enviado", visto: "Visto pelo garçom", entregue: "Entregue" } as const;
const STATUS_BADGE = { enviado: "warn", visto: "info", entregue: "ok" } as const;

/** Tela cheia com o logotipo da loja no topo: estados de erro, espera e encerramento. */
function Centered({ name, icon, title, children }: { name: string; icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="screen-center center">
      <span className="logo" style={{ alignSelf: "center" }} role="img" aria-label="Logotipo da loja">{initials(name)}</span>
      {icon}
      <h1>{title}</h1>
      {children}
    </div>
  );
}

function Customer() {
  const { token } = useParams<{ token: string }>();
  const { slug } = useLoja();
  void slug;
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
  const storeName = db.establishment.name;

  const categories = useMemo(() => [...db.categories].sort((a, b) => a.order - b.order), [db.categories]);
  const offers = useMemo(
    () => db.offers.filter((o) => offerLive(o)).sort((a, b) => a.order - b.order),
    [db.offers],
  );

  if (!ready) return null;

  if (!table) {
    return (
      <Centered name={storeName} title="QR não reconhecido">
        <p className="muted">Este código é antigo, inválido ou foi removido. Peça ao garçom para ver o QR atual da mesa.</p>
        <button className="btn primary block" onClick={() => location.reload()}>Tentar outra vez</button>
      </Centered>
    );
  }

  const reset = () => setGuestIdState(null);

  /* ---------- Entrada (B1) ---------- */
  if (!guest || !session) {
    return (
      <div className="entry">
        <div className="hero">
          <span className="logo xl" role="img" aria-label="Logotipo da loja">{initials(storeName)}</span>
          <h1>{storeName}</h1>
          <div className="sub">Cardápio digital por mesa</div>
        </div>
        <form
          className="sheet-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setGuestIdState(joinTable(token, name.trim(), phone.trim()));
          }}
        >
          <div className="eyebrow">{table.name}</div>
          <h2>Quem está na mesa?</h2>
          <div className="field">
            <label htmlFor="n">O seu nome<span className="req"> *</span></label>
            <input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required placeholder="Ex.: Marta" />
          </div>
          <div className="field">
            <label htmlFor="p">Celular (opcional)</label>
            <input id="p" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" />
          </div>
          <button className="btn primary block" type="submit">Entrar na mesa</button>
          <div className="note">
            <Lock size={16} aria-hidden="true" />
            <span>
              [Espaço reservado para o aviso de privacidade — texto legal por definir.] Recolhemos apenas o nome e, se
              quiser, o celular. Não usamos o celular para marketing.
            </span>
          </div>
        </form>
      </div>
    );
  }

  if (guest.status === "recusado") {
    return (
      <Centered name={storeName} title="Entrada não aprovada">
        <p className="muted">Fale com o garçom se achar que é um engano.</p>
        <button className="btn block" onClick={reset}>Tentar outra vez</button>
      </Centered>
    );
  }

  /* ---------- Mesa encerrada (B5) ---------- */
  if (session.closedAt) {
    return (
      <Centered name={storeName} title="Obrigado pela visita!">
        <p className="muted">A mesa foi encerrada. Esperamos ver você de novo, {guest.name}.</p>
        <button className="btn primary block" onClick={reset}>Voltar a pedir</button>
      </Centered>
    );
  }

  /* ---------- Aguardando aprovação (B2) ---------- */
  if (guest.status === "pendente") {
    return (
      <Centered
        name={storeName}
        title="Aguardando o garçom"
        icon={<div className="wait-ring" aria-hidden="true"><Clock size={32} /></div>}
      >
        <p className="muted">
          O garçom vai confirmar que você está na {table.name}. Assim que aprovar, já pode fazer o pedido.
        </p>
        <div className="badge" style={{ alignSelf: "center" }}>{table.name} · {guest.name}</div>
      </Centered>
    );
  }

  /* ---------- App da mesa ---------- */
  const total = sessionTotal(db, session.id);
  const orders = db.orders.filter((o) => o.sessionId === session.id).sort((a, b) => b.createdAt - a.createdAt);
  const emAndamento = orders.filter((o) => o.status !== "entregue").length;
  const pendingGuests = db.guests.filter((g) => g.sessionId === session.id && g.status === "pendente");
  const activeCat = cat ?? categories[0]?.id;
  const activeCatName = categories.find((c) => c.id === activeCat)?.name;
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
      toast.show("Pedido enviado ao garçom");
    } else toast.show("Não foi possível enviar. Reveja o carrinho.");
  };

  const billAsked = !!table.billRequestedAt;

  /** "+" circular, ou o seletor − n + quando já está no carrinho. */
  const Qty = ({ id, label }: { id: string; label: string }) =>
    (cart[id] ?? 0) > 0 ? (
      <div className="qty-pill">
        <button onClick={() => setQty(id, -1)} aria-label={`Diminuir ${label}`}><Minus size={18} aria-hidden="true" /></button>
        <span>{cart[id]}</span>
        <button onClick={() => setQty(id, 1)} aria-label={`Aumentar ${label}`}><Plus size={18} aria-hidden="true" /></button>
      </div>
    ) : (
      <button className="add-fab" onClick={() => setQty(id, 1)} aria-label={`Adicionar ${label}`}><Plus size={22} aria-hidden="true" /></button>
    );

  return (
    <div className="phone" style={{ paddingBottom: 0 }}>
      <header className="cl-head">
        <div className="grow">
          <div className="who">{table.name} · {guest.name}</div>
          <div className="sub">Total estimado da mesa</div>
        </div>
        <div className="total">{money(total)}</div>
        <button
          className="btn sm"
          onClick={() => { callWaiter(table.id); toast.show("Garçom chamado"); }}
          aria-label="Chamar o garçom"
        >
          <Bell className="icon" size={17} aria-hidden="true" />Chamar
        </button>
      </header>

      <div className="cl-body">
        {pendingGuests.length > 0 && (
          <div className="cl-pad">
            <div className="alert info stack">
              {pendingGuests.map((g) => (
                <div key={g.id} className="row between">
                  <span><b>{g.name}</b> quer entrar na mesa.</span>
                  <span className="row">
                    <button className="btn sm danger" onClick={() => decideGuest(g.id, false)}>Recusar</button>
                    <button className="btn sm ok" onClick={() => decideGuest(g.id, true)}>Aprovar</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "menu" && (
          <>
            {offers.length > 0 && (
              <section aria-label="Ofertas do dia" className="stack" style={{ gap: 10 }}>
                <h2 style={{ padding: "0 16px" }}>Ofertas do dia</h2>
                <div className="ofr-row">
                  {offers.map((o) => {
                    const n = cart[`offer:${o.id}`] ?? 0;
                    return (
                      <div key={o.id} className="ofr-card">
                        <div className="ofr-photo">
                          {o.photo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={o.photo} alt="" /> : o.emoji}
                          <span className="ofr-tag">{o.tag}</span>
                        </div>
                        <div className="ofr-info">
                          <div className="bold">{o.title}</div>
                          <div className="ofr-price"><b>{money(o.price)}</b> <s>{money(o.normalPrice)}</s></div>
                          <button
                            className={`btn sm${n ? "" : " primary"}`}
                            onClick={() => setQty(`offer:${o.id}`, 1)}
                            aria-label={`Adicionar ${o.title}`}
                          >
                            <Plus className="icon" size={17} aria-hidden="true" />{n ? `+1 (${n})` : "Adicionar"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="chips" role="tablist" style={{ padding: "0 16px" }}>
              {categories.map((c) => (
                <button key={c.id} role="tab" aria-selected={c.id === activeCat} aria-pressed={c.id === activeCat} className={`chip${c.id === activeCat ? " on" : ""}`} onClick={() => setCat(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>

            <div className="cl-pad">
              {activeCatName && <h2>{activeCatName}</h2>}
              {products.map((p) => (
                <div key={p.id} className={`pcard${p.available ? "" : " out"}`}>
                  <ProductThumb p={p} xl />
                  <div className="pbody">
                    <h3>{p.name}</h3>
                    <div className="desc">{p.description}</div>
                    <div className="pfoot">
                      <span className="price">{money(p.price)}</span>
                      <span className="grow" />
                      {p.available ? <Qty id={p.id} label={p.name} /> : <span className="badge bad"><Ban size={14} aria-hidden="true" />Esgotado</span>}
                    </div>
                  </div>
                </div>
              ))}
              {products.length === 0 && <EmptyState title="Sem produtos nesta categoria." />}
            </div>
          </>
        )}

        {view === "cart" && (
          <section className="cl-pad">
            <div className="row between">
              <h2>O seu pedido</h2>
              <button className="btn sm ghost" onClick={() => setView("menu")}>← Cardápio</button>
            </div>
            {lines.length === 0 && (
              <EmptyState title="O carrinho está vazio." hint="Escolha algo no cardápio para começar.">
                <button className="btn primary" onClick={() => setView("menu")}>Ver cardápio</button>
              </EmptyState>
            )}
            {blocked.length > 0 && (
              <div className="alert bad">
                <b>{blocked.map((l) => lineInfo(l.productId)?.name).join(", ")} {blocked.length > 1 ? "esgotaram" : "esgotou"}.</b>{" "}
                Retire {blocked.length > 1 ? "esses itens" : "esse item"} para poder enviar o pedido.
              </div>
            )}
            {lines.map((l) => {
              const info = lineInfo(l.productId);
              if (!info) return null;
              return (
                <div key={l.productId} className={`pcard${info.ok ? "" : " out"}`}>
                  <Thumb emoji={info.emoji} photo={info.photo} large />
                  <div className="pbody">
                    <h3>{info.name}</h3>
                    <div className="desc">{money(info.price)} × {l.qty} = <b>{money(info.price * l.qty)}</b></div>
                    <div className="pfoot">
                      <span className="grow" />
                      {info.ok ? (
                        <div className="qty-pill">
                          <button onClick={() => setQty(l.productId, -1)} aria-label="Diminuir"><Minus size={18} aria-hidden="true" /></button>
                          <span>{l.qty}</span>
                          <button onClick={() => setQty(l.productId, 1)} aria-label="Aumentar"><Plus size={18} aria-hidden="true" /></button>
                        </div>
                      ) : (
                        <>
                          <span className="badge bad"><Ban size={14} aria-hidden="true" />Esgotado</span>
                          <button className="btn sm danger" onClick={() => setCart((c) => ({ ...c, [l.productId]: 0 }))}>Retirar</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {lines.length > 0 && (
              <>
                <div className="field">
                  <label htmlFor="obs">Observação para este pedido</label>
                  <textarea id="obs" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: sem cebola, bife bem passado…" />
                </div>
                <div className="row between"><span>Total deste pedido</span><b style={{ fontSize: "1.25rem" }}>{money(cartTotal)}</b></div>
                <button className="btn primary lg block" disabled={!lines.length || blocked.length > 0} onClick={submit}>
                  Enviar pedido ao garçom
                </button>
                <p className="small muted center">O pagamento é feito com o garçom, fora do sistema.</p>
              </>
            )}
          </section>
        )}

        {view === "orders" && (
          <section className="cl-pad">
            <h2>Meus pedidos</h2>
            {orders.length === 0 && <EmptyState title="Ainda não há pedidos nesta mesa." />}
            {orders.map((o) => (
              <div key={o.id} className="card order-card">
                <div className="head">
                  <span><b>{o.author}</b> <span className="muted small">{hhmm(o.createdAt)} · {ago(o.createdAt)}</span></span>
                  <span className={`badge ${STATUS_BADGE[o.status]}`}>
                    {o.status === "entregue" ? <Check size={14} aria-hidden="true" /> : o.status === "visto" ? <Eye size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
                    {STATUS_LABEL[o.status]}
                  </span>
                </div>
                {o.items.map((i) => (
                  <div key={i.id} className={`line${i.cancelled ? " cancelled" : ""}`}>
                    <span>{i.qty}× {i.name}{i.cancelled ? " (cancelado)" : itemDelivered(o, i) ? " ✓" : ""}</span>
                    <span>{money(i.price * i.qty)}</span>
                  </div>
                ))}
                {o.note && <p className="small muted">{o.note}</p>}
                <div className="line bold"><span>Pedido</span><span>{money(orderTotal(o))}</span></div>
              </div>
            ))}
            <div className="card stack">
              <div className="row between"><span>Total estimado da mesa</span><b style={{ fontSize: "1.25rem" }}>{money(total)}</b></div>
              <p className="small muted">Valor informativo, não é um documento fiscal. O pagamento é feito com o garçom.</p>
              {billAsked ? (
                <div className="alert ok stack">
                  <b>O garçom já vem</b>
                  <span>Seu pedido de conta foi enviado.</span>
                  <button className="btn sm block" onClick={() => { requestBill(table.id); toast.show("Pedido de conta reenviado"); }}>
                    Pedir outra vez
                  </button>
                </div>
              ) : (
                <button className="btn block" onClick={() => requestBill(table.id)}>
                  <Receipt className="icon" size={18} aria-hidden="true" />Pedir a conta
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      {view === "menu" && cartQty > 0 && (
        <button className="cart-cta" onClick={() => setView("cart")}>
          <span className="l"><ShoppingBag size={20} aria-hidden="true" />Ver pedido · {cartQty} {cartQty === 1 ? "item" : "itens"}</span>
          <span>{money(cartTotal)}</span>
        </button>
      )}

      <nav className="tabbar" aria-label="Abas da mesa">
        <div className="tabbar-inner">
          <button onClick={() => setView("menu")} aria-current={view !== "orders" ? "page" : undefined}>
            <span className="pill"><UtensilsCrossed size={22} aria-hidden="true" /></span>Cardápio
          </button>
          <button onClick={() => setView("orders")} aria-current={view === "orders" ? "page" : undefined}>
            <span className="pill">
              <Receipt size={22} aria-hidden="true" />
              {emAndamento > 0 && <span className="count">{emAndamento}</span>}
            </span>
            Meus pedidos
          </button>
        </div>
      </nav>
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
