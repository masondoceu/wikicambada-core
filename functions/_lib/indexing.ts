import { getGlobalSettings, indexableSlugCount, listIndexableSlugs } from '../api/_lib/d1'
import { escapeHtml, pageUrl } from '../../src/scripts/core/utils.js'
import { canonicalBase, indexingBlocked, readPublicConfig, readerHeaders, type ReaderContext } from './read-document'

export async function serveRobots(context: ReaderContext) {
  const headers = { ...readerHeaders, 'content-type': 'text/plain; charset=utf-8' }
  try {
    const config = await readPublicConfig(context)
    if (context.env.WIKI_ACCESS_MODE === 'private' || config.access.mode === 'private' || indexingBlocked(config, '/')) {
      return new Response('User-agent: *\nDisallow: /\n', { headers })
    }
    const base = canonicalBase(config, new URL(context.request.url), context.env)
    const paths = new Set(['/api/', '/admin', '/edit/', '/suggest/', '/history/', '/search', ...(config.seo?.disallow || [])])
    return new Response(`User-agent: *\n${[...paths].map(path => 'Disallow: ' + path).join('\n')}\nSitemap: ${new URL('/sitemap.xml', base).href}\n`, { headers })
  } catch { return new Response('User-agent: *\nDisallow: /\n', { headers, status: 503 }) }
}

export async function serveSitemap(context: ReaderContext) {
  try {
    const { request, env } = context
    const url = new URL(request.url)
    const config = await readPublicConfig(context)
    if (env.WIKI_ACCESS_MODE === 'private' || config.access.mode === 'private' || indexingBlocked(config, '/')) return new Response(null, { status: 404, headers: readerHeaders })
    const base = canonicalBase(config, url, env)
    const settings = await getGlobalSettings(env)
    const size = 1000
    const cursor = url.searchParams.get('page')
    const number = Number(cursor || 1)
    if (!Number.isSafeInteger(number) || number < 1 || number > 50000) return new Response(null, { status: 404, headers: readerHeaders })
    const total = cursor === null ? await indexableSlugCount(env, settings) : 0
    const index = total > size
    const slugs = index ? [] : await listIndexableSlugs(env, settings, (number - 1) * size, size)
    if (cursor !== null && !slugs.length) return new Response(null, { status: 404, headers: readerHeaders })
    const absolute = (path: string) => escapeHtml(new URL(path, base).href)
    const children = index
      ? Array.from({ length: Math.min(50000, Math.ceil(total / size)) }, (_, n) => `<sitemap><loc>${absolute('/sitemap.xml?page=' + (n + 1))}</loc></sitemap>`)
      : slugs
        .map(slug => pageUrl(slug, 'read', config.site.homeSlug)).filter(path => !indexingBlocked(config, path))
        .map(path => `<url><loc>${absolute(path)}</loc></url>`)
    const root = index ? 'sitemapindex' : 'urlset'
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${children.join('')}</${root}>\n`, {
      headers: { ...readerHeaders, 'content-type': 'application/xml; charset=utf-8' }
    })
  } catch { return new Response(null, { status: 503, headers: readerHeaders }) }
}
