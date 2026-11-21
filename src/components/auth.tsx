"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { getRole, Role, setRole, useDB } from "@/lib/store";
import { getSupabase, REMOTE } from "@/lib/supabase";
import { useLoja } from "@/components/loja";
import { ChefHat, ChevronLeft, LayoutGrid, LogOut, PackageX, type LucideIcon } from "lucide-react";
import { initials } from "@/lib/utils";

const NAV_ICON: Record<string, LucideIcon> = { mesas: LayoutGrid, faltas: PackageX, garcom: ChefHat };

const ROLE_LABEL: Record<Role | "admin", string> = { garcom: "Garçom", dono: "Dono", admin: "Administrador" };

/** Topo das telas de login: "Voltar", logotipo e nome da loja. */
function LoginTop({ base }: { base: string }) {
  const db = useDB();
  return (
    <>
      <Link href={base} className="btn sm ghost" style={{ alignSelf: "flex-start", color: "var(--brand-strong)" }}>
        <ChevronLeft className="icon" size={18} aria-hidden="true" />Voltar
      </Link>
      <div className="row" style={{ justifyContent: "center", gap: 12 }}>
        <span className="logo" role="img" aria-label="Logotipo da loja">{initials(db.establishment.name)}</span>
        <span className="brandname">{db.establishment.name}</span>
      </div>
    </>
  );
}

/* ---------- Login real (Supabase Auth) ---------- */

type Auth =
  | { state: "loading" }
  | { state: "out" }
  | { state: "in"; email: string; role: Role | "admin" | null };

/** Papel do utilizador nesta loja: super admin, dono, garçom, ou nenhum. */
function useAuth(slug: string): Auth & { signOut: () => void } {
  const [auth, setAuth] = useState<Auth>({ state: "loading" });

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return setAuth({ state: "out" });
    const [sa, mem] = await Promise.all([
      sb.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
      sb.from("membros").select("papel").eq("user_id", user.id).eq("loja", slug).maybeSingle(),
    ]);
    const role: Role | "admin" | null = sa.data ? "admin" : ((mem.data?.papel as Role | undefined) ?? null);
    setAuth({ state: "in", email: user.email ?? "", role });
  }, [slug]);

  useEffect(() => {
    refresh();
    const sb = getSupabase();
    const sub = sb?.auth.onAuthStateChange(() => void refresh());
    return () => sub?.data.subscription.unsubscribe();
  }, [refresh]);

  return { ...auth, signOut: () => void getSupabase()?.auth.signOut({ scope: "local" }) };
}

function RealLogin({ area, base }: { area: Role; base: string }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await getSupabase()!.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setErr("E-mail ou senha incorretos.");
    setBusy(false);
  };

  return (
    <div className="screen-center">
      <LoginTop base={base} />
      <h1 className="center">Entrar como {ROLE_LABEL[area].toLowerCase()}</h1>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="em">E-mail<span className="req"> *</span></label>
          <input id="em" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pw">Senha<span className="req"> *</span></label>
          <input id="pw" className="input" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        {err && <div className="alert bad" role="alert">{err}</div>}
        <button className="btn primary block" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}

/* ---------- Login simulado (só no modo local, sem Supabase) ---------- */

function SimulatedLogin({ area, base, onEnter }: { area: Role; base: string; onEnter: () => void }) {
  return (
    <div className="screen-center">
      <LoginTop base={base} />
      <h1 className="center">Entrar como {ROLE_LABEL[area].toLowerCase()}</h1>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setRole(area);
          onEnter();
        }}
      >
        <div className="field">
          <label htmlFor="em">E-mail<span className="req"> *</span></label>
          <input id="em" className="input" defaultValue={`${area}@demo.local`} type="email" />
        </div>
        <div className="field">
          <label htmlFor="pw">Senha<span className="req"> *</span></label>
          <input id="pw" className="input" defaultValue="demo1234" type="password" />
        </div>
        <button className="btn primary block" type="submit">Entrar</button>
        <p className="muted small center">Modo local de demonstração: qualquer valor entra.</p>
      </form>
    </div>
  );
}

/* ---------- Portão por papel ---------- */

export function RoleGate({
  allow, area, nav, children, tablet,
}: {
  allow: Role[];
  area: Role;
  nav: { href: string; label: string; icon?: string }[];
  children: ReactNode;
  /** Garçom: alvos de toque de 56 px e cabeçalho mais alto. */
  tablet?: boolean;
}) {
  const { base, slug } = useLoja();
  const db = useDB();
  const path = usePathname();
  const real = useAuth(slug);
  const [localRole, setLocalRole] = useState<Role | null | undefined>(undefined);
  useEffect(() => setLocalRole(getRole()), []);

  let role: Role | "admin" | null;
  let email = "";
  if (REMOTE) {
    if (real.state === "loading") return null;
    if (real.state === "out") return <RealLogin area={area} base={base} />;
    role = real.role;
    email = real.email;
  } else {
    if (localRole === undefined) return null;
    role = localRole;
  }

  const logout = () => {
    if (REMOTE) real.signOut();
    else {
      setRole(null);
      setLocalRole(null);
    }
  };

  if (!role || (role !== "admin" && !allow.includes(role))) {
    if (!REMOTE && !role) return <SimulatedLogin area={area} base={base} onEnter={() => setLocalRole(getRole())} />;
    return (
      <div className="screen-center">
        <div className="big-emoji">🔒</div>
        <h1 className="center">Sem acesso</h1>
        <p className="muted center">
          {email ? `${email} não tem permissão para esta área.` : "Esta conta não tem permissão para esta área."}
        </p>
        <button className="btn block" onClick={logout}>Sair e entrar com outra conta</button>
        <Link href={base} className="btn ghost block">← Voltar</Link>
      </div>
    );
  }

  const prefixed = nav.map((n) => ({ ...n, href: `${base}${n.href}` }));
  const isOn = (href: string) => path === href || (href === `${base}/garcom` && path.startsWith(`${base}/garcom/mesa`));

  return (
    <div className={tablet ? "tablet" : undefined}>
      <div className="topbar no-print">
        <div className="topbar-inner">
          <Link href={base} className="brandmark">
            <span className="logo" role="img" aria-label="Logotipo da loja">{initials(db.establishment.name)}</span>
            <span className="brandname">{db.establishment.name}</span>
          </Link>
          <nav>
            {prefixed.map((n) => (
              <Link key={n.href} href={n.href} className={`navlink${isOn(n.href) ? " on" : ""}`}>
                {n.icon && NAV_ICON[n.icon] && (() => { const I = NAV_ICON[n.icon!]; return <I className="icon" size={20} aria-hidden="true" />; })()}
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="badge">{ROLE_LABEL[role]}</span>
          <button className="btn sm" onClick={logout}><LogOut className="icon" size={17} aria-hidden="true" />Sair</button>
        </div>
      </div>
      {children}
    </div>
  );
}
