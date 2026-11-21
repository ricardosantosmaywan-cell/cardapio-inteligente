import { LojaProvider } from "@/components/loja";

export default function LojaLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  return <LojaProvider slug={params.slug}>{children}</LojaProvider>;
}
