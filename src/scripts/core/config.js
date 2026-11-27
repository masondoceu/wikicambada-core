import { applyTranslations, setInterfaceLanguage, t } from './i18n.js'

export const DEFAULT_SITE_CONFIG = {
  schemaVersion: 1,
  site: {
    name: 'WikiCambada Core',
    shortName: 'WikiCambada Core',
    tagline: 'Uma wiki serverless',
    description: 'Wiki executada pelo WikiCambada Core',
    language: 'pt-BR',
    interfaceLanguage: 'pt-BR',
    homeSlug: 'pagina-principal',
    baseUrl: '',
    supportEmail: '',
    aboutSlug: 'sobre',
    editGuideSlug: 'como-editar',
    defaultCategory: ''
  },
  branding: {
    logo: '/src/media/images/core/cat-guard.png',
    logoMobile: '/src/media/images/core/cat-guard.png',
    favicon: '/src/media/images/core/cat-guard.png',
    poweredByBadge: '/src/media/images/poweredby-wikicambada-core.png',
    randomIconManifest: '',
    randomIcons: false
  },
  appearance: {
    accentColor: '#3366cc',
    defaultTheme: 'auto',
    fonts: {
      interface: 'system-ui, sans-serif',
      content: 'Georgia, serif',
      monospace: 'ui-monospace, monospace'
    }
  },
  features: {
    search: true,
    talkPages: true,
    userPages: true,
    publicSuggestions: true,
    pageHistory: true,
    mediaUploads: true,
    templates: true,
    categories: true,
    randomPage: true,
    coreBadge: true,
    cloudflareBadge: true,
    builtWithCloudflareBadge: false,
    activityLogging: true,
    specialPages: {
      index: true,
      version: true,
      recentPages: true,
      allPages: true,
      categories: true,
      randomPage: true
    }
  },
  navigation: { main: [], community: [], external: [] },
  access: { mode: 'cloudflare-access', superAdminEmail: '', strict: true },
  cloudflare: { projectName: 'wiki', databaseName: '', bucketName: '' }
}

export let SITE_CONFIG = structuredClone(DEFAULT_SITE_CONFIG)
export let HOME_SLUG = SITE_CONFIG.site.homeSlug
export let SLOGAN = SITE_CONFIG.site.tagline
export let SITE_NAME = SITE_CONFIG.site.name
export let APP_VERSION = 'v1.1.1-indev.2'
export let DEFAULT_RANDOM_SLUGS = [HOME_SLUG]
export let GLOBAL_SETTINGS = structuredClone(DEFAULT_SITE_CONFIG.features)

function mergeObject(base, override) {
  const result = { ...base }
  for (const [key, value] of Object.entries(override || {})) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
    if (value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = mergeObject(result[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

function readFeaturePath(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source)
}

export function configuredFeature(config, settings, path, fallback = true) {
  const globalValue = readFeaturePath(settings, path)
  if (typeof globalValue === 'boolean') return globalValue
  const configValue = readFeaturePath(config.features, path)
  return typeof configValue === 'boolean' ? configValue : fallback
}

export function featureEnabled(path, fallback = true) {
  return configuredFeature(SITE_CONFIG, GLOBAL_SETTINGS, path, fallback)
}

export function resolveSiteConfig(config) {
  return mergeObject(DEFAULT_SITE_CONFIG, config)
}

export function navLinkHtml(item, enabled = featureEnabled) {
  const rawHref = String(item?.href || '')
  const href = !/[\\\u0000-\u0020]/.test(rawHref) && (rawHref.startsWith('/') && !rawHref.startsWith('//') || /^https?:\/\//i.test(rawHref)) ? rawHref : '#'
  const label = String(item?.label || href)
  const feature = String(item?.feature || '')
  if (feature && !enabled(feature)) return ''
  const external = /^https?:\/\//i.test(href)
  const kind = String(item?.kind || (external ? 'external' : 'route'))
  const attributes = external
    ? ' rel="noreferrer"'
    : kind === 'home'
      ? ' data-link="home"'
      : kind === 'random'
        ? ' data-link="random"'
        : ' data-link="route"'
  return `<a href="${href.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"${attributes}>${label.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</a>`
}

function applyNavigation() {
  for (const section of ['main', 'community', 'external']) {
    const target = document.querySelector(`[data-navigation-section="${section}"]`)
    if (!target) continue
    target.innerHTML = (SITE_CONFIG.navigation?.[section] || []).map(item => navLinkHtml(item)).join('')
  }
}

export function siteLogo(mobile = false, randomIcon = '') {
  if (['dark', 'oled'].includes(document.documentElement.dataset.theme) && SITE_CONFIG.branding.logoDark) return SITE_CONFIG.branding.logoDark
  if (SITE_CONFIG.branding.randomIcons && randomIcon) return randomIcon
  return (mobile ? SITE_CONFIG.branding.logoMobile : '') || SITE_CONFIG.branding.logo
}

export function applySiteConfigToDocument(preserveTitle = false) {
  const root = document.documentElement
  setInterfaceLanguage(SITE_CONFIG.site.interfaceLanguage || 'pt-BR')
  root.lang = SITE_CONFIG.site.language || root.lang
  root.style.setProperty('--site-accent', SITE_CONFIG.appearance?.accentColor || '#3366cc')
  root.style.setProperty('--site-font-interface', SITE_CONFIG.appearance?.fonts?.interface || 'system-ui, sans-serif')
  const contentFont = SITE_CONFIG.appearance?.fonts?.content
  // older configurations stored the heading font as the body font
  if (!contentFont || contentFont === 'Georgia, serif' || contentFont === "Georgia, 'Times New Roman', Times, serif") {
    root.style.removeProperty('--site-font-content')
  } else {
    root.style.setProperty('--site-font-content', contentFont)
  }
  root.style.setProperty('--site-font-mono', SITE_CONFIG.appearance?.fonts?.monospace || 'ui-monospace, monospace')

  document.querySelectorAll('[data-site-name]').forEach(element => { element.textContent = SITE_CONFIG.site.name })
  document.querySelectorAll('[data-site-short-name]').forEach(element => { element.textContent = SITE_CONFIG.site.shortName || SITE_CONFIG.site.name })
  document.querySelectorAll('[data-site-tagline]').forEach(element => { element.textContent = SITE_CONFIG.site.tagline || '' })
  document.querySelectorAll('[data-site-logo]').forEach(element => { element.src = siteLogo(false, element.dataset.currentIconUrl) })
  document.querySelectorAll('[data-site-logo-mobile]').forEach(element => { element.src = siteLogo(true, element.dataset.currentIconUrl) })
  const favicon = document.querySelector('[data-site-favicon]')
  if (favicon) favicon.href = SITE_CONFIG.branding.favicon || SITE_CONFIG.branding.logo

  applyTranslations(document)

  const searchInput = document.querySelector('#searchInput')
  if (searchInput) searchInput.placeholder = t('shell.searchSite', { site: SITE_CONFIG.site.name })
  const searchLabel = document.querySelector('label[for="searchInput"]')
  if (searchLabel) searchLabel.textContent = t('shell.searchSite', { site: SITE_CONFIG.site.name })

  const editGuideSlug = SITE_CONFIG.site.editGuideSlug || DEFAULT_SITE_CONFIG.site.editGuideSlug
  document.querySelectorAll('[data-edit-guide-link]').forEach(link => {
    link.href = `/wiki/${encodeURIComponent(editGuideSlug)}`
    link.dataset.slug = editGuideSlug
  })

  applyNavigation()
  if (!preserveTitle) document.title = SITE_CONFIG.site.name
}

export async function loadSiteConfig(initial) {
  if (initial) {
    SITE_CONFIG = resolveSiteConfig(initial.config)
    APP_VERSION = initial.version || APP_VERSION
  } else {
    const [configResult, releaseResult] = await Promise.allSettled([
      fetch('/src/config/site.json', { cache: 'no-store' }),
      fetch('/wikicambada-release.json', { cache: 'no-store' })
    ])
    try {
      if (configResult.status === 'fulfilled' && configResult.value.ok) {
        SITE_CONFIG = resolveSiteConfig(await configResult.value.json())
      }
    } catch {}
    try {
      if (releaseResult.status === 'fulfilled' && releaseResult.value.ok) {
        const release = await releaseResult.value.json()
        APP_VERSION = String(release?.displayVersion || APP_VERSION)
      }
    } catch {}
  }

  HOME_SLUG = SITE_CONFIG.site.homeSlug || DEFAULT_SITE_CONFIG.site.homeSlug
  SLOGAN = SITE_CONFIG.site.tagline || ''
  SITE_NAME = SITE_CONFIG.site.name || 'WikiCambada Core'
  const fallbackSlugs = SITE_CONFIG.site.randomFallbackSlugs
  const configuredSlugs = Array.isArray(fallbackSlugs) ? fallbackSlugs.filter(slug => typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug)) : []
  DEFAULT_RANDOM_SLUGS = configuredSlugs.length ? configuredSlugs : [HOME_SLUG]
  GLOBAL_SETTINGS = mergeObject(SITE_CONFIG.features, initial?.settings)
  applySiteConfigToDocument(Boolean(initial))
  return SITE_CONFIG
}

export async function loadGlobalSettings() {
  const response = await fetch('/api/settings', { headers: { accept: 'application/json', 'x-wiki-language': SITE_CONFIG.site.interfaceLanguage }, cache: 'no-store' })
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
  const data = await response.json()
  if (!data?.settings || typeof data.settings !== 'object') throw new Error('Invalid settings API response')
  GLOBAL_SETTINGS = mergeObject(SITE_CONFIG.features || {}, data.settings)
  applySiteConfigToDocument()
  return GLOBAL_SETTINGS
}
