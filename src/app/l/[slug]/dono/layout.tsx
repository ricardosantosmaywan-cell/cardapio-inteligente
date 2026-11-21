import { RoleGate } from "@/components/auth";
import { ClientOnly } from "@/components/ui";

export default function DonoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnly>
      <RoleGate
        allow={["dono"]}
        area="dono"
        nav={[
          { href: "/dono", label: "Produtos" },
          { href: "/dono/categorias", label: "Categorias" },
          { href: "/dono/ofertas", label: "Ofertas do dia" },
          { href: "/dono/mesas", label: "Mesas e QR" },
          { href: "/dono/relatorio", label: "Relatório" },
          { href: "/garcom", label: "Área do garçom ↗" },
        ]}
      >
        {children}
      </RoleGate>
    </ClientOnly>
  );
}
