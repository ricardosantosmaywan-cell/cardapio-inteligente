"use client";
import { useState } from "react";
import { mutate, useDB } from "@/lib/store";
import { Modal, ProductThumb, Thumb, useToast } from "@/components/ui";
import { compressImage, eur, parseEuro, toEuroInput, uid } from "@/lib/utils";
import type { Product } from "@/lib/types";

type Draft = { id?: string; name: string; description: string; price: string; categoryId: string; emoji: string; photo?: string; available: boolean };

export default function Produtos() {
  const db = useDB();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");

  const cats = [...db.categories].sort((a, b) => a.order - b.order);
  const list = db.products.filter(
    (p) => (!cat || p.categoryId === cat) && p.name.toLowerCase().includes(q.toLowerCase()),
  );

  const openNew = () => {
    setErr("");
    setDraft({ name: "", description: "", price: "", categoryId: cats[0]?.id ?? "", emoji: "🍽️", available: true });
  };
  const openEdit = (p: Product) => {
    setErr("");
    setDraft({ ...p, price: toEuroInput(p.price) });
  };

  const save = () => {
    if (!draft) return;
    const price = parseEuro(draft.price);
    if (!draft.name.trim()) return setErr("Indique o nome do produto.");
    if (!Number.isFinite(price) || price < 0) return setErr("Indique um preço válido, por exemplo 12,50.");
    if (!draft.categoryId) return setErr("Crie primeiro uma categoria.");
    mutate((d) => {
      const data = {
        name: draft.name.trim(), description: draft.description.trim(), price, categoryId: draft.categoryId,
        emoji: draft.emoji || "🍽️", photo: draft.photo, available: draft.available,
      };
      if (draft.id) Object.assign(d.products.find((p) => p.id === draft.id)!, data);
      else d.products.push({ id: uid("p"), ...data });
    });
    setDraft(null);
    toast.show("Produto guardado ✅");
  };

  return (
    <main className="shell">
      <div className="row between wrap">
        <h1>Produtos</h1>
        <button className="btn primary" onClick={openNew}>＋ Novo produto</button>
      </div>
      <div className="row wrap">
        <input className="input grow" style={{ minWidth: 200 }} placeholder="Pesquisar produto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar produto" />
        <select className="select" style={{ width: 220 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="card table-scroll">
        <table className="data">
          <thead><tr><th></th><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td><ProductThumb p={p} /></td>
                <td><div className="bold">{p.name}</div><div className="small muted">{p.description}</div></td>
                <td>{db.categories.find((c) => c.id === p.categoryId)?.name}</td>
                <td className="bold">{eur(p.price)}</td>
                <td><span className={`badge ${p.available ? "ok" : "bad"}`}>{p.available ? "Disponível" : "Esgotado"}</span></td>
                <td className="right">
                  <button className="btn sm" onClick={() => openEdit(p)}>Editar</button>{" "}
                  <button className="btn sm danger" aria-label={`Remover ${p.name}`} onClick={() => confirm(`Remover “${p.name}”?`) && mutate((d) => { d.products = d.products.filter((x) => x.id !== p.id); })}>✕</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="center muted">Nenhum produto encontrado.</td></tr>}
          </tbody>
        </table>
      </div>

      {draft && (
        <Modal title={draft.id ? "Editar produto" : "Novo produto"} onClose={() => setDraft(null)}>
          <div className="row">
            <Thumb large emoji={draft.emoji} photo={draft.photo} />
            <div className="stack grow" style={{ gap: 8 }}>
              <label className="btn" style={{ cursor: "pointer" }}>
                📷 Enviar foto
                <input type="file" accept="image/*" hidden onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setDraft({ ...draft, photo: await compressImage(f) });
                }} />
              </label>
              {draft.photo && <button className="btn sm ghost" onClick={() => setDraft({ ...draft, photo: undefined })}>Remover foto</button>}
              <div className="field">
                <label htmlFor="em">Ícone (sem foto)</label>
                <input id="em" className="input" value={draft.emoji} maxLength={4} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="field"><label htmlFor="pn">Nome</label><input id="pn" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="pd">Descrição</label><textarea id="pd" className="textarea" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          <div className="row">
            <div className="field grow"><label htmlFor="pp">Preço (€, IVA incluído)</label><input id="pp" className="input" inputMode="decimal" placeholder="12,50" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></div>
            <div className="field grow"><label htmlFor="pc">Categoria</label>
              <select id="pc" className="select" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <label className="row"><input type="checkbox" checked={draft.available} onChange={(e) => setDraft({ ...draft, available: e.target.checked })} /> Disponível hoje</label>
          {err && <div className="alert bad" role="alert">{err}</div>}
          <button className="btn primary block" onClick={save}>Guardar</button>
        </Modal>
      )}
      {toast.node}
    </main>
  );
}
