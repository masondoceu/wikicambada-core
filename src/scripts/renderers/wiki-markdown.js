import { browserRenderRuntime, escapeHtml, normalizeKey, searchUrl, slugify, talkPageSlug, userPageSlug } from '../core/utils.js'

export function createMarkdownRenderer(runtime) {
  const ui = (pt, en) => runtime.language() === 'en' ? en : pt
  const sameOrigin = url => url.origin === (runtime.origin || new URL(runtime.href).origin)
  const inlineCache = runtime.origin ? new Map() : null
  const tokenCache = runtime.origin ? new Map() : null

  function safeHref(url) {
    try {
      const parsed = new URL(String(url || ''), runtime.href)
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return sameOrigin(parsed) ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.href
      }
      if (['mailto:', 'tel:'].includes(parsed.protocol)) return parsed.href
    } catch {
      if (String(url || '').startsWith('#')) return String(url)
    }

    return '#'
  }

  function safeMediaSource(value) {
    const clean = cleanTypedMediaSource(value)
    try {
      const parsed = new URL(clean, runtime.href)
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return ''
      return sameOrigin(parsed) ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.href
    } catch {
      return ''
    }
  }

  function internalLinkAttributes(url) {
    try {
      const parsed = new URL(url, runtime.href)
      if (!sameOrigin(parsed)) return ''

      const parts = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean).map(part => decodeURIComponent(part))
      const query = parsed.searchParams.get('q')

      if (parts[0] === 'search' || query) return ` data-search="${escapeHtml(query || '')}"`
      if (parts[0] === 'edit') return ` data-link="edit" data-slug="${escapeHtml(parts.slice(1).join('/') || runtime.config.site.homeSlug)}"`
      if (parts[0] === 'history') return ` data-link="history" data-slug="${escapeHtml(parts.slice(1).join('/') || runtime.config.site.homeSlug)}"`
      if (parts[0] === 'suggest') return ` data-link="suggest" data-slug="${escapeHtml(parts.slice(1).join('/') || runtime.config.site.homeSlug)}"`
      if (parts[0] === 'wiki') return ` data-link="page" data-slug="${escapeHtml(parts.slice(1).join('/') || runtime.config.site.homeSlug)}"`
      if (parts[0] === 'usuario') return ` data-link="page" data-slug="${escapeHtml(`usuario/${parts.slice(1).join('/') || 'usuario-sem-nome'}`)}"`
      if (parts[0] === 'talk' || parts[0] === 'discussao') return ` data-link="page" data-slug="${escapeHtml(`discussao/${parts.slice(1).join('/') || runtime.config.site.homeSlug}`)}"`

      const page = parsed.searchParams.get('page') || runtime.config.site.homeSlug
      const mode = parsed.searchParams.get('mode') || 'read'

      if (mode === 'edit') return ` data-link="edit" data-slug="${escapeHtml(page)}"`
      if (mode === 'history') return ` data-link="history" data-slug="${escapeHtml(page)}"`
      if (mode === 'suggest') return ` data-link="suggest" data-slug="${escapeHtml(page)}"`
      return ` data-link="page" data-slug="${escapeHtml(page)}"`
    } catch {
      return ''
    }
  }


  function normalizeEscapedBlockNewlines(value) {
    const text = String(value || '')
    if (!text.includes('\\')) return text
    const output = []
    let insideComponent = false

    for (const rawLine of text.split('\n')) {
      const shouldExpand = insideComponent || /^:::\s*[\wÀ-ÿ-]+/.test(rawLine)
      const line = shouldExpand
        ? rawLine.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, '\t')
        : rawLine

      output.push(line)
      for (const part of line.split('\n')) {
        const clean = part.trim()
        if (/^:::\s*[\wÀ-ÿ-]+/.test(clean)) insideComponent = true
        if (clean === ':::') insideComponent = false
      }
    }

    return output.join('\n')
  }

  function cleanHeadingText(value) {
    return String(value || '')
      .replace(/!\[([^\]]*)]\(([^)]+)\)/g, '$1')
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?]]/g, (_, target, label) => label || target)
      .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1')
      .replace(/[`*_#>]/g, '')
      .trim()
  }

  function headingIdFromText(value, counts) {
    const base = slugify(cleanHeadingText(value)) || 'secao'
    const count = counts.get(base) || 0
    counts.set(base, count + 1)
    return count ? `${base}-${count + 1}` : base
  }

  function extractHeadings(markdown) {
    const counts = new Map()
    const headings = []

    for (const line of String(markdown || '').split('\n')) {
      const heading = line.trim().match(/^(#{2,4})\s+(.+)$/)
      if (!heading) continue

      const title = cleanHeadingText(heading[2])
      headings.push({
        level: heading[1].length,
        title,
        id: headingIdFromText(heading[2], counts)
      })
    }

    return headings
  }

  function parseTemplateParts(value) {
    const parts = String(value || '').split('|').map(part => part.trim()).filter(Boolean)
    const name = parts.shift() || ''
    const args = []
    const meta = {}
    const metaEntries = []

    for (const part of parts) {
      const eq = part.indexOf('=')
      if (eq > 0) {
        const rawKey = part.slice(0, eq).trim()
        const key = normalizeKey(rawKey)
        const value = part.slice(eq + 1).trim()
        meta[key] = value
        metaEntries.push({ key: rawKey, value })
      } else {
        args.push(part)
      }
    }

    return { name, args, meta, metaEntries }
  }

  function templateValue(data, keys, fallback = '') {
    for (const key of keys) {
      const value = data.meta[normalizeKey(key)]
      if (value) return value
    }

    return fallback
  }

  function templateArg(data, index, fallback = '') {
    return data.args[index - 1] || data.meta[String(index)] || fallback
  }

  function templateEnabled(value) {
    const clean = normalizeKey(value)
    return ['sim', 's', 'yes', 'y', 'true', '1', 'x', 'ok'].includes(clean)
  }

  function templateDisabled(value) {
    const clean = normalizeKey(value)
    return ['nao', 'não', 'no', 'n', 'false', '0'].includes(clean)
  }

  function templateRegistryKey(value) {
    return slugify(String(value || '').replace(/^template\s*:/i, '')) || normalizeKey(value)
  }

  function findRegisteredTemplate(name, options = {}) {
    const wanted = templateRegistryKey(name)
    if (!wanted) return null

    return (options.templates || []).find(template => {
      const keys = [template.slug, template.title, template.name].map(templateRegistryKey)
      return keys.includes(wanted)
    }) || null
  }

  function replaceTemplatePlaceholders(source, data) {
    const values = new Map()
    data.args.forEach((value, index) => values.set(String(index + 1), value))
    for (const [key, value] of Object.entries(data.meta)) values.set(normalizeKey(key), value)
    values.set('template', data.name)

    return String(source || '').replace(/\{\{\{\s*([^}|]+)\s*(?:\|\s*([^}]*?)\s*)?}}}/g, (_, key, fallback = '') => {
      const clean = normalizeKey(key)
      return values.get(clean) || values.get(String(key).trim()) || fallback || ''
    })
  }

  function templateImageHtml(src, title = '', caption = '') {
    const safeSrc = safeMediaSource(src)
    if (!safeSrc) return ''
    const attrs = mediaAttributes({ src: safeSrc, title, caption })
    return `<img loading="lazy" decoding="async" src="${escapeHtml(safeSrc)}" alt="${escapeHtml(title || caption || 'imagem do template')}" ${attrs} />`
  }

  function renderWikiTemplateShell({
    type = 'info',
    title = '',
    subtitle = '',
    body = '',
    footer = '',
    image = '',
    icon = '',
    imagePosition = 'left',
    accent = '',
    compact = false,
    options = {}
  }) {
    const cleanType = slugify(type || 'info') || 'info'
    const cleanPosition = ['left', 'right', 'top'].includes(slugify(imagePosition)) ? slugify(imagePosition) : 'left'
    const style = safeCssColor(accent) ? ` style="--template-accent: ${escapeHtml(safeCssColor(accent))}"` : ''
    const media = image ? `<div class="wiki-template-media">${templateImageHtml(image, title, subtitle)}</div>` : ''
    const symbol = !image && icon ? `<div class="wiki-template-icon" aria-hidden="true">${inlineMarkdown(icon)}</div>` : ''

    return `
      <aside class="wiki-template wiki-template-${escapeHtml(cleanType)} wiki-template-image-${escapeHtml(cleanPosition)}${compact ? ' wiki-template-compact' : ''}"${style}>
        ${cleanPosition === 'top' ? media : ''}
        <div class="wiki-template-layout">
          ${cleanPosition !== 'top' ? media || symbol : symbol}
          <div class="wiki-template-content">
            ${title ? `<div class="wiki-template-title">${inlineMarkdown(title)}</div>` : ''}
            ${subtitle ? `<div class="wiki-template-subtitle">${inlineMarkdown(subtitle)}</div>` : ''}
            <div class="wiki-template-body">${markdownToHtml(body, options)}</div>
            ${footer ? `<div class="wiki-template-footer">${markdownToHtml(footer, options)}</div>` : ''}
          </div>
        </div>
      </aside>
    `
  }

  function renderDeleteTemplate(data, options = {}) {
    const reason = templateValue(data, ['motivo', 'reason'], templateArg(data, 1, 'nenhum motivo foi informado'))
    const date = templateValue(data, ['data', 'date'], '')
    const author = templateValue(data, ['autor', 'author', 'usuario', 'usuário'], '')
    const discussion = templateValue(data, ['discussao', 'discussão', 'talk'], 'página de discussão')
    const image = templateValue(data, ['imagem', 'image'], '')

    return renderWikiTemplateShell({
      type: 'delete',
      title: 'Esta página é candidata à eliminação',
      subtitle: `Motivo: **${reason}**${author ? ` — indicado por ${author}` : ''}${date ? ` em ${date}` : ''}`,
      body: `Se discordar, explique o motivo em [[Discussão:${discussion}|discussão]] antes de remover este aviso.\n\nLembre-se de verificar o que aponta para esta página antes de deletar.`,
      image,
      icon: '🗑️',
      imagePosition: templateValue(data, ['posicao', 'posição', 'imagePosition'], 'left'),
      accent: '#e04444',
      options
    })
  }

  function renderMultipleIssuesTemplate(data, options = {}) {
    const issues = [
      ['fontes', 'As fontes **não cobrem todo o texto**.'],
      ['sem fontes', 'Ela cita poucas ou nenhuma fonte confiável.'],
      ['referencias', 'Necessita de **fontes secundárias fiáveis** publicadas por terceiros.'],
      ['revisao', 'O texto necessita de **revisão** por inconsistências ou dados duvidosos.'],
      ['nao enciclopedico', 'O conteúdo pode ser de **natureza não enciclopédica**.'],
      ['confuso', 'Ela pode estar **confusa ou pouco clara** para leitores.'],
      ['imagens', 'Ela tem poucas ou nenhuma imagem.'],
      ['links', 'Ela contém **links problemáticos** ou quebrados.'],
      ['vies', 'Ela pode conter viés.'],
      ['desatualizado', 'Ela contém informação desatualizada.'],
      ['stub', 'Ela precisa ser expandida por ser um esboço.'],
      ['paredes', 'Ela contém paredes de texto grandes demais.'],
      ['deadlinks', 'Ela contém um ou mais links mortos.']
    ]

    const aliases = {
      referencias: ['referencias', 'referências', 'fontes secundarias', 'fontes secundárias', 'fontes_secundarias'],
      revisao: ['revisao', 'revisão'],
      'nao enciclopedico': ['nao enciclopedico', 'não enciclopédico', 'nao-enciclopedico', 'nao_enciclopedico', 'não_enciclopédico'],
      vies: ['vies', 'viés'],
      desatualizado: ['desatualizado', 'desatualizada'],
      deadlinks: ['deadlinks', 'links mortos']
    }

    const selected = issues.filter(([key]) => {
      const keys = [key, ...(aliases[key] || [])].map(normalizeKey)
      return keys.some(item => templateEnabled(data.meta[item]))
    })

    const renderedIssues = (selected.length ? selected : issues.slice(0, 4))
      .filter(([key]) => !templateDisabled(data.meta[normalizeKey(key)]) )
      .map(([, text]) => `- ${text}`)
      .join('\n')

    const image = templateValue(data, ['imagem', 'image'], '')
    return renderWikiTemplateShell({
      type: 'issues',
      title: 'Foram assinalados vários problemas nesta página ou seção',
      body: `${renderedIssues}\n\nDiscuta na [[Discussão:${templateValue(data, ['pagina', 'página', 'page'], '') || 'esta página'}|página de discussão]] antes de remover este template.`,
      image,
      icon: '⚠️',
      imagePosition: templateValue(data, ['posicao', 'posição'], 'left'),
      accent: '#d18a28',
      options
    })
  }

  function renderSourceTemplate(data, options = {}) {
    const date = templateValue(data, ['data', 'date'], '')
    const image = templateValue(data, ['imagem', 'image'], '')
    return renderWikiTemplateShell({
      type: 'sources',
      title: 'Esta página cita fontes, mas elas não cobrem todo o conteúdo',
      body: `Ajude a inserir referências confiáveis.${date ? `\n\n*Marcado em ${date}.*` : ''}`,
      image,
      icon: '📖',
      accent: '#3f6fa8',
      compact: true,
      options
    })
  }

  function renderMergeTemplate(data, options = {}) {
    const target = templateArg(data, 1, templateValue(data, ['artigo', 'page', 'pagina'], 'outro artigo'))
    const date = templateValue(data, ['data', 'date'], '')
    const image = templateValue(data, ['imagem', 'image'], '')
    return renderWikiTemplateShell({
      type: 'merge',
      title: `Este artigo ou seção deverá ser fundido com [[${target}]]${date ? ` (${date})` : ''}`,
      body: `Se discorda, discuta sobre a fusão na página de discussão daquele artigo.`,
      image,
      icon: '🔀',
      accent: '#3f6fa8',
      compact: true,
      options
    })
  }

  function renderStubTemplate(data, options = {}) {
    const topic = templateArg(data, 1, templateValue(data, ['tema', 'topic'], 'artigo'))
    const image = templateValue(data, ['imagem', 'image'], '')
    return renderWikiTemplateShell({
      type: 'stub',
      title: 'Este artigo ainda é um esboço',
      body: `Você pode ajudar ${runtime.config.site.name} expandindo este ${topic}.`,
      image,
      icon: '🧩',
      accent: '#777777',
      compact: true,
      options
    })
  }

  function renderRegisteredTemplate(data, options = {}) {
    const template = findRegisteredTemplate(data.name, options)
    if (!template || template.status === 'disabled') return ''
    const source = template.render || template.renderMarkdown || template.body || template.template || ''
    if (!source) return ''

    const renderedSource = replaceTemplatePlaceholders(source, data)
    const expansion = options.expansion
    if (++expansion.count > 1024 || (expansion.length += renderedSource.length) > 1024 * 1024) {
      return `<aside class="template-box">${escapeHtml(data.name)}: ${ui('limite de transclusão atingido', 'transclusion limit reached')}</aside>`
    }
    if (/^\s*:::/m.test(renderedSource) || /^\s*\{\{/m.test(renderedSource)) {
      return markdownToHtml(renderedSource, { ...options, templateDepth: (options.templateDepth || 0) + 1 })
    }

    return renderWikiTemplateShell({
      type: template.kind || template.boxStyle || 'custom',
      title: templateValue(data, ['titulo', 'título', 'title'], template.title || data.name),
      body: renderedSource,
      image: templateValue(data, ['imagem', 'image'], template.imageUrl || template.image || ''),
      icon: templateValue(data, ['icone', 'ícone', 'icon'], template.icon || ''),
      imagePosition: templateValue(data, ['posicao', 'posição', 'imagePosition'], template.imagePosition || 'left'),
      accent: templateValue(data, ['cor', 'accent', 'accentColor'], template.accentColor || ''),
      options
    })
  }

  function renderTemplateBlock(value, options = {}) {
    if (!runtime.featureEnabled('templates')) return `<p>${escapeHtml(value)}</p>`
    const data = parseTemplateParts(value)
    const name = normalizeKey(data.name)

    if ((options.templateDepth || 0) > 8) {
      return `<aside class="template-box">${escapeHtml(data.name)}: ${ui('limite de transclusão atingido', 'transclusion limit reached')}</aside>`
    }

    if (name === 'infobox' || name === 'infocaixa') {
      const lines = []
      const entries = data.metaEntries?.length
        ? data.metaEntries
        : Object.entries(data.meta).map(([key, value]) => ({ key, value }))
      for (const { key, value } of entries) lines.push(`${key}: ${value}`)
      return renderInfoboxBlock(data.args[0] || '', lines.join('\n'), options)
    }

    const registered = renderRegisteredTemplate(data, options)
    if (registered) return registered

    if (name === 'artigo principal' || name === 'principal' || name === 'main') {
      const links = data.args.map(item => `[[${item}]]`).join(', ')
      return `<aside class="template-box template-main">Artigo principal: ${inlineMarkdown(links)}</aside>`
    }

    if (name === 'ver tambem' || name === 'ver também' || name === 'seealso') {
      const links = data.args.map(item => `[[${item}]]`).join(' · ')
      return `<aside class="template-box template-seealso">Ver também: ${inlineMarkdown(links)}</aside>`
    }

    if (['candidato a exclusao', 'candidato à exclusão', 'eliminar', 'eliminacao', 'eliminação', 'delete', 'deletion'].includes(name)) {
      return renderDeleteTemplate(data, options)
    }

    if (['problemas', 'multiplos problemas', 'múltiplos problemas', 'multiple issues'].includes(name)) {
      return renderMultipleIssuesTemplate(data, options)
    }

    if (['fontes', 'sem fontes', 'mais fontes', 'referencias', 'referências', 'fontes nao cobrem tudo', 'fontes não cobrem tudo'].includes(name)) {
      return renderSourceTemplate(data, options)
    }

    if (['fundir', 'fundir com', 'merge'].includes(name)) {
      return renderMergeTemplate(data, options)
    }

    if (['stub', 'esboco', 'esboço'].includes(name)) {
      return renderStubTemplate(data, options)
    }

    if (name === 'nota' || name === 'aviso' || name === 'erro' || name === 'info') {
      const kind = name === 'erro' ? 'erro' : name === 'aviso' ? 'aviso' : 'info'
      const title = templateValue(data, ['title', 'titulo', 'título'], name === 'nota' ? 'Nota' : '')
      const text = templateValue(data, ['text', 'texto', 'conteudo', 'conteúdo'], data.args.join(' '))
      return `
        <aside class="messagebox messagebox-${escapeHtml(kind)}">
          ${title ? `<strong>${escapeHtml(title)}</strong>` : ''}
          <div>${markdownToHtml(text, options)}</div>
        </aside>
      `
    }

    return `<aside class="template-box">${ui('Template não reconhecido', 'Unrecognized template')}: <code>${escapeHtml(data.name)}</code>${data.args.length ? ` — ${inlineMarkdown(data.args.join(' · '))}` : ''}</aside>`
  }


  function mediaCaptionText(caption) {
    return String(caption || '').replace(/^\s*\[\[(?:Arquivo|File)\s*:\s*[^|\]]+\|([^\]]+)]]\s*$/i, '$1')
  }

  function mediaDetailsFromSource(src, explicit = '') {
    const inferred = (() => {
      try {
        const parsed = new URL(String(src || ''), runtime.href)
        const parts = parsed.pathname.split('/').filter(Boolean)
        const apiIndex = parts.findIndex((part, index) => part === 'api' && parts[index + 1] === 'files')
        const slug = apiIndex >= 0 && parts[apiIndex + 3] === 'content' ? parts[apiIndex + 2] : ''
        if (slug) return runtime.pageUrl(`arquivo/${decodeURIComponent(slug)}`)
      } catch {}

      const match = String(src || '').match(/\/api\/files\/([^/?#]+)\/content(?:[?#].*)?$/i)
      if (match?.[1]) {
        try {
          return runtime.pageUrl(`arquivo/${decodeURIComponent(match[1])}`)
        } catch {
          return ''
        }
      }
      return ''
    })()

    if (!explicit) return inferred
    const safeExplicit = safeHref(explicit)
    if (safeExplicit === '#') return inferred
    if (/\/api\/files\/[^/?#]+\/content(?:[?#].*)?$/i.test(String(safeExplicit))) return inferred || safeExplicit
    return safeExplicit
  }

  function mediaKindFromSource(src, explicit = '') {
    const clean = String(explicit || '').toLowerCase()
    if (clean.startsWith('video')) return 'video'
    if (clean.startsWith('audio')) return 'audio'
    if (clean.startsWith('image')) return 'image'

    const value = String(src || '')
    if (/^(youtube|youtu):/i.test(value) || /(?:youtube\.com|youtu\.be)/i.test(value)) return 'video'
    if (/\.(mp4|webm|ogv|mov|m4v)(?:[?#].*)?$/i.test(value)) return 'video'
    if (/\.(mp3|wav|oga|ogg|flac|aac|m4a)(?:[?#].*)?$/i.test(value)) return 'audio'
    return 'image'
  }

  function cleanTypedMediaSource(src) {
    return String(src || '').replace(/^(youtube|youtu|video|audio|image):\s*/i, '').trim()
  }

  function mediaAttributes({ src, type = '', title = '', caption = '', details = '' }) {
    const cleanSrc = cleanTypedMediaSource(src)
    const mediaType = mediaKindFromSource(src, type)
    const detailUrl = mediaDetailsFromSource(cleanSrc, details)
    const embed = mediaType === 'video' ? youtubeEmbedUrl(cleanSrc) : ''
    const mediaSrc = embed ? cleanSrc : safeMediaSource(cleanSrc)
    const interactive = mediaType === 'image'
      ? [
        'data-media-viewer',
        'role="button"',
        'tabindex="0"',
      ]
      : []

    return [
      ...interactive,
      'draggable="false"',
      `data-media-type="${escapeHtml(mediaType)}"`,
      mediaSrc ? `data-media-src="${escapeHtml(mediaSrc)}"` : '',
      embed ? `data-media-embed="${escapeHtml(embed)}"` : '',
      `data-media-title="${escapeHtml(title)}"`,
      `data-media-caption="${escapeHtml(cleanHeadingText(caption))}"`,
      detailUrl ? `data-media-details="${escapeHtml(detailUrl)}"` : ''
    ].filter(Boolean).join(' ')
  }

  function mediaElementHtml({ src, type = '', attrs = '', alt = '', title = '' }) {
    const cleanSrc = cleanTypedMediaSource(src)
    const mediaType = mediaKindFromSource(src, type)
    const embed = mediaType === 'video' ? youtubeEmbedUrl(cleanSrc) : ''
    if (embed) {
      return `<iframe class="wiki-media-iframe" src="${escapeHtml(embed)}" title="${escapeHtml(title || alt || ui('vídeo incorporado', 'embedded video'))}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen ${attrs}></iframe>`
    }
    const safeSrc = safeMediaSource(cleanSrc)
    if (!safeSrc) return ''
    if (mediaType === 'video') return `<video src="${escapeHtml(safeSrc)}" controls preload="metadata" ${attrs}></video>`
    if (mediaType === 'audio') return `<audio src="${escapeHtml(safeSrc)}" controls preload="metadata" ${attrs}></audio>`
    return `<img loading="lazy" decoding="async" src="${escapeHtml(safeSrc)}" alt="${escapeHtml(alt)}" ${attrs} />`
  }

  function decodeEntities(value) {
    return String(value || '').replace(/&(?:amp|lt|gt|quot|apos|#0*39|#\d+|#x[\da-f]+);/gi, entity => {
      const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" }
      if (entity.toLowerCase() in named) return named[entity.toLowerCase()]
      const code = entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10)
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity
    })
  }

  function inlineMarkdown(text) {
    const raw = String(text || '')
    if (!/[&`!\[*_~]/.test(raw)) return escapeHtml(raw)
    const cached = inlineCache?.get(raw)
    if (cached !== undefined) return cached
    const html = renderInline(raw)
    if (inlineCache && inlineCache.size < 256 && raw.length <= 1024) inlineCache.set(raw, html)
    return html
  }

  function renderInline(text) {
    const parts = []
    const protect = html => { const token = `@@WIKICAMBADA_INLINE_${parts.length}@@`; parts.push(html); return token }
    const protectToken = (token, render) => {
      const cached = tokenCache?.get(token)
      if (cached !== undefined) return protect(cached)
      const html = render()
      if (tokenCache && tokenCache.size < 256 && token.length <= 1024) tokenCache.set(token, html)
      return protect(html)
    }
    let raw = String(text || '').replace(/`([^`]+)`/g, (_, code) => protect(`<code>${escapeHtml(code)}</code>`))
    raw = raw.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (token, alt, url) => protectToken(token, () => {
      alt = decodeEntities(alt)
      const src = safeMediaSource(decodeEntities(url))
      return src ? `<img class="markdown-image" loading="lazy" decoding="async" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" ${mediaAttributes({ src, title: alt, caption: alt })} />` : escapeHtml(alt)
    }))
    raw = raw.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?]]/g, (token, target, label) => protectToken(token, () => {
      const clean = decodeEntities(target).trim()
      const index = clean.indexOf('#')
      const fragment = index >= 0 ? clean.slice(index + 1) : ''
      const cleanTarget = index >= 0 ? clean.slice(0, index) : clean
      const category = cleanTarget.match(/^Categoria\s*:\s*(.+)$/i)
      const file = cleanTarget.match(/^(Arquivo|File)\s*:\s*(.+)$/i)
      const user = cleanTarget.match(/^Usu[aá]rio\s*:\s*(.+)$/i)
      const talk = cleanTarget.match(/^(Discuss[aã]o|Talk)\s*:\s*(.+)$/i)
      const path = value => String(value).split('/').filter(Boolean).map(slugify).join('/')
      const slug = category ? `categoria/${path(category[1])}` : file ? `arquivo/${path(file[2])}` : user ? userPageSlug(user[1]) : talk ? talkPageSlug(talk[2]) : path(cleanTarget)
      const display = decodeEntities(label || (category ? category[1] : file ? file[2] : user ? user[1] : talk ? talk[2] : clean))
      const href = cleanTarget ? runtime.pageUrl(slug) : ''
      return `<a href="${escapeHtml(href + (fragment ? '#' + encodeURIComponent(fragment) : ''))}" data-link="page" data-slug="${escapeHtml(slug)}">${escapeHtml(display)}</a>`
    }))
    raw = raw.replace(/\[([^\]]+)]\(([^)]+)\)/g, (token, label, url) => protectToken(token, () => {
      const href = decodeEntities(url)
      return `<a href="${escapeHtml(safeHref(href))}"${internalLinkAttributes(href)}>${escapeHtml(decodeEntities(label))}</a>`
    }))
    let html = escapeHtml(decodeEntities(raw))
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<u>$1</u>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>')
    return html.replace(/@@WIKICAMBADA_INLINE_(\d+)@@/g, (token, index) => parts[Number(index)] ?? token)
  }

  function extractComponentData(text) {
    const lines = String(text || '').split('\n')
    const meta = {}
    const entries = []
    const body = []
    let readingMeta = true

    for (const line of lines) {
      const clean = line.trim()
      const pair = clean.match(/^([^:]{1,48}):\s*(.*)$/)

      if (readingMeta && clean === '---') {
        readingMeta = false
        continue
      }

      if (readingMeta && pair) {
        const key = pair[1].trim()
        const value = pair[2].trim()
        entries.push({ key, value })
        meta[normalizeKey(key)] = value
        continue
      }

      if (readingMeta && !clean) {
        readingMeta = false
        continue
      }

      readingMeta = false
      body.push(line)
    }

    return { meta, entries, body: body.join('\n').trim() }
  }

  function getMeta(data, keys, fallback = '') {
    for (const key of keys) {
      const value = data.meta[normalizeKey(key)]
      if (value) return value
    }

    return fallback
  }

  function entryKeyIndex(key) {
    const match = normalizeKey(key).match(/(\d+)$/)
    return match ? Math.max(0, Number.parseInt(match[1], 10) - 1) : null
  }

  function isImageEntryKey(key) {
    const clean = normalizeKey(key).replace(/[\s_-]*\d+$/, '')
    return ['image', 'imagem', 'logo', 'foto'].includes(clean)
  }

  function isCaptionEntryKey(key) {
    const clean = normalizeKey(key).replace(/[\s_-]*\d+$/, '')
    return ['caption', 'legenda'].includes(clean)
  }

  function collectInfoboxImages(data) {
    const images = []
    for (const entry of data.entries) {
      if (!isImageEntryKey(entry.key) || !entry.value) continue
      const index = entryKeyIndex(entry.key)
      if (index !== null) {
        images[index] = { ...(images[index] || {}), src: entry.value }
      } else {
        images.push({ src: entry.value })
      }
    }

    let captionCursor = 0
    for (const entry of data.entries) {
      if (!isCaptionEntryKey(entry.key) || !entry.value) continue
      const index = entryKeyIndex(entry.key)
      if (index !== null) {
        images[index] = { ...(images[index] || {}), caption: entry.value }
        continue
      }

      while (images[captionCursor]?.caption) captionCursor += 1
      if (images[captionCursor]) images[captionCursor].caption = entry.value
      else images.push({ caption: entry.value })
    }

    return images.filter(item => item?.src)
  }

  function renderInfoboxImages(images, title) {
    if (!images.length) return ''
    return images.map((item, index) => {
      const src = safeMediaSource(item.src)
      if (!src) return ''
      const caption = item.caption || ''
      const label = images.length > 1 ? `${title || 'Infocaixa'} ${index + 1}` : title
      return `
        <figure class="infobox-image">
          <img loading="lazy" decoding="async" src="${escapeHtml(src)}" alt="${escapeHtml(caption || label || 'imagem da infocaixa')}" ${mediaAttributes({ src, title: label || caption, caption })} />
          ${caption ? `<figcaption class="infobox-caption">${inlineMarkdown(caption)}</figcaption>` : ''}
        </figure>
      `
    }).join('')
  }

  function renderInfoboxBlock(argument, body, options = {}) {
    const data = extractComponentData(body)
    const title = getMeta(data, ['title', 'titulo', 'título'], argument || ui('Infocaixa', 'Infobox'))
    const subtitle = getMeta(data, ['subtitle', 'subtitulo', 'subtítulo'])
    const reservedNames = ['title', 'titulo', 'título', 'subtitle', 'subtitulo', 'subtítulo', 'class', 'classe']
    const reserved = new Set(reservedNames.map(normalizeKey))
    const images = collectInfoboxImages(data)

    const rows = data.entries
      .filter(entry => !reserved.has(normalizeKey(entry.key)))
      .filter(entry => !isImageEntryKey(entry.key) && !isCaptionEntryKey(entry.key))
      .map(row => `
        <div class="infobox-row">
          <b>${escapeHtml(row.key)}</b>
          <span>${inlineMarkdown(row.value)}</span>
        </div>
      `)
      .join('')

    return `
      <aside class="infobox infobox-inline" aria-label="${ui('Infocaixa', 'Infobox')}">
        <div class="infobox-title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="infobox-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        ${renderInfoboxImages(images, title)}
        ${rows}
        ${data.body ? `<div class="infobox-note">${markdownToHtml(data.body, options)}</div>` : ''}
      </aside>
    `
  }

  function renderMessageBoxBlock(argument, body, options = {}) {
    const data = extractComponentData(body)
    const kind = slugify(argument || getMeta(data, ['type', 'tipo'], 'info'))
    const title = getMeta(data, ['title', 'titulo', 'título'])

    return `
      <aside class="messagebox messagebox-${escapeHtml(kind)}">
        ${title ? `<strong>${escapeHtml(title)}</strong>` : ''}
        <div>${markdownToHtml(data.body, options)}</div>
      </aside>
    `
  }

  function renderQuoteBlock(argument, body, options = {}) {
    const data = extractComponentData(body)
    const cite = getMeta(data, ['cite', 'autor', 'fonte'], argument || '')

    return `
      <figure class="wiki-quote">
        <blockquote>${markdownToHtml(data.body, options)}</blockquote>
        ${cite ? `<figcaption>${inlineMarkdown(cite)}</figcaption>` : ''}
      </figure>
    `
  }

  function renderPanelBlock(argument, body, options = {}) {
    const data = extractComponentData(body)
    const title = getMeta(data, ['title', 'titulo', 'título'], argument || ui('Seção', 'Section'))

    return `
      <section class="wiki-panel">
        <h2>${escapeHtml(title)}</h2>
        <div class="wiki-panel-body">${markdownToHtml(data.body, options)}</div>
      </section>
    `
  }

  function splitCards(body) {
    const cards = []
    let current = []

    for (const line of String(body || '').split('\n')) {
      if (line.trim() === '---') {
        if (current.join('\n').trim()) cards.push(current.join('\n'))
        current = []
        continue
      }

      current.push(line)
    }

    if (current.join('\n').trim()) cards.push(current.join('\n'))
    return cards
  }

  function renderCardsBlock(argument, body, options = {}) {
    const cards = splitCards(body)
    const className = argument ? ` wiki-card-grid-${slugify(argument)}` : ''

    return `
      <section class="wiki-card-grid${className}">
        ${cards.map(card => {
          const data = extractComponentData(card)
          const title = getMeta(data, ['title', 'titulo', 'título'], ui('Seção', 'Section'))
          return `
            <article class="portal-card wiki-card">
              <h2>${escapeHtml(title)}</h2>
              <div class="portal-card-body">${markdownToHtml(data.body, options)}</div>
            </article>
          `
        }).join('')}
      </section>
    `
  }

  function renderTopicsBlock(body) {
    const links = String(body || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [label, query] = line.split('|').map(part => part?.trim())
        const term = query || label
        return `<a href="${escapeHtml(searchUrl(term))}" data-search="${escapeHtml(term)}">${escapeHtml(label)}</a>`
      })
      .join('')

    return `<nav class="topic-strip" aria-label="${ui('Tópicos', 'Topics')}">${links}</nav>`
  }


  function safeCssColor(value) {
    const clean = String(value || '').trim()
    if (/^#[0-9a-f]{3,8}$/i.test(clean)) return clean
    if (/^(rgb|rgba|hsl|hsla)\([0-9.,%\s-]+\)$/i.test(clean)) return clean
    return ''
  }

  function safeBackgroundImage(value) {
    const clean = String(value || '').trim()
    if (!clean) return ''
    try {
      const parsed = new URL(clean, runtime.href)
      if (['http:', 'https:'].includes(parsed.protocol)) return `url("${clean.replaceAll('"', '%22')}")`
    } catch {}
    return ''
  }

  function safeGradient(value) {
    const clean = String(value || '').trim()
    if (!/^(linear-gradient|radial-gradient)\(/i.test(clean)) return ''
    if (/url\s*\(|expression\s*\(|javascript:/i.test(clean)) return ''
    return clean.replace(/[<>]/g, '')
  }

  function renderBackgroundBlock(argument, body, options = {}) {
    const data = extractComponentData(body)
    const title = getMeta(data, ['title', 'titulo', 'título'], argument || '')
    const color = safeCssColor(getMeta(data, ['color', 'cor', 'background', 'fundo']))
    const gradient = safeGradient(getMeta(data, ['gradient', 'gradiente']))
    const image = safeBackgroundImage(getMeta(data, ['image', 'imagem']))
    const styleParts = []

    if (gradient) styleParts.push(`--wiki-box-bg: ${gradient}`)
    else if (color) styleParts.push(`--wiki-box-bg: ${color}`)
    if (image) styleParts.push(`--wiki-box-image: ${image}`)

    return `
      <section class="wiki-background-box"${styleParts.length ? ` style="${escapeHtml(styleParts.join('; '))}"` : ''}>
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
        <div>${markdownToHtml(data.body, options)}</div>
      </section>
    `
  }

  function youtubeEmbedUrl(value) {
    const clean = String(value || '').trim()
    if (!clean) return ''

    try {
      const parsed = new URL(clean, runtime.href)
      const host = parsed.hostname.replace(/^www\./, '')
      let id = ''
      if (host === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] || ''
      if (host.endsWith('youtube.com')) {
        if (parsed.pathname.startsWith('/watch')) id = parsed.searchParams.get('v') || ''
        else if (parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.split('/').filter(Boolean)[1] || ''
      }
      if (/^[A-Za-z0-9_-]{6,}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
    } catch {}

    if (/^[A-Za-z0-9_-]{6,}$/.test(clean)) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(clean)}`
    return ''
  }

  function renderVideoBlock(argument, body, options = {}) {
    const data = extractComponentData(body)
    const title = getMeta(data, ['title', 'titulo', 'título'], argument || '')
    const src = getMeta(data, ['src', 'video', 'vídeo', 'url', 'link', 'youtube'])
    const caption = getMeta(data, ['caption', 'legenda'], data.body)
    const details = getMeta(data, ['details', 'detalhes', 'file', 'arquivo', 'page', 'pagina', 'página'])
    if (!src) return ''

    const embed = youtubeEmbedUrl(src)
    const detailsUrl = details && !details.startsWith('/') && !details.startsWith('http')
      ? runtime.pageUrl(details.startsWith('arquivo/') ? details : `arquivo/${slugify(details)}`)
      : details
    const displayCaption = mediaCaptionText(caption)

    const attrs = mediaAttributes({ src, type: 'video', title, caption: displayCaption, details: detailsUrl })
    const media = mediaElementHtml({ src, type: 'video', attrs, alt: title || displayCaption, title })
    return `
      <section class="wiki-video-box">
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
        <figure class="wiki-video-figure">
          ${media}
          ${displayCaption ? `<figcaption>${markdownToHtml(displayCaption, options)}</figcaption>` : ''}
        </figure>
      </section>
    `
  }

  function renderAudioBlock(argument, body, options = {}) {
    const data = extractComponentData(body)
    const title = getMeta(data, ['title', 'titulo', 'título'], argument || '')
    const src = getMeta(data, ['src', 'audio', 'áudio', 'url', 'link'])
    const caption = getMeta(data, ['caption', 'legenda'], data.body)
    const details = getMeta(data, ['details', 'detalhes', 'file', 'arquivo', 'page', 'pagina', 'página'])
    if (!src) return ''

    const detailsUrl = details && !details.startsWith('/') && !details.startsWith('http')
      ? runtime.pageUrl(details.startsWith('arquivo/') ? details : `arquivo/${slugify(details)}`)
      : details
    const displayCaption = mediaCaptionText(caption)
    const attrs = mediaAttributes({ src, type: 'audio', title, caption: displayCaption, details: detailsUrl })
    const media = mediaElementHtml({ src, type: 'audio', attrs, alt: title || displayCaption, title })

    return `
      <section class="wiki-audio-box">
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
        <figure class="wiki-audio-figure">
          ${media}
          ${displayCaption ? `<figcaption>${markdownToHtml(displayCaption, options)}</figcaption>` : ''}
        </figure>
      </section>
    `
  }

  function renderImageBlock(argument, body, options = {}) {
    const data = extractComponentData(body)
    const title = getMeta(data, ['title', 'titulo', 'título'], argument || '')
    const src = getMeta(data, ['src', 'image', 'imagem', 'video', 'vídeo'])
    const alt = getMeta(data, ['alt'], '')
    const caption = getMeta(data, ['caption', 'legenda'], data.body)
    const explicitType = getMeta(data, ['type', 'tipo', 'mime', 'mime_type'])
    const details = getMeta(data, ['details', 'detalhes', 'file', 'arquivo', 'page', 'pagina', 'página'])
    const mediaType = mediaKindFromSource(src, explicitType)
    const detailsUrl = details && !details.startsWith('/') && !details.startsWith('http')
      ? runtime.pageUrl(details.startsWith('arquivo/') ? details : `arquivo/${slugify(details)}`)
      : details

    if (!src) return ''

    const displayCaption = mediaCaptionText(caption)
    const attrs = mediaAttributes({ src, type: mediaType, title: title || alt, caption: displayCaption, details: detailsUrl })
    const media = mediaElementHtml({ src, type: mediaType, attrs, alt, title: title || alt })

    return `
      <section class="image-day wiki-image-box">
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
        <figure class="wiki-media-figure">
          ${media}
          ${displayCaption ? `<figcaption>${markdownToHtml(displayCaption, options)}</figcaption>` : ''}
        </figure>
      </section>
    `
  }

  function renderThumbBlock(argument, body, options = {}) {
    const data = extractComponentData(body)
    const title = getMeta(data, ['title', 'titulo', 'título'], argument || '')
    const src = getMeta(data, ['src', 'image', 'imagem', 'video', 'vídeo'])
    const alt = getMeta(data, ['alt'], title || '')
    const caption = getMeta(data, ['caption', 'legenda'], data.body)
    const explicitType = getMeta(data, ['type', 'tipo', 'mime', 'mime_type'])
    const details = getMeta(data, ['details', 'detalhes', 'file', 'arquivo', 'page', 'pagina', 'página'])
    const align = slugify(getMeta(data, ['align', 'alinhamento'], 'right'))
    const widthValue = getMeta(data, ['width', 'largura'], '260')
    const width = Math.min(420, Math.max(120, Number.parseInt(widthValue, 10) || 260))
    const mediaType = mediaKindFromSource(src, explicitType)
    const detailsUrl = details && !details.startsWith('/') && !details.startsWith('http')
      ? runtime.pageUrl(details.startsWith('arquivo/') ? details : `arquivo/${slugify(details)}`)
      : mediaDetailsFromSource(src, details)

    if (!src) return ''

    const displayCaption = mediaCaptionText(caption)
    const attrs = mediaAttributes({ src, type: mediaType, title: title || alt, caption: displayCaption, details: detailsUrl })
    const media = mediaElementHtml({ src, type: mediaType, attrs, alt, title: title || alt })
    const detailLink = detailsUrl
      ? `<a class="wiki-thumb-detail" href="${escapeHtml(detailsUrl)}" data-link="route" aria-label="${ui('Abrir página do arquivo', 'Open file page')}" title="${ui('Abrir página do arquivo', 'Open file page')}">⧉</a>`
      : ''

    return `
      <figure class="wiki-thumb wiki-thumb-${escapeHtml(align === 'left' ? 'left' : align === 'center' ? 'center' : 'right')}" style="--thumb-width: ${width}px">
        <div class="wiki-thumb-media">${media}</div>
        ${displayCaption || detailLink ? `<figcaption><span>${markdownToHtml(displayCaption, options)}</span>${detailLink}</figcaption>` : ''}
      </figure>
    `
  }


  function renderGalleryBlock(argument, body, options = {}) {
    const title = argument || ''
    const items = String(body || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [srcPartRaw, captionPart, detailsPart] = line.split('|').map(part => part?.trim() || '')
        const prefix = srcPartRaw.match(/^(youtube|youtu|video|audio|image):\s*(.+)$/i)
        const explicitType = prefix
          ? prefix[1].toLowerCase().startsWith('audio') ? 'audio' : prefix[1].toLowerCase().startsWith('image') ? 'image' : 'video'
          : ''
        const src = prefix ? prefix[2] : srcPartRaw
        const caption = captionPart || ''
        const details = detailsPart || ''
        const mediaType = mediaKindFromSource(src, explicitType)
        const detailUrl = details && !details.startsWith('/') && !details.startsWith('http')
          ? runtime.pageUrl(details.startsWith('arquivo/') ? details : `arquivo/${slugify(details)}`)
          : mediaDetailsFromSource(src, details)

        if (!src) return ''

        const attrs = mediaAttributes({ src, type: mediaType, title: caption, caption, details: detailUrl })
        const media = mediaElementHtml({ src, type: mediaType, attrs, alt: caption, title: caption })
        const detailLink = detailUrl
          ? `<a class="wiki-gallery-detail" href="${escapeHtml(detailUrl)}" data-link="route" aria-label="${ui('Abrir página do arquivo', 'Open file page')}" title="${ui('Abrir página do arquivo', 'Open file page')}">⧉</a>`
          : ''

        return `
          <figure class="wiki-gallery-item">
            <div class="wiki-gallery-media">${media}</div>
            ${caption || detailLink ? `<figcaption><span>${inlineMarkdown(caption)}</span>${detailLink}</figcaption>` : ''}
          </figure>
        `
      })
      .join('')

    return `
      <section class="wiki-gallery" aria-label="${ui('Galeria de mídia', 'Media gallery')}">
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
        <div class="wiki-gallery-grid">${items}</div>
      </section>
    `
  }

  function renderWelcomeBlock(body, options = {}) {
    const data = extractComponentData(body)
    const title = getMeta(data, ['title', 'titulo', 'título'], runtime.config.site.name)

    return `
      <section class="welcome-box wiki-welcome">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <div>${markdownToHtml(data.body || runtime.config.site.tagline, options)}</div>
        </div>
      </section>
    `
  }


  function renderTemplateBoxBlock(argument, body, options = {}) {
    const data = extractComponentData(body)
    const kind = argument || getMeta(data, ['tipo', 'type', 'estilo'], 'custom')
    const title = getMeta(data, ['title', 'titulo', 'título'])
    const subtitle = getMeta(data, ['subtitle', 'subtitulo', 'subtítulo', 'resumo'])
    const image = getMeta(data, ['image', 'imagem'])
    const icon = getMeta(data, ['icon', 'icone', 'ícone'])
    const imagePosition = getMeta(data, ['position', 'posicao', 'posição', 'image_position'], 'left')
    const accent = getMeta(data, ['accent', 'cor', 'accent_color'])
    const footer = getMeta(data, ['footer', 'rodape', 'rodapé'])

    return renderWikiTemplateShell({
      type: kind,
      title,
      subtitle,
      body: data.body,
      footer,
      image,
      icon,
      imagePosition,
      accent,
      compact: templateEnabled(getMeta(data, ['compacto', 'compact'], '')),
      options
    })
  }



  function renderComponentBlock(type, argument, body, options = {}) {
    const normalized = normalizeKey(type)

    if (normalized === 'infobox' || normalized === 'infocaixa') return renderInfoboxBlock(argument, body, options)
    if (normalized === 'messagebox' || normalized === 'caixa' || normalized === 'aviso') return renderMessageBoxBlock(argument, body, options)
    if (normalized === 'quote' || normalized === 'citacao' || normalized === 'citação') return renderQuoteBlock(argument, body, options)
    if (normalized === 'panel' || normalized === 'painel') return renderPanelBlock(argument, body, options)
    if (normalized === 'cards' || normalized === 'cartoes' || normalized === 'cartões') return renderCardsBlock(argument, body, options)
    if (normalized === 'topics' || normalized === 'topicos' || normalized === 'tópicos') return renderTopicsBlock(body)
    if (normalized === 'background' || normalized === 'fundo') return renderBackgroundBlock(argument, body, options)
    if (normalized === 'image' || normalized === 'imagem') return renderImageBlock(argument, body, options)
    if (normalized === 'video' || normalized === 'vídeo' || normalized === 'youtube') return renderVideoBlock(argument, body, options)
    if (normalized === 'audio' || normalized === 'áudio') return renderAudioBlock(argument, body, options)
    if (normalized === 'thumb' || normalized === 'miniatura' || normalized === 'thumbnail') return renderThumbBlock(argument, body, options)
    if (normalized === 'gallery' || normalized === 'galeria') return renderGalleryBlock(argument, body, options)
    if (normalized === 'welcome' || normalized === 'boas-vindas') return renderWelcomeBlock(body, options)
    if (normalized === 'templatebox' || normalized === 'predefinicao' || normalized === 'predefinição') return renderTemplateBoxBlock(argument, body, options)

    return renderMessageBoxBlock('info', `title: ${type}\n\n${body}`, options)
  }

  function isTableLine(line) {
    return /^\|.*\|$/.test(line.trim())
  }

  function isTableSeparator(line) {
    return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim())
  }

  function tableCells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
  }

  function renderTable(lines) {
    const header = tableCells(lines[0])
    const bodyRows = lines.slice(2).map(tableCells)

    return `
      <table>
        <thead><tr>${header.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead>
        <tbody>${bodyRows.map(row => `<tr>${row.map(cell => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    `
  }

  function markdownToHtml(markdown, options = {}) {
    options = { expansion: { count: 0, length: 0 }, ...options }
    const lines = normalizeEscapedBlockNewlines(markdown).split('\n')
    const html = []
    const headingCounts = new Map()
    let list = null
    let paragraph = []
    let quote = []
    let tocInserted = false

    const flushParagraph = () => {
      if (!paragraph.length) return
      html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
      paragraph = []
    }

    const flushQuote = () => {
      if (!quote.length) return
      html.push(`<blockquote>${inlineMarkdown(quote.join(' '))}</blockquote>`)
      quote = []
    }

    const flushList = () => {
      if (!list) return
      html.push(`<${list.type}>${list.items.map(item => `<li>${inlineMarkdown(item)}</li>`).join('')}</${list.type}>`)
      list = null
    }

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i]
      const line = rawLine.trimEnd()
      const clean = line.trim()

      if (clean === '__TOC__' || clean === '__NOTOC__') {
        flushParagraph()
        flushQuote()
        flushList()
        if (clean === '__TOC__' && options.tocHtml && !tocInserted) {
          html.push(options.tocHtml)
          tocInserted = true
        }
        continue
      }

      if (!clean) {
        flushParagraph()
        flushQuote()
        flushList()
        continue
      }

      if (clean.startsWith('{{')) {
        flushParagraph()
        flushQuote()
        flushList()

        const templateLines = [clean]
        while (!templateLines.join('\n').trim().endsWith('}}') && i + 1 < lines.length) {
          i += 1
          templateLines.push(lines[i].trim())
        }

        const templateSource = templateLines.join('\n').replace(/^\s*\{\{/, '').replace(/}}\s*$/, '')
        html.push(renderTemplateBlock(templateSource, options))
        continue
      }

      if (clean.startsWith('```')) {
        flushParagraph()
        flushQuote()
        flushList()

        const code = []
        i += 1
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          code.push(lines[i])
          i += 1
        }

        html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        continue
      }

      const component = clean.match(/^:::\s*([\wÀ-ÿ-]+)(?:\s+(.+))?$/)
      if (component) {
        flushParagraph()
        flushQuote()
        flushList()

        const body = []
        i += 1
        while (i < lines.length && lines[i].trim() !== ':::') {
          body.push(lines[i])
          i += 1
        }

        html.push(renderComponentBlock(component[1], component[2] || '', body.join('\n'), options))
        continue
      }

      if (isTableLine(clean) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        flushParagraph()
        flushQuote()
        flushList()

        const table = [clean, lines[i + 1]]
        i += 2
        while (i < lines.length && isTableLine(lines[i])) {
          table.push(lines[i])
          i += 1
        }
        i -= 1

        html.push(renderTable(table))
        continue
      }

      if (clean.startsWith('> ')) {
        flushParagraph()
        flushList()
        quote.push(clean.slice(2))
        continue
      }

      const heading = clean.match(/^(#{2,4})\s+(.+)$/)
      if (heading) {
        flushParagraph()
        flushQuote()
        flushList()
        const level = heading[1].length
        const id = headingIdFromText(heading[2], headingCounts)
        html.push(`<h${level} id="${escapeHtml(id)}"><a class="section-anchor" href="#${escapeHtml(id)}" aria-label="${ui('Link para esta seção', 'Link to this section')}">§</a>${inlineMarkdown(heading[2])}</h${level}>`)
        continue
      }

      const unordered = clean.match(/^[-*]\s+(.+)$/)
      if (unordered) {
        flushParagraph()
        flushQuote()
        if (!list || list.type !== 'ul') list = { type: 'ul', items: [] }
        list.items.push(unordered[1])
        continue
      }

      const ordered = clean.match(/^\d+\.\s+(.+)$/)
      if (ordered) {
        flushParagraph()
        flushQuote()
        if (!list || list.type !== 'ol') list = { type: 'ol', items: [] }
        list.items.push(ordered[1])
        continue
      }

      flushQuote()
      flushList()
      paragraph.push(clean)
    }

    flushParagraph()
    flushQuote()
    flushList()
    return html.join('')
  }

  return { extractHeadings, inlineMarkdown, markdownToHtml }
}

export const { extractHeadings, inlineMarkdown, markdownToHtml } = createMarkdownRenderer(browserRenderRuntime)
