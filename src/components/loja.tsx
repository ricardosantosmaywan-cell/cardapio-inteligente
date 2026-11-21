"use client";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { configureStore, useDB, useMounted, useStoreStatus } from "@/lib/store";
import { setCurrency } from "@/lib/utils";
import { getSupabase, REMOTE } from "@/lib/supabase";
import { isSuspendedLocal, limiteLocal } from "@/lib/local-lojas";
import { ErrorState } from "@/components/ui";

const Ctx = createContext<{ slug: string; base: string; limiteMesas: number | null }>({ slug: "", base: "", limiteMesas: null });

/** Slug da loja atual e prefixo das rotas (`/l/<slug>`). */
export const useLoja = () => useContext(Ctx);

/**
 * Escolhe a loja pelo endereço, espera que o estado carregue e aplica a moeda da loja.
 * Tudo dentro de /l/[slug] passa por aqui.
 */
export function LojaProvider({ slug, children }: { slug: string; children: ReactNode }) {
  configureStore(slug);
  const mounted = useMounted();
  const status = useStoreStatus();
  const db = useDB();
  setCurrency(db.establishment.currency);
  // limite de mesas contratadas (só o administrador o altera)
  const [limiteMesas, setLimiteMesas] = useState<number | null>(null);
  useEffect(() => {
    if (!REMOTE) {
      setLimiteMesas(limiteLocal(slug));
      return;
    }
    getSupabase()
      ?.from("lojas")
      .select("limite_mesas")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => setLimiteMesas(data?.limite_mesas ?? null));
  }, [slug]);

  if (!mounted) return null;
  if (!REMOTE && isSuspendedLocal(slug)) {
    return (
      <div className="screen-center">
        <div className="big-emoji">🔒</div>
        <h1 className="center">Loja indisponível</h1>
        <p className="muted center">Este endereço não existe ou a loja está temporariamente suspensa.</p>
      </div>
    );
  }
  if (status === "loading") {
    return (
      <div className="screen-center">
        <div className="big-emoji">🍽️</div>
        <p className="muted center">Carregando…</p>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="screen-center">
        <ErrorState onRetry={() => location.reload()} />
      </div>
    );
  }
  if (status === "missing") {
    return (
      <div className="screen-center">
        <div className="big-emoji">🔒</div>
        <h1 className="center">Loja indisponível</h1>
        <p className="muted center">Este endereço não existe ou a loja está temporariamente suspensa.</p>
      </div>
    );
  }
  return <Ctx.Provider value={{ slug, base: `/l/${slug}`, limiteMesas }}>{children}</Ctx.Provider>;
}
