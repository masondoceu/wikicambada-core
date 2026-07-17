# Migrations do WikiCambada Core

As migrations criam e evoluem o schema usado pelo D1.

- `0001_schema.sql`: tabelas principais de páginas, revisões, categorias, links, uploads, configurações e busca FTS
- `0002_edit_proposals.sql`: fila de propostas públicas de edição
- `0003_revision_metadata.sql`: metadados editoriais por revisão, usados pelo histórico do Alpha 4
- `0004_aliases.sql`: aliases de título para páginas, permitindo que títulos alternativos resolvam para o artigo canônico

A partir do Alpha 4, o D1 é a fonte principal dos artigos. Os antigos JSONs estáticos de páginas foram removidos do pacote.

O Alpha 6 não adiciona migration nova: as categorias usam as tabelas `categories` e `page_categories`, já criadas no schema inicial.

## 0005_uploads_metadata.sql

Adiciona metadados extras para arquivos enviados ao acervo:

- `uploads.file_slug`
- `uploads.description`
- `uploads.updated_at`
- índice único por `file_slug`
- índice por data de envio

A tabela `uploads` original já existia desde o schema inicial. Esta migration deixa os uploads mais amigáveis para páginas de arquivo públicas.

## 0006_admin_ip_rules.sql

Cria a tabela `ip_rules`, usada pelo painel administrativo de endereços IP. As regras iniciais suportam bloqueio de sugestões públicas e bloqueio de acesso público ao site.


## 0007_final_alpha_admin.sql

Adiciona a base do Final Alpha: hierarquia interna de usuários, campos de lixeira para páginas e uploads, metadados de revisão de propostas, eventos recentes de atividade e suporte a expiração administrativa de itens deletados.

- `0008_discussions_users_templates.sql`: adiciona a galeria/criador de templates editoriais usados pelo editor Markdown e cria os templates iniciais de manutenção, mídia, links e layout.

- `0009_template_system_v2.sql`: expande templates para predefinições de wiki com chamada, renderização, parâmetros, imagens, posição e cor de destaque.

- `0010_v1_0_4_template_gallery_users.sql`: normaliza quebras `\n` antigas em templates, adiciona template de infobox e prepara a v1.0.4.

- `0011_v1_0_6_infobox_template_metadata.sql`: atualiza a chamada/documentação da predefinição Infobox para deixar claro que campos livres são aceitos.

- `0012_v1_0_8_media_infobox_editor.sql`: atualiza a predefinição Infobox para múltiplas imagens/legendas e adiciona template de vídeo incorporado para YouTube ou arquivos diretos.

- `0013_v1_0_9_search_activity.sql`: adiciona metadados de localização Cloudflare ao registro de atividade e índices auxiliares para busca/autocomplete.

### 0014_v1_0_13_redirects_files_version.sql

Adiciona `target_fragment` aos redirecionamentos para destinos como `/wiki/pagina#secao`. A atualização também usa esse campo no novo gerenciador de aliases e redirecionamentos avançados.
