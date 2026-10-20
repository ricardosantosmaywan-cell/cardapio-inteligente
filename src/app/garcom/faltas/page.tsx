"use client";
import { setAvailable, useDB } from "@/lib/store";
import { ProductThumb } from "@/components/ui";
import { eur } from "@/lib/utils";

export default function Faltas() {
  const db = useDB();
  const out = db.products.filter((p) => !p.available).length;
  return (
    <main className="shell">
      <div className="row between wrap">
        <h1>Produtos em falta</h1>
        <span className="badge bad">{out} esgotado(s)</span>
      </div>
      <p className="muted small">
        Alterar aqui atualiza todos os telemóveis. Itens já enviados não são afetados; quem tiver o produto no
        carrinho é avisado e não consegue enviar até o retirar.
      </p>
      {[...db.categories].sort((a, b) => a.order - b.order).map((c) => (
        <section key={c.id} className="stack">
          <h2>{c.name}</h2>
          <div className="grid two">
            {db.products.filter((p) => p.categoryId === c.id).map((p) => (
              <div key={p.id} className="card row">
                <ProductThumb p={p} />
                <div className="grow">
                  <div className="bold">{p.name}</div>
                  <div className="small muted">{eur(p.price)}</div>
                </div>
                <div className="tabs" role="group" aria-label={`Disponibilidade de ${p.name}`}>
                  <button className={`btn sm${p.available ? " ok" : ""}`} onClick={() => setAvailable(p.id, true)}>Disponível</button>
                  <button className={`btn sm${!p.available ? " primary" : ""}`} onClick={() => setAvailable(p.id, false)}>Esgotado</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
