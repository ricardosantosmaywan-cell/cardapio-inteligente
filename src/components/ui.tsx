"use client";
import { ReactNode, useEffect, useState } from "react";
import QRCode from "qrcode";
import { PackageOpen, RefreshCw, WifiOff, X } from "lucide-react";
import type { Product } from "@/lib/types";
import { useMounted } from "@/lib/store";

/** Só renderiza no cliente, para evitar hydration mismatch com horas e dados do localStorage. */
export function ClientOnly({ children }: { children: ReactNode }) {
  return useMounted() ? <>{children}</> : null;
}

export function Thumb({ emoji, photo, large, xl }: { emoji: string; photo?: string; large?: boolean; xl?: boolean }) {
  return (
    <div className={`thumb${large ? " lg" : ""}${xl ? " xl" : ""}`} aria-hidden="true">
      {photo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo} alt="" /> : emoji}
    </div>
  );
}

/** Interruptor acessível (role="switch"). */
export function Switch({ checked, onChange, label, stateText }: { checked: boolean; onChange: (v: boolean) => void; label: string; stateText?: string }) {
  return (
    <div className="switch">
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
      <span>{label}</span>
      {stateText && <span className="muted small">{stateText}</span>}
    </div>
  );
}

/** Estado vazio: ícone, título e, se fizer sentido, uma dica. */
export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true"><PackageOpen size={26} /></div>
      <div className="empty-title">{title}</div>
      {hint && <p className="small">{hint}</p>}
      {children}
    </div>
  );
}

/** Estado de erro com botão para tentar de novo. */
export function ErrorState({ title = "Não foi possível carregar", hint = "Verifique a internet e tente de novo.", onRetry }: { title?: string; hint?: string; onRetry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <div className="empty-icon" aria-hidden="true"><WifiOff size={26} /></div>
      <div className="empty-title">{title}</div>
      <p className="small">{hint}</p>
      {onRetry && <button className="btn" onClick={onRetry}><RefreshCw className="icon" size={17} aria-hidden="true" />Tentar de novo</button>}
    </div>
  );
}

export const Skeleton = ({ h = 16, w = "100%" }: { h?: number; w?: number | string }) => (
  <div className="skeleton" style={{ height: h, width: w }} aria-hidden="true" />
);

export const ProductThumb = ({ p, xl }: { p: Product; xl?: boolean }) => <Thumb emoji={p.emoji} photo={p.photo} xl={xl} />;

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between">
          <h2>{title}</h2>
          <button className="btn sm ghost" onClick={onClose} aria-label="Fechar"><X className="icon" size={18} aria-hidden="true" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return { show: setMsg, node };
}

export function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 360, errorCorrectionLevel: "M" }).then(setSrc).catch(() => setSrc(""));
  }, [value]);
  return <div className="qr">{src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="QR code da mesa" /> : <div style={{ width: 168, height: 168 }} />}</div>;
}

export const mesaUrl = (slug: string, token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/l/${slug}/mesa/${token}`;

/** Mesa vista de cima, com uma cadeira por cliente aprovado (até 6). */
export function TableIcon({ name, state, guests }: { name: string; state: "livre" | "ocupada" | "conta" | "chamou"; guests: number }) {
  const bar = /balc/i.test(name);
  const color = { livre: "var(--muted)", ocupada: "var(--info)", conta: "var(--warn)", chamou: "var(--bad)" }[state];
  const n = Math.min(guests, 6);
  const num = name.match(/\d+/)?.[0];
  const label = bar ? "🍸" : num ?? name.slice(0, 2).toUpperCase();
  // posições das cadeiras (viewBox 120x100): 3 em cima, 3 em baixo
  const seats = bar
    ? [[20, 80], [38, 80], [56, 80], [74, 80], [92, 80], [110, 80]]
    : [[36, 11], [84, 11], [60, 11], [36, 89], [84, 89], [60, 89]];
  const order = bar ? [0, 1, 2, 3, 4, 5] : [0, 3, 1, 4, 2, 5];
  const sw = bar ? 14 : 18;
  return (
    <svg viewBox="0 0 120 100" className={`table-icon ${state}`} role="img" aria-label={`${name}, ${guests} cliente(s)`}>
      {order.map((idx, k) => {
        const [cx, cy] = seats[idx];
        const taken = k < n;
        return <rect key={k} x={cx - sw / 2} y={cy - 6} width={sw} height="12" rx="5" fill={taken ? color : "none"} stroke={color} strokeWidth="2" opacity={taken ? 1 : 0.4} />;
      })}
      {bar ? (
        <rect x="8" y="26" width="104" height="36" rx="10" fill="var(--card)" stroke={color} strokeWidth="3" />
      ) : (
        <rect x="22" y="22" width="76" height="56" rx="14" fill="var(--card)" stroke={color} strokeWidth="3" />
      )}
      <text x="60" y={bar ? 52 : 57} textAnchor="middle" fontSize={bar ? 22 : 26} fontWeight="800" fill={color}>{label}</text>
    </svg>
  );
}
