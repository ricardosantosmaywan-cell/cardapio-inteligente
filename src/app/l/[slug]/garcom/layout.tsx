import { RoleGate } from "@/components/auth";
import { ClientOnly } from "@/components/ui";

export default function GarcomLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnly>
      <RoleGate
        tablet
        allow={["garcom", "dono"]}
        area="garcom"
        nav={[
          { href: "/garcom", label: "Mesas", icon: "mesas" },
          { href: "/garcom/faltas", label: "Produtos em falta", icon: "faltas" },
        ]}
      >
        {children}
      </RoleGate>
    </ClientOnly>
  );
}
