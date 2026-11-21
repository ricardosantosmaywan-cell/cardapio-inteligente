# Cardápio inteligente — multi-loja

Next.js 14 + TypeScript + Supabase. Cardápio digital por mesa (cliente, garçom e dono), agora com **várias lojas** e uma **tela de administração** para criar lojas. Versão para o Brasil (R$, pt-BR); o euro continua disponível por loja.

## Rotas

| Rota | Quem | O quê |
|---|---|---|
| `/admin` | Super administrador (Ricardo) | Cria, suspende e reativa lojas; cria o login do dono; nova senha temporária |
| `/l/<slug>` | Todos | Entrada da loja (nome e acessos) |
| `/l/<slug>/mesa/<token>` | Cliente (QR da mesa) | Cardápio e pedidos |
| `/l/<slug>/garcom` | Garçom ou dono | Mesas, pedidos, produtos em falta |
| `/l/<slug>/dono` | Dono | Produtos, categorias, ofertas, mesas e QR, relatório |

## Como funciona

- Cada loja é uma linha de `app_state` (id = slug) + uma linha em `lojas`. Tudo isto é criado pela rota `/api/admin/lojas`, que usa a chave de serviço do Supabase (só no servidor).
- Login real com Supabase Auth. Papéis em `membros` (dono, garçom) e `super_admins`.
- Moeda por loja (`establishment.currency`: BRL ou EUR). Sem Supabase configurado, a app corre em **modo local** (localStorage, loja `demo` com dados de exemplo).

## Experimentar sem Supabase

Sem as variáveis do Supabase a app corre em **modo local**: `/admin` também funciona (as lojas ficam só no localStorage deste navegador e o login do dono é simulado). Bom para ver a tela e testar; não é partilhado entre aparelhos.

## Configurar

1. Crie um projeto no Supabase (para o Brasil: região São Paulo, `sa-east-1`).
2. SQL Editor: corra `supabase/schema-multiloja.sql`.
3. Authentication > Users: crie o seu utilizador e corra o `insert into super_admins …` que está no fim do ficheiro SQL.
4. Copie `.env.local.example` para `.env.local` e preencha as 3 variáveis. Na Vercel, as mesmas em Settings > Environment Variables (a `SUPABASE_SERVICE_ROLE_KEY` nunca com prefixo `NEXT_PUBLIC_`).
5. `npm install && npm run dev`, abra `/admin`.

## Criar uma loja nova

`/admin` > **Nova loja**: nome, endereço (slug), moeda, número de mesas e e-mail do dono. A senha temporária do dono aparece **uma única vez**.

## Limite de mesas (preço)

Cada loja tem `limite_mesas`, definido pelo administrador em `/admin` (clicar em **Mesas** na linha da loja). O dono vê "Mesas em uso: X de Y" e não cria acima do limite; no Supabase o gatilho `app_state_limite_mesas` impõe a regra no servidor.

## Limites conhecidos (antes de clientes reais)

- O cliente à mesa escreve na mesma linha jsonb da loja. Qualquer pessoa com a chave pública e o slug consegue ler e alterar o estado dessa loja (incluindo telemóveis dos clientes). Serve para um cliente de teste. Endurecer com funções no servidor e tabelas normalizadas.
- Fotos ainda vão como data URL dentro do estado (migrar para Supabase Storage).
- Texto de privacidade (LGPD) ainda é um espaço reservado.
- Realtime com polling de 4 s como rede de segurança.
