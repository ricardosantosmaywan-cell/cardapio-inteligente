"use client";
import { useDB } from "@/lib/store";
import { eur, orderTotal } from "@/lib/utils";

export default function Relatorio() {
  const db = useDB();
  const orders = db.orders;

  const perDay = new Map<string, { n: number; total: number }>();
  const perProduct = new Map<string, { name: string; qty: number }>();
  const perTable = new Map<string, number>();

  for (const o of orders) {
    const day = new Date(o.createdAt).toLocaleDateString("pt-PT");
    const d = perDay.get(day) ?? { n: 0, total: 0 };
    d.n += 1;
    d.total += orderTotal(o);
    perDay.set(day, d);
    for (const i of o.items.filter((x) => !x.cancelled)) {
      const p = perProduct.get(i.productId) ?? { name: i.name, qty: 0 };
      p.qty += i.qty;
      perProduct.set(i.productId, p);
    }
    const t = db.tables.find((x) => x.id === db.sessions.find((s) => s.id === o.sessionId)?.tableId);
    if (t) perTable.set(t.name, (perTable.get(t.name) ?? 0) + orderTotal(o));
  }

  const top = [...perProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
  const tables = [...perTable.entries()].sort((a, b) => b[1] - a[1]);
  const max = top[0]?.qty || 1;

  return (
    <main className="shell">
      <h1>Relatório simples</h1>
      <p className="muted small">Valores informativos (estimativa), não substituem a faturação do estabelecimento.</p>
      <div className="grid two">
        <section className="card stack">
          <h2>Pedidos por dia</h2>
          <table className="data">
            <thead><tr><th>Dia</th><th>Pedidos</th><th>Valor estimado</th></tr></thead>
            <tbody>
              {[...perDay.entries()].map(([d, v]) => <tr key={d}><td>{d}</td><td>{v.n}</td><td>{eur(v.total)}</td></tr>)}
              {perDay.size === 0 && <tr><td colSpan={3} className="muted">Sem pedidos ainda.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="card stack">
          <h2>Mesas com mais consumo</h2>
          <table className="data">
            <thead><tr><th>Mesa</th><th>Valor estimado</th></tr></thead>
            <tbody>
              {tables.map(([n, v]) => <tr key={n}><td>{n}</td><td>{eur(v)}</td></tr>)}
              {tables.length === 0 && <tr><td colSpan={2} className="muted">Sem dados.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="card stack">
          <h2>Produtos mais pedidos</h2>
          {top.map((p) => (
            <div key={p.name} className="stack" style={{ gap: 4 }}>
              <div className="row between"><span>{p.name}</span><b>{p.qty}</b></div>
              <div style={{ background: "var(--line)", borderRadius: 6, height: 8 }}>
                <div style={{ width: `${(p.qty / max) * 100}%`, background: "var(--brand)", height: 8, borderRadius: 6 }} />
              </div>
            </div>
          ))}
          {top.length === 0 && <p className="muted">Sem dados.</p>}
        </section>
      </div>
    </main>
  );
}
