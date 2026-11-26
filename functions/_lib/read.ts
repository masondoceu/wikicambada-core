import { listCategories, listContentTemplates, listPageRevisions, listPages, normalizeSlug, pageListStats, publicUploadMetadata, readCategory, readPage, readPageRevision, readRandomPageSlug, readUpload, searchPageBatch, getGlobalSettings } from '../api/_lib/d1'
import { configuredFeature } from '../../src/scripts/core/config.js'
import { translate } from '../../src/scripts/core/i18n.js'
import { escapeHtml, pageUrl, parseRoute, slugify } from '../../src/scripts/core/utils.js'
import { exactSearchResult, isGeneratedSpecialSlug, specialFeature, specialPageInfo } from '../../src/scripts/routes/wiki-special.js'
import { createWikiRenderer } from '../../src/scripts/renderers/wiki-renderer.js'
import { readPublicConfig, readerHeaders, readerRedirect, renderReadDocument, type ReaderContext } from './read-document'
import { serveSpa } from './spa'
import { json } from '../api/_lib/response'
import release from '../../wikicambada-release.json'

function editorialDescription(markdown: string) {
  const blocks = markdown.replaceAll('\r', '').split('\n')
  let component = false
  let code = false
  const prose: string[] = []
  for (const line of blocks) {
    const text = line.trim()
    if (/^```|^~~~/.test(text)) { code = !code; continue }
    if (text.startsWith(':::')) { component = text !== ':::'; continue }
    if (component || code || !text || /^(?:#|\||__\w+__|\{\{|!\[)/.test(text)) continue
    const plain = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, label) => label || link)
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\{\{.*?\}\}|[*_`]/g, '')
      .replace(/^[-+>\s]+/, '').replace(/\s+/g, ' ').trim()
    if (plain) prose.push(plain)
    if (prose.join(' ').length >= 160) break
  }
  const text = prose.join(' ')
  return text.length > 160 ? text.slice(0, 157).trimEnd() + '…' : text
}

function representativeImage(html: string) {
  const match = html.split('<footer', 1)[0].match(/<img\b[^>]*\ssrc="([^"]+)"/)
  return match?.[1].replace(/&(?:amp|quot|lt|gt|#039);/g, entity =>
    ({ '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#039;': "'" })[entity] || entity)
}

export async function serveRead(context: ReaderContext): Promise<Response> {
  const { request, env } = context
  const url = new URL(request.url)
  try {
    const config = await readPublicConfig(context)
    const home = config.site.homeSlug
    const route = parseRoute(url, home)
    if (!['read', 'history', 'search'].includes(route.mode)) return serveSpa(context)
    if (!env.DB) return json({ ok: false, error: 'serviço temporariamente indisponível' }, { status: 503, headers: readerHeaders })

    const settings = await getGlobalSettings(env)
    const language = config.site.interfaceLanguage === 'en' ? 'en' : 'pt-BR'
    const locale = language === 'en' ? 'en-US' : 'pt-BR'
    const ui = (pt: string, en: string) => language === 'en' ? en : pt
    const enabled = (key: string, fallback = true) => configuredFeature(config, settings, key, fallback)
    const link = (slug: string, mode = 'read') => pageUrl(slug, mode, home)
    const version = env.WIKI_CORE_VERSION || release.displayVersion
    const renderer = createWikiRenderer({ config, featureEnabled: enabled, href: url.href, origin: url.origin, version, language: () => language, locale: () => locale, pageUrl: link })
    const reader = { canEdit: Boolean(context.data?.readerRole), authenticated: Boolean(context.data?.readerRole) }
    const slug = normalizeSlug(route.slug) || home
    const mode = route.mode
    const present = (title: string, html: string, options: Partial<Parameters<typeof renderReadDocument>[4]> = {}) =>
      renderReadDocument(context, config, settings, version, { slug, mode, title, html, ...options })
    const missing = () => present(ui('Página não encontrada', 'Page not found'), renderer.notFoundHtml(slug, reader), { status: 404 })
    const disabled = (title: string) => present(title, renderer.featureDisabledHtml(title), { status: 403 })
    const offsetValue = Number(url.searchParams.get('offset') || 0)
    const offset = Number.isSafeInteger(offsetValue) && offsetValue > 0 ? Math.min(offsetValue, 1000000) : 0
    const paginate = (size: number, next: number | null, path = url.pathname) => {
      const href = (start: number) => {
        const params = new URLSearchParams(url.searchParams)
        if (start) params.set('offset', String(start))
        else params.delete('offset')
        return escapeHtml(path + (params.size ? `?${params}` : ''))
      }
      const anchor = (key: string, start: number) => `<a class="secondary-button" data-link="route" href="${href(start)}">${escapeHtml(translate(language, key))}</a>`
      return offset || next !== null ? `<nav>${offset ? anchor('common.previous', Math.max(0, offset - size)) : ''} ${next !== null ? anchor('common.next', next) : ''}</nav>` : ''
    }

    const renderContext = async (content: string) => {
      const countArticles = /\{(?:articleCount|revisionCount)\}/.test(content)
      const countCategories = enabled('categories') && content.includes('{categoryCount}')
      const [stats, categories, templates] = await Promise.all([
        countArticles ? pageListStats(env, false, settings) : null,
        countCategories ? listCategories(env, settings) : [],
        enabled('templates') && content.includes('{{') ? listContentTemplates(env, { role: context.data?.readerRole || 'guest' }) : []
      ])
      return { articleCount: (stats?.total || 0).toLocaleString(locale), revisionCount: (stats?.revisions || 0).toLocaleString(locale),
        categoryCount: categories.length.toLocaleString(locale), templates, slogan: config.site.tagline }
    }

    if (mode === 'search') {
      if (!enabled('search')) return disabled(ui('Busca desativada', 'Search disabled'))
      const query = route.query || ''
      const data = await searchPageBatch(env, query, offset)
      const exact = !offset && exactSearchResult(query, data.results)
      if (exact) return readerRedirect(link(exact.slug) + (exact.targetFragment ? '#' + encodeURIComponent(exact.targetFragment) : ''))
      return present(ui(`Busca por ${query}`, `Search for ${query}`), renderer.searchHtml(query, data.results, reader) + paginate(20, data.nextOffset, '/search'))
    }

    const special = specialPageInfo(slug)
    if (special || isGeneratedSpecialSlug(slug)) {
      if (!special) return missing()
      const { key, canonical } = special
      if (!enabled(specialFeature(special)!) || key === 'categories' && !enabled('categories') || key === 'randomPage' && !enabled('randomPage')) {
        return disabled(ui('Página especial desativada', 'Special page disabled'))
      }
      const path = link(canonical)
      if (url.pathname !== path) return readerRedirect(path + (mode === 'history' ? '' : url.search))
      switch (key) {
        case 'index': return present(ui('Páginas especiais', 'Special pages'), renderer.specialPagesIndexHtml())
        case 'version': return present('WikiCambada Core', renderer.versionPageHtml())
        case 'categories': return present(ui('Categorias', 'Categories'), renderer.categoriesIndexHtml(await listCategories(env, settings)))
        case 'recentPages': return present(ui('Páginas recentes', 'Recent pages'), renderer.recentPagesHtml(await listPages(env, { sort: 'recent', limit: 100 })))
        case 'randomPage': return readerRedirect(link(await readRandomPageSlug(env, settings) || home))
        case 'allPages': {
          const pages = await listPages(env, { sort: 'title', limit: 100, offset })
          const stats = await pageListStats(env, false, settings)
          return present(ui('Todas as páginas', 'All pages'), renderer.allPagesHtml(pages) + paginate(100, offset + pages.length < (stats?.total || 0) ? offset + pages.length : null))
        }
      }
    }

    if (slug.startsWith('discussao/') && !enabled('talkPages')) return disabled(ui('Páginas de discussão desativadas', 'Discussion pages disabled'))
    if (slug.startsWith('usuario/') && !enabled('userPages')) return disabled(ui('Páginas de usuário desativadas', 'User pages disabled'))
    if (slug.startsWith('categoria/') && !enabled('categories')) return disabled(ui('Categorias desativadas', 'Categories disabled'))

    if (slug.startsWith('arquivo/')) {
      if (!enabled('mediaUploads')) return disabled(ui('Mídia desativada', 'Media disabled'))
      if (mode === 'history') return present(ui('Namespace de arquivo', 'File namespace'), renderer.fileNamespaceBlockedHtml(slug), { status: 404 })
      const file = await readUpload(env, slug.slice('arquivo/'.length))
      if (!file) return present(ui('Arquivo não encontrado', 'File not found'), renderer.fileUploadPageHtml(slug.slice('arquivo/'.length), reader), { status: 404 })
      const title = ui('Arquivo: ', 'File: ') + file.filename
      return present(title, renderer.filePageHtml(await publicUploadMetadata(env, file)), { slug: `arquivo/${file.slug}`, description: file.description })
    }

    if (mode === 'read' && slug.startsWith('categoria/')) {
      const category = await readCategory(env, slug.slice('categoria/'.length))
      if (!category) return missing()
      return present(ui('Categoria: ', 'Category: ') + category.name, renderer.categoryPageHtml(category))
    }

    if (mode === 'history' && !enabled('pageHistory')) return disabled(ui('Histórico desativado', 'History disabled'))
    const page = await readPage(env, slug, { settings, includeRevisions: false })
    if (!page) return missing()
    const path = link(page.slug, mode)
    if (url.pathname !== path && (page.resolvedBy || slug !== page.slug || url.pathname !== '/')) {
      const fragment = mode === 'read' && page.resolvedFragment ? '#' + encodeURIComponent(page.resolvedFragment) : ''
      return readerRedirect(path + url.search + fragment)
    }

    if (mode === 'history') {
      const revisionNumber = url.searchParams.get('revision')
      const compareNumber = url.searchParams.get('compare')
      if (revisionNumber || compareNumber) {
        const revision = await readPageRevision(env, page.slug, (revisionNumber || compareNumber)!, { settings, page })
        if (!revision) return missing()
        if (revisionNumber) {
          const html = renderer.revisionHtml(page, revision, await renderContext(revision.content), reader)
          return present(page.title + ui(' — Revisão ', ' — Revision ') + revision.revisionNumber, html)
        }
        return present(page.title + ui(' — Comparação', ' — Comparison'), renderer.revisionCompareHtml(page, revision, page, reader))
      }
      const revisions = await listPageRevisions(env, page.slug, { offset, settings, page })
      if (!revisions) return missing()
      return present(page.title + ui(' — Histórico', ' — History'), renderer.historyHtml(page, revisions, reader) + paginate(100, revisions.nextOffset))
    }

    const html = renderer.articleHtml(page, await renderContext(page.content))
    const canonical = /^(?:usuario|discussao)\//.test(page.slug) ? undefined : path
    return present(page.title, html, { slug: page.slug, canonical, description: editorialDescription(page.content) || page.subtitle, image: representativeImage(html) })
  } catch (cause) {
    const status = cause && typeof cause === 'object' && 'status' in cause && cause.status === 400 ? 400 : 503
    return json({ ok: false, error: status === 400 ? 'consulta inválida' : 'serviço temporariamente indisponível' }, { status, headers: readerHeaders })
  }
}
