"use client";
import { useState } from "react";
import { Plus, X, Check, Camera, ImageUp } from "lucide-react";
import { mutate, useDB } from "@/lib/store";
import { EmptyState, Modal, ProductThumb, Thumb, useToast } from "@/components/ui";
import { useLoja } from "@/components/loja";
import { REMOTE } from "@/lib/supabase";
import { applyPhotoMap, countToMigrate, migratePhotos, removePhoto, usePhotoUploads } from "@/lib/fotos";
import { currencySymbol, money, parseMoney, toMoneyInput, uid } from "@/lib/utils";
import type { Product } from "@/lib/types";

type Draft = { id?: string; name: string; description: string; price: string; categoryId: string; emoji: string; photo?: string; available: boolean };

export default function Produtos() {
  const db = useDB();
  const { slug } = useLoja();
  const toast = useToast();
  const fotos = usePhotoUploads(slug);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [migra, setMigra] = useState<{ done: number; total: number } | null>(null);
  const porMigrar = REMOTE ? countToMigrate(db) : 0;

  const fechar = () => {
    fotos.cancel(); // apaga as fotos enviadas neste formulário e não guardadas
    setDraft(null);
  };

  const moverFotos = async () => {
    setMigra({ done: 0, total: porMigrar });
    try {
      const r = await migratePhotos(db, slug, (m) => mutate((d) => applyPhotoMap(d, m)), (done, total) => setMigra({ done, total }));
      const kb = (n: number) => Math.round(n / 1024);
      toast.show(`${r.moved} foto(s) no armazenamento. Dados da loja: ${kb(r.bytesBefore)} KB → ${kb(r.bytesAfter)} KB`);
    } catch (e) {
      toast.show(`Nada foi alterado. ${fotos.errorText(e)}`);
    }
    setMigra(null);
  };

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
    setDraft({ ...p, price: toMoneyInput(p.price) });
  };

  const save = () => {
    if (!draft) return;
    const price = parseMoney(draft.price);
    if (!draft.name.trim()) return setErr("Informe o nome do produto.");
    if (!Number.isFinite(price) || price < 0) return setErr("Informe um preço válido, por exemplo 12,50.");
    if (!draft.categoryId) return setErr("Crie primeiro uma categoria.");
    const original = draft.id ? db.products.find((p) => p.id === draft.id)?.photo : undefined;
    mutate((d) => {
      const data = {
        name: draft.name.trim(), description: draft.description.trim(), price, categoryId: draft.categoryId,
        emoji: draft.emoji || "🍽️", photo: draft.photo, available: draft.available,
      };
      if (draft.id) Object.assign(d.products.find((p) => p.id === draft.id)!, data);
      else d.products.push({ id: uid("p"), ...data });
    });
    fotos.finish(draft.photo, original); // apaga a foto trocada ou removida e as enviadas e não usadas
    setDraft(null);
    toast.show("Produto salvo ✅");
  };

  return (
    <main className="shell">
      <div className="row between wrap">
        <h1>Produtos</h1>
        <button className="btn primary" onClick={openNew}><Plus className="icon" size={18} aria-hidden="true" /> Novo produto</button>
      </div>
      {porMigrar > 0 && (
        <div className="notice warn" role="status">
          <span className="ic"><ImageUp size={24} aria-hidden="true" /></span>
          <div className="body">
            <b>{porMigrar} {porMigrar === 1 ? "foto está guardada" : "fotos estão guardadas"} dentro dos dados da loja</b>
            <span>Isto deixa o cardápio pesado. Mova-as para o armazenamento: nenhuma foto se perde e, se algo falhar, nada é alterado.</span>
          </div>
          <button className="btn primary" onClick={() => void moverFotos()} disabled={!!migra}>
            {migra ? `A mover… ${migra.done}/${migra.total}` : "Mover fotos para o armazenamento"}
          </button>
        </div>
      )}
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
                <td className="cel-foto" data-label=""><ProductThumb p={p} /></td>
                <td className="cel-nome" data-label=""><div className="bold">{p.name}</div><div className="small muted">{p.description}</div></td>
                <td data-label="Categoria">{db.categories.find((c) => c.id === p.categoryId)?.name}</td>
                <td className="bold" data-label="Preço">{money(p.price)}</td>
                <td data-label="Estado"><span className={`badge ${p.available ? "ok" : "bad"}`}>{p.available ? <><Check className="icon" size={14} aria-hidden="true" /> Disponível</> : <><X className="icon" size={14} aria-hidden="true" /> Esgotado</>}</span></td>
                <td className="right" data-label="">
                  <button className="btn sm" onClick={() => openEdit(p)}>Editar</button>{" "}
                  <button className="btn sm danger" aria-label={`Remover ${p.name}`} onClick={() => { if (!confirm(`Remover “${p.name}”?`)) return; mutate((d) => { d.products = d.products.filter((x) => x.id !== p.id); }); void removePhoto(p.photo); }}><X className="icon" size={18} aria-hidden="true" /></button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6}><EmptyState title={db.products.length === 0 ? "Ainda não há produtos" : "Nenhum produto encontrado"} hint={db.products.length === 0 ? "Cadastre o primeiro produto para ele aparecer no cardápio do cliente." : "Tente outra busca ou outra categoria."}>{db.products.length === 0 && <button className="btn primary" onClick={openNew}><Plus className="icon" size={18} aria-hidden="true" />Novo produto</button>}</EmptyState></td></tr>}
          </tbody>
        </table>
      </div>

      {draft && (
        <Modal title={draft.id ? "Editar produto" : "Novo produto"} onClose={fechar}>
          <div className="row">
            <Thumb large emoji={draft.emoji} photo={draft.photo} />
            <div className="stack grow" style={{ gap: 8 }}>
              <label className="btn" style={{ cursor: enviando ? "wait" : "pointer", opacity: enviando ? 0.6 : 1 }}>
                <Camera className="icon" size={18} aria-hidden="true" /> {enviando ? "A enviar…" : "Enviar foto"}
                <input type="file" accept="image/*" hidden disabled={enviando} onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setEnviando(true);
                  setErr("");
                  try {
                    const url = await fotos.upload(f, draft.photo);
                    setDraft((d) => d && { ...d, photo: url });
                  } catch (x) {
                    setErr(fotos.errorText(x));
                  }
                  setEnviando(false);
                }} />
              </label>
              {draft.photo && <button className="btn sm ghost" onClick={() => { fotos.discard(draft.photo); setDraft({ ...draft, photo: undefined }); }}>Remover foto</button>}
              <div className="field">
                <label htmlFor="em">Ícone (sem foto)</label>
                <input id="em" className="input" value={draft.emoji} maxLength={4} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="field"><label htmlFor="pn">Nome</label><input id="pn" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="pd">Descrição</label><textarea id="pd" className="textarea" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          <div className="row">
            <div className="field grow"><label htmlFor="pp">Preço ({currencySymbol()})</label><input id="pp" className="input" inputMode="decimal" placeholder="12,50" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></div>
            <div className="field grow"><label htmlFor="pc">Categoria</label>
              <select id="pc" className="select" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <label className="row"><input type="checkbox" checked={draft.available} onChange={(e) => setDraft({ ...draft, available: e.target.checked })} /> Disponível hoje</label>
          {err && <div className="alert bad" role="alert">{err}</div>}
          <button className="btn primary block" onClick={save} disabled={enviando}>Salvar</button>
        </Modal>
      )}
      {toast.node}
    </main>
  );
}
