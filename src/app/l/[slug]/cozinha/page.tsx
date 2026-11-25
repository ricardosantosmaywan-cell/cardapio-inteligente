"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CircleCheck, Clock, Flame, StickyNote, Undo2, Volume2, VolumeX } from "lucide-react";
import { useLoja } from "@/components/loja";
import { EmptyState, ErrorState, Skeleton, useToast } from "@/components/ui";
import { useCozinha, type KitchenOrder } from "@/lib/cozinha";
import { useTick } from "@/lib/store";
import type { KitchenStatus } from "@/lib/types";
import { beep, hhmm, KITCHEN_LABEL, minutesSince } from "@/lib/utils";

const COLUNAS: { estado: KitchenStatus; titulo: string; vazio: string }[] = [
  { estado: "novo", titulo: "Novos", vazio: "Sem pedidos novos." },
  { estado: "preparo", titulo: "Em preparação", vazio: "Nada em preparação." },
  { estado: "pronto", titulo: "Prontos", vazio: "Nada à espera do garçom." },
];

function Cartao({ o, alertMin, onMark }: { o: KitchenOrder; alertMin: number; onMark: (estado: KitchenStatus) => void }) {
  const espera = minutesSince(o.createdAt);
  const atrasado = o.kitchen !== "pronto" && espera >= alertMin;
  return (
    <article className={`kcard ${o.kitchen}${atrasado ? " atrasado" : ""}`} aria-label={`${o.mesa}, pedido das ${hhmm(o.createdAt)}`}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 2 }}>
          <div className="kmesa">{o.mesa}</div>
          <div className="small muted">Pedido das {hhmm(o.createdAt)}</div>
        </div>
        {o.kitchen === "pronto" ? (
          <span className="kchip ok"><CircleCheck size={18} aria-hidden="true" />pronto há {minutesSince(o.readyAt ?? o.createdAt)} min</span>
        ) : (
          <span className={`kchip${atrasado ? " bad" : ""}`}>
            {atrasado ? <AlertTriangle size={18} aria-hidden="true" /> : <Clock size={18} aria-hidden="true" />}
            {espera} min
            {atrasado && <span className="sr-only"> (passou do limite de {alertMin} min)</span>}
          </span>
        )}
      </div>

      <ul className="kitens">
        {o.items.map((i) => (
          <li key={i.id} className={i.cancelled ? "cancelado" : undefined}>
            <span className="kqtd">{i.qty}×</span>
            <span className="grow">{i.name}</span>
            {i.cancelled && <span className="small">cancelado</span>}
          </li>
        ))}
      </ul>

      {o.note && <div className="note-box"><span className="ic"><StickyNote size={18} aria-hidden="true" /></span>{o.note}</div>}

      <div className="row wrap">
        {o.kitchen === "novo" && (
          <button className="btn primary grow" onClick={() => onMark("preparo")}><Flame className="icon" size={22} aria-hidden="true" />Começar preparo</button>
        )}
        {o.kitchen === "preparo" && (
          <>
            <button className="btn ok grow" onClick={() => onMark("pronto")}><CircleCheck className="icon" size={22} aria-hidden="true" />Marcar pronto</button>
            <button className="btn ghost" onClick={() => onMark("novo")} aria-label={`Voltar ${o.mesa} para novos`}><Undo2 className="icon" size={20} aria-hidden="true" />Desfazer</button>
          </>
        )}
        {o.kitchen === "pronto" && (
          <>
            <span className="small muted grow">À espera do garçom para levar à mesa.</span>
            <button className="btn ghost" onClick={() => onMark("preparo")} aria-label={`Voltar ${o.mesa} para em preparação`}><Undo2 className="icon" size={20} aria-hidden="true" />Desfazer</button>
          </>
        )}
      </div>
    </article>
  );
}

export default function Cozinha() {
  const { slug } = useLoja();
  const k = useCozinha(slug);
  const toast = useToast();
  useTick(15000);

  // Som discreto quando chega um pedido novo à cozinha.
  const [som, setSom] = useState(true);
  const novos = k.orders.filter((o) => o.kitchen === "novo").length;
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (!k.ready) return;
    if (prev.current !== null && novos > prev.current && som) beep();
    prev.current = novos;
  }, [novos, som, k.ready]);

  const marcar = async (o: KitchenOrder, estado: KitchenStatus) => {
    const erro = await k.mark(o.id, estado);
    if (erro) toast.show(erro);
    else if (estado === "pronto") toast.show(`${o.mesa}: pedido pronto. O garçom foi avisado.`);
  };

  if (!k.ready) {
    return (
      <main className="shell" aria-busy="true" aria-label="A carregar pedidos">
        <Skeleton h={40} w="30%" />
        <div className="kds"><Skeleton h={220} /><Skeleton h={220} /><Skeleton h={220} /></div>
      </main>
    );
  }

  if (k.erro && !k.orders.length) {
    return (
      <main className="shell">
        <h1>Cozinha</h1>
        <div className="card"><ErrorState title="Não foi possível carregar os pedidos" hint={k.erro} onRetry={k.refresh} /></div>
      </main>
    );
  }

  if (!k.enabled) {
    return (
      <main className="shell">
        <h1>Cozinha</h1>
        <div className="card">
          <EmptyState title="A tela da cozinha está desligada" hint="O dono pode ligá-la no painel do dono, em Equipe." />
        </div>
      </main>
    );
  }

  const porEstado = (e: KitchenStatus) => k.orders.filter((o) => o.kitchen === e);
  const atrasados = k.orders.filter((o) => o.kitchen !== "pronto" && minutesSince(o.createdAt) >= k.alertMin).length;

  return (
    <main className="shell cozinha">
      <div className="row between wrap">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Cozinha</h1>
          <p className="muted" role="status">
            {novos} {novos === 1 ? "novo" : "novos"} · {porEstado("preparo").length} em preparação · {porEstado("pronto").length} {porEstado("pronto").length === 1 ? "pronto" : "prontos"}
            {atrasados > 0 && <b className="katrasados"> · {atrasados} {atrasados === 1 ? "passou" : "passaram"} de {k.alertMin} min</b>}
          </p>
        </div>
        <div className="card" style={{ padding: "0 16px" }}>
          <div className="switch">
            <button type="button" role="switch" aria-checked={som} aria-label="Som de aviso" onClick={() => setSom(!som)} />
            <span>Som de aviso</span>
            {som ? <Volume2 size={18} aria-hidden="true" className="muted" /> : <VolumeX size={18} aria-hidden="true" className="muted" />}
          </div>
        </div>
      </div>

      {k.erro && <div className="alert warn" role="alert">{k.erro}</div>}

      <div className="kds">
        {COLUNAS.map((c) => {
          const lista = porEstado(c.estado);
          return (
            <section key={c.estado} className={`kcol ${c.estado}`} aria-labelledby={`kcol-${c.estado}`}>
              <h2 id={`kcol-${c.estado}`}>
                {c.titulo} <span className="badge">{lista.length}</span>
              </h2>
              {lista.length === 0 ? (
                <p className="muted kvazio">{c.vazio}</p>
              ) : (
                lista.map((o) => <Cartao key={o.id} o={o} alertMin={k.alertMin} onMark={(e) => void marcar(o, e)} />)
              )}
            </section>
          );
        })}
      </div>
      <p className="muted small">Estados: {Object.values(KITCHEN_LABEL).join(" → ")}. Os pedidos saem desta tela quando o garçom os entrega à mesa.</p>
      {toast.node}
    </main>
  );
}
