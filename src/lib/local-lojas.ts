"use client";
/**
 * Administração em MODO LOCAL (sem Supabase): as lojas ficam registadas no localStorage
 * deste navegador. Serve para ver e experimentar a tela /admin; não é partilhado entre aparelhos.
 */
import { makeStoreSeed } from "./seed";

export type LojaLocal = { slug: string; nome: string; moeda: "BRL" | "EUR"; ativo: boolean; criado_em: string; limite_mesas: number };

const REG = "cardapio-lojas-local";
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function read(): LojaLocal[] {
  try {
    return JSON.parse(localStorage.getItem(REG) || "[]");
  } catch {
    return [];
  }
}
const write = (l: LojaLocal[]) => localStorage.setItem(REG, JSON.stringify(l));

/** A loja "demo" aparece sempre primeiro (dados de exemplo). */
export const listLocal = (): LojaLocal[] => [
  { slug: "demo", nome: "Boteco do Largo (demo)", moeda: "BRL", ativo: true, criado_em: "", limite_mesas: 8 },
  ...read().map((l) => ({ ...l, limite_mesas: l.limite_mesas ?? 5 })),
];

/** Limite de mesas da loja (modo local). */
export const limiteLocal = (slug: string): number => listLocal().find((l) => l.slug === slug)?.limite_mesas ?? 5;

/** Mesas em uso (modo local): lê o estado guardado da loja. */
export function usadasLocal(slug: string): number {
  try {
    const db = JSON.parse(localStorage.getItem(`cardapio-db-${slug}`) || "null");
    return Array.isArray(db?.tables) ? db.tables.length : slug === "demo" ? 5 : 0;
  } catch {
    return 0;
  }
}

export const setLimiteLocal = (slug: string, n: number) =>
  write(read().map((l) => (l.slug === slug ? { ...l, limite_mesas: n } : l)));

export const isSuspendedLocal = (slug: string) => read().some((l) => l.slug === slug && !l.ativo);

export function createLocal(i: { nome: string; slug: string; moeda: "BRL" | "EUR"; mesas: number }) {
  const nome = i.nome.trim();
  if (nome.length < 2 || nome.length > 80) throw new Error("Informe o nome da loja (2 a 80 letras).");
  if (!SLUG_RE.test(i.slug) || i.slug.length < 3 || i.slug.length > 40) throw new Error("Endereço inválido: use 3 a 40 letras minúsculas, números e hífen.");
  if (!Number.isFinite(i.mesas) || i.mesas < 1 || i.mesas > 60) throw new Error("Número de mesas entre 1 e 60.");
  if (i.slug === "demo" || read().some((l) => l.slug === i.slug)) throw new Error("Já existe uma loja com esse endereço.");

  const tokens = Array.from({ length: i.mesas }, () =>
    Array.from(crypto.getRandomValues(new Uint8Array(18))).map((b) => b.toString(16).padStart(2, "0")).join(""),
  );
  const seed = makeStoreSeed({
    name: nome,
    currency: i.moeda,
    tableNames: Array.from({ length: i.mesas }, (_, n) => `Mesa ${n + 1}`),
    tokens,
  });
  localStorage.setItem(`cardapio-db-${i.slug}`, JSON.stringify(seed));
  write([{ slug: i.slug, nome, moeda: i.moeda, ativo: true, criado_em: new Date().toISOString(), limite_mesas: i.mesas }, ...read()]);
}

export const setAtivoLocal = (slug: string, ativo: boolean) =>
  write(read().map((l) => (l.slug === slug ? { ...l, ativo } : l)));
