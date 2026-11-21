"use client";
/**
 * O cliente à mesa. Com Supabase, NÃO lê nem escreve o estado da loja: tudo passa por funções no
 * servidor (entrar_mesa, estado_mesa, enviar_pedido, chamar_garcom, pedir_conta, decidir_convidado),
 * que validam o QR e a chave secreta deste convidado e calculam os preços. Sem Supabase (demo local),
 * usa o comportamento antigo sobre o localStorage.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, REMOTE } from "./supabase";
import {
  callWaiter as localCallWaiter, decideGuest as localDecide, getGuestId, joinTable, requestBill as localRequestBill,
  sendOrder as localSend, useDB, type CartLine,
} from "./store";
import type { Order } from "./types";

export type MesaInfo = { id: string; name: string; billRequestedAt?: number; calledAt?: number };
export type MesaGuest = { id: string; name: string; status: "pendente" | "aprovado" | "recusado" };
export type Resultado = { ok: boolean; erro?: string };

export type MesaView = {
  /** já sabemos se o QR é válido (evita mostrar "QR não reconhecido" enquanto carrega) */
  ready: boolean;
  /** null = QR não reconhecido */
  table: MesaInfo | null;
  guest: MesaGuest | null;
  session: { id: string; closedAt?: number } | null;
  /** pedidos da mesa (só para convidados aprovados) */
  orders: Order[];
  /** quem quer entrar na mesa (só para convidados aprovados) */
  pending: { id: string; name: string }[];
  join: (name: string, phone: string) => Promise<Resultado>;
  send: (lines: CartLine[], note: string) => Promise<Resultado>;
  callWaiter: () => Promise<void>;
  requestBill: () => Promise<void>;
  decide: (guestId: string, aprovar: boolean) => Promise<void>;
  reset: () => void;
};

/* ---------------------------------------------------------------- Supabase */

type Estado = {
  ok: boolean;
  erro?: string;
  invalido?: boolean;
  mesa?: { id: string; name: string; billRequestedAt?: number | null; calledAt?: number | null };
  convidado?: MesaGuest | null;
  sessao?: { id: string; closedAt?: number | null } | null;
  pedidos?: (Omit<Order, "items"> & { items: (Omit<Order["items"][number], "delivered"> & { delivered?: boolean | null })[] })[];
  pendentes?: { id: string; name: string }[];
};
type Cred = { id: string; secret: string };

function useMesaRemote(slug: string, token: string): MesaView {
  const key = `cardapio-guest-${token}`;
  const [estado, setEstado] = useState<Estado | null>(null);
  const vivo = useRef(true);

  const lerCred = useCallback((): Cred | null => {
    try {
      const j = JSON.parse(sessionStorage.getItem(key) || "null");
      return j?.id && j?.secret ? (j as Cred) : null;
    } catch {
      return null;
    }
  }, [key]);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const c = lerCred();
    const { data, error } = await sb.rpc("estado_mesa", { p_slug: slug, p_token: token, p_guest_id: c?.id ?? null, p_secret: c?.secret ?? null });
    if (error || !vivo.current) return;
    const e = data as Estado;
    if (e.invalido) {
      try {
        sessionStorage.removeItem(key); // credenciais que o servidor já não reconhece
      } catch {
        /* ignora */
      }
    }
    setEstado(e);
  }, [slug, token, key, lerCred]);

  // atualiza de 3 em 3 segundos (e logo ao voltar ao separador)
  useEffect(() => {
    vivo.current = true;
    void refresh();
    const t = setInterval(() => document.visibilityState === "visible" && void refresh(), 3000);
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      vivo.current = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  /** chama uma função de ação com as credenciais deste convidado e atualiza o ecrã */
  const agir = useCallback(
    async (fn: string, extra: Record<string, unknown> = {}): Promise<Resultado> => {
      const sb = getSupabase();
      const c = lerCred();
      if (!sb || !c) return { ok: false, erro: "convidado_invalido" };
      const { data, error } = await sb.rpc(fn, { p_slug: slug, p_token: token, p_guest_id: c.id, p_secret: c.secret, ...extra });
      await refresh();
      if (error) return { ok: false, erro: error.message };
      return data as Resultado;
    },
    [slug, token, lerCred, refresh],
  );

  const e = estado;
  const ok = !!e && e.ok;
  return {
    ready: estado !== null,
    table: ok && e!.mesa ? { id: e!.mesa.id, name: e!.mesa.name, billRequestedAt: e!.mesa.billRequestedAt ?? undefined, calledAt: e!.mesa.calledAt ?? undefined } : null,
    guest: ok ? (e!.convidado ?? null) : null,
    session: ok && e!.sessao ? { id: e!.sessao.id, closedAt: e!.sessao.closedAt ?? undefined } : null,
    orders: ok ? (e!.pedidos ?? []).map((o) => ({ ...o, items: o.items.map((i) => ({ ...i, delivered: i.delivered ?? undefined })) })) : [],
    pending: ok ? (e!.pendentes ?? []) : [],
    join: async (name, phone) => {
      const sb = getSupabase();
      if (!sb) return { ok: false, erro: "sem_ligacao" };
      const { data, error } = await sb.rpc("entrar_mesa", { p_slug: slug, p_token: token, p_nome: name, p_telefone: phone || null });
      if (error) return { ok: false, erro: error.message };
      const r = data as { ok: boolean; erro?: string; guestId?: string; secret?: string };
      if (!r.ok || !r.guestId || !r.secret) return { ok: false, erro: r.erro };
      try {
        sessionStorage.setItem(key, JSON.stringify({ id: r.guestId, secret: r.secret }));
      } catch {
        /* sem armazenamento: a sessão dura só enquanto a página estiver aberta */
      }
      await refresh();
      return { ok: true };
    },
    send: (lines, note) => agir("enviar_pedido", { p_linhas: lines.map((l) => ({ id: l.productId, qty: l.qty })), p_nota: note }),
    callWaiter: async () => void (await agir("chamar_garcom")),
    requestBill: async () => void (await agir("pedir_conta")),
    decide: async (guestId, aprovar) => void (await agir("decidir_convidado", { p_alvo: guestId, p_aprovar: aprovar })),
    reset: () => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignora */
      }
      void refresh();
    },
  };
}

/* ---------------------------------------------------------------- modo local (demo) */

function useMesaLocal(token: string): MesaView {
  const db = useDB();
  const [guestId, setGuestId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setGuestId(getGuestId(token));
    setReady(true);
  }, [token]);

  const guest = guestId ? db.guests.find((g) => g.id === guestId) : undefined;
  const session = guest ? db.sessions.find((s) => s.id === guest.sessionId) : undefined;
  const table = session ? db.tables.find((t) => t.id === session.tableId) : db.tables.find((t) => t.token === token);
  const aprovado = guest?.status === "aprovado" && !!session;

  return {
    ready,
    table: table ? { id: table.id, name: table.name, billRequestedAt: table.billRequestedAt, calledAt: table.calledAt } : null,
    guest: guest ? { id: guest.id, name: guest.name, status: guest.status } : null,
    session: session ? { id: session.id, closedAt: session.closedAt } : null,
    orders: aprovado ? db.orders.filter((o) => o.sessionId === session!.id).sort((a, b) => b.createdAt - a.createdAt) : [],
    pending: aprovado ? db.guests.filter((g) => g.sessionId === session!.id && g.status === "pendente").map((g) => ({ id: g.id, name: g.name })) : [],
    join: async (name, phone) => {
      const id = joinTable(token, name, phone);
      if (!id) return { ok: false, erro: "qr_invalido" };
      setGuestId(id);
      return { ok: true };
    },
    send: async (lines, note) => (session && guest && localSend(session.id, guest.id, guest.name, lines, note) ? { ok: true } : { ok: false, erro: "item_indisponivel" }),
    callWaiter: async () => void (table && localCallWaiter(table.id)),
    requestBill: async () => void (table && localRequestBill(table.id)),
    decide: async (id, aprovar) => void localDecide(id, aprovar),
    reset: () => setGuestId(null),
  };
}

/** O cliente à mesa: mesmo formato com ou sem Supabase (REMOTE é constante, por isso a ordem dos hooks não muda). */
export function useMesa(slug: string, token: string): MesaView {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return REMOTE ? useMesaRemote(slug, token) : useMesaLocal(token);
}
