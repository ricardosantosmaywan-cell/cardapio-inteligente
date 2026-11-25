# Cardápio inteligente — multi-loja

Next.js 14 + TypeScript + Supabase. Cardápio digital por mesa (cliente, garçom e dono), agora com **várias lojas** e uma **tela de administração** para criar lojas. Versão para o Brasil (R$, pt-BR); o euro continua disponível por loja.

## Rotas

| Rota | Quem | O quê |
|---|---|---|
| `/admin` | Super administrador (Ricardo) | Cria, suspende e reativa lojas; cria o login do dono; nova senha temporária |
| `/l/<slug>` | Todos | Entrada da loja (nome e acessos) |
| `/l/<slug>/mesa/<token>` | Cliente (QR da mesa) | Cardápio e pedidos |
| `/l/<slug>/garcom` | Garçom ou dono | Mesas, pedidos, produtos em falta |
| `/l/<slug>/dono` | Dono | Produtos, categorias, ofertas, mesas e QR, relatório, equipe |
| `/l/<slug>/cozinha` | Cozinha, garçom ou dono | Pedidos a preparar: novo → em preparação → pronto (só se a loja a tiver ligada) |

## Como funciona

- Cada loja é uma linha de `app_state` (id = slug) + uma linha em `lojas`. Tudo isto é criado pela rota `/api/admin/lojas`, que usa a chave de serviço do Supabase (só no servidor).
- Login real com Supabase Auth. Papéis em `membros` (dono, garçom, cozinha) e `super_admins`.
- Moeda por loja (`establishment.currency`: BRL ou EUR). Sem Supabase configurado, a app corre em **modo local** (localStorage, loja `demo` com dados de exemplo).

## Tela da cozinha

- **Opcional por loja.** O dono liga em **Equipe › Tela da cozinha** e define a partir de quantos minutos um pedido fica destacado (padrão 15). Fica em `establishment.kitchen = { enabled, alertMin }`. Num espaço pequeno pode ficar desligada: o garçom continua a trabalhar como antes.
- **Estados do pedido na cozinha:** `novo` (por defeito) → `preparo` → `pronto`, em `orders[].kitchen`, com `prepStartedAt` e `readyAt`. O estado do serviço (enviado, visto, entregue) continua a ser do garçom.
- **Aviso ao garçom:** quando a cozinha marca "pronto", o ecrã das mesas mostra "pedido pronto para servir" (com som) e a mesa ganha a etiqueta "pronto". Na página da mesa cada pedido mostra o estado na cozinha. O pedido sai da cozinha quando o garçom o entrega.
- **Papel novo `cozinha`.** O dono cria o acesso em **Equipe** (função "Cozinha"). A cozinha **não lê `app_state`** (onde estão celulares, nomes e preços): vê os pedidos pela função `cozinha_pedidos` e muda o estado por `cozinha_marcar`, que só devolvem mesa, hora, itens, quantidades, observação e estado. O dono e o garçom também podem abrir a cozinha.
- **Supabase:** corra `supabase/cozinha.sql` (projeto novo: depois de `schema-multiloja.sql`; projeto existente: depois das fases de segurança). Se voltar a correr `schema-multiloja.sql`, corra `cozinha.sql` outra vez a seguir (repõe a regra que tira a cozinha do `app_state`).
- **Atualização:** a cozinha consulta de 3 em 3 segundos (sem Realtime, porque não lê `app_state`).
- **Categorias fora da cozinha (ex.: bebidas).** Em **Categorias**, o dono desliga "Cozinha" nas categorias que o garçom serve sozinho (`categories[].skipKitchen`). Esses produtos não aparecem na cozinha e um pedido só com eles não vai para a cozinha. Ao ligar a cozinha pela primeira vez, as categorias com "bebida" no nome ficam já fora.
- **Aviso ao garçom:** se tentar entregar um item que passa pela cozinha (ou "Entregar tudo") antes de a cozinha o marcar pronto, aparece "A cozinha ainda não acabou" com "Esperar pela cozinha" ou "Entregar mesmo assim". As bebidas entregam-se sem aviso.
- **O cliente vê o estado:** no telemóvel, o pedido mostra "Em preparação" e "Pronto, já vai para a mesa" até o garçom o entregar.
- **Supabase:** estas três funcionalidades precisam de `supabase/cozinha-v2.sql` (depois de `cozinha.sql`). Sem ele, a app continua a funcionar: a cozinha mostra também as bebidas e o cliente não vê o estado da cozinha.

### Como testar a cozinha

1. Modo local: entre como dono, ligue a cozinha em Equipe, abra `/l/demo/cozinha`, passe um pedido a "em preparação" e "pronto" e veja o aviso em `/l/demo/garcom`. Ao entregar o pedido na mesa, ele sai da cozinha.
2. Com Supabase (depois de aplicar `cozinha.sql`): em Equipe, adicione um e-mail com a função Cozinha, entre com ele em `/l/<slug>/cozinha` e confirme que `/l/<slug>/garcom` e `/l/<slug>/dono` dizem "Sem acesso".

## Fotos (Supabase Storage)

- **Com Supabase:** as fotos de produtos e ofertas são reduzidas no navegador (lado maior 1000 px, WebP; JPEG se o navegador não gerar WebP) e enviadas para o bucket público `fotos`, na pasta da loja (`<slug>/<nome-aleatório>.webp`). No estado da loja (e no cardápio público) fica só o endereço da imagem. As imagens têm cache de 1 ano e o nome é aleatório, por isso trocar uma foto muda o endereço.
- **Quem escreve:** só o dono da loja (ou o administrador). O garçom e a cozinha não. Qualquer pessoa vê a foto se tiver o endereço; ninguém sem login lista a pasta. Limite de 2 MB por ficheiro (WebP, JPEG ou PNG).
- **Limpeza:** ao trocar ou remover uma foto, ou remover o produto ou a oferta, a foto antiga é apagada do Storage (se falhar, fica só um ficheiro órfão). Se cancelar o formulário, as fotos enviadas nele são apagadas.
- **Sem Supabase (demo local):** continua a guardar a imagem dentro do estado (localStorage).
- **Migrar fotos antigas:** em **Produtos** (painel do dono) aparece o aviso "N fotos estão guardadas dentro dos dados da loja" com o botão **Mover fotos para o armazenamento**. Serve para imagens dentro do estado (data URL) e para ficheiros da própria app (ex.: `/demo/...`). Envia tudo primeiro e só depois troca os valores, de uma vez; se algo falhar, apaga o que enviou e não altera nada. Mostra o tamanho dos dados da loja antes e depois.
- **Supabase:** corra `supabase/fotos-storage.sql` (depois de `schema-multiloja.sql`). Sem ele, o envio de fotos falha com a mensagem "Sem permissão para enviar fotos, ou falta aplicar supabase/fotos-storage.sql".
- **Como testar:** em modo local, envie uma foto num produto (continua a funcionar como antes). Com Supabase, depois de aplicar o SQL: envie uma foto, confirme em Storage › fotos que o ficheiro está em `<slug>/` e que o produto guarda só o endereço; entre como garçom e confirme que não consegue enviar fotos.

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

- Fotos: o Storage está feito (ver "Fotos"), mas lojas com fotos antigas dentro do estado precisam de usar o botão "Mover fotos para o armazenamento". Enviar fotos continua sem limite por loja (a proteção contra abuso é a tarefa 6).
- Texto de privacidade (LGPD) ainda é um espaço reservado.
- O cliente à mesa atualiza de 3 em 3 segundos (consulta), sem Realtime.
- Sem limite de pedidos por IP/minuto: falta proteção contra um script que tente adivinhar QR codes ou criar muitos convidados.
