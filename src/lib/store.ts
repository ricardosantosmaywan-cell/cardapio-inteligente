"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { makeSeed, SEED_VERSION } from "./seed";
import type { DB, Guest, Order, OrderItem, Product } from "./types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { itemDelivered, offerLive, openSession, token, uid, withIds } from "./utils";

/**
 * Base de dados. Com NEXT_PUBLIC_SUPABASE_URL/ANON_KEY definidos, todo o estado
 * vive numa linha da tabela `app_state` (ver supabase/schema.sql) e sincroniza
 * entre aparelhos por Realtime. Sem elas, cai para o localStorage (demo local,
 * sincronizada só entre abas do mesmo navegador).
 */
const KEY = "cardapio-mock-db-v1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REMOTE = !!(SB_URL && SB_KEY);

let cache: DB | null = null;
let cacheRaw: string | null = null;
const listeners = new Set<() => void>();
const serverSeed = makeSeed();

/* ---------- Supabase ---------- */

const ROW = "main";
let sb: SupabaseClient | null = null;
let remoteData: DB | null = null;
let remoteVersion = -1;
let pending = 0;
let queue: Promise<unknown> = Promise.resolve();
let ready: Promise<void> | null = null;

const notify = () => listeners.forEach((l) => l());

function takeRemote(data: DB, version: number) {
  if (version <= remoteVersion) return;
  remoteData = data;
  remoteVersion = version;
  if (!pending) {
    cache = data;
    notify();
  }
}

async function fetchRemote() {
  const { data, error } = await sb!.from("app_state").select("data,version").eq("id", ROW).maybeSingle();
  if (error) throw error;
  return data as { data: DB; version: number } | null;
}

function startRemote() {
  if (ready || typeof window === "undefined") return;
  sb = createClient(SB_URL!, SB_KEY!);
  ready = (async () => {
    let row = await fetchRemote();
    if (!row || row.data.version !== SEED_VERSION) {
      const seed = makeSeed();
      if (!row) {
        await sb!.from("app_state").upsert({ id: ROW, data: seed, version: 0 }, { onConflict: "id", ignoreDuplicates: true });
      } else {
        await sb!.from("app_state").update({ data: seed, version: row.version + 1 }).eq("id", ROW).eq("version", row.version);
      }
      row = await fetchRemote();
    }
    if (row) takeRemote(row.data, row.version);
    sb!
      .channel("app_state")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_state" }, (p) => {
        const r = p.new as { data: DB; version: number };
        takeRemote(r.data, r.version);
      })
      .subscribe();
    // rede de segurança caso o Realtime não esteja ativo
    setInterval(() => fetchRemote().then((r) => r && takeRemote(r.data, r.version)).catch(() => {}), 4000);
  })();
  ready.catch((e) => console.error("Supabase:", e));
}

async function push(fn: (db: DB) => void, ids: string[]) {
  await ready;
  for (let i = 0; i < 8; i++) {
    const next = structuredClone(remoteData!);
    withIds(null, ids, () => fn(next));
    const { data, error } = await sb!
      .from("app_state")
      .update({ data: next, version: remoteVersion + 1 })
      .eq("id", ROW)
      .eq("version", remoteVersion)
      .select("version");
    if (error) throw error;
    if (data?.length) {
      remoteData = next;
      remoteVersion += 1;
      return;
    }
    const row = await fetchRemote(); // outro aparelho escreveu primeiro: refaz sobre o estado novo
    if (row) {
      remoteData = row.data;
      remoteVersion = row.version;
    }
  }
  throw new Error("Conflito de escrita repetido");
}

function read(): DB {
  if (REMOTE) return cache ?? (cache = serverSeed);
  if (typeof window === "undefined") return serverSeed;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* localStorage indisponível */
  }
  if (raw && raw === cacheRaw && cache) return cache;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === SEED_VERSION) {
        cache = parsed;
        cacheRaw = raw;
        return parsed;
      }
    } catch {
      /* cai para o seed */
    }
  }
  if (!cache) cache = makeSeed();
  write(cache);
  return cache;
}

function write(db: DB) {
  cache = db;
  try {
    cacheRaw = JSON.stringify(db);
    localStorage.setItem(KEY, cacheRaw);
  } catch {
    /* quota cheia ou bloqueado: mantém só em memória */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (REMOTE) {
    startRemote();
    return () => {
      listeners.delete(cb);
    };
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, read, () => serverSeed);
}

export function mutate(fn: (db: DB) => void) {
  if (REMOTE) {
    startRemote();
    const ids: string[] = [];
    const next = structuredClone(read());
    withIds(ids, null, () => fn(next));
    cache = next; // otimista: o ecrã responde já
    notify();
    pending++;
    queue = queue
      .then(() => push(fn, ids))
      .catch((e) => console.error("Supabase:", e))
      .finally(() => {
        pending--;
        if (!pending && remoteData) {
          cache = remoteData;
          notify();
        }
      });
    return;
  }
  const next = structuredClone(read());
  fn(next);
  write(next);
}

export function resetDemo() {
  if (REMOTE) {
    const seed = makeSeed();
    mutate((db) => Object.assign(db, seed));
    return;
  }
  write(makeSeed());
}

/** Evita diferenças entre HTML do servidor e do cliente (horas, ids). */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Re-renderiza a cada N ms, para textos como "há 2 min". */
export function useTick(ms = 15000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/* ---------- Sessão do dispositivo (por aba, simula um telemóvel) ---------- */

const gkey = (tableToken: string) => `cardapio-guest-${tableToken}`;
export const getGuestId = (tableToken: string) => {
  try {
    return sessionStorage.getItem(gkey(tableToken));
  } catch {
    return null;
  }
};
const setGuestId = (tableToken: string, id: string) => {
  try {
    sessionStorage.setItem(gkey(tableToken), id);
  } catch {
    /* ignora */
  }
};

/* ---------- Ações do cliente ---------- */

export function joinTable(tableToken: string, name: string, phone?: string): string | null {
  let guestId: string | null = null;
  mutate((db) => {
    const table = db.tables.find((t) => t.token === tableToken);
    if (!table) return;
    let session = openSession(db, table.id);
    const status: Guest["status"] = "pendente"; // o garçom confirma sempre que há alguém na mesa
    if (!session) {
      session = { id: uid("s"), tableId: table.id, openedAt: Date.now() };
      db.sessions.push(session);
      table.billRequestedAt = undefined;
      table.calledAt = undefined;
    }
    guestId = uid("g");
    db.guests.push({ id: guestId, sessionId: session.id, name, phone: phone || undefined, status });
  });
  if (guestId) setGuestId(tableToken, guestId);
  return guestId;
}

export type CartLine = { productId: string; qty: number };

/** Devolve false se algum produto esgotou entretanto (C7). */
export function sendOrder(
  sessionId: string,
  guestId: string | null,
  author: string,
  lines: CartLine[],
  note: string,
): boolean {
  let ok = true;
  mutate((db) => {
    const items: OrderItem[] = [];
    for (const l of lines) {
      if (l.productId.startsWith("offer:")) {
        const o = db.offers.find((x) => x.id === l.productId.slice(6));
        if (!o || !offerLive(o)) {
          ok = false;
          return;
        }
        items.push({ id: uid("i"), productId: l.productId, name: o.title, price: o.price, qty: l.qty, cancelled: false });
        continue;
      }
      const p: Product | undefined = db.products.find((x) => x.id === l.productId);
      if (!p || !p.available) {
        ok = false;
        return;
      }
      items.push({ id: uid("i"), productId: p.id, name: p.name, price: p.price, qty: l.qty, cancelled: false });
    }
    if (!items.length) {
      ok = false;
      return;
    }
    const order: Order = {
      id: uid("or"),
      sessionId,
      guestId,
      author,
      createdAt: Date.now(),
      status: "enviado",
      note,
      items,
    };
    db.orders.push(order);
  });
  return ok;
}

export const requestBill = (tableId: string) =>
  mutate((db) => {
    const t = db.tables.find((x) => x.id === tableId);
    if (t) t.billRequestedAt = Date.now();
  });

export const callWaiter = (tableId: string) =>
  mutate((db) => {
    const t = db.tables.find((x) => x.id === tableId);
    if (t) t.calledAt = Date.now();
  });

/* ---------- Ações do garçom ---------- */

export const dismissCall = (tableId: string) =>
  mutate((db) => {
    const t = db.tables.find((x) => x.id === tableId);
    if (t) t.calledAt = undefined;
  });

/** O pedido fica "entregue" quando todos os itens ativos foram entregues. */
function syncOrderStatus(o: Order) {
  const active = o.items.filter((i) => !i.cancelled);
  const all = active.length > 0 && active.every((i) => i.delivered);
  if (all) o.status = "entregue";
  else if (o.status === "entregue" || (o.status === "enviado" && active.some((i) => i.delivered))) o.status = "visto";
}

const materializeDelivered = (o: Order) => {
  const was = o.status === "entregue";
  for (const i of o.items) if (i.delivered === undefined) i.delivered = was;
};

export const setOrderStatus = (orderId: string, status: Order["status"]) =>
  mutate((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (!o) return;
    if (status === "entregue") {
      for (const i of o.items) if (!i.cancelled) i.delivered = true;
      syncOrderStatus(o);
    } else o.status = status;
  });

export const setItemDelivered = (orderId: string, itemId: string, delivered: boolean) =>
  mutate((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    const it = o?.items.find((i) => i.id === itemId);
    if (!o || !it) return;
    materializeDelivered(o);
    it.delivered = delivered;
    syncOrderStatus(o);
  });

export const cancelItem = (orderId: string, itemId: string) =>
  mutate((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    const it = o?.items.find((i) => i.id === itemId);
    if (!o || !it || itemDelivered(o, it)) return; // item já entregue não se cancela
    materializeDelivered(o);
    it.cancelled = true;
    syncOrderStatus(o);
  });

export const decideGuest = (guestId: string, approve: boolean) =>
  mutate((db) => {
    const g = db.guests.find((x) => x.id === guestId);
    if (!g) return;
    g.status = approve ? "aprovado" : "recusado";
    // Recusou o único a entrar numa mesa vazia: a mesa volta a ficar livre.
    const sess = db.sessions.find((x) => x.id === g.sessionId);
    const vazia = !db.guests.some((x) => x.sessionId === g.sessionId && x.status !== "recusado") && !db.orders.some((o) => o.sessionId === g.sessionId);
    if (!approve && sess && !sess.closedAt && vazia) sess.closedAt = Date.now();
  });

export const openTableSession = (tableId: string) =>
  mutate((db) => {
    if (openSession(db, tableId)) return;
    db.sessions.push({ id: uid("s"), tableId, openedAt: Date.now() });
  });

export const closeTable = (tableId: string) =>
  mutate((db) => {
    const t = db.tables.find((x) => x.id === tableId);
    const s = openSession(db, tableId);
    if (s) s.closedAt = Date.now();
    if (t) {
      t.billRequestedAt = undefined;
      t.calledAt = undefined;
    }
  });

export const renewQr = (tableId: string) =>
  mutate((db) => {
    const t = db.tables.find((x) => x.id === tableId);
    if (t) t.token = token();
  });

export const setAvailable = (productId: string, available: boolean) =>
  mutate((db) => {
    const p = db.products.find((x) => x.id === productId);
    if (p) p.available = available;
  });

/* ---------- Papel (login simulado) ---------- */

export type Role = "garcom" | "dono";
const RKEY = "cardapio-mock-role";
export const getRole = (): Role | null => {
  try {
    return (localStorage.getItem(RKEY) as Role) || null;
  } catch {
    return null;
  }
};
export const setRole = (r: Role | null) => {
  try {
    if (r) localStorage.setItem(RKEY, r);
    else localStorage.removeItem(RKEY);
  } catch {
    /* ignora */
  }
};
