import { HOME_SLUG } from './config.js'

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function normalizeSlug(value) {
  return normalizeKey(value).replace(/[^a-z0-9.\/ -]/g, '').replace(/\s+/g, '-')
}

export function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pagina-sem-nome'
}

export function titleFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Página sem nome'
}

export function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(new Date(value))
  } catch {
    return value
  }
}

function decodePathPart(part) {
  let current = String(part || '')

  for (let index = 0; index < 4; index += 1) {
    try {
      const next = decodeURIComponent(current)
      if (next === current) break
      current = next
    } catch {
      break
    }
  }

  return current
}

function encodeSlugPath(slug) {
  return String(slug || HOME_SLUG)
    .split('/')
    .filter(Boolean)
    .map(part => encodeURIComponent(decodePathPart(part)))
    .join('/')
}

export function pageUrl(slug, mode = 'read') {
  const cleanSlug = slug || HOME_SLUG
  const encoded = encodeSlugPath(cleanSlug)
  if (cleanSlug === HOME_SLUG && mode === 'read') return '/'
  if (mode === 'edit') return `/edit/${encoded}`
  if (mode === 'history') return `/history/${encoded}`
  if (mode === 'suggest') return `/suggest/${encoded}`
  if (mode === 'talk') return `/talk/${encodeSlugPath(articleSlugFromTalk(cleanSlug))}`
  if (mode === 'read' && cleanSlug.startsWith('usuario/')) return `/usuario/${encodeSlugPath(cleanSlug.slice('usuario/'.length))}`
  if (mode === 'read' && cleanSlug.startsWith('discussao/')) return `/talk/${encodeSlugPath(cleanSlug.slice('discussao/'.length))}`
  return `/wiki/${encoded}`
}

export function userPageSlug(value) {
  const clean = String(value || '').replace(/^Usu[aá]rio\s*:/i, '').replace(/^usuario\//i, '')
  return `usuario/${slugify(clean)}`
}

export function talkPageSlug(value) {
  const clean = String(value || '').replace(/^Discuss[aã]o\s*:/i, '').replace(/^Talk\s*:/i, '').replace(/^discussao\//i, '')
  return `discussao/${slugify(clean)}`
}

export function articleSlugFromTalk(slug) {
  return String(slug || '').startsWith('discussao/') ? String(slug).slice('discussao/'.length) : String(slug || HOME_SLUG)
}

export function searchUrl(query = '') {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  return `/search${params.toString() ? `?${params}` : ''}`
}

export function applyTemplateVars(value, context) {
  return String(value || '').replace(/\{([a-zA-Z0-9_]+)}/g, (_, key) => context[key] ?? `{${key}}`)
}

export function parseRoute() {
  const params = new URLSearchParams(window.location.search)
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const parts = path.split('/').filter(Boolean).map(part => decodePathPart(part))

  if (path === '/search') {
    return { mode: 'search', slug: HOME_SLUG, query: params.get('q') || '' }
  }

  if (parts[0] === 'wiki') {
    return { mode: 'read', slug: parts.slice(1).join('/') || HOME_SLUG, query: null }
  }

  if (parts[0] === 'usuario') {
    return { mode: 'read', slug: `usuario/${parts.slice(1).join('/') || 'usuario-sem-nome'}`, query: null }
  }

  if (parts[0] === 'talk' || parts[0] === 'discussao') {
    return { mode: 'read', slug: `discussao/${parts.slice(1).join('/') || HOME_SLUG}`, query: null }
  }

  if (parts[0] === 'edit') {
    return { mode: 'edit', slug: parts.slice(1).join('/') || HOME_SLUG, query: null }
  }

  if (parts[0] === 'history') {
    return { mode: 'history', slug: parts.slice(1).join('/') || HOME_SLUG, query: null }
  }

  if (parts[0] === 'suggest') {
    return { mode: 'suggest', slug: parts.slice(1).join('/') || HOME_SLUG, query: null }
  }

  if (parts[0] === 'admin') {
    const section = parts[1] || ''
    if (section === 'proposals') return { mode: 'admin-proposals', slug: HOME_SLUG, query: params.get('id') || '' }
    if (section === 'templates') return { mode: 'admin-templates', slug: HOME_SLUG, query: null }
    if (section === 'pages' || section === 'paginas') return { mode: 'admin-pages', slug: HOME_SLUG, query: null }
    if (section === 'maintenance' || section === 'manutencao') return { mode: 'admin-maintenance', slug: HOME_SLUG, query: null }
    if (section === 'redirects' || section === 'redirecionamentos' || section === 'aliases') return { mode: 'admin-redirects', slug: HOME_SLUG, query: null }
    if (section === 'backup' || section === 'seed') return { mode: 'admin-backup', slug: HOME_SLUG, query: null }
    if (section === 'storage' || section === 'armazenamento') return { mode: 'admin-storage', slug: HOME_SLUG, query: params.get('q') || '' }
    if (section === 'trash' || section === 'lixeira') return { mode: 'admin-trash', slug: HOME_SLUG, query: null }
    if (section === 'users' || section === 'usuarios') return { mode: 'admin-users', slug: HOME_SLUG, query: null }
    if (section === 'activity' || section === 'atividade') return { mode: 'admin-activity', slug: HOME_SLUG, query: null }
    if (section === 'system' || section === 'sistema') return { mode: 'admin-system', slug: HOME_SLUG, query: null }
    if (section === 'settings' || section === 'configuracoes' || section === 'configurações') return { mode: 'admin-settings', slug: HOME_SLUG, query: null }
    if (section === 'ip' || section === 'ips') return { mode: 'admin-ip', slug: HOME_SLUG, query: null }
    return { mode: 'admin-dashboard', slug: HOME_SLUG, query: null }
  }

  if (params.get('q')) {
    return { mode: 'search', slug: HOME_SLUG, query: params.get('q') || '' }
  }

  return {
    mode: params.get('mode') || 'read',
    slug: params.get('page') || HOME_SLUG,
    query: null
  }
}

export function parseRouteParams() {
  return new URLSearchParams(window.location.search)
}

export function isCurrentAppUrl(url) {
  const parsed = new URL(url, window.location.href)
  const here = new URL(window.location.href)
  return parsed.origin === here.origin
}
