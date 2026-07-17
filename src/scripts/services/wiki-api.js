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

function clearPublicCache() {
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
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    throw new Error('resposta inválida da api')
  }
}

async function apiGet(path, options = {}) {
  const cacheable = isPublicCacheable(path) && !options.noCache
  const cached = cacheable ? publicCache.get(path) : null
  if (cached && Date.now() - cached.createdAt < PUBLIC_CACHE_TTL) return cached.data

  const response = await fetch(path, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    const data = await readJsonResponse(response).catch(() => null)
    const message = data?.error || `api ${response.status}`
    throw new Error(message)
  }

  const data = await readJsonResponse(response)
  if (cacheable) publicCache.set(path, { createdAt: Date.now(), data })
  return data
}

async function apiDelete(path) {
  const response = await fetch(path, {
    method: 'DELETE',
    headers: { accept: 'application/json' }
  })

  const data = await readJsonResponse(response)
  if (!response.ok) {
    const message = data?.error || `api ${response.status}`
    throw new Error(message)
  }

  return data
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const data = await readJsonResponse(response)
  if (!response.ok) {
    const message = data?.error || `api ${response.status}`
    throw new Error(message)
  }

  return data
}

async function apiPostForm(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { accept: 'application/json' },
    body
  })

  const data = await readJsonResponse(response)
  if (!response.ok) {
    const message = data?.error || `api ${response.status}`
    throw new Error(message)
  }

  return data
}

export async function listPages(options = {}) {
  const params = new URLSearchParams()
  if (options.sort) params.set('sort', options.sort)
  if (options.limit) params.set('limit', String(options.limit))
  const path = `/api/pages${params.toString() ? `?${params}` : ''}`

  try {
    const pages = await apiGet(path)
    if (Array.isArray(pages)) {
      pageApiHasData = pages.length > 0
      return pages
    }
  } catch {
    pageApiHasData = false
  }

  return []
}

export async function getPage(slug, options = {}) {
  try {
    const page = await apiGet(`/api/pages/${encodeURIComponent(slug)}`, options)
    if (page) {
      pageApiHasData = true
      return page
    }
  } catch {}

  return null
}

export async function getPageFresh(slug) {
  return getPage(slug, { noCache: true })
}


export async function getRandomPage() {
  const page = await apiGet('/api/pages/random')
  if (page) {
    pageApiHasData = true
    return page
  }

  return null
}

export async function searchPages(query) {
  const cleanQuery = String(query || '').trim()
  if (!cleanQuery) return []

  try {
    const results = await apiGet(`/api/search?q=${encodeURIComponent(cleanQuery)}`)
    if (Array.isArray(results)) return results
  } catch {}

  return []
}

export async function listRevisions(slug) {
  return apiGet(`/api/revisions/${encodeURIComponent(slug)}`)
}

export async function getRevision(slug, revisionNumber) {
  return apiGet(`/api/revisions/${encodeURIComponent(slug)}?revision=${encodeURIComponent(revisionNumber)}`)
}

export async function restoreRevision(slug, revisionNumber, summary) {
  const result = await apiPost(`/api/secure/revisions/${encodeURIComponent(slug)}`, {
    action: 'restore',
    revisionNumber,
    summary
  })
  pageApiHasData = true
  clearPublicCache()
  return result?.page || result
}

export async function savePage(slug, payload) {
  const result = await apiPost(`/api/secure/pages/${encodeURIComponent(slug)}/revisions`, payload)
  pageApiHasData = true
  clearPublicCache()
  return result?.page || result
}

export async function submitEditProposal(slug, payload) {
  return apiPost(`/api/proposals/${encodeURIComponent(slug)}`, payload)
}

export async function deletePage(slug) {
  const result = await apiDelete(`/api/secure/pages/${encodeURIComponent(slug)}`)
  clearPublicCache()
  return result
}

export async function getFile(slug) {
  return apiGet(`/api/files/${encodeURIComponent(slug)}`)
}


export async function listFiles(options = {}) {
  const params = new URLSearchParams()
  if (options.search) params.set('q', String(options.search))
  if (options.limit) params.set('limit', String(options.limit))
  const suffix = params.toString() ? `?${params}` : ''
  const files = await apiGet(`/api/secure/files${suffix}`)
  return Array.isArray(files) ? files : []
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
    return Array.isArray(categories) ? categories : []
  } catch {
    return []
  }
}

export async function getCategory(slug) {
  return apiGet(`/api/categories/${encodeURIComponent(slug)}`)
}
export async function listAdminPages() {
  return apiGet('/api/secure/admin/pages')
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
  } catch {}

  const shouldProbeSecureAuth = isProtectedAppRoute(returnTo) || hasKnownAccessSession()
  if (!shouldProbeSecureAuth) return fallback

  try {
    const secureUser = await apiGet(`/api/secure/auth/me?return=${encodeURIComponent(returnTo)}`)
    if (secureUser?.authenticated) {
      setKnownAccessSession(true)
      return secureUser
    }
  } catch {
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
  return Array.isArray(data?.activity) ? data.activity : []
}

export async function getSystemStatus() {
  const data = await apiGet('/api/system/status')
  return data?.status || null
}

export async function forceSystemAction(action) {
  return apiPost('/api/secure/admin/system', { action })
}

export async function getTrash() {
  const data = await apiGet('/api/secure/admin/trash')
  return data?.trash || { pages: [], files: [] }
}

export async function trashAction(payload) {
  return apiPost('/api/secure/admin/trash', payload)
}

export async function getStorageOverview(options = {}) {
  const params = new URLSearchParams()
  if (options.search) params.set('q', String(options.search))
  if (options.limit) params.set('limit', String(options.limit))
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
  return Array.isArray(data?.rules) ? data.rules : []
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
  return Array.isArray(data) ? data : []
}

export async function listAdminTemplates() {
  const data = await apiGet('/api/secure/admin/templates')
  return Array.isArray(data?.templates) ? data.templates : []
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
  return data?.settings || {}
}

export async function saveAdminGlobalSettings(settings) {
  const data = await apiPost('/api/secure/admin/settings', { settings })
  clearPublicCache()
  return data?.settings || settings
}
