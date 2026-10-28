import type { DB, Offer, Order, Session, Table, TableState } from "./types";

export const eur = (cents: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(cents / 100);

/**
 * Ids e tokens são gerados uma vez e repetidos se uma escrita no Supabase tiver
 * de ser refeita (conflito de versão), para o id devolvido ao cliente continuar válido.
 */
const ids: { record: string[] | null; replay: string[] | null } = { record: null, replay: null };
export function withIds<T>(record: string[] | null, replay: string[] | null, f: () => T): T {
  const prev = { ...ids };
  ids.record = record;
  ids.replay = replay ? [...replay] : null;
  try {
    return f();
  } finally {
    ids.record = prev.record;
    ids.replay = prev.replay;
  }
}
const stable = (gen: () => string) => {
  if (ids.replay?.length) return ids.replay.shift()!;
  const v = gen();
  ids.record?.push(v);
  return v;
};

export const uid = (p = "id") =>
  stable(() => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`);

export const token = () =>
  stable(() =>
    Array.from(crypto.getRandomValues(new Uint8Array(18)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  );

export const hhmm = (ts: number) =>
  new Date(ts).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });

export const ago = (ts: number) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  return `há ${Math.round(m / 60)} h`;
};

export const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const openSession = (db: DB, tableId: string): Session | undefined =>
  db.sessions.find((s) => s.tableId === tableId && !s.closedAt);

export const orderTotal = (o: Order) =>
  o.items.filter((i) => !i.cancelled).reduce((sum, i) => sum + i.price * i.qty, 0);

export const sessionTotal = (db: DB, sessionId: string) =>
  db.orders.filter((o) => o.sessionId === sessionId).reduce((sum, o) => sum + orderTotal(o), 0);

export const tableState = (db: DB, t: Table): TableState => {
  if (!openSession(db, t.id)) return "livre";
  if (t.billRequestedAt) return "conta";
  if (t.calledAt) return "chamou";
  return "ocupada";
};

const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

/** Oferta visível ao cliente agora (dia e horário configurados). */
export const offerLive = (o: Offer, now = new Date()) => {
  if (!o.active || !o.days.includes(now.getDay())) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = toMin(o.start);
  const b = toMin(o.end);
  return a <= b ? cur >= a && cur <= b : cur >= a || cur <= b;
};

export function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
  } catch {
    /* sem áudio */
  }
}

/** Reduz a foto enviada pelo dono antes de a guardar (PRD: imagens leves). */
export function compressImage(file: File, max = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler a imagem"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.75));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const parseEuro = (s: string) => Math.round(parseFloat(s.replace(",", ".")) * 100);
export const toEuroInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");
