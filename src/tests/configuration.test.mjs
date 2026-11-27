import test from 'node:test'
import assert from 'node:assert/strict'
import { SITE_CONFIG, GLOBAL_SETTINGS, applySiteConfigToDocument } from '../scripts/core/config.js'
import { diagnosticDetail, setInterfaceLanguage } from '../scripts/core/i18n.js'
import { adminSettingsHtml, fatalErrorHtml, footerHtml, historyHtml, searchHtml, versionPageHtml } from '../scripts/renderers/wiki-renderer.js'

test('The version page shows the product and version without implementation details', () => {
  const html = versionPageHtml()
  assert.match(html, /WikiCambada Core/)
  assert.match(html, /1\.1\.1-indev\.2/)
  assert.doesNotMatch(html, /MediaWiki|Parsoid|Especial:Version|cache|Cache|recarregar|\/wiki\/especial\/versao/)
})

test('The browser presents an English diagnostic in the selected interface language', () => {
  const before = globalThis.document
  const error = new Error('Invalid write response')
  try {
    globalThis.document = { documentElement: {} }
    setInterfaceLanguage('en')
    assert.equal(diagnosticDetail(error), 'Invalid write response')
    setInterfaceLanguage('pt-BR')
    assert.equal(diagnosticDetail(error), 'resposta de gravação inválida')
    assert.equal(error.message, 'Invalid write response')
  } finally { globalThis.document = before }
})

test('The Cloudflare badge honors configuration and legacy defaults independently of the Core badge', () => {
  const features = { ...SITE_CONFIG.features }
  const globals = { ...GLOBAL_SETTINGS }
  try {
    const page = { slug: 'alpha', updatedAt: '2026-10-17' }
    delete SITE_CONFIG.features.cloudflareBadge
    delete GLOBAL_SETTINGS.cloudflareBadge
    const legacy = footerHtml(page)
    assert.ok(legacy.indexOf('protectedby-cloudflare.png') < legacy.indexOf('poweredby-wikicambada-core.png'))
    assert.match(legacy, /alt="Protected by Cloudflare"/)
    assert.doesNotMatch(legacy, /built-with-cloudflare/)
    SITE_CONFIG.features.cloudflareBadge = false
    GLOBAL_SETTINGS.cloudflareBadge = false
    const disabled = footerHtml(page)
    assert.doesNotMatch(disabled, /protectedby-cloudflare|footer-cloudflare/)
    assert.match(disabled, /Powered by WikiCambada Core/)
    GLOBAL_SETTINGS.cloudflareBadge = true
    GLOBAL_SETTINGS.coreBadge = false
    const onlyCloudflare = footerHtml(page)
    assert.match(onlyCloudflare, /protectedby-cloudflare/)
    assert.doesNotMatch(onlyCloudflare, /poweredby-wikicambada-core/)
    GLOBAL_SETTINGS.cloudflareBadge = false
    assert.doesNotMatch(footerHtml(page), /footer-poweredby-list/)
  } finally {
    delete SITE_CONFIG.features.cloudflareBadge
    delete GLOBAL_SETTINGS.cloudflareBadge
    Object.assign(SITE_CONFIG.features, features)
    Object.assign(GLOBAL_SETTINGS, globals)
  }
})

test('Cloudflare badges are independent and accessible and use safe external links', () => {
  const features = { ...SITE_CONFIG.features }, globals = { ...GLOBAL_SETTINGS }
  try {
    const page = { slug: 'alpha' }
    for (const protectedBadge of [false, true]) for (const builtBadge of [false, true]) {
      Object.assign(GLOBAL_SETTINGS, { cloudflareBadge: protectedBadge, builtWithCloudflareBadge: builtBadge, coreBadge: true })
      const html = footerHtml(page)
      assert.equal(html.includes('protectedby-cloudflare.png'), protectedBadge)
      assert.equal(html.includes('built-with-cloudflare.svg'), builtBadge)
      assert.match(html, /alt="Powered by WikiCambada Core"/)
      const links = [...html.matchAll(/<a class="footer-cloudflare-link"[^>]*><img[^>]*><\/a>/g)].map(match => match[0])
      assert.equal(links.length, Number(protectedBadge) + Number(builtBadge))
      for (const link of links) {
        assert.match(link, /href="https:\/\/www.cloudflare.com\/" target="_blank" rel="noopener noreferrer"/)
        assert.match(link, /alt="(?:Protected by|Built with) Cloudflare"/)
        assert.ok(html.indexOf(link) < html.indexOf('class="footer-poweredby-badge"'))
      }
      if (protectedBadge && builtBadge) assert.ok(html.indexOf('protectedby-cloudflare.png') < html.indexOf('built-with-cloudflare.svg'))
    }
    delete GLOBAL_SETTINGS.builtWithCloudflareBadge
    delete SITE_CONFIG.features.builtWithCloudflareBadge
    assert.doesNotMatch(footerHtml(page), /built-with-cloudflare/)
    Object.assign(GLOBAL_SETTINGS, { cloudflareBadge: false, builtWithCloudflareBadge: false, coreBadge: false })
    assert.doesNotMatch(footerHtml(page), /footer-poweredby-list|footer-cloudflare-item/)
  } finally {
    delete SITE_CONFIG.features.builtWithCloudflareBadge
    delete GLOBAL_SETTINGS.builtWithCloudflareBadge
    Object.assign(SITE_CONFIG.features, features); Object.assign(GLOBAL_SETTINGS, globals)
  }
})

test('History and administration use the configured interface language without translating content', () => {
  const previous = globalThis.document
  globalThis.document = { documentElement: {} }
  try {
    setInterfaceLanguage('en')
    const page = { title: 'Artigo em português', slug: 'alpha', currentRevisionId: 'r1' }
    const history = historyHtml(page, { revisions: [{ id: 'r1', revisionNumber: 1, summary: 'resumo editorial', createdAt: '2026-01-01' }] }, { canEdit: true })
    assert.match(history, /History of/)
    assert.match(history, /Artigo em português/)
    assert.match(history, /resumo editorial/)
    assert.doesNotMatch(history, /Histórico de/)
    const settings = adminSettingsHtml({})
    assert.match(settings, /Global settings/)
    assert.match(settings, /Public history/)
    assert.doesNotMatch(settings, /Páginas de discussão|Histórico público|Categorias em artigos/)
    assert.doesNotMatch(searchHtml('missing', [], { authenticated: true, canEdit: false }), /\/edit\//)
    const search = searchHtml('alpha', [{ ...page, exact: true, matchType: 'redirecionamento' }])
    assert.match(search, /exact match by redirect/)
    assert.match(search, /Artigo em português/)
    assert.match(fatalErrorHtml({ status: 401 }), /Sign-in required/)
    assert.match(fatalErrorHtml({ status: 403 }), /Content unavailable/)
    assert.match(fatalErrorHtml({ status: 503 }), /Service temporarily unavailable/)
    assert.match(fatalErrorHtml({ kind: 'network' }), /Connection failed/)
  } finally { setInterfaceLanguage('pt-BR'); globalThis.document = previous }
})

test('The initial theme, dark logo and saved preference have the expected precedence', async () => {
  const previous = { document: globalThis.document, window: globalThis.window, localStorage: globalThis.localStorage, Image: globalThis.Image }
  const themeBefore = SITE_CONFIG.appearance.defaultTheme
  const brandingBefore = { ...SITE_CONFIG.branding }
  const logo = { dataset: {} }
  const mobile = { dataset: {} }
  const storage = new Map()
  globalThis.localStorage = { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key), removeItem: key => storage.delete(key) }
  globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null, querySelectorAll: selector => selector.startsWith('[data-random-logo],') ? [logo, mobile] : selector.includes('data-site-logo-mobile') ? [mobile] : selector.includes('data-site-logo') ? [logo] : [] }
  globalThis.Image = class { set src(value) { queueMicrotask(() => this.onload()) } }
  globalThis.window = { matchMedia: () => ({ matches: false }) }
  try {
    SITE_CONFIG.appearance.defaultTheme = 'dark'
    SITE_CONFIG.branding.logo = '/logo.png'
    SITE_CONFIG.branding.logoDark = '/logo-dark.png'
    SITE_CONFIG.branding.logoMobile = '/logo-mobile.png'
    const theme = await import('../scripts/theme.js')
    theme.applyTheme()
    assert.equal(document.documentElement.dataset.theme, 'dark')
    assert.equal(logo.src, '/logo-dark.png')
    assert.equal(mobile.src, '/logo-dark.png')
    const { bootRandomIcon } = await import('../scripts/random-icon.js')
    await bootRandomIcon()
    assert.equal(logo.src, '/logo-dark.png')
    assert.equal(mobile.src, '/logo-dark.png')
    storage.set('wikicambada.theme', 'light')
    theme.applyTheme()
    assert.equal(document.documentElement.dataset.theme, 'light')
    assert.equal(logo.src, '/logo.png')
    assert.equal(mobile.src, '/logo-mobile.png')
  } finally { SITE_CONFIG.appearance.defaultTheme = themeBefore; Object.assign(SITE_CONFIG.branding, brandingBefore); delete SITE_CONFIG.branding.logoDark; Object.assign(globalThis, previous) }
})

test('Preset fonts control the body by default and preserve custom font families', () => {
  const previous = globalThis.document, previousFonts = SITE_CONFIG.appearance.fonts
  const properties = new Map()
  globalThis.document = {
    documentElement: { style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) } },
    querySelectorAll: () => [], querySelector: () => null
  }
  try {
    SITE_CONFIG.appearance.fonts = { ...previousFonts, content: 'Verdana, sans-serif', monospace: 'Consolas, monospace' }
    applySiteConfigToDocument()
    assert.equal(properties.get('--site-font-content'), 'Verdana, sans-serif')
    for (const content of ['Georgia, serif', "Georgia, 'Times New Roman', Times, serif"]) {
      SITE_CONFIG.appearance.fonts.content = content
      applySiteConfigToDocument()
      assert.equal(properties.has('--site-font-content'), false)
      assert.equal(properties.get('--site-font-mono'), 'Consolas, monospace')
    }
  } finally { SITE_CONFIG.appearance.fonts = previousFonts; globalThis.document = previous }
})
