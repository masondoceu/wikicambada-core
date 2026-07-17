import { SITE_CONFIG, featureEnabled, loadGlobalSettings, loadSiteConfig } from './core/config.js'
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
  const href = String(item?.href || '#')
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

function replaceSiteText() {
  const replacements = [
    ['A enciclopédia livre dos web-refugiados', SITE_CONFIG.site.tagline || ''],
    ['WikiCambada', SITE_CONFIG.site.name || 'WikiCambada Core'],
    ['suportewiki@cambada.party', SITE_CONFIG.site.supportEmail || '']
  ]
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  nodes.forEach(node => {
    if (node.parentElement?.closest('script, style')) return
    let text = node.nodeValue || ''
    replacements.forEach(([from, to]) => { text = text.replaceAll(from, to) })
    node.nodeValue = text
  })
}

function applyStaticLinks() {
  const aboutSlug = SITE_CONFIG.site.aboutSlug || ''
  const guideSlug = SITE_CONFIG.site.editGuideSlug || ''
  const homeSlug = SITE_CONFIG.site.homeSlug || 'pagina-principal'
  const supportEmail = SITE_CONFIG.site.supportEmail || ''

  document.querySelectorAll('a[href="/wiki/sobre-a-wikicambada"]').forEach(link => {
    if (aboutSlug) link.href = `/wiki/${aboutSlug}`
    else link.hidden = true
  })
  document.querySelectorAll('a[href="/wiki/como-editar"]').forEach(link => {
    if (guideSlug) link.href = `/wiki/${guideSlug}`
    else link.hidden = true
  })
  document.querySelectorAll('a[href^="/api/auth/login?return="]').forEach(link => {
    link.href = `/api/auth/login?return=${encodeURIComponent(`/edit/${homeSlug}`)}`
  })
  document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
    if (supportEmail) link.href = `mailto:${supportEmail}`
    else link.hidden = true
  })
  document.querySelectorAll('.search-box').forEach(form => { form.hidden = !featureEnabled('search') })
}

export async function bootStaticPage() {
  bootThemeControls()
  await loadSiteConfig()
  await loadGlobalSettings()
  const titlePrefix = document.title.split('—')[0].trim()
  document.title = `${titlePrefix} — ${SITE_CONFIG.site.name || 'WikiCambada Core'}`
  replaceSiteText()
  applyStaticNavigation()
  applyStaticLinks()

  try {
    await bootRandomIcon()
  } catch {}

  document.documentElement.classList.remove('error-booting')
  document.documentElement.classList.add('error-ready')
}
