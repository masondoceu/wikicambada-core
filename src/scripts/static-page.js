import { SITE_CONFIG, featureEnabled, loadGlobalSettings, loadSiteConfig } from './core/config.js'
import { t } from './core/i18n.js'
import { bootRandomIcon } from './random-icon.js'
import { bootThemeControls } from './theme.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function navLink(item) {
  const rawHref = String(item?.href || '')
  const href = rawHref.startsWith('/') && !rawHref.startsWith('//') || /^https?:\/\//i.test(rawHref) ? rawHref : '#'
  const external = /^https?:\/\//i.test(href)
  const attributes = external ? ' rel="noreferrer"' : ''
  return `<a href="${escapeHtml(href)}"${attributes}>${escapeHtml(item?.label || href)}</a>`
}

function applyStaticNavigation() {
  const navs = [...document.querySelectorAll('.wiki-sidebar .side-nav:not(.settings-nav)')]
  const sections = ['main', 'community', 'external']
  sections.forEach((section, index) => {
    const nav = navs[index]
    if (!nav) return
    const heading = nav.querySelector('h2')?.outerHTML || ''
    const items = (SITE_CONFIG.navigation?.[section] || []).filter(item => !item.feature || featureEnabled(item.feature))
    nav.innerHTML = `${heading}${items.map(navLink).join('')}`
    nav.hidden = !items.length
  })
}

function applyStaticLinks() {
  const aboutSlug = SITE_CONFIG.site.aboutSlug || ''
  const guideSlug = SITE_CONFIG.site.editGuideSlug || ''
  const homeSlug = SITE_CONFIG.site.homeSlug || 'pagina-principal'
  const supportEmail = SITE_CONFIG.site.supportEmail || ''

  document.querySelectorAll('[data-about-link]').forEach(link => {
    if (aboutSlug) link.href = `/wiki/${aboutSlug}`
    else link.hidden = true
  })
  document.querySelectorAll('[data-edit-guide-link]').forEach(link => {
    if (guideSlug) link.href = `/wiki/${guideSlug}`
    else link.hidden = true
  })
  document.querySelectorAll('a[href^="/api/auth/login?return="]').forEach(link => {
    link.href = `/api/auth/login?return=${encodeURIComponent(`/edit/${homeSlug}`)}`
  })
  document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
    if (supportEmail) {
      link.href = `mailto:${supportEmail}`
      if (link.dataset.supportEmail !== undefined) link.textContent = supportEmail
    }
    else link.hidden = true
  })
  document.querySelectorAll('.search-box').forEach(form => { form.hidden = !featureEnabled('search') })
}

export async function bootStaticPage() {
  bootThemeControls()
  await loadSiteConfig()
  await loadGlobalSettings().catch(() => {})
  const titlePrefix = document.querySelector('[data-static-title]')?.textContent?.trim() || document.title.split('—')[0].trim()
  document.title = `${titlePrefix} — ${SITE_CONFIG.site.name || 'WikiCambada Core'}`
  document.querySelectorAll('[data-static-origin]').forEach(element => {
    const tagline = SITE_CONFIG.site.tagline || ''
    element.textContent = tagline ? t('static.origin', { site: SITE_CONFIG.site.name, tagline }) : SITE_CONFIG.site.name
  })
  applyStaticNavigation()
  applyStaticLinks()

  try {
    await bootRandomIcon()
  } catch {}

  document.documentElement.classList.remove('error-booting')
  document.documentElement.classList.add('error-ready')
}
