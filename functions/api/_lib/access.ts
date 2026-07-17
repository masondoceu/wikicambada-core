export type UserRole = 'editor' | 'moderator' | 'admin' | 'super_admin'

export type AccessUser = {
  authenticated: boolean
  canEdit: boolean
  email: string | null
  name: string | null
  displayName?: string | null
  role?: UserRole | null
  status?: 'active' | 'disabled' | null
  access: 'cloudflare-access' | 'missing' | 'invalid'
  verified: boolean
}

export type AccessEnv = {
  DB?: D1Database
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  ACCESS_STRICT?: string
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
  if (!user?.authenticated || !user.email || user.status === 'disabled') return false
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
  const domain = String(value || '').trim().replace(/\/+$/, '')
  return domain || null
}

function hasExpectedAudience(payload: Record<string, any>, expectedAudience: string) {
  const aud = payload.aud
  if (Array.isArray(aud)) return aud.includes(expectedAudience)
  return aud === expectedAudience
}

async function fetchJwks(teamDomain: string) {
  const url = `${teamDomain}/cdn-cgi/access/certs`
  const now = Date.now()

  if (jwksCache && jwksCache.url === url && jwksCache.expiresAt > now) {
    return jwksCache.keys
  }

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error('jwks indisponível')

  const data = await response.json() as { keys?: JsonWebKey[] }
  const keys = Array.isArray(data.keys) ? data.keys : []
  jwksCache = {
    url,
    keys,
    expiresAt: now + 1000 * 60 * 30
  }

  return keys
}

async function verifyJwt(token: string, env: AccessEnv) {
  const teamDomain = cleanTeamDomain(env.ACCESS_TEAM_DOMAIN)
  const audience = String(env.ACCESS_AUD || '').trim()
  if (!teamDomain || !audience) return null

  const parsed = parseJwt(token)
  if (!parsed) return null

  const keys = await fetchJwks(teamDomain)
  const jwk = keys.find(key => (key as any).kid === parsed.header.kid)
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
  if (typeof parsed.payload.exp === 'number' && parsed.payload.exp <= now) return null
  if (typeof parsed.payload.nbf === 'number' && parsed.payload.nbf > now) return null

  return parsed.payload
}

function baseUserFromPayload(payload: Record<string, any> | null, verified: boolean, env: AccessEnv): AccessUser | null {
  if (!payload) return null

  const email = payload.email || payload.common_name || null
  if (!email) return null

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
  if (!user.authenticated || !user.email || !env.DB) return user

  const email = normalizeEmail(user.email)
  const now = new Date().toISOString()
  const desiredRole: UserRole = email === superAdminEmail(env) ? 'super_admin' : 'editor'

  try {
    const columns = await columnNames(env.DB, 'editor_profiles')
    const hasStatus = columns.has('status')
    const hasSeen = columns.has('last_seen_at') && columns.has('last_seen_ip') && columns.has('last_seen_path') && columns.has('last_seen_user_agent')
    const existing: any = await env.DB.prepare('SELECT * FROM editor_profiles WHERE email = ?').bind(email).first()

    if (!existing) {
      if (hasStatus) {
        await env.DB.prepare(`
          INSERT INTO editor_profiles (id, email, display_name, role, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', ?, ?)
        `).bind(crypto.randomUUID(), email, user.name || null, desiredRole, now, now).run()
      } else {
        await env.DB.prepare(`
          INSERT INTO editor_profiles (id, email, display_name, role, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(crypto.randomUUID(), email, user.name || null, desiredRole, now, now).run()
      }

      return { ...user, email, displayName: user.name || null, role: desiredRole, status: 'active', canEdit: true }
    }

    const role = email === superAdminEmail(env) ? 'super_admin' : normalizeRole(existing.role || 'editor')
    const status = hasStatus ? String(existing.status || 'active') : 'active'
    const displayName = existing.display_name || user.name || null

    if (email === superAdminEmail(env) && existing.role !== 'super_admin') {
      await env.DB.prepare('UPDATE editor_profiles SET role = ?, status = ?, updated_at = ? WHERE email = ?')
        .bind('super_admin', 'active', now, email)
        .run()
    } else if (hasSeen) {
      await env.DB.prepare('UPDATE editor_profiles SET updated_at = ? WHERE email = ?').bind(now, email).run()
    }

    return {
      ...user,
      email,
      name: user.name,
      displayName,
      role,
      status: status === 'disabled' ? 'disabled' : 'active',
      canEdit: status !== 'disabled'
    }
  } catch {
    return { ...user, email, role: desiredRole, status: 'active', canEdit: true }
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

export async function readAccessUser(request: Request, env: AccessEnv = {}): Promise<AccessUser> {
  const token = accessTokenFromRequest(request)
  const emailHeader = request.headers.get('cf-access-authenticated-user-email')

  if (!token && !emailHeader) return missingUser()

  if (token && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const verifiedPayload = await verifyJwt(token, env).catch(() => null)
    const verifiedUser = baseUserFromPayload(verifiedPayload, true, env)
    if (verifiedUser) return hydrateProfile(verifiedUser, env)
    return missingUser('invalid')
  }

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
    access: 'cloudflare-access',
    verified: false
  }, env)
}

export async function requireAccessUser(request: Request, env: AccessEnv = {}) {
  const user = await readAccessUser(request, env)
  const strict = String(env.ACCESS_STRICT || '').toLowerCase() === 'true'

  if (!user.authenticated || !user.email) return null
  if (strict && !user.verified) return null
  if (user.status === 'disabled') return null

  return user
}

export async function requireRole(request: Request, env: AccessEnv = {}, minimum: UserRole = 'editor') {
  const user = await requireAccessUser(request, env)
  if (!user) return null
  if (!roleAtLeast(user, minimum)) return null
  return user
}
