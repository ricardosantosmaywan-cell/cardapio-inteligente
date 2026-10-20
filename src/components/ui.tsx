"use client";
import { ReactNode, useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Product } from "@/lib/types";
import { useMounted } from "@/lib/store";

/** Só renderiza no cliente, para evitar hydration mismatch com horas e dados do localStorage. */
export function ClientOnly({ children }: { children: ReactNode }) {
  return useMounted() ? <>{children}</> : null;
}

export function Thumb({ emoji, photo, large }: { emoji: string; photo?: string; large?: boolean }) {
  return (
    <div className={`thumb${large ? " lg" : ""}`} aria-hidden="true">
      {photo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo} alt="" /> : emoji}
    </div>
  );
}

export const ProductThumb = ({ p }: { p: Product }) => <Thumb emoji={p.emoji} photo={p.photo} />;

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
          <button className="btn sm ghost" onClick={onClose} aria-label="Fechar">✕</button>
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

export const mesaUrl = (token: string) =>
  typeof window === "undefined" ? `/mesa/${token}` : `${window.location.origin}/mesa/${token}`;
