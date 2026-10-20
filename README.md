# Cardápio por Mesa — MVP (demo com dados mockados)

Next.js 14 + TypeScript. Sem backend: os dados vivem no `localStorage` e sincronizam entre abas do mesmo navegador.

## Correr

```bash
npm install
npm run dev     # http://localhost:3000
```

Na página inicial estão os QR das mesas e os links para o garçom e o dono. Abra cada perfil numa aba diferente.

- Login do garçom e do dono: simulado, qualquer valor entra.
- "Repor dados da demo" na página inicial volta ao estado inicial.
- Cada aba do cliente é um "telemóvel" diferente (a identidade fica em `sessionStorage`).

## Estrutura

- `src/lib/store.ts` — única camada de dados (mock). Trocar por Supabase = reescrever este ficheiro.
- `src/lib/seed.ts` — dados de demonstração.
- `src/app/mesa/[token]` — cliente (C1–C13).
- `src/app/garcom` — tablet do garçom (G1–G11).
- `src/app/dono` — gestão (D1–D8).

## Fora desta demo (próximas fases do PRD)

Supabase (Auth, Postgres + RLS, Realtime, Storage), sincronização entre aparelhos diferentes, texto legal/RGPD, PWA com ícones e ecrã sempre ligado, ecrã de falta de ligação.
