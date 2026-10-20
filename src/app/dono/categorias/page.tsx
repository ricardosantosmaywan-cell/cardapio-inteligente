"use client";
import { useState } from "react";
import { mutate, useDB } from "@/lib/store";
import { uid } from "@/lib/utils";

export default function Categorias() {
  const db = useDB();
  const [name, setName] = useState("");
  const cats = [...db.categories].sort((a, b) => a.order - b.order);

  const move = (i: number, dir: -1 | 1) =>
    mutate((d) => {
      const sorted = [...d.categories].sort((a, b) => a.order - b.order);
      const j = i + dir;
      if (j < 0 || j >= sorted.length) return;
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      sorted.forEach((c, k) => (c.order = k + 1));
    });

  return (
    <main className="shell" style={{ maxWidth: 720 }}>
      <h1>Categorias</h1>
      <p className="muted small">A ordem aqui é a ordem das categorias no cardápio do cliente.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          mutate((d) => { d.categories.push({ id: uid("c"), name: name.trim(), order: d.categories.length + 1 }); });
          setName("");
        }}
      >
        <input className="input" placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome da nova categoria" />
        <button className="btn primary" type="submit">Adicionar</button>
      </form>
      <div className="stack">
        {cats.map((c, i) => {
          const n = db.products.filter((p) => p.categoryId === c.id).length;
          return (
            <div key={c.id} className="card row">
              <input
                className="input grow"
                value={c.name}
                aria-label={`Nome da categoria ${c.name}`}
                onChange={(e) => mutate((d) => { d.categories.find((x) => x.id === c.id)!.name = e.target.value; })}
              />
              <span className="badge">{n} produto(s)</span>
              <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
              <button className="btn sm" onClick={() => move(i, 1)} disabled={i === cats.length - 1} aria-label="Descer">↓</button>
              <button
                className="btn sm danger"
                disabled={n > 0}
                title={n > 0 ? "Mova ou remova os produtos primeiro" : "Remover"}
                onClick={() => mutate((d) => { d.categories = d.categories.filter((x) => x.id !== c.id); })}
                aria-label="Remover categoria"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
