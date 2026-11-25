import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import vendor from './vendor.cjs'
import { readJson, writeJson, hash, safePath, checkAncestors, operationLock } from './files.js'
import { installationAssets, isPreserved } from './updater.js'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const deepMerge = (base, overrides) => {
  const output = structuredClone(base)
  for (const [key, value] of Object.entries(overrides || {})) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('chave de configuração inválida')
    output[key] = value && typeof value === 'object' && !Array.isArray(value) && output[key] && typeof output[key] === 'object' && !Array.isArray(output[key]) ? deepMerge(output[key], value) : structuredClone(value)
  }
  return output
}
export const safeSlug = (value, fallback = 'wiki') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback
const resourceName = (value, fallback, maximum = 63) => safeSlug(value, fallback).slice(0, maximum).replace(/-+$/, '') || fallback
const object = value => value && typeof value === 'object' && !Array.isArray(value)
export function genericConfig(language = 'pt-BR') {
  const config = readJson(new URL('./presets/default.json', import.meta.url))
  if (language === 'en') {
    Object.assign(config.site, { name: 'My Wiki', shortName: 'My Wiki', tagline: 'A wiki powered by WikiCambada Core', description: 'A wiki powered by WikiCambada Core', language, interfaceLanguage: language, homeSlug: 'main-page', aboutSlug: 'about', editGuideSlug: 'editing-guide' })
    config.navigation.main = [{ label: 'Main page', href: '/', kind: 'home' }, { label: 'Special pages', href: '/wiki/especial', kind: 'page', feature: 'specialPages.index' }, { label: 'Random page', href: '/wiki/especial/pagina-aleatoria', kind: 'random', feature: 'randomPage' }]
    config.navigation.community = [{ label: 'About', href: '/wiki/about', kind: 'page' }, { label: 'How to edit', href: '/wiki/editing-guide', kind: 'page' }]
  }
  return config
}
function validURL(value, asset = false, fallback = '') {
  const text = String(value || fallback).trim()
  if (!text) return ''
  if (asset && text.startsWith('/') && !text.startsWith('//')) return text.slice(0, 2048)
  try {
    const url = new URL(text)
    if (!(asset ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol)) || url.username || url.password || !asset && (url.search || url.hash)) throw new Error()
    return asset ? text : text.replace(/\/+$/, '')
  } catch { if (asset) return fallback; throw new Error('a URL pública deve usar HTTP ou HTTPS e possuir um domínio válido') }
}
function email(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text && (text.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))) throw new Error('o e-mail informado é inválido')
  return text
}
export function validateConfig(config) {
  if (!object(config)) throw new Error('a configuração da instalação é inválida')
  for (const key of ['site', 'navigation', 'branding', 'features', 'appearance', 'access', 'cloudflare']) {
    if (!Object.hasOwn(config, key)) config[key] = {}
    if (!object(config[key])) throw new Error(`a configuração de ${key} é inválida`)
  }
  const { site, branding, features, appearance, access, cloudflare, navigation } = config
  site.language ||= 'pt-BR'; site.interfaceLanguage ||= site.language
  if (![site.language, site.interfaceLanguage].every(value => ['pt-BR', 'en'].includes(value))) throw new Error('o idioma selecionado não é suportado')
  for (const [key, maximum] of Object.entries({ name: 120, shortName: 80, tagline: 240, description: 1000, defaultCategory: 120 })) site[key] = String(site[key] || (key === 'shortName' ? site.name : '') || '').trim().slice(0, maximum)
  if (!site.name || !site.shortName) throw new Error('o nome e o nome curto da wiki são obrigatórios')
  for (const [key, fallback] of Object.entries(site.language === 'en' ? { homeSlug: 'main-page', aboutSlug: 'about', editGuideSlug: 'editing-guide' } : { homeSlug: 'pagina-principal', aboutSlug: 'sobre', editGuideSlug: 'como-editar' })) site[key] = safeSlug(site[key], fallback)
  site.baseUrl = validURL(site.baseUrl); site.supportEmail = email(site.supportEmail)
  for (const section of ['main', 'community', 'external']) navigation[section] = (Array.isArray(navigation[section]) ? navigation[section] : []).filter(object).slice(0, 100).filter(item => item.label && item.href).map(item => {
    const label = String(item.label).trim().slice(0, 120), href = String(item.href).trim().slice(0, 2048)
    if (!(href.startsWith('/') && !href.startsWith('//'))) { try { const url = new URL(href); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error() } catch { throw new Error(`o link de navegação “${label}” possui uma URL inválida`) } }
    return { label, href, ...(item.kind ? { kind: String(item.kind).slice(0, 40) } : {}), ...(item.feature ? { feature: String(item.feature).slice(0, 80) } : {}) }
  })
  for (const [key, fallback] of Object.entries(genericConfig().branding)) if (key !== 'randomIcons') branding[key] = validURL(branding[key], true, fallback)
  branding.randomIcons = Boolean(branding.randomIcons && branding.randomIconManifest)
  features.cloudflareBadge ??= true
  if (typeof features.cloudflareBadge !== 'boolean') throw new Error('a opção da badge da Cloudflare deve ser booleana')
  features.builtWithCloudflareBadge ??= false
  if (typeof features.builtWithCloudflareBadge !== 'boolean') throw new Error('a opção da badge Built with Cloudflare deve ser booleana')
  appearance.accentColor = /^#[0-9a-f]{6}$/i.test(appearance.accentColor) ? appearance.accentColor : '#3366cc'
  if (!['auto', 'light', 'dark', 'oled'].includes(appearance.defaultTheme)) appearance.defaultTheme = 'auto'
  if (!object(appearance.fonts)) appearance.fonts = {}
  for (const [key, fallback] of Object.entries(genericConfig().appearance.fonts)) { const value = String(appearance.fonts[key] || fallback).trim(); appearance.fonts[key] = /[\r\n]/.test(value) ? fallback : value.slice(0, 300) }
  access.mode ||= 'cloudflare-access'
  if (!['cloudflare-access', 'private', 'public'].includes(access.mode)) throw new Error('modo de acesso inválido')
  access.superAdminEmail = email(access.superAdminEmail); access.strict = access.strict !== false
  cloudflare.projectName = resourceName(cloudflare.projectName || site.shortName, 'my-wiki', 58)
  cloudflare.databaseName = resourceName(cloudflare.databaseName || `${cloudflare.projectName}-db`, 'my-wiki-db')
  cloudflare.bucketName = resourceName(cloudflare.bucketName || `${cloudflare.projectName}-uploads`, 'my-wiki-uploads')
  return config
}
export class Project {
  constructor(root = ROOT) { this.root = path.resolve(root) }
  file(name) { return path.join(this.root, name) }
  read(name, fallback = {}) { return readJson(this.file(name), fallback) }
  write(name, value) { checkAncestors(this.file(name)); writeJson(this.file(name), value) }
  config() { return this.read('src/config/site.json') }
  installation() { return this.read('src/config/installation.json') }
  presets() { return this.read('src/setup/presets/presets.json') }
  release() { return this.read('wikicambada-release.json') }
  decodeAsset(asset, name) {
    if (!asset?.data) return null
    const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico' }
    const extension = extensions[asset.type]
    if (!extension) throw new Error('o formato do arquivo de identidade visual não é suportado')
    const encoded = String(asset.data).split(',').at(-1)
    if (encoded.length > Math.ceil(8 * 1024 * 1024 / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('o arquivo de identidade visual é inválido ou excede 8 MB')
    const bytes = Buffer.from(encoded, 'base64')
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('o arquivo de identidade visual é vazio ou excede 8 MB')
    const valid = extension === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : extension === '.jpg' ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) : extension === '.webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' : bytes.subarray(0, 4).equals(Buffer.from([0,0,1,0]))
    if (!valid) throw new Error('o conteúdo da identidade visual não corresponde ao formato informado')
    const relative = `src/media/branding/${name}${extension}`
    checkAncestors(this.file(relative)); fs.mkdirSync(path.dirname(this.file(relative)), { recursive: true }); fs.writeFileSync(this.file(relative), bytes)
    return '/' + relative
  }
  generateWrangler(config, reuse = true) {
    checkAncestors(this.file('wrangler.toml'))
    const file = this.file('wrangler.toml'), old = fs.existsSync(file) ? vendor.toml.parse(fs.readFileSync(file, 'utf8')) : {}, previous = reuse ? old : {}, { site, access, cloudflare } = config
    const database = (old.d1_databases || []).find(item => item.binding === 'DB') || {}
    const reuseId = reuse && database.database_name === cloudflare.databaseName
    const generated = deepMerge(previous, { name: cloudflare.projectName, compatibility_date: old.compatibility_date || '2026-06-22', pages_build_output_dir: '.wikicambada/public', vars: { ACCESS_TEAM_DOMAIN: reuse ? old.vars?.ACCESS_TEAM_DOMAIN || '' : '', ACCESS_AUD: reuse ? old.vars?.ACCESS_AUD || '' : '', ACCESS_STRICT: String(access.strict), WIKI_ACCESS_MODE: access.mode, PUBLIC_BASE_URL: site.baseUrl, WIKI_SITE_NAME: site.name, WIKI_SUPER_ADMIN_EMAIL: access.superAdminEmail, WIKI_CORE_VERSION: this.release().displayVersion || 'v1.1.0-r2', WIKI_FEATURES_JSON: JSON.stringify(config.features) } })
    if (config.initialContent) generated.vars.WIKI_INITIAL_CONTENT = JSON.stringify(config.initialContent)
    else if (!reuse) delete generated.vars.WIKI_INITIAL_CONTENT
    const db = { ...(reuse ? database : {}), binding: 'DB', database_name: cloudflare.databaseName, database_id: reuseId ? database.database_id || '' : '', preview_database_id: reuseId ? database.preview_database_id || database.database_id || '' : '', migrations_dir: 'src/data/migrations', migrations_table: 'd1_migrations' }
    const bucket = { ...(reuse ? (old.r2_buckets || []).find(item => item.binding === 'WIKI_BUCKET') : {}), binding: 'WIKI_BUCKET', bucket_name: cloudflare.bucketName }
    generated.d1_databases = [...(reuse ? (old.d1_databases || []).filter(item => item.binding !== 'DB') : []), db]
    generated.r2_buckets = [...(reuse ? (old.r2_buckets || []).filter(item => item.binding !== 'WIKI_BUCKET') : []), bucket]
    fs.writeFileSync(file, vendor.toml.stringify(generated))
  }
  generatePackage(config, packageName = config.cloudflare.projectName) {
    checkAncestors(this.file('package.json')); checkAncestors(this.file('package-lock.json'))
    const pkg = this.read('package.json'), name = config.cloudflare.projectName, database = config.cloudflare.databaseName
    Object.assign(pkg, { name: packageName, version: this.release().version || '1.1.0-r2', private: true })
    pkg.scripts = { ...pkg.scripts, test: 'node src/scripts/test.mjs', typecheck: 'tsc --pretty false', build: 'node src/scripts/build-public.mjs', predev: 'npm run build', predeploy: 'npm run build', dev: 'node src/scripts/dev.mjs', deploy: `wrangler pages deploy .wikicambada/public --project-name ${name}`, 'db:migrations:apply:local': `wrangler d1 migrations apply ${database} --local`, 'db:migrations:apply:remote': `wrangler d1 migrations apply ${database} --remote`, setup: 'node setup.js', verify: 'node setup.js verify' }
    this.write('package.json', pkg)
    const lock = this.read('package-lock.json')
    Object.assign(lock, { name: packageName, version: pkg.version }); lock.packages ||= {}; lock.packages[''] = { ...lock.packages[''], name: packageName, version: pkg.version }
    this.write('package-lock.json', lock)
  }
  async save(payload) {
    return operationLock(this.root, async () => {
      if (['configuration-journal.json', 'update-journal.json'].some(name => fs.existsSync(this.file('.wikicambada/' + name)))) throw new Error('há uma operação interrompida; execute setup.js recover-local antes de continuar')
      const files = ['src/config/site.json', 'src/config/installation.json', 'wrangler.toml', 'package.json', 'package-lock.json', '.wikicambada/state.json']
      for (const name of ['logo', 'logo-dark', 'favicon']) for (const extension of ['png', 'jpg', 'webp', 'ico']) files.push(`src/media/branding/${name}.${extension}`)
      const snapshots = Object.fromEntries(files.map(name => { checkAncestors(this.file(name)); return [name, fs.existsSync(this.file(name)) ? fs.readFileSync(this.file(name)).toString('base64') : null] }))
      this.write('.wikicambada/configuration-journal.json', { files: snapshots })
      try {
        const intent = payload.intent || 'configure'
        if (!['new', 'configure'].includes(intent) || payload.config && !object(payload.config)) throw new Error('o modo de configuração solicitado é inválido')
        const presetId = Object.hasOwn(this.presets(), payload.preset) ? payload.preset : 'custom', preset = this.presets()[presetId] || {}
        const base = intent === 'new' ? genericConfig(payload.config?.site?.language) : this.config()
        if (presetId !== 'custom') { base.features = deepMerge(base.features || {}, preset.features || {}); base.access = deepMerge(base.access || {}, preset.access || {}) }
        const config = validateConfig(deepMerge(base, payload.config || {}))
        const assets = payload.assets || {}
        if (!object(assets)) throw new Error('os arquivos de identidade visual são inválidos')
        const logo = this.decodeAsset(assets.logo, 'logo'), dark = this.decodeAsset(assets.logoDark, 'logo-dark'), favicon = this.decodeAsset(assets.favicon, 'favicon')
        if (logo) Object.assign(config.branding, { logo, logoMobile: logo, randomIcons: false })
        if (dark) config.branding.logoDark = dark
        if (favicon) config.branding.favicon = favicon
        if (intent === 'new') {
          if (config.site.editGuideSlug === config.site.homeSlug) config.site.editGuideSlug += '-guide'
          config.initialContent = { id: randomUUID(), language: config.site.language, name: config.site.name, homeSlug: config.site.homeSlug, guideSlug: config.site.editGuideSlug }
        }
        config.schemaVersion = 1
        this.write('src/config/site.json', config); this.generateWrangler(config, intent !== 'new'); this.generatePackage(config)
        const installation = this.installation(), now = new Date().toISOString()
        Object.assign(installation, { formatVersion: 1, installationId: safeSlug(config.site.shortName), distribution: presetId, coreVersion: this.release().version || '1.1.0-r2', configSchema: 1, databaseSchema: intent === 'new' ? null : installation.databaseSchema ?? null, requiredDatabaseSchema: 17, updateChannel: ['stable', 'beta', 'development'].includes(payload.updateChannel || installation.updateChannel) ? payload.updateChannel || installation.updateChannel : 'stable', lastUpdatedAt: now })
        installation.createdAt ||= now
        this.write('src/config/installation.json', installation)
        this.write('.wikicambada/state.json', { managedBy: 'WikiCambada Core setup', coreVersion: installation.coreVersion, configSchema: 1, databaseSchema: installation.databaseSchema, requiredDatabaseSchema: 17, lastConfiguredAt: now })
        fs.unlinkSync(this.file('.wikicambada/configuration-journal.json'))
        return { config, installation }
      } catch (error) {
        for (const [name, content] of Object.entries(snapshots)) { if (content === null) fs.rmSync(this.file(name), { force: true }); else { fs.mkdirSync(path.dirname(this.file(name)), { recursive: true }); fs.writeFileSync(this.file(name), Buffer.from(content, 'base64')) } }
        fs.unlinkSync(this.file('.wikicambada/configuration-journal.json')); throw error
      }
    })
  }
  verify() {
    const checks = [], add = (name, ok, message = ok ? 'ok' : 'inválido') => checks.push({ name, ok: Boolean(ok), message })
    for (const name of ['setup.js', 'index.html', 'package.json', 'package-lock.json', 'wrangler.toml', 'wikicambada-release.json', 'wikicambada-files.json', 'functions/api/health.ts', 'src/config/site.json', 'src/config/installation.json', 'src/scripts/app.js', 'src/scripts/core/i18n.js', 'src/setup/ui/index.html', 'src/data/migrations/0017_v1_1_0_recovery.sql']) add(name, fs.existsSync(this.file(name)))
    for (const name of ['src/config/site.json', 'src/config/installation.json', 'package.json', 'package-lock.json', 'wikicambada-release.json', 'wikicambada-files.json']) { try { add(name + ':json', object(JSON.parse(fs.readFileSync(this.file(name), 'utf8'))), 'json válido') } catch { add(name + ':json', false) } }
    const pkg = this.read('package.json'), lock = this.read('package-lock.json'), release = this.release()
    add('produto da release', release.product === 'WikiCambada Core')
    add('versões do Core', release.version === pkg.version && pkg.version === this.installation().coreVersion)
    add('formato da versão', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(release.version))
    add('package-lock.json', lock.name === pkg.name && lock.packages?.['']?.name === pkg.name && lock.version === pkg.version && lock.packages?.['']?.version === pkg.version)
    try { validateConfig(structuredClone(this.config())); add('configuração da instalação', true) } catch (error) { add('configuração da instalação', false, error.message) }
    try {
      const wrangler = vendor.toml.parse(fs.readFileSync(this.file('wrangler.toml'), 'utf8')), databases = (wrangler.d1_databases || []).filter(item => item.binding === 'DB'), buckets = (wrangler.r2_buckets || []).filter(item => item.binding === 'WIKI_BUCKET'), db = databases[0]
      add('wrangler.toml:toml', true)
      add('bindings da Cloudflare', databases.length === 1 && buckets.length === 1 && db.database_name && buckets[0].bucket_name && db.migrations_dir === 'src/data/migrations' && (!db.database_id || /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(db.database_id)) && object(wrangler.vars) && wrangler.pages_build_output_dir === '.wikicambada/public', 'estrutura local; conectividade e schema remoto não verificados')
    } catch { add('wrangler.toml:toml', false) }
    const manifest = this.read('wikicambada-files.json'), protectedAssets = installationAssets(this), errors = []
    for (const [name, expected] of Object.entries(manifest.files || manifest)) { try { safePath(name); if (!isPreserved(name) && !protectedAssets.has(name) && (!fs.existsSync(this.file(name)) || hash(this.file(name)) !== expected)) errors.push(name) } catch { errors.push(name) } }
    add('integridade dos arquivos do Core', Object.keys(manifest.files || manifest).length > 0 && errors.length === 0, errors.length ? errors.slice(0, 10).join(', ') : 'hashes válidos')
    for (const key of ['logo', 'logoMobile', 'favicon']) { const value = this.config().branding?.[key]; if (value?.startsWith('/') && !value.startsWith('//')) add('branding.' + key, fs.existsSync(this.file(value.slice(1))), value) }
    return { ok: checks.every(item => item.ok), checks }
  }
}
