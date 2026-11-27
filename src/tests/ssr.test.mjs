import test from 'node:test'
import assert from 'node:assert/strict'
import { SITE_CONFIG, APP_VERSION, featureEnabled } from '../scripts/core/config.js'
import { interfaceLanguage, interfaceLocale } from '../scripts/core/i18n.js'
import { pageUrl } from '../scripts/core/utils.js'
import { articleHtml, createWikiRenderer } from '../scripts/renderers/wiki-renderer.js'
import { createWikiRouter } from '../scripts/routes/wiki-router.js'
import { clearPublicCache } from '../scripts/services/wiki-api.js'
import { database, loadFunction } from './helpers.mjs'

test('SSR and CSR produce the same editorial HTML for the same configuration', () => {
  const previous = globalThis.window
  const href = 'https://example.test/wiki/exemplo'
  const runtime = { config: SITE_CONFIG, href, origin: new URL(href).origin, version: APP_VERSION, pageUrl,
    featureEnabled, language: interfaceLanguage, locale: interfaceLocale }
  const page = {
    slug: 'exemplo', title: 'Exemplo', updatedAt: '2025-04-10T12:00:00Z', categories: ['Guias'],
    content: '__TOC__\n\n## Seção\n\n[[Outro#seção|mais]]\n\n{{cartao}}\n\n:::quote\nUma citação\n:::\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```html\n<figure>\n```'
  }
  const context = { templates: [{ slug: 'cartao', title: 'Cartão', renderMarkdown: '**Predefinição**' }] }
  try {
    globalThis.window = { location: { href } }
    const clientHtml = articleHtml(page, context)
    assert.match(clientHtml, /<strong>Predefinição<\/strong>/)
    assert.match(clientHtml, /href="\/wiki\/outro#se%C3%A7%C3%A3o"/)
    assert.match(clientHtml, /&lt;figure&gt;/)
    assert.equal(createWikiRenderer(runtime).articleHtml(page, context), clientHtml)
  } finally { globalThis.window = previous }
})

test('Existing sitemap partitions stay valid when their URLs are excluded from indexing', async () => {
  const DB = await database()
  try {
    DB.sqlite.exec(`
      WITH RECURSIVE fixture(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM fixture WHERE n < 1001)
      INSERT INTO pages (id, slug, title, current_revision_id, created_at, updated_at)
      SELECT 'p' || n, 'excluded-' || n, 'Example ' || n, 'r' || n, '2025-01-01', '2025-01-01' FROM fixture;
      INSERT INTO revisions (id, page_id, revision_number, author_email, content_markdown, created_at)
      SELECT current_revision_id, id, 1, 'fixture@example.test', 'Editorial content', '2025-01-01' FROM pages;
    `)
    const { onRequestGet } = await loadFunction('functions/sitemap.xml.ts')
    const env = { DB, ASSETS: { fetch: () => Response.json({ seo: { disallow: ['/wiki/excluded-'] } }) } }
    const read = suffix => onRequestGet({ request: new Request('https://wiki.example.test/sitemap.xml' + suffix), env })
    assert.match(await (await read('')).text(), /sitemap\.xml\?page=2/)
    const filtered = await read('?page=2')
    assert.equal(filtered.status, 200)
    assert.doesNotMatch(await filtered.text(), /<url>/)
    assert.equal((await read('?page=3')).status, 404)
  } finally { DB.sqlite.close() }
})

test('The SPA keeps the initial article and commits only the latest concurrent navigation', async () => {
  const before = { document: globalThis.document, window: globalThis.window, history: globalThis.history, fetch: globalThis.fetch }
  const requests = []
  const renders = []
  const scrolls = []
  const deferred = Promise.withResolvers()
  const progress = { classList: { add() {}, remove() {} }, style: { setProperty() {} } }
  const app = {
    querySelectorAll: () => [],
    setAttribute() {},
    set innerHTML(value) { renders.push(value) }
  }
  const listeners = []
  try {
    globalThis.document = {
      addEventListener: () => {},
      querySelector: selector => selector === '[data-route-progress]' ? progress : null,
      querySelectorAll: () => [],
      getElementById: id => ({ scrollIntoView() { scrolls.push(id) } })
    }
    globalThis.window = {
      location: new URL('https://example.test/wiki/exemplo#secao'), scrollY: 420,
      addEventListener: name => listeners.push(name), setInterval: () => {},
      scrollTo: options => scrolls.push(options.top)
    }
    globalThis.history = {
      state: null,
      replaceState(state) { this.state = state }
    }
    globalThis.fetch = async path => {
      const route = new URL(path, 'https://example.test').pathname
      requests.push(route)
      if (route === '/api/auth/me') return Response.json({ authenticated: false })
      if (route === '/api/system/status') return Response.json({ ok: true, status: {} })
      if (route === '/api/pages/obsolete') return deferred.promise
      if (route === '/api/pages/latest') return Response.json({ slug: 'latest', title: 'Latest', content: '## Destination' })
      if (route === '/api/pages') return Response.json({ pages: [], total: 2, revisions: 2, nextOffset: null })
      if (route === '/api/categories' || route === '/api/templates') return Response.json([])
      assert.fail('Unexpected request: ' + route)
    }
    const router = createWikiRouter({ app, searchForm: { addEventListener() {} } })
    await router.boot({ slug: 'exemplo' })
    assert.deepEqual(requests, ['/api/auth/me', '/api/system/status'])
    assert.deepEqual(listeners.sort(), ['popstate', 'scroll'])
    assert.ok(history.state.wikiEntry)
    assert.deepEqual(renders, [])
    assert.deepEqual(scrolls, [])

    window.location = new URL('/wiki/obsolete', window.location)
    history.state = { wikiEntry: 'obsolete' }
    const old = router.route({ scrollToTop: true })
    window.location = new URL('/wiki/latest#destination', window.location)
    history.state = { wikiEntry: 'latest' }
    await router.route({ scrollToTop: true })
    deferred.resolve(Response.json({ slug: 'obsolete', title: 'Obsolete', content: 'Old article' }))
    await old
    assert.equal(renders.length, 1)
    assert.match(renders[0], /<h1>Latest<\/h1>/)
    assert.deepEqual(scrolls, ['destination'])
  } finally {
    clearPublicCache()
    Object.assign(globalThis, before)
  }
})
