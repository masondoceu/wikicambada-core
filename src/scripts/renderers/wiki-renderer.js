import { APP_VERSION, SLOGAN, HOME_SLUG, SITE_CONFIG, SITE_NAME, featureEnabled } from '../core/config.js'
import { applyTemplateVars, escapeHtml, formatDate, pageUrl, searchUrl, slugify, titleFromSlug } from '../core/utils.js'
import { extractHeadings, inlineMarkdown, markdownToHtml } from './wiki-markdown.js'

export function setDocumentTitle(page, suffix = '') {
  const title = page?.title || SITE_NAME
  document.title = suffix ? `${title}${suffix} - ${SITE_NAME}` : `${title} - ${SITE_NAME}`
}

export function infoboxHtml(box) {
  if (!box) return ''

  const rows = (box.rows || [])
    .map(row => `
      <div class="infobox-row">
        <b>${escapeHtml(row.label)}</b>
        <span>${inlineMarkdown(row.value)}</span>
      </div>
    `)
    .join('')
  const images = Array.isArray(box.images) && box.images.length
    ? box.images
    : box.image
      ? [{ src: box.image, caption: box.caption || '' }]
      : []
  const imageHtml = images.map((image, index) => {
    const src = image.src || image.url || image.image || ''
    if (!src) return ''
    const caption = image.caption || image.legenda || ''
    const title = images.length > 1 ? `${box.title || 'Infocaixa'} ${index + 1}` : box.title
    return `
      <figure class="infobox-image">
        <img loading="lazy" decoding="async" src="${escapeHtml(src)}" alt="${escapeHtml(caption || title || '')}" data-media-viewer draggable="false" role="button" tabindex="0" data-media-type="image" data-media-src="${escapeHtml(src)}" data-media-title="${escapeHtml(title || caption || 'imagem')}" data-media-caption="${escapeHtml(caption || '')}" />
        ${caption ? `<figcaption class="infobox-caption">${inlineMarkdown(caption)}</figcaption>` : ''}
      </figure>
    `
  }).join('')

  return `
    <aside class="infobox" aria-label="Infocaixa">
      <div class="infobox-title">${escapeHtml(box.title)}</div>
      ${box.subtitle ? `<div class="infobox-subtitle">${escapeHtml(box.subtitle)}</div>` : ''}
      ${imageHtml}
      ${rows}
    </aside>
  `
}

export function categoryUrl(category) {
  return pageUrl(`categoria/${slugify(category)}`)
}

export function categoriesHtml(categories = []) {
  if (!categories.length) return ''

  return `<div class="categories">Categorias: ${categories.map(category => `<a href="${categoryUrl(category)}" data-link="page" data-slug="categoria/${slugify(category)}">${escapeHtml(category)}</a>`).join(' · ')}</div>`
}


function fileDetailsUrl(file) {
  return pageUrl(`arquivo/${file.slug}`)
}

function mediaAttrsForFile(file, caption = '') {
  const isVideo = String(file.mimeType || '').startsWith('video/')
  const interactive = isVideo
    ? []
    : [
      'data-media-viewer',
      'role="button"',
      'tabindex="0"',
      'onclick="window.WikiCambadaMediaViewer?.openFromElement(this); return false"'
    ]
  return [
    ...interactive,
    'draggable="false"',
    `data-media-type="${isVideo ? 'video' : 'image'}"`,
    `data-media-src="${escapeHtml(file.contentUrl)}"`,
    `data-media-title="${escapeHtml(file.filename)}"`,
    `data-media-caption="${escapeHtml(caption || file.description || file.filename)}"`,
    `data-media-details="${escapeHtml(fileDetailsUrl(file))}"`
  ].join(' ')
}

function breadcrumbsHtml(page) {
  const crumbs = [
    `<a href="${pageUrl(HOME_SLUG)}" data-link="home">Página principal</a>`
  ]

  if (page?.slug?.startsWith('categoria/')) {
    crumbs.push(`<a href="${pageUrl('categorias')}" data-link="page" data-slug="categorias">Categorias</a>`)
  } else if (page?.categories?.length) {
    const category = page.categories[0]
    crumbs.push(`<a href="${categoryUrl(category)}" data-link="page" data-slug="categoria/${slugify(category)}">${escapeHtml(category)}</a>`)
  }

  if (page?.title) crumbs.push(`<span>${escapeHtml(page.title)}</span>`)

  return `<nav class="breadcrumbs" aria-label="Caminho">${crumbs.join('<span aria-hidden="true">›</span>')}</nav>`
}

function tocTree(headings = []) {
  const root = { level: 1, children: [] }
  const stack = [root]

  for (const heading of headings) {
    const node = { ...heading, level: Math.min(4, Math.max(2, heading.level)), children: [] }
    while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop()
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  }

  return root.children
}

function tocListHtml(nodes = []) {
  if (!nodes.length) return ''

  return `
    <ol>
      ${nodes.map(node => `
        <li class="toc-level-${node.level}">
          <a href="#${escapeHtml(node.id)}">${escapeHtml(node.title)}</a>
          ${tocListHtml(node.children)}
        </li>
      `).join('')}
    </ol>
  `
}

function tocHtml(content = '') {
  if (String(content || '').includes('__NOTOC__')) return ''

  const headings = extractHeadings(content)
  const force = String(content || '').includes('__TOC__')
  if (!force) return ''
  if (!headings.length) return ''

  return `
    <details class="article-toc" open>
      <summary><strong>Índice</strong> <span class="toc-toggle-label" aria-hidden="true"></span></summary>
      ${tocListHtml(tocTree(headings))}
    </details>
  `
}


function resolvedNoticeHtml(page) {
  if (!page?.resolvedFrom) return ''

  const kind = page.resolvedBy === 'redirect' ? 'redirecionamento' : 'alias de título'
  return `
    <aside class="messagebox messagebox-info resolved-notice">
      Esta página foi aberta por ${kind}: <code>${escapeHtml(page.resolvedFrom)}</code>.
    </aside>
  `
}

function aliasesHtml(page) {
  const aliases = page?.aliases || []
  const redirectRules = Array.isArray(page?.redirectRules) && page.redirectRules.length
    ? page.redirectRules
    : (page?.redirects || []).map(fromSlug => ({ fromSlug, fragment: '' }))
  if (!aliases.length && !redirectRules.length) return ''

  return `
    <section class="article-aliases" aria-label="Aliases e redirecionamentos">
      ${aliases.length ? `<p><strong>Aliases:</strong> ${aliases.map(alias => `<code>${escapeHtml(alias.title || alias.slug)}</code>`).join(' ')}</p>` : ''}
      ${redirectRules.length ? `<p><strong>Redirecionamentos:</strong> ${redirectRules.map(rule => `<code>${escapeHtml(rule.fromSlug || rule)}${rule.fragment ? ` → #${escapeHtml(rule.fragment)}` : ''}</code>`).join(' ')}</p>` : ''}
    </section>
  `
}

export function footerHtml(page) {
  const aboutSlug = SITE_CONFIG.site?.aboutSlug || 'sobre'
  const editGuideSlug = SITE_CONFIG.site?.editGuideSlug || 'como-editar'
  const externalLinks = (SITE_CONFIG.navigation?.external || [])
    .map(item => `<a href="${escapeHtml(item.href)}" rel="noreferrer">${escapeHtml(item.label || item.href)}</a>`)
    .join('')
  const historyLink = featureEnabled('pageHistory')
    ? `<a href="${pageUrl(page.slug, 'history')}" data-link="history" data-slug="${escapeHtml(page.slug)}">Histórico</a>`
    : ''
  const poweredText = featureEnabled('coreBadge')
    ? `<p>Powered by <a href="${pageUrl('wikicambada-core')}" data-link="page" data-slug="wikicambada-core">WikiCambada Core</a> <a class="core-version" href="${pageUrl('especial/versao')}" data-link="page" data-slug="especial/versao">${escapeHtml(APP_VERSION)}</a>.</p>`
    : ''
  const poweredBadge = featureEnabled('coreBadge')
    ? `<ul class="footer-poweredby-list" aria-label="Tecnologia usada"><li><a class="footer-poweredby-badge" href="${pageUrl('wikicambada-core')}" data-link="page" data-slug="wikicambada-core"><img src="${escapeHtml(SITE_CONFIG.branding?.poweredByBadge || '/src/media/images/poweredby-wikicambada-core.png')}" alt="Powered by WikiCambada Core" loading="lazy" /></a></li></ul>`
    : ''

  return `
    <footer class="footer">
      <div class="footer-main">
        <div class="footer-copy">
          <p>Esta página foi editada pela última vez em ${formatDate(page.updatedAt || new Date().toISOString())}. O conteúdo está em fase de organização editorial.</p>
          ${poweredText}
          <nav class="footer-links" aria-label="Rodapé">
            <a href="${pageUrl(aboutSlug)}" data-link="page" data-slug="${escapeHtml(aboutSlug)}">Sobre ${escapeHtml(SITE_CONFIG.site?.shortName || SITE_NAME)}</a>
            <a href="${pageUrl(editGuideSlug)}" data-link="page" data-slug="${escapeHtml(editGuideSlug)}">Como editar</a>
            ${historyLink}
            ${externalLinks}
          </nav>
        </div>
        ${poweredBadge}
      </div>
    </footer>
  `
}

export function articleHtml(page, context = {}) {
  const hasInfobox = Boolean(page.infobox)
  const className = page.slug === HOME_SLUG ? ' article--main-page' : ''
  const content = applyTemplateVars(page.content, context)
  const forcedToc = String(content || '').includes('__TOC__')
  const tableOfContents = forcedToc ? tocHtml(content) : ''
  const bodyHtml = markdownToHtml(content, {
    templates: context.templates || [],
    tocHtml: tableOfContents
  })

  return `
    <article class="wiki-article${className}">
      <header class="article-header">
        <h1>${escapeHtml(page.title)}</h1>
        <p class="article-subtitle">${escapeHtml(page.subtitle || `${SITE_NAME} — ${SLOGAN}`)}</p>
      </header>

      ${breadcrumbsHtml(page)}
      ${resolvedNoticeHtml(page)}
      <div class="article-grid" style="grid-template-columns:${hasInfobox ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr)'}">
        <div class="article-body">${bodyHtml}</div>
        ${infoboxHtml(page.infobox)}
      </div>

      ${aliasesHtml(page)}
      ${featureEnabled('categories') ? categoriesHtml(page.categories) : ''}
      ${footerHtml(page)}
    </article>
  `
}


export function editorPreviewHtml(page, context = {}) {
  const previewPage = {
    ...page,
    updatedAt: new Date().toISOString()
  }

  return `
    <section class="editor-preview" aria-live="polite">
      <div class="editor-preview-header">
        <h2>Pré-visualização</h2>
        <p>Esta visualização é gerada no navegador e pode diferir do resultado publicado pelo back-end.</p>
      </div>
      ${articleHtml(previewPage, context)}
    </section>
  `
}

export function notFoundHtml(slug, user = { authenticated: false }) {
  const readableTitle = titleFromSlug(slug)
  const canSuggest = featureEnabled('publicSuggestions')
  const action = user.authenticated
    ? `<a class="primary-button" href="${pageUrl(slug, 'edit')}" data-link="edit" data-slug="${escapeHtml(slug)}">Criar página</a>`
    : canSuggest
      ? `<a class="primary-button" href="${pageUrl(slug, 'suggest')}" data-link="suggest" data-slug="${escapeHtml(slug)}">Sugerir agora</a>`
      : ''
  const message = user.authenticated
    ? `A página <code>${escapeHtml(readableTitle)}</code> não existe, mas você pode criar agora mesmo!`
    : canSuggest
      ? `A página <code>${escapeHtml(readableTitle)}</code> não existe, mas você pode sugerir agora mesmo!`
      : `A página <code>${escapeHtml(readableTitle)}</code> não existe e sugestões públicas estão desativadas.`

  return `
    <article class="not-found-page">
      <header class="article-header">
        <h1>Página não encontrada</h1>
        <p class="article-subtitle">A página solicitada ainda não possui registro publicado em ${escapeHtml(SITE_NAME)}.</p>
      </header>

      <div class="empty-state">
        <p>${message}</p>
        <p>URL procurada: <code>${escapeHtml(pageUrl(slug))}</code>.</p>
      </div>

      <div class="editor-actions">
        ${action}
        <a class="secondary-button" href="/" data-link="home">Voltar à página principal</a>
      </div>
    </article>
  `
}

function historyRoute(slug, params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  return `${pageUrl(slug, 'history')}${search.toString() ? `?${search}` : ''}`
}

function revisionSummaryHtml(revision) {
  return `
    <dl class="revision-summary">
      <div><dt>Revisão</dt><dd>${escapeHtml(revision.revisionNumber || '')}${revision.isCurrent ? ' <span class="revision-current">atual</span>' : ''}</dd></div>
      <div><dt>Data</dt><dd>${formatDate(revision.createdAt)}</dd></div>
      <div><dt>Autor</dt><dd>${escapeHtml(revision.authorName || revision.author || 'editor não identificado')}</dd></div>
      <div><dt>Resumo</dt><dd>${escapeHtml(revision.summary || 'sem resumo')}</dd></div>
    </dl>
  `
}

function lineDiffRows(oldText = '', newText = '') {
  const oldLines = String(oldText || '').split('\n')
  const newLines = String(newText || '').split('\n')
  const rows = []
  const max = Math.max(oldLines.length, newLines.length)

  for (let i = 0; i < max; i += 1) {
    const before = oldLines[i] ?? ''
    const after = newLines[i] ?? ''
    const changed = before !== after
    rows.push(`
      <tr class="${changed ? 'diff-row-changed' : 'diff-row-same'}">
        <td class="diff-line-number">${i + 1}</td>
        <td><pre>${escapeHtml(before)}</pre></td>
        <td><pre>${escapeHtml(after)}</pre></td>
      </tr>
    `)
  }

  return rows.join('')
}

export function historyHtml(page, data = {}, user = {}) {
  const revisions = data?.revisions || page.revisions || []
  const rows = revisions.map(revision => {
    const revisionNumber = revision.revisionNumber || revision.revision_number
    return `
      <tr>
        <td>${formatDate(revision.createdAt || revision.created_at)}</td>
        <td>${escapeHtml(revision.authorName || revision.author || revision.author_email || 'editor não identificado')}</td>
        <td>${escapeHtml(revision.summary || 'sem resumo')}</td>
        <td>${revision.isCurrent ? '<span class="revision-current">atual</span>' : escapeHtml(revisionNumber)}</td>
        <td class="history-actions">
          <a href="${historyRoute(page.slug, { revision: revisionNumber })}" data-link="route">ver</a>
          <a href="${historyRoute(page.slug, { compare: revisionNumber })}" data-link="route">comparar com atual</a>
          ${user.canEdit && !revision.isCurrent ? `<button type="button" data-restore-revision="${escapeHtml(revisionNumber)}" data-slug="${escapeHtml(page.slug)}">restaurar</button>` : ''}
        </td>
      </tr>
    `
  }).join('')

  return `
    <article class="history-page">
      <header class="article-header">
        <h1>Histórico de “${escapeHtml(page.title)}”</h1>
        <p class="article-subtitle">Cada edição registrada gera uma revisão associada à página.</p>
      </header>

      <table class="history-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Autor</th>
            <th>Resumo</th>
            <th>Versão</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5">Nenhuma revisão registrada.</td></tr>'}</tbody>
      </table>

      ${footerHtml(page)}
    </article>
  `
}

export function revisionHtml(page, revision, context = {}, user = {}) {
  const revisionPage = {
    ...page,
    title: revision.title || page.title,
    subtitle: revision.subtitle || page.subtitle,
    content: revision.content || '',
    categories: revision.categories || page.categories || [],
    updatedAt: revision.createdAt
  }

  return `
    <article class="revision-page">
      <header class="article-header">
        <h1>Revisão ${escapeHtml(revision.revisionNumber)} de “${escapeHtml(revisionPage.title)}”</h1>
        <p class="article-subtitle">Esta é uma versão arquivada da página. Ela pode não corresponder ao conteúdo atual.</p>
      </header>

      ${revisionSummaryHtml(revision)}

      <div class="editor-actions revision-actions">
        <a class="secondary-button" href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">Ver versão atual</a>
        <a class="secondary-button" href="${historyRoute(page.slug, { compare: revision.revisionNumber })}" data-link="route">Comparar com atual</a>
        <a class="secondary-button" href="${pageUrl(page.slug, 'history')}" data-link="history" data-slug="${escapeHtml(page.slug)}">Voltar ao histórico</a>
        ${user.canEdit && !revision.isCurrent ? `<button class="primary-button" type="button" data-restore-revision="${escapeHtml(revision.revisionNumber)}" data-slug="${escapeHtml(page.slug)}">Restaurar esta revisão</button>` : ''}
      </div>

      ${articleHtml(revisionPage, context)}
    </article>
  `
}

export function revisionCompareHtml(page, oldRevision, currentPage, user = {}) {
  const currentRevisionNumber = (currentPage.revisions || []).find(revision => revision.isCurrent)?.revisionNumber || 'atual'

  return `
    <article class="revision-compare-page">
      <header class="article-header">
        <h1>Comparação de revisões: “${escapeHtml(page.title)}”</h1>
        <p class="article-subtitle">Comparação simples entre a revisão ${escapeHtml(oldRevision.revisionNumber)} e a versão atual.</p>
      </header>

      <section class="comparison-meta">
        <div>
          <h2>Revisão ${escapeHtml(oldRevision.revisionNumber)}</h2>
          ${revisionSummaryHtml(oldRevision)}
        </div>
        <div>
          <h2>Versão atual</h2>
          <p>${escapeHtml(currentRevisionNumber)} · editada em ${formatDate(currentPage.updatedAt)}</p>
        </div>
      </section>

      <table class="diff-table">
        <thead>
          <tr>
            <th>Linha</th>
            <th>Revisão ${escapeHtml(oldRevision.revisionNumber)}</th>
            <th>Atual</th>
          </tr>
        </thead>
        <tbody>${lineDiffRows(oldRevision.content || '', currentPage.content || '')}</tbody>
      </table>

      <div class="editor-actions revision-actions">
        <a class="secondary-button" href="${historyRoute(page.slug, { revision: oldRevision.revisionNumber })}" data-link="route">Ver revisão antiga</a>
        <a class="secondary-button" href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">Ver versão atual</a>
        <a class="secondary-button" href="${pageUrl(page.slug, 'history')}" data-link="history" data-slug="${escapeHtml(page.slug)}">Voltar ao histórico</a>
        ${user.canEdit && !oldRevision.isCurrent ? `<button class="primary-button" type="button" data-restore-revision="${escapeHtml(oldRevision.revisionNumber)}" data-slug="${escapeHtml(page.slug)}">Restaurar revisão ${escapeHtml(oldRevision.revisionNumber)}</button>` : ''}
      </div>
    </article>
  `
}



function safeSnippet(value) {
  return escapeHtml(value || '').replaceAll('&lt;mark&gt;', '<mark>').replaceAll('&lt;/mark&gt;', '</mark>')
}

function searchResultTitle(page) {
  const title = String(page?.title || page?.displayTitle || '').trim()
  if (title) return title
  const slug = String(page?.slug || '').split('/').filter(Boolean).pop() || 'resultado'
  return slug.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, letter => letter.toLocaleUpperCase('pt-BR'))
}

function searchResultSubtitle(page) {
  return String(page?.subtitle || page?.matchType || page?.matchedTitle || page?.matchedSlug || page?.slug || '').trim()
}

function pageDateValue(value) {
  const clean = String(value || '').trim()
  if (!clean) return 0
  const timestamp = Date.parse(clean.includes('T') ? clean : clean.replace(' ', 'T'))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function pageListRows(pages = [], { recent = false } = {}) {
  const orderedPages = recent
    ? [...pages].sort((pageA, pageB) => {
      const dateA = pageDateValue(pageA?.updatedAt || pageA?.createdAt)
      const dateB = pageDateValue(pageB?.updatedAt || pageB?.createdAt)
      return dateB - dateA || String(pageA?.title || '').localeCompare(String(pageB?.title || ''), 'pt-BR')
    })
    : pages

  return orderedPages.map(page => `
    <tr>
      <td><a href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">${escapeHtml(page.title)}</a></td>
      <td>${escapeHtml(page.subtitle || '')}</td>
      ${recent ? `<td>${formatDate(page.updatedAt)}</td>` : ''}
      <td>${escapeHtml(page.slug)}</td>
    </tr>
  `).join('')
}

export function allPagesHtml(pages = []) {
  return `
    <article class="special-page special-page-all-pages">
      <header class="article-header">
        <h1>Todas as páginas</h1>
        <p class="article-subtitle">Índice alfabético das páginas publicadas no D1.</p>
      </header>

      <table class="history-table page-index-table">
        <thead>
          <tr>
            <th>Título</th>
            <th>Subtítulo</th>
            <th>Slug</th>
          </tr>
        </thead>
        <tbody>${pages.length ? pageListRows(pages) : '<tr><td colspan="3">Nenhuma página publicada.</td></tr>'}</tbody>
      </table>
    </article>
  `
}

export function recentPagesHtml(pages = []) {
  return `
    <article class="special-page special-page-recent-pages">
      <header class="article-header">
        <h1>Páginas recentes</h1>
        <p class="article-subtitle">Páginas publicadas ou atualizadas mais recentemente.</p>
      </header>

      <table class="history-table page-index-table">
        <thead>
          <tr>
            <th>Título</th>
            <th>Subtítulo</th>
            <th>Última atualização</th>
            <th>Slug</th>
          </tr>
        </thead>
        <tbody>${pages.length ? pageListRows(pages, { recent: true }) : '<tr><td colspan="4">Nenhuma página publicada.</td></tr>'}</tbody>
      </table>
    </article>
  `
}

export function categoriesIndexHtml(categories = []) {
  return `
    <article class="special-page special-page-categories">
      <header class="article-header">
        <h1>Categorias</h1>
        <p class="article-subtitle">Índice das categorias com páginas publicadas em ${escapeHtml(SITE_NAME)}.</p>
      </header>

      <section class="category-grid">
        ${categories.length ? categories.map(category => `
          <a class="category-card" href="${categoryUrl(category.name)}" data-link="page" data-slug="categoria/${slugify(category.name)}">
            <strong>${escapeHtml(category.name)}</strong>
            <span>${Number(category.pageCount || 0).toLocaleString('pt-BR')} página(s)</span>
          </a>
        `).join('') : '<p class="empty-state">Nenhuma categoria publicada.</p>'}
      </section>
    </article>
  `
}

export function categoryPageHtml(category) {
  const page = {
    slug: `categoria/${category.slug}`,
    title: `Categoria: ${category.name}`,
    subtitle: 'Páginas associadas a esta categoria.',
    categories: []
  }

  return `
    <article class="special-page category-page">
      <header class="article-header">
        <h1>Categoria: ${escapeHtml(category.name)}</h1>
        <p class="article-subtitle">Páginas associadas a esta categoria.</p>
      </header>

      ${breadcrumbsHtml(page)}

      <table class="history-table page-index-table">
        <thead>
          <tr>
            <th>Título</th>
            <th>Subtítulo</th>
            <th>Slug</th>
          </tr>
        </thead>
        <tbody>${category.pages?.length ? pageListRows(category.pages) : '<tr><td colspan="3">Nenhuma página publicada nesta categoria.</td></tr>'}</tbody>
      </table>
    </article>
  `
}

export function searchHtml(query, results, user = { authenticated: false }) {
  const cleanQuery = String(query || '').trim()
  const slug = slugify(cleanQuery)
  const canEdit = Boolean(user?.authenticated || user?.canEdit)
  const canSuggest = featureEnabled('publicSuggestions')
  const missingAction = canEdit
    ? `<a class="primary-button" href="${pageUrl(slug, 'edit')}" data-link="edit" data-slug="${escapeHtml(slug)}">Criar página</a>`
    : canSuggest
      ? `<a class="primary-button" href="${pageUrl(slug, 'suggest')}" data-link="suggest" data-slug="${escapeHtml(slug)}">Sugerir agora</a>`
      : ''
  const missingText = canEdit
    ? `A página <code>${escapeHtml(cleanQuery)}</code> não existe, mas você pode criar agora mesmo!`
    : canSuggest
      ? `A página <code>${escapeHtml(cleanQuery)}</code> não existe, mas você pode sugerir agora mesmo!`
      : `A página <code>${escapeHtml(cleanQuery)}</code> não existe e sugestões públicas estão desativadas.`
  const hasExact = results.some(page => page.exact || slugify(searchResultTitle(page)) === slug || String(page.slug || '') === slug)

  return `
    <header class="article-header">
      <h1>Resultados da busca</h1>
      <p class="article-subtitle">Pesquisa por “${escapeHtml(cleanQuery)}”.</p>
    </header>

    <section class="search-results">
      ${results.length ? results.map(page => {
        const title = searchResultTitle(page)
        const subtitle = searchResultSubtitle(page)
        return `
          <article class="search-result">
            <h2><a href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">${escapeHtml(title)}</a></h2>
            <p>${safeSnippet(page.snippet || subtitle || '')}</p>
            <small>${escapeHtml(page.exact ? `correspondência exata por ${page.matchType || 'resultado'}` : page.matchType || 'resultado')}${page.updatedAt ? ` · atualizado em ${formatDate(page.updatedAt)}` : ''}</small>
          </article>
        `
      }).join('') : '<p class="empty-state">Nenhum resultado encontrado.</p>'}
      ${cleanQuery && !hasExact && (canEdit || canSuggest) ? `
        <aside class="missing-search-page">
          <p>${missingText}</p>
          <div class="editor-actions">${missingAction}</div>
        </aside>
      ` : ''}
    </section>
  `
}

export function accessRequiredHtml(slug, user = {}) {
  return `
    <article class="access-required-page">
      <header class="article-header">
        <h1>Edição restrita</h1>
        <p class="article-subtitle">A edição direta de páginas é reservada a e-mails autorizados pelo Cloudflare Access.</p>
      </header>

      <div class="empty-state">
        <p>Para editar diretamente, entre com um e-mail autorizado. Visitantes podem enviar uma proposta de alteração para análise editorial.</p>
      </div>

      <div class="editor-actions">
        <a class="primary-button" href="${user.loginUrl || `/api/auth/login?return=${encodeURIComponent(pageUrl(slug, 'edit'))}`}">Entrar</a>
        <a class="secondary-button" href="${pageUrl(slug, 'suggest')}" data-link="suggest" data-slug="${escapeHtml(slug)}">Enviar proposta</a>
        <a class="secondary-button" href="${pageUrl(slug)}" data-link="page" data-slug="${escapeHtml(slug)}">Voltar ao artigo</a>
      </div>
    </article>
  `
}

export function proposalSubmittedHtml(page, result) {
  return `
    <article class="proposal-result-page">
      <header class="article-header">
        <h1>Proposta enviada</h1>
        <p class="article-subtitle">A alteração foi registrada para análise editorial.</p>
      </header>

      <div class="empty-state">
        <p>A proposta referente a <strong>${escapeHtml(page.title)}</strong> foi recebida.</p>
        <p>Identificador: <code>${escapeHtml(result?.proposal?.id || 'indisponível')}</code></p>
      </div>

      <div class="editor-actions">
        <a class="primary-button" href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">Voltar ao artigo</a>
      </div>
    </article>
  `
}

export function adminProposalsHtml(data, selectedId = '') {
  const proposals = data?.proposals || []

  return `
    <article class="admin-page">
      <header class="article-header">
        <h1>Propostas de edição</h1>
        <p class="article-subtitle">Painel restrito a editores autorizados pelo Cloudflare Access.</p>
      </header>

      ${adminNavHtml('proposals')}

      ${selectedId ? `<p class="editor-note">Proposta selecionada pelo Discord: <code>${escapeHtml(selectedId)}</code>.</p>` : ''}

      <section class="admin-section proposal-list">
        <h2>Propostas pendentes</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="propostas de edição">
          <thead>
            <tr>
              <th>Envio</th>
              <th>Página</th>
              <th>Título</th>
              <th>IP</th>
              <th>Contato</th>
              <th>Resumo e conteúdo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>${proposals.length ? proposals.map(proposal => `
            <tr data-proposal-id="${escapeHtml(proposal.id)}">
              <td data-sort-value="${escapeHtml(proposal.createdAt || '')}">${formatDate(proposal.createdAt)}</td>
              <td><a href="${pageUrl(proposal.pageSlug)}" data-link="page" data-slug="${escapeHtml(proposal.pageSlug)}"><code>${escapeHtml(proposal.pageSlug)}</code></a></td>
              <td>${escapeHtml(proposal.title)}</td>
              <td><code>${escapeHtml(proposal.reporterIp || 'não informado')}</code></td>
              <td>${escapeHtml(proposal.contact || 'não informado')}</td>
              <td>
                <strong>${escapeHtml(proposal.summary || 'sem resumo')}</strong>
                <details>
                  <summary>Ver conteúdo proposto</summary>
                  <pre><code>${escapeHtml(proposal.content)}</code></pre>
                  ${proposal.userAgent ? `<p class="editor-note"><strong>User-Agent:</strong> ${escapeHtml(proposal.userAgent)}</p>` : ''}
                </details>
              </td>
              <td class="admin-actions-cell">
                <label class="compact-control">Crédito
                  <select data-proposal-credit data-id="${escapeHtml(proposal.id)}">
                    <option value="contact">contato</option>
                    <option value="ip">IP</option>
                    <option value="anonymous">anônimo</option>
                  </select>
                </label>
                <button class="primary-button compact-button" type="button" data-proposal-action="approve" data-id="${escapeHtml(proposal.id)}">Aprovar</button>
                <button class="secondary-button compact-button" type="button" data-proposal-action="reject" data-id="${escapeHtml(proposal.id)}">Recusar</button>
                <a class="secondary-button compact-button" href="${pageUrl(proposal.pageSlug)}" data-link="page" data-slug="${escapeHtml(proposal.pageSlug)}">Abrir</a>
                ${proposal.reporterIp ? `
                  <button class="secondary-button compact-button" type="button" data-admin-ip-quick="block_suggestions" data-ip="${escapeHtml(proposal.reporterIp)}">Bloquear sugestões</button>
                  <button class="danger-button compact-button" type="button" data-admin-ip-quick="ban_site" data-ip="${escapeHtml(proposal.reporterIp)}">Banir site</button>
                ` : ''}
              </td>
            </tr>
          `).join('') : '<tr><td colspan="7">Nenhuma proposta pendente.</td></tr>'}</tbody>
        </table>
      </section>
    </article>
  `
}

export function fatalErrorHtml() {
  return `
    <header class="article-header">
      <h1>Erro de carregamento</h1>
      <p class="article-subtitle">${escapeHtml(SITE_NAME)} não conseguiu carregar os dados necessários para exibir esta página.</p>
    </header>
    <div class="empty-state">
      <p>Verifique se os arquivos estáticos foram publicados corretamente e tente recarregar a página.</p>
    </div>
  `
}

function formatBytes(bytes = 0) {
  const value = Number(bytes || 0)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
  if (value >= 1024) return `${(value / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`
  return `${value.toLocaleString('pt-BR')} bytes`
}

export function filePageHtml(file) {
  const pseudoPage = {
    slug: `arquivo/${file.slug}`,
    title: `Arquivo:${file.filename}`,
    subtitle: `Arquivo armazenado no acervo de ${SITE_NAME}.`,
    categories: ['Arquivo']
  }

  const isImage = String(file.mimeType || '').startsWith('image/')
  const isVideo = String(file.mimeType || '').startsWith('video/')
  const isAudio = String(file.mimeType || '').startsWith('audio/')
  const imagePreview = isImage
    ? `
      <figure class="file-preview">
        <img loading="lazy" decoding="async" src="${escapeHtml(file.contentUrl)}" alt="${escapeHtml(file.description || file.filename)}" ${mediaAttrsForFile(file)} />
        ${file.description ? `<figcaption>${escapeHtml(file.description)}</figcaption>` : ''}
      </figure>
    `
    : isVideo
      ? `
        <figure class="file-preview">
          <video src="${escapeHtml(file.contentUrl)}" controls preload="metadata" ${mediaAttrsForFile(file)}></video>
          ${file.description ? `<figcaption>${escapeHtml(file.description)}</figcaption>` : ''}
        </figure>
      `
      : isAudio
        ? `
          <figure class="file-preview">
            <audio src="${escapeHtml(file.contentUrl)}" controls preload="metadata" ${mediaAttrsForFile(file)}></audio>
            ${file.description ? `<figcaption>${escapeHtml(file.description)}</figcaption>` : ''}
          </figure>
        `
        : '<p class="empty-state">Este arquivo não possui pré-visualização disponível.</p>'

  const imageBlock = isVideo
    ? `:::video
src: ${file.contentUrl}
title: ${file.filename}
caption: ${file.description || file.filename}
details: ${fileDetailsUrl(file)}
:::`
    : isAudio
      ? `:::audio
src: ${file.contentUrl}
title: ${file.filename}
caption: ${file.description || file.filename}
details: ${fileDetailsUrl(file)}
:::`
      : `:::thumb
src: ${file.contentUrl}
alt: ${file.filename}
caption: ${file.description || file.filename}
details: ${fileDetailsUrl(file)}
align: right
width: 260
:::`

  return `
    <article class="wiki-article file-page">
      <header class="article-header">
        <h1>Arquivo:${escapeHtml(file.filename)}</h1>
        <p class="article-subtitle">Arquivo armazenado no acervo de ${escapeHtml(SITE_NAME)}.</p>
      </header>

      ${breadcrumbsHtml(pseudoPage)}

      ${imagePreview}

      <table class="history-table file-meta-table">
        <tbody>
          <tr><th>Nome</th><td>${escapeHtml(file.filename)}</td></tr>
          <tr><th>Tipo MIME</th><td>${escapeHtml(file.mimeType)}</td></tr>
          <tr><th>Tamanho</th><td>${formatBytes(file.sizeBytes)}</td></tr>
          <tr><th>Enviado por</th><td>${escapeHtml(file.uploadedByEmail || 'editor não identificado')}</td></tr>
          <tr><th>Data de envio</th><td>${formatDate(file.createdAt)}</td></tr>
          ${file.sha256 ? `<tr><th>SHA-256</th><td><code>${escapeHtml(file.sha256)}</code></td></tr>` : ''}
          <tr><th>Chave R2</th><td><code>${escapeHtml(file.r2Key)}</code></td></tr>
        </tbody>
      </table>

      <section class="file-usage-box">
        <h2>Uso em artigos</h2>
        <p>Para inserir este arquivo em um artigo, utilize o bloco abaixo.</p>
        <pre><code>${escapeHtml(imageBlock)}</code></pre>
        <p><a href="${escapeHtml(file.contentUrl)}" rel="noreferrer">Abrir arquivo original</a></p>
      </section>
    </article>
  `
}

export function fileUploadPageHtml(fileSlug, user = {}) {
  const cleanSlug = String(fileSlug || 'novo-arquivo').replace(/^arquivo\//, '')
  return `
    <article class="special-page file-upload-special">
      <header class="article-header">
        <h1>Enviar arquivo</h1>
        <p class="article-subtitle">Crie <code>/wiki/arquivo/${escapeHtml(cleanSlug)}</code> enviando uma imagem, um vídeo ou um áudio para o acervo.</p>
      </header>

      <section class="file-upload-card">
        <p>O namespace <code>/wiki/arquivo/</code> não aceita artigos em Markdown. Ele é reservado para objetos de mídia armazenados no R2 e registrados no D1.</p>
        ${user?.canEdit ? `
          <form data-file-upload-form>
            <div class="file-upload-grid">
              <label>
                URL do arquivo
                <span class="editor-url-control"><span class="editor-url-prefix">/wiki/arquivo/</span><input name="slug" value="${escapeHtml(cleanSlug)}" required autocomplete="off" /></span>
              </label>
              <label>
                Arquivo
                <input type="file" name="file" accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime,audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/flac,audio/aac,audio/mp4,.m4a,.mov,.m4v,.ogv,.oga" required />
              </label>
              <label>
                Descrição ou legenda
                <input type="text" name="description" maxlength="500" placeholder="descrição curta da mídia" />
              </label>
            </div>
            <div class="editor-actions">
              <button class="primary-button" type="submit">Enviar arquivo</button>
              <a class="secondary-button" href="/admin/storage" data-link="route">Abrir armazenamento</a>
              <a class="secondary-button" href="/" data-link="home">Cancelar</a>
            </div>
            <p class="editor-note" data-file-upload-note>São aceitas imagens, vídeos e áudios válidos de até 50 MB.</p>
          </form>
        ` : `
          <div class="empty-state">
            <p>O upload é restrito a editores, moderadores e administradores autenticados pelo Cloudflare Access.</p>
          </div>
          <div class="editor-actions">
            <a class="primary-button" href="${escapeHtml(user?.loginUrl || `/api/auth/login?return=${encodeURIComponent(pageUrl(`arquivo/${cleanSlug}`))}`)}">Entrar</a>
            <a class="secondary-button" href="/" data-link="home">Voltar à página principal</a>
          </div>
        `}
      </section>
    </article>
  `
}

export function fileNamespaceBlockedHtml(slug, user = {}) {
  const clean = String(slug || '').replace(/^arquivo\//, '')
  return `
    <article class="access-required-page">
      <header class="article-header">
        <h1>Namespace de arquivo</h1>
        <p class="article-subtitle">Páginas de arquivo não usam o editor de artigos nem aceitam propostas em Markdown.</p>
      </header>
      <div class="empty-state">
        <p>Use a página especial de upload para registrar <code>/wiki/arquivo/${escapeHtml(clean)}</code>.</p>
      </div>
      <div class="editor-actions">
        ${featureEnabled('mediaUploads') ? `<a class="primary-button" href="${pageUrl(`arquivo/${clean}`)}" data-link="page" data-slug="arquivo/${escapeHtml(clean)}">Abrir uploader</a>` : ''}
        ${!user?.canEdit ? `<a class="secondary-button" href="${escapeHtml(user?.loginUrl || `/api/auth/login?return=${encodeURIComponent(pageUrl(`arquivo/${clean}`))}`)}">Entrar</a>` : ''}
        <a class="secondary-button" href="/" data-link="home">Voltar à página principal</a>
      </div>
    </article>
  `
}

export function versionPageHtml(status = {}) {
  const coreVersion = status?.coreVersion || APP_VERSION
  const cacheVersion = status?.cacheVersion?.value ?? status?.cacheVersion ?? 0
  const reloadVersion = status?.reloadVersion?.value ?? status?.reloadVersion ?? 0
  return `
    <article class="special-page version-page">
      <header class="article-header">
        <h1>WikiCambada Core — Versão</h1>
        <p class="article-subtitle">Informações técnicas da instalação atual, semelhante a <code>Special:Version</code> do MediaWiki.</p>
      </header>

      <div class="version-facts">
        <div class="version-fact"><strong>Versão do Core</strong><span>${escapeHtml(coreVersion)}</span></div>
        <div class="version-fact"><strong>Aplicação</strong><span>WikiCambada Core</span></div>
        <div class="version-fact"><strong>Modelo de execução</strong><span>Cloudflare Pages Functions / serverless</span></div>
        <div class="version-fact"><strong>Banco de dados</strong><span>Cloudflare D1 (SQLite)</span></div>
        <div class="version-fact"><strong>Armazenamento de mídia</strong><span>Cloudflare R2</span></div>
        <div class="version-fact"><strong>Autenticação editorial</strong><span>Cloudflare Access</span></div>
        <div class="version-fact"><strong>Versão de cache</strong><span>${escapeHtml(cacheVersion)}</span></div>
        <div class="version-fact"><strong>Versão de recarregamento</strong><span>${escapeHtml(reloadVersion)}</span></div>
      </div>

      <section class="admin-section">
        <h2>Renderização</h2>
        <p>O Core usa um renderizador próprio de Markdown, links wiki, templates experimentais, mídia e componentes <code>:::</code>. Ele não usa MediaWiki nem Parsoid.</p>
      </section>

      <section class="admin-section">
        <h2>Namespaces e páginas especiais</h2>
        <p>Artigos, discussões, usuários, categorias e arquivos são tratados por rotas próprias. Esta página pode ser aberta por <code>/wiki/especial/versao</code>, <code>/wiki/special/version</code> ou <code>/wiki/version</code>.</p>
      </section>
    </article>
  `
}

function advancedRedirectRows(redirects = []) {
  return redirects.map(rule => `
    <tr>
      <td><code>/wiki/${escapeHtml(rule.fromSlug)}</code></td>
      <td><a href="${pageUrl(rule.toSlug)}${rule.fragment ? `#${encodeURIComponent(rule.fragment)}` : ''}" data-link="page" data-slug="${escapeHtml(rule.toSlug)}"><code>/wiki/${escapeHtml(rule.toSlug)}${rule.fragment ? `#${escapeHtml(rule.fragment)}` : ''}</code></a></td>
      <td>${escapeHtml(rule.targetTitle || 'destino ausente')}</td>
      <td>${formatDate(rule.createdAt)}</td>
      <td><button class="danger-button compact-button" type="button" data-advanced-redirect-delete="${escapeHtml(rule.fromSlug)}">remover</button></td>
    </tr>
  `).join('')
}

function advancedAliasRows(aliases = []) {
  return aliases.map(alias => `
    <tr>
      <td>${escapeHtml(alias.aliasTitle)}</td>
      <td><code>/wiki/${escapeHtml(alias.aliasSlug)}</code></td>
      <td><a href="${pageUrl(alias.toSlug)}" data-link="page" data-slug="${escapeHtml(alias.toSlug)}">${escapeHtml(alias.targetTitle || alias.toSlug)}</a></td>
      <td>${formatDate(alias.createdAt)}</td>
      <td><button class="danger-button compact-button" type="button" data-advanced-alias-delete="${escapeHtml(alias.aliasSlug)}">remover</button></td>
    </tr>
  `).join('')
}

export function adminRedirectsHtml(data = {}) {
  const redirects = data.redirects || []
  const aliases = data.aliases || []
  return `
    <article class="admin-page admin-redirects-page">
      <header class="article-header">
        <h1>Aliases e redirecionamentos avançados</h1>
        <p class="article-subtitle">Gerencie URLs alternativas e redirecionamentos para páginas ou seções específicas.</p>
      </header>

      ${adminNavHtml('redirects')}

      <section class="redirect-manager-card">
        <h2>Novo redirecionamento</h2>
        <form data-advanced-redirect-form>
          <div class="redirect-form-grid">
            <label>Origem <span class="editor-url-control"><span class="editor-url-prefix">/wiki/</span><input name="fromSlug" required placeholder="historico-de-versoes" /></span></label>
            <label>Destino <span class="editor-url-control"><span class="editor-url-prefix">/wiki/</span><input name="toSlug" required placeholder="placeholderbot" /></span></label>
            <label>Seção opcional <span class="editor-url-control"><span class="editor-url-prefix">#</span><input name="fragment" placeholder="versoes" /></span></label>
          </div>
          <div class="editor-actions"><button class="primary-button" type="submit">Salvar redirecionamento</button></div>
          <p class="editor-note" data-advanced-redirect-note>Exemplo: <code>/wiki/historico-de-versoes-do-placeholderbot</code> → <code>/wiki/placeholderbot#versoes</code>.</p>
        </form>
      </section>

      <section class="redirect-manager-card">
        <h2>Novo alias de título</h2>
        <form data-advanced-alias-form>
          <div class="redirect-form-grid">
            <label>Título alternativo<input name="aliasTitle" required placeholder="Nome alternativo da página" /></label>
            <label>Página de destino <span class="editor-url-control"><span class="editor-url-prefix">/wiki/</span><input name="toSlug" required placeholder="pagina-canonica" /></span></label>
          </div>
          <div class="editor-actions"><button class="primary-button" type="submit">Salvar alias</button></div>
          <p class="editor-note" data-advanced-alias-note>Aliases participam da pesquisa e abrem a página canônica.</p>
        </form>
      </section>

      <section class="admin-section">
        <h2>Redirecionamentos registrados</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="redirecionamentos avançados">
          <thead><tr><th>Origem</th><th>Destino</th><th>Página</th><th>Atualização</th><th>Ações</th></tr></thead>
          <tbody>${redirects.length ? advancedRedirectRows(redirects) : '<tr><td colspan="5">Nenhum redirecionamento registrado.</td></tr>'}</tbody>
        </table>
      </section>

      <section class="admin-section">
        <h2>Aliases registrados</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="aliases de título">
          <thead><tr><th>Alias</th><th>URL</th><th>Destino</th><th>Criação</th><th>Ações</th></tr></thead>
          <tbody>${aliases.length ? advancedAliasRows(aliases) : '<tr><td colspan="5">Nenhum alias registrado.</td></tr>'}</tbody>
        </table>
      </section>
    </article>
  `
}

function adminStatusLabel(page) {
  if (page.status === 'deleted') return 'apagada'
  if (page.isLocked) return 'bloqueada'
  return 'publicada'
}

function adminPagesRows(pages = []) {
  return pages.map(page => `
    <tr>
      <td>
        <strong><a href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">${escapeHtml(page.title)}</a></strong>
        <br /><code>${escapeHtml(page.slug)}</code>
      </td>
      <td>${escapeHtml((page.categories || []).join(', ') || 'sem categoria')}</td>
      <td>${escapeHtml(adminStatusLabel(page))}</td>
      <td data-sort-value="${escapeHtml(page.updatedAt || '')}">${formatDate(page.updatedAt)}</td>
      <td data-sort-value="${Number(page.revisionCount || 0)}">${Number(page.revisionCount || 0).toLocaleString('pt-BR')}</td>
      <td class="admin-actions-cell">
        ${page.status !== 'deleted' ? `
          <a class="secondary-button compact-button" href="${pageUrl(page.slug, 'edit')}" data-link="edit" data-slug="${escapeHtml(page.slug)}">Editar</a>
          <button type="button" class="secondary-button compact-button" data-admin-page-action="${page.isLocked ? 'unlock' : 'lock'}" data-slug="${escapeHtml(page.slug)}">${page.isLocked ? 'Desbloquear' : 'Bloquear'}</button>
          <button type="button" class="secondary-button compact-button" data-admin-page-action="rename" data-slug="${escapeHtml(page.slug)}">Renomear</button>
          <button type="button" class="danger-button compact-button" data-admin-page-action="delete" data-slug="${escapeHtml(page.slug)}">Apagar</button>
        ` : '<span class="muted-text">sem ações</span>'}
      </td>
    </tr>
  `).join('')
}

function brokenLinkRows(links = []) {
  return links.map(link => `
    <tr>
      <td><a href="${pageUrl(link.fromSlug)}" data-link="page" data-slug="${escapeHtml(link.fromSlug)}">${escapeHtml(link.fromTitle || link.fromSlug)}</a></td>
      <td><code>${escapeHtml(link.toSlug)}</code></td>
      <td>${escapeHtml(link.label || '')}</td>
      <td>${Number(link.count || 1).toLocaleString('pt-BR')}</td>
      <td><a href="${pageUrl(link.toSlug, 'edit')}" data-link="edit" data-slug="${escapeHtml(link.toSlug)}">criar</a></td>
    </tr>
  `).join('')
}

function brokenRedirectRows(redirects = []) {
  return redirects.map(redirect => `
    <tr>
      <td><code>${escapeHtml(redirect.fromSlug)}</code></td>
      <td><code>${escapeHtml(redirect.toSlug)}${redirect.fragment ? `#${escapeHtml(redirect.fragment)}` : ''}</code></td>
      <td>${formatDate(redirect.createdAt)}</td>
      <td>${escapeHtml(redirect.createdByEmail || 'não informado')}</td>
    </tr>
  `).join('')
}

function adminNavHtml(active = 'overview') {
  const items = [
    ['overview', '/admin', 'Visão geral'],
    ['pages', '/admin/pages', 'Páginas'],
    ['maintenance', '/admin/maintenance', 'Manutenção'],
    ['redirects', '/admin/redirects', 'Aliases e redirecionamentos'],
    ['storage', '/admin/storage', 'Armazenamento'],
    ['trash', '/admin/trash', 'Lixeira'],
    ['ip', '/admin/ip', 'Endereços IP'],
    ['users', '/admin/users', 'Usuários'],
    ['activity', '/admin/activity', 'Atividade'],
    ['system', '/admin/system', 'Sistema'],
    ['settings', '/admin/settings', 'Configurações globais'],
    ['backup', '/admin/backup', 'Backup e seed'],
    ['proposals', '/admin/proposals', 'Propostas de edição'],
    ['templates', '/admin/templates', 'Criador de templates (teste)']
  ]

  return `
    <nav class="admin-nav" aria-label="Seções administrativas">
      ${items.map(([key, href, label]) => `<a href="${href}" data-link="route"${key === active ? ' class="is-active"' : ''}>${label}</a>`).join('')}
    </nav>
  `
}



function templateStatusLabel(template) {
  return template.status === 'disabled' ? 'bloqueado' : 'ativo'
}

function templateRows(templates = []) {
  return templates.map(template => `
    <tr>
      <td>
        <strong>${escapeHtml(template.title)}</strong><br />
        <code>{{${escapeHtml(template.slug)}}}</code>
      </td>
      <td>${escapeHtml(template.groupName || 'Geral')}</td>
      <td>${escapeHtml(template.kind || 'template')}</td>
      <td>${escapeHtml(template.minRole || 'guest')}</td>
      <td>${escapeHtml(templateStatusLabel(template))}</td>
      <td>${escapeHtml(template.description || '')}</td>
      <td>
        <details>
          <summary>ver chamada e renderização</summary>
          <strong>chamada</strong>
          <pre><code>${escapeHtml(template.call || template.content || '')}</code></pre>
          <strong>renderização</strong>
          <pre><code>${escapeHtml(template.render || '')}</code></pre>
        </details>
      </td>
      <td class="admin-actions-cell">
        <button class="secondary-button compact-button" type="button" data-template-edit data-template-id="${escapeHtml(template.id)}">Editar</button>
        <button class="secondary-button compact-button" type="button" data-template-toggle data-template-id="${escapeHtml(template.id)}" data-template-status="${escapeHtml(template.status)}">${template.status === 'disabled' ? 'Liberar uso' : 'Bloquear uso'}</button>
        <button class="danger-button compact-button" type="button" data-template-delete data-template-id="${escapeHtml(template.id)}">Deletar</button>
      </td>
    </tr>
  `).join('')
}

function templateLibraryCards(templates = []) {
  return templates.map(template => `
    <article class="template-library-card${template.status === 'disabled' ? ' is-disabled' : ''}" data-template-library-card data-template-card-id="${escapeHtml(template.id)}">
      <button type="button" data-template-edit data-template-id="${escapeHtml(template.id)}">
        <span>${escapeHtml(template.title || template.slug)}</span>
        <code>{{${escapeHtml(template.slug || template.title)}}}</code>
      </button>
      <small>${escapeHtml(template.groupName || 'Geral')} · ${escapeHtml(templateStatusLabel(template))}</small>
    </article>
  `).join('')
}

function templateRenderToolbarHtml() {
  return `
    <div class="editor-toolbar template-editor-toolbar" role="toolbar" aria-label="Ferramentas de template">
      <button type="button" data-template-tool="templatebox" title="Estrutura de template">▣ templatebox</button>
      <button type="button" data-template-tool="parameter" title="Parâmetro">{{{ }}}</button>
      <button type="button" data-template-tool="title" title="Título parametrizado">título</button>
      <button type="button" data-template-tool="image" title="Imagem parametrizada">imagem</button>
      <button type="button" data-template-tool="footer" title="Rodapé">rodapé</button>
      <button type="button" data-template-tool="issues" title="Lista de problemas">lista</button>
      <button type="button" data-template-tool="link" title="Link interno">[[ ]]</button>
    </div>
  `
}

export function adminTemplatesHtml(templates = []) {
  const data = JSON.stringify(templates || []).replace(/</g, '\\u003c')
  return `
    <article class="admin-page admin-dashboard-page" data-admin-templates-page data-templates-json="${escapeHtml(data)}">
      <header class="article-header">
        <h1>Criador de templates <span class="beta-badge">em fase de testes</span></h1>
        <p class="article-subtitle">Templates funcionam como predefinições de wiki em fase de testes: chamadas <code>{{Template|campo=valor}}</code>, parâmetros, imagens, ícones e layout próprio.</p>
      </header>

      ${adminNavHtml('templates')}

      <section class="template-workbench" aria-label="Editor de templates">
        <aside class="template-library-panel">
          <div class="template-library-header">
            <div>
              <h2>Templates <span class="beta-badge">teste</span></h2>
              <p>Escolha um item para editar ou crie uma predefinição nova. Ainda pode mudar bastante.</p>
            </div>
            <button class="secondary-button compact-button" type="button" data-template-reset>Novo</button>
          </div>
          <div class="template-library-list">
            ${templates.length ? templateLibraryCards(templates) : '<p class="empty-state">Nenhum template registrado.</p>'}
          </div>
        </aside>

        <form class="editor-panel template-editor-panel" data-template-form>
          <input type="hidden" name="id" />

          <div class="template-editor-heading">
            <div>
              <h2 data-template-editor-title>Novo template</h2>
              <p class="article-subtitle">Edite a chamada, a aparência e a renderização em um fluxo parecido com o editor de artigos. Sistema em fase de testes.</p>
            </div>
            <div class="editor-actions template-editor-actions">
              <button class="primary-button" type="submit">Salvar template</button>
              <button class="secondary-button" type="button" data-template-reset>Novo template</button>
            </div>
          </div>

          <section class="template-editor-card">
            <h3>Identidade e uso</h3>
            <div class="template-editor-grid">
              <label>
                Título
                <input name="title" required placeholder="Múltiplos problemas" />
              </label>
              <label>
                Nome da chamada
                <input name="slug" placeholder="multiplos-problemas" />
              </label>
              <label>
                Grupo
                <input name="groupName" value="Manutenção" />
              </label>
              <label>
                Tipo visual
                <select name="kind">
                  <option value="maintenance">manutenção</option>
                  <option value="delete">eliminação</option>
                  <option value="issues">múltiplos problemas</option>
                  <option value="sources">fontes</option>
                  <option value="merge">fusão</option>
                  <option value="stub">esboço</option>
                  <option value="info">informação</option>
                  <option value="custom">customizado</option>
                </select>
              </label>
              <label>
                Uso mínimo
                <select name="minRole">
                  <option value="guest">convidado</option>
                  <option value="editor">editor</option>
                  <option value="moderator">moderador</option>
                  <option value="admin">admin</option>
                  <option value="super_admin">super_admin</option>
                </select>
              </label>
              <label>
                Status
                <select name="status">
                  <option value="active">ativo</option>
                  <option value="disabled">bloqueado</option>
                </select>
              </label>
            </div>
            <label class="template-full-field">
              Descrição de uso
              <input name="description" placeholder="quando usar e que efeito editorial ele tem" />
            </label>
          </section>

          <section class="template-editor-card">
            <h3>Imagem e aparência</h3>
            <div class="template-editor-grid">
              <label>
                Imagem padrão
                <input name="imageUrl" placeholder="/api/files/arquivo/content ou https://..." />
              </label>
              <label>
                Posição da imagem
                <select name="imagePosition">
                  <option value="left">esquerda</option>
                  <option value="right">direita</option>
                  <option value="top">topo</option>
                </select>
              </label>
              <label>
                Cor de destaque
                <input name="accentColor" placeholder="#d18a28" />
              </label>
            </div>
          </section>

          <section class="editor-content-field template-editor-field">
            <label for="template-call-editor">Chamada inserida pela galeria</label>
            <p class="editor-note">É isso que aparece no artigo quando alguém escolhe o template na galeria.</p>
            <textarea id="template-call-editor" class="editor-content-textarea template-call-textarea" name="call" spellcheck="false" required placeholder="{{Múltiplos problemas&#10;|fontes=sim&#10;|revisao=sim&#10;|imagem=/api/files/arquivo/content&#10;}}"></textarea>
          </section>

          <section class="editor-content-field template-editor-field">
            <label for="template-render-editor">Renderização do template</label>
            ${templateRenderToolbarHtml()}
            <textarea id="template-render-editor" class="editor-content-textarea template-render-textarea" name="render" spellcheck="false" required placeholder=":::templatebox issues&#10;title: Foram assinalados vários problemas nesta página ou seção&#10;icon: ⚠️&#10;image: {{{imagem|}}}&#10;accent: #d18a28&#10;&#10;- As fontes não cobrem todo o texto&#10;- Texto necessita de revisão&#10;::: "></textarea>
          </section>

          <details class="template-editor-card template-extra-card" open>
            <summary>Parâmetros e documentação</summary>
            <label class="template-full-field">
              Parâmetros aceitos
              <textarea name="params" spellcheck="false" placeholder="motivo: motivo exibido no aviso&#10;data: mês e ano&#10;imagem: imagem lateral opcional"></textarea>
            </label>
          </details>

          <section class="template-editor-card template-preview-card">
            <div class="template-preview-heading">
              <div>
                <h3>Prévia</h3>
                <p>Usa valores de exemplo da chamada acima para mostrar o resultado antes de salvar.</p>
              </div>
              <button class="secondary-button compact-button" type="button" data-template-refresh-preview>Atualizar prévia</button>
            </div>
            <div class="template-preview-surface" data-template-preview>
              <p class="empty-state">A prévia aparecerá aqui.</p>
            </div>
          </section>

          <div class="editor-actions template-editor-actions template-editor-actions-bottom">
            <button class="primary-button" type="submit">Salvar template</button>
            <button class="secondary-button" type="button" data-template-reset>Novo template</button>
          </div>
          <p class="editor-note" data-template-note>Use <code>{{{parametro|valor padrão}}}</code> na renderização para receber valores da chamada.</p>
        </form>
      </section>

      <details class="admin-section template-raw-list">
        <summary>Lista técnica de templates registrados</summary>
        <table class="history-table admin-table template-admin-table" data-admin-table data-admin-table-label="templates">
          <thead>
            <tr>
              <th>Template</th>
              <th>Grupo</th>
              <th>Tipo</th>
              <th>Uso mínimo</th>
              <th>Status</th>
              <th>Descrição</th>
              <th>Conteúdo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>${templates.length ? templateRows(templates) : '<tr><td colspan="8">Nenhum template registrado.</td></tr>'}</tbody>
        </table>
      </details>
    </article>
  `
}

export function adminDashboardHtml(data = {}) {
  const pageCount = Number(data.pageCount ?? data.pages?.length ?? 0).toLocaleString('pt-BR')
  const brokenLinkCount = Number(data.brokenLinkCount ?? data.maintenance?.brokenLinks?.length ?? 0).toLocaleString('pt-BR')
  const brokenRedirectCount = Number(data.brokenRedirectCount ?? data.maintenance?.brokenRedirects?.length ?? 0).toLocaleString('pt-BR')

  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Administração</h1>
        <p class="article-subtitle">Painel inicial de manutenção da WikiCambada Core.</p>
      </header>

      ${adminNavHtml('overview')}

      <section class="admin-section">
        <h2>Seções administrativas</h2>
        <p>As ferramentas administrativas foram separadas em páginas próprias para reduzir carregamento desnecessário e facilitar manutenção.</p>
        <div class="admin-card-grid">
          <a class="admin-card" href="/admin/pages" data-link="route">
            <strong>Páginas</strong>
            <span>${pageCount} página(s) registradas. Bloqueie, desbloqueie, renomeie ou apague páginas.</span>
          </a>
          <a class="admin-card" href="/admin/maintenance" data-link="route">
            <strong>Manutenção</strong>
            <span>${brokenLinkCount} link(s) quebrado(s) e ${brokenRedirectCount} redirecionamento(s) quebrado(s).</span>
          </a>
          <a class="admin-card" href="/admin/redirects" data-link="route">
            <strong>Aliases e redirecionamentos</strong>
            <span>Gerencie URLs alternativas e destinos com seções específicas.</span>
          </a>
          <a class="admin-card" href="/admin/storage" data-link="route">
            <strong>Armazenamento</strong>
            <span>Gerencie arquivos registrados no D1, objetos R2 e metadados de mídia.</span>
          </a>
          <a class="admin-card" href="/admin/trash" data-link="route">
            <strong>Lixeira dos editores</strong>
            <span>Restaure ou remova definitivamente páginas e mídias deletadas.</span>
          </a>
          <a class="admin-card" href="/admin/users" data-link="route">
            <strong>Usuários</strong>
            <span>Gerencie cargos internos, nomes públicos e status de editores.</span>
          </a>
          <a class="admin-card" href="/admin/activity" data-link="route">
            <strong>Atividade recente</strong>
            <span>Veja últimos usuários, IPs e páginas vistas.</span>
          </a>
          <a class="admin-card" href="/admin/system" data-link="route">
            <strong>Sistema</strong>
            <span>Forçar atualização de cache local ou recarregamento completo dos clientes.</span>
          </a>
          <a class="admin-card" href="/admin/settings" data-link="route">
            <strong>Configurações globais</strong>
            <span>Ative ou desative páginas especiais, colaboração, mídia, busca e outros recursos da instalação.</span>
          </a>
          <a class="admin-card" href="/admin/ip" data-link="route">
            <strong>Endereços IP</strong>
            <span>Bloqueie sugestões públicas ou acesso público por endereço IP.</span>
          </a>
          <a class="admin-card" href="/admin/backup" data-link="route">
            <strong>Backup e seed</strong>
            <span>Exporte o D1 em JSON ou importe seeds/backups.</span>
          </a>
          <a class="admin-card" href="/admin/proposals" data-link="route">
            <strong>Propostas de edição</strong>
            <span>Analise alterações enviadas por visitantes.</span>
          </a>
          <a class="admin-card" href="/admin/templates" data-link="route">
            <strong>Criador de templates</strong>
            <span>Crie, edite, desative ou remova snippets usados no editor Markdown.</span>
          </a>
        </div>
      </section>
    </article>
  `
}

export function adminPagesHtml(data = {}) {
  const pages = data.pages || []

  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Páginas</h1>
        <p class="article-subtitle">Bloqueio, renomeação e exclusão suave de páginas publicadas.</p>
      </header>

      ${adminNavHtml('pages')}

      <section class="admin-section" id="admin-paginas">
        <h2>Páginas registradas</h2>
        <p>Bloqueie, desbloqueie, renomeie ou apague páginas publicadas. A exclusão é suave e preserva o histórico no D1.</p>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="páginas">
          <thead>
            <tr>
              <th>Página</th>
              <th>Categorias</th>
              <th>Status</th>
              <th>Atualização</th>
              <th>Revisões</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>${pages.length ? adminPagesRows(pages) : '<tr><td colspan="6">Nenhuma página registrada.</td></tr>'}</tbody>
        </table>
      </section>
    </article>
  `
}

export function adminMaintenanceHtml(maintenance = {}) {
  const brokenLinks = maintenance.brokenLinks || []
  const brokenRedirects = maintenance.brokenRedirects || []

  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Manutenção</h1>
        <p class="article-subtitle">Relatórios de links internos e redirecionamentos quebrados.</p>
      </header>

      ${adminNavHtml('maintenance')}

      <section class="admin-section" id="admin-manutencao">
        <h2>Páginas quebradas</h2>
        <p>Links internos encontrados em artigos que não apontam para página, alias, redirecionamento, categoria ou arquivo existente.</p>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="links quebrados">
          <thead>
            <tr>
              <th>Origem</th>
              <th>Destino ausente</th>
              <th>Rótulo</th>
              <th>Ocorrências</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>${brokenLinks.length ? brokenLinkRows(brokenLinks) : '<tr><td colspan="5">Nenhum link interno quebrado encontrado.</td></tr>'}</tbody>
        </table>

        <h2>Redirecionamentos quebrados</h2>
        <p>Redirecionamentos cujo destino não existe mais ou aponta para ele mesmo.</p>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="redirecionamentos quebrados">
          <thead>
            <tr>
              <th>Origem</th>
              <th>Destino</th>
              <th>Criação</th>
              <th>Criado por</th>
            </tr>
          </thead>
          <tbody>${brokenRedirects.length ? brokenRedirectRows(brokenRedirects) : '<tr><td colspan="4">Nenhum redirecionamento quebrado encontrado.</td></tr>'}</tbody>
        </table>
      </section>
    </article>
  `
}

export function adminBackupHtml() {
  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Backup e seed</h1>
        <p class="article-subtitle">Exportação e importação básica de conteúdo do D1.</p>
      </header>

      ${adminNavHtml('backup')}

      <section class="admin-section" id="admin-backup">
        <h2>Exportar backup</h2>
        <p>Exporte o conteúdo do D1 em JSON. Arquivos R2 não são embutidos; apenas seus metadados são listados.</p>
        <div class="editor-actions">
          <a class="primary-button" href="/api/secure/admin/backup" rel="noreferrer">Exportar backup</a>
        </div>

        <h2>Importar seed</h2>
        <form class="admin-import-form" data-admin-import-form>
          <label>
            Importar seed ou backup JSON<br />
            <textarea name="seed" spellcheck="false" placeholder="cole aqui um JSON com pages[] ou um backup exportado por esta instalação"></textarea>
          </label>
          <div class="editor-actions">
            <button class="secondary-button" type="submit">Importar seed</button>
          </div>
          <p class="editor-note" data-admin-import-note>Importação cria novas revisões para páginas existentes.</p>
        </form>
      </section>
    </article>
  `
}

function storageFileRows(files = []) {
  return files.map(file => `
    <tr>
      <td>
        <strong><a href="${pageUrl(`arquivo/${file.slug}`)}" data-link="page" data-slug="arquivo/${escapeHtml(file.slug)}">${escapeHtml(file.filename)}</a></strong><br />
        <code>${escapeHtml(file.slug)}</code>
      </td>
      <td>${escapeHtml(file.mimeType || '')}</td>
      <td data-sort-value="${Number(file.sizeBytes || 0)}">${formatBytes(file.sizeBytes)}</td>
      <td data-sort-value="${escapeHtml(file.createdAt || '')}">${formatDate(file.createdAt)}</td>
      <td>${escapeHtml(file.uploadedByEmail || 'não informado')}</td>
      <td>
        <button class="secondary-button compact-button" type="button" data-admin-file-edit data-slug="${escapeHtml(file.slug)}" data-filename="${escapeHtml(file.filename)}" data-description="${escapeHtml(file.description || '')}">editar</button>
        <button class="danger-button compact-button" type="button" data-admin-file-delete data-slug="${escapeHtml(file.slug)}">deletar</button>
      </td>
    </tr>
  `).join('')
}

function storageTableRows(tables = []) {
  return tables.map(item => `
    <tr>
      <td><code>${escapeHtml(item.table)}</code></td>
      <td data-sort-value="${Number(item.rows || 0)}">${Number(item.rows || 0).toLocaleString('pt-BR')}</td>
    </tr>
  `).join('')
}

function r2ObjectRows(objects = []) {
  return objects.map(object => `
    <tr>
      <td><code>${escapeHtml(object.key)}</code></td>
      <td data-sort-value="${Number(object.size || 0)}">${formatBytes(object.size)}</td>
      <td data-sort-value="${escapeHtml(object.uploaded || '')}">${escapeHtml(object.uploaded || '')}</td>
    </tr>
  `).join('')
}

export function adminStorageHtml(data = {}, query = '') {
  const files = data.files || []
  const tables = data.d1Tables || []
  const r2Objects = data.r2Objects || []

  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Armazenamento</h1>
        <p class="article-subtitle">Gerenciamento básico de metadados D1 e arquivos enviados ao R2.</p>
      </header>

      ${adminNavHtml('storage')}

      <section class="admin-section">
        <h2>Resumo</h2>
        <div class="admin-card-grid">
          <div class="admin-card"><strong>Arquivos registrados</strong><span>${files.length.toLocaleString('pt-BR')} item(ns) carregado(s) nesta consulta.</span></div>
          <div class="admin-card"><strong>Volume listado</strong><span>${formatBytes(data.totalUploadBytes || 0)} em uploads retornados.</span></div>
          <div class="admin-card"><strong>Objetos R2 listados</strong><span>${Number(data.r2ObjectCount || 0).toLocaleString('pt-BR')} objeto(s) no prefixo uploads/.</span></div>
        </div>
      </section>

      <section class="admin-section">
        <h2>Mídia registrada</h2>
        <form class="admin-inline-form" data-admin-storage-search>
          <label>
            Pesquisar mídia<br />
            <input type="search" name="q" value="${escapeHtml(query)}" placeholder="nome, slug ou descrição" />
          </label>
          <button class="secondary-button" type="submit">Pesquisar</button>
        </form>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="mídia registrada">
          <thead><tr><th>Arquivo</th><th>Tipo</th><th>Tamanho</th><th>Envio</th><th>Autor</th><th>Ações</th></tr></thead>
          <tbody>${files.length ? storageFileRows(files) : '<tr><td colspan="6">Nenhum arquivo encontrado.</td></tr>'}</tbody>
        </table>
      </section>

      <section class="admin-section">
        <h2>Dados D1</h2>
        <p>Contagem básica das tabelas principais. Para editar conteúdo de páginas, use as telas de edição, propostas e backup.</p>
        <table class="history-table admin-table compact-table" data-admin-table data-admin-table-label="tabelas D1">
          <thead><tr><th>Tabela</th><th>Linhas</th></tr></thead>
          <tbody>${tables.length ? storageTableRows(tables) : '<tr><td colspan="2">Nenhuma tabela encontrada.</td></tr>'}</tbody>
        </table>
      </section>

      <section class="admin-section">
        <h2>Objetos R2 recentes</h2>
        <p>Lista limitada aos primeiros objetos retornados pelo R2 no prefixo <code>uploads/</code>.</p>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="objetos R2">
          <thead><tr><th>Chave R2</th><th>Tamanho</th><th>Upload</th></tr></thead>
          <tbody>${r2Objects.length ? r2ObjectRows(r2Objects) : '<tr><td colspan="3">Nenhum objeto R2 listado ou bucket indisponível.</td></tr>'}</tbody>
        </table>
      </section>
    </article>
  `
}

function ipRuleLabel(action) {
  if (action === 'ban_site') return 'Bloquear acesso público ao site'
  if (action === 'block_suggestions') return 'Bloquear sugestões'
  return action
}

function ipRuleRows(rules = []) {
  return rules.map(rule => `
    <tr>
      <td><code>${escapeHtml(rule.ip)}</code></td>
      <td>${escapeHtml(ipRuleLabel(rule.action))}</td>
      <td>${escapeHtml(rule.reason || '')}</td>
      <td data-sort-value="${escapeHtml(rule.createdAt || '')}">${formatDate(rule.createdAt)}</td>
      <td>${escapeHtml(rule.createdByEmail || 'não informado')}</td>
      <td><button class="danger-button compact-button" type="button" data-admin-ip-delete data-id="${escapeHtml(rule.id)}">remover</button></td>
    </tr>
  `).join('')
}

export function adminIpHtml(rules = []) {
  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Endereços IP</h1>
        <p class="article-subtitle">Bloqueio básico de sugestões públicas e acesso público por endereço IP ou faixa CIDR.</p>
      </header>

      ${adminNavHtml('ip')}

      <section class="admin-section">
        <h2>Nova regra</h2>
        <form class="admin-ip-form" data-admin-ip-form>
          <label>
            Endereço IP<br />
            <input name="ip" placeholder="203.0.113.10, 203.0.113.0/24 ou 2001:db8::/32" required />
          </label>
          <label>
            Ação<br />
            <select name="action">
              <option value="block_suggestions">Bloquear sugestões</option>
              <option value="ban_site">Bloquear acesso público ao site</option>
            </select>
          </label>
          <label>
            Motivo<br />
            <input name="reason" placeholder="motivo administrativo" />
          </label>
          <button class="secondary-button" type="submit">Adicionar regra</button>
          <p class="editor-note" data-admin-ip-note>Aceita IPv4, IPv6 e CIDR. O bloqueio de site não bloqueia /admin nem /api/secure, para evitar travamento administrativo acidental.</p>
        </form>
      </section>

      <section class="admin-section">
        <h2>Regras ativas</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="endereços IP">
          <thead><tr><th>IP/CIDR</th><th>Ação</th><th>Motivo</th><th>Criação</th><th>Criado por</th><th>Ações</th></tr></thead>
          <tbody>${rules.length ? ipRuleRows(rules) : '<tr><td colspan="6">Nenhuma regra de IP registrada.</td></tr>'}</tbody>
        </table>
      </section>
    </article>
  `
}

function roleLabel(role) {
  if (role === 'super_admin') return 'super administrador'
  if (role === 'admin') return 'administrador'
  if (role === 'moderator') return 'moderador'
  return 'editor'
}

function userRows(users = []) {
  return users.map(user => `
    <tr>
      <td><strong>${escapeHtml(user.displayName || user.email)}</strong><br /><code>${escapeHtml(user.email)}</code></td>
      <td>${escapeHtml(roleLabel(user.role))}</td>
      <td>${escapeHtml(user.status || 'active')}</td>
      <td data-sort-value="${escapeHtml(user.lastSeenAt || '')}">${user.lastSeenAt ? formatDate(user.lastSeenAt) : 'sem registro'}</td>
      <td><code>${escapeHtml(user.lastSeenIp || '')}</code><br />${escapeHtml(user.lastSeenPath || '')}</td>
      <td>
        ${user.role === 'super_admin' ? '<span class="editor-note">fixo</span>' : `
          <button class="secondary-button compact-button" type="button" data-admin-user-edit data-email="${escapeHtml(user.email)}" data-name="${escapeHtml(user.displayName || '')}" data-role="${escapeHtml(user.role)}" data-status="${escapeHtml(user.status || 'active')}">editar</button>
          <button class="danger-button compact-button" type="button" data-admin-user-delete data-email="${escapeHtml(user.email)}">remover</button>
        `}
      </td>
    </tr>
  `).join('')
}

export function adminUsersHtml(data = {}) {
  const users = data.users || []
  const current = data.currentUser || {}
  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Usuários</h1>
        <p class="article-subtitle">Cargos internos de ${escapeHtml(SITE_NAME)}. O Cloudflare Access autentica; o Core decide a função.</p>
      </header>

      ${adminNavHtml('users')}

      <section class="admin-section">
        <h2>Meu perfil</h2>
        <form class="admin-inline-form" data-profile-form>
          <label>
            Nome público<br />
            <input name="displayName" value="${escapeHtml(current.displayName || current.name || '')}" placeholder="usar e-mail se vazio" />
          </label>
          <button class="secondary-button" type="submit">Salvar meu nome</button>
          <p class="editor-note" data-profile-note>Conta atual: <code>${escapeHtml(current.email || '')}</code> · cargo: ${escapeHtml(roleLabel(current.role))}</p>
        </form>
      </section>

      <section class="admin-section">
        <h2>Editar usuário</h2>
        <form class="admin-inline-form" data-user-form>
          <label>E-mail<br /><input name="email" placeholder="editor@exemplo.invalid" required /></label>
          <label>Nome público<br /><input name="displayName" placeholder="opcional" /></label>
          <label>Cargo<br />
            <select name="role">
              <option value="editor">editor</option>
              <option value="moderator">moderador</option>
              <option value="admin">administrador</option>
            </select>
          </label>
          <label>Status<br />
            <select name="status">
              <option value="active">ativo</option>
              <option value="disabled">desativado</option>
            </select>
          </label>
          <button class="secondary-button" type="submit">Salvar usuário</button>
          <p class="editor-note" data-user-note>Administradores não podem alterar nem remover o super administrador.</p>
        </form>
      </section>

      <section class="admin-section">
        <h2>Usuários registrados</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="usuários">
          <thead><tr><th>Usuário</th><th>Cargo</th><th>Status</th><th>Último acesso</th><th>IP/página</th><th>Ações</th></tr></thead>
          <tbody>${users.length ? userRows(users) : '<tr><td colspan="6">Nenhum usuário registrado.</td></tr>'}</tbody>
        </table>
      </section>
    </article>
  `
}

function activityLocationLabel(item) {
  const main = [item.ipCity, item.ipRegion, item.ipCountry].map(value => String(value || '').trim()).filter(Boolean).join(', ')
  const extra = [item.ipColo ? `colo ${item.ipColo}` : '', item.ipTimezone || ''].filter(Boolean).join(' · ')
  if (main && extra) return `${main} (${extra})`
  return main || extra || 'não informado'
}

function activityRows(activity = []) {
  return activity.map(item => `
    <tr>
      <td data-sort-value="${escapeHtml(item.createdAt || '')}">${formatDate(item.createdAt)}</td>
      <td>${escapeHtml(item.displayName || item.email || 'visitante')}</td>
      <td>${escapeHtml(roleLabel(item.role))}</td>
      <td><code>${escapeHtml(item.ip || 'não informado')}</code></td>
      <td>${escapeHtml(activityLocationLabel(item))}</td>
      <td><code>${escapeHtml(item.path || '')}</code></td>
      <td>${escapeHtml(item.userAgent || '')}</td>
    </tr>
  `).join('')
}

export function adminActivityHtml(activity = []) {
  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Atividade recente</h1>
        <p class="article-subtitle">Últimos usuários, IPs e páginas vistas. Localização vem dos metadados de rede da Cloudflare quando disponíveis.</p>
      </header>
      ${adminNavHtml('activity')}
      <section class="admin-section">
        <div class="admin-section-actions">
          <button class="danger-button" type="button" data-admin-clear-activity>Limpar dados de atividade</button>
        </div>
        <p class="editor-note" data-admin-activity-note>Esta ação apaga apenas o registro de atividade recente. Ela não altera páginas, usuários ou revisões.</p>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="atividade recente">
          <thead><tr><th>Data</th><th>Usuário</th><th>Cargo</th><th>IP</th><th>Localização</th><th>Página</th><th>User-Agent</th></tr></thead>
          <tbody>${activity.length ? activityRows(activity) : '<tr><td colspan="7">Nenhuma atividade recente registrada.</td></tr>'}</tbody>
        </table>
      </section>
    </article>
  `
}

function trashPageRows(pages = []) {
  return pages.map(page => `
    <tr>
      <td><strong>${escapeHtml(page.title)}</strong><br /><code>${escapeHtml(page.slug)}</code></td>
      <td data-sort-value="${escapeHtml(page.deletedAt || '')}">${page.deletedAt ? formatDate(page.deletedAt) : 'sem data'}</td>
      <td>${escapeHtml(page.deletedByEmail || 'não informado')}</td>
      <td data-sort-value="${escapeHtml(page.purgeAfter || '')}">${page.purgeAfter ? formatDate(page.purgeAfter) : 'não definido'}</td>
      <td class="admin-actions-cell">
        <button class="secondary-button compact-button" type="button" data-trash-action="restore" data-kind="page" data-slug="${escapeHtml(page.slug)}">restaurar</button>
        <button class="danger-button compact-button" type="button" data-trash-action="hard-delete" data-kind="page" data-slug="${escapeHtml(page.slug)}">deletar definitivamente</button>
      </td>
    </tr>
  `).join('')
}

function trashFileRows(files = []) {
  return files.map(file => `
    <tr>
      <td><strong>${escapeHtml(file.filename)}</strong><br /><code>${escapeHtml(file.slug)}</code></td>
      <td>${escapeHtml(file.mimeType || '')}</td>
      <td data-sort-value="${Number(file.sizeBytes || 0)}">${formatBytes(file.sizeBytes)}</td>
      <td data-sort-value="${escapeHtml(file.deletedAt || '')}">${file.deletedAt ? formatDate(file.deletedAt) : 'sem data'}</td>
      <td data-sort-value="${escapeHtml(file.purgeAfter || '')}">${file.purgeAfter ? formatDate(file.purgeAfter) : 'não definido'}</td>
      <td class="admin-actions-cell">
        <button class="secondary-button compact-button" type="button" data-trash-action="restore" data-kind="file" data-slug="${escapeHtml(file.slug)}">restaurar</button>
        <button class="danger-button compact-button" type="button" data-trash-action="hard-delete" data-kind="file" data-slug="${escapeHtml(file.slug)}">deletar definitivamente</button>
      </td>
    </tr>
  `).join('')
}

export function adminTrashHtml(trash = {}) {
  const pages = trash.pages || []
  const files = trash.files || []
  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Lixeira dos editores</h1>
        <p class="article-subtitle">Páginas e mídias ficam disponíveis para restauração por 30 dias antes da remoção definitiva.</p>
      </header>
      ${adminNavHtml('trash')}
      <section class="admin-section">
        <div class="editor-actions">
          <button class="secondary-button" type="button" data-trash-purge-expired>Apagar expirados agora</button>
        </div>
        <p class="editor-note" data-trash-note>A limpeza automática é oportunista: acontece ao abrir ou acionar esta tela.</p>
      </section>
      <section class="admin-section">
        <h2>Páginas</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="páginas na lixeira">
          <thead><tr><th>Página</th><th>Exclusão</th><th>Excluída por</th><th>Expira em</th><th>Ações</th></tr></thead>
          <tbody>${pages.length ? trashPageRows(pages) : '<tr><td colspan="5">Nenhuma página na lixeira.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="admin-section">
        <h2>Mídia</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="mídia na lixeira">
          <thead><tr><th>Arquivo</th><th>Tipo</th><th>Tamanho</th><th>Exclusão</th><th>Expira em</th><th>Ações</th></tr></thead>
          <tbody>${files.length ? trashFileRows(files) : '<tr><td colspan="6">Nenhum arquivo na lixeira.</td></tr>'}</tbody>
        </table>
      </section>
    </article>
  `
}

export function adminSystemHtml(status = {}) {
  const cache = status.cacheVersion || {}
  const reload = status.reloadVersion || {}
  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Sistema</h1>
        <p class="article-subtitle">Ações globais de atualização do WikiCambada Core.</p>
      </header>
      ${adminNavHtml('system')}
      <section class="admin-section">
        <h2>Atualização de clientes</h2>
        <div class="admin-card-grid">
          <div class="admin-card"><strong>Cache local</strong><span>Versão ${Number(cache.value || 0).toLocaleString('pt-BR')} · ${cache.updatedAt ? formatDate(cache.updatedAt) : 'nunca'}</span></div>
          <div class="admin-card"><strong>Recarregamento completo</strong><span>Versão ${Number(reload.value || 0).toLocaleString('pt-BR')} · ${reload.updatedAt ? formatDate(reload.updatedAt) : 'nunca'}</span></div>
        </div>
        <div class="editor-actions">
          <button class="secondary-button" type="button" data-system-action="force-cache">Forçar atualização de cache local (rápido)</button>
          <button class="danger-button" type="button" data-system-action="force-reload">Forçar recarregar usuários conectados (completo)</button>
        </div>
        <p class="editor-note" data-system-note>Clientes abertos verificam essas versões periodicamente.</p>
      </section>
    </article>
  `
}


export function featureDisabledHtml(title, description = '') {
  return `
    <article class="wiki-article special-page">
      <header class="article-header">
        <h1>${escapeHtml(title)}</h1>
        <p class="article-subtitle">Este recurso foi desativado nas configurações globais desta instalação.</p>
      </header>
      ${description ? `<p>${escapeHtml(description)}</p>` : ''}
      <p><a href="${pageUrl(HOME_SLUG)}" data-link="home">Voltar à página principal</a></p>
    </article>
  `
}

export function specialPagesIndexHtml() {
  const pages = [
    ['specialPages.allPages', 'Todas as páginas', 'Lista alfabética de páginas publicadas.', 'especial/todas-as-paginas'],
    ['specialPages.recentPages', 'Páginas recentes', 'Páginas ordenadas pela revisão mais recente.', 'especial/paginas-recentes'],
    ['specialPages.categories', 'Categorias', 'Índice das categorias registradas.', 'especial/categorias'],
    ['specialPages.randomPage', 'Página aleatória', 'Abre uma página publicada aleatória.', 'especial/pagina-aleatoria'],
    ['specialPages.version', 'Versão', 'Versão do WikiCambada Core e estado do sistema.', 'especial/versao']
  ].filter(([feature]) => {
    if (!featureEnabled(feature)) return false
    if (feature === 'specialPages.categories') return featureEnabled('categories')
    if (feature === 'specialPages.randomPage') return featureEnabled('randomPage')
    return true
  })

  return `
    <article class="wiki-article special-page">
      <header class="article-header">
        <h1>Especial: Páginas especiais</h1>
        <p class="article-subtitle">Recursos gerados pelo WikiCambada Core para esta instalação.</p>
      </header>
      <div class="special-page-grid">
        ${pages.length ? pages.map(([, title, description, slug]) => `
          <a class="special-page-card" href="${pageUrl(slug)}" data-link="page" data-slug="${escapeHtml(slug)}">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(description)}</span>
          </a>
        `).join('') : '<p class="empty-state">Nenhuma página especial está habilitada.</p>'}
      </div>
    </article>
  `
}

function settingToggle(path, label, description, settings) {
  const value = String(path || '').split('.').reduce((current, key) => current?.[key], settings)
  return `
    <label class="global-setting-toggle">
      <span class="global-setting-control">
        <input type="checkbox" name="${escapeHtml(path)}"${value !== false ? ' checked' : ''} />
        <strong>${escapeHtml(label)}</strong>
      </span>
      <small>${escapeHtml(description)}</small>
    </label>
  `
}

export function adminSettingsHtml(settings = {}) {
  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>Configurações globais</h1>
        <p class="article-subtitle">Recursos e páginas que alteram o comportamento da instalação para todos os usuários.</p>
      </header>
      ${adminNavHtml('settings')}
      <form class="admin-section global-settings-form" data-global-settings-form>
        <section class="global-settings-group">
          <h2>Páginas especiais</h2>
          <p>As páginas abaixo são geradas pelo back-end e nunca podem ser editadas, sugeridas ou receber histórico editorial.</p>
          <div class="global-settings-grid">
            ${settingToggle('specialPages.index', 'Índice de páginas especiais', 'Mostra /wiki/especial com a lista de recursos especiais disponíveis.', settings)}
            ${settingToggle('specialPages.version', 'Versão', 'Mostra informações do WikiCambada Core e do estado do sistema.', settings)}
            ${settingToggle('specialPages.recentPages', 'Páginas recentes', 'Lista artigos pela revisão mais recente.', settings)}
            ${settingToggle('specialPages.allPages', 'Todas as páginas', 'Lista todas as páginas publicadas em ordem alfabética.', settings)}
            ${settingToggle('specialPages.categories', 'Categorias', 'Mostra o índice de categorias registradas.', settings)}
            ${settingToggle('specialPages.randomPage', 'Página aleatória', 'Permite encaminhar visitantes para uma página publicada aleatória.', settings)}
          </div>
        </section>

        <section class="global-settings-group">
          <h2>Conteúdo e colaboração</h2>
          <div class="global-settings-grid">
            ${settingToggle('talkPages', 'Páginas de discussão', 'Ativa o namespace Discussão e suas abas.', settings)}
            ${settingToggle('userPages', 'Páginas de usuário', 'Ativa o namespace Usuário.', settings)}
            ${settingToggle('publicSuggestions', 'Sugestões públicas', 'Visitantes podem enviar propostas de edição.', settings)}
            ${settingToggle('pageHistory', 'Histórico público', 'Exibe revisões e comparação de versões.', settings)}
            ${settingToggle('mediaUploads', 'Uploads de mídia', 'Permite enviar imagens, vídeos e áudios ao R2.', settings)}
            ${settingToggle('templates', 'Templates editoriais', 'Ativa a galeria e a expansão de predefinições.', settings)}
          </div>
        </section>

        <section class="global-settings-group">
          <h2>Navegação e sistema</h2>
          <div class="global-settings-grid">
            ${settingToggle('search', 'Busca', 'Ativa a busca e o autocomplete.', settings)}
            ${settingToggle('categories', 'Categorias em artigos', 'Ativa páginas, links e índices de categoria.', settings)}
            ${settingToggle('randomPage', 'Navegação aleatória', 'Ativa o atalho geral para página aleatória.', settings)}
            ${settingToggle('coreBadge', 'Selo Powered by', 'Mostra o selo Powered by WikiCambada Core no rodapé.', settings)}
            ${settingToggle('activityLogging', 'Atividade recente', 'Permite registrar atividade administrativa quando disponível.', settings)}
          </div>
        </section>

        <div class="editor-actions">
          <button class="primary-button" type="submit">Salvar configurações globais</button>
        </div>
        <p class="editor-note" data-global-settings-note>As mudanças são gravadas no D1 e aplicadas para todos os usuários no próximo carregamento.</p>
      </form>
    </article>
  `
}
