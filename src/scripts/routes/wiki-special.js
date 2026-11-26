import { slugify, titleFromSlug } from '../core/utils.js'

const SPECIAL_PAGE_ALIASES = new Map([
  ['especial', { key: 'index', canonical: 'especial' }],
  ['especial/paginas-especiais', { key: 'index', canonical: 'especial' }],
  ['special', { key: 'index', canonical: 'especial' }],
  ['special/special-pages', { key: 'index', canonical: 'especial' }],
  ['todas-as-paginas', { key: 'allPages', canonical: 'especial/todas-as-paginas' }],
  ['especial/todas-as-paginas', { key: 'allPages', canonical: 'especial/todas-as-paginas' }],
  ['special/all-pages', { key: 'allPages', canonical: 'especial/todas-as-paginas' }],
  ['paginas-recentes', { key: 'recentPages', canonical: 'especial/paginas-recentes' }],
  ['especial/paginas-recentes', { key: 'recentPages', canonical: 'especial/paginas-recentes' }],
  ['special/recent-pages', { key: 'recentPages', canonical: 'especial/paginas-recentes' }],
  ['categorias', { key: 'categories', canonical: 'especial/categorias' }],
  ['especial/categorias', { key: 'categories', canonical: 'especial/categorias' }],
  ['special/categories', { key: 'categories', canonical: 'especial/categorias' }],
  ['pagina-aleatoria', { key: 'randomPage', canonical: 'especial/pagina-aleatoria' }],
  ['especial/pagina-aleatoria', { key: 'randomPage', canonical: 'especial/pagina-aleatoria' }],
  ['special/random-page', { key: 'randomPage', canonical: 'especial/pagina-aleatoria' }],
  ['version', { key: 'version', canonical: 'especial/versao' }],
  ['versao', { key: 'version', canonical: 'especial/versao' }],
  ['especial/versao', { key: 'version', canonical: 'especial/versao' }],
  ['especial/version', { key: 'version', canonical: 'especial/versao' }],
  ['special/version', { key: 'version', canonical: 'especial/versao' }]
])

export function specialPageInfo(slug) {
  return SPECIAL_PAGE_ALIASES.get(String(slug || '').trim().toLowerCase()) || null
}

export function specialPageSlugs() {
  return SPECIAL_PAGE_ALIASES.keys()
}

export function isGeneratedSpecialSlug(slug) {
  return Boolean(specialPageInfo(slug)) || String(slug || '').toLowerCase().startsWith('especial/') || String(slug || '').toLowerCase().startsWith('special/')
}

export function specialFeature(info) {
  return info ? `specialPages.${info.key}` : null
}

export function searchTitleForMatch(page) {
  const title = String(page?.title || page?.displayTitle || page?.matchedTitle || '').trim()
  if (title) return title
  const slug = String(page?.slug || page?.matchedSlug || '').split('/').filter(Boolean).pop() || ''
  return titleFromSlug(slug)
}

export function exactSearchResult(query, results = []) {
  const clean = String(query || '').trim()
  if (!clean) return null
  const expectedSlug = slugify(clean)
  return results.find(page => {
    if (!page?.slug) return false
    if (page.exact) return true
    const title = slugify(searchTitleForMatch(page))
    const slug = String(page.slug || '').trim().toLowerCase()
    const matchedTitle = slugify(page.matchedTitle || '')
    const matchedSlug = slugify(page.matchedSlug || '')
    return title === expectedSlug || slug === expectedSlug || matchedTitle === expectedSlug || matchedSlug === expectedSlug
  }) || null
}

