"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { getRole, Role, setRole, useDB } from "@/lib/store";
import { getSupabase, REMOTE } from "@/lib/supabase";
import { useLoja } from "@/components/loja";
import { BotaoSenha, SenhaObrigatoria } from "@/components/senha";
import { ChefHat, ChevronLeft, CookingPot, LayoutGrid, LogOut, Menu as MenuIcon, PackageX, X, type LucideIcon } from "lucide-react";
import { initials, kitchenCfg } from "@/lib/utils";

const NAV_ICON: Record<string, LucideIcon> = { mesas: LayoutGrid, faltas: PackageX, garcom: ChefHat, cozinha: CookingPot };

const ROLE_LABEL: Record<Role | "admin", string> = { garcom: "Garçom", dono: "Dono", cozinha: "Cozinha", admin: "Administrador" };

const LOGIN_TITLE: Record<Role, string> = { garcom: "Entrar como garçom", dono: "Entrar como dono", cozinha: "Entrar na cozinha" };

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
  | { state: "in"; email: string; role: Role | "admin" | null; trocarSenha: boolean };

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
    setAuth({ state: "in", email: user.email ?? "", role, trocarSenha: user.user_metadata?.trocar_senha === true });
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
      <h1 className="center">{LOGIN_TITLE[area]}</h1>
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
      <h1 className="center">{LOGIN_TITLE[area]}</h1>
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

  // Menu do celular: abre e fecha; fecha ao mudar de página ou com Esc
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  let role: Role | "admin" | null;
  let email = "";
  if (REMOTE) {
    if (real.state === "loading") return null;
    if (real.state === "out") return <RealLogin area={area} base={base} />;
    role = real.role;
    email = real.email;
    if (real.trocarSenha && role) return <SenhaObrigatoria email={email} onSair={real.signOut} />;
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

  // Na área do garçom, o dono (e o administrador) ganha um atalho para o painel de gestão; o garçom não o vê
  const chefe = role === "dono" || role === "admin";
  const cozinhaOn = kitchenCfg(db).enabled;
  const navFinal = [
    ...nav,
    ...(area === "garcom" && cozinhaOn ? [{ href: "/cozinha", label: "Cozinha", icon: "cozinha" }] : []),
    ...(area === "garcom" && chefe ? [{ href: "/dono", label: "Painel do dono ↗" }] : []),
    ...(area === "dono" && cozinhaOn ? [{ href: "/cozinha", label: "Cozinha ↗" }] : []),
    ...(area === "cozinha" && role !== "cozinha" ? [{ href: "/garcom", label: "Mesas ↗" }] : []),
  ];
  const prefixed = navFinal.map((n) => ({ ...n, href: `${base}${n.href}` }));
  const isOn = (href: string) => path === href || (href === `${base}/garcom` && path.startsWith(`${base}/garcom/mesa`));

  return (
    <div className={tablet ? "tablet" : undefined}>
      <div className={`topbar no-print${navFinal.length > 3 ? " nav-muitos" : ""}`}>
        <div className="topbar-inner">
          <Link href={base} className="brandmark">
            <span className="logo" role="img" aria-label="Logotipo da loja">{initials(db.establishment.name)}</span>
            <span className="brandname">{db.establishment.name}</span>
          </Link>
          <button type="button" className="btn sm menu-btn" aria-expanded={menu} aria-controls="menu-equipe" onClick={() => setMenu(!menu)}>
            {menu ? <X className="icon" size={18} aria-hidden="true" /> : <MenuIcon className="icon" size={18} aria-hidden="true" />}Menu
          </button>
          <div id="menu-equipe" className={`topbar-painel${menu ? " aberto" : ""}`}>
            <nav aria-label="Navegação principal">
              {prefixed.map((n) => (
                <Link key={n.href} href={n.href} className={`navlink${isOn(n.href) ? " on" : ""}`} aria-current={isOn(n.href) ? "page" : undefined}>
                  {n.icon && NAV_ICON[n.icon] && (() => { const I = NAV_ICON[n.icon!]; return <I className="icon" size={20} aria-hidden="true" />; })()}
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="topbar-acoes">
              <span className="badge">{ROLE_LABEL[role]}</span>
              {REMOTE && email && <BotaoSenha email={email} />}
              <button className="btn sm" onClick={logout}><LogOut className="icon" size={17} aria-hidden="true" />Sair</button>
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
