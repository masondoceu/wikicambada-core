export type Env = {
  DB?: D1Database
  WIKI_BUCKET?: R2Bucket
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  ACCESS_STRICT?: string
  WIKI_DEV_AUTH?: string
  DEV_BYPASS_AUTH?: string
  WIKI_LOCAL_AUTH_SECRET?: string
  WIKI_INITIAL_CONTENT?: string
  WIKI_ACCESS_MODE?: string
  DISCORD_EDIT_WEBHOOK_URL?: string
  PUBLIC_BASE_URL?: string
  WIKI_CORE_VERSION?: string
  WIKI_SITE_NAME?: string
  WIKI_SUPER_ADMIN_EMAIL?: string
  WIKI_FEATURES_JSON?: string
}

export type RedirectRuleInput = {
  fromSlug?: string
  fragment?: string
}

export class EditorialError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export type PageInput = {
  expectedRevisionId?: string | null
  sourceSlug?: string
  title: string
  subtitle?: string
  content: string
  categories?: string[]
  aliases?: string[]
  redirects?: string[]
  redirectRules?: RedirectRuleInput[]
  summary?: string
}

type PageListOptions = {
  offset?: number
  sort?: 'title' | 'recent'
  limit?: number
  includeDeleted?: boolean
}

type RevisionMetadataColumns = {
  title: boolean
  subtitle: boolean
  categoriesJson: boolean
}

type OptionalTables = {
  pageAliases: boolean
}

type RedirectMetadataColumns = {
  targetFragment: boolean
}

type UploadMetadataColumns = {
  fileSlug: boolean
  description: boolean
  updatedAt: boolean
  status: boolean
  deletedAt: boolean
  deletedByEmail: boolean
  purgeAfter: boolean
}

export type UploadInput = {
  r2Key: string
  filename: string
  mimeType: string
  sizeBytes: number
  sha256?: string
  uploadedByEmail?: string
  description?: string
  preferredSlug?: string
}

let revisionMetadataColumnsCache: RevisionMetadataColumns | null = null
let optionalTablesCache: OptionalTables | null = null
let redirectMetadataColumnsCache: RedirectMetadataColumns | null = null
let uploadMetadataColumnsCache: UploadMetadataColumns | null = null

type ActivityEventColumns = {
  ipCountry: boolean
  ipRegion: boolean
  ipCity: boolean
  ipTimezone: boolean
  ipColo: boolean
}

let activityEventColumnsCache: ActivityEventColumns | null = null

export function hasDb(env: Env) {
  return Boolean(env.DB)
}

function safeDecodeComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function decodeSlugPath(value: string, rounds = 4) {
  let current = String(value || '')

  for (let index = 0; index < rounds; index += 1) {
    const next = current
      .split('/')
      .map(part => safeDecodeComponent(part))
      .join('/')

    if (next === current) break
    current = next
  }

  return current
}

function encodeSlugPath(value: string) {
  return String(value || '')
    .split('/')
    .filter(Boolean)
    .map(part => encodeURIComponent(part).toLowerCase())
    .join('/')
}

export function normalizeSlug(value: string[] | string | undefined) {
  const raw = Array.isArray(value) ? value.join('/') : value
  return String(raw || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase()
}

export function decodedSlug(value: string) {
  return decodeSlugPath(value).trim().replace(/^\/+|\/+$/g, '').toLowerCase()
}

export function slugFromTitle(value: string) {
  return decodedSlug(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.\/]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isReservedFilePageSlug(slug: string) {
  return slug === 'arquivo' || slug.startsWith('arquivo/')
}

function uniqueSlugCandidates(values: string[]) {
  const seen = new Set<string>()
  const candidates: string[] = []

  for (const value of values) {
    const clean = normalizeSlug(value)
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    candidates.push(clean)
  }

  return candidates
}

function slugLookupCandidates(value: string, options: { preferCanonical?: boolean } = {}) {
  const raw = normalizeSlug(value)
  const decodedOnce = decodeSlugPath(raw, 1).trim().toLowerCase()
  const decodedFull = decodedSlug(raw)
  const canonical = slugFromTitle(raw)
  const encodedDecoded = encodeSlugPath(decodedFull)
  const encodedOnce = encodeSlugPath(decodedOnce)
  const encodedRaw = encodeSlugPath(raw)

  const legacy = uniqueSlugCandidates([
    raw,
    decodedOnce,
    decodedFull,
    encodedDecoded,
    encodedOnce,
    encodedRaw,
    encodeSlugPath(encodedDecoded),
    encodeSlugPath(encodedOnce)
  ])

  if (!canonical) return legacy
  if (options.preferCanonical) return uniqueSlugCandidates([canonical, ...legacy])
  return uniqueSlugCandidates([...legacy, canonical])
}

function cleanList(values: unknown) {
  if (!Array.isArray(values)) return []

  return Array.from(new Set(
    values
      .map(value => String(value || '').trim())
      .filter(Boolean)
  ))
}

function cleanSlugList(values: unknown, canonicalSlug = '') {
  return cleanList(values)
    .map(value => slugFromTitle(value))
    .filter(value => value && value !== canonicalSlug)
}

function parseJsonArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map(item => String(item || '').trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

async function getOptionalTables(env: Env): Promise<OptionalTables> {
  if (optionalTablesCache) return optionalTablesCache
  if (!env.DB) return { pageAliases: false }

  const rows = await env.DB.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name IN ('page_aliases')
  `).all()

  const names = new Set((rows.results || []).map((row: any) => String(row.name || '')))
  optionalTablesCache = { pageAliases: names.has('page_aliases') }
  return optionalTablesCache
}

async function getRedirectMetadataColumns(env: Env): Promise<RedirectMetadataColumns> {
  if (redirectMetadataColumnsCache) return redirectMetadataColumnsCache
  if (!env.DB) return { targetFragment: false }

  const rows = await env.DB.prepare('PRAGMA table_info(redirects)').all()
  const names = new Set((rows.results || []).map((row: any) => String(row.name || '')))
  redirectMetadataColumnsCache = { targetFragment: names.has('target_fragment') }
  return redirectMetadataColumnsCache
}

function cleanRedirectFragment(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/^#+/, '')
    .slice(0, 180)
}

async function getRevisionMetadataColumns(env: Env): Promise<RevisionMetadataColumns> {
  if (revisionMetadataColumnsCache) return revisionMetadataColumnsCache

  const rows = await env.DB!.prepare('PRAGMA table_info(revisions)').all()
  const names = new Set((rows.results || []).map((row: any) => String(row.name || '')))

  revisionMetadataColumnsCache = {
    title: names.has('title'),
    subtitle: names.has('subtitle'),
    categoriesJson: names.has('categories_json')
  }

  return revisionMetadataColumnsCache
}

function hasFullRevisionMetadata(columns: RevisionMetadataColumns) {
  return columns.title && columns.subtitle && columns.categoriesJson
}


async function getUploadMetadataColumns(env: Env): Promise<UploadMetadataColumns> {
  if (uploadMetadataColumnsCache) return uploadMetadataColumnsCache

  const rows = await env.DB!.prepare('PRAGMA table_info(uploads)').all()
  const names = new Set((rows.results || []).map((row: any) => String(row.name || '')))

  uploadMetadataColumnsCache = {
    fileSlug: names.has('file_slug'),
    description: names.has('description'),
    updatedAt: names.has('updated_at'),
    status: names.has('status'),
    deletedAt: names.has('deleted_at'),
    deletedByEmail: names.has('deleted_by_email'),
    purgeAfter: names.has('purge_after')
  }

  return uploadMetadataColumnsCache
}

async function getActivityEventColumns(env: Env): Promise<ActivityEventColumns> {
  if (activityEventColumnsCache) return activityEventColumnsCache
  if (!env.DB || !(await tableExists(env, 'activity_events'))) {
    activityEventColumnsCache = { ipCountry: false, ipRegion: false, ipCity: false, ipTimezone: false, ipColo: false }
    return activityEventColumnsCache
  }

  const rows = await env.DB.prepare('PRAGMA table_info(activity_events)').all()
  const names = new Set((rows.results || []).map((row: any) => String(row.name || '')))

  activityEventColumnsCache = {
    ipCountry: names.has('ip_country'),
    ipRegion: names.has('ip_region'),
    ipCity: names.has('ip_city'),
    ipTimezone: names.has('ip_timezone'),
    ipColo: names.has('ip_colo')
  }

  return activityEventColumnsCache
}

function requestIpLocation(request: Request) {
  const cf = (request as any).cf || {}
  const clean = (value: unknown, limit = 80) => String(value || '').trim().slice(0, limit)
  return {
    country: clean(cf.country, 8),
    region: clean(cf.region || cf.regionCode),
    city: clean(cf.city),
    timezone: clean(cf.timezone),
    colo: clean(cf.colo, 16)
  }
}

function fileBaseFromName(filename: string) {
  const clean = String(filename || 'arquivo').replace(/\.[^.]+$/, '')
  return slugFromTitle(clean) || 'arquivo'
}

function uploadRowToFile(row: any) {
  if (!row) return null

  const slug = row.file_slug || row.id
  return {
    id: row.id,
    slug,
    r2Key: row.r2_key,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    sha256: row.sha256 || '',
    uploadedByEmail: row.uploaded_by_email || '',
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    status: row.status || 'published',
    deletedAt: row.deleted_at || null,
    deletedByEmail: row.deleted_by_email || null,
    purgeAfter: row.purge_after || null,
    contentUrl: `/api/files/${encodeURIComponent(slug)}/content`,
    pageUrl: `/wiki/arquivo/${slug}`
  }
}

async function fileSlugExists(env: Env, slug: string) {
  const columns = await getUploadMetadataColumns(env)
  if (!columns.fileSlug) return false

  const row = await env.DB!.prepare('SELECT id FROM uploads WHERE file_slug = ?').bind(slug).first()
  return Boolean(row)
}

async function nextFileSlug(env: Env, filename: string, fallbackId: string, preferredSlug = '') {
  const columns = await getUploadMetadataColumns(env)
  if (!columns.fileSlug) return fallbackId

  const requested = slugFromTitle(preferredSlug).replace(/^arquivo\//, '').split('/').filter(Boolean).join('-')
  const base = requested || fileBaseFromName(filename)
  let candidate = base
  let index = 2

  while (await fileSlugExists(env, candidate)) {
    if (requested) throw new EditorialError('já existe um arquivo com essa URL', 409)
    candidate = `${base}-${index}`
    index += 1
  }

  return candidate
}

function categoryListFromRow(row: any) {
  const value = String(row.categories || '').trim()
  if (!value) return []
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function pageRowToListItem(row: any, aliases: any[] = [], redirects: string[] = []) {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    namespace: row.namespace || 'article',
    status: row.status || 'published',
    isLocked: Boolean(row.is_locked || row.isLocked),
    updatedAt: row.effective_updated_at || row.updated_at,
    createdAt: row.created_at,
    revisionCount: Number(row.revision_count || 0),
    categories: categoryListFromRow(row),
    aliases,
    redirects
  }
}

function normalizeEscapedBlockNewlines(value: string) {
  const output: string[] = []
  let insideComponent = false

  for (const rawLine of String(value || '').split('\n')) {
    const shouldExpand = insideComponent || /^:::\s*[\wÀ-ÿ-]+/.test(rawLine)
    const line = shouldExpand
      ? rawLine.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, '\t')
      : rawLine

    output.push(line)
    for (const part of line.split('\n')) {
      const clean = part.trim()
      if (/^:::\s*[\wÀ-ÿ-]+/.test(clean)) insideComponent = true
      if (clean === ':::') insideComponent = false
    }
  }

  return output.join('\n')
}

function rowToPage(page: any, revisions: any[] = [], categories: string[] = [], aliases: any[] = [], redirects: string[] = [], source: Record<string, any> = {}) {
  if (!page) return null

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    subtitle: page.subtitle,
    namespace: page.namespace || 'article',
    status: page.status || 'published',
    isLocked: Boolean(page.is_locked || page.isLocked),
    content: normalizeEscapedBlockNewlines(page.content || ''),
    updatedAt: page.updated_at,
    createdAt: page.created_at,
    currentRevisionId: page.current_revision_id,
    categories,
    aliases,
    redirects,
    revisions,
    ...source
  }
}

async function readPageRow(env: Env, slug: string) {
  return env.DB!.prepare(`
    SELECT
      pages.id,
      pages.slug,
      pages.title,
      pages.subtitle,
      pages.namespace,
      pages.status,
      pages.is_locked,
      pages.current_revision_id,
      pages.created_at,
      pages.updated_at,
      revisions.content_markdown AS content
    FROM pages
    LEFT JOIN revisions ON revisions.id = pages.current_revision_id
    WHERE pages.slug = ? AND pages.status = 'published'
  `).bind(slug).first()
}

async function readPageRowByCandidates(env: Env, slug: string, options: { preferCanonical?: boolean } = {}) {
  for (const candidate of slugLookupCandidates(slug, options)) {
    const row = await readPageRow(env, candidate)
    if (row) return row
  }

  return null
}

async function findStoredPageSlug(env: Env, slug: string, status: 'published' | 'deleted' | 'any' = 'published', options: { preferCanonical?: boolean } = {}) {
  const statusClause = status === 'any' ? '' : ' AND status = ?'

  for (const candidate of slugLookupCandidates(slug, options)) {
    const statement = env.DB!.prepare(`SELECT id, slug, title, status FROM pages WHERE slug = ?${statusClause} LIMIT 1`)
    const row = status === 'any'
      ? await statement.bind(candidate).first()
      : await statement.bind(candidate, status).first()

    if (row) return row as any
  }

  return null
}

async function readPageAliases(env: Env, pageId: string) {
  const optional = await getOptionalTables(env)
  if (!optional.pageAliases) return []

  const rows = await env.DB!.prepare(`
    SELECT alias_slug AS slug, alias_title AS title
    FROM page_aliases
    WHERE page_id = ?
    ORDER BY alias_title COLLATE NOCASE ASC
  `).bind(pageId).all()

  return rows.results || []
}

async function readPageRedirectRules(env: Env, slug: string) {
  const columns = await getRedirectMetadataColumns(env)
  const rows = columns.targetFragment
    ? await env.DB!.prepare(`
      SELECT from_slug AS fromSlug, COALESCE(target_fragment, '') AS fragment
      FROM redirects
      WHERE to_slug = ?
      ORDER BY from_slug COLLATE NOCASE ASC
    `).bind(slug).all()
    : await env.DB!.prepare(`
      SELECT from_slug AS fromSlug, '' AS fragment
      FROM redirects
      WHERE to_slug = ?
      ORDER BY from_slug COLLATE NOCASE ASC
    `).bind(slug).all()

  return (rows.results || [])
    .map((row: any) => ({ fromSlug: String(row.fromSlug || ''), fragment: cleanRedirectFragment(row.fragment) }))
    .filter(rule => rule.fromSlug)
}

async function readPageRedirects(env: Env, slug: string) {
  const rules = await readPageRedirectRules(env, slug)
  return rules.map(rule => rule.fromSlug)
}

async function readPageCategories(env: Env, pageId: string) {
  const rows = await env.DB!.prepare(`
    SELECT categories.name
    FROM page_categories
    JOIN categories ON categories.id = page_categories.category_id
    WHERE page_categories.page_id = ?
    ORDER BY categories.name COLLATE NOCASE ASC
  `).bind(pageId).all()

  return (rows.results || []).map((row: any) => row.name)
}

async function readPageRevisionSummaries(env: Env, pageId: string) {
  const rows = await env.DB!.prepare(`
    SELECT
      id,
      revision_number AS revisionNumber,
      COALESCE(author_name, 'editor') AS author,
      author_name AS authorName,
      summary,
      created_at AS createdAt
    FROM revisions
    WHERE page_id = ?
    ORDER BY revision_number DESC
    LIMIT 100
  `).bind(pageId).all()

  return rows.results || []
}

async function hydratePage(env: Env, page: any, source: Record<string, any> = {}) {
  if (!page) return null

  const [revisions, categories, aliases, redirectRules] = await Promise.all([
    (await globalSettingEnabled(env, 'pageHistory')) ? readPageRevisionSummaries(env, page.id) : Promise.resolve([]),
    readPageCategories(env, page.id),
    readPageAliases(env, page.id),
    readPageRedirectRules(env, page.slug)
  ])

  return rowToPage(page, revisions, categories, aliases, redirectRules.map(rule => rule.fromSlug), {
    ...source,
    redirectRules
  })
}

async function resolveRedirect(env: Env, slug: string) {
  const columns = await getRedirectMetadataColumns(env)

  for (const candidate of slugLookupCandidates(slug, { preferCanonical: true })) {
    const redirect = columns.targetFragment
      ? await env.DB!.prepare(`
        SELECT redirects.to_slug AS slug, pages.title AS title, COALESCE(redirects.target_fragment, '') AS targetFragment
        FROM redirects
        JOIN pages ON pages.slug = redirects.to_slug
        WHERE redirects.from_slug = ? AND pages.status = 'published'
      `).bind(candidate).first()
      : await env.DB!.prepare(`
        SELECT redirects.to_slug AS slug, pages.title AS title, '' AS targetFragment
        FROM redirects
        JOIN pages ON pages.slug = redirects.to_slug
        WHERE redirects.from_slug = ? AND pages.status = 'published'
      `).bind(candidate).first()

    if (redirect) return redirect
  }

  return null
}

async function resolveAlias(env: Env, slug: string) {
  const optional = await getOptionalTables(env)
  if (!optional.pageAliases) return null

  for (const candidate of slugLookupCandidates(slug, { preferCanonical: true })) {
    const alias = await env.DB!.prepare(`
      SELECT pages.slug, pages.title, page_aliases.alias_title AS aliasTitle
      FROM page_aliases
      JOIN pages ON pages.id = page_aliases.page_id
      WHERE page_aliases.alias_slug = ? AND pages.status = 'published'
    `).bind(candidate).first()

    if (alias) return alias
  }

  return null
}

function pageVisibilitySql(settings: Record<string, any>) {
  const filters = ["pages.slug NOT IN ('especial', 'special', 'arquivo')", "pages.slug NOT LIKE 'especial/%'", "pages.slug NOT LIKE 'special/%'", "pages.slug NOT LIKE 'arquivo/%'"]
  for (const [namespace, key] of [['discussao', 'talkPages'], ['usuario', 'userPages'], ['categoria', 'categories']]) {
    if (!nestedSettingValue(settings, key)) filters.push(`pages.slug NOT LIKE '${namespace}/%'`)
  }
  return filters.join(' AND ')
}

export async function pageListStats(env: Env, includeDeleted = false) {
  if (!env.DB) throw new EditorialError('armazenamento indisponível', 503)
  const filter = includeDeleted ? "pages.status IN ('published', 'deleted', 'draft')" : "pages.status = 'published' AND " + pageVisibilitySql(await getGlobalSettings(env))
  return env.DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM((SELECT COUNT(*) FROM revisions WHERE page_id = pages.id)), 0) AS revisions FROM pages WHERE ${filter}`).first<{ total: number, revisions: number }>()
}

export async function lookupPageSlugs(env: Env, values: string[]) {
  if (!env.DB) throw new EditorialError('armazenamento indisponível', 503)
  if (!values.length) return []
  const settings = await getGlobalSettings(env)
  const wanted = values.map(normalizeSlug)
  const visibility = pageVisibilitySql(settings)
  const sourceVisibility = visibility.replaceAll('pages.slug', 'wanted.slug')
  const rows = await env.DB.prepare(`WITH wanted(slug) AS (VALUES ${wanted.map(() => '(?)').join(',')})
    SELECT DISTINCT wanted.slug FROM wanted
    LEFT JOIN page_aliases ON page_aliases.alias_slug = wanted.slug
    LEFT JOIN redirects ON redirects.from_slug = wanted.slug
    JOIN pages ON pages.slug = wanted.slug OR pages.id = page_aliases.page_id OR pages.slug = redirects.to_slug
    WHERE pages.status = 'published' AND ${visibility} AND ${sourceVisibility}
    UNION SELECT wanted.slug FROM wanted JOIN categories ON wanted.slug = 'categoria/' || categories.slug
    WHERE ${nestedSettingValue(settings, 'categories') ? '1' : '0'} = 1`).bind(...wanted).all()
  const found = new Set(rows.results.map((row: any) => row.slug))
  return values.filter((_, index) => found.has(wanted[index]))
}

export async function listPages(env: Env, options: PageListOptions = {}) {
  if (!env.DB) return []

  const sort = options.sort === 'recent' ? 'recent' : 'title'
  const limit = Math.min(Math.max(Number(options.limit || 500), 1), 100)
  const includeDeleted = Boolean(options.includeDeleted)
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0))
  const visibility = includeDeleted ? '' : ' AND ' + pageVisibilitySql(await getGlobalSettings(env))
  const recentExpression = "COALESCE((SELECT MAX(page_revisions_order.created_at) FROM revisions page_revisions_order WHERE page_revisions_order.page_id = pages.id), pages.updated_at, pages.created_at)"
  const orderBy = sort === 'recent'
    ? `julianday(${recentExpression}) DESC, ${recentExpression} DESC, pages.title COLLATE NOCASE ASC`
    : 'pages.title COLLATE NOCASE ASC'
  const statusWhere = includeDeleted ? "pages.status IN ('published', 'deleted', 'draft')" : "pages.status = 'published'"

  const rows = await env.DB.prepare(`
    SELECT
      pages.id,
      pages.slug,
      pages.title,
      pages.subtitle,
      pages.namespace,
      pages.status,
      pages.is_locked,
      pages.current_revision_id,
      pages.created_at,
      pages.updated_at,
      COALESCE((SELECT MAX(page_revisions_latest.created_at) FROM revisions page_revisions_latest WHERE page_revisions_latest.page_id = pages.id), pages.updated_at, pages.created_at) AS effective_updated_at,
      (SELECT COUNT(*) FROM revisions page_revisions WHERE page_revisions.page_id = pages.id) AS revision_count,
      (SELECT GROUP_CONCAT(categories.name, ', ')
        FROM page_categories
        JOIN categories ON categories.id = page_categories.category_id
        WHERE page_categories.page_id = pages.id) AS categories
    FROM pages
    WHERE ${statusWhere}${visibility}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all()

  const pages = rows.results || []
  if (!pages.length) return []

  const aliasesByPage = new Map<string, any[]>()
  const redirectsBySlug = new Map<string, string[]>()
  const optional = await getOptionalTables(env)

  if (optional.pageAliases) {
    const aliasRows = await env.DB.prepare(`
      SELECT page_id, alias_slug AS slug, alias_title AS title
      FROM page_aliases
      WHERE page_id IN (${pages.map(() => '?').join(',')})
      ORDER BY alias_title COLLATE NOCASE ASC
    `).bind(...pages.map((page: any) => page.id)).all()

    for (const alias of aliasRows.results || []) {
      const list = aliasesByPage.get((alias as any).page_id) || []
      list.push({ slug: (alias as any).slug, title: (alias as any).title })
      aliasesByPage.set((alias as any).page_id, list)
    }
  }

  const redirectRows = await env.DB.prepare(`
    SELECT redirects.from_slug, redirects.to_slug
    FROM redirects
    JOIN pages ON pages.slug = redirects.to_slug
    WHERE pages.status = 'published' AND redirects.to_slug IN (${pages.map(() => '?').join(',')})
    ORDER BY redirects.from_slug COLLATE NOCASE ASC
  `).bind(...pages.map((page: any) => page.slug)).all()

  for (const redirect of redirectRows.results || []) {
    const toSlug = (redirect as any).to_slug
    const list = redirectsBySlug.get(toSlug) || []
    list.push((redirect as any).from_slug)
    redirectsBySlug.set(toSlug, list)
  }

  const items = pages.map((row: any) => pageRowToListItem(
    row,
    aliasesByPage.get(row.id) || [],
    redirectsBySlug.get(row.slug) || []
  ))

  if (includeDeleted) return items
  const settings = await getGlobalSettings(env)
  return items.filter((page: any) => pageVisibleWithSettings(page?.slug, settings))
}


export async function listCategories(env: Env) {
  if (!env.DB) return []

  const visibility = pageVisibilitySql(await getGlobalSettings(env))
  const rows = await env.DB.prepare(`
    SELECT
      categories.id,
      categories.slug,
      categories.name,
      categories.created_at AS createdAt,
      COUNT(pages.id) AS pageCount
    FROM categories
    LEFT JOIN page_categories ON page_categories.category_id = categories.id
    LEFT JOIN pages ON pages.id = page_categories.page_id AND pages.status = 'published' AND ${visibility}
    GROUP BY categories.id, categories.slug, categories.name, categories.created_at
    HAVING COUNT(pages.id) > 0
    ORDER BY categories.name COLLATE NOCASE ASC
  `).all()

  return rows.results || []
}

export async function readCategory(env: Env, slug: string) {
  if (!env.DB) return null

  const category = await env.DB.prepare(`
    SELECT id, slug, name, created_at AS createdAt
    FROM categories
    WHERE slug = ?
  `).bind(slug).first()

  if (!category) return null

  const rows = await env.DB.prepare(`
    SELECT
      pages.id,
      pages.slug,
      pages.title,
      pages.subtitle,
      pages.namespace,
      pages.status,
      pages.is_locked,
      pages.current_revision_id,
      pages.created_at,
      pages.updated_at,
      (SELECT COUNT(*) FROM revisions page_revisions WHERE page_revisions.page_id = pages.id) AS revision_count,
      (SELECT GROUP_CONCAT(categories.name, ', ')
        FROM page_categories related_page_categories
        JOIN categories ON categories.id = related_page_categories.category_id
        WHERE related_page_categories.page_id = pages.id) AS categories
    FROM page_categories
    JOIN pages ON pages.id = page_categories.page_id
    WHERE page_categories.category_id = ? AND pages.status = 'published'
    ORDER BY pages.title COLLATE NOCASE ASC
  `).bind((category as any).id).all()

  const settings = await getGlobalSettings(env)
  return {
    slug: (category as any).slug,
    name: (category as any).name,
    createdAt: (category as any).createdAt,
    pages: (rows.results || [])
      .map((row: any) => pageRowToListItem(row))
      .filter((page: any) => pageVisibleWithSettings(page?.slug, settings))
  }
}

export async function readPage(env: Env, slug: string) {
  if (!(await publicPageEnabled(env, slug))) return null
  if (!env.DB) return null

  const exact = await readPageRowByCandidates(env, slug, { preferCanonical: true })
  if (exact) return hydratePage(env, exact)

  const alias = await resolveAlias(env, slug)
  if (alias) {
    if (!(await publicPageEnabled(env, String(alias.slug)))) return null
    const page = await readPageRow(env, (alias as any).slug)
    return hydratePage(env, page, {
      resolvedFrom: slug,
      resolvedBy: 'alias',
      resolvedTitle: (alias as any).aliasTitle || null
    })
  }

  const redirect = await resolveRedirect(env, slug)
  if (redirect) {
    if (!(await publicPageEnabled(env, String(redirect.slug)))) return null
    const page = await readPageRow(env, (redirect as any).slug)
    return hydratePage(env, page, {
      resolvedFrom: slug,
      resolvedBy: 'redirect',
      resolvedFragment: cleanRedirectFragment((redirect as any).targetFragment)
    })
  }

  return null
}

export async function readRandomPage(env: Env) {
  if (!env.DB) return null

  const settings = await getGlobalSettings(env)
  const rows = await env.DB.prepare(`
    SELECT slug
    FROM pages
    WHERE status = 'published' AND ${pageVisibilitySql(settings)}
    ORDER BY RANDOM()
    LIMIT 1
  `).all()

  const row: any = (rows.results || []).find((item: any) => pageVisibleWithSettings(item?.slug, settings))
  if (!row?.slug) return null
  return readPage(env, String(row.slug))
}

async function nextRevisionNumber(env: Env, pageId: string) {
  const row = await env.DB!.prepare('SELECT COALESCE(MAX(revision_number), 0) + 1 AS next FROM revisions WHERE page_id = ?').bind(pageId).first()
  return Number(row?.next || 1)
}

async function syncCategories(env: Env, pageId: string, categories: string[] = [], statements?: D1PreparedStatement[]) {
  const batch = statements || []
  batch.push(env.DB!.prepare('DELETE FROM page_categories WHERE page_id = ?').bind(pageId))
  for (const name of Array.from(new Set(categories.map(item => item.trim()).filter(Boolean)))) {
    const slug = slugFromTitle(name)
    batch.push(env.DB!.prepare('INSERT OR IGNORE INTO categories (id, slug, name, created_at) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), slug, name, new Date().toISOString()))
    batch.push(env.DB!.prepare('INSERT OR IGNORE INTO page_categories (page_id, category_id) SELECT ?, id FROM categories WHERE slug = ?').bind(pageId, slug))
  }
  if (!statements) await env.DB!.batch(batch)
}

async function syncAliases(env: Env, pageId: string, canonicalSlug: string, aliases: string[] = [], statements?: D1PreparedStatement[]) {
  const batch = statements || []
  const optional = await getOptionalTables(env)
  if (!optional.pageAliases) return

  batch.push(env.DB!.prepare('DELETE FROM page_aliases WHERE page_id = ?').bind(pageId))

  const unique = Array.from(new Map(
    cleanList(aliases)
      .map(title => ({ title, slug: slugFromTitle(title) }))
      .filter(alias => alias.slug && alias.slug !== canonicalSlug && !isReservedFilePageSlug(alias.slug))
      .map(alias => [alias.slug, alias])
  ).values())

  for (const alias of unique) {
    const exactPage = await env.DB!.prepare('SELECT id FROM pages WHERE slug = ? AND id != ?').bind(alias.slug, pageId).first()
    if (exactPage) continue

    batch.push(env.DB!.prepare('DELETE FROM redirects WHERE from_slug = ?').bind(alias.slug))
    batch.push(env.DB!.prepare(`
      INSERT INTO page_aliases (id, page_id, alias_slug, alias_title, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(alias_slug) DO UPDATE SET
        page_id = excluded.page_id,
        alias_title = excluded.alias_title
    `).bind(crypto.randomUUID(), pageId, alias.slug, alias.title, new Date().toISOString()))
  }
  if (!statements && batch.length) await env.DB!.batch(batch)
}

async function syncRedirects(env: Env, canonicalSlug: string, redirects: Array<string | RedirectRuleInput> = [], authorEmail = '', statements?: D1PreparedStatement[]) {
  const batch = statements || []
  batch.push(env.DB!.prepare('DELETE FROM redirects WHERE to_slug = ?').bind(canonicalSlug))

  const normalized = Array.from(new Map(
    (Array.isArray(redirects) ? redirects : [])
      .map(item => typeof item === 'string'
        ? { fromSlug: slugFromTitle(item), fragment: '' }
        : { fromSlug: slugFromTitle(item?.fromSlug || ''), fragment: cleanRedirectFragment(item?.fragment) })
      .filter(rule => rule.fromSlug && rule.fromSlug !== canonicalSlug && !isReservedFilePageSlug(rule.fromSlug))
      .map(rule => [rule.fromSlug, rule])
  ).values())
  const columns = await getRedirectMetadataColumns(env)

  for (const rule of normalized) {
    const exactPage = await env.DB!.prepare('SELECT id FROM pages WHERE slug = ?').bind(rule.fromSlug).first()
    if (exactPage) continue

    const optional = await getOptionalTables(env)
    if (optional.pageAliases) batch.push(env.DB!.prepare('DELETE FROM page_aliases WHERE alias_slug = ?').bind(rule.fromSlug))

    if (columns.targetFragment) {
      batch.push(env.DB!.prepare(`
        INSERT INTO redirects (id, from_slug, to_slug, target_fragment, created_by_email, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(from_slug) DO UPDATE SET
          to_slug = excluded.to_slug,
          target_fragment = excluded.target_fragment,
          created_by_email = excluded.created_by_email,
          created_at = excluded.created_at
      `).bind(crypto.randomUUID(), rule.fromSlug, canonicalSlug, rule.fragment || null, authorEmail || null, new Date().toISOString()))
    } else {
      batch.push(env.DB!.prepare(`
        INSERT INTO redirects (id, from_slug, to_slug, created_by_email, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(from_slug) DO UPDATE SET
          to_slug = excluded.to_slug,
          created_by_email = excluded.created_by_email,
          created_at = excluded.created_at
      `).bind(crypto.randomUUID(), rule.fromSlug, canonicalSlug, authorEmail || null, new Date().toISOString()))
    }
  }
  if (!statements && batch.length) await env.DB!.batch(batch)
}

async function syncSearch(env: Env, pageId: string, page: PageInput, slug: string, statements?: D1PreparedStatement[]) {
  const batch = statements || []
  batch.push(env.DB!.prepare('DELETE FROM page_search WHERE page_id = ?').bind(pageId))
  batch.push(env.DB!.prepare(`
    INSERT INTO page_search (page_id, slug, title, subtitle, content_markdown)
    VALUES (?, ?, ?, ?, ?)
  `).bind(pageId, slug, page.title, page.subtitle || '', page.content || ''))
  if (!statements && batch.length) await env.DB!.batch(batch)
}


function getMarkdownBlockValidationErrors(content: string) {
  const errors: string[] = []
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n')
  let insideCodeFence = false
  let componentOpenLine = 0

  for (let index = 0; index < lines.length; index += 1) {
    const clean = lines[index].trim()

    if (clean.startsWith('```')) {
      insideCodeFence = !insideCodeFence
      continue
    }

    if (insideCodeFence) continue

    if (!componentOpenLine) {
      if (/^:::\s*[\wÀ-ÿ-]+(?:\s+.*)?$/.test(clean)) {
        componentOpenLine = index + 1
      }
      continue
    }

    if (clean === ':::') componentOpenLine = 0
  }

  if (insideCodeFence) errors.push('há um bloco de código sem fechamento')
  if (componentOpenLine) errors.push(`há um bloco ::: sem fechamento perto da linha ${componentOpenLine}`)

  return errors
}

function validatePageInput(input: PageInput, options: { requireSummary?: boolean } = {}) {
  const errors: string[] = []
  const title = String(input.title || '').trim()
  const content = normalizeEscapedBlockNewlines(String(input.content || ''))
  const summary = String(input.summary || '').trim()

  if (!title) errors.push('o título é obrigatório')
  if (!content.trim()) errors.push('o conteúdo é obrigatório')
  if (title.length > 180) errors.push('o título é longo demais')
  if (content.length > 512 * 1024) errors.push('o conteúdo excede o limite permitido')
  if (options.requireSummary && !summary) errors.push('o resumo da edição é obrigatório')
  if (summary.length > 500) errors.push('o resumo da edição é longo demais')

  errors.push(...getMarkdownBlockValidationErrors(content))

  const unresolvedWikiOpen = (content.match(/\[\[/g) || []).length
  const unresolvedWikiClose = (content.match(/\]\]/g) || []).length
  if (unresolvedWikiOpen !== unresolvedWikiClose) errors.push('há um link wiki [[ ]] incompleto')

  if (errors.length) throw new EditorialError(`edição recusada: ${errors.join('; ')}`, 400)
}

export async function writePage(env: Env, slug: string, input: PageInput, authorEmail: string, authorName: string | null = null, approval?: { id: string, reviewerName: string, creditMode: string }) {
  if (!env.DB) throw new EditorialError('armazenamento indisponível', 503)
  const statements: D1PreparedStatement[] = []

  const now = new Date().toISOString()
  validatePageInput(input, { requireSummary: true })
  const title = String(input.title || '').trim()
  const content = normalizeEscapedBlockNewlines(String(input.content || ''))
  const canonicalSlug = slugFromTitle(slug)
  if (!canonicalSlug) throw new EditorialError('slug inválido', 400)
  if (!(await publicPageEnabled(env, canonicalSlug))) throw new EditorialError('conteúdo indisponível', 403)
  if (isReservedFilePageSlug(canonicalSlug)) throw new EditorialError('o namespace /wiki/arquivo/ é reservado para uploads de mídia', 403)

  let storageSlug = canonicalSlug
  const existing = await findStoredPageSlug(env, input.sourceSlug || slug, 'any', { preferCanonical: true })
  const existingDetails: any = existing
    ? await env.DB.prepare('SELECT id, slug, title, is_locked, status, current_revision_id FROM pages WHERE id = ?').bind(existing.id).first()
    : null

  const renaming = Boolean(input.sourceSlug && slugFromTitle(input.sourceSlug) !== canonicalSlug)
  if (renaming) {
    const actor: any = await env.DB.prepare('SELECT role, status FROM editor_profiles WHERE email = ?').bind(authorEmail).first()
    if (actor?.status !== 'active' || !['admin', 'super_admin'].includes(actor.role)) throw new EditorialError('renomeação restrita a administradores', 403)
  }
  let legacyRedirect: D1PreparedStatement | null = null
  if (existingDetails?.is_locked) throw new EditorialError('página bloqueada', 403)
  if (existingDetails && existingDetails.status !== 'published') throw new EditorialError('a página precisa ser restaurada antes de receber edições', 403)
  const categories = (await globalSettingEnabled(env, 'categories')) ? input.categories || [] : existingDetails ? await readPageCategories(env, existingDetails.id) : []
  const expected = 'expectedRevisionId' in input ? input.expectedRevisionId : existingDetails?.current_revision_id || null
  const guardId = crypto.randomUUID()
  statements.push(env.DB.prepare(`INSERT INTO core_write_guards (id, accepted) VALUES (?, CASE WHEN
    ((? IS NULL AND ? IS NULL AND NOT EXISTS (SELECT 1 FROM pages WHERE slug = ?)) OR
     EXISTS (SELECT 1 FROM pages WHERE id = ? AND current_revision_id IS ? AND slug = ? AND title = ? AND status = 'published' AND is_locked = 0))
    AND (? = 0 OR EXISTS (SELECT 1 FROM editor_profiles WHERE email = ? AND status = 'active' AND role IN ('admin', 'super_admin')))
    AND NOT EXISTS (SELECT 1 FROM editor_profiles WHERE email = ? AND status != 'active')
    AND (? IS NULL OR EXISTS (SELECT 1 FROM edit_proposals WHERE id = ? AND status = 'pending'))
    THEN 1 ELSE 0 END)`).bind(guardId, existingDetails?.id || null, expected, canonicalSlug, existingDetails?.id || null, expected, existingDetails?.slug || null, existingDetails?.title || null, renaming ? 1 : 0, authorEmail, authorEmail, approval?.id || null, approval?.id || null))

  if (existingDetails && existingDetails.slug !== canonicalSlug) {
    const conflict = await env.DB.prepare('SELECT id FROM pages WHERE slug = ? AND id != ?').bind(canonicalSlug, existingDetails.id).first()
    if (!conflict) {
      const oldSlug = String(existingDetails.slug || '')
      statements.push(env.DB.prepare('UPDATE pages SET slug = ?, updated_at = ? WHERE id = ?').bind(canonicalSlug, now, existingDetails.id))
      statements.push(env.DB.prepare('UPDATE redirects SET to_slug = ? WHERE to_slug = ?').bind(canonicalSlug, oldSlug))
      statements.push(env.DB.prepare('UPDATE page_search SET slug = ? WHERE page_id = ?').bind(canonicalSlug, existingDetails.id))
      if (oldSlug && oldSlug !== canonicalSlug) {
        legacyRedirect = env.DB.prepare(`
          INSERT INTO redirects (id, from_slug, to_slug, created_by_email, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(from_slug) DO UPDATE SET to_slug = excluded.to_slug, created_by_email = excluded.created_by_email, created_at = excluded.created_at
        `).bind(crypto.randomUUID(), oldSlug, canonicalSlug, authorEmail, now)
      }
      existingDetails.slug = canonicalSlug
    } else {
      if (renaming) throw new EditorialError('já existe uma página com esse slug', 409)
      storageSlug = String(existingDetails.slug || canonicalSlug)
    }
  }

  const pageId = existingDetails?.id || crypto.randomUUID()
  const revisionId = crypto.randomUUID()
  const revisionNumber = await nextRevisionNumber(env, pageId)

  if (!existingDetails) {
    statements.push(env.DB.prepare(`
      INSERT INTO pages (id, slug, title, subtitle, namespace, status, created_by_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'article', 'published', ?, ?, ?)
    `).bind(pageId, storageSlug, title, input.subtitle || null, authorEmail, now, now))
  }

  const revisionColumns = await getRevisionMetadataColumns(env)

  if (hasFullRevisionMetadata(revisionColumns)) {
    statements.push(env.DB.prepare(`
      INSERT INTO revisions (
        id,
        page_id,
        revision_number,
        author_email,
        author_name,
        title,
        subtitle,
        categories_json,
        content_markdown,
        content_html,
        summary,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).bind(
      revisionId,
      pageId,
      revisionNumber,
      authorEmail,
      authorName,
      title,
      input.subtitle || null,
      JSON.stringify(categories),
      content,
      input.summary || 'sem resumo',
      now
    ))
  } else {
    statements.push(env.DB.prepare(`
      INSERT INTO revisions (
        id,
        page_id,
        revision_number,
        author_email,
        author_name,
        content_markdown,
        content_html,
        summary,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).bind(
      revisionId,
      pageId,
      revisionNumber,
      authorEmail,
      authorName,
      content,
      input.summary || 'sem resumo',
      now
    ))
  }

  statements.push(env.DB.prepare(`
    UPDATE pages
    SET title = ?, subtitle = ?, status = 'published', current_revision_id = ?, updated_at = ?
    WHERE id = ?
  `).bind(title, input.subtitle || null, revisionId, now, pageId))

  await syncCategories(env, pageId, categories, statements)
  if ('aliases' in input) await syncAliases(env, pageId, storageSlug, input.aliases || [], statements)
  if ('redirectRules' in input) await syncRedirects(env, storageSlug, input.redirectRules || [], authorEmail, statements)
  else if ('redirects' in input) await syncRedirects(env, storageSlug, input.redirects || [], authorEmail, statements)
  if (legacyRedirect) statements.push(legacyRedirect)
  await syncSearch(env, pageId, { ...input, title, content }, storageSlug, statements)

  if (approval) statements.push(env.DB.prepare(`UPDATE edit_proposals SET status = 'approved', reviewed_by_email = ?, reviewed_by_name = ?, suggestion_credit_mode = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'`).bind(authorEmail, approval.reviewerName, approval.creditMode, now, now, approval.id))
  statements.push(env.DB.prepare('DELETE FROM core_write_guards WHERE id = ?').bind(guardId))
  try { await env.DB.batch(statements) }
  catch (cause) {
    if (String(cause).includes('wiki_recovery_locked')) throw new EditorialError('recuperação em andamento', 503)
    if (String(cause).includes('wiki_write_conflict') || String(cause).includes('UNIQUE constraint failed: pages.slug') || String(cause).includes('UNIQUE constraint failed: revisions.page_id')) throw new EditorialError('a página foi modificada; revise o conflito antes de salvar')
    throw cause
  }
  return { id: pageId, slug: storageSlug, title, subtitle: input.subtitle || '', content, categories, currentRevisionId: revisionId, revisionNumber, updatedAt: now, aliases: input.aliases || [], redirects: input.redirects || [] }
}


async function commitPageState(env: Env, pageId: string, status: string, statements: D1PreparedStatement[], expectedRevisionId?: string | null, expectedPage?: { slug: string, title: string }) {
  const guardId = crypto.randomUUID()
  const guard = env.DB!.prepare(`INSERT INTO core_write_guards (id, accepted) VALUES (?, CASE WHEN EXISTS
    (SELECT 1 FROM pages WHERE id = ? AND status = ? AND (? = 0 OR current_revision_id IS ?) AND (? IS NULL OR (slug = ? AND title = ?))) THEN 1 ELSE 0 END)`).bind(guardId, pageId, status, expectedRevisionId === undefined ? 0 : 1, expectedRevisionId || null, expectedPage?.slug || null, expectedPage?.slug || null, expectedPage?.title || null)
  try { await env.DB!.batch([guard, ...statements, env.DB!.prepare('DELETE FROM core_write_guards WHERE id = ?').bind(guardId)]) }
  catch (cause) {
    if (String(cause).includes('wiki_write_conflict')) throw new EditorialError('o estado da página foi modificado')
    throw cause
  }
}

export async function deletePage(env: Env, slug: string, authorEmail: string, reason = '') {
  if (!env.DB) return null

  const page: any = await findStoredPageSlug(env, slug, 'published', { preferCanonical: false })
  if (!page) return null

  const now = new Date().toISOString()
  const purgeAfter = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()

  await commitPageState(env, page.id, 'published', [
    env.DB.prepare(`UPDATE pages SET status = 'deleted', deleted_at = ?, deleted_by_email = ?, purge_after = ?, deleted_reason = ?, updated_at = ? WHERE id = ?`).bind(now, authorEmail, purgeAfter, String(reason || '').trim() || null, now, page.id),
    env.DB.prepare('DELETE FROM page_search WHERE page_id = ?').bind(page.id)
  ])

  return {
    ok: true,
    slug: page.slug,
    title: page.title,
    deletedAt: now,
    deletedByEmail: authorEmail,
    purgeAfter
  }
}

export async function listPageRevisions(env: Env, slug: string, options: { offset?: number } = {}) {
  if (!env.DB) return null
  if (!(await globalSettingEnabled(env, 'pageHistory'))) throw new EditorialError('histórico desativado', 403)

  const page = await readPage(env, slug)
  if (!page) return null
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0))
  const count: any = await env.DB.prepare('SELECT COUNT(*) AS total FROM revisions WHERE page_id = ?').bind(page.id).first()

  const rows = await env.DB.prepare(`
    SELECT
      revisions.id,
      revisions.revision_number AS revisionNumber,
      COALESCE(NULLIF(editor_profiles.display_name, ''), revisions.author_name, 'editor') AS author,
      COALESCE(NULLIF(editor_profiles.display_name, ''), revisions.author_name) AS authorName,
      revisions.summary,
      revisions.created_at AS createdAt,
      CASE WHEN revisions.id = ? THEN 1 ELSE 0 END AS isCurrent
    FROM revisions
    LEFT JOIN editor_profiles ON lower(editor_profiles.email) = lower(revisions.author_email)
    WHERE revisions.page_id = ?
    ORDER BY revisions.revision_number DESC
    LIMIT 100 OFFSET ?
  `).bind(page.currentRevisionId, page.id, offset).all()

  return {
    page: {
      id: page.id,
      slug: page.slug,
      title: page.title,
      currentRevisionId: page.currentRevisionId
    },
    revisions: rows.results || [],
    total: Number(count?.total || 0),
    offset,
    nextOffset: offset + rows.results.length < Number(count?.total || 0) ? offset + rows.results.length : null
  }
}

export async function readPageRevision(env: Env, slug: string, revisionNumber: string | number) {
  if (!env.DB) return null
  if (!(await globalSettingEnabled(env, 'pageHistory'))) throw new EditorialError('histórico desativado', 403)

  const page = await readPage(env, slug)
  if (!page) return null

  const revisionColumns = await getRevisionMetadataColumns(env)
  const revision = hasFullRevisionMetadata(revisionColumns)
    ? await env.DB.prepare(`
      SELECT
        id,
        page_id,
        revision_number AS revisionNumber,
        COALESCE(author_name, 'editor') AS author,
        COALESCE((SELECT NULLIF(editor_profiles.display_name, '') FROM editor_profiles WHERE lower(editor_profiles.email) = lower(revisions.author_email) LIMIT 1), revisions.author_name) AS authorName,
        COALESCE(title, ?) AS title,
        CASE WHEN title IS NULL THEN COALESCE(subtitle, ?) ELSE COALESCE(subtitle, '') END AS subtitle,
        categories_json AS categoriesJson,
        content_markdown AS content,
        summary,
        created_at AS createdAt,
        CASE WHEN id = ? THEN 1 ELSE 0 END AS isCurrent
      FROM revisions
      WHERE page_id = ? AND revision_number = ?
    `).bind(
      page.title,
      page.subtitle || '',
      page.currentRevisionId,
      page.id,
      Number(revisionNumber)
    ).first()
    : await env.DB.prepare(`
      SELECT
        id,
        page_id,
        revision_number AS revisionNumber,
        COALESCE(author_name, 'editor') AS author,
        COALESCE((SELECT NULLIF(editor_profiles.display_name, '') FROM editor_profiles WHERE lower(editor_profiles.email) = lower(revisions.author_email) LIMIT 1), revisions.author_name) AS authorName,
        ? AS title,
        ? AS subtitle,
        NULL AS categoriesJson,
        content_markdown AS content,
        summary,
        created_at AS createdAt,
        CASE WHEN id = ? THEN 1 ELSE 0 END AS isCurrent
      FROM revisions
      WHERE page_id = ? AND revision_number = ?
    `).bind(
      page.title,
      page.subtitle || '',
      page.currentRevisionId,
      page.id,
      Number(revisionNumber)
    ).first()

  if (!revision) return null

  let categories = parseJsonArray((revision as any).categoriesJson)
  if ((revision as any).categoriesJson == null) categories = page.categories || []

  return {
    id: (revision as any).id,
    pageId: (revision as any).page_id,
    pageSlug: page.slug,
    revisionNumber: (revision as any).revisionNumber,
    author: (revision as any).author,
    authorName: (revision as any).authorName || null,
    title: (revision as any).title,
    subtitle: (revision as any).subtitle || '',
    content: (revision as any).content || '',
    categories,
    summary: (revision as any).summary || 'sem resumo',
    createdAt: (revision as any).createdAt,
    isCurrent: Boolean((revision as any).isCurrent),
    currentRevisionId: page.currentRevisionId
  }
}

export async function restorePageRevision(env: Env, slug: string, revisionNumber: string | number, authorEmail: string, authorName: string | null = null, summary = '', expectedRevisionId?: string | null) {
  const revision = await readPageRevision(env, slug, revisionNumber)
  if (!revision) return null

  return writePage(env, slug, {
    expectedRevisionId: expectedRevisionId === undefined ? revision.currentRevisionId : expectedRevisionId,
    title: revision.title,
    subtitle: revision.subtitle,
    content: revision.content,
    categories: revision.categories,
    summary: summary || `restaurada revisão ${revision.revisionNumber}`
  }, authorEmail, authorName)
}


export async function recordUpload(env: Env, input: UploadInput) {
  if (!env.DB) return null

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const fileSlug = await nextFileSlug(env, input.filename, id, input.preferredSlug || '')
  const columns = await getUploadMetadataColumns(env)

  if (columns.fileSlug && columns.description && columns.updatedAt) {
    await env.DB.prepare(`
      INSERT INTO uploads (
        id,
        r2_key,
        filename,
        mime_type,
        size_bytes,
        sha256,
        uploaded_by_email,
        created_at,
        file_slug,
        description,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.r2Key,
      input.filename,
      input.mimeType,
      input.sizeBytes,
      input.sha256 || null,
      input.uploadedByEmail || null,
      now,
      fileSlug,
      input.description || null,
      now
    ).run()
  } else {
    await env.DB.prepare(`
      INSERT INTO uploads (
        id,
        r2_key,
        filename,
        mime_type,
        size_bytes,
        sha256,
        uploaded_by_email,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.r2Key,
      input.filename,
      input.mimeType,
      input.sizeBytes,
      input.sha256 || null,
      input.uploadedByEmail || null,
      now
    ).run()
  }

  return uploadRowToFile({ id, file_slug: fileSlug, r2_key: input.r2Key, filename: input.filename, mime_type: input.mimeType, size_bytes: input.sizeBytes, sha256: input.sha256 || null, uploaded_by_email: input.uploadedByEmail || null, description: input.description || null, created_at: now, updated_at: now, status: 'published' })
}


export async function listUploads(env: Env, options: { search?: string, limit?: number, offset?: number, includeDeleted?: boolean } = {}) {
  if (!env.DB) return []

  const columns = await getUploadMetadataColumns(env)
  const limit = Math.min(Math.max(Number(options.limit || 80), 1), 200)
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0))
  const query = String(options.search || '').trim()
  const like = likeTerm(query)
  const statusFilter = options.includeDeleted ? '' : "AND COALESCE(status, 'published') = 'published'"

  if (columns.fileSlug && columns.description && columns.updatedAt && columns.status) {
    const statement = query
      ? env.DB.prepare(`
        SELECT
          id,
          r2_key,
          filename,
          mime_type,
          size_bytes,
          sha256,
          uploaded_by_email,
          created_at,
          file_slug,
          description,
          updated_at,
          COALESCE(status, 'published') AS status,
          deleted_at,
          deleted_by_email,
          purge_after
        FROM uploads
        WHERE (filename LIKE ? ESCAPE '\'
          OR file_slug LIKE ? ESCAPE '\'
          OR description LIKE ? ESCAPE '\') ${statusFilter}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(like, like, like, limit, offset)
      : env.DB.prepare(`
        SELECT
          id,
          r2_key,
          filename,
          mime_type,
          size_bytes,
          sha256,
          uploaded_by_email,
          created_at,
          file_slug,
          description,
          updated_at,
          COALESCE(status, 'published') AS status,
          deleted_at,
          deleted_by_email,
          purge_after
        FROM uploads
        WHERE 1 = 1 ${statusFilter}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(limit, offset)

    const rows = await statement.all()
    return (rows.results || []).map(uploadRowToFile).filter(Boolean)
  }

  const statement = query
    ? env.DB.prepare(`
      SELECT
        id,
        r2_key,
        filename,
        mime_type,
        size_bytes,
        sha256,
        uploaded_by_email,
        created_at,
        NULL AS file_slug,
        NULL AS description,
        created_at AS updated_at,
        'published' AS status,
        NULL AS deleted_at,
        NULL AS deleted_by_email,
        NULL AS purge_after
      FROM uploads
      WHERE filename LIKE ? ESCAPE '\'
        OR id LIKE ? ESCAPE '\'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(like, like, limit, offset)
    : env.DB.prepare(`
      SELECT
        id,
        r2_key,
        filename,
        mime_type,
        size_bytes,
        sha256,
        uploaded_by_email,
        created_at,
        NULL AS file_slug,
        NULL AS description,
        created_at AS updated_at,
        'published' AS status,
        NULL AS deleted_at,
        NULL AS deleted_by_email,
        NULL AS purge_after
      FROM uploads
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset)

  const rows = await statement.all()
  return (rows.results || []).map(uploadRowToFile).filter(Boolean)
}

export async function readUpload(env: Env, slug: string, options: { includeDeleted?: boolean } = {}) {
  if (!env.DB) return null

  const cleanSlug = slugFromTitle(slug)
  const columns = await getUploadMetadataColumns(env)
  const statusFilter = options.includeDeleted ? '' : "AND COALESCE(status, 'published') = 'published'"

  if (columns.fileSlug && columns.description && columns.updatedAt && columns.status) {
    const row = await env.DB.prepare(`
      SELECT
        id,
        r2_key,
        filename,
        mime_type,
        size_bytes,
        sha256,
        uploaded_by_email,
        created_at,
        file_slug,
        description,
        updated_at,
        COALESCE(status, 'published') AS status,
        deleted_at,
        deleted_by_email,
        purge_after
      FROM uploads
      WHERE (file_slug = ? OR id = ?) ${statusFilter}
      LIMIT 1
    `).bind(cleanSlug, slug).first()

    return uploadRowToFile(row)
  }

  const row = await env.DB.prepare(`
    SELECT
      id,
      r2_key,
      filename,
      mime_type,
      size_bytes,
      sha256,
      uploaded_by_email,
      created_at,
      NULL AS file_slug,
      NULL AS description,
      created_at AS updated_at,
      'published' AS status,
      NULL AS deleted_at,
      NULL AS deleted_by_email,
      NULL AS purge_after
    FROM uploads
    WHERE id = ?
    LIMIT 1
  `).bind(slug).first()

  return uploadRowToFile(row)
}


function ftsQuery(query: string) {
  const tokens = String(query || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]{2,}/g)

  if (!tokens?.length) return ''
  return tokens.map(token => `${token}*`).join(' OR ')
}

function likeTerm(query: string) {
  return `%${String(query || '').replace(/[\\%_]/g, '\\$&')}%`
}

function likePrefix(query: string) {
  return `${String(query || '').replace(/[\\%_]/g, '\\$&')}%`
}

function normalizeSearchValue(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function readableTitleFromSlug(value: string) {
  return String(value || '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/[-_]+/g, ' ')
    .replace(/\b\p{L}/gu, letter => letter.toLocaleUpperCase('pt-BR')) || 'Página sem título'
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function mergeSearchResult(results: Map<string, any>, row: any, query: string, baseScore = 0, matchType = 'resultado') {
  const rowSlug = firstText(row?.slug, row?.SLUG)
  if (!rowSlug) return

  const cleanQuery = normalizeSearchValue(query)
  const canonicalQuery = normalizeSearchValue(slugFromTitle(query))
  const titleText = firstText(row?.title, row?.TITLE, row?.matchedTitle, row?.matched_title, readableTitleFromSlug(rowSlug))
  const subtitleText = firstText(row?.subtitle, row?.SUBTITLE)
  const slugText = firstText(row?.slug, row?.SLUG)
  const snippetText = firstText(row?.snippet, row?.SNIPPET)
  const matchedTitleText = firstText(row?.matchedTitle, row?.matched_title)
  const matchedSlugText = firstText(row?.matchedSlug, row?.matched_slug)
  const title = normalizeSearchValue(titleText)
  const subtitle = normalizeSearchValue(subtitleText)
  const slug = normalizeSearchValue(slugText)
  const snippet = normalizeSearchValue(snippetText)
  const matchedTitle = normalizeSearchValue(matchedTitleText)
  const matchedSlug = normalizeSearchValue(matchedSlugText)
  const exact = Boolean(cleanQuery && (
    title === cleanQuery ||
    slug === cleanQuery ||
    slug === canonicalQuery ||
    matchedTitle === cleanQuery ||
    matchedSlug === cleanQuery ||
    matchedSlug === canonicalQuery
  ))
  let score = baseScore

  if (cleanQuery) {
    if (exact) score += 1000
    else if (title.startsWith(cleanQuery) || slug.startsWith(cleanQuery) || matchedTitle.startsWith(cleanQuery) || matchedSlug.startsWith(cleanQuery)) score += 650
    else if (title.includes(cleanQuery) || slug.includes(cleanQuery) || matchedTitle.includes(cleanQuery) || matchedSlug.includes(cleanQuery)) score += 430
    if (subtitle.includes(cleanQuery)) score += 120
    if (snippet.includes(cleanQuery)) score += 60
  }

  const normalizedRow = {
    slug: rowSlug,
    title: titleText,
    subtitle: subtitleText,
    snippet: snippetText,
    updatedAt: firstText(row?.updatedAt, row?.updated_at, row?.UPDATEDAT, row?.UPDATED_AT),
    matchedTitle: matchedTitleText,
    matchedSlug: matchedSlugText,
    exact,
    searchScore: score,
    matchType,
    targetFragment: firstText(row?.targetFragment, row?.target_fragment)
  }

  const previous = results.get(rowSlug)
  if (!previous || Number(previous.searchScore || 0) < score || (exact && !previous.exact)) {
    results.set(rowSlug, normalizedRow)
  }
}

export async function searchPages(env: Env, query: string) {
  if (!env.DB) return []

  const cleanQuery = String(query || '').trim()
  if (!cleanQuery) return []

  const results = new Map<string, any>()
  const canonical = slugFromTitle(cleanQuery)
  const like = likeTerm(cleanQuery)
  const prefix = likePrefix(cleanQuery)
  const canonicalLike = canonical ? likeTerm(canonical) : like
  const canonicalPrefix = canonical ? likePrefix(canonical) : prefix

  const directRows = await env.DB.prepare(`
    SELECT
      pages.slug,
      pages.title,
      pages.subtitle,
      pages.slug AS matchedSlug,
      pages.title AS matchedTitle,
      substr(COALESCE(revisions.content_markdown, ''), 1, 260) AS snippet,
      pages.updated_at AS updatedAt
    FROM pages
    LEFT JOIN revisions ON revisions.id = pages.current_revision_id
    WHERE pages.status = 'published'
      AND (
        pages.slug = ?
        OR pages.slug LIKE ? ESCAPE '\\'
        OR pages.title = ? COLLATE NOCASE
        OR pages.title LIKE ? ESCAPE '\\'
      )
    ORDER BY
      CASE
        WHEN pages.slug = ? THEN 0
        WHEN pages.title = ? COLLATE NOCASE THEN 1
        WHEN pages.title LIKE ? ESCAPE '\\' THEN 2
        WHEN pages.slug LIKE ? ESCAPE '\\' THEN 3
        ELSE 9
      END,
      pages.title COLLATE NOCASE ASC
    LIMIT 25
  `).bind(canonical, canonicalPrefix, cleanQuery, prefix, canonical, cleanQuery, prefix, canonicalPrefix).all()

  for (const row of directRows.results || []) mergeSearchResult(results, row, cleanQuery, 600, 'título ou URL')

  const optional = await getOptionalTables(env)
  if (optional.pageAliases) {
    const aliasRows = await env.DB.prepare(`
      SELECT
        pages.slug,
        pages.title,
        pages.subtitle,
        page_aliases.alias_slug AS matchedSlug,
        page_aliases.alias_title AS matchedTitle,
        ('Alias: ' || page_aliases.alias_title) AS snippet,
        pages.updated_at AS updatedAt
      FROM page_aliases
      JOIN pages ON pages.id = page_aliases.page_id
      WHERE pages.status = 'published'
        AND (
          page_aliases.alias_title = ? COLLATE NOCASE
          OR page_aliases.alias_title LIKE ? ESCAPE '\\'
          OR page_aliases.alias_slug = ?
          OR page_aliases.alias_slug LIKE ? ESCAPE '\\'
        )
      ORDER BY page_aliases.alias_title COLLATE NOCASE ASC
      LIMIT 25
    `).bind(cleanQuery, prefix, canonical, canonicalPrefix).all()

    for (const row of aliasRows.results || []) mergeSearchResult(results, row, cleanQuery, 520, 'alias')
  }

  const redirectColumns = await getRedirectMetadataColumns(env)
  const redirectRows = redirectColumns.targetFragment
    ? await env.DB.prepare(`
      SELECT
        pages.slug,
        pages.title,
        pages.subtitle,
        redirects.from_slug AS matchedSlug,
        redirects.from_slug AS matchedTitle,
        COALESCE(redirects.target_fragment, '') AS targetFragment,
        ('Redirecionamento: ' || redirects.from_slug) AS snippet,
        pages.updated_at AS updatedAt
      FROM redirects
      JOIN pages ON pages.slug = redirects.to_slug
      WHERE pages.status = 'published'
        AND (
          redirects.from_slug = ?
          OR redirects.from_slug LIKE ? ESCAPE '\\'
        )
      ORDER BY redirects.from_slug COLLATE NOCASE ASC
      LIMIT 25
    `).bind(canonical, canonicalPrefix).all()
    : await env.DB.prepare(`
      SELECT
        pages.slug,
        pages.title,
        pages.subtitle,
        redirects.from_slug AS matchedSlug,
        redirects.from_slug AS matchedTitle,
        '' AS targetFragment,
        ('Redirecionamento: ' || redirects.from_slug) AS snippet,
        pages.updated_at AS updatedAt
      FROM redirects
      JOIN pages ON pages.slug = redirects.to_slug
      WHERE pages.status = 'published'
        AND (
          redirects.from_slug = ?
          OR redirects.from_slug LIKE ? ESCAPE '\\'
        )
      ORDER BY redirects.from_slug COLLATE NOCASE ASC
      LIMIT 25
    `).bind(canonical, canonicalPrefix).all()

  for (const row of redirectRows.results || []) mergeSearchResult(results, row, cleanQuery, 500, 'redirecionamento')

  const fts = ftsQuery(cleanQuery)

  if (fts) {
    try {
      const rows = await env.DB.prepare(`
        SELECT
          page_search.slug,
          page_search.title,
          page_search.subtitle,
          snippet(page_search, 4, '<mark>', '</mark>', '…', 16) AS snippet,
          pages.updated_at AS updatedAt
        FROM page_search
        JOIN pages ON pages.id = page_search.page_id
        WHERE page_search MATCH ? AND pages.status = 'published'
        ORDER BY rank
        LIMIT 35
      `).bind(fts).all()

      for (const row of rows.results || []) mergeSearchResult(results, row, cleanQuery, 260, 'conteúdo')
    } catch (cause) { throw cause }
  }

  const fallbackRows = await env.DB.prepare(`
    SELECT
      pages.slug,
      pages.title,
      pages.subtitle,
      substr(COALESCE(revisions.content_markdown, ''), 1, 260) AS snippet,
      pages.updated_at AS updatedAt
    FROM pages
    LEFT JOIN revisions ON revisions.id = pages.current_revision_id
    WHERE pages.status = 'published'
      AND (
        pages.title LIKE ? ESCAPE '\\'
        OR pages.slug LIKE ? ESCAPE '\\'
        OR COALESCE(pages.subtitle, '') LIKE ? ESCAPE '\\'
        OR COALESCE(revisions.content_markdown, '') LIKE ? ESCAPE '\\'
      )
    ORDER BY pages.title COLLATE NOCASE ASC
    LIMIT 35
  `).bind(like, canonicalLike, like, like).all()

  for (const row of fallbackRows.results || []) mergeSearchResult(results, row, cleanQuery, 80, 'texto')

  const settings = await getGlobalSettings(env)
  return Array.from(results.values())
    .filter((page: any) => pageVisibleWithSettings(page?.slug, settings))
    .sort((a: any, b: any) => {
      const score = Number(b.searchScore || 0) - Number(a.searchScore || 0)
      if (score) return score
      return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR')
    })
    .slice(0, 25)
}

export async function searchPageBatch(env: Env, query: string, offset = 0) {
  if (!env.DB) throw new EditorialError('armazenamento indisponível', 503)
  const clean = query.trim()
  if (!clean) return { results: [], total: 0, offset: 0, nextOffset: null }
  if (clean.length > 500) throw new EditorialError('consulta de busca longa demais', 400)
  offset = Math.max(0, Math.floor(Number(offset) || 0))
  const canonical = slugFromTitle(clean)
  const like = likeTerm(clean), canonicalLike = likeTerm(canonical), prefix = likePrefix(clean), canonicalPrefix = likePrefix(canonical)
  const fts = ftsQuery(clean)
  const visibility = pageVisibilitySql(await getGlobalSettings(env))
  const base = `WITH matching_aliases AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY alias_slug) AS match_number FROM page_aliases WHERE alias_title LIKE ? ESCAPE '\\' OR alias_slug LIKE ? ESCAPE '\\'
    ), matching_redirects AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY to_slug ORDER BY from_slug) AS match_number FROM redirects WHERE from_slug LIKE ? ESCAPE '\\'
    ), candidates AS (SELECT pages.id, pages.slug, pages.title, pages.subtitle, pages.updated_at AS updatedAt,
    substr(COALESCE(revisions.content_markdown, ''), 1, 260) AS snippet,
    COALESCE(matching_aliases.alias_title, matching_redirects.from_slug, pages.title) AS matchedTitle,
    COALESCE(matching_aliases.alias_slug, matching_redirects.from_slug, pages.slug) AS matchedSlug,
    CASE WHEN matching_aliases.page_id IS NULL THEN COALESCE(matching_redirects.target_fragment, '') ELSE '' END AS targetFragment
    FROM pages LEFT JOIN revisions ON revisions.id = pages.current_revision_id
    LEFT JOIN matching_aliases ON matching_aliases.page_id = pages.id AND matching_aliases.match_number = 1
    LEFT JOIN matching_redirects ON matching_redirects.to_slug = pages.slug AND matching_redirects.match_number = 1
    WHERE pages.status = 'published' AND ${visibility} AND (
      pages.title LIKE ? ESCAPE '\\' OR pages.slug LIKE ? ESCAPE '\\' OR COALESCE(pages.subtitle, '') LIKE ? ESCAPE '\\' OR COALESCE(revisions.content_markdown, '') LIKE ? ESCAPE '\\'
      OR matching_aliases.page_id IS NOT NULL OR matching_redirects.to_slug IS NOT NULL
      ${fts ? 'OR pages.id IN (SELECT page_id FROM page_search WHERE page_search MATCH ?)' : ''}
    ))`
  const bindings = [prefix, canonicalPrefix, canonicalPrefix, like, canonicalLike, like, like, ...(fts ? [fts] : [])]
  const count: any = await env.DB.prepare(base + ' SELECT COUNT(*) AS total FROM candidates').bind(...bindings).first()
  const total = Number(count?.total || 0)
  const preferred = (await searchPages(env, clean)).slice(0, 20)
  const preferredSlugs = preferred.map((page: any) => page.slug)
  const exclusion = (slugs: string[]) => slugs.length ? ` WHERE slug NOT IN (${slugs.map(() => '?').join(',')})` : ''
  if (preferred.length < 20) {
    const extra = await env.DB.prepare(base + ' SELECT * FROM candidates' + exclusion(preferredSlugs) + ' ORDER BY title COLLATE NOCASE, slug LIMIT ?').bind(...bindings, ...preferredSlugs, 20 - preferred.length).all()
    const merged = new Map()
    for (const row of extra.results) mergeSearchResult(merged, row, clean, 80, 'texto')
    preferred.push(...merged.values())
  }
  let results = preferred
  if (offset) {
    const slugs = preferred.map((page: any) => page.slug)
    const rows = await env.DB.prepare(base + ' SELECT * FROM candidates' + exclusion(slugs) + ' ORDER BY title COLLATE NOCASE, slug LIMIT 20 OFFSET ?').bind(...bindings, ...slugs, Math.max(0, offset - preferred.length)).all()
    const merged = new Map()
    for (const row of rows.results) mergeSearchResult(merged, row, clean, 80, 'texto')
    results = Array.from(merged.values())
  }
  return { results, total, offset, nextOffset: offset + results.length < total ? offset + results.length : null }
}

export type EditProposalInput = PageInput & {
  contact?: string
}

function rowToProposal(row: any) {
  if (!row) return null

  return {
    id: row.id,
    pageSlug: row.page_slug,
    currentRevisionId: row.current_revision_id || null,
    title: row.title,
    subtitle: row.subtitle || '',
    content: row.content_markdown || '',
    categories: parseJsonArray(row.categories_json),
    summary: row.summary || '',
    contact: row.contact || '',
    reporterIp: row.reporter_ip || '',
    userAgent: row.user_agent || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.effective_updated_at || row.updated_at,
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by_email || null,
    reviewedByName: row.reviewed_by_name || null,
    suggestionCreditMode: row.suggestion_credit_mode || 'contact'
  }
}

export async function createEditProposal(env: Env, slug: string, input: EditProposalInput, request: Request) {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const title = String(input.title || '').trim()
  const content = normalizeEscapedBlockNewlines(String(input.content || ''))
  const summary = String(input.summary || '').trim()
  const categories = Array.isArray(input.categories) ? input.categories : []
  const reporterIp = clientIpFromRequest(request)
  const userAgent = String(request.headers.get('user-agent') || '').slice(0, 500)
  const pageSlug = slugFromTitle(slug)
  if (isReservedFilePageSlug(pageSlug)) throw new EditorialError('o namespace /wiki/arquivo/ é reservado para uploads de mídia', 403)

  validatePageInput({ ...input, title, content, summary }, { requireSummary: true })

  const proposal = {
    id,
    pageSlug,
    title,
    subtitle: String(input.subtitle || '').trim(),
    content,
    categories,
    summary,
    contact: String(input.contact || '').trim(),
    reporterIp,
    userAgent,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewedBy: null
  }

  if (!env.DB) throw new EditorialError('armazenamento de propostas indisponível', 503)

  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reporterIp || 'unknown')))).map(value => value.toString(16).padStart(2, '0')).join('')
  const windowStart = Math.floor(Date.now() / 600000)
  const guardId = crypto.randomUUID()
  const statements = [
    env.DB.prepare('DELETE FROM proposal_rate_limits WHERE window_start < ?').bind(windowStart - 144),
    env.DB.prepare(`INSERT INTO proposal_rate_limits (client_hash, window_start, count) VALUES (?, ?, 1)
      ON CONFLICT(client_hash) DO UPDATE SET window_start = excluded.window_start,
      count = CASE WHEN proposal_rate_limits.window_start = excluded.window_start THEN proposal_rate_limits.count + 1 ELSE 1 END`).bind(hash, windowStart),
    env.DB.prepare('INSERT INTO core_write_guards (id, accepted) SELECT ?, CASE WHEN count <= 5 THEN 1 ELSE 0 END FROM proposal_rate_limits WHERE client_hash = ?').bind(guardId, hash),
    env.DB.prepare(`
    INSERT INTO edit_proposals (
      id,
      page_slug,
      title,
      subtitle,
      content_markdown,
      categories_json,
      summary,
      contact,
      status,
      reporter_ip,
      user_agent,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).bind(
    id,
    pageSlug,
    title,
    proposal.subtitle || null,
    content,
    JSON.stringify(categories),
    summary || 'proposta enviada por visitante',
    proposal.contact || null,
    reporterIp || null,
    userAgent || null,
    now,
    now
  ), env.DB.prepare('DELETE FROM core_write_guards WHERE id = ?').bind(guardId)]
  try { await env.DB.batch(statements) }
  catch (cause) {
    if (String(cause).includes('wiki_write_conflict')) throw new EditorialError('limite de propostas atingido; tente novamente mais tarde', 429)
    throw cause
  }

  return proposal
}

export async function listEditProposals(env: Env, status = 'pending') {
  if (!env.DB) return []

  const rows = await env.DB.prepare(`
    SELECT *, (SELECT current_revision_id FROM pages WHERE pages.slug = edit_proposals.page_slug) AS current_revision_id
    FROM edit_proposals
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(status).all()

  return (rows.results || []).map(rowToProposal).filter(Boolean)
}

export async function readEditProposal(env: Env, id: string) {
  if (!env.DB) return null
  const row = await env.DB.prepare('SELECT *, (SELECT current_revision_id FROM pages WHERE pages.slug = edit_proposals.page_slug) AS current_revision_id FROM edit_proposals WHERE id = ?').bind(id).first()
  return rowToProposal(row)
}

export async function approveEditProposal(env: Env, id: string, reviewerEmail: string, reviewerName: string | null = null, creditMode = 'contact', expectedRevisionId?: string | null) {
  const proposal = await readEditProposal(env, id)
  if (!proposal || proposal.status !== 'pending') return null

  const cleanMode = ['contact', 'ip', 'anonymous'].includes(String(creditMode || '')) ? String(creditMode) : 'contact'
  const profile: any = env.DB ? await env.DB.prepare('SELECT display_name FROM editor_profiles WHERE email = ?').bind(reviewerEmail).first() : null
  const baseName = String(profile?.display_name || reviewerName || 'editor').trim() || 'editor'
  const suggestedBy = cleanMode === 'anonymous'
    ? 'um anônimo'
    : cleanMode === 'ip'
      ? proposal.reporterIp || 'IP não informado'
      : proposal.contact || proposal.reporterIp || 'um anônimo'
  const revisionAuthorName = `${baseName} (Sugerido por ${suggestedBy})`

  const page = await writePage(env, proposal.pageSlug, {
    expectedRevisionId: expectedRevisionId === undefined ? proposal.currentRevisionId : expectedRevisionId,
    title: proposal.title,
    subtitle: proposal.subtitle,
    content: proposal.content,
    categories: proposal.categories,
    summary: proposal.summary || 'proposta de edição aprovada'
  }, reviewerEmail, revisionAuthorName, { id, reviewerName: baseName, creditMode: cleanMode })

  return { proposal: { ...proposal, status: 'approved' }, page }
}

export async function rejectEditProposal(env: Env, id: string, reviewerEmail: string) {
  const proposal = await readEditProposal(env, id)
  if (!proposal || proposal.status !== 'pending') return null

  const now = new Date().toISOString()
  const rejected: any = await env.DB!.prepare(`
    UPDATE edit_proposals
    SET status = 'rejected', reviewed_by_email = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ? AND status = 'pending' RETURNING *
  `).bind(reviewerEmail, now, now, id).first()

  if (!rejected) throw new EditorialError('a proposta já foi revisada')
  return rowToProposal(rejected)
}


function cleanBackupRows(rows: any) {
  return (rows?.results || []).map((row: any) => ({ ...row }))
}

async function tableRows(env: Env, table: string) {
  if (!env.DB) return []
  const rows = await env.DB.prepare(`SELECT * FROM ${table}`).all()
  return cleanBackupRows(rows)
}

async function publishedPageSlugSet(env: Env) {
  const rows = await env.DB!.prepare("SELECT slug FROM pages WHERE status = 'published'").all()
  return new Set((rows.results || []).map((row: any) => String(row.slug || '')).filter(Boolean))
}

async function knownContentSlugSet(env: Env) {
  const known = await publishedPageSlugSet(env)

  const categories = await env.DB!.prepare('SELECT slug FROM categories').all()
  for (const row of categories.results || []) known.add(`categoria/${(row as any).slug}`)

  const redirectsRows = await env.DB!.prepare('SELECT from_slug FROM redirects').all()
  for (const row of redirectsRows.results || []) known.add((row as any).from_slug)

  const optional = await getOptionalTables(env)
  if (optional.pageAliases) {
    const aliasRows = await env.DB!.prepare('SELECT alias_slug FROM page_aliases').all()
    for (const row of aliasRows.results || []) known.add((row as any).alias_slug)
  }

  try {
    const uploadColumns = await getUploadMetadataColumns(env)
    const uploadRows = uploadColumns.fileSlug
      ? await env.DB!.prepare('SELECT file_slug AS slug FROM uploads').all()
      : await env.DB!.prepare('SELECT id AS slug FROM uploads').all()
    for (const row of uploadRows.results || []) known.add(`arquivo/${(row as any).slug}`)
  } catch {}

  for (const slug of ['pagina-principal', 'especial', 'especial/todas-as-paginas', 'especial/paginas-recentes', 'especial/pagina-aleatoria', 'especial/categorias', 'especial/versao']) known.add(slug)
  return known
}

function extractInternalLinks(content = '') {
  const links: Array<{ slug: string, label: string }> = []
  const text = String(content || '')
  const wikiRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g
  let match: RegExpExecArray | null

  while ((match = wikiRegex.exec(text))) {
    const raw = String(match[1] || '').trim()
    const label = String(match[2] || raw).trim()
    if (!raw) continue

    const namespaceMatch = raw.match(/^([^:]+):(.+)$/)
    if (namespaceMatch) {
      const namespace = slugFromTitle(namespaceMatch[1])
      const name = namespaceMatch[2].trim()
      if (namespace === 'categoria') links.push({ slug: `categoria/${slugFromTitle(name)}`, label })
      else if (namespace === 'arquivo') links.push({ slug: `arquivo/${slugFromTitle(name)}`, label })
      else links.push({ slug: slugFromTitle(raw), label })
    } else {
      links.push({ slug: slugFromTitle(raw), label })
    }
  }

  const urlRegex = /\]\(\/wiki\/([^\)#]+)(?:#[^\)]*)?\)/g
  while ((match = urlRegex.exec(text))) {
    const slug = decodeURIComponent(String(match[1] || '').trim()).replace(/^\/+|\/+$/g, '')
    if (slug) links.push({ slug, label: slug })
  }

  return links.filter(link => link.slug && !link.slug.startsWith('http'))
}

export async function listAdminPages(env: Env, options: PageListOptions = {}) {
  return listPages(env, { ...options, includeDeleted: true, limit: options.limit || 1000 })
}

export async function setPageLock(env: Env, slug: string, locked: boolean, authorEmail: string) {
  if (!env.DB) return null
  const page = await findStoredPageSlug(env, slug, 'any', { preferCanonical: false })
  if (!page || page.status === 'deleted') return null
  const now = new Date().toISOString()

  const result = await env.DB.prepare(`
    UPDATE pages
    SET is_locked = ?, updated_at = ?
    WHERE id = ? AND status != 'deleted'
  `).bind(locked ? 1 : 0, now, page.id).run()

  if (!result.meta?.changes) return null
  return { ok: true, slug: page.slug, isLocked: locked, updatedAt: now, updatedByEmail: authorEmail }
}

export async function renamePage(env: Env, slug: string, input: { title?: string, slug?: string, summary?: string }, authorEmail: string) {
  if (!env.DB) return null
  const statements: D1PreparedStatement[] = []
  const title = String(input.title || '').trim()
  const newSlug = slugFromTitle(input.slug || title)
  if (!newSlug || !title) throw new EditorialError('payload inválido', 400)
  if (isReservedFilePageSlug(newSlug)) throw new EditorialError('o namespace /wiki/arquivo/ é reservado para uploads de mídia', 403)

  const stored = await findStoredPageSlug(env, slug, 'published', { preferCanonical: false })
  if (!stored) return null

  const page: any = await env.DB.prepare(`
    SELECT pages.*, revisions.content_markdown AS content
    FROM pages
    LEFT JOIN revisions ON revisions.id = pages.current_revision_id
    WHERE pages.id = ? AND pages.status = 'published'
    LIMIT 1
  `).bind(stored.id).first()

  if (!page) return null

  const oldSlug = String(page.slug || '')
  const view: any = await hydratePage(env, page)
  if (newSlug !== oldSlug) {
    const conflict = await env.DB.prepare('SELECT id FROM pages WHERE slug = ? AND id != ?').bind(newSlug, page.id).first()
    if (conflict) throw new EditorialError('já existe uma página com esse slug', 409)
  }

  const now = new Date().toISOString()
  statements.push(env.DB.prepare('UPDATE pages SET slug = ?, title = ?, updated_at = ? WHERE id = ?').bind(newSlug, title, now, page.id))

  if (newSlug !== oldSlug) {
    statements.push(env.DB.prepare('UPDATE redirects SET to_slug = ? WHERE to_slug = ?').bind(newSlug, oldSlug))
    statements.push(env.DB.prepare('DELETE FROM redirects WHERE from_slug = ?').bind(newSlug))
    statements.push(env.DB.prepare(`
      INSERT INTO redirects (id, from_slug, to_slug, created_by_email, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(from_slug) DO UPDATE SET to_slug = excluded.to_slug, created_by_email = excluded.created_by_email, created_at = excluded.created_at
    `).bind(crypto.randomUUID(), oldSlug, newSlug, authorEmail, now))
  }

  const optional = await getOptionalTables(env)
  if (optional.pageAliases) {
    statements.push(env.DB.prepare('DELETE FROM page_aliases WHERE alias_slug = ?').bind(newSlug))
  }

  await syncSearch(env, page.id, {
    title,
    subtitle: page.subtitle || '',
    content: normalizeEscapedBlockNewlines(page.content || ''),
    summary: input.summary || `renomeada de ${oldSlug} para ${newSlug}`
  }, newSlug, statements)

  if (statements.length) await commitPageState(env, page.id, 'published', statements, page.current_revision_id, { slug: oldSlug, title: page.title })
  const redirectRules = view.redirectRules.filter((rule: any) => rule.fromSlug !== newSlug)
  if (newSlug !== oldSlug) redirectRules.push({ fromSlug: oldSlug, fragment: '' })
  return { ...view, slug: newSlug, title, updatedAt: now, aliases: view.aliases.filter((alias: any) => alias.slug !== newSlug), redirectRules, redirects: redirectRules.map((rule: any) => rule.fromSlug) }
}

export async function listBrokenPageLinks(env: Env) {
  if (!env.DB) return []
  const known = await knownContentSlugSet(env)
  const rows = await env.DB.prepare(`
    SELECT pages.slug, pages.title, revisions.content_markdown AS content
    FROM pages
    LEFT JOIN revisions ON revisions.id = pages.current_revision_id
    WHERE pages.status = 'published'
    ORDER BY pages.title COLLATE NOCASE ASC
  `).all()

  const broken = new Map<string, any>()
  for (const row of rows.results || []) {
    const fromSlug = String((row as any).slug || '')
    const fromTitle = String((row as any).title || fromSlug)
    for (const link of extractInternalLinks(String((row as any).content || ''))) {
      if (known.has(link.slug)) continue
      const key = `${fromSlug}\n${link.slug}`
      const current = broken.get(key) || { fromSlug, fromTitle, toSlug: link.slug, label: link.label, count: 0 }
      current.count += 1
      broken.set(key, current)
    }
  }

  return Array.from(broken.values()).sort((a, b) => a.fromTitle.localeCompare(b.fromTitle, 'pt-BR') || a.toSlug.localeCompare(b.toSlug, 'pt-BR'))
}

export async function listAdvancedRedirects(env: Env) {
  if (!env.DB) return { redirects: [], aliases: [] }

  const columns = await getRedirectMetadataColumns(env)
  const redirectRows = columns.targetFragment
    ? await env.DB.prepare(`
      SELECT
        redirects.id,
        redirects.from_slug AS fromSlug,
        redirects.to_slug AS toSlug,
        COALESCE(redirects.target_fragment, '') AS fragment,
        pages.title AS targetTitle,
        redirects.created_by_email AS createdByEmail,
        redirects.created_at AS createdAt
      FROM redirects
      LEFT JOIN pages ON pages.slug = redirects.to_slug AND pages.status = 'published'
      ORDER BY redirects.from_slug COLLATE NOCASE ASC
    `).all()
    : await env.DB.prepare(`
      SELECT
        redirects.id,
        redirects.from_slug AS fromSlug,
        redirects.to_slug AS toSlug,
        '' AS fragment,
        pages.title AS targetTitle,
        redirects.created_by_email AS createdByEmail,
        redirects.created_at AS createdAt
      FROM redirects
      LEFT JOIN pages ON pages.slug = redirects.to_slug AND pages.status = 'published'
      ORDER BY redirects.from_slug COLLATE NOCASE ASC
    `).all()

  const optional = await getOptionalTables(env)
  const aliasRows = optional.pageAliases
    ? await env.DB.prepare(`
      SELECT
        page_aliases.id,
        page_aliases.alias_slug AS aliasSlug,
        page_aliases.alias_title AS aliasTitle,
        pages.slug AS toSlug,
        pages.title AS targetTitle,
        page_aliases.created_at AS createdAt
      FROM page_aliases
      JOIN pages ON pages.id = page_aliases.page_id
      WHERE pages.status = 'published'
      ORDER BY page_aliases.alias_title COLLATE NOCASE ASC
    `).all()
    : { results: [] as any[] }

  return {
    redirects: redirectRows.results || [],
    aliases: aliasRows.results || []
  }
}

export async function saveAdvancedRedirect(env: Env, input: { fromSlug?: string, toSlug?: string, fragment?: string }, authorEmail: string) {
  if (!env.DB) return null
  const statements: D1PreparedStatement[] = []

  const fromSlug = slugFromTitle(input.fromSlug || '')
  const toSlug = slugFromTitle(input.toSlug || '')
  const fragment = cleanRedirectFragment(input.fragment)
  if (!fromSlug || !toSlug) throw new EditorialError('origem e destino são obrigatórios', 400)
  if (isReservedFilePageSlug(fromSlug)) throw new EditorialError('o namespace /wiki/arquivo/ é reservado para uploads de mídia', 403)
  if (fromSlug === toSlug && !fragment) throw new EditorialError('o redirecionamento não pode apontar para ele mesmo', 400)

  const target = await env.DB.prepare("SELECT id, slug, title FROM pages WHERE slug = ? AND status = 'published'").bind(toSlug).first()
  if (!target) throw new EditorialError('a página de destino não existe', 400)

  const sourcePage = await env.DB.prepare("SELECT id FROM pages WHERE slug = ? AND status != 'deleted'").bind(fromSlug).first()
  if (sourcePage) throw new EditorialError('a origem já pertence a uma página publicada', 409)

  const optional = await getOptionalTables(env)
  if (optional.pageAliases) statements.push(env.DB.prepare('DELETE FROM page_aliases WHERE alias_slug = ?').bind(fromSlug))

  const now = new Date().toISOString()
  const columns = await getRedirectMetadataColumns(env)
  if (columns.targetFragment) {
    statements.push(env.DB.prepare(`
      INSERT INTO redirects (id, from_slug, to_slug, target_fragment, created_by_email, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(from_slug) DO UPDATE SET
        to_slug = excluded.to_slug,
        target_fragment = excluded.target_fragment,
        created_by_email = excluded.created_by_email,
        created_at = excluded.created_at
    `).bind(crypto.randomUUID(), fromSlug, toSlug, fragment || null, authorEmail || null, now))
  } else {
    statements.push(env.DB.prepare(`
      INSERT INTO redirects (id, from_slug, to_slug, created_by_email, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(from_slug) DO UPDATE SET
        to_slug = excluded.to_slug,
        created_by_email = excluded.created_by_email,
        created_at = excluded.created_at
    `).bind(crypto.randomUUID(), fromSlug, toSlug, authorEmail || null, now))
  }

  if (statements.length) await env.DB.batch(statements)
  return { ok: true, fromSlug, toSlug, fragment, targetTitle: (target as any).title, createdAt: now }
}

export async function deleteAdvancedRedirect(env: Env, fromSlugValue: string) {
  if (!env.DB) return null
  const fromSlug = slugFromTitle(fromSlugValue)
  if (!fromSlug) return null
  const result = await env.DB.prepare('DELETE FROM redirects WHERE from_slug = ?').bind(fromSlug).run()
  return { ok: Boolean(result.meta?.changes), fromSlug }
}

export async function saveAdvancedAlias(env: Env, input: { aliasTitle?: string, toSlug?: string }) {
  if (!env.DB) return null
  const statements: D1PreparedStatement[] = []
  const optional = await getOptionalTables(env)
  if (!optional.pageAliases) throw new EditorialError('aliases ainda não estão disponíveis no D1', 503)

  const aliasTitle = String(input.aliasTitle || '').trim()
  const aliasSlug = slugFromTitle(aliasTitle)
  const toSlug = slugFromTitle(input.toSlug || '')
  if (!aliasTitle || !aliasSlug || !toSlug) throw new EditorialError('alias e destino são obrigatórios', 400)
  if (isReservedFilePageSlug(aliasSlug)) throw new EditorialError('o namespace /wiki/arquivo/ é reservado para uploads de mídia', 403)

  const target: any = await env.DB.prepare("SELECT id, slug, title FROM pages WHERE slug = ? AND status = 'published'").bind(toSlug).first()
  if (!target) throw new EditorialError('a página de destino não existe', 400)
  if (aliasSlug === toSlug) throw new EditorialError('o alias não pode ser igual à URL canônica', 400)

  const sourcePage = await env.DB.prepare("SELECT id FROM pages WHERE slug = ? AND status != 'deleted'").bind(aliasSlug).first()
  if (sourcePage) throw new EditorialError('o alias já pertence a uma página publicada', 409)

  statements.push(env.DB.prepare('DELETE FROM redirects WHERE from_slug = ?').bind(aliasSlug))
  const now = new Date().toISOString()
  statements.push(env.DB.prepare(`
    INSERT INTO page_aliases (id, page_id, alias_slug, alias_title, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(alias_slug) DO UPDATE SET
      page_id = excluded.page_id,
      alias_title = excluded.alias_title,
      created_at = excluded.created_at
  `).bind(crypto.randomUUID(), target.id, aliasSlug, aliasTitle, now))

  if (statements.length) await env.DB.batch(statements)
  return { ok: true, aliasSlug, aliasTitle, toSlug, targetTitle: target.title, createdAt: now }
}

export async function deleteAdvancedAlias(env: Env, aliasSlugValue: string) {
  if (!env.DB) return null
  const aliasSlug = slugFromTitle(aliasSlugValue)
  if (!aliasSlug) return null
  const result = await env.DB.prepare('DELETE FROM page_aliases WHERE alias_slug = ?').bind(aliasSlug).run()
  return { ok: Boolean(result.meta?.changes), aliasSlug }
}

export async function listBrokenRedirects(env: Env) {
  if (!env.DB) return []
  const columns = await getRedirectMetadataColumns(env)
  const rows = columns.targetFragment
    ? await env.DB.prepare(`
      SELECT redirects.from_slug AS fromSlug, redirects.to_slug AS toSlug, COALESCE(redirects.target_fragment, '') AS fragment, redirects.created_by_email AS createdByEmail, redirects.created_at AS createdAt
      FROM redirects
      LEFT JOIN pages ON pages.slug = redirects.to_slug AND pages.status = 'published'
      WHERE pages.id IS NULL OR (redirects.from_slug = redirects.to_slug AND COALESCE(redirects.target_fragment, '') = '')
      ORDER BY redirects.from_slug COLLATE NOCASE ASC
    `).all()
    : await env.DB.prepare(`
      SELECT redirects.from_slug AS fromSlug, redirects.to_slug AS toSlug, '' AS fragment, redirects.created_by_email AS createdByEmail, redirects.created_at AS createdAt
      FROM redirects
      LEFT JOIN pages ON pages.slug = redirects.to_slug AND pages.status = 'published'
      WHERE pages.id IS NULL OR redirects.from_slug = redirects.to_slug
      ORDER BY redirects.from_slug COLLATE NOCASE ASC
    `).all()

  return rows.results || []
}

export async function maintenanceReport(env: Env) {
  const [brokenLinks, brokenRedirects] = await Promise.all([
    listBrokenPageLinks(env),
    listBrokenRedirects(env)
  ])

  return { brokenLinks, brokenRedirects }
}

export async function exportBackup(env: Env) {
  if (!env.DB) return null
  const tables = {
    pages: await tableRows(env, 'pages'),
    revisions: await tableRows(env, 'revisions'),
    redirects: await tableRows(env, 'redirects'),
    categories: await tableRows(env, 'categories'),
    page_categories: await tableRows(env, 'page_categories'),
    page_links: await tableRows(env, 'page_links'),
    uploads: await tableRows(env, 'uploads'),
    system_settings: await tableRows(env, 'system_settings'),
    page_aliases: [] as any[]
  }

  const optional = await getOptionalTables(env)
  if (optional.pageAliases) tables.page_aliases = await tableRows(env, 'page_aliases')

  return {
    kind: 'wikicambada-core-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    scope: 'content-export',
    recovery: false,
    note: 'Exportação de conteúdo para seed. A importação cria revisões e não restaura uma instalação.',
    tables
  }
}

function rowsFromSeedPayload(payload: any) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.pages)) return payload.pages
  if (Array.isArray(payload?.tables?.pages)) {
    return payload.tables.pages.filter((page: any) => page.status !== 'deleted').map((page: any) => {
      const revision = (payload.tables.revisions || []).find((item: any) => item.id === page.current_revision_id) || (payload.tables.revisions || [])
        .filter((item: any) => item.page_id === page.id)
        .sort((a: any, b: any) => Number(b.revision_number || 0) - Number(a.revision_number || 0))[0]
      const categoryIds = new Set((payload.tables.page_categories || []).filter((item: any) => item.page_id === page.id).map((item: any) => item.category_id))
      const categories = (payload.tables.categories || []).filter((category: any) => categoryIds.has(category.id)).map((category: any) => category.name)
      const aliases = (payload.tables.page_aliases || []).filter((alias: any) => alias.page_id === page.id).map((alias: any) => alias.alias_title || alias.alias_slug)
      const redirects = (payload.tables.redirects || []).filter((redirect: any) => redirect.to_slug === page.slug).map((redirect: any) => redirect.from_slug)
      return {
        slug: page.slug,
        title: page.title,
        subtitle: page.subtitle || '',
        content: revision?.content_markdown || '',
        categories,
        aliases,
        redirects,
        redirectRules: (payload.tables.redirects || []).filter((redirect: any) => redirect.to_slug === page.slug).map((redirect: any) => ({ fromSlug: redirect.from_slug, fragment: redirect.target_fragment || '' })),
        summary: 'importado de exportação de conteúdo'
      }
    })
  }
  return []
}

export async function importSeed(env: Env, payload: any, authorEmail: string) {
  if (!env.DB) return null
  const sourceRows = rowsFromSeedPayload(payload)
  if (!sourceRows.length) throw new EditorialError('nenhuma página válida para importar', 400)
  const rows = sourceRows.filter((row: any) => row && row.slug && row.title && (row.content || row.content_markdown))
  if (rows.length !== sourceRows.length) throw new EditorialError('o seed contém páginas incompletas', 400)
  const imported: any[] = []
  const failed: any[] = []

  for (const row of rows) {
    try {
      const slug = slugFromTitle(row.slug || row.title)
      const page = await writePage(env, slug, {
        title: String(row.title || '').trim(),
        subtitle: String(row.subtitle || ''),
        content: String(row.content || row.content_markdown || ''),
        categories: Array.isArray(row.categories) ? row.categories : [],
        aliases: Array.isArray(row.aliases) ? row.aliases : [],
        redirects: Array.isArray(row.redirects) ? row.redirects : [],
        ...(Array.isArray(row.redirectRules) ? { redirectRules: row.redirectRules } : {}),
        summary: String(row.summary || 'importado de seed')
      }, authorEmail, null)
      imported.push({ slug: page?.slug || slug, title: page?.title || row.title })
    } catch (error) {
      failed.push({ slug: row.slug || row.title || 'sem-slug', error: error instanceof EditorialError ? error.message : 'falha temporária de armazenamento' })
    }
  }

  return { ok: failed.length === 0, imported, failed }
}


type ContentTemplateRow = {
  id: string
  slug: string
  title: string
  description?: string | null
  group_name?: string | null
  content_markdown: string
  render_markdown?: string | null
  params_markdown?: string | null
  template_kind?: string | null
  image_url?: string | null
  image_position?: string | null
  accent_color?: string | null
  min_role?: string | null
  status?: string | null
  created_by_email?: string | null
  updated_by_email?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type ContentTemplateInput = {
  id?: string
  slug?: string
  title?: string
  description?: string
  groupName?: string
  content?: string
  contentMarkdown?: string
  call?: string
  render?: string
  renderMarkdown?: string
  params?: string
  paramsMarkdown?: string
  kind?: string
  imageUrl?: string
  imagePosition?: string
  accentColor?: string
  minRole?: string
  status?: string
}

const templateRoleOrder: Record<string, number> = {
  guest: 0,
  editor: 10,
  moderator: 20,
  admin: 30,
  super_admin: 40
}

const templateExtraColumns = [
  'render_markdown',
  'params_markdown',
  'template_kind',
  'image_url',
  'image_position',
  'accent_color'
]

function normalizeTemplateRole(value: string | null | undefined) {
  const clean = String(value || '').trim().toLowerCase()
  if (clean === 'super_admin') return 'super_admin'
  if (clean === 'admin') return 'admin'
  if (clean === 'moderator') return 'moderator'
  if (clean === 'editor') return 'editor'
  return 'guest'
}

function normalizeTemplateStatus(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase() === 'disabled' ? 'disabled' : 'active'
}

function normalizeTemplateKind(value: string | null | undefined) {
  const clean = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  return clean || 'custom'
}

function normalizeImagePosition(value: string | null | undefined) {
  const clean = String(value || '').trim().toLowerCase()
  if (clean === 'right' || clean === 'top') return clean
  return 'left'
}

function templateAllowedForRole(template: any, role = 'guest') {
  const userLevel = templateRoleOrder[normalizeTemplateRole(role)] ?? 0
  const neededLevel = templateRoleOrder[normalizeTemplateRole(template.minRole)] ?? 0
  return userLevel >= neededLevel
}

function defaultContentTemplates() {
  const now = new Date().toISOString()
  return [
    {
      id: 'default-delete-candidate',
      slug: 'candidato-a-exclusao',
      title: 'Candidato à exclusão',
      description: 'Predefinição de eliminação com motivo, imagem lateral, autor, data e link de discussão.',
      groupName: 'Manutenção',
      kind: 'delete',
      params: 'motivo: motivo exibido no aviso\nautor: pessoa que marcou a página\ndata: data do aviso\nimagem: imagem lateral opcional\ndiscussao: página discutida',
      call: '{{Candidato à exclusão\n|motivo=descreva o motivo\n|autor=\n|data=\n|imagem=\n}}',
      render: ':::templatebox delete\ntitle: Esta página é candidata à eliminação\nsubtitle: Motivo: **{{{motivo|nenhum motivo informado}}}** {{{autor|}}} {{{data|}}}\nimage: {{{imagem|}}}\nicon: 🗑️\naccent: #e04444\n\nSe discordar, explique o motivo na página de discussão antes de remover este aviso.\n\nLembre-se de verificar o que aponta para esta página antes de deletar.\n:::',
      imageUrl: '',
      imagePosition: 'left',
      accentColor: '#e04444',
      minRole: 'guest',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      source: 'default'
    },
    {
      id: 'default-multiple-issues',
      slug: 'multiplos-problemas',
      title: 'Múltiplos problemas',
      description: 'Predefinição de manutenção com lista de problemas, ícone/imagem e parâmetros booleanos.',
      groupName: 'Manutenção',
      kind: 'issues',
      params: 'fontes: sim/não\nreferencias: sim/não\nrevisao: sim/não\nnao_enciclopedico: sim/não\nconfuso: sim/não\nimagem: imagem lateral opcional',
      call: '{{Múltiplos problemas\n|fontes=sim\n|referencias=sim\n|revisao=sim\n|nao_enciclopedico=sim\n|imagem=\n}}',
      render: ':::templatebox issues\ntitle: Foram assinalados vários problemas nesta página ou seção\nimage: {{{imagem|}}}\nicon: ⚠️\naccent: #d18a28\n\n- As fontes **não cobrem todo o texto**.\n- Necessita de **fontes secundárias fiáveis** publicadas por terceiros.\n- Texto necessita de **revisão**, devido a inconsistências ou dados de confiabilidade duvidosa.\n- O conteúdo pode ser de **natureza não enciclopédica**.\n\nDiscuta na página de discussão antes de remover este template.\n:::',
      imageUrl: '',
      imagePosition: 'left',
      accentColor: '#d18a28',
      minRole: 'guest',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      source: 'default'
    },
    {
      id: 'default-sources',
      slug: 'fontes-nao-cobrem-tudo',
      title: 'Fontes não cobrem tudo',
      description: 'Aviso compacto para artigos com fontes insuficientes.',
      groupName: 'Manutenção',
      kind: 'sources',
      params: 'data: mês e ano\nimagem: imagem lateral opcional',
      call: '{{Fontes não cobrem tudo|data=junho de 2026|imagem=}}',
      render: ':::templatebox sources\ntitle: Esta página cita fontes, mas que não cobrem todo o conteúdo\nimage: {{{imagem|}}}\nicon: 📖\naccent: #3f6fa8\ncompact: sim\n\nAjude a inserir referências confiáveis. {{{data|}}}\n:::',
      imageUrl: '',
      imagePosition: 'left',
      accentColor: '#3f6fa8',
      minRole: 'guest',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      source: 'default'
    },
    {
      id: 'default-merge',
      slug: 'fundir-com',
      title: 'Fundir com',
      description: 'Aviso compacto para fusão de artigo ou seção com outra página.',
      groupName: 'Manutenção',
      kind: 'merge',
      params: '1/artigo: artigo de destino\ndata: mês e ano\nimagem: imagem lateral opcional',
      call: '{{Fundir com|Nome do artigo|data=junho de 2026|imagem=}}',
      render: ':::templatebox merge\ntitle: Este artigo ou seção deverá ser fundido com [[{{{1|Nome do artigo}}}]]\nimage: {{{imagem|}}}\nicon: 🔀\naccent: #3f6fa8\ncompact: sim\n\nSe discorda, discuta sobre a fusão na página de discussão daquele artigo. {{{data|}}}\n:::',
      imageUrl: '',
      imagePosition: 'left',
      accentColor: '#3f6fa8',
      minRole: 'guest',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      source: 'default'
    },
    {
      id: 'default-stub',
      slug: 'esboco',
      title: 'Esboço',
      description: 'Aviso compacto para artigo curto que precisa ser expandido.',
      groupName: 'Manutenção',
      kind: 'stub',
      params: '1/tema: tema do esboço\nimagem: imagem lateral opcional',
      call: '{{Esboço|artigo|imagem=}}',
      render: ':::templatebox stub\ntitle: Este artigo ainda é um esboço\nimage: {{{imagem|}}}\nicon: 🧩\naccent: #777777\ncompact: sim\n\nVocê pode ajudar esta wiki expandindo este {{{1|artigo}}}.\n:::',
      imageUrl: '',
      imagePosition: 'left',
      accentColor: '#777777',
      minRole: 'guest',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      source: 'default'
    },
    {
      id: 'default-infobox',
      slug: 'infobox',
      title: 'Infobox',
      description: 'Predefinição lateral para dados resumidos de um artigo. Sistema de templates em fase de testes.',
      groupName: 'Layout',
      kind: 'infobox',
      params: `titulo: título exibido na infobox
imagem/imagem2: uma ou mais imagens
legenda/legenda2: legenda correspondente
subtitulo: subtítulo opcional
qualquer outro campo: vira uma linha livre na infocaixa, preservando acentos e caixa`,
      call: `{{Infobox
|titulo=Nome
|imagem=/api/files/arquivo/content
|legenda=Legenda da imagem
|imagem2=/api/files/outra-versao/content
|legenda2=Outra variação
|Tipo=tipo ou categoria
|Criador=alguém
|Data=2026
|Campo livre=valor livre
}}`,
      render: `:::infobox
title: {{{titulo|Nome}}}
image: {{{imagem|}}}
caption: {{{legenda|}}}
image2: {{{imagem2|}}}
caption2: {{{legenda2|}}}
Tipo: {{{tipo|}}}
Criador: {{{criador|}}}
Data: {{{data|}}}
Campo livre: {{{campo livre|}}}
:::`,
      imageUrl: '',
      imagePosition: 'right',
      accentColor: '#3f6fa8',
      minRole: 'guest',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      source: 'default'
    },
    {
      id: 'default-background',
      slug: 'fundo-de-secao',
      title: 'Fundo de seção',
      description: 'Bloco com cor, gradiente ou imagem de fundo.',
      groupName: 'Layout',
      kind: 'layout',
      params: 'titulo: título do bloco\ncor: cor de fundo\ngradiente: gradiente CSS seguro\nimagem: imagem de fundo',
      call: ':::background\ntitle: Seção destacada\ncolor: #f8f9fa\ngradient: linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.65))\nimage: \n\nConteúdo da seção com fundo.\n:::',
      render: '',
      imageUrl: '',
      imagePosition: 'top',
      accentColor: '',
      minRole: 'editor',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      source: 'default'
    },
    {
      id: 'default-side-image',
      slug: 'imagem-lateral',
      title: 'Imagem lateral',
      description: 'Miniatura lateral com legenda e página de arquivo.',
      groupName: 'Mídia',
      kind: 'media',
      params: 'src: url da imagem\ncaption: legenda\ndetails: página do arquivo\nalign: left/right/center',
      call: ':::thumb\nsrc: /api/files/arquivo/content\nalt: descrição da imagem\ncaption: legenda da imagem\ndetails: /wiki/arquivo/arquivo\nalign: right\nwidth: 260\n:::',
      render: '',
      imageUrl: '',
      imagePosition: 'right',
      accentColor: '',
      minRole: 'guest',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      source: 'default'
    },
    {
      id: 'default-video',
      slug: 'video',
      title: 'Vídeo incorporado',
      description: 'Bloco de vídeo para arquivo direto ou YouTube.',
      groupName: 'Mídia',
      kind: 'media',
      params: `src/youtube: link do vídeo
titulo: título opcional
legenda: legenda opcional`,
      call: `:::video
youtube: https://youtu.be/id-do-video
title: Título do vídeo
caption: Legenda do vídeo
:::`,
      render: '',
      imageUrl: '',
      imagePosition: 'top',
      accentColor: '',
      minRole: 'guest',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      source: 'default'
    }
  ]
}

async function getContentTemplateColumns(env: Env) {
  if (!env.DB || !await hasContentTemplatesTable(env)) return new Set<string>()
  const rows = await env.DB.prepare('PRAGMA table_info(content_templates)').all()
  return new Set((rows.results || []).map((row: any) => String(row.name)))
}

function templateRowToTemplate(row: ContentTemplateRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    groupName: row.group_name || 'Geral',
    content: normalizeEscapedBlockNewlines(row.content_markdown || ''),
    call: normalizeEscapedBlockNewlines(row.content_markdown || ''),
    render: normalizeEscapedBlockNewlines(row.render_markdown || ''),
    renderMarkdown: normalizeEscapedBlockNewlines(row.render_markdown || ''),
    params: normalizeEscapedBlockNewlines(row.params_markdown || ''),
    kind: normalizeTemplateKind(row.template_kind || 'custom'),
    imageUrl: row.image_url || '',
    imagePosition: normalizeImagePosition(row.image_position),
    accentColor: row.accent_color || '',
    minRole: normalizeTemplateRole(row.min_role),
    status: normalizeTemplateStatus(row.status),
    createdByEmail: row.created_by_email || '',
    updatedByEmail: row.updated_by_email || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    source: 'd1'
  }
}

function cleanTemplateInput(input: ContentTemplateInput) {
  const title = String(input.title || '').trim()
  const call = normalizeEscapedBlockNewlines(String(input.call ?? input.contentMarkdown ?? input.content ?? '')).trim()
  const render = normalizeEscapedBlockNewlines(String(input.renderMarkdown ?? input.render ?? '')).trim()
  if (!title) throw new EditorialError('título do template ausente', 400)
  if (!call) throw new EditorialError('chamada do template ausente', 400)

  const slug = slugFromTitle(input.slug || title)
  if (!slug) throw new EditorialError('slug do template inválido', 400)

  return {
    id: String(input.id || '').trim(),
    slug,
    title,
    description: String(input.description || '').trim(),
    groupName: String(input.groupName || 'Geral').trim() || 'Geral',
    call,
    render,
    params: normalizeEscapedBlockNewlines(String(input.paramsMarkdown ?? input.params ?? '')).trim(),
    kind: normalizeTemplateKind(input.kind),
    imageUrl: String(input.imageUrl || '').trim(),
    imagePosition: normalizeImagePosition(input.imagePosition),
    accentColor: String(input.accentColor || '').trim(),
    minRole: normalizeTemplateRole(input.minRole),
    status: normalizeTemplateStatus(input.status)
  }
}

async function hasContentTemplatesTable(env: Env) {
  return Boolean(env.DB) && await tableExists(env, 'content_templates')
}

async function seedContentTemplates(env: Env) {
  if (!env.DB || !await hasContentTemplatesTable(env)) return
  const existing: any = await env.DB.prepare('SELECT COUNT(*) AS count FROM content_templates').first()
  if (Number(existing?.count || 0) > 0) return

  const columns = await getContentTemplateColumns(env)
  const hasExtras = templateExtraColumns.every(column => columns.has(column))
  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = []
  for (const template of defaultContentTemplates()) {
    if (hasExtras) {
      statements.push(env.DB.prepare(`
        INSERT INTO content_templates (id, slug, title, description, group_name, content_markdown, render_markdown, params_markdown, template_kind, image_url, image_position, accent_color, min_role, status, created_by_email, updated_by_email, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', 'system', ?, ?)
        ON CONFLICT(slug) DO NOTHING
      `).bind(
        template.id,
        template.slug,
        template.title,
        template.description || null,
        template.groupName || 'Geral',
        template.call || '',
        template.render || null,
        template.params || null,
        template.kind || 'custom',
        template.imageUrl || null,
        template.imagePosition || 'left',
        template.accentColor || null,
        template.minRole,
        template.status,
        now,
        now
      ))
      continue
    }

    statements.push(env.DB.prepare(`
      INSERT INTO content_templates (id, slug, title, description, group_name, content_markdown, min_role, status, created_by_email, updated_by_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'system', 'system', ?, ?)
      ON CONFLICT(slug) DO NOTHING
    `).bind(
      template.id,
      template.slug,
      template.title,
      template.description || null,
      template.groupName || 'Geral',
      template.call || '',
      template.minRole,
      template.status,
      now,
      now
    ))
  }
  if (statements.length) await env.DB.batch(statements)
}

export async function listContentTemplates(env: Env, options: { includeDisabled?: boolean, role?: string } = {}) {
  const role = normalizeTemplateRole(options.role || 'guest')

  if (!env.DB) {
    return defaultContentTemplates()
      .filter(template => (options.includeDisabled || template.status === 'active') && templateAllowedForRole(template, role))
  }

  if (!await hasContentTemplatesTable(env)) throw new EditorialError('migração de templates não aplicada', 503)
  await seedContentTemplates(env)
  const rows = await env.DB.prepare(`
    SELECT *
    FROM content_templates
    ${options.includeDisabled ? '' : "WHERE status = 'active'"}
    ORDER BY group_name COLLATE NOCASE, title COLLATE NOCASE
  `).all()

  return (rows.results || [])
    .map((row: any) => templateRowToTemplate(row))
    .filter(template => templateAllowedForRole(template, role))
}

export async function saveContentTemplate(env: Env, input: ContentTemplateInput, authorEmail: string) {
  if (!env.DB) return null
  if (!await hasContentTemplatesTable(env)) throw new EditorialError('migração de templates não aplicada', 503)

  const clean = cleanTemplateInput(input)
  const columns = await getContentTemplateColumns(env)
  const hasExtras = templateExtraColumns.every(column => columns.has(column))
  const now = new Date().toISOString()
  const existing: any = clean.id
    ? await env.DB.prepare('SELECT id FROM content_templates WHERE id = ?').bind(clean.id).first()
    : await env.DB.prepare('SELECT id FROM content_templates WHERE slug = ?').bind(clean.slug).first()
  const id = existing?.id || clean.id || crypto.randomUUID()
  let row: any

  if (hasExtras) {
    row = await env.DB.prepare(`
      INSERT INTO content_templates (id, slug, title, description, group_name, content_markdown, render_markdown, params_markdown, template_kind, image_url, image_position, accent_color, min_role, status, created_by_email, updated_by_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        description = excluded.description,
        group_name = excluded.group_name,
        content_markdown = excluded.content_markdown,
        render_markdown = excluded.render_markdown,
        params_markdown = excluded.params_markdown,
        template_kind = excluded.template_kind,
        image_url = excluded.image_url,
        image_position = excluded.image_position,
        accent_color = excluded.accent_color,
        min_role = excluded.min_role,
        status = excluded.status,
        updated_by_email = excluded.updated_by_email,
        updated_at = excluded.updated_at
      RETURNING *
    `).bind(
      id,
      clean.slug,
      clean.title,
      clean.description || null,
      clean.groupName,
      clean.call,
      clean.render || null,
      clean.params || null,
      clean.kind,
      clean.imageUrl || null,
      clean.imagePosition,
      clean.accentColor || null,
      clean.minRole,
      clean.status,
      authorEmail,
      authorEmail,
      now,
      now
    ).first()
  } else {
    row = await env.DB.prepare(`
      INSERT INTO content_templates (id, slug, title, description, group_name, content_markdown, min_role, status, created_by_email, updated_by_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        description = excluded.description,
        group_name = excluded.group_name,
        content_markdown = excluded.content_markdown,
        min_role = excluded.min_role,
        status = excluded.status,
        updated_by_email = excluded.updated_by_email,
        updated_at = excluded.updated_at
      RETURNING *
    `).bind(
      id,
      clean.slug,
      clean.title,
      clean.description || null,
      clean.groupName,
      clean.call,
      clean.minRole,
      clean.status,
      authorEmail,
      authorEmail,
      now,
      now
    ).first()
  }

  return row ? templateRowToTemplate(row) : null
}

export async function deleteContentTemplate(env: Env, id: string) {
  if (!env.DB) return null
  if (!await hasContentTemplatesTable(env)) throw new EditorialError('migração de templates não aplicada', 503)
  const result = await env.DB.prepare('DELETE FROM content_templates WHERE id = ?').bind(id).run()
  return { ok: Boolean(result.meta?.changes), id }
}


async function tableExists(env: Env, table: string) {
  if (!env.DB) return false
  const row = await env.DB.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).bind(table).first()
  return Boolean(row)
}

async function tableCount(env: Env, table: string) {
  if (!env.DB || !(await tableExists(env, table))) return 0
  const row: any = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()
  return Number(row?.count || 0)
}

function normalizeIp(value: string | null | undefined) {
  return String(value || '').split(',')[0].trim().replace(/^\[|\]$/g, '').toLowerCase().slice(0, 128)
}

function parseIpv4(value: string) {
  const parts = value.trim().split('.')
  if (parts.length !== 4) return null
  let result = 0n
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const number = Number(part)
    if (!Number.isInteger(number) || number < 0 || number > 255) return null
    result = (result << 8n) + BigInt(number)
  }

  return { version: 4, bits: 32, value: result, normalized: parts.map(part => String(Number(part))).join('.') }
}

function ipv4ToIpv6Groups(value: string) {
  const parsed = parseIpv4(value)
  if (!parsed) return null
  const number = parsed.value
  return [Number((number >> 16n) & 0xffffn).toString(16), Number(number & 0xffffn).toString(16)]
}

function parseIpv6Groups(section: string, allowIpv4Tail: boolean) {
  if (!section) return []
  const raw = section.split(':')
  const groups: string[] = []

  for (let index = 0; index < raw.length; index += 1) {
    const part = raw[index]
    if (!part) return null

    if (part.includes('.')) {
      if (!allowIpv4Tail || index !== raw.length - 1) return null
      const ipv4Groups = ipv4ToIpv6Groups(part)
      if (!ipv4Groups) return null
      groups.push(...ipv4Groups)
      continue
    }

    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null
    groups.push(part.toLowerCase())
  }

  return groups
}

function parseIpv6(value: string) {
  const clean = value.trim().replace(/^\[|\]$/g, '').toLowerCase()
  if (!clean || clean.includes(':::')) return null
  const double = clean.split('::')
  if (double.length > 2) return null

  const left = parseIpv6Groups(double[0] || '', double.length === 1)
  const right = parseIpv6Groups(double[1] || '', true)
  if (!left || !right) return null

  let groups: string[]
  if (double.length === 2) {
    const missing = 8 - left.length - right.length
    if (missing < 1) return null
    groups = [...left, ...Array(missing).fill('0'), ...right]
  } else {
    groups = left
  }

  if (groups.length !== 8) return null

  let result = 0n
  const normalizedGroups = groups.map(group => Number.parseInt(group, 16).toString(16))
  for (const group of normalizedGroups) {
    const number = Number.parseInt(group, 16)
    if (!Number.isInteger(number) || number < 0 || number > 0xffff) return null
    result = (result << 16n) + BigInt(number)
  }

  return { version: 6, bits: 128, value: result, normalized: normalizedGroups.join(':') }
}

function parseIp(value: string) {
  const clean = normalizeIp(value)
  if (!clean) return null
  if (clean.includes(':')) return parseIpv6(clean)
  return parseIpv4(clean)
}

function parseIpRule(value: string) {
  const clean = normalizeIp(value)
  if (!clean) return null
  const [address, prefixText] = clean.split('/')
  if (clean.split('/').length > 2) return null
  const parsed = parseIp(address)
  if (!parsed) return null
  const prefix = prefixText === undefined || prefixText === '' ? parsed.bits : Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > parsed.bits) return null
  return { ...parsed, prefix, normalized: prefix === parsed.bits ? parsed.normalized : `${parsed.normalized}/${prefix}` }
}

function ipMatchesRule(clientIp: string, ruleIp: string) {
  const client = parseIp(clientIp)
  const rule = parseIpRule(ruleIp)
  if (!client || !rule || client.version !== rule.version) return false
  if (rule.prefix === 0) return true
  const shift = BigInt(rule.bits - rule.prefix)
  return (client.value >> shift) === (rule.value >> shift)
}

export function clientIpFromRequest(request: Request) {
  return normalizeIp(
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for') ||
    ''
  )
}

export async function listStorageOverview(env: Env, options: { search?: string, limit?: number, offset?: number, cursor?: string } = {}) {
  if (!env.DB) return null
  const files = await listUploads(env, options)
  const tables = await Promise.all([
    'pages',
    'revisions',
    'redirects',
    'page_aliases',
    'categories',
    'uploads',
    'edit_proposals',
    'ip_rules'
  ].map(async table => ({ table, rows: await tableCount(env, table) })))

  const totals: any = await env.DB.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(size_bytes), 0) AS bytes FROM uploads WHERE COALESCE(status, 'published') = 'published'").first()
  let r2ObjectCount = 0
  let r2NextCursor: string | null = null
  let r2Objects: any[] = []
  if (env.WIKI_BUCKET) {
    const listed = await env.WIKI_BUCKET.list({ prefix: 'uploads/', limit: 100, cursor: options.cursor })
    r2NextCursor = listed.truncated ? listed.cursor : null
    r2Objects = (listed.objects || []).map(object => ({
      key: object.key,
      size: object.size,
      uploaded: object.uploaded?.toISOString?.() || String(object.uploaded || ''),
      etag: object.etag || ''
    }))
    let cursor: string | undefined
    do {
      const page = await env.WIKI_BUCKET.list({ prefix: 'uploads/', limit: 1000, cursor })
      r2ObjectCount += page.objects.length
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
  }

  return {
    files,
    d1Tables: tables,
    r2Objects,
    r2ObjectCount,
    r2NextCursor,
    uploadCount: Number(totals?.total || 0),
    nextOffset: files.length === Math.min(options.limit || 80, 200) ? (options.offset || 0) + files.length : null,
    totalUploadBytes: Number(totals?.bytes || 0)
  }
}

export async function updateUploadMetadata(env: Env, slug: string, input: { filename?: string, description?: string }) {
  if (!env.DB) return null
  const file = await readUpload(env, slug)
  if (!file) return null
  const columns = await getUploadMetadataColumns(env)
  const now = new Date().toISOString()
  const filename = String(input.filename || file.filename || '').trim().slice(0, 180) || file.filename
  const description = String(input.description ?? file.description ?? '').trim().slice(0, 500)
  let row: any

  if (columns.description && columns.updatedAt) {
    row = await env.DB.prepare(`
      UPDATE uploads
      SET filename = ?, description = ?, updated_at = ?
      WHERE id = ? AND COALESCE(status, 'published') = 'published'
      RETURNING *
    `).bind(filename, description || null, now, file.id).first()
  } else {
    row = await env.DB.prepare("UPDATE uploads SET filename = ? WHERE id = ? AND COALESCE(status, 'published') = 'published' RETURNING *").bind(filename, file.id).first()
  }

  return uploadRowToFile(row)
}

export async function deleteUpload(env: Env, slug: string, authorEmail = '') {
  return softDeleteUpload(env, slug, authorEmail || 'editor')
}


export async function listIpRules(env: Env) {
  if (!env.DB || !(await tableExists(env, 'ip_rules'))) return []
  const rows = await env.DB.prepare(`
    SELECT id, ip, action, reason, status, created_by_email AS createdByEmail, created_at AS createdAt, updated_at AS updatedAt
    FROM ip_rules
    ORDER BY created_at DESC
    LIMIT 500
  `).all()
  return rows.results || []
}

export async function createIpRule(env: Env, input: { ip?: string, action?: string, reason?: string }, authorEmail: string) {
  if (!env.DB) return null
  if (!(await tableExists(env, 'ip_rules'))) throw new EditorialError('a tabela ip_rules ainda não foi criada', 503)
  const parsedIp = parseIpRule(String(input.ip || ''))
  const ip = parsedIp?.normalized || ''
  const action = String(input.action || '').trim()
  if (!ip) throw new EditorialError('ip/cidr inválido', 400)
  if (!['block_suggestions', 'ban_site'].includes(action)) throw new EditorialError('ação de IP inválida', 400)
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await env.DB.prepare(`
    INSERT INTO ip_rules (id, ip, action, reason, status, created_by_email, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `).bind(id, ip, action, String(input.reason || '').trim().slice(0, 500) || null, authorEmail, now, now).run()
  return { ok: true, id, ip, action, status: 'active', createdAt: now }
}

export async function removeIpRule(env: Env, id: string) {
  if (!env.DB) return null
  if (!(await tableExists(env, 'ip_rules'))) return null
  const result = await env.DB.prepare('DELETE FROM ip_rules WHERE id = ?').bind(id).run()
  return { ok: Boolean(result.meta?.changes), id }
}

export async function getActiveIpRule(env: Env, request: Request, action: 'block_suggestions' | 'ban_site') {
  if (!env.DB || !(await tableExists(env, 'ip_rules'))) return null
  const ip = clientIpFromRequest(request)
  if (!ip) return null
  const actions = action === 'block_suggestions' ? ['block_suggestions', 'ban_site'] : ['ban_site']
  const placeholders = actions.map(() => '?').join(', ')
  const rows = await env.DB.prepare(`
    SELECT id, ip, action, reason, status, created_at AS createdAt
    FROM ip_rules
    WHERE status = 'active' AND action IN (${placeholders})
    ORDER BY created_at DESC
    LIMIT 1000
  `).bind(...actions).all()
  return (rows.results || []).find((rule: any) => ipMatchesRule(ip, String(rule.ip || ''))) || null
}

export type EditorRole = 'editor' | 'moderator' | 'admin' | 'super_admin'

const DEFAULT_SUPER_ADMIN_EMAIL = ''

function superAdminEmail(env: Env) {
  return String(env.WIKI_SUPER_ADMIN_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase()
}

function normalizeEditorRole(value: string | null | undefined): EditorRole {
  if (value === 'super_admin') return 'super_admin'
  if (value === 'admin') return 'admin'
  if (value === 'moderator') return 'moderator'
  return 'editor'
}

function userRowToProfile(row: any) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || '',
    role: normalizeEditorRole(row.role),
    status: row.status || 'active',
    lastSeenAt: row.last_seen_at || null,
    lastSeenIp: row.last_seen_ip || null,
    lastSeenPath: row.last_seen_path || null,
    lastSeenUserAgent: row.last_seen_user_agent || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function ensureEditorProfile(env: Env, email: string, fallbackName: string | null = null) {
  if (!env.DB) return null
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!cleanEmail) return null
  const now = new Date().toISOString()
  const role = cleanEmail === superAdminEmail(env) ? 'super_admin' : 'editor'

  await env.DB.prepare(`INSERT INTO editor_profiles (id, email, display_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?) ON CONFLICT(email) DO NOTHING`).bind(crypto.randomUUID(), cleanEmail, fallbackName || null, role, now, now).run()
  const existing: any = await env.DB.prepare('SELECT * FROM editor_profiles WHERE email = ?').bind(cleanEmail).first()
  if (!existing) throw new EditorialError('perfil indisponível', 503)
  if (cleanEmail === superAdminEmail(env) && existing.role !== 'super_admin' && existing.status === 'active') {
    await env.DB.prepare('UPDATE editor_profiles SET role = ?, updated_at = ? WHERE email = ? AND status = ?').bind('super_admin', now, cleanEmail, 'active').run()
    existing.role = 'super_admin'
  }
  return userRowToProfile(existing)
}

export async function updateOwnEditorProfile(env: Env, email: string, input: { displayName?: string }) {
  const profile = await ensureEditorProfile(env, email)
  if (!profile || !env.DB) return null
  const now = new Date().toISOString()
  const displayName = String(input.displayName || '').trim().slice(0, 80)
  const row = await env.DB.prepare("UPDATE editor_profiles SET display_name = ?, updated_at = ? WHERE email = ? AND status = 'active' RETURNING *")
    .bind(displayName || null, now, profile.email)
    .first()
  return userRowToProfile(row)
}

export async function listEditorUsers(env: Env) {
  if (!env.DB) return []
  await ensureEditorProfile(env, superAdminEmail(env), null)
  const rows = await env.DB.prepare(`
    SELECT *
    FROM editor_profiles
    ORDER BY
      CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,
      email COLLATE NOCASE ASC
    LIMIT 500
  `).all()
  return (rows.results || []).map(userRowToProfile).filter(Boolean)
}

export async function updateEditorUser(env: Env, actorEmail: string, input: { email?: string, displayName?: string, role?: string, status?: string }) {
  if (!env.DB) return null
  const actor: any = await env.DB.prepare('SELECT role, status FROM editor_profiles WHERE email = ?').bind(actorEmail).first()
  const actorRole = normalizeEditorRole(actor?.role)
  if (actor?.status !== 'active' || !['admin', 'super_admin'].includes(actorRole)) throw new EditorialError('permissão insuficiente', 403)

  const email = String(input.email || '').trim().toLowerCase()
  if (!email) throw new EditorialError('e-mail ausente', 400)
  const existing: any = await env.DB.prepare('SELECT * FROM editor_profiles WHERE email = ?').bind(email).first()
  const target = existing ? userRowToProfile(existing)! : { role: email === superAdminEmail(env) ? 'super_admin' : 'editor', displayName: null }
  if (target.role === 'super_admin' && actorRole !== 'super_admin') throw new EditorialError('não é permitido alterar o super administrador', 403)

  const role = email === superAdminEmail(env) ? 'super_admin' : normalizeEditorRole(input.role || target.role)
  if (role === 'super_admin' && email !== superAdminEmail(env)) throw new EditorialError('super administrador fixo', 403)
  if (role === 'super_admin' && actorRole !== 'super_admin') throw new EditorialError('permissão insuficiente', 403)

  const status = input.status === 'disabled' ? 'disabled' : 'active'
  const displayName = String(input.displayName ?? target.displayName ?? '').trim().slice(0, 80)
  const now = new Date().toISOString()

  const guardId = crypto.randomUUID()
  const id = existing?.id || crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO core_write_guards VALUES (?, CASE WHEN EXISTS (SELECT 1 FROM editor_profiles WHERE email = ? AND status = 'active' AND role IN ('admin', 'super_admin') AND (? = 0 OR role = 'super_admin')) AND (? = 0 OR NOT EXISTS (SELECT 1 FROM editor_profiles WHERE email = ? AND role = 'super_admin')) THEN 1 ELSE 0 END)`).bind(guardId, actorEmail, role === 'super_admin' || target.role === 'super_admin' ? 1 : 0, actorRole === 'super_admin' ? 0 : 1, email),
    env.DB.prepare(`INSERT INTO editor_profiles (id, email, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, role = excluded.role, status = excluded.status, updated_at = excluded.updated_at`).bind(id, email, displayName || null, role, status, now, now),
    env.DB.prepare('DELETE FROM core_write_guards WHERE id = ?').bind(guardId)
  ])

  return userRowToProfile({ ...existing, id, email, display_name: displayName, role, status, created_at: existing?.created_at || now, updated_at: now })
}

export async function deleteEditorUser(env: Env, actorEmail: string, emailInput: string) {
  if (!env.DB) return null
  const actor = await ensureEditorProfile(env, actorEmail)
  const actorRole = normalizeEditorRole(actor?.role)
  if (actor?.status !== 'active' || !['admin', 'super_admin'].includes(actorRole)) throw new EditorialError('permissão insuficiente', 403)

  const email = String(emailInput || '').trim().toLowerCase()
  if (!email) throw new EditorialError('e-mail ausente', 400)
  if (email === superAdminEmail(env)) throw new EditorialError('não é permitido remover o super administrador', 403)
  if (email === String(actor?.email || '').trim().toLowerCase()) throw new EditorialError('não é permitido remover a própria conta', 403)

  const existing: any = await env.DB.prepare('SELECT * FROM editor_profiles WHERE email = ?').bind(email).first()
  if (!existing) return null
  const target = userRowToProfile(existing)
  if (target?.role === 'super_admin') throw new EditorialError('não é permitido remover o super administrador', 403)

  await env.DB.prepare("DELETE FROM editor_profiles WHERE email = ? AND role != 'super_admin' AND EXISTS (SELECT 1 FROM editor_profiles actor WHERE actor.email = ? AND actor.status = 'active' AND actor.role IN ('admin', 'super_admin'))").bind(email, actorEmail).run()
  return { ok: true, email }
}

function activityPathAllowed(pathname: string) {
  return pathname === '/' ||
    pathname.startsWith('/wiki/') ||
    pathname.startsWith('/edit/') ||
    pathname.startsWith('/history/') ||
    pathname.startsWith('/suggest/') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/search')
}

export async function recordActivity(env: Env, request: Request, user: { email?: string | null, displayName?: string | null, role?: string | null } | null = null) {
  if (!(await globalSettingEnabled(env, 'activityLogging'))) return null
  if (!env.DB || !(await tableExists(env, 'activity_events'))) return null
  const url = new URL(request.url)
  if (!activityPathAllowed(url.pathname)) return null

  const columns = await getActivityEventColumns(env)
  const ip = clientIpFromRequest(request)
  const location = requestIpLocation(request)
  const now = new Date().toISOString()
  const userAgent = String(request.headers.get('user-agent') || '').slice(0, 500)
  const email = String(user?.email || '').trim().toLowerCase() || null
  const displayName = String(user?.displayName || '').trim() || null
  const role = user?.role ? normalizeEditorRole(user.role) : null
  const path = `${url.pathname}${url.search}`

  if (columns.ipCountry && columns.ipRegion && columns.ipCity && columns.ipTimezone && columns.ipColo) {
    await env.DB.prepare(`
      INSERT INTO activity_events (id, email, display_name, role, ip, ip_country, ip_region, ip_city, ip_timezone, ip_colo, path, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), email, displayName, role, ip || null,
      location.country || null, location.region || null, location.city || null, location.timezone || null, location.colo || null,
      path, userAgent || null, now
    ).run()
  } else {
    await env.DB.prepare(`
      INSERT INTO activity_events (id, email, display_name, role, ip, path, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), email, displayName, role, ip || null, path, userAgent || null, now).run()
  }

  if (email) {
    try {
      await env.DB.prepare(`
        UPDATE editor_profiles
        SET last_seen_at = ?, last_seen_ip = ?, last_seen_path = ?, last_seen_user_agent = ?, updated_at = ?
        WHERE email = ?
      `).bind(now, ip || null, path, userAgent || null, now, email).run()
    } catch {}
  }

  return { ok: true }
}

export async function listRecentActivity(env: Env, limit = 100) {
  if (!env.DB || !(await tableExists(env, 'activity_events'))) return []
  const columns = await getActivityEventColumns(env)
  const locationColumns = columns.ipCountry && columns.ipRegion && columns.ipCity && columns.ipTimezone && columns.ipColo
    ? 'ip_country AS ipCountry, ip_region AS ipRegion, ip_city AS ipCity, ip_timezone AS ipTimezone, ip_colo AS ipColo'
    : 'NULL AS ipCountry, NULL AS ipRegion, NULL AS ipCity, NULL AS ipTimezone, NULL AS ipColo'

  const rows = await env.DB.prepare(`
    SELECT id, email, display_name AS displayName, role, ip, ${locationColumns}, path, user_agent AS userAgent, created_at AS createdAt
    FROM activity_events
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(Math.min(Math.max(Number(limit || 100), 1), 500)).all()
  return rows.results || []
}

export async function clearRecentActivity(env: Env) {
  if (!env.DB || !(await tableExists(env, 'activity_events'))) return { ok: true, deleted: 0 }
  const result = await env.DB.prepare('DELETE FROM activity_events').run()
  return { ok: true, deleted: result.meta?.changes || 0 }
}

async function getSetting(env: Env, key: string, fallback: any = null) {
  if (!env.DB) return fallback
  const row: any = await env.DB.prepare('SELECT value_json FROM system_settings WHERE key = ?').bind(key).first()
  if (!row) return fallback
  try { return JSON.parse(String(row.value_json || 'null')) } catch { return fallback }
}

async function setSetting(env: Env, key: string, value: any) {
  if (!env.DB) return null
  const now = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO system_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).bind(key, JSON.stringify(value), now).run()
  return { key, value, updatedAt: now }
}

export async function getSystemStatus(env: Env) {
  const cacheVersion = await getSetting(env, 'cache_version', { value: 0, updatedAt: null })
  const reloadVersion = await getSetting(env, 'reload_version', { value: 0, updatedAt: null })
  const publicVersion = (value: any) => ({ value: Number(value?.value || 0), updatedAt: value?.updatedAt || null })
  return { cacheVersion: publicVersion(cacheVersion), reloadVersion: publicVersion(reloadVersion), coreVersion: env.WIKI_CORE_VERSION || 'v1.1.0-r2' }
}

export async function forceSystemRefresh(env: Env, mode: 'cache' | 'reload', authorEmail: string) {
  if (!env.DB) throw new EditorialError('armazenamento indisponível', 503)
  const key = mode === 'reload' ? 'reload_version' : 'cache_version'
  const now = new Date().toISOString()
  const initial = JSON.stringify({ value: 1, mode, authorEmail, updatedAt: now })
  const row: any = await env.DB.prepare(`INSERT INTO system_settings (key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = json_set(excluded.value_json, '$.value', CASE WHEN json_valid(system_settings.value_json) THEN COALESCE(json_extract(system_settings.value_json, '$.value'), 0) ELSE 0 END + 1), updated_at = excluded.updated_at
    RETURNING value_json`).bind(key, initial, now).first()
  return { key, value: JSON.parse(row.value_json), updatedAt: now }
}

async function pageTrashRows(env: Env) {
  const rows = await env.DB!.prepare(`
    SELECT id, slug, title, status, deleted_at AS deletedAt, deleted_by_email AS deletedByEmail, purge_after AS purgeAfter, deleted_reason AS deletedReason, updated_at AS updatedAt
    FROM pages
    WHERE status = 'deleted'
    ORDER BY COALESCE(deleted_at, updated_at) DESC
    LIMIT 500
  `).all()
  return rows.results || []
}

async function uploadTrashRows(env: Env) {
  const rows = await env.DB!.prepare(`
    SELECT id, COALESCE(file_slug, id) AS slug, filename, mime_type AS mimeType, size_bytes AS sizeBytes, status, deleted_at AS deletedAt, deleted_by_email AS deletedByEmail, purge_after AS purgeAfter, r2_key AS r2Key
    FROM uploads
    WHERE COALESCE(status, 'published') = 'deleted'
    ORDER BY COALESCE(deleted_at, created_at) DESC
    LIMIT 500
  `).all()
  return rows.results || []
}

export async function listTrash(env: Env) {
  if (!env.DB) return { pages: [], files: [] }
  return { pages: await pageTrashRows(env), files: await uploadTrashRows(env) }
}

export async function restoreDeletedPage(env: Env, slug: string, authorEmail: string) {
  if (!env.DB) return null
  const statements: D1PreparedStatement[] = []
  const stored = await findStoredPageSlug(env, slug, 'deleted', { preferCanonical: false })
  if (!stored) return null
  const page: any = await env.DB.prepare('SELECT * FROM pages WHERE id = ? AND status = ?').bind(stored.id, 'deleted').first()
  if (!page) return null
  const now = new Date().toISOString()
  statements.push(env.DB.prepare(`
    UPDATE pages SET status = 'published', deleted_at = NULL, deleted_by_email = NULL, purge_after = NULL, deleted_reason = NULL, updated_at = ? WHERE id = ?
  `).bind(now, page.id))

  const contentRow: any = await env.DB.prepare('SELECT content_markdown AS content FROM revisions WHERE id = ?').bind(page.current_revision_id).first()
  const view = await hydratePage(env, { ...page, content: contentRow?.content || '' })
  await syncSearch(env, page.id, { title: page.title, content: contentRow?.content || '', summary: `restaurada por ${authorEmail}` }, page.slug, statements)
  if (statements.length) await commitPageState(env, page.id, 'deleted', statements)
  return { ...view, status: 'published', updatedAt: now }
}

export async function hardDeletePage(env: Env, slug: string) {
  if (!env.DB) return null
  const statements: D1PreparedStatement[] = []
  const stored = await findStoredPageSlug(env, slug, 'deleted', { preferCanonical: false })
  if (!stored) return null
  const page: any = await env.DB.prepare('SELECT id, slug, title FROM pages WHERE id = ? AND status = ?').bind(stored.id, 'deleted').first()
  if (!page) return null
  statements.push(env.DB.prepare('DELETE FROM redirects WHERE from_slug = ? OR to_slug = ?').bind(page.slug, page.slug))
  const optional = await getOptionalTables(env)
  if (optional.pageAliases) statements.push(env.DB.prepare('DELETE FROM page_aliases WHERE page_id = ?').bind(page.id))
  statements.push(env.DB.prepare('DELETE FROM page_search WHERE page_id = ?').bind(page.id))
  statements.push(env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(page.id))
  if (statements.length) await commitPageState(env, page.id, 'deleted', statements)
  return { ok: true, slug: page.slug, title: page.title }
}

export async function softDeleteUpload(env: Env, slug: string, authorEmail: string) {
  if (!env.DB) return null
  const file = await readUpload(env, slug)
  if (!file) return null
  const now = new Date().toISOString()
  const purgeAfter = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
  await env.DB.prepare(`
    UPDATE uploads
    SET status = 'deleted', deleted_at = ?, deleted_by_email = ?, purge_after = ?, updated_at = COALESCE(updated_at, ?)
    WHERE id = ?
  `).bind(now, authorEmail, purgeAfter, now, file.id).run()
  return { ok: true, file: { ...file, status: 'deleted', deletedAt: now, deletedByEmail: authorEmail, purgeAfter } }
}

export async function restoreDeletedUpload(env: Env, slug: string) {
  if (!env.DB) return null
  const cleanSlug = slugFromTitle(slug)
  const row: any = await env.DB.prepare('SELECT * FROM uploads WHERE (file_slug = ? OR id = ?) AND status = ?').bind(cleanSlug, slug, 'deleted').first()
  if (!row) return null
  if (!env.WIKI_BUCKET || !(await env.WIKI_BUCKET.head(String(row.r2_key)))) throw new EditorialError('objeto de mídia indisponível', 503)
  const restored = await env.DB.prepare('UPDATE uploads SET status = ?, deleted_at = NULL, deleted_by_email = NULL, purge_after = NULL WHERE id = ? AND status = ? RETURNING *').bind('published', row.id, 'deleted').first()
  if (!restored) throw new EditorialError('o estado do arquivo foi modificado')
  return uploadRowToFile(restored)
}

export async function hardDeleteUpload(env: Env, slug: string) {
  if (!env.DB) return null
  const cleanSlug = slugFromTitle(slug)
  const row: any = await env.DB.prepare('SELECT id, COALESCE(file_slug, id) AS slug, r2_key AS r2Key, filename FROM uploads WHERE (file_slug = ? OR id = ?) AND status = ?').bind(cleanSlug, slug, 'deleted').first()
  if (!row) return null
  if (!env.WIKI_BUCKET) throw new EditorialError('armazenamento de mídia indisponível', 503)
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO r2_cleanup (r2_key, created_at) VALUES (?, ?)').bind(row.r2Key, new Date().toISOString()),
    env.DB.prepare('DELETE FROM uploads WHERE id = ? AND status = ?').bind(row.id, 'deleted')
  ])
  await reconcileR2Cleanup(env)
  return { ok: true, slug: row.slug, filename: row.filename }
}

export async function reconcileR2Cleanup(env: Env) {
  if (!env.DB || !env.WIKI_BUCKET) return
  const rows = await env.DB.prepare('SELECT r2_key FROM r2_cleanup LIMIT 100').all()
  for (const row of rows.results || []) {
    const referenced = await env.DB.prepare('SELECT id FROM uploads WHERE r2_key = ?').bind(row.r2_key).first()
    if (referenced) continue
    await env.WIKI_BUCKET.delete(String(row.r2_key))
    await env.DB.prepare('DELETE FROM r2_cleanup WHERE r2_key = ?').bind(row.r2_key).run()
  }
}

export async function purgeExpiredTrash(env: Env) {
  await reconcileR2Cleanup(env)
  if (!env.DB) return { pages: [], files: [] }
  const now = new Date().toISOString()
  const pageRows = await env.DB.prepare('SELECT slug FROM pages WHERE status = ? AND purge_after IS NOT NULL AND purge_after <= ? LIMIT 200').bind('deleted', now).all()
  const fileRows = await env.DB.prepare('SELECT COALESCE(file_slug, id) AS slug FROM uploads WHERE status = ? AND purge_after IS NOT NULL AND purge_after <= ? LIMIT 200').bind('deleted', now).all()
  const pages = [] as any[]
  const files = [] as any[]
  for (const page of pageRows.results || []) {
    const result = await hardDeletePage(env, String((page as any).slug || ''))
    if (result) pages.push(result)
  }
  for (const file of fileRows.results || []) {
    const result = await hardDeleteUpload(env, String((file as any).slug || ''))
    if (result) files.push(result)
  }
  return { pages, files }
}

export const GLOBAL_SETTING_DEFAULTS: Record<string, boolean> = {
  search: true,
  talkPages: true,
  userPages: true,
  publicSuggestions: true,
  pageHistory: true,
  mediaUploads: true,
  templates: true,
  categories: true,
  randomPage: true,
  coreBadge: true,
  activityLogging: true,
  'specialPages.index': true,
  'specialPages.version': true,
  'specialPages.recentPages': true,
  'specialPages.allPages': true,
  'specialPages.categories': true,
  'specialPages.randomPage': true
}

function nestedSettingValue(settings: Record<string, any>, key: string, fallback = true) {
  let value: any = settings
  for (const part of String(key || '').split('.').filter(Boolean)) {
    if (!value || typeof value !== 'object' || !(part in value)) return fallback
    value = value[part]
  }
  return typeof value === 'boolean' ? value : fallback
}

function pageVisibleWithSettings(slug: string, settings: Record<string, any>) {
  const value = normalizeSlug(slug)
  if (!value) return false
  if (value === 'especial' || value === 'special' || value.startsWith('especial/') || value.startsWith('special/') || value === 'arquivo' || value.startsWith('arquivo/')) return false
  if (value.startsWith('discussao/') && !nestedSettingValue(settings, 'talkPages')) return false
  if (value.startsWith('usuario/') && !nestedSettingValue(settings, 'userPages')) return false
  if (value.startsWith('categoria/') && !nestedSettingValue(settings, 'categories')) return false
  return true
}

export async function publicPageEnabled(env: Env, slug: string) {
  return pageVisibleWithSettings(slug, await getGlobalSettings(env))
}

function globalSettingDefaults(env: Env) {
  const values = { ...GLOBAL_SETTING_DEFAULTS }
  try {
    const configured = flattenSettings(JSON.parse(String(env.WIKI_FEATURES_JSON || '{}')))
    for (const [key, value] of Object.entries(configured)) {
      if (key in values) values[key] = value
    }
  } catch {}
  return values
}

function nestedSettings(values: Record<string, boolean>) {
  const result: Record<string, any> = {}
  for (const [path, value] of Object.entries(values)) {
    const parts = path.split('.')
    let target = result
    while (parts.length > 1) {
      const part = parts.shift()!
      target[part] ||= {}
      target = target[part]
    }
    target[parts[0]] = value
  }
  return result
}

function flattenSettings(input: Record<string, any>, prefix = '', output: Record<string, boolean> = {}) {
  for (const [key, value] of Object.entries(input || {})) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'boolean') output[path] = value
    else if (value && typeof value === 'object' && !Array.isArray(value)) flattenSettings(value, path, output)
  }
  return output
}

export async function getGlobalSettings(env: Env) {
  const values = globalSettingDefaults(env)
  if (!env.DB || !(await tableExists(env, 'global_settings'))) return nestedSettings(values)

  const rows = await env.DB.prepare('SELECT setting_key AS settingKey, value_json AS valueJson FROM global_settings').all()
  for (const row of rows.results || []) {
    const key = String((row as any).settingKey || '')
    if (!(key in GLOBAL_SETTING_DEFAULTS)) continue
    try {
      const parsed = JSON.parse(String((row as any).valueJson || 'false'))
      if (typeof parsed !== 'boolean') throw new Error('invalid setting')
      values[key] = parsed
    } catch { throw new EditorialError('configuração global inválida', 503) }
  }
  return nestedSettings(values)
}

export async function globalSettingEnabled(env: Env, key: string, fallback = true) {
  const configured = globalSettingDefaults(env)
  const defaults = key in configured ? configured[key] : fallback
  if (!env.DB || !(await tableExists(env, 'global_settings'))) return defaults
  const row: any = await env.DB.prepare('SELECT value_json AS valueJson FROM global_settings WHERE setting_key = ?').bind(key).first()
  if (!row) return defaults
  try {
    const parsed = JSON.parse(String(row.valueJson || 'false'))
    if (typeof parsed !== 'boolean') throw new Error('invalid setting')
    return parsed
  } catch {
    throw new EditorialError('configuração global inválida', 503)
  }
}

export async function saveGlobalSettings(env: Env, input: Record<string, any>, actorEmail: string) {
  if (!env.DB) throw new EditorialError('D1 ainda não foi ligado', 503)
  if (!(await tableExists(env, 'global_settings'))) throw new EditorialError('aplique a migration 0015 antes de salvar configurações globais', 503)

  const flat = flattenSettings(input)
  const now = new Date().toISOString()
  const previous = flattenSettings(await getGlobalSettings(env))
  const saved: Record<string, boolean> = {}
  const statements: D1PreparedStatement[] = []

  for (const [key, value] of Object.entries(flat)) {
    if (!(key in GLOBAL_SETTING_DEFAULTS)) continue
    statements.push(env.DB.prepare(`
      INSERT INTO global_settings (setting_key, value_json, updated_at, updated_by_email)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at,
        updated_by_email = excluded.updated_by_email
    `).bind(key, JSON.stringify(Boolean(value)), now, actorEmail))
    saved[key] = Boolean(value)
  }

  if (statements.length) await env.DB.batch(statements)
  return { settings: nestedSettings({ ...previous, ...saved }), saved: nestedSettings(saved), updatedAt: now }
}
