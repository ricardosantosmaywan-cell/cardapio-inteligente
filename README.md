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

## Segurança dos dados

- **Sem login, só se vê o cardápio.** Nome da loja, categorias, produtos e ofertas ficam em `cardapio_publico` (leitura pública). Mesas, clientes, **celulares** e pedidos ficam em `app_state`, que só o dono e o garçom da própria loja leem e alteram, com login.
- **O cliente à mesa nunca lê nem escreve `app_state`.** Entra, vê o estado, pede, chama o garçom e pede a conta por funções no servidor (`entrar_mesa`, `estado_mesa`, `enviar_pedido`, `chamar_garcom`, `pedir_conta`, `decidir_convidado`). Cada convidado recebe uma **chave secreta** ao entrar; sem ela (e sem o QR certo) nada funciona. **Os preços e a disponibilidade vêm sempre do servidor**, nunca do ecrã do cliente.
- **O garçom** mexe na operação (mesas, clientes, pedidos, esgotado), mas **não** altera cardápio, preços, ofertas nem o número de mesas.
- Cada loja só acede à sua; o limite de mesas é imposto no servidor.
- Limites contra abuso: 30 convidados por mesa, 200 pedidos por sessão, 40 linhas por pedido.

### Atualizar um projeto Supabase que já existe (duas fases)

1. Corra `supabase/seguranca-fase1.sql` (só acrescenta; a versão antiga da app continua a funcionar).
2. Publique a app nova.
3. Corra `supabase/seguranca-fase2.sql` (fecha o acesso aberto). Convidados que estavam numa mesa antes da fase 1 têm de voltar a entrar (não tinham chave secreta).

Projeto novo: `supabase/schema-multiloja.sql` já inclui tudo.

## Limites conhecidos (antes de clientes reais em volume)

- Fotos ainda vão como data URL dentro do estado da loja (migrar para Supabase Storage); o cardápio público também as leva.
- Texto de privacidade (LGPD) ainda é um espaço reservado.
- O cliente à mesa atualiza de 3 em 3 segundos (consulta), sem Realtime.
- Sem limite de pedidos por IP/minuto: falta proteção contra um script que tente adivinhar QR codes ou criar muitos convidados.
