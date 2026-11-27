export type UserRole = 'editor' | 'moderator' | 'admin' | 'super_admin'

export type AccessUser = {
  authenticated: boolean
  canEdit: boolean
  email: string | null
  name: string | null
  displayName?: string | null
  role?: UserRole | null
  status?: 'active' | 'disabled' | 'unavailable' | null
  access: 'cloudflare-access' | 'development' | 'missing' | 'invalid'
  verified: boolean
}

export type AccessEnv = {
  DB?: D1Database
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  ACCESS_STRICT?: string
  WIKI_DEV_AUTH?: string
  DEV_BYPASS_AUTH?: string
  WIKI_LOCAL_AUTH_SECRET?: string
  WIKI_SUPER_ADMIN_EMAIL?: string
}

type JwtParts = {
  header: Record<string, any>
  payload: Record<string, any>
  signature: Uint8Array
  signedData: Uint8Array
}

type JwksCache = {
  url: string
  fetchedAt: number
  expiresAt: number
  keys: JsonWebKey[]
}

let jwksCache: JwksCache | null = null

const DEFAULT_SUPER_ADMIN_EMAIL = ''

function superAdminEmail(env: AccessEnv) {
  return String(env.WIKI_SUPER_ADMIN_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase()
}
const textEncoder = new TextEncoder()
const roleOrder: Record<UserRole, number> = {
  editor: 10,
  moderator: 20,
  admin: 30,
  super_admin: 40
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeRole(value: string | null | undefined): UserRole {
  if (value === 'super_admin') return 'super_admin'
  if (value === 'admin') return 'admin'
  if (value === 'moderator') return 'moderator'
  return 'editor'
}

export function roleAtLeast(user: AccessUser | null | undefined, minimum: UserRole) {
  if (!user?.authenticated || !user.canEdit || !user.email || user.status !== 'active') return false
  const role = normalizeRole(user.role || 'editor')
  return roleOrder[role] >= roleOrder[minimum]
}

export function canManageRole(actor: AccessUser, targetRole: UserRole) {
  const actorRole = normalizeRole(actor.role || 'editor')
  if (targetRole === 'super_admin') return false
  if (actorRole === 'super_admin') return true
  if (actorRole === 'admin') return ['editor', 'moderator', 'admin'].includes(targetRole)
  return false
}

export function displayNameForUser(user: AccessUser) {
  return String(user.displayName || user.name || user.email || '').trim()
}

function normalizeBase64Url(value: string) {
  return value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
}

function base64UrlToBytes(value: string) {
  const binary = atob(normalizeBase64Url(value))
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function base64UrlToJson(value: string) {
  const bytes = base64UrlToBytes(value)
  const text = new TextDecoder().decode(bytes)
  return JSON.parse(text)
}

function parseJwt(token: string): JwtParts | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    return {
      header: base64UrlToJson(parts[0]),
      payload: base64UrlToJson(parts[1]),
      signature: base64UrlToBytes(parts[2]),
      signedData: textEncoder.encode(`${parts[0]}.${parts[1]}`)
    }
  } catch {
    return null
  }
}

function cleanTeamDomain(value: string | undefined) {
  try {
    const url = new URL(String(value || '').trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    return url.origin
  } catch {
    return null
  }
}

function hasExpectedAudience(payload: Record<string, any>, expectedAudience: string) {
  const aud = payload.aud
  if (Array.isArray(aud)) return aud.includes(expectedAudience)
  return aud === expectedAudience
}

async function fetchJwks(teamDomain: string, refresh = false) {
  const url = `${teamDomain}/cdn-cgi/access/certs`
  const now = Date.now()

  if (jwksCache && jwksCache.url === url && jwksCache.expiresAt > now && (!refresh || now - jwksCache.fetchedAt < 30000)) {
    return jwksCache.keys
  }

  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('JWKS unavailable')

  const data = await response.json() as { keys?: JsonWebKey[] }
  const keys = Array.isArray(data.keys) ? data.keys : []
  jwksCache = {
    url,
    keys,
    fetchedAt: now,
    expiresAt: now + 1000 * 60 * 30
  }

  return keys
}

async function verifyJwt(token: string, env: AccessEnv) {
  const teamDomain = cleanTeamDomain(env.ACCESS_TEAM_DOMAIN)
  const audience = String(env.ACCESS_AUD || '').trim()
  if (!teamDomain || !audience) return null

  const parsed = parseJwt(token)
  if (!parsed || parsed.header.alg !== 'RS256' || typeof parsed.header.kid !== 'string' || parsed.header.crit !== undefined || parsed.header.b64 === false) return null

  const keys = await fetchJwks(teamDomain)
  const jwk = keys.find(key => (key as any).kid === parsed.header.kid) ||
    (await fetchJwks(teamDomain, true)).find(key => (key as any).kid === parsed.header.kid)
  if (!jwk) return null

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    parsed.signature,
    parsed.signedData
  )

  if (!valid) return null

  const now = Math.floor(Date.now() / 1000)
  if (parsed.payload.iss !== teamDomain) return null
  if (!hasExpectedAudience(parsed.payload, audience)) return null
  if (!Number.isFinite(parsed.payload.exp) || parsed.payload.exp <= now) return null
  if (parsed.payload.nbf !== undefined && (!Number.isFinite(parsed.payload.nbf) || parsed.payload.nbf > now)) return null
  if (parsed.payload.iat !== undefined && (!Number.isFinite(parsed.payload.iat) || parsed.payload.iat > now + 30 || parsed.payload.iat >= parsed.payload.exp)) return null

  return parsed.payload
}

function baseUserFromPayload(payload: Record<string, any> | null, verified: boolean, env: AccessEnv): AccessUser | null {
  if (!payload) return null

  const email = payload.email
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null

  return {
    authenticated: true,
    canEdit: true,
    email: normalizeEmail(email),
    name: payload.name || payload.given_name || null,
    displayName: payload.name || payload.given_name || null,
    role: normalizeEmail(email) === superAdminEmail(env) ? 'super_admin' : 'editor',
    status: 'active',
    access: 'cloudflare-access',
    verified
  }
}

function missingUser(access: AccessUser['access'] = 'missing'): AccessUser {
  return {
    authenticated: false,
    canEdit: false,
    email: null,
    name: null,
    displayName: null,
    role: null,
    status: null,
    access,
    verified: false
  }
}

async function columnNames(db: D1Database, table: string) {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all()
  return new Set((rows.results || []).map((row: any) => String(row.name || '')))
}

async function hydrateProfile(user: AccessUser, env: AccessEnv): Promise<AccessUser> {
  if (!user.authenticated || !user.email) return user
  if (!env.DB) return { ...user, canEdit: false, role: null, status: 'unavailable' }

  const email = normalizeEmail(user.email)
  const now = new Date().toISOString()
  const desiredRole: UserRole = email === superAdminEmail(env) ? 'super_admin' : 'editor'

  try {
    const columns = await columnNames(env.DB, 'editor_profiles')
    const hasStatus = columns.has('status')
    if (!hasStatus) return { ...user, canEdit: false, role: null, status: 'unavailable' }
    let existing: any = await env.DB.prepare('SELECT * FROM editor_profiles WHERE email = ?').bind(email).first()

    if (!existing) {
      await env.DB.prepare(`
        INSERT INTO editor_profiles (id, email, display_name, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?) ON CONFLICT(email) DO NOTHING
      `).bind(crypto.randomUUID(), email, user.name || null, desiredRole, now, now).run()
      existing = await env.DB.prepare('SELECT * FROM editor_profiles WHERE email = ?').bind(email).first()
      if (!existing) return { ...user, email, role: null, status: 'unavailable', canEdit: false }
    }

    const role = email === superAdminEmail(env) ? 'super_admin' : normalizeRole(existing.role || 'editor')
    const status = String(existing.status || 'unavailable')
    if (!['active', 'disabled'].includes(status) || (email !== superAdminEmail(env) && !Object.hasOwn(roleOrder, existing.role))) return { ...user, email, role: null, status: 'unavailable', canEdit: false }
    const displayName = existing.display_name || user.name || null

    if (email === superAdminEmail(env) && existing.role !== 'super_admin' && status === 'active') {
      const result = await env.DB.prepare('UPDATE editor_profiles SET role = ?, updated_at = ? WHERE email = ? AND status = ?')
        .bind('super_admin', now, email, 'active')
        .run()
      if (result.meta.changes !== 1) return { ...user, email, role: null, status: 'unavailable', canEdit: false }
    }

    return {
      ...user,
      email,
      name: user.name,
      displayName,
      role,
      status: status === 'active' ? 'active' : 'disabled',
      canEdit: status === 'active'
    }
  } catch {
    return { ...user, email, role: null, status: 'unavailable', canEdit: false }
  }
}

function cleanCookieValue(raw: string) {
  const value = raw.trim().replace(/^"|"$/g, '')
  if (!value) return null

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function accessCookieToken(cookieHeader: string | null) {
  if (!cookieHeader) return null

  let fallback: string | null = null
  const pieces = cookieHeader.split(';')
  for (const piece of pieces) {
    const index = piece.indexOf('=')
    if (index === -1) continue

    const key = piece.slice(0, index).trim()
    const value = cleanCookieValue(piece.slice(index + 1))
    if (!value) continue
    if (key === 'CF_Authorization') return value
    if (!fallback && key.startsWith('CF_Authorization')) fallback = value
  }

  return fallback
}

function accessTokenFromRequest(request: Request) {
  const headerToken = request.headers.get('cf-access-jwt-assertion')
  if (headerToken) return headerToken

  return accessCookieToken(request.headers.get('cookie'))
}

export async function readAccessIdentity(request: Request, env: AccessEnv) {
  const local = await localDevelopmentIdentity(request, env)
  if (local) return { authenticated: true, verified: false, development: true, email: local.email, name: local.name }
  const token = accessTokenFromRequest(request)
  const payload = token ? await verifyJwt(token, env).catch(() => null) : null
  const user = baseUserFromPayload(payload, true, env)
  return { authenticated: Boolean(user), verified: Boolean(user), development: false, email: user?.email || null, name: user?.name || null }
}

async function localDevelopmentIdentity(request: Request, env: AccessEnv) {
  const url = new URL(request.url), proof = request.headers.get('x-wiki-local-auth') || ''
  if (env.DEV_BYPASS_AUTH !== 'true' || !/^[a-f0-9]{64}$/.test(env.WIKI_LOCAL_AUTH_SECRET || '') || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null
  const [timestamp, signature] = proof.split('.')
  if (!/^\d{13}$/.test(timestamp || '') || !/^[a-f0-9]{64}$/.test(signature || '') || Math.abs(Date.now() - Number(timestamp)) > 10000) return null
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WIKI_LOCAL_AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = Uint8Array.from(signature.match(/../g)!, value => parseInt(value, 16))
  if (!await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${timestamp}\n${request.method}\n${url.pathname}${url.search}`))) return null
  return { email: 'local-admin@wikicambada.invalid', name: 'Local admin' }
}

export async function readAccessUser(request: Request, env: AccessEnv = {}): Promise<AccessUser> {
  const local = await localDevelopmentIdentity(request, env)
  if (local) return hydrateProfile({ authenticated: true, canEdit: true, email: local.email, name: local.name, role: 'super_admin', status: 'active', access: 'development', verified: false }, { ...env, WIKI_SUPER_ADMIN_EMAIL: local.email })
  const token = accessTokenFromRequest(request)
  const emailHeader = request.headers.get('cf-access-authenticated-user-email')

  if (!token && !emailHeader) return missingUser()

  if (token && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const verifiedPayload = await verifyJwt(token, env).catch(() => null)
    const verifiedUser = baseUserFromPayload(verifiedPayload, true, env)
    if (verifiedUser) return hydrateProfile(verifiedUser, env)
    return missingUser('invalid')
  }

  const hostname = new URL(request.url).hostname
  const development = env.WIKI_DEV_AUTH === 'true' && env.ACCESS_STRICT === 'false' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  if (!development) return missingUser('invalid')
  const payload = token ? parseJwt(token)?.payload || null : null
  const email = emailHeader || payload?.email || payload?.common_name || null

  if (!email) return missingUser('invalid')

  return hydrateProfile({
    authenticated: true,
    canEdit: true,
    email: normalizeEmail(email),
    name: payload?.name || payload?.given_name || null,
    displayName: payload?.name || payload?.given_name || null,
    role: normalizeEmail(email) === superAdminEmail(env) ? 'super_admin' : 'editor',
    status: 'active',
    access: 'development',
    verified: false
  }, env)
}

export async function requireAccessUser(request: Request, env: AccessEnv = {}): Promise<(AccessUser & { email: string, canEdit: true, status: 'active' }) | null> {
  const user = await readAccessUser(request, env)
  const strict = env.ACCESS_STRICT !== 'false'

  if (!user.authenticated || !user.email) return null
  if (strict && !user.verified && user.access !== 'development') return null
  if (user.status === 'unavailable') throw Object.assign(new Error('Storage temporarily unavailable'), { status: 503 })
  if (!user.canEdit || user.status !== 'active') throw Object.assign(new Error('Account disabled'), { status: 403 })

  return { ...user, email: user.email, canEdit: true, status: 'active' }
}

export async function requireRole(request: Request, env: AccessEnv = {}, minimum: UserRole = 'editor') {
  const user = await requireAccessUser(request, env)
  if (!user) return null
  if (!roleAtLeast(user, minimum)) throw Object.assign(new Error('Insufficient permissions'), { status: 403 })
  return user
}
