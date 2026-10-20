"use client";
import { useState } from "react";
import QRCode from "qrcode";
import { mutate, renewQr, useDB } from "@/lib/store";
import { Qr, mesaUrl } from "@/components/ui";
import { openSession, token, uid } from "@/lib/utils";

export default function Mesas() {
  const db = useDB();
  const [name, setName] = useState("");
  const [printOne, setPrintOne] = useState<string | null>(null);

  const print = (id: string | null) => {
    setPrintOne(id);
    setTimeout(() => window.print(), 150);
  };
  const download = async (tName: string, tk: string) => {
    const url = await QRCode.toDataURL(mesaUrl(tk), { margin: 2, width: 800 });
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${tName.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  };

  return (
    <main className="shell">
      <div className="row between wrap no-print">
        <h1>Mesas e QR codes</h1>
        <button className="btn" onClick={() => print(null)}>🖨️ Imprimir todos</button>
      </div>
      <form
        className="row no-print"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          mutate((d) => { d.tables.push({ id: uid("t"), name: name.trim(), token: token() }); });
          setName("");
        }}
      >
        <input className="input" placeholder="Nova mesa (ex.: Mesa 6, Esplanada 1)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome da nova mesa" />
        <button className="btn primary" type="submit">Criar mesa</button>
      </form>

      <div className="grid tables no-print">
        {db.tables.map((t) => {
          const busy = !!openSession(db, t.id);
          return (
            <div key={t.id} className="card stack" style={{ alignItems: "center" }}>
              <input
                className="input" style={{ fontWeight: 700, textAlign: "center" }}
                value={t.name} aria-label={`Nome de ${t.name}`}
                onChange={(e) => mutate((d) => { d.tables.find((x) => x.id === t.id)!.name = e.target.value; })}
              />
              <Qr value={mesaUrl(t.token)} />
              <div className="row wrap" style={{ justifyContent: "center" }}>
                <button className="btn sm" onClick={() => print(t.id)}>Imprimir</button>
                <button className="btn sm" onClick={() => download(t.name, t.token)}>Descarregar</button>
                <button className="btn sm" onClick={() => confirm(`Renovar o QR de ${t.name}? O código antigo deixa de funcionar.`) && renewQr(t.id)}>Renovar</button>
                <button className="btn sm danger" disabled={busy} title={busy ? "Feche a mesa antes de remover" : ""}
                  onClick={() => confirm(`Remover ${t.name}?`) && mutate((d) => { d.tables = d.tables.filter((x) => x.id !== t.id); })}>Remover</button>
              </div>
              {busy && <span className="badge info">Em uso</span>}
            </div>
          );
        })}
      </div>

      <div className="print-grid" style={{ display: "none" }}>
        {db.tables.filter((t) => !printOne || t.id === printOne).map((t) => (
          <div key={t.id} className="print-card">
            <h2 style={{ fontSize: "1.6rem" }}>{db.establishment.name}</h2>
            <p style={{ margin: "6px 0 12px" }}>Leia o QR para ver o cardápio e pedir</p>
            <Qr value={mesaUrl(t.token)} />
            <h2 style={{ fontSize: "2rem", marginTop: 12 }}>{t.name}</h2>
          </div>
        ))}
      </div>
    </main>
  );
}
