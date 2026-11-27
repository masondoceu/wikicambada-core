# Changelog do WikiCambada Core

## v1.1.1-indev.2 · Everywhere

- Standardize technical diagnostics and test descriptions in English.
- Localize setup and wiki errors independently while retaining existing API responses for legacy clients.
- Preserve the hybrid renderer, both interface languages and database schema 17.

## v1.1.1-indev.1 · Everywhere

- Server-render public reading routes and enhance the initial HTML with the existing SPA.
- Share editorial rendering between Cloudflare Pages Functions and the browser.
- Add page-specific metadata, a dynamic sitemap, and configurable crawler directives.
- Preserve database schema 17. This is a development build.

## v1.1.0-r2

Revisão corretiva da série v1.1.0, com foco na separação entre o Core distribuível e a instalação WikiCambada, segurança do setup e consistência da interface configurável.

### Correções

- remove rotas iniciais, guia de edição, identidade, navegação, bindings, e-mails e assets específicos da instalação WikiCambada
- remove o codinome interno da documentação pública e sincroniza a versão `v1.1.0-r2` entre runtime, setup, pacote, instalação e release
- faz o frontend carregar a versão pelo manifesto da release em vez de manter uma cópia fixa
- aplica `homeSlug`, `aboutSlug` e `editGuideSlug` configurados ao shell e às páginas estáticas
- substitui a troca textual frágil das páginas estáticas por campos de configuração e chaves de interface
- adiciona localização em português brasileiro e inglês ao shell, às páginas estáticas e às principais páginas públicas geradas pelo Core
- impede injeção de TOML e de comandos nos nomes de projeto, D1 e R2 gerados pelo setup
- valida URLs, e-mails, slugs, navegação, temas, fontes, branding e limites dos arquivos enviados ao setup
- restringe uploads de branding a formatos raster seguros e rejeita URLs com credenciais embutidas
- protege o servidor local do setup contra origens externas, tipos de conteúdo inesperados e requisições excessivas
- reforça a atualização por ZIP contra travessia de diretórios, links simbólicos, arquivos especiais, pacotes excessivos e arquivos omitidos do manifesto
- preserva assets locais referenciados pela configuração, inclusive quando o novo pacote contém o mesmo caminho
- desativa escrita pelas rotas legadas de upload e mantém leitura compatível somente no prefixo `uploads/`
- compensa falhas D1/R2 sem remover objetos cujo registro já tenha sido persistido e mantém uma fila recuperável de exclusões
- corrige o limite do formulário de upload para considerar o overhead multipart sem elevar o limite do arquivo
- remove handlers inline duplicados do visualizador de mídia
- amplia a verificação do projeto com lockfile, bindings, configuração e hashes dos arquivos do Core
- fixa a versão do Wrangler e registra o requisito real de Node.js 22

### Estabilização

- publica apenas os assets preparados em `.wikicambada/public`, com configuração pública limitada a campos conhecidos
- fecha autorização sob falhas de perfil/bindings, preserva contas desativadas e valida assinatura e claims do JWT
- restringe autenticação permissiva ao desenvolvimento explicitamente configurado em loopback
- protege operações contra CSRF, limita propostas públicas e confere assinaturas dos formatos de upload
- remove dados privados desnecessários das respostas públicas e aplica disponibilidade também às rotas de compatibilidade
- grava páginas, revisões, categorias, aliases, redirecionamentos, busca e aprovação em batches atômicos do D1
- exige revisão-base na edição, restauração e aprovação, com recusa de conflitos no servidor
- preserva metadados históricos vazios e categorias existentes quando seu recurso está desativado
- adiciona recuperação integral de D1/R2, com manifesto, validação prévia, bloqueio de escrita, transferência paginada, retomada e abortamento
- reforça atualização, configuração e recuperação locais com exclusão mútua, journals e detecção antecipada de conflitos
- separa distribuição genérica dos assets da instalação, compara revisões de versão e permite fixar um hash confiável do ZIP
- pagina páginas, busca, histórico, arquivos e objetos R2 e calcula totais completos
- corrige links internos com fragmentos, slugs, entidades e parâmetros de query
- aplica tema inicial, logo escuro, templates e modo privado, e localiza componentes editoriais, históricos e administrativos
- distingue erros de API de resultados vazios e mantém propostas/rascunhos até confirmação de persistência
- migra o setup e seus testes de Python para Node.js, preservando formatos de configuração, pacotes, journals e recuperação
- adiciona lançadores Windows/Unix/macOS, encerramento seguro pelo botão Fechar e acompanhamento das abas conectadas
- cria páginas iniciais idempotentes nas novas instalações e permite administração local com `DEV_BYPASS_AUTH` e prova do servidor de desenvolvimento
- simplifica as informações públicas de versão
- adiciona testes de runtime e integração, validação TypeScript e verificação local das Functions/migrations

Adiciona `0016_v1_1_0_write_guards.sql` e `0017_v1_1_0_recovery.sql`. O schema exigido passa a 17. As migrations anteriores permanecem intactas. A compatibilidade final com a instalação `1.0.13` ainda depende de um snapshot representativo.

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
- reorganiza a documentação do projeto em `README.md` e `CHANGELOG.MD`

---

# Changelog de versões pre-release do WikiCambada Core

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

Beta 3 refaz o sistema de templates editoriais para ficar mais próximo de predefinições de wiki/MediaWiki, com chamadas `{{Template|param=valor}}`, renderização própria, parâmetros, imagem/ícone, posição visual e galeria de inserção no editor. O domínio público usado nos exemplos é `wiki.example.com`.

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

Beta 2 adiciona páginas de discussão, páginas de usuário e uma primeira versão da galeria/criador de templates editoriais. O domínio público usado nos exemplos é `wiki.example.com`.

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
