"use client";
/**
 * Tela da cozinha. Com Supabase, a cozinha NÃO lê o estado da loja (app_state tem celulares, nomes e preços):
 * vê os pedidos por cozinha_pedidos e muda o estado por cozinha_marcar (ver supabase/cozinha.sql).
 * Sem Supabase (demo local), lê o mesmo recorte do localStorage e mostra só os mesmos campos.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, REMOTE } from "./supabase";
import { setKitchenStatus, useDB } from "./store";
import type { DB, KitchenStatus } from "./types";
import { itemToKitchen, KITCHEN_ALERT_DEFAULT, kitchenCfg, kitchenStatus, orderHasKitchen } from "./utils";

/** Só o que a cozinha precisa para preparar: sem preços, nomes nem celulares. */
export type KitchenOrder = {
  id: string;
  mesa: string;
  createdAt: number;
  kitchen: KitchenStatus;
  prepStartedAt?: number;
  readyAt?: number;
  note: string;
  items: { id: string; name: string; qty: number; cancelled: boolean }[];
};

export type KitchenView = {
  ready: boolean;
  erro: string | null;
  enabled: boolean;
  alertMin: number;
  orders: KitchenOrder[];
  /** Devolve null se correu bem, ou a mensagem de erro. */
  mark: (orderId: string, estado: KitchenStatus) => Promise<string | null>;
  refresh: () => void;
};

/**
 * Mesmo recorte da função cozinha_pedidos: mesas abertas, pedidos não entregues com algum item ativo
 * que passa pela cozinha. Itens de categorias fora da cozinha (ex.: bebidas) não aparecem.
 */
export function kitchenOrders(db: DB): KitchenOrder[] {
  const out: KitchenOrder[] = [];
  for (const o of db.orders) {
    const s = db.sessions.find((x) => x.id === o.sessionId);
    if (!s || s.closedAt || o.status === "entregue") continue;
    if (!orderHasKitchen(db, o)) continue;
    const t = db.tables.find((x) => x.id === s.tableId);
    out.push({
      id: o.id,
      mesa: t?.name ?? "Mesa",
      createdAt: o.createdAt,
      kitchen: kitchenStatus(o),
      prepStartedAt: o.prepStartedAt,
      readyAt: o.readyAt,
      note: o.note,
      items: o.items.filter((i) => itemToKitchen(db, i)).map((i) => ({ id: i.id, name: i.name, qty: i.qty, cancelled: i.cancelled })),
    });
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

/* ---------------------------------------------------------------- Supabase */

type Resposta = {
  ok: boolean;
  erro?: string;
  ativa?: boolean;
  alertaMin?: number;
  pedidos?: (Omit<KitchenOrder, "prepStartedAt" | "readyAt"> & { prepStartedAt?: number | null; readyAt?: number | null })[];
};

const ERROS: Record<string, string> = {
  sem_acesso: "Esta conta não tem acesso à cozinha desta loja.",
  loja_indisponivel: "A loja não existe ou está suspensa.",
  cozinha_desligada: "A tela da cozinha foi desligada pelo dono.",
  pedido_entregue: "Este pedido já foi entregue à mesa.",
  pedido_nao_encontrado: "Este pedido já não existe.",
};

/** Mensagem legível; se a função não existir, falta aplicar o SQL da cozinha. */
const msgErro = (e: string) =>
  ERROS[e] ?? (/cozinha_pedidos|cozinha_marcar|function|schema cache/i.test(e) ? "Falta aplicar supabase/cozinha.sql no Supabase." : e);

function useCozinhaRemote(slug: string): KitchenView {
  const [r, setR] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const vivo = useRef(true);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.rpc("cozinha_pedidos", { p_slug: slug });
    if (!vivo.current) return;
    if (error) return setErro(msgErro(error.message));
    const res = data as Resposta;
    if (!res.ok) return setErro(msgErro(res.erro ?? "erro"));
    setErro(null);
    setR(res);
  }, [slug]);

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

  const mark = useCallback(
    async (orderId: string, estado: KitchenStatus) => {
      const sb = getSupabase();
      if (!sb) return "Sem ligação ao servidor.";
      // otimista: o cartão muda logo de coluna
      setR((x) => (x ? { ...x, pedidos: x.pedidos?.map((o) => (o.id === orderId ? { ...o, kitchen: estado } : o)) } : x));
      const { data, error } = await sb.rpc("cozinha_marcar", { p_slug: slug, p_pedido: orderId, p_estado: estado });
      const res = data as { ok: boolean; erro?: string } | null;
      await refresh();
      return error || !res?.ok ? msgErro(error?.message ?? res?.erro ?? "erro") : null;
    },
    [slug, refresh],
  );

  return {
    ready: r !== null || erro !== null,
    erro,
    enabled: r?.ativa === true,
    alertMin: r?.alertaMin ?? KITCHEN_ALERT_DEFAULT,
    orders: (r?.pedidos ?? []).map((o) => ({ ...o, prepStartedAt: o.prepStartedAt ?? undefined, readyAt: o.readyAt ?? undefined })),
    mark,
    refresh: () => void refresh(),
  };
}

/* ---------------------------------------------------------------- modo local (demo) */

function useCozinhaLocal(): KitchenView {
  const db = useDB();
  const cfg = kitchenCfg(db);
  return {
    ready: true,
    erro: null,
    enabled: cfg.enabled,
    alertMin: cfg.alertMin,
    orders: kitchenOrders(db),
    mark: async (orderId, estado) => {
      setKitchenStatus(orderId, estado);
      return null;
    },
    refresh: () => {},
  };
}

/** Mesmo formato com ou sem Supabase (REMOTE é constante, por isso a ordem dos hooks não muda). */
export function useCozinha(slug: string): KitchenView {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return REMOTE ? useCozinhaRemote(slug) : useCozinhaLocal();
}
