import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Uma só família para títulos e texto. (A fonte do iFood é proprietária; esta é a gratuita mais próxima.)
const body = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body-loaded", display: "swap" });

export const metadata: Metadata = {
  title: "Cardápio inteligente",
  description: "Cardápio digital por mesa, com pedidos pelo celular",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#e01c2b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={body.variable}>
      <body>
        {children}
        <footer className="credito no-print">Criado por Ricardo Pereira</footer>
      </body>
    </html>
  );
}
