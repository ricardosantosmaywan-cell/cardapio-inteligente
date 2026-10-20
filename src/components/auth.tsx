"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { getRole, Role, setRole } from "@/lib/store";

const CREDS: Record<Role, { email: string; label: string }> = {
  garcom: { email: "garcom@tascadolargo.pt", label: "Garçom" },
  dono: { email: "dono@tascadolargo.pt", label: "Dono" },
};

const isOn = (path: string, href: string) =>
  path === href || (href === "/garcom" && path.startsWith("/garcom/mesa"));

/** Login simulado: sem backend, só escolhe o papel e guarda no navegador. */
export function RoleGate({
  allow, area, nav, children,
}: {
  allow: Role[];
  area: Role;
  nav: { href: string; label: string }[];
  children: ReactNode;
}) {
  const [role, setR] = useState<Role | null | undefined>(undefined);
  const path = usePathname();
  useEffect(() => setR(getRole()), []);
  if (role === undefined) return null;

  if (!role || !allow.includes(role)) {
    const c = CREDS[area];
    return (
      <div className="screen-center">
        <div className="big-emoji">{area === "dono" ? "🛠️" : "🧑‍🍳"}</div>
        <h1 className="center">Entrar como {c.label.toLowerCase()}</h1>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setRole(area);
            setR(area);
          }}
        >
          <div className="field">
            <label htmlFor="em">Email</label>
            <input id="em" className="input" defaultValue={c.email} type="email" />
          </div>
          <div className="field">
            <label htmlFor="pw">Palavra‑passe</label>
            <input id="pw" className="input" defaultValue="demo1234" type="password" />
          </div>
          <button className="btn primary block" type="submit">Entrar</button>
          <p className="muted small center">Login de demonstração: qualquer valor entra.</p>
        </form>
        <Link href="/" className="btn ghost block">← Voltar à demo</Link>
      </div>
    );
  }

  return (
    <>
      <div className="topbar no-print">
        <div className="topbar-inner">
          <Link href="/" className="bold">🍽️ Tasca do Largo</Link>
          <nav>
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={`navlink${isOn(path, n.href) ? " on" : ""}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="badge">{CREDS[role].label}</span>
          <button className="btn sm ghost" onClick={() => { setRole(null); setR(null); }}>Sair</button>
        </div>
      </div>
      {children}
    </>
  );
}
