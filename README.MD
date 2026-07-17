<p align="center">
  <img src="src/media/images/core/wikicambada-core-readme.png" alt="WikiCambada Core" width="960" />
</p>

# WikiCambada Core

**WikiCambada Core** é um motor de wiki serverless feito para o ecossistema Cloudflare. Ele combina uma aplicação web estática com Pages Functions, D1, R2 e Cloudflare Access para oferecer artigos em Markdown, revisões, administração, mídia, busca, categorias, templates e colaboração sem manter um servidor tradicional.

A partir da versão **v1.1.0 Beta**, o Core deixa de assumir que toda instalação é a WikiCambada. Nome, identidade visual, fontes, navegação, recursos, acesso e bindings podem ser configurados pelo setup local. A WikiCambada continua sendo uma instalação do mesmo Core, enquanto outras wikis — como documentação de software — podem ter aparência e comportamento completamente diferentes.

> “WikiCambada Core Everywhere” é apenas o codename interno desta fase de generalização. O nome público do software continua sendo **WikiCambada Core**.

## Índice

- [Para que serve](#para-que-serve)
- [Como funciona](#como-funciona)
- [O que ele é](#o-que-ele-é)
- [O que ele não é](#o-que-ele-não-é)
- [Recursos](#recursos)
- [Arquitetura](#arquitetura)
- [Requisitos](#requisitos)
- [Implementação rápida](#implementação-rápida)
- [Setup gráfico](#setup-gráfico)
- [Configuração e presets](#configuração-e-presets)
- [Cloudflare](#cloudflare)
- [Atualizações](#atualizações)
- [Configurações globais](#configurações-globais)
- [Páginas especiais](#páginas-especiais)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Segurança](#segurança)
- [Desenvolvimento](#desenvolvimento)
- [Créditos](#créditos)
- [Licença e direitos autorais](#licença-e-direitos-autorais)

## Para que serve

O WikiCambada Core pode ser usado como base para:

- wikis comunitárias
- documentação de software e APIs
- enciclopédias independentes
- bases de conhecimento privadas
- documentação interna protegida por Cloudflare Access
- projetos editoriais com histórico, revisão e mídia

Cada instalação mantém seus próprios dados, configuração, identidade visual, D1 e R2.

## Como funciona

O frontend é servido pelo Cloudflare Pages. Rotas dinâmicas e APIs são executadas por Pages Functions. O conteúdo editorial fica no D1, enquanto imagens, vídeos e áudios ficam no R2. O Cloudflare Access autentica editores, moderadores e administradores; o Core mantém os cargos internos e as permissões editoriais.

```text
navegador
   │
   ├── Cloudflare Pages ── frontend, estilos e configuração pública
   │
   ├── Pages Functions ── APIs, rotas, validações e administração
   │       ├── D1 ── páginas, revisões, usuários, propostas e metadados
   │       └── R2 ── imagens, vídeos e áudios
   │
   └── Cloudflare Access ── autenticação de editores
```

## O que ele é

- um motor de wiki orientado a Cloudflare
- uma aplicação serverless sem servidor persistente próprio
- um editor Markdown com recursos de wiki
- uma base implementável e configurável
- um projeto que pode ser atualizado sem sobrescrever a identidade da instalação
- software livre distribuído sob GNU AGPL v3

## O que ele não é

- não é um fork do MediaWiki
- não usa PHP nem depende de um servidor LAMP
- não pretende reproduzir toda a compatibilidade de extensões, skins e wikitext do MediaWiki
- não é um CMS genérico para qualquer tipo de site
- não transforma o D1 em armazenamento de arquivos grandes
- não substitui automaticamente políticas, backups e controles da conta Cloudflare

## Recursos

### Conteúdo e edição

- artigos em Markdown
- revisões com resumo obrigatório
- histórico e comparação de versões
- restauração de revisões
- detecção de conflito de edição
- rascunhos locais no navegador
- aliases e redirecionamentos com fragmentos de seção
- páginas de discussão e páginas de usuário
- propostas públicas de edição

### Organização

- categorias
- busca com ranking e autocomplete
- links internos estilo wiki
- índice manual com `__TOC__`
- breadcrumbs
- páginas recentes, todas as páginas e página aleatória
- namespace `Especial` para recursos gerados pelo Core

### Markdown e mídia

- infoboxes
- templates editoriais configuráveis
- caixas de aviso e componentes `:::`
- tabelas, listas, citações e blocos de código
- upload de imagens, vídeos e áudios
- armazenamento no R2
- páginas de arquivo
- galeria e visualizador de mídia

### Administração

- cargos `editor`, `moderator`, `admin` e `super_admin`
- painel administrativo separado por seções
- bloqueio, renomeação e exclusão suave de páginas
- lixeira com restauração e remoção definitiva
- gerenciamento de mídia e armazenamento
- regras de IP e CIDR
- atividade recente
- backup e importação de seed JSON
- gerenciamento de templates
- configurações globais de recursos

### Aparência

- tema automático, branco, preto e OLED
- tamanho de texto
- renderização de fonte MacType ou clássica
- nome, slogan, logos, favicon, cores e fontes por instalação
- navegação e links externos configuráveis

## Arquitetura

O Core separa três tipos de estado:

1. **Código do Core**: funções, renderizadores, rotas, estilos e migrations
2. **Configuração da instalação**: identidade, branding, recursos, navegação, acesso e Cloudflare
3. **Dados da wiki**: páginas, revisões, usuários, propostas, templates e mídia

Os principais arquivos de instalação são:

```text
/src/config/site.json
/src/config/installation.json
/.wikicambada/state.json
```

`site.json` define a wiki. `installation.json` registra versão, schema e canal de atualização. `.wikicambada/` guarda estado local, manifests e backups do setup.

## Requisitos

- Python 3.11 ou superior para o setup local
- Node.js 20 ou superior
- Wrangler 4 ou superior
- conta Cloudflare
- Cloudflare Pages
- banco D1
- bucket R2 para mídia
- Cloudflare Access para edição autenticada

## Implementação rápida

Extraia o pacote, entre na pasta raiz e execute:

```bash
python3 setup.py
```

No Windows:

```powershell
py setup.py
```

O setup abre uma interface local em `127.0.0.1`. Ele não publica uma rota de instalação na wiki.

Depois da configuração:

```bash
npm install
npm run db:migrations:apply:remote
npm run deploy
```

Antes do primeiro deploy, configure no `wrangler.toml`:

- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`
- `database_id`
- `preview_database_id`

Secrets, como webhook do Discord, devem ser configurados pelo Wrangler ou pelo painel da Cloudflare e não gravados em `site.json`.

## Setup gráfico

O setup possui quatro modos principais:

- **Criar uma nova wiki**, partindo de uma configuração genérica
- **Reconfigurar esta wiki**, preservando a instalação existente
- **Atualizar o WikiCambada Core** por pacote ZIP
- **Verificar a instalação**

A interface suporta inicialmente:

- `pt-BR — Português (Brasil)`
- `en — English`

O idioma do instalador e o idioma padrão da wiki são escolhas independentes. Esta primeira beta já oferece o setup completo nos dois idiomas e cria metadados e navegação inicial em português brasileiro ou inglês. A tradução integral de todas as telas antigas do frontend ainda será ampliada nas próximas versões.

## Configuração e presets

Os presets são pontos de partida, não distribuições diferentes do código:

- documentação de software
- wiki comunitária
- enciclopédia
- base de conhecimento privada
- instalação mínima
- personalizada

O preset aplica recursos iniciais. Depois, o administrador pode ajustar opções globais sem reinstalar o Core. O setup também edita os links das áreas principal, comunidade e externa usando linhas no formato `Nome | URL`.

## Cloudflare

O arquivo `wrangler.toml` contém bindings e variáveis públicas da instalação. O setup preserva IDs existentes quando reconfigura o projeto.

Bindings esperados:

```toml
[[d1_databases]]
binding = "DB"

[[r2_buckets]]
binding = "WIKI_BUCKET"
```

Variáveis relevantes:

```toml
WIKI_SITE_NAME = "Minha Wiki"
WIKI_SUPER_ADMIN_EMAIL = "admin@example.com"
WIKI_CORE_VERSION = "v1.1.0 Beta"
PUBLIC_BASE_URL = "https://wiki.example.com"
```

## Atualizações

A experiência de atualização fica no próprio setup, mas usa um módulo separado. Isso permite reutilizar o mesmo motor no modo gráfico, em linha de comando e futuramente em automações.

Na v1.1.0 Beta, o setup aceita pacote ZIP local e:

1. valida a estrutura e os hashes do manifesto da release
2. detecta arquivos do Core modificados localmente
3. cria backup em `.wikicambada/backups/`
4. aplica os arquivos do Core
5. preserva configuração, branding, fontes, `.dev.vars` e `wrangler.toml`
6. preserva os comandos específicos da instalação no `package.json`
7. atualiza os schemas registrados e verifica o projeto
8. restaura o backup automaticamente se a atualização local falhar

Migrations do D1 continuam sendo uma etapa explícita. Rollback de arquivos não implica rollback automático do banco.

## Configurações globais

Administradores e o super administrador podem abrir:

```text
/admin/settings
```

As opções são armazenadas no D1 e controlam recursos para todos os usuários, incluindo:

- páginas especiais
- busca
- discussões
- páginas de usuário
- sugestões públicas
- histórico
- uploads
- templates
- categorias
- página aleatória
- selo Powered by WikiCambada Core
- atividade recente

A migration necessária é:

```text
src/data/migrations/0015_v1_1_0_global_settings.sql
```

## Páginas especiais

O namespace canônico é:

```text
/wiki/especial
```

Páginas iniciais:

```text
/wiki/especial/todas-as-paginas
/wiki/especial/paginas-recentes
/wiki/especial/categorias
/wiki/especial/pagina-aleatoria
/wiki/especial/versao
```

Aliases antigos e equivalentes em inglês continuam aceitos. Páginas especiais geradas pelo Core não podem ser editadas, sugeridas nem receber histórico editorial comum.

## Estrutura do projeto

```text
/
├── setup.py
├── index.html
├── package.json
├── wrangler.toml
├── functions/
├── src/
│   ├── config/
│   ├── data/
│   ├── media/
│   ├── scripts/
│   ├── setup/
│   └── styles/
└── .wikicambada/
```

Entrypoints ficam na raiz. Código e recursos ficam em `/src/`. Dados e migrations ficam em `/src/data/`. Pages Functions permanecem em `/functions/` por exigência da plataforma.

## Segurança

- mantenha `ACCESS_STRICT = "true"` em produção
- proteja `/edit/*`, `/admin/*` e `/api/secure/*` pelo Cloudflare Access
- não coloque secrets em arquivos públicos
- faça backup do D1 antes de migrations destrutivas
- revise regras de IP e permissões de cargos
- mantenha o Core e o Wrangler atualizados
- verifique alterações locais antes de substituir arquivos do Core

## Desenvolvimento

Servidor local do Pages:

```bash
npm run dev
```

Verificação do projeto:

```bash
python3 setup.py verify
```

As migrations ficam em `src/data/migrations/`. O histórico de versões está em [CHANGELOG.MD](CHANGELOG.MD).

## Créditos

WikiCambada Core foi criado e é mantido por **masondoceu**. O projeto nasceu como base técnica da WikiCambada e evoluiu para um motor implementável em outras wikis.

A experiência do setup usa o instalador do MediaWiki como referência de fluxo e separação de etapas, sem reutilizar seu código PHP nem se apresentar como uma implementação do MediaWiki.

O ícone oficial do WikiCambada Core continua sendo o **Cat Guard**.

## Licença e direitos autorais

O código é distribuído sob a **GNU Affero General Public License, versão 3**. Consulte [LICENSE](LICENSE) para os termos completos.

A AGPL exige, entre outras condições, que usuários de uma versão modificada disponibilizada por rede possam obter o código-fonte correspondente dessa versão.

A licença do código não transfere automaticamente direitos sobre nomes, logos, imagens, artigos, uploads ou outros conteúdos pertencentes a cada instalação. Operadores devem verificar separadamente as permissões dos assets e conteúdos que utilizarem.

Copyright © 2026 masondoceu e contribuidores do WikiCambada Core.
