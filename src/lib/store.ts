"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { makeSeed, makeStoreSeed, SEED_VERSION } from "./seed";
import type { DB, Guest, KitchenConfig, KitchenStatus, Order, OrderItem, Product } from "./types";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabase, REMOTE } from "./supabase";
import { itemDelivered, offerLive, openSession, token, uid, withIds } from "./utils";

/**
 * Base de dados, por loja. Com NEXT_PUBLIC_SUPABASE_URL/ANON_KEY definidos há duas camadas:
 *  - PÚBLICA: o cardápio (nome, categorias, produtos, ofertas), na tabela `cardapio_publico`,
 *    que qualquer pessoa lê. É o que o cliente à mesa vê.
 *  - EQUIPE: o estado completo (mesas, clientes, celulares, pedidos), na tabela `app_state`,
 *    que só o dono e o garçom da loja leem e alteram, com login (ver supabase/schema-multiloja.sql).
 * O cliente à mesa NÃO usa `app_state`: age por funções no servidor (ver ./mesa.ts).
 * Sem as variáveis, cai para o localStorage (demo local, sincronizada só entre abas).
 *
 * A loja é escolhida por `configureStore(slug)`, chamado pelo layout /l/[slug].
 * As lojas são criadas só pelo /admin: esta camada nunca cria nem repõe linhas.
 */
let STORE = "";
let ROW = "";
let KEY = "cardapio-db-";

export type StoreStatus = "loading" | "ready" | "missing" | "error";
let status: StoreStatus = REMOTE ? "loading" : "ready";

let cache: DB | null = null;
let cacheRaw: string | null = null;
const listeners = new Set<() => void>();
const serverSeed = makeSeed();

/* ---------- Supabase ---------- */

let sb: SupabaseClient | null = null;
let chan: RealtimeChannel | null = null;
let poll: ReturnType<typeof setInterval> | null = null; // equipe: rede de segurança do Realtime
let pubPoll: ReturnType<typeof setInterval> | null = null; // público: atualiza o cardápio
let authSub: { unsubscribe: () => void } | null = null;
let mode: "public" | "staff" = "public"; // "staff" = tem sessão e é da equipe desta loja
let pubDB: DB | null = null;
let pubVersion = -1;
let remoteData: DB | null = null;
let remoteVersion = -1;
let pending = 0;
let queue: Promise<unknown> = Promise.resolve();
let ready: Promise<void> | null = null;

const notify = () => listeners.forEach((l) => l());

/** Escolhe a loja. Se mudar de loja, limpa tudo o que era da anterior. */
export function configureStore(slug: string) {
  if (slug === STORE) return;
  detachStaff();
  if (pubPoll) clearInterval(pubPoll);
  authSub?.unsubscribe();
  pubPoll = null;
  authSub = null;
  STORE = slug;
  ROW = slug;
  KEY = `cardapio-db-${slug}`;
  cache = null;
  cacheRaw = null;
  mode = "public";
  pubDB = null;
  pubVersion = -1;
  remoteData = null;
  remoteVersion = -1;
  pending = 0;
  queue = Promise.resolve();
  ready = null;
  status = REMOTE ? "loading" : "ready";
}

export const useStoreStatus = (): StoreStatus => useSyncExternalStore(subscribe, () => status, () => (REMOTE ? "loading" : "ready"));

function takeRemote(data: DB, version: number) {
  if (version <= remoteVersion) return;
  remoteData = data;
  remoteVersion = version;
  if (!pending) {
    cache = data;
    notify();
  }
}

/** Estado completo da loja: só devolve linha se o utilizador for da equipe (a base de dados esconde-a aos outros). */
async function fetchRemote() {
  const { data, error } = await sb!.from("app_state").select("data,version").eq("id", ROW).maybeSingle();
  if (error) throw error;
  return data as { data: DB; version: number } | null;
}

/** Cardápio público: qualquer pessoa lê (enquanto a loja estiver ativa). */
async function fetchPublic() {
  const { data, error } = await sb!.from("cardapio_publico").select("data,version").eq("id", ROW).maybeSingle();
  if (error) throw error;
  return data as { data: DB; version: number } | null;
}

/** Sem acesso de equipe, o ecrã vê só o cardápio; as listas privadas ficam vazias. */
const composePublic = (d: DB): DB => ({ ...d, tables: [], sessions: [], guests: [], orders: [] });

function takePublic(d: DB, version: number) {
  if (version <= pubVersion) return;
  pubVersion = version;
  pubDB = composePublic(d);
  if (mode === "public") {
    cache = pubDB;
    notify();
  }
}

function detachStaff() {
  if (chan && sb) sb.removeChannel(chan);
  if (poll) clearInterval(poll);
  chan = null;
  poll = null;
}

/** Se há sessão e o utilizador é da equipe desta loja, passa ao estado completo (com Realtime). */
async function attachStaff(row: string) {
  detachStaff();
  const { data: s } = await sb!.auth.getSession();
  if (row !== ROW) return;
  let full: { data: DB; version: number } | null = null;
  if (s.session) {
    try {
      full = await fetchRemote();
    } catch {
      full = null;
    }
  }
  if (row !== ROW) return;
  if (!full) {
    mode = "public";
    remoteData = null;
    remoteVersion = -1;
    if (pubDB) {
      cache = pubDB;
      notify();
    }
    return;
  }
  mode = "staff";
  remoteData = full.data;
  remoteVersion = full.version;
  cache = full.data;
  notify();
  chan = sb!
    .channel(`loja-${row}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_state", filter: `id=eq.${row}` }, (p) => {
      const r = p.new as { data: DB; version: number };
      takeRemote(r.data, r.version);
    })
    .subscribe();
  // rede de segurança caso o Realtime não esteja ativo
  poll = setInterval(() => fetchRemote().then((r) => r && row === ROW && takeRemote(r.data, r.version)).catch(() => {}), 4000);
}

function startRemote() {
  if (ready || typeof window === "undefined" || !STORE) return;
  sb = getSupabase();
  if (!sb) return;
  const row = ROW;
  ready = (async () => {
    const pub = await fetchPublic();
    if (row !== ROW) return; // entretanto mudou de loja
    if (!pub) {
      status = "missing"; // não existe, ou está suspensa
      notify();
      return;
    }
    status = "ready";
    takePublic(pub.data, pub.version);
    notify();
    // o cardápio acompanha as alterações da equipe (o cliente não tem Realtime no estado privado)
    pubPoll = setInterval(
      () =>
        fetchPublic()
          .then((r) => {
            if (row !== ROW) return;
            if (!r) {
              status = "missing";
              notify();
            } else takePublic(r.data, r.version);
          })
          .catch(() => {}),
      8000,
    );
    authSub = sb!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void attachStaff(row);
    }).data.subscription;
    await attachStaff(row);
  })();
  ready.catch((e) => {
    console.error("Supabase:", e);
    status = "error";
    notify();
  });
}

async function push(fn: (db: DB) => void, ids: string[]) {
  await ready;
  if (!remoteData) throw new Error("Loja indisponível");
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

/** Modo local: a loja "demo" tem dados de exemplo; qualquer outro slug começa vazio. */
const localSeed = (): DB =>
  STORE === "demo"
    ? makeSeed()
    : makeStoreSeed({ name: STORE, currency: "BRL", tableNames: ["Mesa 1", "Mesa 2", "Mesa 3"], tokens: ["local-1", "local-2", "local-3"].map((t) => `${STORE}-${t}`) });

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
  if (!cache) cache = localSeed();
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
    if (status !== "ready" || mode !== "staff") return; // loja indisponível ou sem acesso de equipe: não escreve
    const ids: string[] = [];
    const next = structuredClone(read());
    withIds(ids, null, () => fn(next));
    cache = next; // otimista: o tela responde já
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

/** Só no modo local (demo). Com Supabase nunca apaga dados de uma loja. */
export function resetDemo() {
  if (REMOTE) return;
  write(localSeed());
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

/* ---------- Sessão do dispositivo (por aba, simula um celular) ---------- */

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

/* ---------- Cozinha ---------- */

/** Mesma regra da função cozinha_marcar no Supabase (usada no modo local). */
export const setKitchenStatus = (orderId: string, estado: KitchenStatus) =>
  mutate((db) => {
    if (db.establishment.kitchen?.enabled !== true) return;
    const o = db.orders.find((x) => x.id === orderId);
    if (!o || o.status === "entregue") return;
    const agora = Date.now();
    o.kitchen = estado;
    if (estado === "novo") {
      delete o.prepStartedAt;
      delete o.readyAt;
    } else if (estado === "preparo") {
      o.prepStartedAt ??= agora;
      delete o.readyAt;
    } else {
      o.prepStartedAt ??= agora;
      o.readyAt = agora;
    }
  });

/** Só o dono: liga ou desliga a tela da cozinha e define o limite de espera. */
export const setKitchenConfig = (cfg: KitchenConfig) =>
  mutate((db) => {
    // Primeira vez que liga: as categorias "Bebidas" ficam fora da cozinha (o dono muda em Categorias).
    if (cfg.enabled && !db.establishment.kitchen) {
      for (const c of db.categories) if (c.skipKitchen === undefined && /bebida/i.test(c.name)) c.skipKitchen = true;
    }
    db.establishment.kitchen = { enabled: cfg.enabled, alertMin: Math.min(120, Math.max(1, Math.round(cfg.alertMin))) };
  });

/** Só o dono: os produtos desta categoria passam (ou não) pela tela da cozinha. */
export const setCategoryKitchen = (categoryId: string, vaiParaCozinha: boolean) =>
  mutate((db) => {
    const c = db.categories.find((x) => x.id === categoryId);
    if (c) c.skipKitchen = !vaiParaCozinha;
  });

/* ---------- Papel (login simulado) ---------- */

export type Role = "garcom" | "dono" | "cozinha";
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
