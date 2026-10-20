import { RoleGate } from "@/components/auth";
import { ClientOnly } from "@/components/ui";

export default function GarcomLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnly>
      <RoleGate
        allow={["garcom", "dono"]}
        area="garcom"
        nav={[
          { href: "/garcom", label: "Mesas" },
          { href: "/garcom/faltas", label: "Produtos em falta" },
        ]}
      >
        {children}
      </RoleGate>
    </ClientOnly>
  );
}
