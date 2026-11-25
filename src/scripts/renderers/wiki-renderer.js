import { APP_VERSION, SLOGAN, HOME_SLUG, SITE_CONFIG, SITE_NAME, featureEnabled } from '../core/config.js'
import { interfaceLanguage, interfaceLocale } from '../core/i18n.js'
import { applyTemplateVars, escapeHtml, formatDate, isCurrentAppUrl, pageUrl, searchUrl, slugify, titleFromSlug } from '../core/utils.js'
import { extractHeadings, inlineMarkdown, markdownToHtml } from './wiki-markdown.js'

const ui = (portuguese, english) => interfaceLanguage() === 'en' ? english : portuguese

function safePublicUrl(value) {
  try {
    const parsed = new URL(String(value || ''), window.location.href)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return ''
    return isCurrentAppUrl(parsed.href) ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.href
  } catch {
    return ''
  }
}

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
    const src = safePublicUrl(image.src || image.url || image.image || '')
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

  return `<div class="categories">${ui('Categorias', 'Categories')}: ${categories.map(category => `<a href="${categoryUrl(category)}" data-link="page" data-slug="categoria/${slugify(category)}">${escapeHtml(category)}</a>`).join(' · ')}</div>`
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
      'tabindex="0"'
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
    `<a href="${pageUrl(HOME_SLUG)}" data-link="home">${ui('Página principal', 'Main page')}</a>`
  ]

  if (page?.slug?.startsWith('categoria/')) {
    crumbs.push(`<a href="${pageUrl('categorias')}" data-link="page" data-slug="categorias">${ui('Categorias', 'Categories')}</a>`)
  } else if (page?.categories?.length) {
    const category = page.categories[0]
    crumbs.push(`<a href="${categoryUrl(category)}" data-link="page" data-slug="categoria/${slugify(category)}">${escapeHtml(category)}</a>`)
  }

  if (page?.title) crumbs.push(`<span>${escapeHtml(page.title)}</span>`)

  return `<nav class="breadcrumbs" aria-label="${ui('Caminho', 'Breadcrumb')}">${crumbs.join('<span aria-hidden="true">›</span>')}</nav>`
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
      <summary><strong>${ui('Índice', 'Contents')}</strong> <span class="toc-toggle-label" aria-hidden="true"></span></summary>
      ${tocListHtml(tocTree(headings))}
    </details>
  `
}


function resolvedNoticeHtml(page) {
  if (!page?.resolvedFrom) return ''

  const kind = page.resolvedBy === 'redirect' ? ui('redirecionamento', 'redirect') : ui('alias de título', 'title alias')
  return `
    <aside class="messagebox messagebox-info resolved-notice">
      ${ui('Esta página foi aberta por', 'This page was opened through a')} ${kind}: <code>${escapeHtml(page.resolvedFrom)}</code>.
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
    <section class="article-aliases" aria-label="${ui('Aliases e redirecionamentos', 'Aliases and redirects')}">
      ${aliases.length ? `<p><strong>${ui("Aliases:", "Aliases:")}</strong> ${aliases.map(alias => `<code>${escapeHtml(alias.title || alias.slug)}</code>`).join(' ')}</p>` : ''}
      ${redirectRules.length ? `<p><strong>${ui('Redirecionamentos', 'Redirects')}:</strong> ${redirectRules.map(rule => `<code>${escapeHtml(rule.fromSlug || rule)}${rule.fragment ? ` → #${escapeHtml(rule.fragment)}` : ''}</code>`).join(' ')}</p>` : ''}
    </section>
  `
}

export function footerHtml(page) {
  const aboutSlug = SITE_CONFIG.site?.aboutSlug || 'sobre'
  const editGuideSlug = SITE_CONFIG.site?.editGuideSlug || (interfaceLocale() === 'en-US' ? 'editing-guide' : 'como-editar')
  const externalLinks = (SITE_CONFIG.navigation?.external || [])
    .map(item => ({ ...item, href: safePublicUrl(item.href) }))
    .filter(item => item.href)
    .map(item => `<a href="${escapeHtml(item.href)}" rel="noreferrer">${escapeHtml(item.label || item.href)}</a>`)
    .join('')
  const historyLink = featureEnabled('pageHistory')
    ? `<a href="${pageUrl(page.slug, 'history')}" data-link="history" data-slug="${escapeHtml(page.slug)}">${ui('Histórico', 'History')}</a>`
    : ''
  const poweredText = featureEnabled('coreBadge')
    ? `<p>Powered by <a href="${pageUrl('especial/versao')}" data-link="page" data-slug="especial/versao">WikiCambada Core</a> <a class="core-version" href="${pageUrl('especial/versao')}" data-link="page" data-slug="especial/versao">${escapeHtml(APP_VERSION)}</a>.</p>`
    : ''
  const cloudflareBadge = featureEnabled('cloudflareBadge')
    ? '<li class="footer-cloudflare-item"><a class="footer-cloudflare-link" href="https://www.cloudflare.com/" target="_blank" rel="noopener noreferrer"><img class="footer-cloudflare-badge" src="/src/media/images/protectedby-cloudflare.png" alt="Protected by Cloudflare" loading="lazy" /></a></li>'
    : ''
  const builtWithCloudflareBadge = featureEnabled('builtWithCloudflareBadge', false)
    ? '<li class="footer-cloudflare-item"><a class="footer-cloudflare-link" href="https://www.cloudflare.com/" target="_blank" rel="noopener noreferrer"><img class="footer-cloudflare-badge footer-cloudflare-built" src="/src/media/images/built-with-cloudflare.svg" alt="Built with Cloudflare" loading="lazy" /></a></li>'
    : ''
  const coreBadge = featureEnabled('coreBadge')
    ? `<li><a class="footer-poweredby-badge" href="${pageUrl('especial/versao')}" data-link="page" data-slug="especial/versao"><img src="${escapeHtml(safePublicUrl(SITE_CONFIG.branding?.poweredByBadge) || '/src/media/images/poweredby-wikicambada-core.png')}" alt="Powered by WikiCambada Core" loading="lazy" /></a></li>`
    : ''
  const poweredBadge = cloudflareBadge || builtWithCloudflareBadge || coreBadge
    ? `<ul class="footer-poweredby-list" aria-label="${ui('Tecnologia usada', 'Technology')}">${cloudflareBadge}${builtWithCloudflareBadge}${coreBadge}</ul>`
    : ''

  return `
    <footer class="footer">
      <div class="footer-main">
        <div class="footer-copy">
          <p>${ui('Esta página foi editada pela última vez em', 'This page was last edited on')} ${formatDate(page.updatedAt || new Date().toISOString())}.</p>
          ${poweredText}
          <nav class="footer-links" aria-label="${ui('Rodapé', 'Footer')}">
            <a href="${pageUrl(aboutSlug)}" data-link="page" data-slug="${escapeHtml(aboutSlug)}">${ui('Sobre', 'About')} ${escapeHtml(SITE_CONFIG.site?.shortName || SITE_NAME)}</a>
            <a href="${pageUrl(editGuideSlug)}" data-link="page" data-slug="${escapeHtml(editGuideSlug)}">${ui('Como editar', 'How to edit')}</a>
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
        <h2>${ui('Pré-visualização', 'Preview')}</h2>
        <p>${ui('Esta visualização é gerada no navegador e pode diferir do resultado publicado pelo back-end.', 'This preview is generated in the browser and may differ from the result published by the back end.')}</p>
      </div>
      ${articleHtml(previewPage, context)}
    </section>
  `
}

export function notFoundHtml(slug, user = { authenticated: false }) {
  const readableTitle = titleFromSlug(slug)
  const canSuggest = featureEnabled('publicSuggestions')
  const action = user.canEdit
    ? `<a class="primary-button" href="${pageUrl(slug, 'edit')}" data-link="edit" data-slug="${escapeHtml(slug)}">${ui('Criar página', 'Create page')}</a>`
    : canSuggest
      ? `<a class="primary-button" href="${pageUrl(slug, 'suggest')}" data-link="suggest" data-slug="${escapeHtml(slug)}">${ui('Sugerir agora', 'Suggest now')}</a>`
      : ''
  const message = user.canEdit
    ? `${ui('A página', 'The page')} <code>${escapeHtml(readableTitle)}</code> ${ui('não existe, mas você pode criá-la agora.', 'does not exist, but you can create it now.')}`
    : canSuggest
      ? `${ui('A página', 'The page')} <code>${escapeHtml(readableTitle)}</code> ${ui('não existe, mas você pode sugeri-la agora.', 'does not exist, but you can suggest it now.')}`
      : `${ui('A página', 'The page')} <code>${escapeHtml(readableTitle)}</code> ${ui('não existe e sugestões públicas estão desativadas.', 'does not exist and public suggestions are disabled.')}`

  return `
    <article class="not-found-page">
      <header class="article-header">
        <h1>${ui('Página não encontrada', 'Page not found')}</h1>
        <p class="article-subtitle">${ui('A página solicitada ainda não possui registro publicado em', 'The requested page has no published record in')} ${escapeHtml(SITE_NAME)}.</p>
      </header>

      <div class="empty-state">
        <p>${message}</p>
        <p>${ui('URL procurada', 'Requested URL')}: <code>${escapeHtml(pageUrl(slug))}</code>.</p>
      </div>

      <div class="editor-actions">
        ${action}
        <a class="secondary-button" href="/" data-link="home">${ui('Voltar à página principal', 'Return to the main page')}</a>
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
      <div><dt>${ui("Revisão", "Revision")}</dt><dd>${escapeHtml(revision.revisionNumber || '')}${revision.isCurrent ? ` <span class="revision-current">${ui("atual", "current")}</span>` : ''}</dd></div>
      <div><dt>${ui("Data", "Date")}</dt><dd>${formatDate(revision.createdAt)}</dd></div>
      <div><dt>${ui("Autor", "Author")}</dt><dd>${escapeHtml(revision.authorName || revision.author || ui("editor não identificado", "unknown editor"))}</dd></div>
      <div><dt>${ui("Resumo", "Summary")}</dt><dd>${escapeHtml(revision.summary || ui("sem resumo", "no summary"))}</dd></div>
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
        <td>${escapeHtml(revision.authorName || revision.author || revision.author_email || ui("editor não identificado", "unknown editor"))}</td>
        <td>${escapeHtml(revision.summary || ui("sem resumo", "no summary"))}</td>
        <td>${revision.isCurrent ? `<span class="revision-current">${ui("atual", "current")}</span>` : escapeHtml(revisionNumber)}</td>
        <td class="history-actions">
          <a href="${historyRoute(page.slug, { revision: revisionNumber })}" data-link="route">${ui("ver", "view")}</a>
          <a href="${historyRoute(page.slug, { compare: revisionNumber })}" data-link="route">${ui("comparar com atual", "compare with current")}</a>
          ${user.canEdit && !revision.isCurrent ? `<button type="button" data-restore-revision="${escapeHtml(revisionNumber)}" data-slug="${escapeHtml(page.slug)}" data-base-revision="${escapeHtml(page.currentRevisionId || '')}">${ui("restaurar", "restore")}</button>` : ''}
        </td>
      </tr>
    `
  }).join('')

  return `
    <article class="history-page">
      <header class="article-header">
        <h1>${ui("Histórico de “", "History of “")}${escapeHtml(page.title)}”</h1>
        <p class="article-subtitle">${ui("Cada edição registrada gera uma revisão associada à página.", "Each saved edit creates a revision associated with the page.")}</p>
      </header>

      <table class="history-table">
        <thead>
          <tr>
            <th>${ui("Data", "Date")}</th>
            <th>${ui("Autor", "Author")}</th>
            <th>${ui("Resumo", "Summary")}</th>
            <th>${ui("Versão", "Version")}</th>
            <th>${ui("Ações", "Actions")}</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="5">${ui("Nenhuma revisão registrada.", "No revisions recorded.")}</td></tr>`}</tbody>
      </table>

      ${footerHtml(page)}
    </article>
  `
}

export function revisionHtml(page, revision, context = {}, user = {}) {
  const revisionPage = {
    ...page,
    title: revision.title || page.title,
    subtitle: revision.subtitle ?? page.subtitle,
    content: revision.content || '',
    categories: revision.categories ?? page.categories ?? [],
    updatedAt: revision.createdAt
  }

  return `
    <article class="revision-page">
      <header class="article-header">
        <h1>${ui("Revisão ", "Revision ")}${escapeHtml(revision.revisionNumber)} de “${escapeHtml(revisionPage.title)}”</h1>
        <p class="article-subtitle">${ui("Esta é uma versão arquivada da página. Ela pode não corresponder ao conteúdo atual.", "This is an archived version of the page and may differ from its current content.")}</p>
      </header>

      ${revisionSummaryHtml(revision)}

      <div class="editor-actions revision-actions">
        <a class="secondary-button" href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">${ui("Ver versão atual", "View current version")}</a>
        <a class="secondary-button" href="${historyRoute(page.slug, { compare: revision.revisionNumber })}" data-link="route">${ui("Comparar com atual", "Compare with current")}</a>
        <a class="secondary-button" href="${pageUrl(page.slug, 'history')}" data-link="history" data-slug="${escapeHtml(page.slug)}">${ui("Voltar ao histórico", "Back to history")}</a>
        ${user.canEdit && !revision.isCurrent ? `<button class="primary-button" type="button" data-restore-revision="${escapeHtml(revision.revisionNumber)}" data-slug="${escapeHtml(page.slug)}" data-base-revision="${escapeHtml(page.currentRevisionId || '')}">${ui("Restaurar esta revisão", "Restore this revision")}</button>` : ''}
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
        <h1>${ui("Comparação de revisões: “", "Revision comparison: “")}${escapeHtml(page.title)}”</h1>
        <p class="article-subtitle">${ui("Comparação simples entre a revisão ", "Comparison between revision ")}${escapeHtml(oldRevision.revisionNumber)}${ui(" e a versão atual.", " and the current version.")}</p>
      </header>

      <section class="comparison-meta">
        <div>
          <h2>${ui("Revisão ", "Revision ")}${escapeHtml(oldRevision.revisionNumber)}</h2>
          ${revisionSummaryHtml(oldRevision)}
        </div>
        <div>
          <h2>${ui("Versão atual", "Current version")}</h2>
          <p>${escapeHtml(currentRevisionNumber)} · editada em ${formatDate(currentPage.updatedAt)}</p>
        </div>
      </section>

      <table class="diff-table">
        <thead>
          <tr>
            <th>${ui("Linha", "Line")}</th>
            <th>${ui("Revisão ", "Revision ")}${escapeHtml(oldRevision.revisionNumber)}</th>
            <th>${ui("Atual", "Current")}</th>
          </tr>
        </thead>
        <tbody>${lineDiffRows(oldRevision.content || '', currentPage.content || '')}</tbody>
      </table>

      <div class="editor-actions revision-actions">
        <a class="secondary-button" href="${historyRoute(page.slug, { revision: oldRevision.revisionNumber })}" data-link="route">${ui("Ver revisão antiga", "View old revision")}</a>
        <a class="secondary-button" href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">${ui("Ver versão atual", "View current version")}</a>
        <a class="secondary-button" href="${pageUrl(page.slug, 'history')}" data-link="history" data-slug="${escapeHtml(page.slug)}">${ui("Voltar ao histórico", "Back to history")}</a>
        ${user.canEdit && !oldRevision.isCurrent ? `<button class="primary-button" type="button" data-restore-revision="${escapeHtml(oldRevision.revisionNumber)}" data-slug="${escapeHtml(page.slug)}" data-base-revision="${escapeHtml(page.currentRevisionId || '')}">${ui("Restaurar revisão ", "Restore revision ")}${escapeHtml(oldRevision.revisionNumber)}</button>` : ''}
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
  return slug.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, letter => letter.toLocaleUpperCase(interfaceLocale()))
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
      return dateB - dateA || String(pageA?.title || '').localeCompare(String(pageB?.title || ''), interfaceLocale())
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
        <h1>${ui('Todas as páginas', 'All pages')}</h1>
        <p class="article-subtitle">${ui('Índice alfabético das páginas publicadas no D1.', 'Alphabetical index of pages published in D1.')}</p>
      </header>

      <table class="history-table page-index-table">
        <thead>
          <tr>
            <th>${ui('Título', 'Title')}</th>
            <th>${ui('Subtítulo', 'Subtitle')}</th>
            <th>Slug</th>
          </tr>
        </thead>
        <tbody>${pages.length ? pageListRows(pages) : `<tr><td colspan="3">${ui('Nenhuma página publicada.', 'No published pages.')}</td></tr>`}</tbody>
      </table>
    </article>
  `
}

export function recentPagesHtml(pages = []) {
  return `
    <article class="special-page special-page-recent-pages">
      <header class="article-header">
        <h1>${ui('Páginas recentes', 'Recent pages')}</h1>
        <p class="article-subtitle">${ui('Páginas publicadas ou atualizadas mais recentemente.', 'Pages most recently published or updated.')}</p>
      </header>

      <table class="history-table page-index-table">
        <thead>
          <tr>
            <th>${ui('Título', 'Title')}</th>
            <th>${ui('Subtítulo', 'Subtitle')}</th>
            <th>${ui('Última atualização', 'Last update')}</th>
            <th>Slug</th>
          </tr>
        </thead>
        <tbody>${pages.length ? pageListRows(pages, { recent: true }) : `<tr><td colspan="4">${ui('Nenhuma página publicada.', 'No published pages.')}</td></tr>`}</tbody>
      </table>
    </article>
  `
}

export function categoriesIndexHtml(categories = []) {
  return `
    <article class="special-page special-page-categories">
      <header class="article-header">
        <h1>${ui('Categorias', 'Categories')}</h1>
        <p class="article-subtitle">${ui('Índice das categorias com páginas publicadas em', 'Index of categories containing pages published in')} ${escapeHtml(SITE_NAME)}.</p>
      </header>

      <section class="category-grid">
        ${categories.length ? categories.map(category => `
          <a class="category-card" href="${categoryUrl(category.name)}" data-link="page" data-slug="categoria/${slugify(category.name)}">
            <strong>${escapeHtml(category.name)}</strong>
            <span>${Number(category.pageCount || 0).toLocaleString(interfaceLocale())} ${ui('página(s)', 'page(s)')}</span>
          </a>
        `).join('') : `<p class="empty-state">${ui('Nenhuma categoria publicada.', 'No published categories.')}</p>`}
      </section>
    </article>
  `
}

export function categoryPageHtml(category) {
  const page = {
    slug: `categoria/${category.slug}`,
    title: `${ui('Categoria', 'Category')}: ${category.name}`,
    subtitle: ui('Páginas associadas a esta categoria.', 'Pages associated with this category.'),
    categories: []
  }

  return `
    <article class="special-page category-page">
      <header class="article-header">
        <h1>${ui('Categoria', 'Category')}: ${escapeHtml(category.name)}</h1>
        <p class="article-subtitle">${ui('Páginas associadas a esta categoria.', 'Pages associated with this category.')}</p>
      </header>

      ${breadcrumbsHtml(page)}

      <table class="history-table page-index-table">
        <thead>
          <tr>
            <th>${ui('Título', 'Title')}</th>
            <th>${ui('Subtítulo', 'Subtitle')}</th>
            <th>Slug</th>
          </tr>
        </thead>
        <tbody>${category.pages?.length ? pageListRows(category.pages) : `<tr><td colspan="3">${ui('Nenhuma página publicada nesta categoria.', 'No pages are published in this category.')}</td></tr>`}</tbody>
      </table>
    </article>
  `
}

export function searchHtml(query, results, user = { authenticated: false }) {
  const cleanQuery = String(query || '').trim()
  const slug = slugify(cleanQuery)
  const canEdit = Boolean(user?.canEdit)
  const canSuggest = featureEnabled('publicSuggestions')
  const missingAction = canEdit
    ? `<a class="primary-button" href="${pageUrl(slug, 'edit')}" data-link="edit" data-slug="${escapeHtml(slug)}">${ui('Criar página', 'Create page')}</a>`
    : canSuggest
      ? `<a class="primary-button" href="${pageUrl(slug, 'suggest')}" data-link="suggest" data-slug="${escapeHtml(slug)}">${ui('Sugerir agora', 'Suggest now')}</a>`
      : ''
  const missingText = canEdit
    ? `${ui('A página', 'The page')} <code>${escapeHtml(cleanQuery)}</code> ${ui('não existe, mas você pode criá-la agora.', 'does not exist, but you can create it now.')}`
    : canSuggest
      ? `${ui('A página', 'The page')} <code>${escapeHtml(cleanQuery)}</code> ${ui('não existe, mas você pode sugeri-la agora.', 'does not exist, but you can suggest it now.')}`
      : `${ui('A página', 'The page')} <code>${escapeHtml(cleanQuery)}</code> ${ui('não existe e sugestões públicas estão desativadas.', 'does not exist and public suggestions are disabled.')}`
  const hasExact = results.some(page => page.exact || slugify(searchResultTitle(page)) === slug || String(page.slug || '') === slug)

  return `
    <header class="article-header">
      <h1>${ui('Resultados da busca', 'Search results')}</h1>
      <p class="article-subtitle">${ui('Pesquisa por', 'Search for')} “${escapeHtml(cleanQuery)}”.</p>
    </header>

    <section class="search-results">
      ${results.length ? results.map(page => {
        const title = searchResultTitle(page)
        const subtitle = searchResultSubtitle(page)
        return `
          <article class="search-result">
            <h2><a href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">${escapeHtml(title)}</a></h2>
            <p>${safeSnippet(page.snippet || subtitle || '')}</p>
            <small>${escapeHtml(page.exact ? `${ui('correspondência exata por', 'exact match by')} ${page.matchType || ui('resultado', 'result')}` : page.matchType || ui('resultado', 'result'))}${page.updatedAt ? ` · ${ui('atualizado em', 'updated on')} ${formatDate(page.updatedAt)}` : ''}</small>
          </article>
        `
      }).join('') : `<p class="empty-state">${ui('Nenhum resultado encontrado.', 'No results found.')}</p>`}
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
        <h1>${ui('Edição restrita', 'Restricted editing')}</h1>
        <p class="article-subtitle">${ui('A edição direta de páginas é reservada a e-mails autorizados pelo Cloudflare Access.', 'Direct page editing is restricted to email addresses authorized by Cloudflare Access.')}</p>
      </header>

      <div class="empty-state">
        <p>${ui('Para editar diretamente, entre com um e-mail autorizado. Visitantes podem enviar uma proposta de alteração para análise editorial.', 'Sign in with an authorized email address to edit directly. Visitors may submit a proposed change for editorial review.')}</p>
      </div>

      <div class="editor-actions">
        <a class="primary-button" href="${user.loginUrl || `/api/auth/login?return=${encodeURIComponent(pageUrl(slug, 'edit'))}`}">${ui('Entrar', 'Sign in')}</a>
        <a class="secondary-button" href="${pageUrl(slug, 'suggest')}" data-link="suggest" data-slug="${escapeHtml(slug)}">${ui('Enviar proposta', 'Submit proposal')}</a>
        <a class="secondary-button" href="${pageUrl(slug)}" data-link="page" data-slug="${escapeHtml(slug)}">${ui('Voltar ao artigo', 'Return to article')}</a>
      </div>
    </article>
  `
}

export function proposalSubmittedHtml(page, result) {
  return `
    <article class="proposal-result-page">
      <header class="article-header">
        <h1>${ui('Proposta enviada', 'Proposal submitted')}</h1>
        <p class="article-subtitle">${ui('A alteração foi registrada para análise editorial.', 'The change was recorded for editorial review.')}</p>
      </header>

      <div class="empty-state">
        <p>${ui('A proposta referente a', 'The proposal for')} <strong>${escapeHtml(page.title)}</strong> ${ui('foi recebida.', 'was received.')}</p>
        <p>${ui('Identificador', 'Identifier')}: <code>${escapeHtml(result?.proposal?.id || ui('indisponível', 'unavailable'))}</code></p>
      </div>

      <div class="editor-actions">
        <a class="primary-button" href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">${ui('Voltar ao artigo', 'Return to article')}</a>
      </div>
    </article>
  `
}

export function adminProposalsHtml(data, selectedId = '') {
  const proposals = data?.proposals || []

  return `
    <article class="admin-page">
      <header class="article-header">
        <h1>${ui("Propostas de edição", "Edit proposals")}</h1>
        <p class="article-subtitle">${ui("Painel restrito a editores autorizados pelo Cloudflare Access.", "This panel requires an editor authorized through Cloudflare Access.")}</p>
      </header>

      ${adminNavHtml('proposals')}

      ${selectedId ? `<p class="editor-note">${ui("Proposta selecionada pelo Discord:", "Proposal selected through Discord:")} <code>${escapeHtml(selectedId)}</code>.</p>` : ''}

      <section class="admin-section proposal-list">
        <h2>${ui("Propostas pendentes", "Pending proposals")}</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="${ui("propostas de edição", "edit proposals")}">
          <thead>
            <tr>
              <th>${ui("Envio", "Upload")}</th>
              <th>${ui("Página", "Page")}</th>
              <th>${ui("Título", "Title")}</th>
              <th>IP</th>
              <th>${ui("Contato", "Contact")}</th>
              <th>${ui("Resumo e conteúdo", "Summary and content")}</th>
              <th>${ui("Ações", "Actions")}</th>
            </tr>
          </thead>
          <tbody>${proposals.length ? proposals.map(proposal => `
            <tr data-proposal-id="${escapeHtml(proposal.id)}">
              <td data-sort-value="${escapeHtml(proposal.createdAt || '')}">${formatDate(proposal.createdAt)}</td>
              <td><a href="${pageUrl(proposal.pageSlug)}" data-link="page" data-slug="${escapeHtml(proposal.pageSlug)}"><code>${escapeHtml(proposal.pageSlug)}</code></a></td>
              <td>${escapeHtml(proposal.title)}</td>
              <td><code>${escapeHtml(proposal.reporterIp || ui("não informado", "not provided"))}</code></td>
              <td>${escapeHtml(proposal.contact || ui("não informado", "not provided"))}</td>
              <td>
                <strong>${escapeHtml(proposal.summary || ui("sem resumo", "no summary"))}</strong>
                <details>
                  <summary>${ui("Ver conteúdo proposto", "View proposed content")}</summary>
                  <pre><code>${escapeHtml(proposal.content)}</code></pre>
                  ${proposal.userAgent ? `<p class="editor-note"><strong>User-Agent:</strong> ${escapeHtml(proposal.userAgent)}</p>` : ''}
                </details>
              </td>
              <td class="admin-actions-cell">
                <label class="compact-control">${ui("Crédito", "Credit")}
                  <select data-proposal-credit data-id="${escapeHtml(proposal.id)}">
                    <option value="contact">${ui("contato", "contact")}</option>
                    <option value="ip">IP</option>
                    <option value="anonymous">${ui("anônimo", "anonymous")}</option>
                  </select>
                </label>
                <button class="primary-button compact-button" type="button" data-proposal-action="approve" data-id="${escapeHtml(proposal.id)}" data-base-revision="${escapeHtml(proposal.currentRevisionId || '')}">${ui("Aprovar", "Approve")}</button>
                <button class="secondary-button compact-button" type="button" data-proposal-action="reject" data-id="${escapeHtml(proposal.id)}">${ui("Recusar", "Reject")}</button>
                <a class="secondary-button compact-button" href="${pageUrl(proposal.pageSlug)}" data-link="page" data-slug="${escapeHtml(proposal.pageSlug)}">${ui("Abrir", "Open")}</a>
                ${proposal.reporterIp ? `
                  <button class="secondary-button compact-button" type="button" data-admin-ip-quick="block_suggestions" data-ip="${escapeHtml(proposal.reporterIp)}">${ui("Bloquear sugestões", "Block suggestions")}</button>
                  <button class="danger-button compact-button" type="button" data-admin-ip-quick="ban_site" data-ip="${escapeHtml(proposal.reporterIp)}">${ui("Banir site", "Ban site")}</button>
                ` : ''}
              </td>
            </tr>
          `).join('') : `<tr><td colspan="7">${ui("Nenhuma proposta pendente.", "No pending proposals.")}</td></tr>`}</tbody>
        </table>
      </section>
    </article>
  `
}

export function fatalErrorHtml(error = {}) {
  const [title, message] = error.status === 401
    ? [ui('Autenticação necessária', 'Sign-in required'), ui('Entre com sua conta para abrir esta página.', 'Sign in to open this page.')]
    : error.status === 403
      ? [ui('Conteúdo indisponível', 'Content unavailable'), ui('Esta página ou operação não está disponível para sua conta.', 'This page or operation is unavailable to your account.')]
      : error.kind === 'network'
        ? [ui('Falha de conexão', 'Connection failed'), ui('Não foi possível conectar à wiki.', 'Could not connect to the wiki.')]
        : error.status === 503
          ? [ui('Serviço temporariamente indisponível', 'Service temporarily unavailable'), ui('Tente novamente em instantes.', 'Try again shortly.')]
          : [ui('Erro de carregamento', 'Loading error'), ui('Não foi possível carregar esta página.', 'Could not load this page.')]
  return `
    <header class="article-header">
      <h1>${title}</h1>
      <p class="article-subtitle">${message}</p>
    </header>
    <div class="empty-state">
      <p>${ui('Tente recarregar a página.', 'Try reloading the page.')}</p>
    </div>
  `
}

function formatBytes(bytes = 0) {
  const value = Number(bytes || 0)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toLocaleString(interfaceLocale(), { maximumFractionDigits: 1 })} MB`
  if (value >= 1024) return `${(value / 1024).toLocaleString(interfaceLocale(), { maximumFractionDigits: 1 })} KB`
  return `${value.toLocaleString(interfaceLocale())} bytes`
}

export function filePageHtml(file) {
  const pseudoPage = {
    slug: `arquivo/${file.slug}`,
    title: `${ui("Arquivo:", "File:")}${file.filename}`,
    subtitle: `${ui("Arquivo armazenado no acervo de ", "File stored in the library of ")}${SITE_NAME}.`,
    categories: [ui("Arquivo", "File")]
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
        : `<p class="empty-state">${ui("Este arquivo não possui pré-visualização disponível.", "No preview is available for this file.")}</p>`

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
        <h1>${ui("Arquivo:", "File:")}${escapeHtml(file.filename)}</h1>
        <p class="article-subtitle">${ui("Arquivo armazenado no acervo de ", "File stored in the library of ")}${escapeHtml(SITE_NAME)}.</p>
      </header>

      ${breadcrumbsHtml(pseudoPage)}

      ${imagePreview}

      <table class="history-table file-meta-table">
        <tbody>
          <tr><th>${ui("Nome", "Name")}</th><td>${escapeHtml(file.filename)}</td></tr>
          <tr><th>${ui("Tipo MIME", "MIME type")}</th><td>${escapeHtml(file.mimeType)}</td></tr>
          <tr><th>${ui("Tamanho", "Size")}</th><td>${formatBytes(file.sizeBytes)}</td></tr>
          <tr><th>${ui("Enviado por", "Uploaded by")}</th><td>${escapeHtml(file.uploadedByName || ui("editor não identificado", "unknown editor"))}</td></tr>
          <tr><th>${ui("Data de envio", "Upload date")}</th><td>${formatDate(file.createdAt)}</td></tr>
          ${file.sha256 ? `<tr><th>SHA-256</th><td><code>${escapeHtml(file.sha256)}</code></td></tr>` : ''}
          <tr><th>${ui("Chave R2", "R2 key")}</th><td><code>${escapeHtml(file.r2Key)}</code></td></tr>
        </tbody>
      </table>

      <section class="file-usage-box">
        <h2>${ui("Uso em artigos", "Article usage")}</h2>
        <p>${ui("Para inserir este arquivo em um artigo, utilize o bloco abaixo.", "Use the following block to insert this file in an article.")}</p>
        <pre><code>${escapeHtml(imageBlock)}</code></pre>
        <p><a href="${escapeHtml(file.contentUrl)}" rel="noreferrer">${ui("Abrir arquivo original", "Open original file")}</a></p>
      </section>
    </article>
  `
}

export function fileUploadPageHtml(fileSlug, user = {}) {
  const cleanSlug = String(fileSlug || 'novo-arquivo').replace(/^arquivo\//, '')
  return `
    <article class="special-page file-upload-special">
      <header class="article-header">
        <h1>${ui("Enviar arquivo", "Upload file")}</h1>
        <p class="article-subtitle">${ui("Crie", "Create")} <code>/wiki/arquivo/${escapeHtml(cleanSlug)}</code>${ui(" enviando uma imagem, um vídeo ou um áudio para o acervo.", " by uploading an image, video or audio file.")}</p>
      </header>

      <section class="file-upload-card">
        <p>${ui("O namespace", "The namespace")} <code>/wiki/arquivo/</code>${ui(" não aceita artigos em Markdown. Ele é reservado para objetos de mídia armazenados no R2 e registrados no D1.", " is reserved for media objects stored in R2 and registered in D1.")}</p>
        ${user?.canEdit ? `
          <form data-file-upload-form>
            <div class="file-upload-grid">
              <label>
                ${ui("URL do arquivo", "File URL")}
                <span class="editor-url-control"><span class="editor-url-prefix">/wiki/arquivo/</span><input name="slug" value="${escapeHtml(cleanSlug)}" required autocomplete="off" /></span>
              </label>
              <label>
                ${ui("Arquivo", "File")}
                <input type="file" name="file" accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime,audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/flac,audio/aac,audio/mp4,.m4a,.mov,.m4v,.ogv,.oga" required />
              </label>
              <label>
                ${ui("Descrição ou legenda", "Description or caption")}
                <input type="text" name="description" maxlength="500" placeholder="${ui("descrição curta da mídia", "short media description")}" />
              </label>
            </div>
            <div class="editor-actions">
              <button class="primary-button" type="submit">${ui("Enviar arquivo", "Upload file")}</button>
              <a class="secondary-button" href="/admin/storage" data-link="route">${ui("Abrir armazenamento", "Open storage")}</a>
              <a class="secondary-button" href="/" data-link="home">${ui("Cancelar", "Cancel")}</a>
            </div>
            <p class="editor-note" data-file-upload-note>${ui("São aceitas imagens, vídeos e áudios válidos de até 50 MB.", "Valid images, videos and audio files up to 50 MB are accepted.")}</p>
          </form>
        ` : `
          <div class="empty-state">
            <p>${ui("O upload é restrito a editores, moderadores e administradores autenticados pelo Cloudflare Access.", "Uploads require an editor, moderator or administrator authenticated through Cloudflare Access.")}</p>
          </div>
          <div class="editor-actions">
            <a class="primary-button" href="${escapeHtml(user?.loginUrl || `/api/auth/login?return=${encodeURIComponent(pageUrl(`arquivo/${cleanSlug}`))}`)}">${ui("Entrar", "Sign in")}</a>
            <a class="secondary-button" href="/" data-link="home">${ui("Voltar à página principal", "Back to main page")}</a>
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
        <h1>${ui("Namespace de arquivo", "File namespace")}</h1>
        <p class="article-subtitle">${ui("Páginas de arquivo não usam o editor de artigos nem aceitam propostas em Markdown.", "File pages use the media system and do not accept Markdown edit proposals.")}</p>
      </header>
      <div class="empty-state">
        <p>${ui("Use a página especial de upload para registrar ", "Use the upload page to register ")}<code>/wiki/arquivo/${escapeHtml(clean)}</code>.</p>
      </div>
      <div class="editor-actions">
        ${featureEnabled('mediaUploads') ? `<a class="primary-button" href="${pageUrl(`arquivo/${clean}`)}" data-link="page" data-slug="arquivo/${escapeHtml(clean)}">${ui("Abrir uploader", "Open uploader")}</a>` : ''}
        ${!user?.canEdit ? `<a class="secondary-button" href="${escapeHtml(user?.loginUrl || `/api/auth/login?return=${encodeURIComponent(pageUrl(`arquivo/${clean}`))}`)}">${ui("Entrar", "Sign in")}</a>` : ''}
        <a class="secondary-button" href="/" data-link="home">${ui("Voltar à página principal", "Back to main page")}</a>
      </div>
    </article>
  `
}

export function versionPageHtml(status = {}) {
  const coreVersion = status?.coreVersion || APP_VERSION
  return `
    <article class="special-page version-page">
      <header class="article-header">
        <h1>WikiCambada Core — ${ui('Versão', 'Version')}</h1>
      </header>
      <div class="version-facts">
        <div class="version-fact"><strong>${ui('Versão do Core', 'Core version')}</strong><span>${escapeHtml(coreVersion)}</span></div>
      </div>
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
      <td><button class="danger-button compact-button" type="button" data-advanced-redirect-delete="${escapeHtml(rule.fromSlug)}">${ui("remover", "remove")}</button></td>
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
      <td><button class="danger-button compact-button" type="button" data-advanced-alias-delete="${escapeHtml(alias.aliasSlug)}">${ui("remover", "remove")}</button></td>
    </tr>
  `).join('')
}

export function adminRedirectsHtml(data = {}) {
  const redirects = data.redirects || []
  const aliases = data.aliases || []
  return `
    <article class="admin-page admin-redirects-page">
      <header class="article-header">
        <h1>${ui("Aliases e redirecionamentos avançados", "Advanced aliases and redirects")}</h1>
        <p class="article-subtitle">${ui("Gerencie URLs alternativas e redirecionamentos para páginas ou seções específicas.", "Manage alternative URLs and redirects to pages or specific sections.")}</p>
      </header>

      ${adminNavHtml('redirects')}

      <section class="redirect-manager-card">
        <h2>${ui("Novo redirecionamento", "New redirect")}</h2>
        <form data-advanced-redirect-form>
          <div class="redirect-form-grid">
            <label>${ui("Origem", "Source")} <span class="editor-url-control"><span class="editor-url-prefix">/wiki/</span><input name="fromSlug" required placeholder="historico-de-versoes" /></span></label>
            <label>${ui("Destino", "Target")} <span class="editor-url-control"><span class="editor-url-prefix">/wiki/</span><input name="toSlug" required placeholder="placeholderbot" /></span></label>
            <label>${ui("Seção opcional", "Optional section")} <span class="editor-url-control"><span class="editor-url-prefix">#</span><input name="fragment" placeholder="versoes" /></span></label>
          </div>
          <div class="editor-actions"><button class="primary-button" type="submit">${ui("Salvar redirecionamento", "Save redirect")}</button></div>
          <p class="editor-note" data-advanced-redirect-note>${ui("Exemplo:", "Example:")} <code>/wiki/historico-de-versoes-do-placeholderbot</code> → <code>/wiki/placeholderbot#versoes</code>.</p>
        </form>
      </section>

      <section class="redirect-manager-card">
        <h2>${ui("Novo alias de título", "New title alias")}</h2>
        <form data-advanced-alias-form>
          <div class="redirect-form-grid">
            <label>${ui("Título alternativo", "Alternative title")}<input name="aliasTitle" required placeholder="${ui("Nome alternativo da página", "Alternative page title")}" /></label>
            <label>${ui("Página de destino", "Target page")} <span class="editor-url-control"><span class="editor-url-prefix">/wiki/</span><input name="toSlug" required placeholder="pagina-canonica" /></span></label>
          </div>
          <div class="editor-actions"><button class="primary-button" type="submit">${ui("Salvar alias", "Save alias")}</button></div>
          <p class="editor-note" data-advanced-alias-note>${ui("Aliases participam da pesquisa e abrem a página canônica.", "Aliases appear in search and open the canonical page.")}</p>
        </form>
      </section>

      <section class="admin-section">
        <h2>${ui("Redirecionamentos registrados", "Registered redirects")}</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="${ui("redirecionamentos avançados", "advanced redirects")}">
          <thead><tr><th>${ui("Origem", "Source")}</th><th>${ui("Destino", "Target")}</th><th>${ui("Página", "Page")}</th><th>${ui("Atualização", "Update")}</th><th>${ui("Ações", "Actions")}</th></tr></thead>
          <tbody>${redirects.length ? advancedRedirectRows(redirects) : `<tr><td colspan="5">${ui("Nenhum redirecionamento registrado.", "No redirects registered.")}</td></tr>`}</tbody>
        </table>
      </section>

      <section class="admin-section">
        <h2>${ui("Aliases registrados", "Registered aliases")}</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="${ui("aliases de título", "title aliases")}">
          <thead><tr><th>Alias</th><th>URL</th><th>${ui("Destino", "Target")}</th><th>${ui("Criação", "Created")}</th><th>${ui("Ações", "Actions")}</th></tr></thead>
          <tbody>${aliases.length ? advancedAliasRows(aliases) : `<tr><td colspan="5">${ui("Nenhum alias registrado.", "No aliases registered.")}</td></tr>`}</tbody>
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
      <td data-sort-value="${Number(page.revisionCount || 0)}">${Number(page.revisionCount || 0).toLocaleString(interfaceLocale())}</td>
      <td class="admin-actions-cell">
        ${page.status !== 'deleted' ? `
          <a class="secondary-button compact-button" href="${pageUrl(page.slug, 'edit')}" data-link="edit" data-slug="${escapeHtml(page.slug)}">${ui("Editar", "Edit")}</a>
          <button type="button" class="secondary-button compact-button" data-admin-page-action="${page.isLocked ? 'unlock' : 'lock'}" data-slug="${escapeHtml(page.slug)}">${page.isLocked ? 'Desbloquear' : 'Bloquear'}</button>
          <button type="button" class="secondary-button compact-button" data-admin-page-action="rename" data-slug="${escapeHtml(page.slug)}">${ui("Renomear", "Rename")}</button>
          <button type="button" class="danger-button compact-button" data-admin-page-action="delete" data-slug="${escapeHtml(page.slug)}">${ui("Apagar", "Delete")}</button>
        ` : `<span class="muted-text">${ui("sem ações", "no actions")}</span>`}
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
      <td>${Number(link.count || 1).toLocaleString(interfaceLocale())}</td>
      <td><a href="${pageUrl(link.toSlug, 'edit')}" data-link="edit" data-slug="${escapeHtml(link.toSlug)}">${ui("criar", "create")}</a></td>
    </tr>
  `).join('')
}

function brokenRedirectRows(redirects = []) {
  return redirects.map(redirect => `
    <tr>
      <td><code>${escapeHtml(redirect.fromSlug)}</code></td>
      <td><code>${escapeHtml(redirect.toSlug)}${redirect.fragment ? `#${escapeHtml(redirect.fragment)}` : ''}</code></td>
      <td>${formatDate(redirect.createdAt)}</td>
      <td>${escapeHtml(redirect.createdByEmail || ui("não informado", "not provided"))}</td>
    </tr>
  `).join('')
}

function adminNavHtml(active = 'overview') {
  const items = [
    ['overview', '/admin', ui('Visão geral', 'Overview')],
    ['pages', '/admin/pages', ui('Páginas', 'Pages')],
    ['maintenance', '/admin/maintenance', ui('Manutenção', 'Maintenance')],
    ['redirects', '/admin/redirects', ui('Aliases e redirecionamentos', 'Aliases and redirects')],
    ['storage', '/admin/storage', ui('Armazenamento', 'Storage')],
    ['trash', '/admin/trash', ui('Lixeira', 'Trash')],
    ['ip', '/admin/ip', ui('Endereços IP', 'IP addresses')],
    ['users', '/admin/users', ui('Usuários', 'Users')],
    ['activity', '/admin/activity', ui('Atividade', 'Activity')],
    ['system', '/admin/system', ui('Sistema', 'System')],
    ['settings', '/admin/settings', ui('Configurações globais', 'Global settings')],
    ['backup', '/admin/backup', ui("Exportação e seed", "Content export and seed")],
    ['proposals', '/admin/proposals', ui("Propostas de edição", "Edit proposals")],
    ['templates', '/admin/templates', 'Criador de templates (teste)']
  ]

  return `
    <nav class="admin-nav" aria-label="${ui("Seções administrativas", "Administration sections")}">
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
          <summary>${ui("ver chamada e renderização", "view call and rendering")}</summary>
          <strong>${ui("chamada", "call")}</strong>
          <pre><code>${escapeHtml(template.call || template.content || '')}</code></pre>
          <strong>${ui("renderização", "rendering")}</strong>
          <pre><code>${escapeHtml(template.render || '')}</code></pre>
        </details>
      </td>
      <td class="admin-actions-cell">
        <button class="secondary-button compact-button" type="button" data-template-edit data-template-id="${escapeHtml(template.id)}">${ui("Editar", "Edit")}</button>
        <button class="secondary-button compact-button" type="button" data-template-toggle data-template-id="${escapeHtml(template.id)}" data-template-status="${escapeHtml(template.status)}">${template.status === 'disabled' ? 'Liberar uso' : 'Bloquear uso'}</button>
        <button class="danger-button compact-button" type="button" data-template-delete data-template-id="${escapeHtml(template.id)}">${ui("Deletar", "Delete")}</button>
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
    <div class="editor-toolbar template-editor-toolbar" role="toolbar" aria-label="${ui("Ferramentas de template", "Template tools")}">
      <button type="button" data-template-tool="templatebox" title="${ui("Estrutura de template", "Template structure")}">▣ templatebox</button>
      <button type="button" data-template-tool="parameter" title="${ui("Parâmetro", "Parameter")}">{{{ }}}</button>
      <button type="button" data-template-tool="title" title="${ui("Título parametrizado", "Parameterized title")}">${ui("título", "title")}</button>
      <button type="button" data-template-tool="image" title="Imagem parametrizada">${ui("imagem", "image")}</button>
      <button type="button" data-template-tool="footer" title="${ui("Rodapé", "Footer")}">${ui("rodapé", "footer")}</button>
      <button type="button" data-template-tool="issues" title="Lista de problemas">${ui("lista", "list")}</button>
      <button type="button" data-template-tool="link" title="Link interno">[[ ]]</button>
    </div>
  `
}

export function adminTemplatesHtml(templates = []) {
  const data = JSON.stringify(templates || []).replace(/</g, '\\u003c')
  return `
    <article class="admin-page admin-dashboard-page" data-admin-templates-page data-templates-json="${escapeHtml(data)}">
      <header class="article-header">
        <h1>${ui("Criador de templates", "Template creator")} <span class="beta-badge">${ui("em fase de testes", "in testing")}</span></h1>
        <p class="article-subtitle">${ui("Templates funcionam como predefinições de wiki em fase de testes: chamadas ", "Templates are in testing: calls ")}<code>{{Template|campo=valor}}</code>,${ui(" parâmetros, imagens, ícones e layout próprio.", " parameters, images, icons and layout.")}</p>
      </header>

      ${adminNavHtml('templates')}

      <section class="template-workbench" aria-label="Editor de templates">
        <aside class="template-library-panel">
          <div class="template-library-header">
            <div>
              <h2>Templates <span class="beta-badge">${ui("teste", "test")}</span></h2>
              <p>${ui("Escolha um item para editar ou crie uma predefinição nova. Ainda pode mudar bastante.", "Select an item to edit or create a new template. This system may still change.")}</p>
            </div>
            <button class="secondary-button compact-button" type="button" data-template-reset>${ui("Novo", "New")}</button>
          </div>
          <div class="template-library-list">
            ${templates.length ? templateLibraryCards(templates) : `<p class="empty-state">${ui("Nenhum template registrado.", "No templates registered.")}</p>`}
          </div>
        </aside>

        <form class="editor-panel template-editor-panel" data-template-form>
          <input type="hidden" name="id" />

          <div class="template-editor-heading">
            <div>
              <h2 data-template-editor-title>${ui("Novo template", "New template")}</h2>
              <p class="article-subtitle">${ui("Edite a chamada, a aparência e a renderização em um fluxo parecido com o editor de artigos. Sistema em fase de testes.", "Edit the call, appearance and rendering using a flow similar to the article editor. This system is in testing.")}</p>
            </div>
            <div class="editor-actions template-editor-actions">
              <button class="primary-button" type="submit">${ui("Salvar template", "Save template")}</button>
              <button class="secondary-button" type="button" data-template-reset>${ui("Novo template", "New template")}</button>
            </div>
          </div>

          <section class="template-editor-card">
            <h3>${ui("Identidade e uso", "Identity and usage")}</h3>
            <div class="template-editor-grid">
              <label>
                ${ui("Título", "Title")}
                <input name="title" required placeholder="Múltiplos problemas" />
              </label>
              <label>
                ${ui("Nome da chamada", "Call name")}
                <input name="slug" placeholder="multiplos-problemas" />
              </label>
              <label>
                ${ui("Grupo", "Group")}
                <input name="groupName" value="Manutenção" />
              </label>
              <label>
                ${ui("Tipo visual", "Visual type")}
                <select name="kind">
                  <option value="maintenance">${ui("manutenção", "maintenance")}</option>
                  <option value="delete">${ui("eliminação", "deletion")}</option>
                  <option value="issues">${ui("múltiplos problemas", "multiple issues")}</option>
                  <option value="sources">${ui("fontes", "sources")}</option>
                  <option value="merge">${ui("fusão", "merge")}</option>
                  <option value="stub">${ui("esboço", "stub")}</option>
                  <option value="info">${ui("informação", "information")}</option>
                  <option value="custom">${ui("customizado", "custom")}</option>
                </select>
              </label>
              <label>
                ${ui("Uso mínimo", "Minimum role")}
                <select name="minRole">
                  <option value="guest">${ui("convidado", "guest")}</option>
                  <option value="editor">editor</option>
                  <option value="moderator">${ui("moderador", "moderator")}</option>
                  <option value="admin">admin</option>
                  <option value="super_admin">super_admin</option>
                </select>
              </label>
              <label>
                Status
                <select name="status">
                  <option value="active">${ui("ativo", "active")}</option>
                  <option value="disabled">${ui("bloqueado", "locked")}</option>
                </select>
              </label>
            </div>
            <label class="template-full-field">
              ${ui("Descrição de uso", "Usage description")}
              <input name="description" placeholder="quando usar e que efeito editorial ele tem" />
            </label>
          </section>

          <section class="template-editor-card">
            <h3>${ui("Imagem e aparência", "Image and appearance")}</h3>
            <div class="template-editor-grid">
              <label>
                ${ui("Imagem padrão", "Default image")}
                <input name="imageUrl" placeholder="/api/files/arquivo/content ou https://..." />
              </label>
              <label>
                ${ui("Posição da imagem", "Image position")}
                <select name="imagePosition">
                  <option value="left">${ui("esquerda", "left")}</option>
                  <option value="right">${ui("direita", "right")}</option>
                  <option value="top">${ui("topo", "top")}</option>
                </select>
              </label>
              <label>
                ${ui("Cor de destaque", "Accent color")}
                <input name="accentColor" placeholder="#d18a28" />
              </label>
            </div>
          </section>

          <section class="editor-content-field template-editor-field">
            <label for="template-call-editor">${ui("Chamada inserida pela galeria", "Call inserted by gallery")}</label>
            <p class="editor-note">${ui("É isso que aparece no artigo quando alguém escolhe o template na galeria.", "This call is inserted into the article when the template is selected in the gallery.")}</p>
            <textarea id="template-call-editor" class="editor-content-textarea template-call-textarea" name="call" spellcheck="false" required placeholder="{{Múltiplos problemas&#10;|fontes=sim&#10;|revisao=sim&#10;|imagem=/api/files/arquivo/content&#10;}}"></textarea>
          </section>

          <section class="editor-content-field template-editor-field">
            <label for="template-render-editor">${ui("Renderização do template", "Template rendering")}</label>
            ${templateRenderToolbarHtml()}
            <textarea id="template-render-editor" class="editor-content-textarea template-render-textarea" name="render" spellcheck="false" required placeholder=":::templatebox issues&#10;title: Foram assinalados vários problemas nesta página ou seção&#10;icon: ⚠️&#10;image: {{{imagem|}}}&#10;accent: #d18a28&#10;&#10;- As fontes não cobrem todo o texto&#10;- Texto necessita de revisão&#10;::: "></textarea>
          </section>

          <details class="template-editor-card template-extra-card" open>
            <summary>${ui("Parâmetros e documentação", "Parameters and documentation")}</summary>
            <label class="template-full-field">
              ${ui("Parâmetros aceitos", "Accepted parameters")}
              <textarea name="params" spellcheck="false" placeholder="motivo: motivo exibido no aviso&#10;data: mês e ano&#10;imagem: imagem lateral opcional"></textarea>
            </label>
          </details>

          <section class="template-editor-card template-preview-card">
            <div class="template-preview-heading">
              <div>
                <h3>${ui("Prévia", "Preview")}</h3>
                <p>${ui("Usa valores de exemplo da chamada acima para mostrar o resultado antes de salvar.", "Uses sample values from the call above to preview the result before saving.")}</p>
              </div>
              <button class="secondary-button compact-button" type="button" data-template-refresh-preview>${ui("Atualizar prévia", "Update preview")}</button>
            </div>
            <div class="template-preview-surface" data-template-preview>
              <p class="empty-state">${ui("A prévia aparecerá aqui.", "The preview will appear here.")}</p>
            </div>
          </section>

          <div class="editor-actions template-editor-actions template-editor-actions-bottom">
            <button class="primary-button" type="submit">${ui("Salvar template", "Save template")}</button>
            <button class="secondary-button" type="button" data-template-reset>${ui("Novo template", "New template")}</button>
          </div>
          <p class="editor-note" data-template-note>Use <code>{{{parametro|valor padrão}}}</code>${ui(" na renderização para receber valores da chamada.", " in the rendering to receive call parameters.")}</p>
        </form>
      </section>

      <details class="admin-section template-raw-list">
        <summary>${ui("Lista técnica de templates registrados", "Registered template list")}</summary>
        <table class="history-table admin-table template-admin-table" data-admin-table data-admin-table-label="templates">
          <thead>
            <tr>
              <th>Template</th>
              <th>${ui("Grupo", "Group")}</th>
              <th>${ui("Tipo", "Type")}</th>
              <th>${ui("Uso mínimo", "Minimum role")}</th>
              <th>Status</th>
              <th>${ui("Descrição", "Description")}</th>
              <th>${ui("Conteúdo", "Content")}</th>
              <th>${ui("Ações", "Actions")}</th>
            </tr>
          </thead>
          <tbody>${templates.length ? templateRows(templates) : `<tr><td colspan="8">${ui("Nenhum template registrado.", "No templates registered.")}</td></tr>`}</tbody>
        </table>
      </details>
    </article>
  `
}

export function adminDashboardHtml(data = {}) {
  const pageCount = Number(data.pageCount ?? data.pages?.length ?? 0).toLocaleString(interfaceLocale())
  const brokenLinkCount = Number(data.brokenLinkCount ?? data.maintenance?.brokenLinks?.length ?? 0).toLocaleString(interfaceLocale())
  const brokenRedirectCount = Number(data.brokenRedirectCount ?? data.maintenance?.brokenRedirects?.length ?? 0).toLocaleString(interfaceLocale())

  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>${ui("Administração", "Administration")}</h1>
        <p class="article-subtitle">${ui("Painel inicial de manutenção do WikiCambada Core.", "WikiCambada Core maintenance overview.")}</p>
      </header>

      ${adminNavHtml('overview')}

      <section class="admin-section">
        <h2>${ui("Seções administrativas", "Administrative sections")}</h2>
        <p>${ui("As ferramentas administrativas foram separadas em páginas próprias para reduzir carregamento desnecessário e facilitar manutenção.", "Administrative tools have separate pages to reduce unnecessary loading and simplify maintenance.")}</p>
        <div class="admin-card-grid">
          <a class="admin-card" href="/admin/pages" data-link="route">
            <strong>${ui("Páginas", "Pages")}</strong>
            <span>${pageCount}${ui(" página(s) registradas. Bloqueie, desbloqueie, renomeie ou apague páginas.", " registered page(s). Lock, unlock, rename or delete pages.")}</span>
          </a>
          <a class="admin-card" href="/admin/maintenance" data-link="route">
            <strong>${ui("Manutenção", "Maintenance")}</strong>
            <span>${brokenLinkCount} link(s) quebrado(s) e ${brokenRedirectCount} redirecionamento(s) quebrado(s).</span>
          </a>
          <a class="admin-card" href="/admin/redirects" data-link="route">
            <strong>${ui("Aliases e redirecionamentos", "Aliases and redirects")}</strong>
            <span>${ui("Gerencie URLs alternativas e destinos com seções específicas.", "Manage alternative URLs and targets with specific sections.")}</span>
          </a>
          <a class="admin-card" href="/admin/storage" data-link="route">
            <strong>${ui("Armazenamento", "Storage")}</strong>
            <span>${ui("Gerencie arquivos registrados no D1, objetos R2 e metadados de mídia.", "Manage files registered in D1, R2 objects and media metadata.")}</span>
          </a>
          <a class="admin-card" href="/admin/trash" data-link="route">
            <strong>${ui("Lixeira dos editores", "Editor trash")}</strong>
            <span>${ui("Restaure ou remova definitivamente páginas e mídias deletadas.", "Restore or permanently remove deleted pages and media.")}</span>
          </a>
          <a class="admin-card" href="/admin/users" data-link="route">
            <strong>${ui("Usuários", "Users")}</strong>
            <span>${ui("Gerencie cargos internos, nomes públicos e status de editores.", "Manage internal roles, public names and editor status.")}</span>
          </a>
          <a class="admin-card" href="/admin/activity" data-link="route">
            <strong>${ui("Atividade recente", "Recent activity")}</strong>
            <span>${ui("Veja últimos usuários, IPs e páginas vistas.", "View recent users, IPs and page views.")}</span>
          </a>
          <a class="admin-card" href="/admin/system" data-link="route">
            <strong>${ui("Sistema", "System")}</strong>
            <span>${ui("Forçar atualização de cache local ou recarregamento completo dos clientes.", "Refresh local caches or fully reload connected clients.")}</span>
          </a>
          <a class="admin-card" href="/admin/settings" data-link="route">
            <strong>${ui("Configurações globais", "Global settings")}</strong>
            <span>${ui("Ative ou desative páginas especiais, colaboração, mídia, busca e outros recursos da instalação.", "Enable or disable special pages, collaboration, media, search and other installation features.")}</span>
          </a>
          <a class="admin-card" href="/admin/ip" data-link="route">
            <strong>${ui("Endereços IP", "IP addresses")}</strong>
            <span>${ui("Bloqueie sugestões públicas ou acesso público por endereço IP.", "Block public proposals or public access by IP address.")}</span>
          </a>
          <a class="admin-card" href="/admin/backup" data-link="route">
            <strong>${ui("Exportação e seed", "Content export and seed")}</strong>
            <span>${ui("Exporte conteúdo em JSON ou importe seeds.", "Export JSON content or import seeds.")}</span>
          </a>
          <a class="admin-card" href="/admin/proposals" data-link="route">
            <strong>${ui("Propostas de edição", "Edit proposals")}</strong>
            <span>${ui("Analise alterações enviadas por visitantes.", "Review changes submitted by visitors.")}</span>
          </a>
          <a class="admin-card" href="/admin/templates" data-link="route">
            <strong>${ui("Criador de templates", "Template creator")}</strong>
            <span>${ui("Crie, edite, desative ou remova snippets usados no editor Markdown.", "Create, edit, disable or remove snippets used by the Markdown editor.")}</span>
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
        <h1>${ui("Páginas", "Pages")}</h1>
        <p class="article-subtitle">${ui("Bloqueio, renomeação e exclusão suave de páginas publicadas.", "Locking, renaming and soft deletion of published pages.")}</p>
      </header>

      ${adminNavHtml('pages')}

      <section class="admin-section" id="admin-paginas">
        <h2>${ui("Páginas registradas", "Registered pages")}</h2>
        <p>${ui("Bloqueie, desbloqueie, renomeie ou apague páginas publicadas. A exclusão é suave e preserva o histórico no D1.", "Lock, unlock, rename or delete published pages. Soft deletion preserves D1 history.")}</p>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="${ui("páginas", "pages")}">
          <thead>
            <tr>
              <th>${ui("Página", "Page")}</th>
              <th>${ui("Categorias", "Categories")}</th>
              <th>Status</th>
              <th>${ui("Atualização", "Update")}</th>
              <th>${ui("Revisões", "Revisions")}</th>
              <th>${ui("Ações", "Actions")}</th>
            </tr>
          </thead>
          <tbody>${pages.length ? adminPagesRows(pages) : `<tr><td colspan="6">${ui("Nenhuma página registrada.", "No pages registered.")}</td></tr>`}</tbody>
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
        <h1>${ui("Manutenção", "Maintenance")}</h1>
        <p class="article-subtitle">${ui("Relatórios de links internos e redirecionamentos quebrados.", "Reports of broken internal links and redirects.")}</p>
      </header>

      ${adminNavHtml('maintenance')}

      <section class="admin-section" id="admin-manutencao">
        <h2>${ui("Páginas quebradas", "Broken pages")}</h2>
        <p>${ui("Links internos encontrados em artigos que não apontam para página, alias, redirecionamento, categoria ou arquivo existente.", "Article links without an existing page, alias, redirect, category or file target.")}</p>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="links quebrados">
          <thead>
            <tr>
              <th>${ui("Origem", "Source")}</th>
              <th>${ui("Destino ausente", "Missing target")}</th>
              <th>${ui("Rótulo", "Label")}</th>
              <th>${ui("Ocorrências", "Occurrences")}</th>
              <th>${ui("Ação", "Action")}</th>
            </tr>
          </thead>
          <tbody>${brokenLinks.length ? brokenLinkRows(brokenLinks) : `<tr><td colspan="5">${ui("Nenhum link interno quebrado encontrado.", "No broken internal links found.")}</td></tr>`}</tbody>
        </table>

        <h2>${ui("Redirecionamentos quebrados", "Broken redirects")}</h2>
        <p>${ui("Redirecionamentos cujo destino não existe mais ou aponta para ele mesmo.", "Redirects with missing targets or that point to themselves.")}</p>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="redirecionamentos quebrados">
          <thead>
            <tr>
              <th>${ui("Origem", "Source")}</th>
              <th>${ui("Destino", "Target")}</th>
              <th>${ui("Criação", "Created")}</th>
              <th>${ui("Criado por", "Created by")}</th>
            </tr>
          </thead>
          <tbody>${brokenRedirects.length ? brokenRedirectRows(brokenRedirects) : `<tr><td colspan="4">${ui("Nenhum redirecionamento quebrado encontrado.", "No broken redirects found.")}</td></tr>`}</tbody>
        </table>
      </section>
    </article>
  `
}

export function adminBackupHtml() {
  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>${ui("Exportação e seed", "Content export and seed")}</h1>
        <p class="article-subtitle">${ui("Exportação e importação básica de conteúdo do D1.", "Basic export and import of D1 content.")}</p>
      </header>

      ${adminNavHtml('backup')}

      <section class="admin-section" id="admin-backup">
        <h2>${ui("Exportar conteúdo", "Export content")}</h2>
        <p>${ui("Exporte conteúdo para seed. Isso não restaura o histórico completo nem os objetos R2.", "Export content as a seed. This does not restore the full history or R2 objects.")}</p>
        <div class="editor-actions">
          <a class="primary-button" href="/api/secure/admin/backup" rel="noreferrer">${ui("Exportar conteúdo", "Export content")}</a>
        </div>

        <h2>${ui("Importar seed", "Import seed")}</h2>
        <form class="admin-import-form" data-admin-import-form>
          <label>
            ${ui("Importar seed JSON", "Import JSON seed")}<br />
            <textarea name="seed" spellcheck="false" placeholder="${ui("cole aqui um JSON com pages[] ou um backup exportado por esta instalação", "paste content JSON with pages[] or a content export from this installation")}"></textarea>
          </label>
          <div class="editor-actions">
            <button class="secondary-button" type="submit">${ui("Importar seed", "Import seed")}</button>
          </div>
          <p class="editor-note" data-admin-import-note>${ui("Importação cria novas revisões para páginas existentes.", "Importing creates new revisions for existing pages.")}</p>
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
      <td>${escapeHtml(file.uploadedByName || ui("não informado", "not provided"))}</td>
      <td>
        <button class="secondary-button compact-button" type="button" data-admin-file-edit data-slug="${escapeHtml(file.slug)}" data-filename="${escapeHtml(file.filename)}" data-description="${escapeHtml(file.description || '')}">${ui("editar", "edit")}</button>
        <button class="danger-button compact-button" type="button" data-admin-file-delete data-slug="${escapeHtml(file.slug)}">${ui("deletar", "delete")}</button>
      </td>
    </tr>
  `).join('')
}

function storageTableRows(tables = []) {
  return tables.map(item => `
    <tr>
      <td><code>${escapeHtml(item.table)}</code></td>
      <td data-sort-value="${Number(item.rows || 0)}">${Number(item.rows || 0).toLocaleString(interfaceLocale())}</td>
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
        <h1>${ui("Armazenamento", "Storage")}</h1>
        <p class="article-subtitle">${ui("Gerenciamento básico de metadados D1 e arquivos enviados ao R2.", "Manage D1 metadata and files uploaded to R2.")}</p>
      </header>

      ${adminNavHtml('storage')}

      <section class="admin-section">
        <h2>${ui("Resumo", "Summary")}</h2>
        <div class="admin-card-grid">
          <div class="admin-card"><strong>${ui("Arquivos registrados", "Registered files")}</strong><span>${Number(data.uploadCount || 0).toLocaleString(interfaceLocale())}</span></div>
          <div class="admin-card"><strong>${ui("Volume de uploads", "Upload volume")}</strong><span>${formatBytes(data.totalUploadBytes || 0)} </span></div>
          <div class="admin-card"><strong>${ui("Objetos R2 listados", "R2 objects")}</strong><span>${Number(data.r2ObjectCount || 0).toLocaleString(interfaceLocale())} objeto(s) no prefixo uploads/.</span></div>
        </div>
      </section>

      <section class="admin-section">
        <h2>${ui("Mídia registrada", "Registered media")}</h2>
        <form class="admin-inline-form" data-admin-storage-search>
          <label>
            ${ui("Pesquisar mídia", "Search media")}<br />
            <input type="search" name="q" value="${escapeHtml(query)}" placeholder="${ui("nome, slug ou descrição", "name, slug or description")}" />
          </label>
          <button class="secondary-button" type="submit">${ui("Pesquisar", "Search")}</button>
        </form>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="${ui("mídia registrada", "registered media")}">
          <thead><tr><th>${ui("Arquivo", "File")}</th><th>${ui("Tipo", "Type")}</th><th>${ui("Tamanho", "Size")}</th><th>${ui("Envio", "Upload")}</th><th>${ui("Autor", "Author")}</th><th>${ui("Ações", "Actions")}</th></tr></thead>
          <tbody>${files.length ? storageFileRows(files) : `<tr><td colspan="6">${ui("Nenhum arquivo encontrado.", "No files found.")}</td></tr>`}</tbody>
        </table>
      </section>

      <section class="admin-section">
        <h2>${ui("Dados D1", "D1 data")}</h2>
        <p>${ui("Contagem básica das tabelas principais. Para editar conteúdo de páginas, use as telas de edição, propostas e backup.", "Main table row counts. Use the editor, proposals or content import to change pages.")}</p>
        <table class="history-table admin-table compact-table" data-admin-table data-admin-table-label="tabelas D1">
          <thead><tr><th>${ui("Tabela", "Table")}</th><th>${ui("Linhas", "Rows")}</th></tr></thead>
          <tbody>${tables.length ? storageTableRows(tables) : `<tr><td colspan="2">${ui("Nenhuma tabela encontrada.", "No tables found.")}</td></tr>`}</tbody>
        </table>
      </section>

      <section class="admin-section">
        <h2>${ui("Objetos R2 recentes", "Recent R2 objects")}</h2>
        <p>Lista limitada aos primeiros objetos retornados pelo R2 no prefixo <code>uploads/</code>.</p>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="objetos R2">
          <thead><tr><th>${ui("Chave R2", "R2 key")}</th><th>${ui("Tamanho", "Size")}</th><th>Upload</th></tr></thead>
          <tbody>${r2Objects.length ? r2ObjectRows(r2Objects) : `<tr><td colspan="3">${ui("Nenhum objeto R2 listado ou bucket indisponível.", "No R2 objects found or bucket unavailable.")}</td></tr>`}</tbody>
        </table>
      </section>
    </article>
  `
}

function ipRuleLabel(action) {
  if (action === 'ban_site') return ui("Bloquear acesso público ao site", "Block public access to the site")
  if (action === 'block_suggestions') return ui("Bloquear sugestões", "Block suggestions")
  return action
}

function ipRuleRows(rules = []) {
  return rules.map(rule => `
    <tr>
      <td><code>${escapeHtml(rule.ip)}</code></td>
      <td>${escapeHtml(ipRuleLabel(rule.action))}</td>
      <td>${escapeHtml(rule.reason || '')}</td>
      <td data-sort-value="${escapeHtml(rule.createdAt || '')}">${formatDate(rule.createdAt)}</td>
      <td>${escapeHtml(rule.createdByEmail || ui("não informado", "not provided"))}</td>
      <td><button class="danger-button compact-button" type="button" data-admin-ip-delete data-id="${escapeHtml(rule.id)}">${ui("remover", "remove")}</button></td>
    </tr>
  `).join('')
}

export function adminIpHtml(rules = []) {
  return `
    <article class="admin-page admin-dashboard-page">
      <header class="article-header">
        <h1>${ui("Endereços IP", "IP addresses")}</h1>
        <p class="article-subtitle">${ui("Bloqueio básico de sugestões públicas e acesso público por endereço IP ou faixa CIDR.", "Block public proposals and public access by IP address or CIDR range.")}</p>
      </header>

      ${adminNavHtml('ip')}

      <section class="admin-section">
        <h2>${ui("Nova regra", "New rule")}</h2>
        <form class="admin-ip-form" data-admin-ip-form>
          <label>
            ${ui("Endereço IP", "IP address")}<br />
            <input name="ip" placeholder="203.0.113.10, 203.0.113.0/24 ou 2001:db8::/32" required />
          </label>
          <label>
            ${ui("Ação", "Action")}<br />
            <select name="action">
              <option value="block_suggestions">${ui("Bloquear sugestões", "Block suggestions")}</option>
              <option value="ban_site">${ui("Bloquear acesso público ao site", "Block public access to the site")}</option>
            </select>
          </label>
          <label>
            ${ui("Motivo", "Reason")}<br />
            <input name="reason" placeholder="motivo administrativo" />
          </label>
          <button class="secondary-button" type="submit">${ui("Adicionar regra", "Add rule")}</button>
          <p class="editor-note" data-admin-ip-note>${ui("Aceita IPv4, IPv6 e CIDR. O bloqueio de site não bloqueia /admin nem /api/secure, para evitar travamento administrativo acidental.", "Accepts IPv4, IPv6 and CIDR. Site bans preserve access to /admin and /api/secure to avoid accidental administrator lockout.")}</p>
        </form>
      </section>

      <section class="admin-section">
        <h2>${ui("Regras ativas", "Active rules")}</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="${ui("endereços IP", "IP addresses")}">
          <thead><tr><th>IP/CIDR</th><th>${ui("Ação", "Action")}</th><th>${ui("Motivo", "Reason")}</th><th>${ui("Criação", "Created")}</th><th>${ui("Criado por", "Created by")}</th><th>${ui("Ações", "Actions")}</th></tr></thead>
          <tbody>${rules.length ? ipRuleRows(rules) : `<tr><td colspan="6">${ui("Nenhuma regra de IP registrada.", "No IP rules registered.")}</td></tr>`}</tbody>
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
        ${user.role === 'super_admin' ? `<span class="editor-note">${ui("fixo", "fixed")}</span>` : `
          <button class="secondary-button compact-button" type="button" data-admin-user-edit data-email="${escapeHtml(user.email)}" data-name="${escapeHtml(user.displayName || '')}" data-role="${escapeHtml(user.role)}" data-status="${escapeHtml(user.status || 'active')}">${ui("editar", "edit")}</button>
          <button class="danger-button compact-button" type="button" data-admin-user-delete data-email="${escapeHtml(user.email)}">${ui("remover", "remove")}</button>
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
        <h1>${ui("Usuários", "Users")}</h1>
        <p class="article-subtitle">Cargos internos de ${escapeHtml(SITE_NAME)}${ui(". O Cloudflare Access autentica; o Core decide a função.", ". Cloudflare Access authenticates users; the Core assigns roles.")}</p>
      </header>

      ${adminNavHtml('users')}

      <section class="admin-section">
        <h2>${ui("Meu perfil", "My profile")}</h2>
        <form class="admin-inline-form" data-profile-form>
          <label>
            ${ui("Nome público", "Public name")}<br />
            <input name="displayName" value="${escapeHtml(current.displayName || current.name || '')}" placeholder="usar e-mail se vazio" />
          </label>
          <button class="secondary-button" type="submit">${ui("Salvar meu nome", "Save my name")}</button>
          <p class="editor-note" data-profile-note>${ui("Conta atual:", "Current account:")} <code>${escapeHtml(current.email || '')}</code> · cargo: ${escapeHtml(roleLabel(current.role))}</p>
        </form>
      </section>

      <section class="admin-section">
        <h2>${ui("Editar usuário", "Edit user")}</h2>
        <form class="admin-inline-form" data-user-form>
          <label>${ui("E-mail", "Email")}<br /><input name="email" placeholder="editor@exemplo.invalid" required /></label>
          <label>${ui("Nome público", "Public name")}<br /><input name="displayName" placeholder="opcional" /></label>
          <label>${ui("Cargo", "Role")}<br />
            <select name="role">
              <option value="editor">editor</option>
              <option value="moderator">${ui("moderador", "moderator")}</option>
              <option value="admin">${ui("administrador", "administrator")}</option>
            </select>
          </label>
          <label>Status<br />
            <select name="status">
              <option value="active">${ui("ativo", "active")}</option>
              <option value="disabled">${ui("desativado", "disabled")}</option>
            </select>
          </label>
          <button class="secondary-button" type="submit">${ui("Salvar usuário", "Save user")}</button>
          <p class="editor-note" data-user-note>${ui("Administradores não podem alterar nem remover o super administrador.", "Administrators cannot modify or remove the super administrator.")}</p>
        </form>
      </section>

      <section class="admin-section">
        <h2>${ui("Usuários registrados", "Registered users")}</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="${ui("usuários", "users")}">
          <thead><tr><th>${ui("Usuário", "User")}</th><th>${ui("Cargo", "Role")}</th><th>Status</th><th>${ui("Último acesso", "Last seen")}</th><th>${ui("IP/página", "IP/page")}</th><th>${ui("Ações", "Actions")}</th></tr></thead>
          <tbody>${users.length ? userRows(users) : `<tr><td colspan="6">${ui("Nenhum usuário registrado.", "No users registered.")}</td></tr>`}</tbody>
        </table>
      </section>
    </article>
  `
}

function activityLocationLabel(item) {
  const main = [item.ipCity, item.ipRegion, item.ipCountry].map(value => String(value || '').trim()).filter(Boolean).join(', ')
  const extra = [item.ipColo ? `colo ${item.ipColo}` : '', item.ipTimezone || ''].filter(Boolean).join(' · ')
  if (main && extra) return `${main} (${extra})`
  return main || extra || ui("não informado", "not provided")
}

function activityRows(activity = []) {
  return activity.map(item => `
    <tr>
      <td data-sort-value="${escapeHtml(item.createdAt || '')}">${formatDate(item.createdAt)}</td>
      <td>${escapeHtml(item.displayName || item.email || 'visitante')}</td>
      <td>${escapeHtml(roleLabel(item.role))}</td>
      <td><code>${escapeHtml(item.ip || ui("não informado", "not provided"))}</code></td>
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
        <h1>${ui("Atividade recente", "Recent activity")}</h1>
        <p class="article-subtitle">${ui("Últimos usuários, IPs e páginas vistas. Localização vem dos metadados de rede da Cloudflare quando disponíveis.", "Recent users, IPs and page views. Location uses Cloudflare network metadata when available.")}</p>
      </header>
      ${adminNavHtml('activity')}
      <section class="admin-section">
        <div class="admin-section-actions">
          <button class="danger-button" type="button" data-admin-clear-activity>${ui("Limpar dados de atividade", "Clear activity data")}</button>
        </div>
        <p class="editor-note" data-admin-activity-note>${ui("Esta ação apaga apenas o registro de atividade recente. Ela não altera páginas, usuários ou revisões.", "This action clears recent activity records. It does not change pages, users or revisions.")}</p>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="atividade recente">
          <thead><tr><th>${ui("Data", "Date")}</th><th>${ui("Usuário", "User")}</th><th>${ui("Cargo", "Role")}</th><th>IP</th><th>${ui("Localização", "Location")}</th><th>${ui("Página", "Page")}</th><th>User-Agent</th></tr></thead>
          <tbody>${activity.length ? activityRows(activity) : `<tr><td colspan="7">${ui("Nenhuma atividade recente registrada.", "No recent activity recorded.")}</td></tr>`}</tbody>
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
      <td>${escapeHtml(page.deletedByEmail || ui("não informado", "not provided"))}</td>
      <td data-sort-value="${escapeHtml(page.purgeAfter || '')}">${page.purgeAfter ? formatDate(page.purgeAfter) : ui("não definido", "not set")}</td>
      <td class="admin-actions-cell">
        <button class="secondary-button compact-button" type="button" data-trash-action="restore" data-kind="page" data-slug="${escapeHtml(page.slug)}">${ui("restaurar", "restore")}</button>
        <button class="danger-button compact-button" type="button" data-trash-action="hard-delete" data-kind="page" data-slug="${escapeHtml(page.slug)}">${ui("deletar definitivamente", "permanently delete")}</button>
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
      <td data-sort-value="${escapeHtml(file.purgeAfter || '')}">${file.purgeAfter ? formatDate(file.purgeAfter) : ui("não definido", "not set")}</td>
      <td class="admin-actions-cell">
        <button class="secondary-button compact-button" type="button" data-trash-action="restore" data-kind="file" data-slug="${escapeHtml(file.slug)}">${ui("restaurar", "restore")}</button>
        <button class="danger-button compact-button" type="button" data-trash-action="hard-delete" data-kind="file" data-slug="${escapeHtml(file.slug)}">${ui("deletar definitivamente", "permanently delete")}</button>
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
        <h1>${ui("Lixeira dos editores", "Editor trash")}</h1>
        <p class="article-subtitle">${ui("Páginas e mídias ficam disponíveis para restauração por 30 dias antes da remoção definitiva.", "Deleted pages and media can be restored for 30 days before permanent removal.")}</p>
      </header>
      ${adminNavHtml('trash')}
      <section class="admin-section">
        <div class="editor-actions">
          <button class="secondary-button" type="button" data-trash-purge-expired>${ui("Apagar expirados agora", "Purge expired items now")}</button>
        </div>
        <p class="editor-note" data-trash-note>${ui("A limpeza automática é oportunista: acontece ao abrir ou acionar esta tela.", "Expired items are cleaned when this screen is opened or used.")}</p>
      </section>
      <section class="admin-section">
        <h2>${ui("Páginas", "Pages")}</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="${ui("páginas na lixeira", "deleted pages")}">
          <thead><tr><th>${ui("Página", "Page")}</th><th>${ui("Exclusão", "Deletion")}</th><th>${ui("Excluída por", "Deleted by")}</th><th>${ui("Expira em", "Expires at")}</th><th>${ui("Ações", "Actions")}</th></tr></thead>
          <tbody>${pages.length ? trashPageRows(pages) : `<tr><td colspan="5">${ui("Nenhuma página na lixeira.", "No pages in trash.")}</td></tr>`}</tbody>
        </table>
      </section>
      <section class="admin-section">
        <h2>${ui("Mídia", "Media")}</h2>
        <table class="history-table admin-table" data-admin-table data-admin-table-label="${ui("mídia na lixeira", "deleted media")}">
          <thead><tr><th>${ui("Arquivo", "File")}</th><th>${ui("Tipo", "Type")}</th><th>${ui("Tamanho", "Size")}</th><th>${ui("Exclusão", "Deletion")}</th><th>${ui("Expira em", "Expires at")}</th><th>${ui("Ações", "Actions")}</th></tr></thead>
          <tbody>${files.length ? trashFileRows(files) : `<tr><td colspan="6">${ui("Nenhum arquivo na lixeira.", "No files in trash.")}</td></tr>`}</tbody>
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
        <h1>${ui("Sistema", "System")}</h1>
        <p class="article-subtitle">${ui("Ações globais de atualização do WikiCambada Core.", "Global WikiCambada Core refresh actions.")}</p>
      </header>
      ${adminNavHtml('system')}
      <section class="admin-section">
        <h2>${ui("Atualização de clientes", "Client updates")}</h2>
        <div class="admin-card-grid">
          <div class="admin-card"><strong>${ui("Cache local", "Local cache")}</strong><span>${ui("Versão ", "Version ")}${Number(cache.value || 0).toLocaleString(interfaceLocale())} · ${cache.updatedAt ? formatDate(cache.updatedAt) : 'nunca'}</span></div>
          <div class="admin-card"><strong>${ui("Recarregamento completo", "Full reload")}</strong><span>${ui("Versão ", "Version ")}${Number(reload.value || 0).toLocaleString(interfaceLocale())} · ${reload.updatedAt ? formatDate(reload.updatedAt) : 'nunca'}</span></div>
        </div>
        <div class="editor-actions">
          <button class="secondary-button" type="button" data-system-action="force-cache">${ui("Forçar atualização de cache local (rápido)", "Refresh local caches (quick)")}</button>
          <button class="danger-button" type="button" data-system-action="force-reload">${ui("Forçar recarregar usuários conectados (completo)", "Reload connected users (full)")}</button>
        </div>
        <p class="editor-note" data-system-note>${ui("Clientes abertos verificam essas versões periodicamente.", "Open clients check these versions periodically.")}</p>
      </section>
    </article>
  `
}


export function featureDisabledHtml(title, description = '') {
  return `
    <article class="wiki-article special-page">
      <header class="article-header">
        <h1>${escapeHtml(title)}</h1>
        <p class="article-subtitle">${ui('Este recurso foi desativado nas configurações globais desta instalação.', 'This feature was disabled in the global settings for this installation.')}</p>
      </header>
      ${description ? `<p>${escapeHtml(description)}</p>` : ''}
      <p><a href="${pageUrl(HOME_SLUG)}" data-link="home">${ui('Voltar à página principal', 'Return to the main page')}</a></p>
    </article>
  `
}

export function specialPagesIndexHtml() {
  const pages = [
    ['specialPages.allPages', ui('Todas as páginas', 'All pages'), ui('Lista alfabética de páginas publicadas.', 'Alphabetical list of published pages.'), 'especial/todas-as-paginas'],
    ['specialPages.recentPages', ui('Páginas recentes', 'Recent pages'), ui('Páginas ordenadas pela revisão mais recente.', 'Pages ordered by their latest revision.'), 'especial/paginas-recentes'],
    ['specialPages.categories', ui('Categorias', 'Categories'), ui('Índice das categorias registradas.', 'Index of registered categories.'), 'especial/categorias'],
    ['specialPages.randomPage', ui('Página aleatória', 'Random page'), ui('Abre uma página publicada aleatória.', 'Opens a random published page.'), 'especial/pagina-aleatoria'],
    ['specialPages.version', ui('Versão', 'Version'), ui('Versão do WikiCambada Core e estado do sistema.', 'WikiCambada Core version and system status.'), 'especial/versao']
  ].filter(([feature]) => {
    if (!featureEnabled(feature)) return false
    if (feature === 'specialPages.categories') return featureEnabled('categories')
    if (feature === 'specialPages.randomPage') return featureEnabled('randomPage')
    return true
  })

  return `
    <article class="wiki-article special-page">
      <header class="article-header">
        <h1>${ui('Especial: Páginas especiais', 'Special: Special pages')}</h1>
        <p class="article-subtitle">${ui('Recursos gerados pelo WikiCambada Core para esta instalação.', 'Resources generated by WikiCambada Core for this installation.')}</p>
      </header>
      <div class="special-page-grid">
        ${pages.length ? pages.map(([, title, description, slug]) => `
          <a class="special-page-card" href="${pageUrl(slug)}" data-link="page" data-slug="${escapeHtml(slug)}">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(description)}</span>
          </a>
        `).join('') : `<p class="empty-state">${ui('Nenhuma página especial está habilitada.', 'No special pages are enabled.')}</p>`}
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
        <h1>${ui("Configurações globais", "Global settings")}</h1>
        <p class="article-subtitle">${ui("Recursos e páginas que alteram o comportamento da instalação para todos os usuários.", "Features and pages that affect the installation for every user.")}</p>
      </header>
      ${adminNavHtml('settings')}
      <form class="admin-section global-settings-form" data-global-settings-form>
        <section class="global-settings-group">
          <h2>${ui("Páginas especiais", "Special pages")}</h2>
          <p>${ui("As páginas abaixo são geradas pelo back-end e nunca podem ser editadas, sugeridas ou receber histórico editorial.", "The following system pages cannot be edited or receive proposals or editorial history.")}</p>
          <div class="global-settings-grid">
            ${settingToggle('specialPages.index', ui("Índice de páginas especiais", "Special pages index"), ui("Mostra /wiki/especial com a lista de recursos especiais disponíveis.", "Lists the available special pages at /wiki/especial."), settings)}
            ${settingToggle('specialPages.version', ui("Versão", "Version"), ui("Mostra informações do WikiCambada Core e do estado do sistema.", "Displays WikiCambada Core and system information."), settings)}
            ${settingToggle('specialPages.recentPages', ui("Páginas recentes", "Recent pages"), ui("Lista artigos pela revisão mais recente.", "Lists articles by latest revision."), settings)}
            ${settingToggle('specialPages.allPages', ui("Todas as páginas", "All pages"), ui("Lista todas as páginas publicadas em ordem alfabética.", "Lists published pages alphabetically."), settings)}
            ${settingToggle('specialPages.categories', ui("Categorias", "Categories"), ui("Mostra o índice de categorias registradas.", "Displays the category index."), settings)}
            ${settingToggle('specialPages.randomPage', ui("Página aleatória", "Random page"), ui("Permite encaminhar visitantes para uma página publicada aleatória.", "Opens a random published page."), settings)}
          </div>
        </section>

        <section class="global-settings-group">
          <h2>${ui("Conteúdo e colaboração", "Content and collaboration")}</h2>
          <div class="global-settings-grid">
            ${settingToggle('talkPages', ui("Páginas de discussão", "Discussion pages"), ui("Ativa o namespace Discussão e suas abas.", "Enables discussion pages and tabs."), settings)}
            ${settingToggle('userPages', ui("Páginas de usuário", "User pages"), ui("Ativa o namespace Usuário.", "Enables user pages."), settings)}
            ${settingToggle('publicSuggestions', ui("Sugestões públicas", "Public suggestions"), ui("Visitantes podem enviar propostas de edição.", "Visitors can submit edit proposals."), settings)}
            ${settingToggle('pageHistory', ui("Histórico público", "Public history"), ui("Exibe revisões e comparação de versões.", "Displays revisions and version comparisons."), settings)}
            ${settingToggle('mediaUploads', ui("Uploads de mídia", "Media uploads"), ui("Permite enviar imagens, vídeos e áudios ao R2.", "Allows image, video and audio uploads to R2."), settings)}
            ${settingToggle('templates', ui("Templates editoriais", "Editorial templates"), ui("Ativa a galeria e a expansão de predefinições.", "Enables the template gallery and expansion."), settings)}
          </div>
        </section>

        <section class="global-settings-group">
          <h2>${ui("Navegação e sistema", "Navigation and system")}</h2>
          <div class="global-settings-grid">
            ${settingToggle('search', ui("Busca", "Search"), ui("Ativa a busca e o autocomplete.", "Enables search and autocomplete."), settings)}
            ${settingToggle('categories', ui("Categorias em artigos", "Article categories"), ui("Ativa páginas, links e índices de categoria.", "Enables category pages, links and indexes."), settings)}
            ${settingToggle('randomPage', ui("Navegação aleatória", "Random navigation"), ui("Ativa o atalho geral para página aleatória.", "Enables the random page shortcut."), settings)}
            ${settingToggle('coreBadge', ui("Selo Powered by", "Powered by badge"), ui("Mostra o selo Powered by WikiCambada Core no rodapé.", "Displays the Powered by WikiCambada Core badge in the footer."), settings)}
            ${settingToggle('activityLogging', ui("Atividade recente", "Recent activity"), ui("Permite registrar atividade administrativa quando disponível.", "Records administrative activity when available."), settings)}
          </div>
        </section>

        <div class="editor-actions">
          <button class="primary-button" type="submit">${ui("Salvar configurações globais", "Save global settings")}</button>
        </div>
        <p class="editor-note" data-global-settings-note>${ui("As mudanças são gravadas no D1 e aplicadas para todos os usuários no próximo carregamento.", "Changes are saved in D1 and applied for every user on the next load.")}</p>
      </form>
    </article>
  `
}
