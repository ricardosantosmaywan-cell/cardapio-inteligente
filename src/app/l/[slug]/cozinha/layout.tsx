import { RoleGate } from "@/components/auth";
import { ClientOnly } from "@/components/ui";

export default function CozinhaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnly>
      <RoleGate tablet allow={["cozinha", "garcom", "dono"]} area="cozinha" nav={[{ href: "/cozinha", label: "Pedidos", icon: "cozinha" }]}>
        {children}
      </RoleGate>
    </ClientOnly>
  );
}
