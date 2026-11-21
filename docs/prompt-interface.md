Você é um designer de produto sênior e front-end. Crie a interface completa (design system + todas as telas) do **Cardápio inteligente**, uma plataforma multi-loja de cardápio digital por mesa para restaurantes, bares e lanchonetes no **Brasil** (idioma pt-BR, moeda R$). A interface atual funciona, mas tem mau aspecto e é inconsistente. **Mantenha toda a funcionalidade e todos os botões listados abaixo; redesenhe o visual, a hierarquia e a usabilidade.** Não invente funcionalidades novas e não remova nenhuma.

# 1. Como o produto funciona
- O **cliente** lê o QR code da mesa, informa o nome, espera a aprovação do garçom, vê o cardápio, faz pedidos pelo celular, acompanha o status e pede a conta.
- O **garçom** usa um tablet: vê as mesas, aprova quem quer entrar, recebe pedidos novos (com aviso sonoro), marca entrega item a item, lança pedidos pela mesa, marca produtos esgotados e fecha a mesa.
- O **dono** gerencia a loja: produtos, categorias, ofertas do dia, mesas e QR codes, relatório simples.
- O **administrador da plataforma** cria, suspende e reativa lojas em `/admin`.
- Cada loja tem endereço próprio `/l/<slug>`. O pagamento é feito fora do sistema; os totais são "estimados" (não são documento fiscal).

# 2. Perfis e dispositivos
| Perfil | Dispositivo | Prioridade de design |
|---|---|---|
| Cliente | Celular em pé, 390 px, uma mão, pouca luz | Mobile-first, leitura rápida, apetite visual (fotos grandes) |
| Garçom | Tablet 10", paisagem, de pé e com pressa | Alvos de toque de pelo menos 56 px, estados legíveis de longe (cor + ícone + texto) |
| Dono | Desktop 1280 px (também funciona no celular) | Tabelas e formulários claros, poucas rolagens |
| Administrador | Desktop | Simples e seguro |

# 3. Direção visual
- **Referências de inspiração:** [COLE AQUI OS LINKS E PRINTS]. Extraia o estilo, não copie.
- **Tom:** apetitoso, caloroso, limpo e confiável. Não pode parecer um template genérico.
- **Marca:** nome "Cardápio inteligente". A cor principal atual é laranja-tijolo `#c8472b`; pode propor outra. Cada loja pode ter **logotipo e cor principal próprios**: preveja um tema por loja (logo + cor) aplicado ao cliente, garçom e dono.
- **Tema:** claro e escuro (o cliente costuma pedir à noite; o escuro precisa ter contraste AA).
- **Ícones:** um único conjunto consistente (por exemplo Lucide ou Phosphor). Hoje há emojis misturados com texto; mantenha emoji só como imagem provisória de produto sem foto.
- **Tipografia:** uma família para títulos e outra (ou a mesma) para texto; números e preços com algarismos tabulares.
- **Moeda:** sempre `R$ 12,50`. Datas e horas em pt-BR.

# 4. Design system (entregue primeiro)
Tokens (cores, tipografia, espaçamentos, raios, sombras) e estes componentes, com todos os estados:
botão (primário, secundário, perigo, sucesso, fantasma, pequeno, largura total, desabilitado, carregando); campos (texto, número, hora, select, textarea, checkbox, interruptor, upload de imagem); chips/abas; badges (neutro, info, aviso, perigo, sucesso, marca); card; tabela de dados; modal (desktop) que vira folha inferior (celular); toast; alerta/banner (info, aviso, perigo, sucesso); stepper `− n +`; miniatura de produto (foto ou emoji); **ícone de mesa vista de cima com cadeiras** (uma cadeira ocupada por cliente aprovado, até 6; versão "balcão"), nos 4 estados de mesa; cartão de QR code; barra superior da equipe; barra inferior do cliente; barra de gráfico horizontal; estados vazio, carregando e erro.

Mapa de status (use sempre as mesmas cores e ícones):
- Mesa: **Livre** (neutro), **Ocupada** (info), **Pediu a conta** (aviso), **Chamou o garçom** (perigo).
- Pedido: **Enviado** (aviso), **Visto** (info), **Entregue** (sucesso).
- Produto: **Disponível** (sucesso), **Esgotado** (perigo).
- Oferta: **Inativa**, **A mostrar** (sucesso), **Fora do horário** (aviso).
- Loja: **Ativa** (sucesso), **Suspensa** (perigo).

# 5. Telas (inventário completo)

## A. Públicas e acesso
**A1. Início `/`**: logotipo, nome, frase curta ("Cardápio digital por mesa. Para pedir, leia o QR code da sua mesa."), botão **Administração (criar lojas)**.

**A2. Entrada da loja `/l/<slug>`**: nome da loja (com logo), frase "Cardápio digital por mesa". Dois cartões grandes: **Garçom** ("Mesas, pedidos novos, produtos em falta e fechamento de conta") com botão **Entrar como garçom**; **Dono** ("Produtos, fotos, categorias, ofertas do dia, mesas e QR codes") com botão **Entrar como dono**. Não mostrar QR codes aqui.

**A3. Login da equipe (garçom ou dono)**: título "Entrar como garçom/dono"; campos **E-mail** e **Senha**; botão **Entrar** (estado "Entrando…"); mensagem de erro "E-mail ou senha incorretos."; botão fantasma **← Voltar**.

**A4. Sem acesso**: ícone de cadeado, "Sem acesso", texto "<e-mail> não tem permissão para esta área."; botões **Sair e entrar com outra conta** e **← Voltar**.

**A5. Loja indisponível** ("Este endereço não existe ou a loja está temporariamente suspensa.") e **Sem conexão** ("Não foi possível carregar a loja. Verifique a internet e tente de novo."); e **Carregando**.

## B. Cliente (celular) `/l/<slug>/mesa/<token>`
**B1. Entrar na mesa**: logo e nome da loja, nome da mesa ("Mesa 3"); campos **O seu nome** (obrigatório) e **Celular (opcional)**; botão **Entrar na mesa**; nota de privacidade com ícone de cadeado ("Recolhemos apenas o nome e, se quiser, o celular. Não usamos o celular para marketing.").
**B2. Aguardando o garçom**: "A aguardar o garçom — o garçom vai confirmar que você está na Mesa 3. Assim que aprovar, já pode fazer o pedido." (animação suave de espera).
**B3. Entrada não aprovada**: "Fale com o garçom se achar que é um engano." Botão **Tentar outra vez**.
**B4. QR não reconhecido**: "Este código é antigo, inválido ou foi removido. Peça ao garçom para ver o QR atual da mesa." Botão **Tentar outra vez**.
**B5. Mesa encerrada**: "Obrigado pela visita!"; botão **Voltar a pedir (ler o QR outra vez)**.

**B6. App da mesa (cabeçalho fixo em todas as abas)**: "Mesa 3 · Marta", rótulo "Total estimado da mesa" e o valor; botão **Chamar** (sino) que chama o garçom (mostra toast "Garçom chamado"). Se outro cliente pediu para entrar na mesa, um banner com "<nome> quer entrar na mesa." e os botões **Aprovar** e **Recusar**.

**B7. Aba Cardápio**:
- Carrossel **Ofertas do dia**: cartão com foto/ícone, etiqueta (ex.: "Happy hour"), título, preço da oferta e preço normal riscado, botão **Adicionar** (depois vira **+1 (2)** com a quantidade no carrinho).
- Chips de **categorias** rolando na horizontal (uma ativa).
- Lista de produtos: miniatura (foto grande, apetitosa), nome, descrição, preço, selo **Esgotado** (cartão apagado e sem botão); controle **+** que vira `− n +` depois de adicionar. Estado vazio: "Sem produtos nesta categoria."
- Botão fixo **Ver pedido · 3 itens · R$ 32,00** quando há itens no carrinho.

**B8. Carrinho ("O seu pedido")**: botão **← Cardápio**; linhas com miniatura, nome, "R$ 11,90 × 2 = R$ 23,80", stepper `− n +`; item esgotado entre a seleção e o envio fica com selo **Esgotado** e botão **Retirar**; alerta vermelho "<item> esgotou. Retire esse item para poder enviar o pedido."; campo **Observação para este pedido** ("Ex.: sem cebola, bife bem passado…"); linha "Total deste pedido"; botão **Enviar pedido ao garçom** (desabilitado se vazio ou com item esgotado); carrinho vazio: "O carrinho está vazio."; toast "Pedido enviado ao garçom".

**B9. Aba Meus pedidos**: um cartão por pedido: autor, hora, badge de status (**Enviado / Visto pelo garçom / Entregue**), itens com "2× Sagres" e ✓ quando entregue, "(cancelado)" riscado quando cancelado, observação com ícone de nota, valor do pedido. Abaixo, cartão "Total estimado da mesa" com a nota "Valor informativo, não é um documento fiscal. O pagamento é feito com o garçom." e o botão **Pedir a conta**; depois de pedida, vira um alerta de sucesso "O garçom já vem" com o botão **Pedir outra vez** (toast "Pedido de conta reenviado"). Estado vazio: "Ainda não há pedidos nesta mesa."

**B10. Barra inferior fixa**: abas **Cardápio** e **Meus pedidos**.

## C. Garçom (tablet, paisagem) `/l/<slug>/garcom`
Barra superior da equipe em todas as telas: logo/nome da loja, navegação **Mesas** e **Produtos em falta**, badge do papel ("Garçom"), botão **Sair**.

**C1. Mesas**: título "Mesas"; caixa **Som de aviso** (liga/desliga o bip quando chega pedido novo ou cliente querendo entrar). Banner de destaque "🙋 2 clientes querem entrar" (com "Mesa 2 · João | …") e botão **Ver mesa**; banner "🔔 3 pedidos novos" com botão **Ver mesa**. Grade de cartões de mesa (cartão inteiro clicável): ícone da mesa com cadeiras, nome, badge de estado; se ocupada: nomes dos clientes, **valor da conta**, "aberta há 42 min" e selos "🔔 2 novo(s)", "👤 1 a entrar", "🛎️ chamou há 3 min", "🧾 conta há 1 min"; se livre: "Livre · sem clientes". A cor/borda do cartão acompanha o estado.

**C2. Detalhe da mesa `/garcom/mesa/<id>`**:
- Cabeçalho: botão **← Mesas**, nome da mesa, badge de estado, total da conta em destaque.
- Mesa livre: cartão "A mesa está livre…" e botão **Abrir mesa**.
- Alerta de perigo "A mesa chamou o garçom há 2 min" com botão **Já atendi**. Alerta de aviso "A mesa pediu a conta há 1 min. Receba fora do sistema e depois feche a mesa."
- Para cada cliente pendente: "<nome> quer entrar na mesa" com **Aprovar** e **Recusar**.
- Cartão **Clientes** (nomes, com celular entre parênteses se informado).
- Ações: **＋ Lançar pedido**, **Renovar QR**, **Fechar mesa** (perigo).
- Lista **Pedidos** em grade de 2 colunas; cada cartão: autor, hora e "há x min", badge de status; destaque na borda se for novo (Enviado); cada item: "2× Sagres 33 cl", valor, botão **Entregar** (vira **✓ Entregue**, pode desmarcar) e botão **✕** de cancelar (só se ainda não foi entregue); itens cancelados riscados "(cancelado)"; observação em destaque; total do pedido; botões **Marcar visto** (só se Enviado) e **Entregar tudo**. Estado vazio: "Ainda sem pedidos."
- **Modal Lançar pedido — Mesa X**: todas as categorias com seus produtos (miniatura, nome, preço, selo Esgotado, stepper), campo **Observação**, botão **Lançar pedido · R$ 0,00** (desabilitado sem itens). Toast "Pedido lançado".
- **Modal Fechar mesa**: "Confirme o total de R$ X antes de fechar. O pagamento é feito fora do sistema." e a nota de que todos os celulares passam para "Obrigado pela visita"; botões **Cancelar** e **Fechar mesa**.
- **Modal Cancelar item**: "Você tem certeza que quer cancelar <item>? O item sai da conta da mesa e o cliente vê 'cancelado'."; botões **Não, manter** e **Sim, cancelar**. Toast "Item cancelado".
- **Modal Renovar QR da mesa**: explica que o QR impresso atual deixa de funcionar; botões **Cancelar** e **Renovar**. Toast "QR renovado".
- Mesa não encontrada: "Mesa não encontrada." e botão **← Mesas**.

**C3. Produtos em falta**: título e contador "3 esgotado(s)"; texto explicando que a alteração vale para todos os celulares e que quem tem o produto no carrinho é avisado; seções por categoria; cada produto: miniatura, nome, preço e um **seletor de dois botões Disponível | Esgotado** (grande, fácil de tocar).

## D. Dono (desktop) `/l/<slug>/dono`
Barra superior: logo/nome, navegação **Produtos**, **Categorias**, **Ofertas do dia**, **Mesas e QR**, **Relatório**, **Área do garçom ↗**, badge "Dono", botão **Sair**.

**D1. Produtos**: título; botão **＋ Novo produto**; busca "Pesquisar produto…"; filtro **Todas as categorias**; tabela com colunas foto, **Produto** (nome + descrição), **Categoria**, **Preço**, **Estado** (Disponível/Esgotado) e ações **Editar** e **✕** (remover, com confirmação "Remover '<nome>'?"). Estado vazio: "Nenhum produto encontrado."
**Modal Novo/Editar produto**: miniatura grande; botão **Enviar foto** (câmera/galeria) e **Remover foto**; campo **Ícone (sem foto)**; **Nome**; **Descrição**; **Preço (R$)** (placeholder 12,50); **Categoria**; caixa **Disponível hoje**; mensagens de erro ("Informe o nome do produto.", "Informe um preço válido, por exemplo 12,50.", "Crie primeiro uma categoria."); botão **Salvar**; toast "Produto salvo".

**D2. Categorias**: texto "A ordem aqui é a ordem das categorias no cardápio do cliente."; campo **Nova categoria** + botão **Adicionar**; lista: campo de nome editável, selo "3 produto(s)", botões **↑**, **↓** (desabilitados nas pontas) e **✕** (desabilitado se tiver produtos, com dica "Mova ou remova os produtos primeiro"). Permitir arrastar para reordenar é opcional.

**D3. Ofertas do dia**: botão **＋ Nova oferta**; texto explicativo; grade de cartões: miniatura, etiqueta, badge (**Inativa / A mostrar / Fora do horário**), título, preço da oferta e preço normal riscado, dias e horário ("Sex, Sáb · 12:00–15:00" ou "Todos os dias"), botões **Editar**, **Ativar/Desativar**, **Remover**. Estado vazio: "Ainda não há ofertas."
**Modal Nova/Editar oferta**: **pré-visualização ao vivo** do cartão como o cliente verá; **Enviar imagem** / **Remover imagem**; **Ícone**; **Título**; **Etiqueta**; **Preço da oferta (R$)**; **Preço normal (R$)**; **Dias** (chips Dom a Sáb, múltipla escolha); **Das** e **Às** (hora); **Ordem**; caixa **Ativa**; erro; botão **Salvar oferta**.

**D4. Mesas e QR**: botão **Imprimir todos**; formulário **Nova mesa** (campo "Ex.: Mesa 6, Esplanada 1" + **Criar mesa**); grade de cartões: nome editável, **QR code grande**, botões **Imprimir**, **Baixar** (PNG), **Renovar** (confirmação) e **Remover** (desabilitado se "Em uso", com dica "Feche a mesa antes de remover"), selo **Em uso**.
**Layout de impressão (A4, um QR por cartão)**: nome da loja (logo), frase "Leia o QR para ver o cardápio e pedir", QR, nome da mesa grande. Deve ficar bonito impresso em preto e branco e em cores.

**D5. Relatório simples**: aviso "Valores informativos (estimativa), não substituem a faturação do estabelecimento."; três blocos: **Pedidos por dia** (tabela dia, pedidos, valor estimado), **Mesas com mais consumo** (tabela) e **Produtos mais pedidos** (lista com barras horizontais e quantidade). Estados vazios "Sem pedidos ainda." / "Sem dados."

## E. Administração da plataforma `/admin`
**E1. Login do administrador**: "Administração"; **E-mail**, **Senha**, **Entrar**; erro "E-mail ou senha incorretos."; tela **Sem acesso** ("<e-mail> não é administrador") com botão **Sair**.

**E2. Lojas**: barra superior "Administração", e-mail do administrador e botão **Sair**; título "Lojas" e botão **＋ Nova loja**; tabela com **Loja** (nome), **Endereço** (`/l/slug`), **Dono** (e-mail ou "sem dono"), **Moeda** (R$ ou €), **Estado** (Ativa/Suspensa) e ações **Painel do dono ↗**, **Copiar link** (toast "Copiado"), **Nova senha** (só se houver dono), **Suspender/Reativar** (com confirmação explicando que os dados não são apagados). Estados: carregando, vazio ("Ainda não há lojas. Crie a primeira."), erro.

**E3. Modal Nova loja**: **Nome da loja** (placeholder "Ex.: Hamburgueria do Zé"); **Endereço (link da loja)** gerado automaticamente a partir do nome (sem acentos, com hífen) e editável, com a prévia `/l/endereço`; **Moeda** (Real R$ / Euro €); **Número de mesas** (1 a 60); **E-mail do dono (opcional)** com a nota "criamos o acesso do dono com uma senha temporária que aparece uma única vez"; erros do servidor (endereço inválido, endereço já existe); botão **Criar loja** (estado "Criando…").
**E4. Modal Loja criada**: link da loja com botão **Copiar**; bloco "Acesso do dono" com e-mail e **senha temporária em destaque** com botão **Copiar** e o aviso "Esta senha aparece só agora. Envie ao dono por um canal seguro."; variantes: "o e-mail já tinha conta e foi ligado a esta loja" e "sem dono ainda"; texto do próximo passo.
**E5. Modal Nova senha temporária**: nome da loja, senha com botão **Copiar** e o aviso de que aparece só agora.

# 6. Regras transversais
- **Feedback:** toda ação importante tem toast (2,5 s) ou alerta; ações destrutivas pedem confirmação em modal com botão de perigo e botão de cancelar claros.
- **Tempo real:** pedidos e estados mudam sem recarregar; destaque sutil (animação curta) quando algo novo chega no tablet do garçom.
- **Acessibilidade:** contraste AA, foco visível, alvos de toque ≥ 44 px (≥ 56 px no tablet), rótulos em todos os campos, nunca depender só da cor.
- **Responsivo:** cliente 360–430 px; garçom 1024–1366 px; dono e admin de 360 px a 1440 px (tabelas viram listas empilhadas no celular).
- **Texto:** pt-BR, tratamento "você", frases curtas, sem jargão. Preserve os textos acima (pode melhorar a redação).
- **Fotos:** produto com foto grande e proporção 4:3 ou 1:1; sem foto, ícone/emoji sobre fundo neutro.
- **Desempenho:** telas do cliente leves (poucas sombras e imagens pesadas).

# 7. Entregáveis
1. Design system (tokens + componentes com estados) em claro e escuro.
2. Todas as telas acima, cada uma nos estados descritos (vazio, carregando, erro, sucesso), no dispositivo certo (cliente em celular, garçom em tablet paisagem, dono e admin em desktop; mais as versões de celular do dono).
3. Fluxos navegáveis: **(a)** cliente: B1 → B2 → B7 → B8 → B9; **(b)** garçom: C1 → C2 → entregar → fechar mesa; **(c)** dono: D1 → novo produto; D4 → imprimir QR; **(d)** admin: E1 → E2 → E3 → E4.
4. Layout de impressão do QR da mesa.
5. Lista final de componentes e nomes de tokens (para o desenvolvimento).

# 8. Restrições técnicas (se for gerar código)
- Stack existente: Next.js 14 (App Router), React 18, TypeScript, CSS global em `src/app/globals.css`, sem biblioteca de UI. Pode introduzir Tailwind ou CSS variables, mas **não altere a lógica** (`src/lib/*`) nem os nomes das rotas.
- Mantenha os textos de acessibilidade (`aria-label`) existentes.
- Rotas: `/`, `/admin`, `/l/[slug]`, `/l/[slug]/mesa/[token]`, `/l/[slug]/garcom`, `/l/[slug]/garcom/mesa/[id]`, `/l/[slug]/garcom/faltas`, `/l/[slug]/dono`, `/l/[slug]/dono/categorias`, `/l/[slug]/dono/ofertas`, `/l/[slug]/dono/mesas`, `/l/[slug]/dono/relatorio`.
- Cores e logo da loja virão da configuração da loja (variáveis CSS `--brand`, `--brand-ink`), por isso nada de cor fixa nos componentes.
