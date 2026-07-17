const translations = {
  'pt-BR': {
    setupSubtitle: 'Instalação, configuração e atualização', languageTitle: 'Idioma', languageIntro: 'Escolha o idioma do instalador e o idioma padrão da wiki.', yourLanguage: 'Seu idioma', wikiLanguage: 'Idioma da wiki', modeTitle: 'O que deseja fazer?', modeNew: 'Criar uma nova wiki', modeNewDesc: 'Comece com uma identidade e navegação independentes.', modeConfigure: 'Reconfigurar esta wiki', modeConfigureDesc: 'Preserve a instalação e altere identidade, recursos e Cloudflare.', modeUpdate: 'Atualizar o WikiCambada Core', modeUpdateDesc: 'Aplique um pacote ZIP preservando a instalação.', modeVerify: 'Verificar instalação', modeVerifyDesc: 'Confira arquivos e configurações essenciais sem alterar o projeto.', presetTitle: 'Tipo de instalação', presetIntro: 'Escolha um ponto de partida. Tudo poderá ser ajustado depois.', identityTitle: 'Identidade', siteName: 'Nome da wiki', shortName: 'Nome curto', tagline: 'Descrição curta', description: 'Descrição', homeSlug: 'Página inicial', baseUrl: 'URL pública', supportEmail: 'E-mail de suporte', defaultCategory: 'Categoria padrão', navigationTitle: 'Navegação e links', navigationIntro: 'Use uma linha por link no formato Nome | URL. Links vazios não serão exibidos.', aboutSlug: 'Página Sobre', editGuideSlug: 'Guia de edição', mainNavigation: 'Navegação principal', communityNavigation: 'Navegação da comunidade', externalNavigation: 'Links externos', brandingTitle: 'Identidade visual', logo: 'Logo principal', logoDark: 'Logo para tema escuro', favicon: 'Favicon', accentColor: 'Cor principal', defaultTheme: 'Tema padrão', interfaceFont: 'Fonte da interface', contentFont: 'Fonte dos artigos', monoFont: 'Fonte monoespaçada', featuresTitle: 'Recursos', featuresIntro: 'Estas opções criam os padrões da instalação. Administradores poderão alterar várias delas em Configurações globais.', projectName: 'Projeto Pages', databaseName: 'Banco D1', bucketName: 'Bucket R2', superAdmin: 'Super administrador', accessMode: 'Acesso', updateChannel: 'Canal de atualização', cloudflareHelp: 'IDs do D1 e credenciais do Access já existentes são preservados no wrangler.toml.', reviewTitle: 'Revisão', updateTitle: 'Atualizar o WikiCambada Core', updateIntro: 'Selecione um pacote ZIP. O setup cria um backup e preserva configuração, branding, fontes, .dev.vars e wrangler.toml.', updateFile: 'Pacote de atualização', runUpdate: 'Criar backup e atualizar', verifyTitle: 'Verificação', runVerify: 'Verificar instalação', completeTitle: 'Concluído', completeText: 'A instalação foi configurada. Aplique a migration 0015 e faça o deploy quando estiver pronto.', back: 'Voltar', continue: 'Continuar', save: 'Salvar configuração', languageStep: 'Idioma', modeStep: 'Modo', presetStep: 'Tipo de instalação', identityStep: 'Identidade', brandingStep: 'Aparência', featuresStep: 'Recursos', navigationStep: 'Navegação', cloudflareStep: 'Cloudflare', reviewStep: 'Revisão', updateStep: 'Atualização', verifyStep: 'Verificação', completeStep: 'Concluído'
  },
  en: {
    setupSubtitle: 'Installation, configuration and updates', languageTitle: 'Language', languageIntro: 'Choose the installer language and the wiki default language.', yourLanguage: 'Your language', wikiLanguage: 'Wiki language', modeTitle: 'What do you want to do?', modeNew: 'Create a new wiki', modeNewDesc: 'Start with an independent identity and navigation.', modeConfigure: 'Reconfigure this wiki', modeConfigureDesc: 'Preserve the installation and change identity, features and Cloudflare.', modeUpdate: 'Update WikiCambada Core', modeUpdateDesc: 'Apply a ZIP package while preserving the installation.', modeVerify: 'Verify installation', modeVerifyDesc: 'Check essential files and settings without changing the project.', presetTitle: 'Installation type', presetIntro: 'Choose a starting point. Everything can be changed later.', identityTitle: 'Identity', siteName: 'Wiki name', shortName: 'Short name', tagline: 'Tagline', description: 'Description', homeSlug: 'Home page', baseUrl: 'Public URL', supportEmail: 'Support email', defaultCategory: 'Default category', navigationTitle: 'Navigation and links', navigationIntro: 'Use one link per line in the format Name | URL. Empty links are not displayed.', aboutSlug: 'About page', editGuideSlug: 'Editing guide', mainNavigation: 'Main navigation', communityNavigation: 'Community navigation', externalNavigation: 'External links', brandingTitle: 'Visual identity', logo: 'Main logo', logoDark: 'Dark theme logo', favicon: 'Favicon', accentColor: 'Accent color', defaultTheme: 'Default theme', interfaceFont: 'Interface font', contentFont: 'Article font', monoFont: 'Monospace font', featuresTitle: 'Features', featuresIntro: 'These options define installation defaults. Administrators can later change many of them in Global settings.', projectName: 'Pages project', databaseName: 'D1 database', bucketName: 'R2 bucket', superAdmin: 'Super administrator', accessMode: 'Access', updateChannel: 'Update channel', cloudflareHelp: 'Existing D1 IDs and Access credentials are preserved in wrangler.toml.', reviewTitle: 'Review', updateTitle: 'Update WikiCambada Core', updateIntro: 'Select a ZIP package. Setup creates a backup and preserves configuration, branding, fonts, .dev.vars and wrangler.toml.', updateFile: 'Update package', runUpdate: 'Back up and update', verifyTitle: 'Verification', runVerify: 'Verify installation', completeTitle: 'Complete', completeText: 'The installation was configured. Apply migration 0015 and deploy when ready.', back: 'Back', continue: 'Continue', save: 'Save configuration', languageStep: 'Language', modeStep: 'Mode', presetStep: 'Installation type', identityStep: 'Identity', brandingStep: 'Appearance', featuresStep: 'Features', navigationStep: 'Navigation', cloudflareStep: 'Cloudflare', reviewStep: 'Review', updateStep: 'Update', verifyStep: 'Verification', completeStep: 'Complete'
  }
}

const featureLabels = {
  search: ['Busca', 'Search'], talkPages: ['Páginas de discussão', 'Talk pages'], userPages: ['Páginas de usuário', 'User pages'], publicSuggestions: ['Sugestões públicas', 'Public suggestions'], pageHistory: ['Histórico de páginas', 'Page history'], mediaUploads: ['Uploads de mídia', 'Media uploads'], templates: ['Templates editoriais', 'Editorial templates'], categories: ['Categorias', 'Categories'], randomPage: ['Página aleatória', 'Random page'], coreBadge: ['Selo Powered by', 'Powered by badge'], activityLogging: ['Atividade recente', 'Recent activity'], 'specialPages.index': ['Índice de páginas especiais', 'Special pages index'], 'specialPages.version': ['Página de versão', 'Version page'], 'specialPages.recentPages': ['Páginas recentes', 'Recent pages'], 'specialPages.allPages': ['Todas as páginas', 'All pages'], 'specialPages.categories': ['Índice de categorias', 'Category index'], 'specialPages.randomPage': ['Especial: página aleatória', 'Special: random page']
}

const state = { data: null, current: 0, steps: ['language', 'mode'], assets: {}, preset: 'custom', activeConfig: {} }
const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]

function locale() { return $('#interfaceLanguage').value || 'pt-BR' }
function text(key) { return translations[locale()]?.[key] || translations['pt-BR'][key] || key }
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
  state.steps = selected === 'update' ? ['language', 'mode', 'update'] : selected === 'verify' ? ['language', 'mode', 'verify'] : ['language', 'mode', 'preset', 'identity', 'branding', 'features', 'navigation', 'cloudflare', 'review', 'complete']
  if (state.current >= state.steps.length) state.current = state.steps.length - 1
  render()
}

function renderProgress() {
  const names = { language: 'languageStep', mode: 'modeStep', preset: 'presetStep', identity: 'identityStep', branding: 'brandingStep', features: 'featuresStep', navigation: 'navigationStep', cloudflare: 'cloudflareStep', review: 'reviewStep', update: 'updateStep', verify: 'verifyStep', complete: 'completeStep' }
  $('#stepList').innerHTML = state.steps.map((step, index) => `<li class="${index === state.current ? 'active' : index < state.current ? 'done' : ''}">${text(names[step])}</li>`).join('')
}

function render() {
  const currentStep = state.steps[state.current]
  $$('.step').forEach(step => { step.hidden = step.dataset.step !== currentStep })
  $('#backButton').hidden = state.current === 0 || currentStep === 'complete'
  $('#nextButton').hidden = ['update', 'verify', 'complete'].includes(currentStep)
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
    return `<label class="choice-card"><input type="radio" name="preset" value="${id}" ${id === state.preset ? 'checked' : ''}/><strong>${name}</strong><span>${description}</span></label>`
  }).join('')
}

function featurePaths() { return Object.keys(featureLabels) }
function renderFeatures() {
  const currentFeatures = collectFeaturesFromForm() || state.data?.config?.features || {}
  $('#featureGrid').innerHTML = featurePaths().map(path => {
    const labels = featureLabels[path]
    const label = locale() === 'en' ? labels[1] : labels[0]
    const checked = nestedValue(currentFeatures, path) !== false
    return `<label class="feature-card"><input type="checkbox" data-feature="${path}" ${checked ? 'checked' : ''}/><strong>${label}</strong><small>${path}</small></label>`
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
  renderFeatures()
  $$('[data-feature]').forEach(input => { input.checked = nestedValue(preset.features, input.dataset.feature) !== false })
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
  $$('[data-feature]').forEach(input => { input.checked = nestedValue(config.features || {}, input.dataset.feature) !== false })
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
  $('#reviewPanel').innerHTML = rows.map(([label, value]) => `<div class="review-row"><strong>${label}</strong><span>${value}</span></div>`).join('')
}

function notice(message) { const box = $('#notice'); box.textContent = message; box.hidden = !message }
async function api(path, options = {}) { const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options }); const data = await response.json(); if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`); return data }
async function readFileAsData(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) }) }

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
  $('#verifyResults').innerHTML = data.checks.map(item => `<div class="verify-item ${item.ok ? '' : 'bad'}"><strong>${item.ok ? '✓' : '✗'} ${item.name}</strong><br><span>${item.message}</span></div>`).join('')
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
  $('#installationSummary').innerHTML = `<strong>${state.data?.config?.site?.name || 'WikiCambada Core'}</strong><br>Core: ${installation.coreVersion || 'legado'}<br>Config: ${installation.configSchema || '—'}<br>D1: ${installation.databaseSchema || '—'}`
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
  $('#runVerify').addEventListener('click', verify)
  $('#runUpdate').addEventListener('click', update)
}

boot().catch(error => notice(error.message))
