import { configuredFeature, navLinkHtml, resolveSiteConfig } from '../../src/scripts/core/config.js'
import { translate } from '../../src/scripts/core/i18n.js'
import { escapeHtml, pageUrl } from '../../src/scripts/core/utils.js'
import type { Env } from '../api/_lib/d1'
import type { UserRole } from '../api/_lib/access'

export type ReaderEnv = Env & { ASSETS?: { fetch: (request: Request) => Promise<Response> } }
export type ReaderData = { readerRole?: UserRole }
export type ReaderContext = { request: Request; env: ReaderEnv; data?: ReaderData }

export async function readPublicConfig({ request, env }: ReaderContext) {
  const response = await env.ASSETS?.fetch(new Request(new URL('/src/config/site.json', request.url)))
  if (!response?.ok) throw new Error('public configuration unavailable')
  return resolveSiteConfig(await response.json())
}

export function publicUrl(value: unknown, base: URL) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value, base)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null
  } catch { return null }
}

export function canonicalBase(config: ReturnType<typeof resolveSiteConfig>, url: URL, env: Env) {
  return publicUrl(config.site.baseUrl || env.PUBLIC_BASE_URL, url) || url
}

export function indexingBlocked(config: ReturnType<typeof resolveSiteConfig>, path: string) {
  const rules = config.seo?.disallow
  return config.seo?.indexing === false || Array.isArray(rules) && rules.some(rule => path.startsWith(rule))
}

export const readerHeaders = { 'cache-control': 'private, no-store' }

export function readerRedirect(location: string) {
  return new Response(null, { status: 302, headers: { ...readerHeaders, location } })
}

type PageDocument = {
  slug: string
  title: string
  html: string
  status?: number
  mode?: string
  canonical?: string
  description?: string
  image?: string
}

export async function renderReadDocument(
  { request, env, data }: ReaderContext, config: ReturnType<typeof resolveSiteConfig>,
  settings: Record<string, any>, version: string, page: PageDocument
) {
  const url = new URL(request.url)
  const language = config.site.interfaceLanguage === 'en' ? 'en' : 'pt-BR'
  const t = (key: string, values?: Record<string, string>) => translate(language, key, values)
  const enabled = (key: string, fallback = true) => configuredFeature(config, settings, key, fallback)
  const link = (slug: string, mode = 'read') => pageUrl(slug, mode, config.site.homeSlug)
  const title = page.title ? `${page.title} - ${config.site.name}` : config.site.name
  const status = page.status || 200
  const canonical = page.canonical && status === 200 ? new URL(page.canonical, canonicalBase(config, url, env)).href : ''
  const indexable = Boolean(canonical && !data?.readerRole && !indexingBlocked(config, new URL(canonical).pathname) && env.WIKI_ACCESS_MODE !== 'private' && config.access.mode !== 'private')
  const description = page.description || config.site.description || config.site.tagline
  const image = publicUrl(page.image, url)?.href
  const meta = (name: string, value: unknown, property = false) => value
    ? `<meta ${property ? 'property' : 'name'}="${name}" content="${escapeHtml(value)}">\n`
    : ''
  const metadata = meta('description', description) + (!indexable ? meta('robots', 'noindex, follow') : '') +
    (canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">\n` : '') +
    meta('og:type', page.canonical ? 'article' : 'website', true) + meta('og:title', title, true) +
    meta('og:site_name', config.site.name, true) + meta('og:description', description, true) +
    meta('og:url', canonical, true) + meta('og:image', image, true) +
    meta('og:locale', config.site.language === 'en' ? 'en_US' : 'pt_BR', true) +
    meta('twitter:card', image ? 'summary_large_image' : 'summary')
  const { schemaVersion, site, branding, appearance, features, navigation, seo } = config
  // json lives in a raw-text element
  const state = JSON.stringify({
    config: { schemaVersion, site, branding, appearance, features, navigation, seo, access: { mode: config.access.mode } },
    settings, version, slug: page.slug
  }).replaceAll('<', '\\u003c')
  const path = new URL('/', url)
  const shell = await env.ASSETS?.fetch(new Request(path))
  if (!shell?.ok) throw new Error('public shell unavailable')

  const theme = ['dark', 'oled', 'light'].includes(config.appearance.defaultTheme) ? config.appearance.defaultTheme : 'auto'
  const accent = /^#[0-9a-f]{6}$/i.test(config.appearance.accentColor) ? config.appearance.accentColor : '#3366cc'
  const font = (value: unknown) => typeof value === 'string' && /^[\p{L}\p{N} ,'"_-]+$/u.test(value) ? value : ''
  const fonts = config.appearance.fonts || {}
  const contentFont = ['Georgia, serif', "Georgia, 'Times New Roman', Times, serif"].includes(fonts.content) ? '' : font(fonts.content)
  const style = `--site-accent:${accent};--site-font-interface:${font(fonts.interface) || 'system-ui, sans-serif'};--site-font-mono:${font(fonts.monospace) || 'monospace'}` + (contentFont ? `;--site-font-content:${contentFont}` : '')
  const brandingUrl = (value: unknown) => {
    const asset = publicUrl(value, url)
    if (!asset) return ''
    return asset.origin === url.origin ? asset.pathname + asset.search + asset.hash : asset.href
  }
  const logo = (mobile = false) => brandingUrl((['dark', 'oled'].includes(theme) && config.branding.logoDark) || (mobile && config.branding.logoMobile) || config.branding.logo) || '/src/media/images/core/cat-guard.png'
  const talk = page.slug.startsWith('discussao/')
  const restricted = /^(?:arquivo\/|especial(?:\/|$)|special(?:\/|$))/.test(page.slug)
  const articleSlug = talk ? page.slug.slice('discussao/'.length) : page.slug
  const talkSlug = talk ? page.slug : `discussao/${articleSlug}`
  const history = page.mode === 'history'
  const links = {
    article: [articleSlug, 'read', true, talk ? '' : 'active'],
    talk: [talkSlug, 'read', !restricted && enabled('talkPages'), talk ? 'active' : ''],
    'talk-tool': [talkSlug, 'read', !restricted && enabled('talkPages')],
    read: [page.slug, 'read', true, history ? '' : 'active'],
    edit: [page.slug, 'edit', false],
    'edit-tab': [page.slug, 'edit', false],
    'suggest-tab': [page.slug, 'suggest', !restricted && enabled('publicSuggestions')],
    history: [page.slug, 'history', !restricted && enabled('pageHistory')],
    'history-tab': [page.slug, 'history', !restricted && enabled('pageHistory'), history ? 'active' : '']
  } as const

  const response = new Response(shell.body, {
    status,
    headers: { ...readerHeaders, 'content-type': 'text/html; charset=utf-8', ...(!indexable && { 'x-robots-tag': 'noindex, follow' }) }
  })
  const rewriter = new HTMLRewriter()
    .on('html', { element(element) {
      element.setAttribute('lang', config.site.language === 'en' ? 'en' : 'pt-BR')
      element.setAttribute('class', 'is-ready')
      element.setAttribute('data-theme', theme)
      element.setAttribute('data-theme-choice', theme)
      element.setAttribute('style', style)
    } })
    .on('title', { element: element => { element.setInnerContent(title) } })
    .on('head', { element: element => { element.append(metadata, { html: true }) } })
    .on('body', { element: element => { element.append(`<script id="wiki-initial" type="application/json">${state}</script>`, { html: true }) } })
    .on('#bootScreen', { element: element => { element.remove() } })
    .on('.page-shell', { element: element => { element.removeAttribute('aria-hidden') } })
    .on('#app', { element(element) {
      element.setAttribute('aria-busy', 'false')
      element.setInnerContent(page.html, { html: true })
    } })
    .on('[data-site-name]', { element: element => { element.setInnerContent(config.site.name) } })
    .on('[data-site-tagline]', { element: element => { element.setInnerContent(config.site.tagline) } })
    .on('[data-site-logo]', { element: element => { element.setAttribute('src', logo()) } })
    .on('[data-site-logo-mobile]', { element: element => { element.setAttribute('src', logo(true)) } })
    .on('[data-site-favicon]', { element: element => { element.setAttribute('href', brandingUrl(config.branding.favicon) || logo()) } })
    .on('[data-i18n]', { element: element => { element.setInnerContent(t(element.getAttribute('data-i18n') || '')) } })
    .on('[data-i18n-aria-label]', { element: element => { element.setAttribute('aria-label', t(element.getAttribute('data-i18n-aria-label') || '')) } })
    .on('[data-navigation-section]', { element(element) {
      const section = element.getAttribute('data-navigation-section') || ''
      const items = config.navigation[section]
      if (Array.isArray(items)) element.setInnerContent(items.map(item => navLinkHtml(item, enabled)).join(''), { html: true })
    } })
    .on('[data-chrome-link]', { element(element) {
      const key = element.getAttribute('data-chrome-link') as keyof typeof links
      const attributes = links[key]
      if (!attributes) return
      const [slug, mode, visible, active] = attributes
      element.setAttribute('href', link(slug, mode))
      element.setAttribute('data-slug', slug)
      if (visible) element.removeAttribute('hidden')
      else element.setAttribute('hidden', '')
      const classes = (element.getAttribute('class') || '').split(' ').filter(name => name && name !== 'is-active')
      if (active) classes.push('is-active')
      if (classes.length) element.setAttribute('class', classes.join(' '))
    } })
    .on('[data-edit-guide-link]', { element: element => { element.setAttribute('href', link(config.site.editGuideSlug)) } })
    .on('#searchForm', { element(element) { if (!enabled('search')) element.setAttribute('hidden', '') } })
    .on('#searchInput', { element(element) {
      element.setAttribute('placeholder', t('shell.searchSite', { site: config.site.name }))
      if (page.mode === 'search') element.setAttribute('value', url.searchParams.get('q') || '')
    } })
  return rewriter.transform(response)
}
