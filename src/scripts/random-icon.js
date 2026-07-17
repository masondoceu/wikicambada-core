import { SITE_CONFIG } from './core/config.js'

function assetUrl(value, fallbackIcon) {
  const clean = String(value || '').trim()
  if (!clean) return fallbackIcon
  if (/^(https?:|data:|blob:)/i.test(clean)) return clean
  if (clean.startsWith('/')) return clean
  return `/${clean.replace(/^\.\//, '')}`
}

function pickIndex(length) {
  if (!length) return -1
  if (globalThis.crypto?.getRandomValues) {
    const buffer = new Uint32Array(1)
    globalThis.crypto.getRandomValues(buffer)
    return buffer[0] % length
  }
  return Math.floor(Math.random() * length)
}

async function readManifest(url) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('manifesto indisponível')
  return response.json()
}

function preloadImage(url) {
  return new Promise(resolve => {
    const image = new Image()
    image.onload = () => resolve(url)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function applyIcon(iconUrl) {
  const logos = document.querySelectorAll('[data-random-logo], [data-random-logo-mobile], [data-site-logo], [data-site-logo-mobile]')
  const favicon = document.querySelector('[data-random-favicon], [data-site-favicon]')

  logos.forEach(logo => {
    logo.src = iconUrl
    logo.dataset.currentIcon = iconUrl.split('/').pop() || ''
  })

  if (favicon) favicon.href = iconUrl
}

export async function bootRandomIcon() {
  const fallbackIcon = assetUrl(SITE_CONFIG.branding?.logo, '/src/media/images/wikicambada-logo.png')
  const mobileIcon = assetUrl(SITE_CONFIG.branding?.logoMobile, fallbackIcon)
  let iconUrl = fallbackIcon

  if (SITE_CONFIG.branding?.randomIcons !== false) {
    try {
      const manifestUrl = assetUrl(SITE_CONFIG.branding?.randomIconManifest, '/src/data/wiki-icons.json')
      const manifest = await readManifest(manifestUrl)
      const icons = Array.isArray(manifest.icons) ? manifest.icons : []
      iconUrl = assetUrl(icons[pickIndex(icons.length)] || manifest.fallback || fallbackIcon, fallbackIcon)
    } catch {
      iconUrl = fallbackIcon
    }
  }

  const loadedUrl = await preloadImage(iconUrl)
  applyIcon(loadedUrl || fallbackIcon)
  document.querySelectorAll('[data-site-logo-mobile]').forEach(logo => { logo.src = mobileIcon })
  return loadedUrl || fallbackIcon
}
