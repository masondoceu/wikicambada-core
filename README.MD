<p align="center">
  <img src="src/media/images/core/wikicambada-core-readme.png" alt="WikiCambada Core" width="960" />
</p>

# WikiCambada Core

**WikiCambada Core** é um motor de wiki serverless feito para o ecossistema Cloudflare. Ele combina uma aplicação web estática com Pages Functions, D1, R2 e Cloudflare Access para oferecer artigos em Markdown, revisões, administração, mídia, busca, categorias, templates e colaboração sem manter um servidor tradicional.

A partir da versão **v1.1.0-r2**, o Core não assume que toda instalação é a WikiCambada. Nome, identidade visual, fontes, navegação, recursos, acesso e bindings podem ser configurados pelo setup local. A WikiCambada é uma instalação do mesmo Core, enquanto outras wikis — como documentação de software — podem ter aparência e comportamento independentes.

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
- [Recuperação](#recuperação)
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
- exportação de conteúdo e importação de seed JSON
- backup integral de D1/R2 e restauração retomável
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

`site.json` define a wiki. O checkout e o ZIP começam com a mesma configuração genérica, sem IDs do D1, credenciais do Access ou identidade de uma instalação. `installation.json` registra a versão e o schema exigido pela distribuição. O schema aplicado fica desconhecido até ser verificado no banco. A pasta `.wikicambada/` guarda estado local, arquivos de build e backups e fica fora do Git.

## Requisitos

- Node.js 22.13 ou superior
- Wrangler 4 ou superior
- conta Cloudflare
- Cloudflare Pages
- banco D1
- bucket R2 para mídia
- Cloudflare Access para edição autenticada

## Implementação rápida

Extraia o pacote, entre na pasta raiz e execute:

```bash
node setup.js
```

No Windows, abra `setup.cmd` por duplo clique. Em Linux/Unix, execute `./setup.sh`; no macOS, abra `setup.command`. Os lançadores usam o mesmo `setup.js`, independentemente do diretório atual. O setup já inclui suas bibliotecas e não exige `npm install` para abrir.

O setup abre uma interface local em `127.0.0.1`. O botão **Fechar** encerra o servidor; fechar a última aba também o encerra após 25 segundos, aguardando operações críticas. Se o navegador não abrir, acesse a URL mostrada no terminal. Use `node setup.js --no-browser` para abertura manual. Ele não publica uma rota de instalação na wiki.

Novas instalações recebem uma página principal e um guia inicial no idioma selecionado, gravados como páginas e revisões normais na primeira requisição após aplicar as migrations. O seed é idempotente, não sobrescreve wikis com páginas e não recria conteúdo removido. Reconfigurar uma instalação existente não ativa o seed.

Depois da configuração:

```bash
npm ci
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

O setup possui cinco modos principais:

- **Criar uma nova wiki**, partindo de uma configuração genérica
- **Reconfigurar esta wiki**, preservando a instalação existente
- **Atualizar o WikiCambada Core** por pacote ZIP
- **Verificar a instalação**
- **Migrar uma wiki legada** para uma pasta nova

A interface do setup suporta:

- `pt-BR — Português (Brasil)`
- `en — English`

O idioma do instalador e o idioma da wiki são escolhas independentes. O setup, a navegação principal, as páginas estáticas de erro e as páginas públicas geradas pelo Core possuem textos em português brasileiro e inglês. O conteúdo editorial continua sendo definido por cada instalação.

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
WIKI_CORE_VERSION = "v1.1.0-r2"
PUBLIC_BASE_URL = "https://wiki.example.com"
```

## Atualizações

A experiência de atualização fica no próprio setup, mas usa um módulo separado. Isso permite reutilizar o mesmo motor no modo gráfico, em linha de comando e futuramente em automações.

Na v1.1.0-r2, o setup aceita pacote ZIP local e:

1. valida a estrutura e os hashes do manifesto da release
2. detecta arquivos do Core modificados localmente
3. cria backup em `.wikicambada/backups/`
4. aplica os arquivos do Core
5. preserva configuração, branding, fontes, assets locais referenciados, `.dev.vars` e `wrangler.toml`
6. preserva os comandos específicos da instalação no `package.json`
7. registra o schema exigido pela distribuição e verifica o projeto
8. restaura o backup automaticamente se a atualização local falhar

O pacote é rejeitado quando contém caminhos inseguros, arquivos não registrados no manifesto, hashes divergentes, tipos especiais, conteúdo extraído acima do limite ou uma versão-base anterior à instalação atual.

Migrations do D1 continuam sendo uma etapa explícita. Rollback de arquivos não implica rollback automático do banco.

Arquivos personalizados referenciados pela instalação são preservados mesmo quando o ZIP contém o mesmo caminho. Arquivos adicionais da instalação não são removidos. Conflitos com arquivos do Core são detectados antes da aplicação. `1.1.0-r1`, `1.1.0-r2`, betas e versões estáveis possuem ordenação própria; downgrades são recusados.

As operações locais usam exclusão mútua e um registro de recuperação. Depois de uma interrupção, execute `node setup.js recover-local` antes de configurar ou atualizar novamente. A recuperação guarda o estado atual antes de restaurar o backup anterior.

Para gerar uma distribuição genérica, use `node setup.js package --output wikicambada-core-1.1.0-r2.zip`. O destino deve ser novo. O pacote inclui apenas o Core, configurações genéricas, migrations, testes e licença; não inclui os bindings, branding ou estado local da wiki. A verificação usa o mesmo mecanismo do atualizador. Os lançadores Unix recebem permissão de execução no ZIP. As bibliotecas TOML e ZIP estão incluídas em `src/setup/vendor.cjs`; ao alterá-las, regenere o bundle com `node src/scripts/build-setup-vendor.mjs`.

Os hashes do manifesto verificam integridade, mas não autenticam o autor. A API local de atualização aceita `expectedSha256` para conferir um hash do ZIP obtido por um canal confiável. O projeto ainda não define uma infraestrutura de assinatura de releases.

O atualizador exige uma distribuição com manifestos. Use **Migrar uma wiki legada** quando a origem for uma instalação `1.0.13` anterior aos manifestos.

## Migração da 1.0.13

No setup, indique uma pasta de origem ou selecione um ZIP da instalação. Use como destino uma pasta nova cujo diretório pai já exista. Em linha de comando:

```bash
node setup.js migrate-legacy --source /caminho/origem --output /caminho/wiki-migrada
```

A migração identifica a versão pelo pacote, pelo frontend, pelo Wrangler e pelo inventário das 14 migrations. A variante legada da migration 0009 é aceita pelo hash conhecido. A diferença é o texto inicial de um template, que permanece no banco existente. O Core usa os próprios scripts e lockfile, converte a identidade e a navegação e mantém as referências a D1, R2 e Access. O código legado e as configurações originais ficam em `.wikicambada/backups/legacy-1.0.13`. Revise os arquivos apontados pelo setup, incluindo código modificado e arquivos guardados apenas no backup. Configurações Wrangler com ambientes ou build próprio exigem revisão antes da migração.

O destino fica disponível depois da validação do Core e do build público. Uma falha anterior a essa etapa permite repetir a operação. Após encerramento forçado do processo, uma pasta temporária `legacy-migration-*` pode permanecer no `.wikicambada` do diretório pai. Ela pode ser removida com o setup fechado. Proteja essa pasta e o backup, que podem conter configuração privada. Estado local existente em `.wrangler/state` fica no backup para reutilização deliberada com o runtime compatível.

O setup registra o schema do destino como não verificado. Antes de publicar, faça backup integral de D1 e R2 e homologue com cópias privadas. Confira se o banco tem o schema da 1.0.13 e as migrations 0001–0014 registradas em `d1_migrations`. Com esse registro confirmado, o Wrangler aplica 0015–0017 na etapa explícita de atualização do banco. Se o registro ou o schema divergir, investigue antes de executar o Wrangler. Verifique leitura, edição, permissões, histórico, arquivos e integrações na instalação homologada. Clientes de escrita devem usar os contratos atuais de revisão-base, proteção de origem e upload autenticado.

## Recuperação

A exportação JSON de `/admin/backup` continua sendo uma ferramenta de conteúdo e seed. Ela não restaura uma instalação nem substitui um backup integral.

O formato de recuperação usa um diretório com `database.sqlite`, objetos separados em `objects/`, inventário `objects.jsonl` e manifesto SHA-256. O banco preserva todo o histórico, usuários e estados, propostas, regras de IP, templates, configurações globais e metadados de mídia. Os objetos R2 mantêm conteúdo e metadados HTTP/customizados.

O cliente remoto exige um JWT válido do Cloudflare Access pertencente ao super administrador configurado. O arquivo do token deve conter apenas o JWT. Os comandos abaixo são exemplos para uma instalação sob controle do operador:

```bash
node setup.js backup --url https://wiki.example.com --token-file access.jwt --output backup-wiki
node setup.js restore --url https://destino.example.com --token-file access.jwt --archive backup-wiki
```

O backup também copia a configuração e os recursos locais dessa instalação. `--configuration` permite indicar outro diretório de configuração. Esses arquivos ficam em `configuration/` no arquivo de recuperação; sua aplicação no checkout de destino é uma etapa local, mantendo os bindings e secrets adequados ao destino. A API não altera a infraestrutura Cloudflare nem suas políticas do Access.

A operação fecha temporariamente a wiki e bloqueia gravações no banco. A restauração exige um destino vazio, com as migrations desta versão aplicadas, e valida o arquivo inteiro antes de começar. Transferências usam blocos e objetos separados, sem concentrar a wiki em um único JSON. A abertura do destino só ocorre depois da conferência de contagens, referências e mídia.

Se a restauração for interrompida, mantenha o arquivo de estado local e execute o mesmo comando com `--resume`. Enquanto estiver incompleta, a wiki permanece fechada. `node setup.js abort-recovery --url https://destino.example.com --token-file access.jwt` remove os dados transferidos pela operação e libera o destino. O bloqueio não expira automaticamente. Se uma conexão cair durante a finalização, confira o estado na API antes de remover o arquivo local; a ausência de bloqueio, sozinha, não comprova uma restauração.

Para bancos SQLite e objetos já disponíveis localmente:

```bash
node setup.js backup-local --database origem.sqlite --objects objetos --configuration configuracao --output backup-local
node setup.js restore-local --archive backup-local --output destino-novo
```

A restauração local prepara e confere um diretório temporário antes de publicá-lo como destino. Arquivos ausentes, hashes divergentes, schema incompatível e destinos existentes são recusados. As chaves dos objetos devem ser representáveis no sistema de arquivos do arquivo de recuperação; nomes reservados e colisões de caixa são recusados. O formato ainda precisa ser confrontado com as chaves reais da instalação `1.0.13`.

O backup contém dados privados e pode conter secrets locais. Ele deve ser armazenado com as mesmas restrições de acesso da instalação.

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
├── setup.js
├── setup.cmd
├── setup.sh
├── setup.command
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

- mantenha `ACCESS_STRICT = "true"` em produção e configure issuer/audience do Access
- proteja `/edit/*`, `/admin/*` e `/api/secure/*` pelo Cloudflare Access
- não coloque secrets em arquivos públicos
- faça backup do D1 antes de migrations destrutivas
- revise regras de IP e permissões de cargos
- mantenha o Core e o Wrangler atualizados
- verifique alterações locais antes de substituir arquivos do Core

`access.mode` gera `WIKI_ACCESS_MODE`: `public` e `cloudflare-access` mantêm leitura pública e edição autenticada; `private` exige identidade verificada e perfil ativo também na leitura. Em uma wiki privada, proteja o host inteiro pelo Cloudflare Access. Os modos existentes de leitura pública continuam sujeitos às permissões internas do Core para edição e administração.

Para administrar localmente sem Cloudflare Access, defina `DEV_BYPASS_AUTH=true` em `.dev.vars` e inicie com `npm run dev`. O servidor de desenvolvimento escuta somente em loopback e fornece a identidade local de super administrador por uma prova temporária gerada no servidor. A flag isolada, headers de identidade e execução em um endereço público não ativam o bypass. Não publique a configuração de desenvolvimento. O modo legado `WIKI_DEV_AUTH` continua exigindo `ACCESS_STRICT="false"` e loopback.

Operações de escrita das APIs exigem `X-Wiki-Request: 1`; origens diferentes e `Sec-Fetch-Site: cross-site` são recusadas. Revisões, restaurações de revisão e aprovação de propostas exigem `expectedRevisionId` (`null` apenas para uma página nova). A ausência retorna HTTP 428; uma base obsoleta retorna 409. A resolução de conflitos preserva o conteúdo local até a decisão do editor.

O Pages publica exclusivamente `.wikicambada/public`, preparado por `npm run build`. Os scripts de desenvolvimento e publicação executam esse preparo. O builder copia uma lista explícita de HTML, JS, CSS e dados públicos, além dos formatos de mídia/fontes permitidos. `.dev.vars`, estado, backups, instalador, migrations, ZIPs e configurações privadas ficam fora dos assets. Pages Functions continuam em `/functions/`.

## Desenvolvimento

Em um clone novo, `node setup.js verify` confere os arquivos do Core e a estrutura local da configuração. Para instalar as dependências do lockfile, execute `npm ci`. Use uma cópia separada para testar a configuração de uma wiki, pois o setup grava `site.json`, `installation.json` e `wrangler.toml` na pasta em que está instalado.

Servidor local do Pages:

```bash
npm run dev
```

Verificação do projeto:

```bash
node setup.js verify
```

Testes locais e tipos:

```bash
npm test
npm run build
```

Os testes usam SQLite, D1/R2 locais do Miniflare e fixtures temporárias. Incluem o worker de Pages compilado, migrations pelo Wrangler local, interrupções de gravação, concorrência, recuperação HTTP com retomada, atualização do ZIP e seleção de assets. Não acessam recursos Cloudflare de produção. A consulta de saúde distingue o schema exigido do registro de migrations realmente encontrado no banco.

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
