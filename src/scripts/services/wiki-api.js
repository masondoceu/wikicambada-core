let pageApiHasData = null
const PUBLIC_CACHE_TTL = 30 * 1000
const publicCache = new Map()

function isPublicCacheable(path) {
  return path.startsWith('/api/pages') ||
    path.startsWith('/api/search') ||
    path.startsWith('/api/categories') ||
    path.startsWith('/api/files/') ||
    path.startsWith('/api/system/status') ||
    path.startsWith('/api/templates')
}

export function clearPublicCache() {
  publicCache.clear()
}

function isProtectedAppRoute(returnTo) {
  const url = new URL(returnTo || '/', window.location.origin)
  return url.pathname.startsWith('/edit/') || url.pathname.startsWith('/admin/')
}

function hasKnownAccessSession() {
  try {
    return sessionStorage.getItem('wikicambada-access-known') === '1' ||
      localStorage.getItem('wikicambada-access-known') === '1'
  } catch {
    return false
  }
}

function setKnownAccessSession(value) {
  try {
    if (value) {
      sessionStorage.setItem('wikicambada-access-known', '1')
      localStorage.setItem('wikicambada-access-known', '1')
    } else {
      sessionStorage.removeItem('wikicambada-access-known')
      localStorage.removeItem('wikicambada-access-known')
    }
  } catch {}
}

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text) throw new Error('resposta vazia da api')

  try {
    const value = JSON.parse(text)
    if (value === null) throw new Error('resposta inválida da api')
    return value
  } catch {
    throw new Error('resposta inválida da api')
  }
}

async function fetchApi(path, options) {
  try { return await fetch(path, options) }
  catch (cause) { throw Object.assign(new Error('não foi possível conectar à wiki'), { kind: 'network', cause }) }
}

async function apiGet(path, options = {}) {
  const cacheable = isPublicCacheable(path) && !options.noCache
  const cached = cacheable ? publicCache.get(path) : null
  if (cached && Date.now() - cached.createdAt < PUBLIC_CACHE_TTL) return cached.data

  const response = await fetchApi(path, { headers: { accept: 'application/json', 'x-wiki-request': '1' } })
  if (!response.ok) {
    const data = await readJsonResponse(response).catch(() => null)
    const message = data?.error || `api ${response.status}`
    throw Object.assign(new Error(message), { status: response.status })
  }

  const data = await readJsonResponse(response)
  if (cacheable) publicCache.set(path, { createdAt: Date.now(), data })
  return data
}

async function apiDelete(path) {
  const response = await fetchApi(path, {
    method: 'DELETE',
    headers: { accept: 'application/json', 'x-wiki-request': '1' }
  })

  const data = response.ok ? await readJsonResponse(response) : await readJsonResponse(response).catch(() => null)
  if (!response.ok) {
    const message = data?.error || `api ${response.status}`
    throw Object.assign(new Error(message), { status: response.status })
  }

  return data
}

async function apiPost(path, body) {
  const response = await fetchApi(path, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-wiki-request': '1'
    },
    body: JSON.stringify(body)
  })

  const data = response.ok ? await readJsonResponse(response) : await readJsonResponse(response).catch(() => null)
  if (!response.ok) {
    const message = data?.error || `api ${response.status}`
    throw Object.assign(new Error(message), { status: response.status })
  }

  return data
}

async function apiPostForm(path, body) {
  const response = await fetchApi(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'x-wiki-request': '1' },
    body
  })

  const data = response.ok ? await readJsonResponse(response) : await readJsonResponse(response).catch(() => null)
  if (!response.ok) {
    const message = data?.error || `api ${response.status}`
    throw Object.assign(new Error(message), { status: response.status })
  }

  return data
}

export async function listPages(options = {}) {
  const params = new URLSearchParams()
  if (options.sort) params.set('sort', options.sort)
  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))
  const path = `/api/pages${params.toString() ? `?${params}` : ''}`

  try {
    const pages = await apiGet(path)
    if (Array.isArray(pages)) {
      pageApiHasData = pages.length > 0
      return pages
    }
  } catch (error) {
    pageApiHasData = false
    throw error
  }

  throw new Error('resposta de listagem inválida')
}

export async function getPageList(options = {}) {
  const params = new URLSearchParams({ paged: '1', limit: String(options.limit || 100), offset: String(options.offset || 0), sort: options.sort || 'title' })
  const data = await apiGet(`/api/pages?${params}`)
  if (!Array.isArray(data?.pages) || !Number.isInteger(data.total) || !Object.hasOwn(data, 'nextOffset')) throw new Error('resposta de listagem inválida')
  return data
}

export async function lookupPages(slugs) {
  const found = new Set()
  for (let offset = 0; offset < slugs.length; offset += 30) {
    const params = new URLSearchParams()
    slugs.slice(offset, offset + 30).forEach(slug => params.append('slug', slug))
    for (const slug of await apiGet(`/api/pages/lookup?${params}`)) found.add(slug)
  }
  return found
}

export async function getPage(slug, options = {}) {
  try {
    const page = await apiGet(`/api/pages/${encodeURIComponent(slug)}`, options)
    if (page && typeof page.slug === 'string' && typeof page.content === 'string') {
      pageApiHasData = true
      return page
    }
    throw new Error('resposta de página inválida')
  } catch (error) { if (error.status !== 404) throw error }

  return null
}

export async function getPageFresh(slug) {
  return getPage(slug, { noCache: true })
}


export async function getRandomPage() {
  try {
    const page = await apiGet('/api/pages/random')
    if (typeof page?.slug !== 'string' || typeof page.content !== 'string') throw new Error('resposta de página inválida')
    pageApiHasData = true
    return page
  } catch (error) { if (error.status !== 404) throw error }
  return null
}

export async function searchPages(query) {
  const cleanQuery = String(query || '').trim()
  if (!cleanQuery) return []

  try {
    const results = await apiGet(`/api/search?q=${encodeURIComponent(cleanQuery)}`)
    if (Array.isArray(results)) return results
  } catch (error) { throw error }

  throw new Error('resposta de busca inválida')
}

export async function getSearchPage(query, offset = 0) {
  const data = await apiGet(`/api/search?${new URLSearchParams({ q: query, paged: '1', offset: String(offset) })}`)
  if (!Array.isArray(data?.results) || !Number.isInteger(data.total) || !Object.hasOwn(data, 'nextOffset')) throw new Error('resposta de busca inválida')
  return data
}

export async function listRevisions(slug, offset = 0) {
  const data = await apiGet(`/api/revisions/${encodeURIComponent(slug)}?offset=${offset}`)
  if (!Array.isArray(data?.revisions) || !Number.isInteger(data.total) || !Object.hasOwn(data, 'nextOffset')) throw new Error('resposta de histórico inválida')
  return data
}

export async function getRevision(slug, revisionNumber) {
  try { return await apiGet(`/api/revisions/${encodeURIComponent(slug)}?revision=${encodeURIComponent(revisionNumber)}`) }
  catch (error) { if (error.status !== 404) throw error }
  return null
}

export async function restoreRevision(slug, revisionNumber, summary, expectedRevisionId) {
  if (expectedRevisionId === undefined) throw new Error('revisão-base obrigatória')
  const result = await apiPost(`/api/secure/revisions/${encodeURIComponent(slug)}`, {
    action: 'restore',
    expectedRevisionId,
    revisionNumber,
    summary
  })
  if (!result?.ok || !result?.page?.currentRevisionId) throw new Error('resposta de restauração inválida')
  pageApiHasData = true
  clearPublicCache()
  return result?.page || result
}

export async function savePage(slug, payload) {
  const result = await apiPost(`/api/secure/pages/${encodeURIComponent(slug)}/revisions`, payload)
  if (!result?.ok || !result?.page?.currentRevisionId) throw new Error('resposta de gravação inválida')
  pageApiHasData = true
  clearPublicCache()
  return result?.page || result
}

export async function submitEditProposal(slug, payload) {
  const result = await apiPost(`/api/proposals/${encodeURIComponent(slug)}`, payload)
  if (!result?.ok || !result?.stored) throw new Error('a proposta não foi armazenada')
  return result
}

export async function deletePage(slug) {
  const result = await apiDelete(`/api/secure/pages/${encodeURIComponent(slug)}`)
  clearPublicCache()
  return result
}

export async function getFile(slug) {
  try {
    const file = await apiGet(`/api/files/${encodeURIComponent(slug)}`)
    if (typeof file?.slug !== 'string' || typeof file.mimeType !== 'string') throw new Error('resposta de arquivo inválida')
    return file
  } catch (error) { if (error.status !== 404) throw error }
  return null
}


export async function listFiles(options = {}) {
  const params = new URLSearchParams()
  if (options.search) params.set('q', String(options.search))
  if (options.cursor) params.set('cursor', options.cursor)
  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))
  const suffix = params.toString() ? `?${params}` : ''
  const files = await apiGet(`/api/secure/files${suffix}`)
  if (!Array.isArray(files)) throw new Error('resposta de arquivos inválida')
  return files
}

export async function uploadImage(file, options = {}) {
  const form = new FormData()
  form.set('file', file)
  if (options.caption) form.set('caption', options.caption)
  if (options.description) form.set('description', options.description)
  if (options.align) form.set('align', options.align)
  if (options.width) form.set('width', options.width)
  if (options.slug) form.set('slug', options.slug)

  const result = await apiPostForm('/api/secure/files', form)
  if (!result?.file) throw new Error('resposta de upload inválida')
  return result
}


export async function listCategories() {
  try {
    const categories = await apiGet('/api/categories')
    if (!Array.isArray(categories)) throw new Error('resposta de categorias inválida')
    return categories
  } catch (error) { throw error }
}

export async function getCategory(slug) {
  try {
    const category = await apiGet(`/api/categories/${encodeURIComponent(slug)}`)
    if (typeof category?.slug !== 'string' || typeof category.name !== 'string' || !Array.isArray(category.pages)) throw new Error('resposta de categoria inválida')
    return category
  } catch (error) { if (error.status !== 404) throw error }
  return null
}
export async function listAdminPages(options = {}) {
  return apiGet(`/api/secure/admin/pages?offset=${options.offset || 0}`)
}

export async function adminPageAction(slug, payload) {
  return apiPost(`/api/secure/admin/pages/${encodeURIComponent(slug)}`, payload)
}

export async function getMaintenanceReport() {
  return apiGet('/api/secure/admin/maintenance')
}

export async function importSeedBackup(payload) {
  return apiPost('/api/secure/admin/backup', payload)
}


export async function getCurrentUser(returnTo = '/') {
  const loginUrl = `/api/auth/login?return=${encodeURIComponent(returnTo)}`
  const fallback = {
    authenticated: false,
    canEdit: false,
    email: null,
    name: null,
    access: 'd1-public',
    verified: false,
    loginUrl,
    logoutUrl: `/api/auth/logout?return=${encodeURIComponent(returnTo)}`
  }

  try {
    const publicUser = await apiGet(`/api/auth/me?return=${encodeURIComponent(returnTo)}`)
    if (publicUser?.authenticated) {
      setKnownAccessSession(true)
      return publicUser
    }
  } catch (error) { if (![401, 403].includes(error.status)) throw error }

  const shouldProbeSecureAuth = isProtectedAppRoute(returnTo) || hasKnownAccessSession()
  if (!shouldProbeSecureAuth) return fallback

  try {
    const secureUser = await apiGet(`/api/secure/auth/me?return=${encodeURIComponent(returnTo)}`)
    if (secureUser?.authenticated) {
      setKnownAccessSession(true)
      return secureUser
    }
  } catch (error) {
    if (![401, 403].includes(error.status)) throw error
    setKnownAccessSession(false)
  }

  return fallback
}

export async function listProposals(status = 'pending') {
  return apiGet(`/api/secure/admin/proposals?status=${encodeURIComponent(status)}`)
}

export async function getProposal(id) {
  return apiGet(`/api/secure/admin/proposals/${encodeURIComponent(id)}`)
}

export async function moderateProposal(id, action, options = {}) {
  return apiPost(`/api/secure/admin/proposals/${encodeURIComponent(id)}`, { action, ...options })
}

export async function getAdminUsers() {
  return apiGet('/api/secure/admin/users')
}

export async function updateAdminUser(payload) {
  return apiPost('/api/secure/admin/users', payload)
}

export async function deleteAdminUser(email) {
  return apiPost('/api/secure/admin/users', { action: 'delete', email })
}

export async function updateProfile(payload) {
  return apiPost('/api/secure/profile', payload)
}

export async function getRecentActivity() {
  const data = await apiGet('/api/secure/admin/activity')
  if (!Array.isArray(data?.activity)) throw new Error('resposta de atividade inválida')
  return data.activity
}

export async function getSystemStatus() {
  const data = await apiGet('/api/system/status')
  if (!data?.status) throw new Error('resposta de sistema inválida')
  return data.status
}

export async function forceSystemAction(action) {
  return apiPost('/api/secure/admin/system', { action })
}

export async function getTrash() {
  const data = await apiGet('/api/secure/admin/trash')
  if (!Array.isArray(data?.trash?.pages) || !Array.isArray(data?.trash?.files)) throw new Error('resposta de lixeira inválida')
  return data.trash
}

export async function trashAction(payload) {
  return apiPost('/api/secure/admin/trash', payload)
}

export async function getStorageOverview(options = {}) {
  const params = new URLSearchParams()
  if (options.search) params.set('q', String(options.search))
  if (options.cursor) params.set('cursor', options.cursor)
  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))
  const suffix = params.toString() ? `?${params}` : ''
  return apiGet(`/api/secure/admin/storage${suffix}`)
}

export async function updateStoredFile(slug, payload) {
  return apiPost(`/api/secure/admin/storage/files/${encodeURIComponent(slug)}`, { action: 'update', ...payload })
}

export async function deleteStoredFile(slug) {
  return apiDelete(`/api/secure/admin/storage/files/${encodeURIComponent(slug)}`)
}

export async function listIpRules() {
  const data = await apiGet('/api/secure/admin/ip-rules')
  if (!Array.isArray(data?.rules)) throw new Error('resposta de regras inválida')
  return data.rules
}

export async function createIpRule(payload) {
  return apiPost('/api/secure/admin/ip-rules', payload)
}

export async function deleteIpRule(id) {
  return apiDelete(`/api/secure/admin/ip-rules/${encodeURIComponent(id)}`)
}

export async function clearRecentActivity() {
  return apiPost('/api/secure/admin/activity', { action: 'clear' })
}


export async function getAdvancedRedirects() {
  return apiGet('/api/secure/admin/redirects')
}

export async function saveAdvancedRedirect(payload) {
  const result = await apiPost('/api/secure/admin/redirects', { action: 'save_redirect', ...payload })
  clearPublicCache()
  return result
}

export async function deleteAdvancedRedirect(fromSlug) {
  const result = await apiPost('/api/secure/admin/redirects', { action: 'delete_redirect', fromSlug })
  clearPublicCache()
  return result
}

export async function saveAdvancedAlias(payload) {
  const result = await apiPost('/api/secure/admin/redirects', { action: 'save_alias', ...payload })
  clearPublicCache()
  return result
}

export async function deleteAdvancedAlias(aliasSlug) {
  const result = await apiPost('/api/secure/admin/redirects', { action: 'delete_alias', aliasSlug })
  clearPublicCache()
  return result
}


export async function listTemplates(options = {}) {
  const useSecure = Boolean(options.secure)
  const path = useSecure ? '/api/secure/templates' : '/api/templates'
  const data = await apiGet(path)
  if (!Array.isArray(data)) throw new Error('resposta de templates inválida')
  return data
}

export async function listAdminTemplates() {
  const data = await apiGet('/api/secure/admin/templates')
  if (!Array.isArray(data?.templates)) throw new Error('resposta de templates inválida')
  return data.templates
}

export async function saveAdminTemplate(payload) {
  const result = await apiPost('/api/secure/admin/templates', { action: 'save', ...payload })
  clearPublicCache()
  return result?.template || result
}

export async function deleteAdminTemplate(id) {
  const result = await apiPost('/api/secure/admin/templates', { action: 'delete', id })
  clearPublicCache()
  return result
}

export async function getAdminGlobalSettings() {
  const data = await apiGet('/api/secure/admin/settings', { noCache: true })
  if (!data?.settings || typeof data.settings !== 'object') throw new Error('resposta de configurações inválida')
  return data.settings
}

export async function saveAdminGlobalSettings(settings) {
  const data = await apiPost('/api/secure/admin/settings', { settings })
  clearPublicCache()
  if (!data?.settings || typeof data.settings !== 'object') throw new Error('resposta de configurações inválida')
  return data.settings
}
