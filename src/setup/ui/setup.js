const translations = {
  'pt-BR': {
    modeMigrate: 'Migrar uma wiki legada', modeMigrateDesc: 'Migre uma instalação anterior à versão 1.1.0 para o WikiCambada Core.',
    migrateStep: 'Migração', legacySource: 'Caminho absoluto da pasta de origem', legacyZip: 'Ou um ZIP da instalação', legacyDestination: 'Caminho absoluto da nova pasta de destino',
    runLegacyMigration: 'Migrar arquivos', migrating: 'Migrando arquivos…', migrated: 'Arquivos migrados', legacyBackup: 'Cópia da origem no destino',
    legacyDatabasePending: 'Banco de dados pendente. Confira o registro de migrations e aplique as migrations restantes antes de usar a wiki.',
    legacyCodeReview: 'Código legado alterado, ausente ou adicional para revisar', legacyArchived: 'Outros arquivos preservados apenas no backup',
    legacyState: 'O estado local do Wrangler foi guardado no backup. Revise-o antes de reutilizá-lo.', legacyAccess: 'Revise a política do Cloudflare Access antes de publicar. O Core exige identidade verificada.',
    close: 'Fechar', setupSubtitle: 'Instalação, configuração e atualização', languageTitle: 'Idioma', languageIntro: 'Escolha o idioma do instalador e o idioma padrão da wiki.', yourLanguage: 'Seu idioma', wikiLanguage: 'Idioma da wiki', modeTitle: 'O que deseja fazer?', modeNew: 'Criar uma nova wiki', modeNewDesc: 'Comece com uma identidade e navegação independentes.', modeConfigure: 'Reconfigurar esta wiki', modeConfigureDesc: 'Preserve a instalação e altere identidade, recursos e Cloudflare.', modeUpdate: 'Atualizar o WikiCambada Core', modeUpdateDesc: 'Aplique um pacote ZIP preservando a instalação.', modeVerify: 'Verificar instalação', modeVerifyDesc: 'Confira arquivos e configurações essenciais sem alterar o projeto.', presetTitle: 'Tipo de instalação', presetIntro: 'Escolha um ponto de partida. Tudo poderá ser ajustado depois.', identityTitle: 'Identidade', siteName: 'Nome da wiki', shortName: 'Nome curto', tagline: 'Descrição curta', description: 'Descrição', homeSlug: 'Página inicial', baseUrl: 'URL pública', supportEmail: 'E-mail de suporte', defaultCategory: 'Categoria padrão', navigationTitle: 'Navegação e links', navigationIntro: 'Use uma linha por link no formato Nome | URL. Links vazios não serão exibidos.', aboutSlug: 'Página Sobre', editGuideSlug: 'Guia de edição', mainNavigation: 'Navegação principal', communityNavigation: 'Navegação da comunidade', externalNavigation: 'Links externos', brandingTitle: 'Identidade visual', logo: 'Logo principal', logoDark: 'Logo para tema escuro', favicon: 'Favicon', accentColor: 'Cor principal', defaultTheme: 'Tema padrão', interfaceFont: 'Fonte da interface', contentFont: 'Fonte dos artigos', monoFont: 'Fonte monoespaçada', featuresTitle: 'Recursos', featuresIntro: 'Estas opções criam os padrões da instalação. Administradores poderão alterar várias delas em Configurações globais.', projectName: 'Projeto Pages', databaseName: 'Banco D1', bucketName: 'Bucket R2', superAdmin: 'Super administrador', accessMode: 'Acesso', updateChannel: 'Canal de atualização', cloudflareHelp: 'IDs do D1 e credenciais do Access já existentes são preservados no wrangler.toml.', reviewTitle: 'Revisão', updateTitle: 'Atualizar o WikiCambada Core', updateIntro: 'Selecione um pacote ZIP. O setup cria um backup e preserva configuração, branding, fontes, .dev.vars e wrangler.toml.', updateFile: 'Pacote de atualização', runUpdate: 'Criar backup e atualizar', verifyTitle: 'Verificação', runVerify: 'Verificar instalação', completeTitle: 'Concluído', completeText: 'A instalação foi configurada. Aplique as migrations e faça o deploy quando estiver pronto.', back: 'Voltar', continue: 'Continuar', save: 'Salvar configuração', languageStep: 'Idioma', modeStep: 'Modo', presetStep: 'Tipo de instalação', identityStep: 'Identidade', brandingStep: 'Aparência', featuresStep: 'Recursos', navigationStep: 'Navegação', cloudflareStep: 'Cloudflare', reviewStep: 'Revisão', updateStep: 'Atualização', verifyStep: 'Verificação', completeStep: 'Concluído'
  },
  en: {
    modeMigrate: 'Migrate a legacy wiki', modeMigrateDesc: 'Migrate an installation older than version 1.1.0 to WikiCambada Core.',
    migrateStep: 'Migration', legacySource: 'Absolute path to the source folder', legacyZip: 'Or a ZIP of the installation', legacyDestination: 'Absolute path to the new destination folder',
    runLegacyMigration: 'Migrate files', migrating: 'Migrating files…', migrated: 'Files migrated', legacyBackup: 'Source copy in the destination',
    legacyDatabasePending: 'Database upgrade pending. Check the migration log and apply the remaining migrations before using the wiki.',
    legacyCodeReview: 'Changed, missing, or additional legacy code to review', legacyArchived: 'Other files kept only in the backup',
    legacyState: 'Local Wrangler state was kept in the backup. Review it before reusing it.', legacyAccess: 'Review the Cloudflare Access policy before publishing. Core requires verified identity.',
    close: 'Close', setupSubtitle: 'Installation, configuration and updates', languageTitle: 'Language', languageIntro: 'Choose the installer language and the wiki default language.', yourLanguage: 'Your language', wikiLanguage: 'Wiki language', modeTitle: 'What do you want to do?', modeNew: 'Create a new wiki', modeNewDesc: 'Start with an independent identity and navigation.', modeConfigure: 'Reconfigure this wiki', modeConfigureDesc: 'Preserve the installation and change identity, features and Cloudflare.', modeUpdate: 'Update WikiCambada Core', modeUpdateDesc: 'Apply a ZIP package while preserving the installation.', modeVerify: 'Verify installation', modeVerifyDesc: 'Check essential files and settings without changing the project.', presetTitle: 'Installation type', presetIntro: 'Choose a starting point. Everything can be changed later.', identityTitle: 'Identity', siteName: 'Wiki name', shortName: 'Short name', tagline: 'Tagline', description: 'Description', homeSlug: 'Home page', baseUrl: 'Public URL', supportEmail: 'Support email', defaultCategory: 'Default category', navigationTitle: 'Navigation and links', navigationIntro: 'Use one link per line in the format Name | URL. Empty links are not displayed.', aboutSlug: 'About page', editGuideSlug: 'Editing guide', mainNavigation: 'Main navigation', communityNavigation: 'Community navigation', externalNavigation: 'External links', brandingTitle: 'Visual identity', logo: 'Main logo', logoDark: 'Dark theme logo', favicon: 'Favicon', accentColor: 'Accent color', defaultTheme: 'Default theme', interfaceFont: 'Interface font', contentFont: 'Article font', monoFont: 'Monospace font', featuresTitle: 'Features', featuresIntro: 'These options define installation defaults. Administrators can later change many of them in Global settings.', projectName: 'Pages project', databaseName: 'D1 database', bucketName: 'R2 bucket', superAdmin: 'Super administrator', accessMode: 'Access', updateChannel: 'Update channel', cloudflareHelp: 'Existing D1 IDs and Access credentials are preserved in wrangler.toml.', reviewTitle: 'Review', updateTitle: 'Update WikiCambada Core', updateIntro: 'Select a ZIP package. Setup creates a backup and preserves configuration, branding, fonts, .dev.vars and wrangler.toml.', updateFile: 'Update package', runUpdate: 'Back up and update', verifyTitle: 'Verification', runVerify: 'Verify installation', completeTitle: 'Complete', completeText: 'The installation was configured. Apply the migrations and deploy when ready.', back: 'Back', continue: 'Continue', save: 'Save configuration', languageStep: 'Language', modeStep: 'Mode', presetStep: 'Installation type', identityStep: 'Identity', brandingStep: 'Appearance', featuresStep: 'Features', navigationStep: 'Navigation', cloudflareStep: 'Cloudflare', reviewStep: 'Review', updateStep: 'Update', verifyStep: 'Verification', completeStep: 'Complete'
  }
}

const featureLabels = {
  search: ['Busca', 'Search'], talkPages: ['Páginas de discussão', 'Talk pages'], userPages: ['Páginas de usuário', 'User pages'], publicSuggestions: ['Sugestões públicas', 'Public suggestions'], pageHistory: ['Histórico de páginas', 'Page history'], mediaUploads: ['Uploads de mídia', 'Media uploads'], templates: ['Templates editoriais', 'Editorial templates'], categories: ['Categorias', 'Categories'], randomPage: ['Página aleatória', 'Random page'], coreBadge: ['Selo Powered by', 'Powered by badge'], cloudflareBadge: ['Exibir badge "Protected by Cloudflare"', 'Show "Protected by Cloudflare" badge'], builtWithCloudflareBadge: ['Exibir badge "Built with Cloudflare"', 'Show "Built with Cloudflare" badge'], activityLogging: ['Atividade recente', 'Recent activity'], 'specialPages.index': ['Índice de páginas especiais', 'Special pages index'], 'specialPages.version': ['Página de versão', 'Version page'], 'specialPages.recentPages': ['Páginas recentes', 'Recent pages'], 'specialPages.allPages': ['Todas as páginas', 'All pages'], 'specialPages.categories': ['Índice de categorias', 'Category index'], 'specialPages.randomPage': ['Especial: página aleatória', 'Special: random page']
}

const state = { data: null, current: 0, steps: ['language', 'mode'], assets: {}, preset: 'custom', activeConfig: {} }
const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]

function locale() { return $('#interfaceLanguage').value || 'pt-BR' }
function text(key) { return translations[locale()]?.[key] || translations['pt-BR'][key] || key }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;') }
function nestedValue(source, path) { return path.split('.').reduce((value, key) => value?.[key], source) }
function setNested(target, path, value) { const parts = path.split('.'); let current = target; while (parts.length > 1) { const key = parts.shift(); current[key] ||= {}; current = current[key] } current[parts[0]] = value }
function slug(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wiki' }

function applyTranslations() {
  document.documentElement.lang = locale()
  $$('[data-i18n]').forEach(node => { node.textContent = text(node.dataset.i18n) })
  renderProgress()
  renderPresets()
  renderFeatures()
}

function mode() { return document.querySelector('input[name="mode"]:checked')?.value || 'configure' }

function newConfigForLanguage(language) {
  const config = structuredClone(state.data?.newConfig || {})
  const english = language === 'en'
  config.site ||= {}
  config.site.language = language
  config.site.interfaceLanguage = language
  config.site.name = english ? 'My Wiki' : 'Minha Wiki'
  config.site.shortName = config.site.name
  config.site.tagline = english ? 'A wiki powered by WikiCambada Core' : 'Uma wiki executada pelo WikiCambada Core'
  config.site.description = config.site.tagline
  config.site.homeSlug = english ? 'main-page' : 'pagina-principal'
  config.site.aboutSlug = english ? 'about' : 'sobre'
  config.site.editGuideSlug = english ? 'editing-guide' : 'como-editar'
  config.navigation ||= {}
  config.navigation.main = [
    { label: english ? 'Main page' : 'Página principal', href: '/', kind: 'home' },
    { label: english ? 'Special pages' : 'Páginas especiais', href: '/wiki/especial', kind: 'page', feature: 'specialPages.index' },
    { label: english ? 'Random page' : 'Página aleatória', href: '/wiki/especial/pagina-aleatoria', kind: 'random', feature: 'randomPage' }
  ]
  config.navigation.community = [
    { label: english ? 'About' : 'Sobre', href: `/wiki/${config.site.aboutSlug}`, kind: 'page' },
    { label: english ? 'How to edit' : 'Como editar', href: `/wiki/${config.site.editGuideSlug}`, kind: 'page' }
  ]
  config.navigation.external = []
  return config
}

function applyModeDefaults(selected) {
  if (!state.data || !['new', 'configure'].includes(selected)) return
  const installerLanguage = locale()
  const wikiLanguage = $('#wikiLanguage').value || installerLanguage
  if (selected === 'new') {
    state.preset = 'documentation'
    state.assets = {}
    fillForm(newConfigForLanguage(wikiLanguage))
    $('#interfaceLanguage').value = installerLanguage
    $('#wikiLanguage').value = wikiLanguage
    applyPreset(state.preset)
  } else {
    state.preset = state.data.installation?.distribution || 'custom'
    fillForm(state.data.config || {})
    $('#interfaceLanguage').value = installerLanguage
  }
  applyTranslations()
}

function buildSteps() {
  const selected = mode()
  state.steps = ['update', 'verify', 'migrate'].includes(selected) ? ['language', 'mode', selected] : ['language', 'mode', 'preset', 'identity', 'branding', 'features', 'navigation', 'cloudflare', 'review', 'complete']
  if (state.current >= state.steps.length) state.current = state.steps.length - 1
  render()
}

function renderProgress() {
  const names = { language: 'languageStep', mode: 'modeStep', preset: 'presetStep', identity: 'identityStep', branding: 'brandingStep', features: 'featuresStep', navigation: 'navigationStep', cloudflare: 'cloudflareStep', review: 'reviewStep', update: 'updateStep', verify: 'verifyStep', migrate: 'migrateStep', complete: 'completeStep' }
  $('#stepList').innerHTML = state.steps.map((step, index) => `<li class="${index === state.current ? 'active' : index < state.current ? 'done' : ''}">${escapeHtml(text(names[step]))}</li>`).join('')
}

function render() {
  const currentStep = state.steps[state.current]
  $('#closeButton').hidden = currentStep !== 'complete'
  $$('.step').forEach(step => { step.hidden = step.dataset.step !== currentStep })
  $('#backButton').hidden = state.current === 0 || currentStep === 'complete'
  $('#nextButton').hidden = ['update', 'verify', 'migrate', 'complete'].includes(currentStep)
  $('#nextButton').textContent = currentStep === 'review' ? text('save') : text('continue')
  renderProgress()
  if (currentStep === 'review') renderReview()
}

function renderPresets() {
  if (!state.data) return
  const presets = state.data.presets || {}
  $('#presetGrid').innerHTML = Object.entries(presets).map(([id, preset]) => {
    const name = preset.name?.[locale()] || preset.name?.['pt-BR'] || id
    const description = preset.description?.[locale()] || preset.description?.['pt-BR'] || ''
    return `<label class="choice-card"><input type="radio" name="preset" value="${escapeHtml(id)}" ${id === state.preset ? 'checked' : ''}/><strong>${escapeHtml(name)}</strong><span>${escapeHtml(description)}</span></label>`
  }).join('')
}

function featurePaths() { return Object.keys(featureLabels) }
function renderFeatures() {
  const currentFeatures = collectFeaturesFromForm() || state.data?.config?.features || {}
  $('#featureGrid').innerHTML = featurePaths().map(path => {
    const labels = featureLabels[path]
    const label = locale() === 'en' ? labels[1] : labels[0]
    const checked = (path === 'builtWithCloudflareBadge' ? nestedValue(currentFeatures, path) === true : nestedValue(currentFeatures, path) !== false)
    return `<label class="feature-card"><input type="checkbox" data-feature="${escapeHtml(path)}" ${checked ? 'checked' : ''}/><strong>${escapeHtml(label)}</strong><small>${escapeHtml(path)}</small></label>`
  }).join('')
}

function collectFeaturesFromForm() {
  const inputs = $$('[data-feature]')
  if (!inputs.length) return null
  const features = {}
  inputs.forEach(input => setNested(features, input.dataset.feature, input.checked))
  return features
}

function applyPreset(id) {
  state.preset = id
  const preset = state.data.presets?.[id]
  if (!preset?.features || id === 'custom') return
  if (preset.access?.mode) $('#accessMode').value = preset.access.mode
  renderFeatures()
  $$('[data-feature]').forEach(input => { input.checked = (input.dataset.feature === 'builtWithCloudflareBadge' ? nestedValue(preset.features, input.dataset.feature) === true : nestedValue(preset.features, input.dataset.feature) !== false) })
}

function navigationLines(items = []) {
  return items.map(item => `${item.label || item.href || ''} | ${item.href || ''}`).join('\n')
}

function parseNavigation(value, section) {
  const existing = state.activeConfig?.navigation?.[section] || []
  return String(value || '').split(/\r?\n/).map(line => {
    const [labelPart, ...urlParts] = line.split('|')
    const label = labelPart.trim()
    const href = urlParts.join('|').trim()
    if (!label || !href) return null
    const previous = existing.find(item => item.href === href) || {}
    const external = /^https?:\/\//i.test(href)
    const kind = previous.kind || (external ? 'external' : href === '/' ? 'home' : href.includes('/especial/pagina-aleatoria') ? 'random' : 'page')
    const feature = previous.feature || (href.endsWith('/wiki/especial') ? 'specialPages.index' : kind === 'random' ? 'randomPage' : '')
    return { label, href, kind, ...(feature ? { feature } : {}) }
  }).filter(Boolean)
}

function fillForm(config) {
  state.activeConfig = structuredClone(config || {})
  const site = config.site || {}, branding = config.branding || {}, appearance = config.appearance || {}, cloudflare = config.cloudflare || {}, access = config.access || {}, navigation = config.navigation || {}
  $('#interfaceLanguage').value = site.interfaceLanguage || 'pt-BR'
  $('#wikiLanguage').value = site.language || 'pt-BR'
  $('#siteName').value = site.name || ''
  $('#shortName').value = site.shortName || site.name || ''
  $('#tagline').value = site.tagline || ''
  $('#description').value = site.description || ''
  $('#homeSlug').value = site.homeSlug || 'pagina-principal'
  $('#baseUrl').value = site.baseUrl || ''
  $('#supportEmail').value = site.supportEmail || ''
  $('#defaultCategory').value = site.defaultCategory || ''
  $('#aboutSlug').value = site.aboutSlug || ''
  $('#editGuideSlug').value = site.editGuideSlug || ''
  $('#mainNavigation').value = navigationLines(navigation.main)
  $('#communityNavigation').value = navigationLines(navigation.community)
  $('#externalNavigation').value = navigationLines(navigation.external)
  $('#accentColor').value = appearance.accentColor || '#3366cc'
  $('#defaultTheme').value = appearance.defaultTheme || 'auto'
  $('#interfaceFont').value = appearance.fonts?.interface || 'system-ui, sans-serif'
  $('#contentFont').value = appearance.fonts?.content || 'Georgia, serif'
  $('#monoFont').value = appearance.fonts?.monospace || 'ui-monospace, monospace'
  $('#projectName').value = cloudflare.projectName || slug(site.shortName || site.name)
  $('#databaseName').value = cloudflare.databaseName || `${slug(site.shortName || site.name)}-db`
  $('#bucketName').value = cloudflare.bucketName || `${slug(site.shortName || site.name)}-uploads`
  $('#superAdminEmail').value = access.superAdminEmail || ''
  $('#accessMode').value = access.mode || 'cloudflare-access'
  $('#updateChannel').value = state.data.installation?.updateChannel || 'stable'
  $('#logoPreview').src = branding.logo || ''
  $('#logoDarkPreview').src = branding.logoDark || branding.logo || ''
  $('#faviconPreview').src = branding.favicon || ''
  renderFeatures()
  $$('[data-feature]').forEach(input => { input.checked = (input.dataset.feature === 'builtWithCloudflareBadge' ? nestedValue(config.features || {}, input.dataset.feature) === true : nestedValue(config.features || {}, input.dataset.feature) !== false) })
}

function fileData(input, preview, key) {
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { state.assets[key] = { name: file.name, type: file.type, data: reader.result }; preview.src = reader.result }
  reader.readAsDataURL(file)
}

function collectConfig() {
  return {
    site: { name: $('#siteName').value.trim(), shortName: $('#shortName').value.trim(), tagline: $('#tagline').value.trim(), description: $('#description').value.trim(), language: $('#wikiLanguage').value, interfaceLanguage: $('#wikiLanguage').value, homeSlug: $('#homeSlug').value.trim() || 'pagina-principal', baseUrl: $('#baseUrl').value.trim(), supportEmail: $('#supportEmail').value.trim(), aboutSlug: $('#aboutSlug').value.trim(), editGuideSlug: $('#editGuideSlug').value.trim(), defaultCategory: $('#defaultCategory').value.trim() },
    navigation: { main: parseNavigation($('#mainNavigation').value, 'main'), community: parseNavigation($('#communityNavigation').value, 'community'), external: parseNavigation($('#externalNavigation').value, 'external') },
    appearance: { accentColor: $('#accentColor').value, defaultTheme: $('#defaultTheme').value, fonts: { interface: $('#interfaceFont').value.trim(), content: $('#contentFont').value.trim(), monospace: $('#monoFont').value.trim() } },
    features: collectFeaturesFromForm() || {},
    access: { mode: $('#accessMode').value, superAdminEmail: $('#superAdminEmail').value.trim().toLowerCase(), strict: true },
    cloudflare: { projectName: $('#projectName').value.trim(), databaseName: $('#databaseName').value.trim(), bucketName: $('#bucketName').value.trim() }
  }
}

function renderReview() {
  const config = collectConfig()
  const rows = [[text('siteName'), config.site.name], [text('wikiLanguage'), config.site.language], [text('baseUrl'), config.site.baseUrl || '—'], [text('projectName'), config.cloudflare.projectName], [text('databaseName'), config.cloudflare.databaseName], [text('bucketName'), config.cloudflare.bucketName], [text('superAdmin'), config.access.superAdminEmail || '—'], [text('presetTitle'), state.preset]]
  $('#reviewPanel').innerHTML = rows.map(([label, value]) => `<div class="review-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join('')
}

function notice(message) { const box = $('#notice'); box.textContent = message; box.hidden = !message }
const setupToken = document.querySelector('meta[name="setup-token"]').content
const connection = new EventSource('/api/events?token=' + encodeURIComponent(setupToken))
async function api(path, options = {}) {
  const language = locale()
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', 'x-setup-token': setupToken, 'x-setup-language': language, ...options.headers } }).catch(() => {
    throw new Error(language === 'en' ? 'Could not connect to setup.' : 'Não foi possível conectar ao setup.')
  })
  const data = await response.json().catch(() => {
    throw new Error(language === 'en' ? 'Invalid setup response.' : 'Resposta inválida do setup.')
  })
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`)
  return data
}
async function readFileAsData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(locale() === 'en' ? 'Could not read the file.' : 'Não foi possível ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

async function migrate(event) {
  event.preventDefault()
  const button = $('#runLegacyMigration'), output = $('#legacyResult')
  const source = $('#legacySource').value.trim(), zip = $('#legacyZip').files?.[0]
  button.disabled = true
  output.hidden = false
  output.textContent = text('migrating')
  try {
    if (zip?.size > 64 * 1024 * 1024) throw new Error(locale() === 'en' ? 'The ZIP exceeds 64 MB.' : 'O ZIP excede 64 MB.')
    const result = await api('/api/migrate-legacy', { method: 'POST', body: JSON.stringify({ source, file: zip ? { data: await readFileAsData(zip) } : undefined, destination: $('#legacyDestination').value.trim() }) })
    const lines = [text('migrated') + ' · ' + result.sourceVersion + ' → ' + result.coreVersion, result.destination,
      text('legacyBackup') + ' · ' + result.backup, '', text('legacyDatabasePending')]
    if (result.modifiedCode.length) lines.push('', text('legacyCodeReview'), ...result.modifiedCode)
    if (result.archivedFiles.length) lines.push('', text('legacyArchived'), ...result.archivedFiles)
    if (result.hasLocalState) lines.push('', text('legacyState'))
    if (result.accessReview) lines.push('', text('legacyAccess'))
    output.textContent = lines.join('\n')
  } catch (error) { output.textContent = error.message }
  finally { button.disabled = false }
}

async function save() {
  notice('')
  $('#nextButton').disabled = true
  try {
    const config = collectConfig()
    if (!config.site.name || !config.site.shortName) throw new Error(locale() === 'en' ? 'Wiki name and short name are required.' : 'Nome da wiki e nome curto são obrigatórios.')
    await api('/api/configure', { method: 'POST', body: JSON.stringify({ intent: mode(), preset: state.preset, updateChannel: $('#updateChannel').value, config, assets: state.assets }) })
    state.current = state.steps.indexOf('complete')
    render()
  } catch (error) { notice(error.message) } finally { $('#nextButton').disabled = false }
}

async function verify() {
  const data = await api('/api/verify')
  $('#verifyResults').innerHTML = data.checks.map(item => `<div class="verify-item ${item.ok ? '' : 'bad'}"><strong>${item.ok ? '✓' : '✗'} ${escapeHtml(item.name)}</strong><br><span>${escapeHtml(item.message)}</span></div>`).join('')
}

async function update() {
  const file = $('#updateFile').files?.[0]
  if (!file) return notice(locale() === 'en' ? 'Select a ZIP package.' : 'Selecione um pacote ZIP.')
  $('#runUpdate').disabled = true
  $('#updateLog').textContent = locale() === 'en' ? 'Reading package…' : 'Lendo pacote…'
  try {
    const data = await api('/api/update', { method: 'POST', body: JSON.stringify({ file: { name: file.name, data: await readFileAsData(file) } }) })
    const modified = data.modifiedFilesBeforeUpdate || []
    const modifiedText = modified.length
      ? `\n${locale() === 'en' ? 'Locally modified Core files backed up' : 'Arquivos do Core modificados localmente e copiados no backup'}: ${modified.length}\n${modified.slice(0, 12).join('\n')}`
      : ''
    $('#updateLog').textContent = `${locale() === 'en' ? 'Update complete' : 'Atualização concluída'}\n${locale() === 'en' ? 'Version' : 'Versão'}: ${data.version}\nBackup: ${data.backup}${modifiedText}`
  } catch (error) { $('#updateLog').textContent = error.message } finally { $('#runUpdate').disabled = false }
}

function updateSummary() {
  const installation = state.data?.installation || {}
  $('#installationSummary').innerHTML = `<strong>${escapeHtml(state.data?.config?.site?.name || 'WikiCambada Core')}</strong><br>Core: ${escapeHtml(installation.coreVersion || 'legado')}<br>Config: ${escapeHtml(installation.configSchema || '—')}<br>D1: ${escapeHtml(installation.databaseSchema || '—')}`
}

async function boot() {
  state.data = await api('/api/state')
  state.preset = state.data.installation?.distribution || 'custom'
  fillForm(state.data.config || {})
  buildSteps()
  applyTranslations()
  updateSummary()

  $('#interfaceLanguage').addEventListener('change', applyTranslations)
  $('#wikiLanguage').addEventListener('change', () => { if (mode() === 'new' && state.current <= 1) applyModeDefaults('new') })
  document.addEventListener('change', event => {
    if (event.target.matches('input[name="mode"]')) { applyModeDefaults(event.target.value); buildSteps() }
    if (event.target.matches('input[name="preset"]')) applyPreset(event.target.value)
  })
  $('#siteName').addEventListener('input', () => { if (!$('#shortName').dataset.touched) $('#shortName').value = $('#siteName').value; if (!$('#projectName').dataset.touched) $('#projectName').value = slug($('#siteName').value) })
  ;['shortName', 'projectName', 'databaseName', 'bucketName'].forEach(id => $(`#${id}`).addEventListener('input', event => { event.target.dataset.touched = '1' }))
  $('#logoFile').addEventListener('change', () => fileData($('#logoFile'), $('#logoPreview'), 'logo'))
  $('#logoDarkFile').addEventListener('change', () => fileData($('#logoDarkFile'), $('#logoDarkPreview'), 'logoDark'))
  $('#faviconFile').addEventListener('change', () => fileData($('#faviconFile'), $('#faviconPreview'), 'favicon'))
  $('#backButton').addEventListener('click', () => { if (state.current > 0) state.current -= 1; render() })
  $('#nextButton').addEventListener('click', async () => { if (state.steps[state.current] === 'review') return save(); state.current += 1; render() })
  $('#closeButton').addEventListener('click', async () => {
    $('#closeButton').disabled = true
    try { await api('/api/shutdown', { method: 'POST', body: '{}' }); connection.close(); window.close() }
    catch (error) { $('#closeButton').disabled = false; notice(error.message) }
  })
  $('#runVerify').addEventListener('click', verify)
  $('#runUpdate').addEventListener('click', update)
  $('#legacyMigrationForm').addEventListener('submit', migrate)
}

boot().catch(error => notice(error.message))
