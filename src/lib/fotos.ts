"use client";
/**
 * Fotos dos produtos e das ofertas.
 *  - Com Supabase: a foto é reduzida (lado maior 1000 px, WebP) e enviada para o Storage (bucket público
 *    `fotos`, pasta da loja). No estado da loja fica só o endereço, não a imagem (ver supabase/fotos-storage.sql).
 *  - Sem Supabase (demo local): continua a guardar a imagem dentro do estado (data URL, localStorage).
 * `photo` aceita as duas formas, por isso fotos antigas continuam a aparecer até serem migradas.
 */
import { useRef } from "react";
import { getSupabase, REMOTE } from "./supabase";
import { compressImage } from "./utils";
import type { DB } from "./types";

const BUCKET = "fotos";
const MAX_SIDE = 1000;
const MARK = `/storage/v1/object/public/${BUCKET}/`;

/** A foto já está no Storage? */
export const isStorageUrl = (u?: string): u is string => !!u && u.includes(MARK);
/** Foto que ainda precisa de migrar: imagem dentro do estado (data URL) ou ficheiro local da app (ex.: /demo/…). */
export const needsMigration = (u?: string): u is string => !!u && (u.startsWith("data:") || (u.startsWith("/") && !u.startsWith("//")));

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Imagem inválida. Use JPG, PNG ou WebP."));
    };
    img.src = url;
  });
}

const canvasBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));

/** Reduz e comprime: WebP (mantém transparência); se o navegador não gerar WebP, JPEG com fundo branco. */
export async function shrink(source: Blob, max = MAX_SIDE): Promise<Blob> {
  const img = await loadImage(source);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const webp = await canvasBlob(c, "image/webp", 0.82);
  if (webp && webp.type === "image/webp") return webp;
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  const jpg = await canvasBlob(c, "image/jpeg", 0.82);
  if (!jpg) throw new Error("Não foi possível preparar a imagem.");
  return jpg;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");

/** Guarda a foto de uma loja e devolve o valor para `photo` (endereço do Storage, ou data URL no modo local). */
export async function savePhoto(file: Blob, slug: string): Promise<string> {
  if (!REMOTE) return compressImage(file as File);
  const sb = getSupabase()!;
  const blob = await shrink(file);
  const path = `${slug}/${crypto.randomUUID()}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) {
    throw new Error(/row-level security|not found|bucket/i.test(error.message) ? "Sem permissão para enviar fotos, ou falta aplicar supabase/fotos-storage.sql." : msg(error));
  }
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Apaga uma foto do Storage (se for de lá). Falhas são ignoradas: no pior caso fica um ficheiro órfão. */
export async function removePhoto(url?: string): Promise<void> {
  if (!REMOTE || !isStorageUrl(url)) return;
  const path = decodeURIComponent(url.split(MARK)[1].split("?")[0]);
  try {
    await getSupabase()!.storage.from(BUCKET).remove([path]);
  } catch {
    /* ignora */
  }
}

/**
 * Para os formulários de produto e de oferta: envia a foto nova e limpa as que ficam sem uso
 * (a substituída, a removida, ou as enviadas e depois canceladas).
 */
export function usePhotoUploads(slug: string) {
  const fresh = useRef<string[]>([]);
  const drop = (url?: string) => {
    if (url && fresh.current.includes(url)) {
      fresh.current = fresh.current.filter((x) => x !== url);
      void removePhoto(url);
    }
  };
  return {
    /** Envia `file`; se a foto atual foi enviada neste formulário, apaga-a (foi substituída). */
    upload: async (file: File, current?: string) => {
      const url = await savePhoto(file, slug);
      drop(current);
      fresh.current.push(url);
      return url;
    },
    /** "Remover foto": apaga já se foi enviada neste formulário; a foto guardada antes só sai ao salvar. */
    discard: (current?: string) => drop(current),
    /** Ao salvar: apaga as fotos enviadas e não usadas, e a foto original se foi trocada ou removida. */
    finish: (kept?: string, original?: string) => {
      for (const f of fresh.current) if (f !== kept) void removePhoto(f);
      fresh.current = [];
      if (original && original !== kept) void removePhoto(original);
    },
    /** Ao cancelar: apaga tudo o que foi enviado neste formulário. */
    cancel: () => {
      for (const f of fresh.current) void removePhoto(f);
      fresh.current = [];
    },
    errorText: msg,
  };
}

/* ---------------------------------------------------------------- migração das fotos antigas */

/** Quantas fotos (produtos e ofertas) ainda precisam de migrar para o Storage. */
export const countToMigrate = (db: DB) =>
  db.products.filter((p) => needsMigration(p.photo)).length + db.offers.filter((o) => needsMigration(o.photo)).length;

export type MigrationResult = { moved: number; bytesBefore: number; bytesAfter: number };

/**
 * Envia para o Storage todas as fotos antigas e só depois troca os valores no estado, de uma só vez.
 * Se alguma falhar, apaga o que já tinha enviado e não altera nada: nenhuma foto se perde.
 * `apply` recebe o mapa (valor antigo → endereço novo) e grava-o no estado da loja.
 */
export async function migratePhotos(
  db: DB,
  slug: string,
  apply: (map: Map<string, string>) => void,
  onProgress?: (done: number, total: number) => void,
): Promise<MigrationResult> {
  const olds = [...new Set([...db.products.map((p) => p.photo), ...db.offers.map((o) => o.photo)].filter(needsMigration))];
  const map = new Map<string, string>();
  try {
    for (const old of olds) {
      const r = await fetch(old);
      if (!r.ok) throw new Error(`Não foi possível ler uma das fotos (${old.startsWith("data:") ? "dentro da loja" : old}).`);
      map.set(old, await savePhoto(await r.blob(), slug));
      onProgress?.(map.size, olds.length);
    }
  } catch (e) {
    for (const url of map.values()) await removePhoto(url);
    throw e;
  }
  const bytesBefore = JSON.stringify(db).length;
  apply(map);
  const after = structuredClone(db);
  for (const p of after.products) if (p.photo && map.has(p.photo)) p.photo = map.get(p.photo);
  for (const o of after.offers) if (o.photo && map.has(o.photo)) o.photo = map.get(o.photo);
  return { moved: olds.length, bytesBefore, bytesAfter: JSON.stringify(after).length };
}

/** Troca no estado os valores antigos pelos novos (usado por `migratePhotos`). */
export function applyPhotoMap(d: DB, map: Map<string, string>) {
  for (const p of d.products) if (p.photo && map.has(p.photo)) p.photo = map.get(p.photo);
  for (const o of d.offers) if (o.photo && map.has(o.photo)) o.photo = map.get(o.photo);
}
