import Link from "next/link";
import { Store } from "lucide-react";

const REMOTE = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function Home() {
  return (
    <div className="screen-center center">
      <span className="logo xl" style={{ alignSelf: "center", background: "var(--brand)", color: "var(--brand-ink)" }} aria-hidden="true"><Store size={36} /></span>
      <h1>Cardápio inteligente</h1>
      <p className="muted">Cardápio digital por mesa. Para pedir, leia o QR code da sua mesa.</p>
      <Link href="/admin" className="btn primary block">Administração{REMOTE ? "" : " (criar lojas)"}</Link>
      {!REMOTE && <Link href="/l/demo" className="btn ghost block">Abrir a demo (modo local)</Link>}
    </div>
  );
}
