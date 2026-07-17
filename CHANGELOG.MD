# Changelog do WikiCambada Core

## v1.1.0 Beta

Esta versão inicia a transformação do WikiCambada Core em um motor de wiki implementável para instalações independentes, mantendo compatibilidade com a WikiCambada original.

### Setup e implementação

- adiciona `setup.py` com interface web local em português brasileiro e inglês
- adiciona modos separados para criar uma nova wiki, reconfigurar a instalação atual, atualizar o Core e verificar a instalação
- adiciona presets de documentação de software, wiki comunitária, enciclopédia, base de conhecimento privada, instalação mínima e configuração personalizada
- separa idioma do instalador e idioma padrão da wiki
- adiciona configuração de nome, slogan, URL, identidade visual, fontes, navegação, links, recursos, Cloudflare, super administrador e canal de atualização
- adiciona manifesto da instalação em `src/config/installation.json`
- adiciona configuração central da wiki em `src/config/site.json`
- adiciona atualização por pacote ZIP local com manifesto SHA-256, detecção de modificações, backup e restauração automática em falha
- preserva configuração, branding, fontes, `.dev.vars`, `wrangler.toml` e comandos específicos do projeto durante atualizações
- adiciona verificação de arquivos, JSON, TOML, versões e assets essenciais pelo setup

### Configurações globais

- adiciona `/admin/settings` para administradores e super administradores
- adiciona toggles globais para páginas especiais, busca, discussões, páginas de usuário, sugestões públicas, histórico, uploads, templates, categorias, página aleatória, selo do Core e atividade recente
- adiciona API pública `/api/settings` e API administrativa `/api/secure/admin/settings`
- adiciona migration `0015_v1_1_0_global_settings.sql`
- aplica configurações globais no frontend e nas APIs públicas, usa os recursos do preset como defaults do backend e oculta namespaces e resultados ligados a recursos desativados

### Namespace Especial

- adiciona `/wiki/especial` como índice de páginas especiais
- move URLs canônicas para `/wiki/especial/todas-as-paginas`, `/wiki/especial/paginas-recentes`, `/wiki/especial/categorias`, `/wiki/especial/pagina-aleatoria` e `/wiki/especial/versao`
- mantém aliases antigos e equivalentes em inglês
- impede edição, sugestão e histórico de páginas geradas pelo Core no namespace Especial, inclusive por chamadas diretas à API

### Generalização

- torna nome, slogan, página inicial, branding, fontes, navegação, recursos, Cloudflare e super administrador configuráveis
- usa `WIKI_SITE_NAME` e `WIKI_SUPER_ADMIN_EMAIL` no backend
- atualiza a versão para `v1.1.0 Beta`
- reorganiza a documentação do projeto em `README.MD` e `CHANGELOG.MD`

---

# WikiCambada Core

## v1.0.13

- Oculta corretamente o dropdown móvel de Configurações em navegadores desktop, mesmo quando a janela está estreita.
- Reforça a ordenação de `/wiki/paginas-recentes` pela data real da revisão mais nova, com ordenação adicional no navegador.
- Reserva `/wiki/arquivo/*` para mídia: arquivos inexistentes abrem uma página especial de upload para editores, e o namespace deixa de aceitar artigos, sugestões e histórico editorial comum.
- Adiciona upload especial de imagens, vídeos e áudios com URL de arquivo escolhida pelo editor.
- Substitui os campos antigos de aliases/redirecionamentos do editor por um fluxo avançado, incluindo destinos em seções com `#ancora`.
- Adiciona o painel `/admin/redirects` para criar e remover aliases e redirecionamentos avançados.
- Adiciona a página especial de versão em `/wiki/especial/versao`, com aliases `/wiki/special/version` e `/wiki/version`.
- Inclui a migration `0014_v1_0_13_redirects_files_version.sql`.

## v1.0.12

- Corrige a barra amarela de salvamento que permanecia visível após uma revisão ou proposta ser concluída e a rota mudar.
- Usa a fonte Clássico como padrão em macOS, iOS, iPadOS, Safari e outros ambientes Apple, sem sobrescrever uma escolha já salva pelo usuário.
- Recolhe as configurações móveis em um dropdown nativo e adiciona também o controle de tamanho do texto nessa área.
- Não adiciona migration nova.

## v1.0.11

- Corrige autocomplete da busca exibindo apenas ícones/letras em vez dos títulos.
- Mantém navegação direta para resultado exato por título, alias, redirect ou URL.
- Ordena páginas recentes pela revisão mais nova quando disponível.
- Bloqueia botões de envio enquanto revisão/proposta está sendo salva e mostra barra amarela de salvamento.
- Move aviso de rascunho local para o topo do editor.
- Adiciona detecção de conflito de edição com comparação lado a lado e ações Mesclar, Substituir, Ignorar ou Cancelar.

## v1.0.10

- Corrige a listagem/autocomplete da busca para mostrar título, subtítulo e ação de criação/sugestão com fallback seguro quando o resultado vem de alias, redirect ou FTS.
- Faz buscas com correspondência exata de título, alias, redirect ou URL abrirem a página diretamente, em vez de parar na página de resultados.
- Histórico de páginas passa a preferir o nome público do perfil do editor em vez de expor o e-mail quando houver perfil configurado.
- Visualizador de mídia agora percorre imagens, vídeos, YouTube e áudios do artigo em sequência, de cima para baixo.
- Galeria de mídia aceita inserção de vídeo/YouTube como miniatura, mídia grande ou galeria.
- Adiciona envio e inserção de áudio por upload ou link direto, com opções de miniatura, áudio grande e galeria.
- Não adiciona migration nova.

## v1.0.9

- Melhora a busca de artigos com ranking por título, slug, aliases, redirecionamentos, FTS e fallback textual.
- Adiciona sugestões/autocomplete na barra de busca, com ação rápida para criar ou sugerir páginas inexistentes.
- Adiciona campo URL no editor/sugestão para evitar que título e caminho do artigo fiquem divergentes.
- Adiciona localização aproximada de IP no painel de Atividade recente usando metadados de rede da Cloudflare quando disponíveis.
- Atualiza a mensagem pública de acesso bloqueado e redireciona bloqueios administrativos para `/access-blocked/`.
- Inclui migration `0013_v1_0_9_search_activity.sql`.

## v1.0.8

- Infoboxes aceitam múltiplas imagens/legendas, preservam chaves com acento/caixa e evitam corte em imagens altas.
- Editor Markdown abre Galeria de templates e Mídia do artigo pela toolbar.
- Mídia do artigo aceita upload de vídeo, links diretos e YouTube via `:::video`.
- Visualizador de mídia só abre pelo elemento de mídia, não pela caixa inteira de figuras.
- Âncoras de títulos e links `#secao` voltam a rolar para a seção correta após carregamento assíncrono.
- Inclui migration `0012_v1_0_8_media_infobox_editor.sql`.

- Revalida sessões do Cloudflare Access em abas novas usando o cookie `CF_Authorization` no endpoint público de autenticação.
- Usa `localStorage` além de `sessionStorage` para lembrar que há uma sessão Access conhecida entre abas.
- Adiciona o selo visual `Powered by WikiCambada Core` no rodapé dos artigos com imagem própria em fundo branco estilo MediaWiki.

## v1.0.6.1

- Corrige a validação de blocos Markdown `:::` no back-end para seguir a mesma lógica linha-a-linha usada pelo renderizador.
- Evita falso positivo de “há um bloco ::: sem fechamento” em blocos válidos como `:::thumb`, especialmente em revisões com miniaturas/imagens geradas pelo editor.
- Mantém a validação real contra blocos `:::` e blocos de código sem fechamento.
- Não adiciona migration nova.

## v1.0.6

- Índices deixam de aparecer automaticamente: agora o artigo só renderiza o Índice quando `__TOC__` aparece no Markdown.
- Adiciona rascunhos locais no editor de páginas e propostas, salvando alterações no navegador para evitar perda de texto em travamentos, queda de energia ou fechamento acidental.
- Ajusta `{{Infobox}}` para aceitar campos livres, mantendo `titulo`, `imagem`, `legenda` e `subtitulo` como campos especiais e renderizando qualquer outra chave como linha da infocaixa.
- Adiciona botão H3 na toolbar do editor Markdown para inserir subtítulos `###`.
- Adiciona a migration `0011_v1_0_6_infobox_template_metadata.sql` para atualizar a chamada/documentação da predefinição Infobox no D1.

## v1.0.5

- Corrige ícones/logos aleatórios em rotas profundas como `/wiki/*`, `/edit/*`, `/talk/*` e `/history/*`, convertendo caminhos relativos do manifesto para caminhos absolutos.
- Melhora o Índice dos artigos com visual mais próximo de wiki, numeração hierárquica e botão nativo de mostrar/ocultar.
- Permite inserir `__TOC__` pela toolbar do editor Markdown para forçar o índice na posição desejada.
- Adiciona barra de progresso azul no topo durante carregamentos de páginas, artigos, pesquisas, edição e rotas administrativas.
- Adiciona a migration `0011_v1_0_6_infobox_template_metadata.sql` para atualizar a chamada/documentação da predefinição Infobox no D1.

## v1.0.4

- Corrige inserções antigas de templates/messageboxes que gravavam `\n` literal e quebravam blocos `:::` ao salvar revisões.
- Normaliza chamadas/renderizações de templates vindas do D1 antes de mostrar na galeria, no editor e na prévia.
- Melhora a Galeria de templates para ficar visualmente mais próxima da Galeria de mídia e compatível com temas escuros.
- Marca ferramentas de templates como recurso em fase de testes.
- Adiciona botão de Infobox na toolbar do editor Markdown.
- Adiciona remoção de usuários no painel administrativo, protegendo o super administrador e a própria conta.
- Adiciona a migration `0010_v1_0_4_template_gallery_users.sql` para normalizar templates antigos e registrar uma predefinição básica de infobox.

## v1.0.3 Beta 3

Beta 3 refaz o sistema de templates editoriais para ficar mais próximo de predefinições de wiki/MediaWiki, com chamadas `{{Template|param=valor}}`, renderização própria, parâmetros, imagem/ícone, posição visual e galeria de inserção no editor. O domínio público recomendado continua sendo `wiki.cambada.party`.

### Novidades

- Templates deixam de ser apenas blocos Markdown colados no artigo e passam a ter chamada, renderização e parâmetros separados.
- Renderizador aceita chamadas de template em linha única e em várias linhas, como `{{Múltiplos problemas ... }}`.
- Novo bloco interno `:::templatebox` para templates com título, subtítulo, corpo, rodapé, ícone, imagem lateral/topo, cor de destaque e modo compacto.
- Templates de manutenção padrão mais próximos de wikis: eliminação, múltiplos problemas, fontes não cobrem tudo, fundir com e esboço.
- A galeria de templates insere a chamada do template, não HTML/bloco cru.
- `/admin/templates` agora edita chamada, renderização, parâmetros, tipo visual, imagem padrão, posição da imagem e cor de destaque.
- Articles e pré-visualizações carregam a lista de templates ativos e expandem predefinições customizadas no navegador.
- Nova migration `0009_template_system_v2.sql` expande `content_templates` com renderização, parâmetros, tipo, imagem, posição e cor.

## v1.0.2 Beta 2

Beta 2 adiciona páginas de discussão, páginas de usuário e uma primeira versão da galeria/criador de templates editoriais. O domínio público recomendado agora é `wiki.cambada.party`.

### Novidades

- Páginas de discussão por artigo em `/talk/:slug` e `/discussao/:slug`, armazenadas como `discussao/:slug` no D1.
- Nova aba “Discussão” nas abas de namespace do artigo.
- Páginas de usuário em `/usuario/:nome`, armazenadas como `usuario/:nome` no D1 e editáveis como páginas normais.
- Links wiki `[[Usuário:Nome]]`, `[[Discussão:Artigo]]` e `[[Talk:Artigo]]` agora apontam para as rotas novas.
- Galeria de templates no editor Markdown, disponível para propostas públicas e para editores autenticados.
- Aba de mídia renomeada para “Galeria de mídia”.
- Novo painel `/admin/templates` para criar, editar, bloquear uso e deletar templates.
- Migration `0008_discussions_users_templates.sql` com a tabela `content_templates` e templates iniciais de manutenção, mídia, links e layout.
- Novo bloco Markdown `:::background` para seções com fundo em cor, gradiente e imagem segura.

## v1.0.1.1 Beta 1 Emergency Bugfix Update 1

Atualização emergencial da Beta 1 para corrigir slugs com acentos e URLs percent-encoded em artigos, propostas e ações administrativas.

### Correções urgentes

- Slugs de artigos agora são normalizados após decodificação segura, evitando páginas duplicadas como `c%c3%ba!!!` e `c%25c3%25ba!!!`.
- Leitura, edição, histórico, propostas, bloqueio, renomeação e exclusão procuram variantes antigas codificadas antes de desistir com “página não encontrada”.
- Novas revisões e propostas passam a gravar o slug canônico sem acento, mesmo quando a rota chega percent-encoded.
- URLs internas decodificam camadas antigas de `%25` antes de remontar links limpos.

### Destaques da Beta 1

- Layout mobile revisado para leitura, navegação, tabelas administrativas, editor e mídia.
- Configuração de tamanho do texto: pequeno, normal e grande.
- Cache leve no cliente para leituras públicas da API, com limpeza ao salvar, restaurar ou apagar conteúdo.
- Headers de segurança e cache aplicados pelo middleware de Pages Functions.
- Tratamento de erro JSON mais claro no cliente.
- Proteção contra edições quebradas: resumo obrigatório, tamanho máximo, blocos de código sem fechamento, blocos `:::` sem fechamento e links wiki incompletos.
- Links Markdown externos passam por validação de protocolo.
- Imagens renderizadas pelo Markdown usam carregamento preguiçoso quando aplicável.
- Painel `Atividade` ganhou botão para limpar registros recentes.


## 0.8.7 Final Alpha

Esta build fecha o ciclo Final Alpha com hierarquia interna, lixeira editorial, atividade recente e ações globais de atualização.

## 0.8.6-alpha.8

Esta build melhora o painel administrativo, o webhook de propostas e as preferências visuais.

Inclui:

- botão/link no webhook para abrir a proposta e o painel de propostas
- preferência de fonte em `Configurações`: MacType ou Clássico
- MacType como padrão, com stack inspirada em macOS/Mac OS X e suavização por CSS quando o navegador permite
- Clássico usando a renderização/fonte padrão do sistema
- validação de IPv4, IPv6 e CIDR no formulário de regras de IP
- validação equivalente no back-end antes de gravar regras de IP
- regras de IP agora aceitam faixas CIDR como `203.0.113.0/24` e `2001:db8::/32`
- checagem de bloqueio por IP agora compara endereços contra regras exatas e faixas CIDR

As rotas protegidas do Cloudflare Access continuam:

```txt
/edit/*
/admin/*
/api/secure/*
```

## Alpha 8 — administração inicial

Esta versão adiciona o painel inicial de administração em `/admin`, protegido pelas mesmas rotas do Cloudflare Access já usadas no projeto.

Inclui:

- bloquear e desbloquear páginas
- apagar páginas por exclusão suave
- renomear páginas e criar redirecionamento do slug antigo
- listar links internos quebrados
- listar redirecionamentos quebrados
- exportar backup JSON do D1
- importar seed/backup JSON criando novas revisões

O backup exporta conteúdo e metadados do D1. Os objetos do R2 não são embutidos no arquivo JSON; apenas os metadados registrados em `uploads` são incluídos.

As rotas protegidas do Cloudflare Access continuam:

```txt
/edit/*
/admin/*
/api/secure/*
```


## 0.7.9-alpha.7

- Corrige a abertura do visualizador de mídia em imagens e miniaturas vindas de `/api/files/:slug/content`.
- Troca a ativação do visualizador para um caminho mais direto por clique, teclado e fallback inline.
- Evita que o drag nativo da imagem engula o clique antes do visualizador abrir.



WikiCambada Core é a base técnica da WikiCambada, uma wiki em desenvolvimento para Cloudflare Pages, Pages Functions, D1, R2 e Cloudflare Access.

Esta build é a `0.7.0-alpha.7`.

## Estado desta build

Esta versão avança para o Alpha 7 com upload de imagens, armazenamento no R2, metadados no D1, páginas públicas de arquivo e inserção automática de imagem no editor Markdown.




### Implementado no Alpha 7

- upload de imagens no editor direto
- limite de upload de 50 MB por arquivo
- tipos permitidos: PNG, JPEG, WebP e GIF
- salvamento do arquivo no R2 pela binding `WIKI_BUCKET`
- registro de metadados no D1 pela tabela `uploads`
- página pública de arquivo em `/wiki/arquivo/:slug`
- conteúdo binário público por `/api/files/:slug/content`
- API pública de metadados por `/api/files/:slug`
- inserção automática de bloco `:::image` no Markdown do artigo após upload
- mensagens de erro para arquivo ausente, tipo inválido, limite excedido, R2 ausente ou D1 ausente
- migration `0005_uploads_metadata.sql` para slugs amigáveis de arquivo

### Implementado no Alpha 6

- categorias vindas do D1 pela API `/api/categories`
- páginas por categoria em `/wiki/categoria/:slug`
- página especial `/wiki/categorias`
- breadcrumbs simples em artigos e páginas de categoria
- categorias no rodapé do artigo apontando para páginas de categoria, não mais para busca
- sumário automático por headings Markdown (`##`, `###`, `####`)
- suporte a `__TOC__` para forçar sumário e `__NOTOC__` para ocultar
- âncoras automáticas para seções do artigo
- links internos `[[Categoria:Nome]]` apontando para a página da categoria
- templates básicos em Markdown, como `{{Artigo principal|Página}}`, `{{Ver também|Página}}`, `{{Nota|texto}}`, `{{Aviso|texto=...}}` e `{{Infobox|título=...}}`
- infobox simples via `:::infobox` e template `{{Infobox}}`

### Correções do Alpha 5.1

- campos de edição e sugestão agora ocupam a largura correta
- placeholders do editor ficaram mais legíveis
- seletor de tema em `Configurações` abaixo de `Navegação`
- tema automático seguindo o modo claro/escuro do navegador ou sistema
- tema `Branco`
- tema `Preto` com fundo base `#101418`
- tema `OLED` com fundo puro `#000000`
- preferência de tema salva localmente no navegador

### Implementado no Alpha 5

- busca real no D1 com FTS5 e fallback por LIKE
- página aleatória com base no D1
- páginas especiais `/wiki/todas-as-paginas` e `/wiki/paginas-recentes`
- redirects pela tabela `redirects`
- aliases de título pela tabela `page_aliases`
- campos de aliases e redirecionamentos no editor
- links inexistentes em vermelho considerando páginas, aliases e redirects

### Correções do Alpha 4.1

- a criação de revisões agora funciona mesmo quando o banco ainda não recebeu a migration `0003_revision_metadata.sql`
- o código detecta se a tabela `revisions` já possui `title`, `subtitle` e `categories_json`
- bancos antigos usam escrita compatível com o schema antigo em vez de quebrar com erro 500
- a API de salvamento agora devolve uma mensagem JSON mais clara quando uma falha interna realmente acontece

### Implementado no Alpha 4

- histórico por página em `/history/:slug`
- listagem de revisões com autor, data, resumo e marcação da versão atual
- visualização de revisão antiga por `/history/:slug?revision=<n>`
- comparação simples entre uma revisão antiga e a versão atual por `/history/:slug?compare=<n>`
- restauração de revisão antiga para e-mails autorizados pelo Cloudflare Access
- criação de nova revisão ao restaurar uma versão anterior
- metadados editoriais por revisão, incluindo título, subtítulo e categorias para revisões novas
- links internos inexistentes em vermelho, no estilo de wiki clássica
- suporte a links internos no formato `[[Artigo]]` e `[[Artigo|rótulo]]`
- remoção dos artigos JSON hardcodados como fallback de conteúdo
- D1 como fonte principal de páginas e revisões

### Mantido dos alphas anteriores

- leitura pública de artigos
- edição direta por e-mail autorizado pelo Cloudflare Access
- criação de páginas novas por `/edit/:slug`
- resumo de edição obrigatório
- autoria pelo e-mail do Cloudflare Access
- pré-visualização no editor direto
- propostas públicas de edição
- painel de propostas em `/admin/proposals`
- fallback de SPA para links compartilháveis em `/wiki/*`, `/edit/*`, `/history/*`, `/suggest/*`, `/admin/*` e `/search`

## Rotas principais

Leitura pública:

```txt
/
/wiki/:slug
/wiki/arquivo/:slug
/wiki/categorias
/wiki/categoria/:slug
/history/:slug
/history/:slug?revision=<n>
/history/:slug?compare=<n>
/search?q=termo
```

Edição autorizada:

```txt
/edit/:slug
/api/secure/pages/:slug/revisions
/api/secure/revisions/:slug
/api/secure/edit/:slug
/api/secure/admin/*
/api/secure/files
/api/secure/upload/*
```

Compatibilidade de API:

```txt
POST /api/pages/:slug/revisions
```

A rota compatível também exige Cloudflare Access no código. Em produção, o front-end usa a rota sob `/api/secure/*`, porque ela fica coberta pela política de Access sem gastar caminhos adicionais.

Propostas públicas:

```txt
/suggest/:slug
/api/proposals/:slug
```

## Cloudflare Access

Configure a aplicação do Cloudflare Access para proteger somente:

```txt
/edit/*
/admin/*
/api/secure/*
```

Não proteja:

```txt
/wiki/*
/history/*
/suggest/*
/api/pages/*
/api/revisions/*
/api/categories/*
/api/files/*
/api/proposals/*
/access-denied.html
/access-blocked.html
```

## Variáveis

As variáveis comuns ficam no `wrangler.toml`:

```toml
[vars]
ACCESS_TEAM_DOMAIN = "https://masondoceu.cloudflareaccess.com"
ACCESS_AUD = "4dc22569c0306be44d76040c0969519a2487867dcdd1152e1198103e09b66b10"
ACCESS_STRICT = "true"
PUBLIC_BASE_URL = "https://wiki.cambada.party"
```

O webhook do Discord deve ser salvo como secret do Pages:

```bat
npx wrangler pages secret put DISCORD_EDIT_WEBHOOK_URL --project-name wikicambada-core
```

## Banco de dados

As migrations ficam em:

```txt
src/data/migrations/
```

Aplicar no remoto:

```bat
npm run db:migrations:apply:remote
```

A migration nova do Alpha 4 é:

```txt
src/data/migrations/0003_revision_metadata.sql
```

Ela adiciona metadados por revisão. Aplique a migration antes de usar histórico avançado, visualização de revisão antiga e restauração.

## Observações

O D1 agora é a fonte principal de páginas. Os artigos JSON hardcodados foram removidos do pacote.

Revisões antigas criadas antes do Alpha 4 podem não ter título, subtítulo e categorias salvos na própria revisão. Nesses casos, o sistema usa os metadados atuais da página como fallback e preserva o conteúdo antigo da revisão.

A comparação de revisões ainda é simples e baseada em linhas. Um diff mais refinado pode entrar em alpha futura.

## Observação sobre migrations do Alpha 4

A migration `0003_revision_metadata.sql` continua recomendada para preservar título, subtítulo e categorias por revisão.

Se ela ainda não tiver sido aplicada, a edição não deve mais quebrar: o Core grava a revisão usando o schema antigo e usa os metadados atuais da página como fallback ao visualizar revisões antigas.

Depois que a migration for aplicada, revisões novas passam a gravar os metadados próprios da revisão.

## Alpha 5

Esta build avança o WikiCambada Core para o Alpha 5.

Entrou nesta etapa:

- busca real no D1 com FTS5 e fallback por `LIKE`
- `/wiki/pagina-aleatoria` usando página aleatória do D1 quando disponível
- página especial `/wiki/todas-as-paginas`
- página especial `/wiki/paginas-recentes`
- resolução de redirecionamentos pela tabela `redirects`
- aliases de título pela nova tabela `page_aliases`
- campos de aliases e redirecionamentos no editor direto
- links internos inexistentes continuam em vermelho, mas agora aliases e redirects contam como páginas conhecidas
- página inexistente mantém opção de criação para editor autenticado ou sugestão para visitante
- migration `0004_aliases.sql`

Depois de subir esta build, aplique as migrations no banco remoto:

```bat
npm run db:migrations:apply:remote
```

As rotas protegidas no Cloudflare Access continuam sendo apenas:

```txt
/edit/*
/admin/*
/api/secure/*
```

## Alpha 6

Esta build adiciona uma camada inicial de organização enciclopédica. As categorias passam a ter páginas próprias e são lidas diretamente do D1. O editor continua salvando categorias no campo existente, e a navegação por categoria usa a tabela `categories` com `page_categories`.

Exemplos de Markdown novo:

```md
## História

{{Artigo principal|Cambada}}

{{Ver também|WikiCambada Core|cambada.party}}

{{Nota|Esta página ainda está em organização editorial.}}

{{Aviso|título=Atenção|texto=Este conteúdo precisa de revisão futura.}}

:::infobox
title: Exemplo
tipo: artigo demonstrativo
estado: alpha
:::
```

O sumário aparece automaticamente quando a página tem pelo menos três headings. Use `__TOC__` para forçar o sumário ou `__NOTOC__` para ocultá-lo.

Não há migration nova no Alpha 6. As tabelas de categorias já existiam desde o schema inicial.


## Alpha 7

Esta build adiciona o primeiro fluxo completo de arquivos da WikiCambada Core. Editores autenticados pelo Cloudflare Access podem enviar imagens pelo editor Markdown. O arquivo é salvo no R2, os metadados são registrados no D1 e o editor insere automaticamente um bloco `:::thumb` no conteúdo do artigo.

Limites do Alpha 7:

```txt
tamanho máximo: 50 MB
tipos aceitos: PNG, JPEG, WebP e GIF
rota de upload: /api/secure/files
rota de metadados: /api/files/:slug
rota do arquivo: /api/files/:slug/content
página pública: /wiki/arquivo/:slug
```

Aplique as migrations depois de subir esta build:

```bat
npm run db:migrations:apply:remote
```

A migration nova é:

```txt
src/data/migrations/0005_uploads_metadata.sql
```

Ela adiciona `file_slug`, `description` e `updated_at` na tabela `uploads`. O código ainda tenta lidar com bancos antigos, mas a migration é recomendada para páginas de arquivo com URLs mais amigáveis.



## Alpha 7.5.1

Correções aplicadas após o Alpha 7.5:

- o visualizador de mídia fecha ao clicar/tocar na área escura fora da imagem, vídeo, rodapé ou barra superior
- imagens renderizadas por blocos, Markdown, infoboxes e páginas de arquivo recebem atributos de visualização de forma mais consistente
- imagens renderizadas pela WikiCambada não são mais arrastáveis por padrão, reduzindo cliques perdidos em alguns navegadores
- o botão **Mais detalhes** fica sempre disponível no visualizador; quando não há página de arquivo, ele abre o arquivo original em nova aba
- `/api/categories` também é tratado pelo catch-all de categorias, evitando `400 Bad Request` quando o Pages escolhe `[[slug]].ts` em vez de `index.ts`

## Alpha 7.5

Esta build adiciona o visualizador de mídia inspirado no fluxo clássico de arquivos da Wikipédia. Imagens de artigos, infocaixas e páginas de arquivo podem ser abertas em uma visualização escura, com legenda e botão “Mais detalhes” apontando para a página do arquivo quando houver metadados disponíveis.

Também foram ajustados os blocos `:::image` gerados pelo upload para que a legenda não vire link automaticamente. O link de detalhes agora é separado pelo campo `details`, mantendo a legenda como texto normal.

No editor, editores autenticados pelo Cloudflare Access também passam a ter um botão provisório de “Deletar página”. A exclusão é suave: a página muda para `status = deleted`, sai da busca, das categorias e dos redirects, mas o histórico de revisões permanece preservado no D1.

As rotas protegidas no Cloudflare Access continuam sendo:

```txt
/edit/*
/admin/*
/api/secure/*
```


## Alpha 7.5.2

Correções e melhorias aplicadas no visualizador e no fluxo de upload:

- o botão **Mais detalhes** prioriza a página pública do arquivo em `/wiki/arquivo/:slug`, mesmo quando a imagem veio de `/api/files/:slug/content`
- blocos `:::image` passaram a carregar dados de visualização também no `figure`, melhorando a abertura do visualizador em imagens que antes pareciam apenas arrastar
- o evento de arrastar imagens de mídia é bloqueado de forma centralizada no visualizador
- o upload agora insere o arquivo como miniatura estilo wiki usando `:::thumb`
- a página de arquivo também mostra o bloco `:::thumb` recomendado para uso em artigos

Exemplo gerado pelo upload:

```md
:::thumb
src: /api/files/exemplo/content
alt: exemplo.png
caption: descrição curta
details: /wiki/arquivo/exemplo
align: right
width: 260
:::
```


## Alpha 7.5.3

Esta build corrige a ativação do visualizador em mídias inseridas com `:::image` e `:::thumb`, especialmente quando o arquivo vem de `/api/files/:slug/content`. A abertura agora também tenta tratar clique/toque por `pointerup`, reduzindo casos em que o navegador interpreta a ação como arrasto da imagem.

Também foram adicionados:

- seletor de localização da miniatura no painel de upload: esquerda, centro ou direita
- campo de largura da miniatura no painel de upload
- barra compacta de ferramentas do editor Markdown
- botões para negrito, itálico, sublinhado, riscado, link, título, lista, miniatura, galeria, citação e caixa de aviso
- suporte ao bloco `:::gallery` para galerias em estilo wiki
- suporte inline a `*itálico*`, `__sublinhado__` e `~~riscado~~`

Exemplo de galeria:

```md
:::gallery
/api/files/arquivo-1/content | legenda da primeira imagem | /wiki/arquivo/arquivo-1
/api/files/arquivo-2/content | legenda da segunda imagem | /wiki/arquivo/arquivo-2
:::
```

### Alpha 8.1

- Corrige `/api/secure/admin/proposals?status=pending` quando o Pages Functions resolve a rota pelo catch-all opcional.
- Separa o painel administrativo em páginas próprias: `/admin/pages`, `/admin/maintenance`, `/admin/backup` e `/admin/proposals`.
- Mantém `/admin` como visão geral com links para as seções administrativas.

## Alpha 8.2 — correção do editor Markdown

- Corrige a área do editor que aplicava negrito ao clicar em espaços vazios da barra de ferramentas, removendo a barra e o textarea de dentro de um `label` único
- A barra de ferramentas agora só executa ações quando o clique vem de um botão real de ferramenta
- A área principal de Markdown ganhou altura padrão maior no desktop e no mobile

## Alpha 8.3 — Markdown e biblioteca de mídia

- Adiciona botões no editor para tabela, bloco de código, código inline, lista não ordenada, lista ordenada e blockquote.
- Mantém suporte de renderização para tabelas Markdown, blocos cercados por crases, código inline, listas e citações com `>`.
- Melhora o tratamento de código inline para evitar que formatação interna seja interpretada como Markdown comum.
- Adiciona uma área de mídia com abas para enviar imagem nova ou inserir imagens já enviadas.
- Adiciona listagem pesquisável de arquivos enviados pelo D1/R2 em `/api/secure/files`.
- Permite inserir arquivo existente como `:::thumb`, `:::image` ou item de `:::gallery`, com alinhamento e largura configuráveis para miniaturas.

Não há migration nova. A listagem de mídia usa a tabela `uploads` criada no Alpha 7.

## Alpha 8.4

- Corrige URLs internas com caracteres acentuados para não ficarem presas em formato percent-encoded ao navegar pelo SPA.
- Adiciona `/admin/storage` para gerenciamento inicial de metadados D1, arquivos registrados e objetos R2 listados.
- Adiciona `/admin/ip` para regras administrativas de IP.
- Adiciona a migration `0006_admin_ip_rules.sql` com a tabela `ip_rules`.
- Bloqueio de sugestões públicas por IP é aplicado em `/api/proposals/*`.
- Bloqueio público de site por IP é aplicado por middleware, preservando `/admin` e `/api/secure` para evitar travamento administrativo acidental.


## Alpha 8.5 — propostas com IP e tabelas administrativas

Esta build adiciona o endereço IP registrado nas propostas públicas de edição, incluindo exibição no painel de propostas e no webhook do Discord. O painel de propostas também ganhou ações rápidas para criar regras de IP a partir do endereço informado.

O painel administrativo agora usa tabelas com paginação client-side e ordenação por coluna. As seções de páginas, manutenção, armazenamento, propostas e endereços IP permitem alternar entre 10, 25, 50 e 100 itens por página. A página administrativa de páginas também ganhou ação direta de edição por artigo.

Não há migration nova nesta build. A tabela `edit_proposals` já possuía os campos `reporter_ip` e `user_agent` desde `0002_edit_proposals.sql`.

## v0.8.7 Final Alpha

Esta build adiciona a base de hierarquia editorial e administração final do ciclo Alpha 8.

### Hierarquia interna

O Cloudflare Access continua sendo o login. Qualquer e-mail autorizado pelo Access é cadastrado automaticamente como `editor` no D1. O e-mail `mason@national.shitposting.agency` é tratado como `super_admin` fixo.

Cargos internos:

- `editor`: edição direta e revisão de propostas
- `moderator`: moderação, regras de IP, lixeira e atividade recente
- `admin`: administração de páginas, usuários, backup e remoção definitiva
- `super_admin`: acesso total, cargo fixo

### Lixeira dos editores

Páginas e mídias removidas são enviadas para `/admin/trash`. Elas ficam disponíveis para restauração por 30 dias. A remoção definitiva pode ser feita manualmente no painel, e itens expirados são limpos de forma oportunista ao abrir/acionar a lixeira.

### Sistema

`/admin/system` inclui:

- Forçar atualização de cache local (rápido)
- Forçar recarregar usuários conectados (completo)

Os clientes verificam a versão de sistema periodicamente em `/api/system/status`.

### Atividade recente

`/admin/activity` lista os últimos usuários, IPs e caminhos vistos. Esta tela não é presença em tempo real; presença em tempo real fica para uma release futura.

### Propostas

Ao aprovar uma proposta, o revisor pode escolher o crédito do sugestor:

- contato, se informado
- endereço IP
- anônimo

O autor da revisão fica no formato `Editor (Sugerido por contato)`.

### Migration nova

Rode depois de subir a build:

```bat
npm run db:migrations:apply:remote
```

A migration nova é:

```txt
src/data/migrations/0007_final_alpha_admin.sql
```
