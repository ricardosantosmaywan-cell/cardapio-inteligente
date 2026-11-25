"use client";
import { useState } from "react";
import { Plus, Camera } from "lucide-react";
import { mutate, useDB } from "@/lib/store";
import { Modal, Thumb, EmptyState, Switch } from "@/components/ui";
import { useLoja } from "@/components/loja";
import { removePhoto, usePhotoUploads } from "@/lib/fotos";
import { currencySymbol, DAYS, money, offerLive, parseMoney, toMoneyInput, uid } from "@/lib/utils";
import type { Offer } from "@/lib/types";

type Draft = Omit<Offer, "price" | "normalPrice"> & { price: string; normalPrice: string };

export default function Ofertas() {
  const db = useDB();
  const { slug } = useLoja();
  const fotos = usePhotoUploads(slug);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [enviando, setEnviando] = useState(false);
  const offers = [...db.offers].sort((a, b) => a.order - b.order);

  const fechar = () => {
    fotos.cancel(); // apaga as imagens enviadas neste formulário e não guardadas
    setDraft(null);
  };

  const blank = (): Draft => ({
    id: "", title: "", tag: "Hoje", emoji: "🍲", price: "", normalPrice: "", days: [0, 1, 2, 3, 4, 5, 6],
    start: "12:00", end: "15:00", active: true, order: db.offers.length + 1,
  });

  const save = () => {
    if (!draft) return;
    const price = parseMoney(draft.price);
    const normalPrice = parseMoney(draft.normalPrice);
    if (!draft.title.trim()) return setErr("Informe o título da oferta.");
    if (!Number.isFinite(price) || !Number.isFinite(normalPrice)) return setErr("Informe o preço da oferta e o preço normal.");
    if (!draft.days.length) return setErr("Escolha pelo menos um dia.");
    const original = draft.id ? db.offers.find((o) => o.id === draft.id)?.photo : undefined;
    mutate((d) => {
      const data = { ...draft, title: draft.title.trim(), price, normalPrice };
      if (draft.id) Object.assign(d.offers.find((o) => o.id === draft.id)!, data);
      else d.offers.push({ ...data, id: uid("o") });
    });
    fotos.finish(draft.photo, original); // apaga a imagem trocada ou removida e as enviadas e não usadas
    setDraft(null);
  };

  const preview = draft && { ...draft, price: parseMoney(draft.price) || 0, normalPrice: parseMoney(draft.normalPrice) || 0 };

  return (
    <main className="shell">
      <div className="row between wrap">
        <h1>Ofertas do dia</h1>
        <button className="btn primary" onClick={() => { setErr(""); setDraft(blank()); }}><Plus className="icon" size={18} aria-hidden="true" /> Nova oferta</button>
      </div>
      <p className="muted small">As ofertas só aparecem no celular do cliente dentro do dia e do horário configurados.</p>
      <div className="grid two">
        {offers.map((o) => {
          const live = offerLive(o);
          return (
            <div key={o.id} className="card stack">
              <div className="row">
                <Thumb emoji={o.emoji} photo={o.photo} />
                <div className="grow">
                  <div className="row"><span className="badge brand">{o.tag}</span>
                    {!o.active ? <span className="badge">Inativa</span> : live ? <span className="badge ok">A mostrar</span> : <span className="badge warn">Fora do horário</span>}
                  </div>
                  <div className="bold">{o.title}</div>
                  <div><b>{money(o.price)}</b> <s className="muted">{money(o.normalPrice)}</s></div>
                  <div className="small muted">{o.days.length === 7 ? "Todos os dias" : o.days.map((d) => DAYS[d]).join(", ")} · {o.start}–{o.end}</div>
                </div>
              </div>
              <div className="row wrap">
                <button className="btn sm" onClick={() => { setErr(""); setDraft({ ...o, price: toMoneyInput(o.price), normalPrice: toMoneyInput(o.normalPrice) }); }}>Editar</button>
                <button className="btn sm" onClick={() => mutate((d) => { const x = d.offers.find((y) => y.id === o.id)!; x.active = !x.active; })}>{o.active ? "Desativar" : "Ativar"}</button>
                <button className="btn sm danger" onClick={() => { if (!confirm("Remover esta oferta?")) return; mutate((d) => { d.offers = d.offers.filter((x) => x.id !== o.id); }); void removePhoto(o.photo); }}>Remover</button>
              </div>
            </div>
          );
        })}
        {offers.length === 0 && <div className="card" style={{ gridColumn: "1 / -1" }}><EmptyState title="Ainda não há ofertas" hint="Crie uma oferta do dia para aparecer no celular do cliente no dia e horário escolhidos." /></div>}
      </div>

      {draft && preview && (
        <Modal title={draft.id ? "Editar oferta" : "Nova oferta"} onClose={fechar}>
          <div className="offer" aria-label="Pré-visualização">
            <Thumb emoji={preview.emoji} photo={preview.photo} />
            <div className="grow stack" style={{ gap: 4 }}>
              <span className="tag" style={{ alignSelf: "flex-start" }}>{preview.tag || "Etiqueta"}</span>
              <div className="bold">{preview.title || "Título da oferta"}</div>
              <div><b>{money(preview.price)}</b> <s>{money(preview.normalPrice)}</s></div>
            </div>
          </div>
          <div className="row wrap">
            <label className="btn" style={{ cursor: enviando ? "wait" : "pointer", opacity: enviando ? 0.6 : 1 }}><Camera className="icon" size={18} aria-hidden="true" /> {enviando ? "A enviar…" : "Enviar imagem"}
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
            {draft.photo && <button className="btn sm ghost" onClick={() => { fotos.discard(draft.photo); setDraft({ ...draft, photo: undefined }); }}>Remover imagem</button>}
            <div className="field" style={{ width: 90 }}><label htmlFor="oe">Ícone</label><input id="oe" className="input" maxLength={4} value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field grow"><label htmlFor="ot">Título</label><input id="ot" className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
            <div className="field grow"><label htmlFor="og">Etiqueta</label><input id="og" className="input" value={draft.tag} onChange={(e) => setDraft({ ...draft, tag: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field grow"><label htmlFor="op">Preço da oferta ({currencySymbol()})</label><input id="op" className="input" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></div>
            <div className="field grow"><label htmlFor="on">Preço normal ({currencySymbol()})</label><input id="on" className="input" inputMode="decimal" value={draft.normalPrice} onChange={(e) => setDraft({ ...draft, normalPrice: e.target.value })} /></div>
          </div>
          <div className="field">
            <label>Dias</label>
            <div className="chips" role="group" aria-label="Dias da semana">
              {DAYS.map((n, i) => (
                <button key={n} type="button" className={`chip${draft.days.includes(i) ? " on" : ""}`} aria-pressed={draft.days.includes(i)}
                  onClick={() => setDraft({ ...draft, days: draft.days.includes(i) ? draft.days.filter((d) => d !== i) : [...draft.days, i] })}>{n}</button>
              ))}
            </div>
          </div>
          <div className="row">
            <div className="field grow"><label htmlFor="os">Das</label><input id="os" type="time" className="input" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></div>
            <div className="field grow"><label htmlFor="oh">Às</label><input id="oh" type="time" className="input" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></div>
            <div className="field grow"><label htmlFor="oo">Ordem</label><input id="oo" type="number" min={1} className="input" value={draft.order} onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) || 1 })} /></div>
          </div>
          <Switch label="Ativa" checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
          {err && <div className="alert bad" role="alert">{err}</div>}
          <button className="btn primary block" onClick={save} disabled={enviando}>Salvar oferta</button>
        </Modal>
      )}
    </main>
  );
}
