"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { makeSeed, SEED_VERSION } from "./seed";
import type { DB, Guest, Order, OrderItem, Product } from "./types";
import { offerLive, openSession, token, uid } from "./utils";

/**
 * Base de dados mock. Vive no localStorage e sincroniza entre abas pelo evento
 * "storage", o que permite mostrar telemóvel, tablet e gestão ao mesmo tempo
 * em abas diferentes. Quando houver Supabase, só este ficheiro muda.
 */
const KEY = "cardapio-mock-db-v1";

let cache: DB | null = null;
let cacheRaw: string | null = null;
const listeners = new Set<() => void>();
const serverSeed = makeSeed();

function read(): DB {
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
  const next = structuredClone(read());
  fn(next);
  write(next);
}

export function resetDemo() {
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
    let status: Guest["status"] = "pendente";
    if (!session) {
      session = { id: uid("s"), tableId: table.id, openedAt: Date.now() };
      db.sessions.push(session);
      table.billRequestedAt = undefined;
      table.calledAt = undefined;
      status = "aprovado"; // o primeiro QR lido abre a sessão
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

export const setOrderStatus = (orderId: string, status: Order["status"]) =>
  mutate((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (o) o.status = status;
  });

export const cancelItem = (orderId: string, itemId: string) =>
  mutate((db) => {
    const it = db.orders.find((x) => x.id === orderId)?.items.find((i) => i.id === itemId);
    if (it) it.cancelled = true;
  });

export const decideGuest = (guestId: string, approve: boolean) =>
  mutate((db) => {
    const g = db.guests.find((x) => x.id === guestId);
    if (g) g.status = approve ? "aprovado" : "recusado";
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
