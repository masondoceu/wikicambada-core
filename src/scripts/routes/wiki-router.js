import { exactSearchResult, isGeneratedSpecialSlug, searchTitleForMatch, specialFeature, specialPageInfo, specialPageSlugs } from './wiki-special.js'
import { DEFAULT_RANDOM_SLUGS, HOME_SLUG, SLOGAN, SITE_CONFIG, SITE_NAME, featureEnabled, loadGlobalSettings } from '../core/config.js'
import { diagnosticDetail, interfaceLanguage, interfaceLocale, searchMatchLabel, t } from '../core/i18n.js'
import { articleSlugFromTalk, escapeHtml, normalizeKey, pageUrl, parseRoute, searchUrl, slugify, titleFromSlug } from '../core/utils.js'
import { adminPageAction, clearPublicCache, clearRecentActivity, createIpRule, deleteAdminTemplate, deleteAdminUser, deleteAdvancedAlias, deleteAdvancedRedirect, deleteIpRule, deletePage, deleteStoredFile, forceSystemAction, getAdminGlobalSettings, getAdminUsers, getAdvancedRedirects, getCategory, getCurrentUser, getFile, getMaintenanceReport, getPage, getPageFresh, getPageList, lookupPages, getRandomPage, getRecentActivity, getRevision, getSearchPage, getStorageOverview, getSystemStatus, getTrash, importSeedBackup, listAdminPages, listAdminTemplates, listCategories, listFiles, listIpRules, listPages, listProposals, listRevisions, listTemplates, moderateProposal, restoreRevision, saveAdvancedAlias, saveAdvancedRedirect, saveAdminGlobalSettings, savePage, saveAdminTemplate, searchPages, submitEditProposal, trashAction, updateAdminUser, updateProfile, updateStoredFile, uploadImage } from '../services/wiki-api.js'
import { markdownToHtml } from '../renderers/wiki-markdown.js'
import { accessRequiredHtml, adminActivityHtml, adminBackupHtml, adminDashboardHtml, adminIpHtml, adminMaintenanceHtml, adminPagesHtml, adminProposalsHtml, adminRedirectsHtml, adminStorageHtml, adminSystemHtml, adminSettingsHtml, adminTemplatesHtml, adminTrashHtml, adminUsersHtml, allPagesHtml, articleHtml, categoriesIndexHtml, categoryPageHtml, editorPreviewHtml, fatalErrorHtml, featureDisabledHtml, fileNamespaceBlockedHtml, filePageHtml, fileUploadPageHtml, historyHtml, notFoundHtml, proposalSubmittedHtml, recentPagesHtml, revisionCompareHtml, revisionHtml, searchHtml, setDocumentTitle, specialPagesIndexHtml, versionPageHtml } from '../renderers/wiki-renderer.js'

const ui = (portuguese, english) => interfaceLanguage() === 'en' ? english : portuguese

export function createWikiRouter({ app, searchForm, searchInput }) {

  function pageVisibleByFeatures(pageOrSlug) {
    const slug = String(typeof pageOrSlug === 'string' ? pageOrSlug : pageOrSlug?.slug || '').trim().toLowerCase()
    if (!slug) return false
    if (slug === 'especial' || slug === 'special' || slug.startsWith('especial/') || slug.startsWith('special/') || slug === 'arquivo' || slug.startsWith('arquivo/')) return false
    if (slug.startsWith('discussao/') && !featureEnabled('talkPages')) return false
    if (slug.startsWith('usuario/') && !featureEnabled('userPages')) return false
    if (slug.startsWith('categoria/') && !featureEnabled('categories')) return false
    return true
  }

  function editGuideSlug() {
    return SITE_CONFIG.site.editGuideSlug || (interfaceLocale() === 'en-US' ? 'editing-guide' : 'como-editar')
  }

  function canonicalizeSpecialRoute(info) {
    if (!info) return
    const current = currentState()
    if (current.mode !== 'read' || current.slug === info.canonical) return
    history.replaceState(history.state, '', pageUrl(info.canonical))
  }


  function isValidIpv4(value) {
    const parts = value.split('.')
    return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  }

  function isValidIpv6(value) {
    const clean = String(value || '').replace(/^\[|\]$/g, '').toLowerCase()
    if (!clean || clean.includes(':::')) return false
    const parts = clean.split('::')
    if (parts.length > 2) return false

    const countGroups = section => {
      if (!section) return 0
      const groups = section.split(':')
      let count = 0
      for (let index = 0; index < groups.length; index += 1) {
        const group = groups[index]
        if (!group) return NaN
        if (group.includes('.')) {
          if (index !== groups.length - 1 || !isValidIpv4(group)) return NaN
          count += 2
          continue
        }
        if (!/^[0-9a-f]{1,4}$/.test(group)) return NaN
        count += 1
      }
      return count
    }

    const left = countGroups(parts[0] || '')
    const right = countGroups(parts[1] || '')
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false
    return parts.length === 2 ? left + right < 8 : left === 8
  }

  function isValidIpOrCidr(value) {
    const clean = String(value || '').trim().replace(/^\[|\]$/g, '')
    const pieces = clean.split('/')
    if (!clean || pieces.length > 2) return false
    const address = pieces[0]
    const isV6 = address.includes(':')
    const isValidAddress = isV6 ? isValidIpv6(address) : isValidIpv4(address)
    if (!isValidAddress) return false
    if (pieces.length === 1) return true
    if (!/^\d{1,3}$/.test(pieces[1])) return false
    const prefix = Number(pieces[1])
    return Number.isInteger(prefix) && prefix >= 0 && prefix <= (isV6 ? 128 : 32)
  }

  let randomTitles = [...DEFAULT_RANDOM_SLUGS]
  let currentUser = { authenticated: false, canEdit: false, email: null }
  let routeSerial = 0
  let progressTimers = []
  let searchSuggestionTimer = 0

  function routeProgressElement() {
    let element = document.querySelector('[data-route-progress]')
    if (!element) {
      element = document.createElement('div')
      element.className = 'route-progress'
      element.dataset.routeProgress = ''
      element.setAttribute('aria-hidden', 'true')
      document.body.prepend(element)
    }
    return element
  }

  function clearProgressTimers() {
    progressTimers.forEach(timer => clearTimeout(timer))
    progressTimers = []
  }

  function startRouteProgress() {
    clearProgressTimers()
    const element = routeProgressElement()
    element.classList.remove('is-finishing', 'is-saving')
    element.style.setProperty('--route-progress', '0.18')
    element.classList.add('is-loading')
    progressTimers.push(setTimeout(() => element.style.setProperty('--route-progress', '0.62'), 180))
    progressTimers.push(setTimeout(() => element.style.setProperty('--route-progress', '0.86'), 700))
  }

  function finishRouteProgress() {
    clearProgressTimers()
    const element = routeProgressElement()
    element.style.setProperty('--route-progress', '1')
    element.classList.add('is-finishing')
    progressTimers.push(setTimeout(() => {
      element.classList.remove('is-loading', 'is-finishing', 'is-saving')
      element.style.setProperty('--route-progress', '0')
    }, 260))
  }

  function startSaveProgress() {
    clearProgressTimers()
    const element = routeProgressElement()
    element.classList.remove('is-finishing')
    element.classList.add('is-loading', 'is-saving')
    element.style.setProperty('--route-progress', '0.16')
    progressTimers.push(setTimeout(() => element.style.setProperty('--route-progress', '0.48'), 180))
    progressTimers.push(setTimeout(() => element.style.setProperty('--route-progress', '0.74'), 650))
    progressTimers.push(setTimeout(() => element.style.setProperty('--route-progress', '0.91'), 1400))
  }

  function finishSaveProgress() {
    clearProgressTimers()
    const element = routeProgressElement()
    element.style.setProperty('--route-progress', '1')
    element.classList.add('is-finishing')
    progressTimers.push(setTimeout(() => {
      element.classList.remove('is-loading', 'is-finishing', 'is-saving')
      element.style.setProperty('--route-progress', '0')
    }, 280))
  }

  function isCurrentRoute(serial) {
    return serial === routeSerial
  }

  const scrollPositions = new Map()
  let displayedEntry, displayedPath, pendingScroll
  const pathAndQuery = () => window.location.pathname + window.location.search

  function currentEntry() {
    if (!history.state?.wikiEntry) history.replaceState({ ...history.state, wikiEntry: crypto.randomUUID() }, '')
    return history.state.wikiEntry
  }

  function rememberScroll() {
    if (displayedEntry) scrollPositions.set(displayedEntry, window.scrollY)
  }

  function positionPage(top) {
    displayedEntry = currentEntry()
    displayedPath = pathAndQuery()
    if (top !== undefined) window.scrollTo({ top, left: 0, behavior: 'instant' })
    else if (!scrollToCurrentHash()) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    rememberScroll()
  }

  function commitHtml(serial, html) {
    if (!isCurrentRoute(serial)) return false
    app.innerHTML = html
    if (pendingScroll?.serial === serial) {
      positionPage(pendingScroll.top)
      pendingScroll = null
    }
    return true
  }


  function scrollToCurrentHash() {
    const raw = window.location.hash ? window.location.hash.slice(1) : ''
    if (!raw) return false

    let id = raw
    try { id = decodeURIComponent(raw) } catch {}
    const target = document.getElementById(id)
    if (!target) return false

    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })
    return true
  }

  function collectKnownSlugs(pages) {
    const slugs = new Set(specialPageSlugs())
    for (const page of pages || []) {
      if (page.slug) slugs.add(page.slug)
      for (const alias of page.aliases || []) {
        if (alias?.slug) slugs.add(alias.slug)
      }
      for (const redirect of page.redirects || []) {
        if (redirect) slugs.add(redirect)
      }
    }
    return slugs
  }

  async function currentPageSlugSet() {
    const pages = await listPages({ limit: 1000 })
    return collectKnownSlugs(pages)
  }

  async function markMissingArticleLinks(serial) {
    if (!isCurrentRoute(serial)) return
    const links = Array.from(app.querySelectorAll('.article-body a[data-link="page"]'))
    const slugs = await lookupPages(Array.from(new Set(links.map(link => link.dataset.slug).filter(Boolean))))
    if (!isCurrentRoute(serial)) return

    app.querySelectorAll('.article-body a[data-link="page"]').forEach(link => {
      const slug = link.dataset.slug
      if (!slug || slug === HOME_SLUG || slug.startsWith('arquivo/') || slugs.has(slug)) return
      link.classList.add('red-link')
      link.setAttribute('title', interfaceLocale() === 'en-US' ? 'page does not exist yet' : ui("página ainda não existe", "page does not exist yet"))
    })
  }

  function currentState() {
    return parseRoute()
  }

  function setChromeLink(name, slug, mode = 'read') {
    const element = document.querySelector(`[data-chrome-link="${name}"]`)
    if (!element) return

    element.href = pageUrl(slug, mode)
    element.dataset.slug = slug
  }

  function setVisible(element, visible) {
    if (!element) return
    element.hidden = !visible
  }

  function updateAccountLinks(slug) {
    const account = document.querySelector('[data-account-links]')
    if (!account) return

    const returnTo = pageUrl(slug, 'edit')
    const loginUrl = `/api/auth/login?return=${encodeURIComponent(returnTo)}`
    const logoutUrl = `/api/auth/logout?return=${encodeURIComponent(pageUrl(slug))}`

    account.innerHTML = currentUser.authenticated
      ? `
        <span class="account-user">${escapeHtml(currentUser.displayName || currentUser.email || t('shell.authorizedEditor'))} ${currentUser.role ? `<small>${escapeHtml(currentUser.role)}</small>` : ''}</span>
        <a href="${escapeHtml(logoutUrl)}">${escapeHtml(t('shell.signOut'))}</a>
      `
      : `
        <a href="${pageUrl(editGuideSlug())}" data-link="page" data-slug="${escapeHtml(editGuideSlug())}">${escapeHtml(t('shell.wantToEdit'))}</a>
        <a href="${escapeHtml(loginUrl)}">${escapeHtml(t('shell.signIn'))}</a>
      `
  }

  function updateChrome(slug, mode = 'read') {
    const safeSlug = slug || HOME_SLUG
    const canEdit = Boolean(currentUser.canEdit)
    const isFile = safeSlug.startsWith('arquivo/')
    const isSpecial = isGeneratedSpecialSlug(safeSlug)
    const isRestrictedNamespace = isFile || isSpecial
    const isTalk = safeSlug.startsWith('discussao/')
    const articleSlug = isTalk ? articleSlugFromTalk(safeSlug) : safeSlug
    const talkSlug = isTalk ? safeSlug : `discussao/${articleSlug}`

    setChromeLink('article', articleSlug)
    setChromeLink('talk', talkSlug)
    setChromeLink('talk-tool', talkSlug)
    setChromeLink('read', safeSlug)
    setChromeLink('edit', safeSlug, 'edit')
    setChromeLink('edit-tab', safeSlug, 'edit')
    setChromeLink('suggest', safeSlug, 'suggest')
    setChromeLink('suggest-tab', safeSlug, 'suggest')
    setChromeLink('history', safeSlug, 'history')
    setChromeLink('history-tab', safeSlug, 'history')
    setChromeLink('login', safeSlug, 'edit')

    updateAccountLinks(safeSlug)

    const articleTab = document.querySelector('[data-chrome-link="article"]')
    const talkTab = document.querySelector('[data-chrome-link="talk"]')
    const talkTool = document.querySelector('[data-chrome-link="talk-tool"]')
    const editTool = document.querySelector('[data-chrome-link="edit"]')
    const historyTool = document.querySelector('[data-chrome-link="history"]')
    const editTab = document.querySelector('[data-chrome-link="edit-tab"]')
    const suggestTab = document.querySelector('[data-chrome-link="suggest-tab"]')
    const historyTab = document.querySelector('[data-chrome-link="history-tab"]')

    if (articleTab) articleTab.textContent = isFile ? t('shell.file') : isSpecial ? t('shell.special') : t('shell.article')
    setVisible(talkTab, !isRestrictedNamespace && featureEnabled('talkPages'))
    setVisible(talkTool, !isRestrictedNamespace && featureEnabled('talkPages'))
    setVisible(editTool, canEdit && !isRestrictedNamespace)
    setVisible(historyTool, !isRestrictedNamespace && featureEnabled('pageHistory'))
    setVisible(editTab, canEdit && !isRestrictedNamespace)
    setVisible(suggestTab, !canEdit && !isRestrictedNamespace && featureEnabled('publicSuggestions'))
    setVisible(historyTab, !isRestrictedNamespace && featureEnabled('pageHistory'))
    if (searchForm) searchForm.hidden = !featureEnabled('search')

    document.querySelectorAll('.namespace-tabs .tab').forEach(tab => tab.classList.remove('is-active'))
    const namespaceActive = document.querySelector(`[data-chrome-link="${isTalk ? 'talk' : 'article'}"]`)
    if (namespaceActive) namespaceActive.classList.add('is-active')

    document.querySelectorAll('.view-tabs .tab').forEach(tab => tab.classList.remove('is-active'))
    const activeName = mode === 'edit' ? 'edit-tab' : mode === 'history' ? 'history-tab' : mode === 'suggest' ? 'suggest-tab' : 'read'
    const active = document.querySelector(`[data-chrome-link="${activeName}"]`)
    if (active && !active.hidden) active.classList.add('is-active')
    else document.querySelector('[data-chrome-link="read"]')?.classList.add('is-active')
  }


  function tableCellValue(row, index) {
    const cell = row.cells[index]
    if (!cell) return ''
    return String(cell.dataset.sortValue || cell.textContent || '').trim()
  }

  function compareTableValues(a, b) {
    const numberA = Number(a.replace?.(/\./g, '').replace?.(',', '.') ?? a)
    const numberB = Number(b.replace?.(/\./g, '').replace?.(',', '.') ?? b)
    const numeric = a !== '' && b !== '' && Number.isFinite(numberA) && Number.isFinite(numberB)
    if (numeric) return numberA - numberB
    return String(a).localeCompare(String(b), interfaceLocale(), { numeric: true, sensitivity: 'base' })
  }

  function enhanceAdminDataTables() {
    app.querySelectorAll('.admin-page table[data-admin-table]').forEach((table, index) => {
      if (table.dataset.enhanced === 'true') return
      const tbody = table.tBodies[0]
      if (!tbody) return

      const rows = Array.from(tbody.rows)
      const hasRealRows = rows.some(row => !row.querySelector('td[colspan]'))
      if (!hasRealRows) return

      table.dataset.enhanced = 'true'
      rows.forEach((row, rowIndex) => { row.dataset.adminOriginalOrder = String(rowIndex) })

      const state = {
        rows,
        page: 1,
        perPage: 10,
        sortIndex: null,
        sortDirection: 'asc'
      }

      const controls = document.createElement('div')
      controls.className = 'admin-table-controls'
      controls.innerHTML = `
        <label>
          ${ui("Itens por página", "Items per page")}
          <select data-admin-page-size>
            <option value="10" selected>10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <span data-admin-page-status></span>
      `

      const pager = document.createElement('div')
      pager.className = 'admin-table-pager'
      pager.innerHTML = `
        <button class="secondary-button compact-button" type="button" data-admin-page-prev>${ui("Anterior", "Previous")}</button>
        <span data-admin-page-indicator></span>
        <button class="secondary-button compact-button" type="button" data-admin-page-next>${ui("Próxima", "Next")}</button>
      `

      table.before(controls)
      table.after(pager)

      const sizeSelect = controls.querySelector('[data-admin-page-size]')
      const status = controls.querySelector('[data-admin-page-status]')
      const previous = pager.querySelector('[data-admin-page-prev]')
      const next = pager.querySelector('[data-admin-page-next]')
      const indicator = pager.querySelector('[data-admin-page-indicator]')

      function sortedRows() {
        const copy = [...state.rows]
        if (state.sortIndex === null) return copy
        copy.sort((rowA, rowB) => {
          const compared = compareTableValues(tableCellValue(rowA, state.sortIndex), tableCellValue(rowB, state.sortIndex))
          if (compared === 0) return Number(rowA.dataset.adminOriginalOrder || 0) - Number(rowB.dataset.adminOriginalOrder || 0)
          return state.sortDirection === 'asc' ? compared : -compared
        })
        return copy
      }

      function render() {
        const rowsToShow = sortedRows()
        const pageCount = Math.max(Math.ceil(rowsToShow.length / state.perPage), 1)
        state.page = Math.min(Math.max(state.page, 1), pageCount)
        const start = (state.page - 1) * state.perPage
        const end = start + state.perPage
        const visible = rowsToShow.slice(start, end)
        tbody.replaceChildren(...visible)
        if (status) status.textContent = `${rowsToShow.length.toLocaleString(interfaceLocale())} item(ns)`
        if (indicator) indicator.textContent = `${ui("Página ", "Page ")}${state.page.toLocaleString(interfaceLocale())} de ${pageCount.toLocaleString(interfaceLocale())}`
        if (previous) previous.disabled = state.page <= 1
        if (next) next.disabled = state.page >= pageCount
      }

      table.tHead?.querySelectorAll('th').forEach((header, columnIndex) => {
        const label = header.textContent.trim().toLowerCase()
        if (!label || label === ui("ações", "actions")) return
        header.classList.add('admin-sortable-heading')
        header.tabIndex = 0
        header.title = ui("Ordenar coluna", "Sort column")

        function activateSort() {
          if (state.sortIndex === columnIndex) {
            state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc'
          } else {
            state.sortIndex = columnIndex
            state.sortDirection = 'asc'
          }
          state.page = 1
          table.tHead?.querySelectorAll('th').forEach(item => item.removeAttribute('data-sort-direction'))
          header.dataset.sortDirection = state.sortDirection
          render()
        }

        header.addEventListener('click', activateSort)
        header.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          activateSort()
        })
      })

      sizeSelect?.addEventListener('change', () => {
        state.perPage = Number(sizeSelect.value || 10)
        state.page = 1
        render()
      })
      previous?.addEventListener('click', () => { state.page -= 1; render() })
      next?.addEventListener('click', () => { state.page += 1; render() })

      render()
    })
  }

  function paginationHtml(previous, next, prefix = 'pages') {
    if (!previous && !next) return ''
    return `<nav><button class="secondary-button" data-${prefix}-prev ${previous ? '' : 'disabled'}>${escapeHtml(t('common.previous'))}</button> <button class="secondary-button" data-${prefix}-next ${next ? '' : 'disabled'}>${escapeHtml(t('common.next'))}</button></nav>`
  }

  async function renderContext() {
    const [data, categories, templates] = await Promise.all([
      getPageList({ limit: 1 }),
      featureEnabled('categories') ? listCategories() : Promise.resolve([]),
      featureEnabled('templates') ? listTemplates({ secure: Boolean(currentUser.canEdit) }) : Promise.resolve([])
    ])
    return {
      articleCount: data.total.toLocaleString(interfaceLocale()),
      revisionCount: data.revisions.toLocaleString(interfaceLocale()),
      categoryCount: categories.length.toLocaleString(interfaceLocale()),
      templates,
      slogan: SLOGAN
    }
  }

  async function renderAllPages(serial, offset = 0) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: t('pages.all') })
    const data = await getPageList({ sort: 'title', limit: 100, offset })
    if (!isCurrentRoute(serial)) return
    commitHtml(serial, allPagesHtml(data.pages) + paginationHtml(offset > 0, data.nextOffset !== null))
    app.querySelector('[data-pages-prev]')?.addEventListener('click', () => renderAllPages(serial, Math.max(0, offset - 100)))
    app.querySelector('[data-pages-next]')?.addEventListener('click', () => renderAllPages(serial, data.nextOffset))
  }

  function sortableTimestamp(value) {
    const clean = String(value || '').trim()
    if (!clean) return 0
    const timestamp = Date.parse(clean.includes('T') ? clean : clean.replace(' ', 'T'))
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  async function renderRecentPages(serial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Páginas recentes", "Recent pages") })
    const pages = (await listPages({ sort: 'recent', limit: 100 })).filter(pageVisibleByFeatures)
    pages.sort((left, right) => sortableTimestamp(right.updatedAt) - sortableTimestamp(left.updatedAt) || String(left.title || '').localeCompare(String(right.title || ''), interfaceLocale()))
    if (!isCurrentRoute(serial)) return
    commitHtml(serial, recentPagesHtml(pages))
  }

  async function renderCategories(serial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Categorias", "Categories") })
    const categories = await listCategories()
    if (!isCurrentRoute(serial)) return
    commitHtml(serial, categoriesIndexHtml(categories))
  }

  async function renderCategory(categorySlug, serial) {
    updateChrome(`categoria/${categorySlug}`, 'read')
    const category = await getCategory(categorySlug)
    if (!isCurrentRoute(serial)) return

    if (!category) {
      setDocumentTitle({ title: ui("Categoria não encontrada", "Category not found") })
      commitHtml(serial, notFoundHtml(`categoria/${categorySlug}`, currentUser))
      return
    }

    setDocumentTitle({ title: `${ui('Categoria:', 'Category:')} ${category.name}` })
    commitHtml(serial, categoryPageHtml(category))
  }

  function bindSpecialFileUpload(fileSlug) {
    const form = app.querySelector('[data-file-upload-form]')
    if (!form) return

    form.addEventListener('submit', async event => {
      event.preventDefault()
      if (form.dataset.saving === '1') return
      const data = new FormData(form)
      const file = data.get('file')
      const note = form.querySelector('[data-file-upload-note]')
      const slug = slugify(data.get('slug')?.toString() || fileSlug)

      if (!(file instanceof File) || !file.size) {
        if (note) note.textContent = ui("Escolha uma imagem, um vídeo ou um áudio válido.", "Choose a valid image, video or audio file.")
        return
      }

      setEditorSaving(form, true, ui("Enviando...", "Submitting..."))
      if (note) note.textContent = ui('Enviando...', 'Uploading...')

      try {
        const result = await uploadImage(file, {
          slug,
          description: data.get('description')?.toString().trim() || ''
        })
        setEditorSaving(form, false)
        navigate(result?.file?.pageUrl || pageUrl(`arquivo/${result?.file?.fileSlug || slug}`))
      } catch (error) {
        setEditorSaving(form, false)
        if (note) note.textContent = `${ui("Não foi possível enviar o arquivo. ", "Could not upload the file. ")}${diagnosticDetail(error) || ''}`
      }
    })
  }

  async function renderFile(fileSlug, serial) {
    const fullSlug = `arquivo/${fileSlug}`
    updateChrome(fullSlug, 'read')
    const file = await getFile(fileSlug)
    if (!isCurrentRoute(serial)) return

    if (!file) {
      if (!featureEnabled('mediaUploads')) {
        setDocumentTitle({ title: ui("Uploads de mídia", "Media uploads") })
        commitHtml(serial, featureDisabledHtml(ui("Uploads de mídia", "Media uploads"), ui("O arquivo solicitado não existe e novos uploads estão desativados.", "The requested file does not exist and new uploads are disabled.")))
        return
      }
      setDocumentTitle({ title: ui("Enviar arquivo", "Upload file") })
      if (commitHtml(serial, fileUploadPageHtml(fileSlug, currentUser))) bindSpecialFileUpload(fileSlug)
      return
    }

    setDocumentTitle({ title: `${ui("Arquivo:", "File:")}${file.filename}` })
    commitHtml(serial, filePageHtml(file))
  }


  async function renderRead(slug, serial) {
    const page = await getPage(slug)
    if (!isCurrentRoute(serial)) return

    if (!page) {
      updateChrome(slug, 'read')
      setDocumentTitle({ title: ui("Página não encontrada", "Page not found") })
      commitHtml(serial, notFoundHtml(slug, currentUser))
      return
    }

    if (page.resolvedBy === 'redirect' && page.slug) {
      const fragment = String(page.resolvedFragment || '').replace(/^#/, '')
      const canonicalUrl = `${pageUrl(page.slug)}${fragment ? `#${encodeURIComponent(fragment)}` : window.location.hash}`
      history.replaceState(history.state, '', canonicalUrl)
    }

    const context = await renderContext()
    if (!isCurrentRoute(serial)) return
    setDocumentTitle(page)
    updateChrome(page.slug, 'read')
    if (commitHtml(serial, articleHtml(page, context))) {
      void markMissingArticleLinks(serial).catch(() => {})
    }
  }


  async function renderHistory(slug, serial, offset = 0) {
    updateChrome(slug, 'history')
    if (String(slug || '').startsWith('arquivo/')) {
      setDocumentTitle({ title: ui('Namespace de arquivo', 'File namespace') })
      commitHtml(serial, fileNamespaceBlockedHtml(slug, currentUser))
      return
    }
    if (isGeneratedSpecialSlug(slug)) {
      const info = specialPageInfo(slug) || { key: 'index', canonical: 'especial' }
      history.replaceState(history.state, '', pageUrl(info.canonical))
      await renderSpecialPage(info, serial)
      return
    }
    const page = await getPage(slug)
    if (!isCurrentRoute(serial)) return

    if (!page) {
      await renderRead(slug, serial)
      return
    }

    const params = new URLSearchParams(window.location.search)
    const revisionNumber = params.get('revision')
    const compareNumber = params.get('compare')
    const context = await renderContext()

    if (revisionNumber) {
      const revision = await getRevision(page.slug, revisionNumber)
      if (!isCurrentRoute(serial)) return

      if (!revision) {
        commitHtml(serial, notFoundHtml(`${page.slug}/revisao-${revisionNumber}`, currentUser))
        return
      }

      setDocumentTitle(page, `${ui(" revisão ", " revision ")}${revisionNumber}`)
      updateChrome(page.slug, 'history')
      if (commitHtml(serial, revisionHtml(page, revision, context, currentUser))) {
        await markMissingArticleLinks(serial)
      }
      return
    }

    if (compareNumber) {
      const revision = await getRevision(page.slug, compareNumber)
      if (!isCurrentRoute(serial)) return

      if (!revision) {
        commitHtml(serial, notFoundHtml(`${page.slug}/revisao-${compareNumber}`, currentUser))
        return
      }

      setDocumentTitle(page, `${ui(" comparação ", " comparison ")}${compareNumber}`)
      updateChrome(page.slug, 'history')
      commitHtml(serial, revisionCompareHtml(page, revision, page, currentUser))
      return
    }

    const data = await listRevisions(page.slug, offset)
    if (!isCurrentRoute(serial)) return

    setDocumentTitle(page, ui(" histórico", " history"))
    updateChrome(page.slug, 'history')
    commitHtml(serial, historyHtml(page, data, currentUser) + paginationHtml(offset > 0, data.nextOffset !== null, 'history'))
    app.querySelector('[data-history-prev]')?.addEventListener('click', () => renderHistory(page.slug, serial, Math.max(0, offset - 100)))
    app.querySelector('[data-history-next]')?.addEventListener('click', () => renderHistory(page.slug, serial, data.nextOffset))
  }


  function editSubtitle() {
    if (currentUser.verified) {
      return `${ui('Autenticado pelo Cloudflare Access como', 'Signed in through Cloudflare Access as')} ${escapeHtml(currentUser.email || ui('editor autorizado', 'authorized editor'))}.`
    }

    return `${ui('Autenticado como', 'Signed in as')} ${escapeHtml(currentUser.email || ui('editor autorizado', 'authorized editor'))}.`
  }


  function templateGalleryHtml() {
    return `
      <section class="template-gallery-panel media-panel editor-tool-panel" aria-label="${ui('Galeria de templates', 'Template gallery')}" data-template-gallery hidden>
        <h2>${ui("Galeria de templates", "Template gallery")} <span class="beta-badge">${ui("em fase de testes", "in testing")}</span></h2>
        <p>${ui("Pesquise predefinições reutilizáveis e insira chamadas wiki no Markdown. Templates ainda estão em fase de testes.", "Search reusable templates and insert wiki calls into Markdown. Templates are still in testing.")}</p>
        <div class="media-library-controls template-gallery-controls">
          <label>
            ${ui("Pesquisar template", "Search template")}<br />
            <input type="search" data-template-search placeholder="${ui("manutenção, mídia, aviso, fundo", "maintenance, media, notices, backgrounds")}" />
          </label>
          <label>
            ${ui("Grupo", "Group")}<br />
            <select data-template-group>
              <option value="">${ui("Todos", "All")}</option>
            </select>
          </label>
          <button class="secondary-button" type="button" data-template-load>${ui("Pesquisar", "Search")}</button>
        </div>
        <div class="template-gallery-grid" data-template-grid>
          <p class="upload-note">${ui("Pesquise ou clique em Pesquisar para listar os templates disponíveis.", "Search to list available templates.")}</p>
        </div>
        <p class="upload-note" data-template-gallery-note>${ui("Templates estão em fase de testes. Templates de convidado aparecem para propostas públicas; templates de editor aparecem quando há login pelo Cloudflare Access.", "Templates are in testing. Guest templates are available for public proposals; editor templates require Cloudflare Access.")}</p>
      </section>
    `
  }

  function uploadPanelHtml() {
    return `
      <section class="upload-panel media-panel editor-tool-panel" aria-label="${ui("Mídia do artigo", "Article media")}" data-media-panel hidden>
        <h2>${ui("Mídia do artigo", "Article media")}</h2>
        <p>${ui("Envie imagens ou vídeos novos, insira arquivos do acervo, ou incorpore vídeo por link direto/YouTube.", "Upload images or videos, insert existing media, or embed a direct video link or YouTube video.")}</p>

        <div class="media-tabs" role="tablist" aria-label="${ui("Opções de mídia", "Media options")}">
          <button class="is-active" type="button" data-media-tab-target="upload">${ui("Enviar imagem", "Upload image")}</button>
          <button type="button" data-media-tab-target="video-upload">${ui("Enviar vídeo", "Upload video")}</button>
          <button type="button" data-media-tab-target="external-video">Link/YouTube</button>
          <button type="button" data-media-tab-target="audio-upload">${ui("Enviar áudio", "Upload audio")}</button>
          <button type="button" data-media-tab-target="external-audio">${ui("Link de áudio", "Audio link")}</button>
          <button type="button" data-media-tab-target="library">${ui("Galeria de mídia", "Media gallery")}</button>
        </div>

        <div class="media-tab-panel" data-media-tab-panel="upload">
          <div class="upload-grid upload-grid-wide">
            <label>
              ${ui("Arquivo", "File")}<br />
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload-file />
            </label>
            <label>
              ${ui("Legenda opcional", "Optional caption")}<br />
              <input type="text" data-upload-caption placeholder="${ui("descrição curta da imagem", "short image description")}" />
            </label>
            <label>
              ${ui("Localização da miniatura", "Thumbnail position")}<br />
              <select data-upload-align>
                <option value="right" selected>${ui("Direita", "Right")}</option>
                <option value="left">${ui("Esquerda", "Left")}</option>
                <option value="center">${ui("Centro", "Center")}</option>
              </select>
            </label>
            <label>
              ${ui("Largura", "Width")}<br />
              <input type="number" min="120" max="420" step="10" value="260" data-upload-width />
            </label>
          </div>
          <div class="editor-actions">
            <button class="secondary-button" type="button" data-upload-button>${ui("Enviar e inserir no artigo", "Upload and insert in article")}</button>
          </div>
          <p class="upload-note" data-upload-note>${ui("O upload direto é restrito a editores autenticados pelo Cloudflare Access.", "Direct uploads require an editor authenticated through Cloudflare Access.")}</p>
        </div>

        <div class="media-tab-panel" data-media-tab-panel="video-upload" hidden>
          <div class="upload-grid upload-grid-wide">
            <label>
              ${ui("Arquivo de vídeo", "Video file")}<br />
              <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogg,.ogv,.mov,.m4v" data-video-upload-file />
            </label>
            <label>
              ${ui("Legenda opcional", "Optional caption")}<br />
              <input type="text" data-video-upload-caption placeholder="${ui("descrição curta do vídeo", "short video description")}" />
            </label>
            <label>
              ${ui("Título opcional", "Optional title")}<br />
              <input type="text" data-video-upload-title placeholder="${ui("nome exibido acima do vídeo", "name displayed above the video")}" />
            </label>
            <label>
              ${ui("Inserir como", "Insert as")}<br />
              <select data-video-upload-mode>
                <option value="thumb" selected>${ui("Miniatura", "Thumbnail")}</option>
                <option value="image">${ui("Vídeo grande", "Large video")}</option>
                <option value="gallery">${ui("Galeria", "Gallery")}</option>
              </select>
            </label>
            <label>
              ${ui("Localização", "Location")}<br />
              <select data-video-upload-align>
                <option value="right" selected>${ui("Direita", "Right")}</option>
                <option value="left">${ui("Esquerda", "Left")}</option>
                <option value="center">${ui("Centro", "Center")}</option>
              </select>
            </label>
            <label>
              ${ui("Largura", "Width")}<br />
              <input type="number" min="120" max="420" step="10" value="260" data-video-upload-width />
            </label>
          </div>
          <div class="editor-actions">
            <button class="secondary-button" type="button" data-video-upload-button>${ui("Enviar vídeo e inserir", "Upload and insert video")}</button>
          </div>
          <p class="upload-note" data-video-upload-note>${ui("São aceitos MP4, WebM, OGG/OGV e MOV até 50 MB.", "Accepts MP4, WebM, OGG/OGV and MOV up to 50 MB.")}</p>
        </div>

        <div class="media-tab-panel" data-media-tab-panel="external-video" hidden>
          <div class="upload-grid upload-grid-wide">
            <label>
              ${ui("Link do vídeo", "Video link")}<br />
              <input type="url" data-video-url placeholder="https://youtu.be/... ou https://site/video.mp4" />
            </label>
            <label>
              ${ui("Título opcional", "Optional title")}<br />
              <input type="text" data-video-url-title placeholder="${ui("nome exibido acima do vídeo", "name displayed above the video")}" />
            </label>
            <label>
              ${ui("Legenda opcional", "Optional caption")}<br />
              <input type="text" data-video-url-caption placeholder="${ui("descrição curta do vídeo", "short video description")}" />
            </label>
            <label>
              ${ui("Tipo", "Type")}<br />
              <select data-video-url-kind>
                <option value="auto" selected>${ui("Detectar automaticamente", "Detect automatically")}</option>
                <option value="youtube">YouTube</option>
                <option value="direct">${ui("Arquivo direto", "Direct file")}</option>
              </select>
            </label>
            <label>
              ${ui("Inserir como", "Insert as")}<br />
              <select data-video-url-mode>
                <option value="image" selected>${ui("Vídeo grande", "Large video")}</option>
                <option value="thumb">${ui("Miniatura", "Thumbnail")}</option>
                <option value="gallery">${ui("Galeria", "Gallery")}</option>
              </select>
            </label>
            <label>
              ${ui("Localização", "Location")}<br />
              <select data-video-url-align>
                <option value="right" selected>${ui("Direita", "Right")}</option>
                <option value="left">${ui("Esquerda", "Left")}</option>
                <option value="center">${ui("Centro", "Center")}</option>
              </select>
            </label>
            <label>
              ${ui("Largura", "Width")}<br />
              <input type="number" min="120" max="420" step="10" value="260" data-video-url-width />
            </label>
          </div>
          <div class="editor-actions">
            <button class="secondary-button" type="button" data-video-url-insert>${ui("Inserir vídeo por link", "Insert video link")}</button>
          </div>
          <p class="upload-note" data-video-url-note>${ui("Use links do YouTube ou arquivos diretos .mp4, .webm, .ogg/.ogv, .mov e .m4v.", "Use YouTube links or direct .mp4, .webm, .ogg/.ogv, .mov and .m4v files.")}</p>
        </div>

        <div class="media-tab-panel" data-media-tab-panel="audio-upload" hidden>
          <div class="upload-grid upload-grid-wide">
            <label>
              ${ui("Arquivo de áudio", "Audio file")}<br />
              <input type="file" accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/webm,audio/flac,audio/aac,audio/mp4,.mp3,.ogg,.oga,.wav,.webm,.flac,.aac,.m4a" data-audio-upload-file />
            </label>
            <label>
              ${ui("Legenda opcional", "Optional caption")}<br />
              <input type="text" data-audio-upload-caption placeholder="${ui("descrição curta do áudio", "short audio description")}" />
            </label>
            <label>
              ${ui("Título opcional", "Optional title")}<br />
              <input type="text" data-audio-upload-title placeholder="${ui("nome exibido acima do áudio", "name displayed above the audio")}" />
            </label>
            <label>
              ${ui("Inserir como", "Insert as")}<br />
              <select data-audio-upload-mode>
                <option value="image" selected>${ui("Áudio grande", "Large audio")}</option>
                <option value="thumb">${ui("Miniatura", "Thumbnail")}</option>
                <option value="gallery">${ui("Galeria", "Gallery")}</option>
              </select>
            </label>
            <label>
              ${ui("Localização", "Location")}<br />
              <select data-audio-upload-align>
                <option value="right" selected>${ui("Direita", "Right")}</option>
                <option value="left">${ui("Esquerda", "Left")}</option>
                <option value="center">${ui("Centro", "Center")}</option>
              </select>
            </label>
            <label>
              ${ui("Largura", "Width")}<br />
              <input type="number" min="120" max="420" step="10" value="260" data-audio-upload-width />
            </label>
          </div>
          <div class="editor-actions">
            <button class="secondary-button" type="button" data-audio-upload-button>${ui("Enviar áudio e inserir", "Upload and insert audio")}</button>
          </div>
          <p class="upload-note" data-audio-upload-note>${ui("São aceitos MP3, OGG/OGA, WAV, WebM, FLAC, AAC e M4A até 50 MB.", "Accepts MP3, OGG/OGA, WAV, WebM, FLAC, AAC and M4A up to 50 MB.")}</p>
        </div>

        <div class="media-tab-panel" data-media-tab-panel="external-audio" hidden>
          <div class="upload-grid upload-grid-wide">
            <label>
              ${ui("Link do áudio", "Audio link")}<br />
              <input type="url" data-audio-url placeholder="https://site/audio.mp3" />
            </label>
            <label>
              ${ui("Título opcional", "Optional title")}<br />
              <input type="text" data-audio-url-title placeholder="${ui("nome exibido acima do áudio", "name displayed above the audio")}" />
            </label>
            <label>
              ${ui("Legenda opcional", "Optional caption")}<br />
              <input type="text" data-audio-url-caption placeholder="${ui("descrição curta do áudio", "short audio description")}" />
            </label>
            <label>
              ${ui("Inserir como", "Insert as")}<br />
              <select data-audio-url-mode>
                <option value="image" selected>${ui("Áudio grande", "Large audio")}</option>
                <option value="thumb">${ui("Miniatura", "Thumbnail")}</option>
                <option value="gallery">${ui("Galeria", "Gallery")}</option>
              </select>
            </label>
            <label>
              ${ui("Localização", "Location")}<br />
              <select data-audio-url-align>
                <option value="right" selected>${ui("Direita", "Right")}</option>
                <option value="left">${ui("Esquerda", "Left")}</option>
                <option value="center">${ui("Centro", "Center")}</option>
              </select>
            </label>
            <label>
              ${ui("Largura", "Width")}<br />
              <input type="number" min="120" max="420" step="10" value="260" data-audio-url-width />
            </label>
          </div>
          <div class="editor-actions">
            <button class="secondary-button" type="button" data-audio-url-insert>${ui("Inserir áudio por link", "Insert audio link")}</button>
          </div>
          <p class="upload-note" data-audio-url-note>${ui("Use links diretos .mp3, .ogg/.oga, .wav, .webm, .flac, .aac ou .m4a.", "Use direct .mp3, .ogg/.oga, .wav, .webm, .flac, .aac or .m4a links.")}</p>
        </div>

        <div class="media-tab-panel" data-media-tab-panel="library" hidden>
          <div class="media-library-controls">
            <label>
              ${ui("Pesquisar mídia", "Search media")}<br />
              <input type="search" data-media-search placeholder="${ui("nome, legenda ou descrição", "name, caption or description")}" />
            </label>
            <label>
              ${ui("Inserir como", "Insert as")}<br />
              <select data-media-insert-mode>
                <option value="thumb" selected>${ui("Miniatura", "Thumbnail")}</option>
                <option value="image">${ui("Mídia grande", "Large media")}</option>
                <option value="gallery">${ui("Galeria", "Gallery")}</option>
              </select>
            </label>
            <label>
              ${ui("Localização", "Location")}<br />
              <select data-media-insert-align>
                <option value="right" selected>${ui("Direita", "Right")}</option>
                <option value="left">${ui("Esquerda", "Left")}</option>
                <option value="center">${ui("Centro", "Center")}</option>
              </select>
            </label>
            <label>
              ${ui("Largura", "Width")}<br />
              <input type="number" min="120" max="420" step="10" value="260" data-media-insert-width />
            </label>
            <button class="secondary-button" type="button" data-media-search-button>${ui("Pesquisar", "Search")}</button>
          </div>
          <div class="media-library-grid" data-media-library-grid>
            <p class="upload-note">${ui("Abra esta aba para carregar a mídia enviada.", "Open this tab to load uploaded media.")}</p>
          </div>
          <p class="upload-note" data-media-library-note>${ui("Escolha um arquivo do acervo e como ele deve ser inserido no Markdown.", "Select an existing file and how to insert it into Markdown.")}</p>
        </div>
      </section>
    `
  }

  function editorToolbarHtml(isProposal) {
    return `
      <div class="editor-toolbar" role="toolbar" aria-label="${ui("Ferramentas de edição", "Editing tools")}">
        <button type="button" data-editor-tool="bold" title="${ui("Negrito", "Bold")}"><strong>B</strong></button>
        <button type="button" data-editor-tool="italic" title="${ui("Itálico", "Italic")}"><em>I</em></button>
        <button type="button" data-editor-tool="underline" title="${ui("Sublinhado", "Underline")}"><u>U</u></button>
        <button type="button" data-editor-tool="strike" title="${ui("Riscado", "Strikethrough")}"><s>S</s></button>
        <button type="button" data-editor-tool="inlinecode" title="${ui("Código inline", "Inline code")}"><code>&lt;&gt;</code></button>
        <button type="button" data-editor-tool="link" title="Link">🔗</button>
        <button type="button" data-editor-tool="heading" title="${ui("Título de seção", "Section heading")}">H2</button>
        <button type="button" data-editor-tool="subheading" title="${ui("Subtítulo de seção", "Section subheading")}">H3</button>
        <button type="button" data-editor-tool="toc" title="${ui("Índice do artigo", "Article table of contents")}">☷</button>
        <button type="button" data-editor-tool="unordered" title="${ui("Lista não ordenada", "Unordered list")}">•</button>
        <button type="button" data-editor-tool="ordered" title="${ui("Lista ordenada", "Ordered list")}">1.</button>
        <button type="button" data-editor-tool="blockquote" title="Blockquote">❯</button>
        <button type="button" data-editor-tool="codeblock" title="${ui("Bloco de código", "Code block")}">{ }</button>
        <button type="button" data-editor-tool="table" title="${ui("Tabela", "Table")}">▦</button>
        ${featureEnabled('mediaUploads') && !isProposal ? `<button type="button" data-editor-tool="media" title="${ui('Mídia do artigo', 'Article media')}">🖼</button>` : ''}
        ${featureEnabled('templates') ? '<button type="button" data-editor-tool="templates" title="Galeria de templates">▣</button>' : ''}
        <button type="button" data-editor-tool="thumb" title="${ui("Miniatura", "Thumbnail")}">▧</button>
        <button type="button" data-editor-tool="gallery" title="${ui("Galeria de mídia", "Media gallery")}">▥</button>
        <button type="button" data-editor-tool="quote" title="${ui("Citação especial", "Special quote")}">❝</button>
        <button type="button" data-editor-tool="infobox" title="Infobox">▤</button>
        <button type="button" data-editor-tool="messagebox" title="${ui("Caixa de aviso", "Notice box")}">ⓘ</button>
      </div>
    `
  }

  function roleAtLeast(role, minimum) {
    const order = { editor: 10, moderator: 20, admin: 30, super_admin: 40 }
    return (order[role] || 0) >= (order[minimum] || 0)
  }


  function editorUrlParts(slug) {
    const clean = String(slug || HOME_SLUG).replace(/^\/+|\/+$/g, '')
    if (clean.startsWith('usuario/')) return { prefix: '/usuario/', value: clean.slice('usuario/'.length) }
    if (clean.startsWith('discussao/')) return { prefix: '/talk/', value: clean.slice('discussao/'.length) }
    return { prefix: '/wiki/', value: clean }
  }

  function editorSlugFromUrl(prefix, value) {
    const stripped = String(value || '')
      .trim()
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/+/, '')
      .replace(/^(wiki|edit|suggest|history|talk|discussao|usuario)\/+/, '')
    const path = stripped.split('/').map(part => slugify(part)).filter(Boolean).join('/') || HOME_SLUG
    if (prefix === '/usuario/') return `usuario/${path}`
    if (prefix === '/talk/' || prefix === '/discussao/') return `discussao/${path}`
    return path
  }

  function redirectRuleRowHtml(rule = {}) {
    return `
      <div class="editor-redirect-row" data-editor-redirect-row>
        <label>
          ${ui("URL de origem", "Source URL")}
          <span class="editor-url-control"><span class="editor-url-prefix">/wiki/</span><input type="text" data-redirect-from value="${escapeHtml(rule.fromSlug || '')}" placeholder="nome-antigo-da-pagina" /></span>
        </label>
        <label>
          ${ui("Seção de destino opcional", "Optional target section")}
          <span class="editor-url-control"><span class="editor-url-prefix">#</span><input type="text" data-redirect-fragment value="${escapeHtml(rule.fragment || '')}" placeholder="titulo-da-secao" /></span>
        </label>
        <button class="danger-button compact-button" type="button" data-editor-redirect-remove>${ui("Remover", "Remove")}</button>
      </div>
    `
  }

  function editorRoutingHtml(page) {
    const rules = Array.isArray(page.redirectRules) && page.redirectRules.length
      ? page.redirectRules
      : (page.redirects || []).map(fromSlug => ({ fromSlug, fragment: '' }))
    return `
      <details class="editor-routing-panel" data-editor-routing open>
        <summary>${ui("Aliases e redirecionamentos avançados", "Advanced aliases and redirects")}</summary>
        <p>${ui("Recursos editoriais. Visitantes não podem pedir aliases ou redirecionamentos em propostas.", "Editorial features. Visitors cannot request aliases or redirects in proposals.")}</p>
        <div class="editor-routing-grid">
          <label>
            ${ui("Aliases de título", "Title aliases")}
            <textarea name="aliases" rows="4" placeholder="${ui("um título alternativo por linha", "one alternative title per line")}">${escapeHtml((page.aliases || []).map(alias => alias.title || alias).join('\n'))}</textarea>
            <small>${ui("Aliases participam da pesquisa e abrem a página canônica.", "Aliases appear in search and open the canonical page.")}</small>
          </label>
          <section class="editor-redirects-box">
            <h3>${ui("Redirecionamentos para esta página", "Redirects to this page")}</h3>
            <p>${ui("Uma origem pode apontar para a página inteira ou para uma seção específica.", "A source can point to a whole page or a specific section.")}</p>
            <div data-editor-redirect-list>
              ${(rules.length ? rules : [{ fromSlug: '', fragment: '' }]).map(redirectRuleRowHtml).join('')}
            </div>
            <input type="hidden" name="redirectRulesJson" value="${escapeHtml(JSON.stringify(rules))}" />
            <button class="secondary-button compact-button" type="button" data-editor-redirect-add>${ui("Adicionar redirecionamento", "Add redirect")}</button>
          </section>
        </div>
      </details>
    `
  }

  function syncEditorRedirectRules(form) {
    const hidden = form?.elements?.redirectRulesJson
    if (!hidden) return []
    const rules = Array.from(form.querySelectorAll('[data-editor-redirect-row]')).map(row => ({
      fromSlug: row.querySelector('[data-redirect-from]')?.value?.trim() || '',
      fragment: row.querySelector('[data-redirect-fragment]')?.value?.trim().replace(/^#/, '') || ''
    })).filter(rule => rule.fromSlug)
    hidden.value = JSON.stringify(rules)
    hidden.dispatchEvent(new Event('input', { bubbles: true }))
    return rules
  }

  function renderEditorRedirectRows(form, rules = []) {
    const list = form?.querySelector('[data-editor-redirect-list]')
    if (!list) return
    const normalized = Array.isArray(rules) ? rules : []
    list.innerHTML = (normalized.length ? normalized : [{ fromSlug: '', fragment: '' }]).map(redirectRuleRowHtml).join('')
  }

  function bindEditorRouting(form) {
    if (!form?.querySelector('[data-editor-routing]')) return
    form.addEventListener('click', event => {
      const add = event.target.closest('[data-editor-redirect-add]')
      const remove = event.target.closest('[data-editor-redirect-remove]')
      if (!add && !remove) return
      event.preventDefault()
      if (add) form.querySelector('[data-editor-redirect-list]')?.insertAdjacentHTML('beforeend', redirectRuleRowHtml())
      if (remove) {
        const rows = form.querySelectorAll('[data-editor-redirect-row]')
        if (rows.length > 1) remove.closest('[data-editor-redirect-row]')?.remove()
        else {
          remove.closest('[data-editor-redirect-row]')?.querySelectorAll('input').forEach(input => { input.value = '' })
        }
      }
      syncEditorRedirectRules(form)
    })
    form.addEventListener('input', event => {
      if (event.target.matches?.('[data-redirect-from], [data-redirect-fragment]')) syncEditorRedirectRules(form)
    })
    form.addEventListener('wikidraftrestored', () => {
      try { renderEditorRedirectRows(form, JSON.parse(form.elements.redirectRulesJson?.value || '[]')) } catch { renderEditorRedirectRows(form, []) }
    })
    syncEditorRedirectRules(form)
  }

  function formHtml(page, mode) {
    const isProposal = mode === 'suggest'
    const canDeletePage = roleAtLeast(currentUser.role, 'moderator')

    return `
      <header class="article-header">
        <h1>${isProposal ? ui("Sugerindo alteração em", "Suggesting changes to") : page.isNew ? ui("Criando", "Creating") : ui("Editando", "Editing")} “${escapeHtml(page.title)}”</h1>
        <p class="article-subtitle">${isProposal ? ui("A proposta será enviada para análise editorial antes de qualquer publicação.", "The proposal will be reviewed before publication.") : editSubtitle()}</p>
      </header>

      <form class="editor-panel" id="editForm">
        <div class="editor-draft-warning" data-draft-warning hidden></div>
        <p class="editor-draft-status" data-editor-draft-status>${ui("Rascunho local ativo. Alterações no editor serão salvas neste navegador.", "Local draft enabled. Edits are saved in this browser.")}</p>

        <label>
          ${ui("Título", "Title")}<br />
          <input name="title" value="${escapeHtml(page.title)}" required />
        </label>

        <label>
          ${ui("Subtítulo", "Subtitle")}<br />
          <input name="subtitle" value="${escapeHtml(page.subtitle || '')}" />
        </label>

        <label class="editor-url-field">
          URL<br />
          ${(() => {
            const parts = editorUrlParts(page.slug || slugify(page.title))
            return `<span class="editor-url-control"><span class="editor-url-prefix">${escapeHtml(parts.prefix)}</span><input name="urlSlug" value="${escapeHtml(parts.value)}" autocomplete="off" ${mode === 'edit' && !page.isNew && !['admin', 'super_admin'].includes(currentUser.role) ? 'readonly' : ''} /></span>`
          })()}
          <small>${ui("Edite apenas o nome final da página. O prefixo do namespace fica travado.", "Edit the final page name. The namespace prefix remains fixed.")}</small>
        </label>

        <div class="editor-content-field">
          <label for="wiki-editor-content">${ui("Conteúdo em Markdown", "Markdown content")}</label>
          ${editorToolbarHtml(isProposal)}
          <div class="editor-tool-panel-region">
            ${featureEnabled('templates') ? templateGalleryHtml() : ''}
            ${featureEnabled('mediaUploads') && !isProposal ? uploadPanelHtml() : ''}
          </div>
          <textarea id="wiki-editor-content" class="editor-content-textarea" name="content" spellcheck="false">${escapeHtml(page.content || '')}</textarea>
        </div>

        ${featureEnabled('categories') ? `
          <label>
            ${ui("Categorias", "Categories")}<br />
            <input name="categories" value="${escapeHtml((page.categories || []).join(', '))}" />
          </label>
        ` : ''}

        ${!isProposal ? editorRoutingHtml(page) : ''}

        <label>
          ${ui("Resumo da ", "Summary of the ")}${isProposal ? ui("proposta", "proposal") : ui("edição", "edit")}<br />
          <input name="summary" placeholder="${ui("descreva brevemente a alteração", "briefly describe the change")}" required />
        </label>

        ${isProposal ? `
          <label>
            ${ui("Contato opcional", "Optional contact")}<br />
            <input name="contact" placeholder="${ui("e-mail, Discord ou outra referência", "email, Discord or another contact")}" />
          </label>
        ` : ''}

        <div class="editor-actions">
          <button class="primary-button" type="submit">${isProposal ? ui("Enviar proposta", "Submit proposal") : ui("Salvar revisão", "Save revision")}</button>
          <button class="secondary-button" type="button" data-editor-preview-button>${ui("Pré-visualizar", "Preview")}</button>
          <a class="secondary-button" href="${pageUrl(page.slug)}" data-link="page" data-slug="${escapeHtml(page.slug)}">${ui("Cancelar", "Cancel")}</a>
          ${!isProposal && !page.isNew && canDeletePage ? `<button class="danger-button" type="button" data-delete-page>${ui("Deletar página", "Delete page")}</button>` : ''}
        </div>

        <p class="editor-note" id="editorNote">${isProposal ? ui("Visitantes não editam diretamente. A proposta é enviada para a fila de revisão.", "Visitors submit proposals to the review queue.") : ui("A edição direta é aceita automaticamente para e-mails autorizados pelo Cloudflare Access.", "Direct editing is available to editors authorized through Cloudflare Access.")}</p>
      </form>

      <section class="editor-preview-slot" data-editor-preview hidden></section>
    `
  }

  function readFormPayload(form) {
    const data = new FormData(form)
    const title = data.get('title').toString().trim()
    const categories = (data.get('categories') || '').toString().split(',').map(item => item.trim()).filter(Boolean)
    const aliases = (data.get('aliases') || '').toString().split(/[\n,]+/).map(item => item.trim()).filter(Boolean)
    let redirectRules = []
    try {
      redirectRules = JSON.parse((data.get('redirectRulesJson') || '[]').toString())
        .map(rule => ({ fromSlug: String(rule?.fromSlug || '').trim(), fragment: String(rule?.fragment || '').trim().replace(/^#/, '') }))
        .filter(rule => rule.fromSlug)
    } catch {}

    const urlField = form.querySelector('input[name="urlSlug"]')
    const urlPrefix = form.querySelector('.editor-url-prefix')?.textContent || '/wiki/'

    return {
      title,
      urlSlug: editorSlugFromUrl(urlPrefix, urlField?.value || title),
      subtitle: data.get('subtitle').toString().trim(),
      content: data.get('content').toString(),
      categories,
      aliases,
      redirects: redirectRules.map(rule => rule.fromSlug),
      redirectRules,
      summary: data.get('summary').toString().trim(),
      contact: data.get('contact')?.toString().trim() || ''
    }
  }


  async function renderEditorPreview(page, form) {
    const previewSlot = document.querySelector('[data-editor-preview]')
    if (!previewSlot) return

    const payload = readFormPayload(form)
    const nextSlug = page.slug || slugify(payload.title)
    const previewPage = {
      ...page,
      slug: nextSlug,
      title: payload.title || page.title,
      subtitle: payload.subtitle,
      content: payload.content,
      categories: payload.categories,
      aliases: payload.aliases,
      redirects: payload.redirects,
      redirectRules: payload.redirectRules
    }

    const context = await renderContext()
    previewSlot.innerHTML = editorPreviewHtml(previewPage, context)
    previewSlot.hidden = false
    previewSlot.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  function insertAtCursor(textarea, value) {
    if (!textarea) return

    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? textarea.value.length
    const prefix = textarea.value && !textarea.value.endsWith('\n') ? '\n' : ''
    const insertion = `${prefix}${value.trim()}\n\n`
    textarea.setRangeText(insertion, start, end, 'end')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.focus()
  }

  function wrapSelection(textarea, before, after = before, placeholder = 'texto') {
    if (!textarea) return

    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? textarea.value.length
    const selected = textarea.value.slice(start, end) || placeholder
    textarea.setRangeText(`${before}${selected}${after}`, start, end, 'select')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.focus()
  }

  function insertLineSnippet(textarea, snippet) {
    insertAtCursor(textarea, snippet)
  }

  const editorDraftPrefix = 'wikicambada:editor-draft:v2'

  function editorDraftKey(page, mode) {
    const state = currentState()
    const slug = page?.slug || state.slug || slugify(page?.title || '') || 'nova-pagina'
    return `${editorDraftPrefix}:${mode}:${slug}`
  }

  function readEditorDraft(key) {
    try {
      return JSON.parse(window.localStorage.getItem(key) || 'null')
    } catch {
      return null
    }
  }

  function writeEditorDraft(key, draft) {
    try {
      window.localStorage.setItem(key, JSON.stringify(draft))
      return true
    } catch {
      return false
    }
  }

  function removeEditorDraft(key) {
    try {
      window.localStorage.removeItem(key)
    } catch {}
  }

  function formDraftFields(form) {
    const fields = {}
    for (const element of Array.from(form.elements || [])) {
      if (!element.name || element.type === 'file' || element.disabled) continue
      fields[element.name] = element.value
    }
    return fields
  }

  function applyDraftFields(form, fields = {}) {
    for (const [name, value] of Object.entries(fields)) {
      const element = form.elements[name]
      if (!element || element.type === 'file') continue
      element.value = value
    }
  }

  function draftHasUsefulContent(draft) {
    const fields = draft?.fields || {}
    return Boolean(String(fields.content || '').trim() || String(fields.title || '').trim())
  }

  function bindLocalEditorDraft(page, mode, form, note) {
    if (!form || !window.localStorage) return { clear() {} }

    const key = editorDraftKey(page, mode)
    const saved = readEditorDraft(key)
    const warning = form.querySelector('[data-draft-warning]')
    const status = form.querySelector('[data-editor-draft-status]') || document.createElement('p')
    if (!status.parentNode) {
      status.className = 'editor-draft-status'
      status.dataset.editorDraftStatus = ''
      form.prepend(status)
    }
    status.textContent = ui("Rascunho local ativo. Alterações no editor serão salvas neste navegador.", "Local draft enabled. Edits are saved in this browser.")

    let timer = 0
    let lastSavedAt = ''

    const updateStatus = text => {
      status.textContent = text
    }

    const resetWarning = () => {
      if (!warning) return
      warning.hidden = true
      warning.innerHTML = ''
    }

    const save = () => {
      const draft = {
        slug: page?.slug || currentState().slug || '',
        mode,
        savedAt: new Date().toISOString(),
        fields: formDraftFields(form)
      }
      if (!draftHasUsefulContent(draft)) return
      if (writeEditorDraft(key, draft)) {
        lastSavedAt = draft.savedAt
        updateStatus(`${ui("Rascunho local salvo às ", "Local draft saved at ")}${new Date(draft.savedAt).toLocaleTimeString(interfaceLocale(), { hour: '2-digit', minute: '2-digit' })}.`)
      } else {
        updateStatus(ui("Não foi possível salvar o rascunho local. O armazenamento do navegador pode estar cheio ou bloqueado.", "Could not save the local draft. Browser storage may be full or blocked."))
      }
    }

    const scheduleSave = () => {
      window.clearTimeout(timer)
      updateStatus(ui("Salvando rascunho local...", "Saving local draft..."))
      timer = window.setTimeout(save, 700)
    }

    const currentFields = formDraftFields(form)
    if (draftHasUsefulContent(saved) && JSON.stringify(saved.fields || {}) !== JSON.stringify(currentFields)) {
      const when = saved.savedAt ? new Date(saved.savedAt).toLocaleString(interfaceLocale()) : ui("data desconhecida", "unknown date")
      const target = warning || note
      if (target) {
        target.hidden = false
        target.innerHTML = `${ui("Há um rascunho local desta edição salvo em ", "A local draft of this edit was saved on ")}${escapeHtml(when)}. <button class="secondary-button compact-button" type="button" data-draft-restore>${ui("Restaurar", "Restore")}</button> <button class="secondary-button compact-button" type="button" data-draft-discard>${ui("Descartar", "Discard")}</button>`
      }
    }

    form.addEventListener('click', event => {
      const restore = event.target.closest('[data-draft-restore]')
      const discard = event.target.closest('[data-draft-discard]')
      if (!restore && !discard) return
      event.preventDefault()

      if (restore) {
        const draft = readEditorDraft(key)
        if (draftHasUsefulContent(draft)) {
          applyDraftFields(form, draft.fields)
          form.dispatchEvent(new CustomEvent('wikidraftrestored'))
          updateStatus(ui("Rascunho local restaurado. Continue editando normalmente.", "Local draft restored. Continue editing."))
          form.elements.content?.focus()
          scheduleSave()
        }
        resetWarning()
        return
      }

      removeEditorDraft(key)
      resetWarning()
      updateStatus(ui("Rascunho local descartado.", "Local draft discarded."))
    })

    form.addEventListener('input', event => {
      if (!event.target?.name) return
      scheduleSave()
    })

    form.addEventListener('change', event => {
      if (!event.target?.name) return
      scheduleSave()
    })

    return {
      clear() {
        window.clearTimeout(timer)
        removeEditorDraft(key)
        resetWarning()
      },
      saveNow: save,
      lastSavedAt: () => lastSavedAt
    }
  }

  function setEditorSaving(form, isSaving, message = '') {
    if (!form) return
    const buttons = Array.from(form.querySelectorAll('button, input[type="submit"]'))
    if (isSaving) {
      form.classList.add('is-saving')
      form.dataset.saving = '1'
      buttons.forEach(button => {
        button.dataset.wasDisabled = button.disabled ? '1' : '0'
        button.disabled = true
      })
      if (message) {
        const submit = form.querySelector('button[type="submit"]')
        if (submit) {
          submit.dataset.originalText = submit.dataset.originalText || submit.textContent
          submit.textContent = message
        }
      }
      startSaveProgress()
      return
    }

    form.classList.remove('is-saving')
    delete form.dataset.saving
    buttons.forEach(button => {
      if (button.dataset.wasDisabled !== '1') button.disabled = false
      delete button.dataset.wasDisabled
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText
        delete button.dataset.originalText
      }
    })
    finishSaveProgress()
  }

  function mergeEditorContent(baseContent, latestContent, localContent) {
    const base = String(baseContent || '')
    const latest = String(latestContent || '')
    const local = String(localContent || '')
    if (!latest.trim()) return local
    if (!local.trim()) return latest
    if (latest === local) return local
    if (latest.includes(local)) return latest
    if (local.includes(latest)) return local

    if (base && latest.startsWith(base) && local.startsWith(base)) {
      const localTail = local.slice(base.length).trim()
      if (localTail && !latest.includes(localTail)) return `${latest.trimEnd()}\n\n${localTail}`
    }

    if (base && latest.includes(base) && local.includes(base)) {
      const localTail = local.replace(base, '').trim()
      if (localTail && !latest.includes(localTail)) return `${latest.trimEnd()}\n\n${localTail}`
    }

    return `${latest.trimEnd()}\n\n---\n\n### alterações locais preservadas\n\n${local.trimStart()}`
  }

  function applyLatestPageToForm(form, latest) {
    if (!form || !latest) return
    if (form.elements.title) form.elements.title.value = latest.title || ''
    if (form.elements.subtitle) form.elements.subtitle.value = latest.subtitle || ''
    if (form.elements.content) form.elements.content.value = latest.content || ''
    if (form.elements.categories) form.elements.categories.value = (latest.categories || []).join(', ')
    if (form.elements.aliases) form.elements.aliases.value = (latest.aliases || []).map(alias => alias.title || alias).join('\n')
    const rules = Array.isArray(latest.redirectRules) ? latest.redirectRules : (latest.redirects || []).map(fromSlug => ({ fromSlug, fragment: '' }))
    if (form.elements.redirectRulesJson) form.elements.redirectRulesJson.value = JSON.stringify(rules)
    renderEditorRedirectRows(form, rules)
  }

  function createConflictModal({ page, latest, draftContent }) {
    return new Promise(resolve => {
      const modal = document.createElement('div')
      modal.className = 'editor-conflict-modal'
      modal.setAttribute('role', 'dialog')
      modal.setAttribute('aria-modal', 'true')
      modal.innerHTML = `
        <section class="editor-conflict-dialog">
          <header>
            <h2>${ui("Esta página foi atualizada enquanto você editava", "This page changed while you were editing")}</h2>
            <p>${ui("Compare a sua versão com a versão mais recente publicada antes de continuar.", "Compare your edit with the latest published version before continuing.")}</p>
          </header>
          <div class="editor-conflict-grid">
            <div class="editor-conflict-pane">
              <h3>${ui("Sua edição atual", "Your current edit")}</h3>
              <pre>${escapeHtml(draftContent || '')}</pre>
            </div>
            <div class="editor-conflict-pane">
              <h3>${ui("Versão publicada mais recente", "Latest published version")}</h3>
              <pre>${escapeHtml(latest?.content || '')}</pre>
            </div>
          </div>
          <footer>
            <button class="primary-button" type="button" data-conflict-action="merge">${ui("Mesclar", "Merge")}</button>
            <button class="secondary-button" type="button" data-conflict-action="replace">${ui("Substituir", "Replace")}</button>
            <button class="secondary-button" type="button" data-conflict-action="ignore">${ui("Ignorar", "Ignore")}</button>
            <button class="secondary-button" type="button" data-conflict-action="cancel">${ui("Cancelar", "Cancel")}</button>
          </footer>
        </section>
      `

      const close = value => {
        modal.remove()
        resolve(value)
      }

      modal.addEventListener('click', event => {
        const button = event.target.closest('[data-conflict-action]')
        if (!button) return
        event.preventDefault()
        const action = button.dataset.conflictAction
        if (action === 'cancel') {
          close('cancel')
          return
        }
        const labels = {
          merge: ui("mesclar a versão publicada com a sua edição atual", "merge the published version with your current edit"),
          replace: ui("substituir a sua edição pela versão publicada mais recente", "replace your edit with the latest published version"),
          ignore: ui("ignorar a versão publicada mais recente e continuar com a sua edição", "ignore the latest published version and continue with your edit")
        }
        const ok = window.confirm(`${ui('Confirmar', 'Confirm')} ${labels[action] || ui("esta ação", "this action")}${ui("? Esta decisão não pode ser desfeita automaticamente.", "? This decision cannot be undone automatically.")}`)
        if (ok) close(action)
      })

      document.body.appendChild(modal)
      modal.querySelector('[data-conflict-action="merge"]')?.focus()
    })
  }

  async function resolveEditConflictBeforeSave(page, form, payload, note) {
    payload = { ...payload, expectedRevisionId: page?.currentRevisionId || null }
    if (!page) return { proceed: true, payload }

    const latest = await getPageFresh(page.slug)
    if (!latest || (!page.isNew && latest.currentRevisionId === page.currentRevisionId && latest.slug === page.slug && latest.title === page.title)) return { proceed: true, payload }

    const action = await createConflictModal({ page, latest, draftContent: payload.content })
    payload.expectedRevisionId = latest.currentRevisionId
    if (action === 'cancel') return { proceed: false, payload }

    const baseContent = page.content
    const urlField = form.elements.urlSlug
    if (latest.slug !== page.slug && readFormPayload(form).urlSlug === page.slug && urlField) {
      const parts = editorUrlParts(latest.slug)
      urlField.value = parts.value
      const prefix = form.querySelector('.editor-url-prefix')
      if (prefix) prefix.textContent = parts.prefix
    }
    Object.assign(page, latest, { isNew: false })
    if (action === 'replace') {
      applyLatestPageToForm(form, latest)
      if (note) note.innerHTML = ui("A edição local foi substituída pela versão publicada mais recente. Revise antes de salvar novamente.", "Your edit was replaced with the latest published version. Review it before saving again.")
      return { proceed: false, payload }
    }

    if (action === 'merge') {
      const merged = mergeEditorContent(baseContent, latest.content, payload.content)
      if (form.elements.content) form.elements.content.value = merged
      return {
        proceed: true,
        payload: {
          ...payload,
          title: payload.title || latest.title,
          subtitle: payload.subtitle || latest.subtitle || '',
          content: merged,
          summary: payload.summary || ui("mesclada com revisão mais recente", "merged with latest revision")
        }
      }
    }

    return { proceed: true, payload }
  }

  function parseTemplateCallValues(callText) {
    const clean = String(callText || '')
      .trim()
      .replace(/^\{\{\s*/, '')
      .replace(/\s*}}\s*$/, '')

    const parts = clean
      .split('|')
      .map(part => part.trim())
      .filter(Boolean)

    const values = new Map()
    const name = parts.shift() || 'Template'
    values.set('template', name)

    parts.forEach((part, index) => {
      const eq = part.indexOf('=')
      if (eq > 0) {
        const key = part.slice(0, eq).trim()
        const value = part.slice(eq + 1).trim()
        values.set(normalizeKey(key), value)
        values.set(key, value)
        return
      }

      values.set(String(index + 1), part)
    })

    return values
  }

  function templateRenderWithSampleValues(renderText, callText) {
    const values = parseTemplateCallValues(callText)
    return String(renderText || '').replace(/\{\{\{\s*([^}|]+)\s*(?:\|\s*([^}]*?)\s*)?}}}/g, (_, key, fallback = '') => {
      const clean = normalizeKey(key)
      return values.get(clean) || values.get(String(key).trim()) || fallback || ''
    })
  }

  function updateTemplatePreview(form) {
    if (!form) return
    const preview = form.querySelector('[data-template-preview]')
    if (!preview) return
    const render = form.elements.render?.value || ''
    const call = form.elements.call?.value || ''
    const title = form.elements.title?.value?.trim() || 'template'

    if (!render.trim()) {
      preview.innerHTML = `<p class="empty-state">${ui("A prévia aparecerá aqui.", "The preview will appear here.")}</p>`
      return
    }

    const rendered = templateRenderWithSampleValues(render, call)
    preview.innerHTML = `
      <article class="wiki-article template-preview-article">
        <header class="article-header">
          <h1>${escapeHtml(title)}</h1>
        </header>
        <div class="article-body">${markdownToHtml(rendered, { templates: [] })}</div>
      </article>
    `
    window.WikiCambadaMediaViewer?.bind?.(preview)
  }

  function updateTemplateEditorState(form) {
    if (!form) return
    const title = form.elements.title?.value?.trim() || 'Novo template'
    const heading = form.querySelector('[data-template-editor-title]')
    if (heading) heading.textContent = form.elements.id?.value ? `Editando: ${title}` : title
    updateTemplatePreview(form)
  }

  function insertTemplateEditorSnippet(form, tool) {
    if (!form) return
    const render = form.elements.render
    const call = form.elements.call
    const active = document.activeElement === call ? call : render
    const snippets = {
      templatebox: ':::templatebox maintenance\ntitle: {{{titulo|Título do aviso}}}\nsubtitle: {{{subtitulo|}}}\nicon: {{{icone|⚠️}}}\nimage: {{{imagem|}}}\nposition: {{{posicao|left}}}\naccent: {{{cor|#d18a28}}}\n\nTexto do template com **Markdown** e parâmetros.\n\nfooter: {{{rodape|}}}\n:::',
      parameter: '{{{parametro|valor padrão}}}',
      title: 'title: {{{titulo|Título do template}}}',
      image: 'image: {{{imagem|}}}\nposition: {{{posicao|left}}}',
      footer: 'footer: {{{rodape|texto de rodapé}}}',
      issues: '- {{{problema1|primeiro problema}}}\n- {{{problema2|segundo problema}}}',
      link: '[[Nome do artigo|texto do link]]'
    }

    if (tool === 'parameter') return wrapSelection(active, '{{{', '|valor padrão}}}', 'parametro')
    if (snippets[tool]) insertLineSnippet(active, snippets[tool])
    updateTemplateEditorState(form)
  }


  function closeEditorToolPanels(form, except = null) {
    form?.querySelectorAll?.('.editor-tool-panel').forEach(panel => {
      if (panel === except) return
      panel.hidden = true
      panel.classList.remove('is-open')
    })
  }

  function showEditorToolPanel(form, panel) {
    if (!panel) return false
    closeEditorToolPanels(form, panel)
    panel.hidden = false
    panel.classList.add('is-open')
    return true
  }

  function openMediaTab(form, tab = 'library') {
    const panel = form?.querySelector('[data-media-panel]')
    if (!panel) return
    showEditorToolPanel(form, panel)

    panel.querySelectorAll('[data-media-tab-target]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.mediaTabTarget === tab)
    })

    panel.querySelectorAll('[data-media-tab-panel]').forEach(area => {
      area.hidden = area.dataset.mediaTabPanel !== tab
    })
  }

  function isVideoFile(file) {
    return String(file?.mimeType || '').toLowerCase().startsWith('video/')
  }

  function isAudioFile(file) {
    return String(file?.mimeType || '').toLowerCase().startsWith('audio/')
  }

  function mediaSnippet(file, options = {}) {
    const mode = options.mode || 'thumb'
    const align = options.align || 'right'
    const width = Math.min(420, Math.max(120, Number.parseInt(options.width || '260', 10) || 260))
    const src = file.contentUrl || `/api/files/${encodeURIComponent(file.slug || file.id)}/content`
    const details = file.pageUrl || `/wiki/arquivo/${file.slug || file.id}`
    const caption = String(file.description || file.filename || file.slug || ui("mídia", "media")).replace(/[\r\n]/g, ' ')
    const alt = String(file.filename || caption).replace(/[\r\n]/g, ' ')
    const video = isVideoFile(file)
    const audio = isAudioFile(file)
    const typeLine = video ? 'type: video\n' : audio ? 'type: audio\n' : ''

    if (mode === 'gallery') {
      const prefix = video ? 'video:' : audio ? 'audio:' : ''
      return `:::gallery\n${prefix}${src} | ${caption} | ${details}\n:::`
    }

    if (mode === 'image') {
      if (video) return `:::video\nsrc: ${src}\ntitle: ${alt}\ncaption: ${caption}\ndetails: ${details}\n:::`
      if (audio) return `:::audio\nsrc: ${src}\ntitle: ${alt}\ncaption: ${caption}\ndetails: ${details}\n:::`
      return `:::image\nsrc: ${src}\nalt: ${alt}\ncaption: ${caption}\ndetails: ${details}\n:::`
    }

    return `:::thumb\nsrc: ${src}\n${typeLine}alt: ${alt}\ncaption: ${caption}\ndetails: ${details}\nalign: ${align}\nwidth: ${width}\n:::`
  }

  function externalMediaUrlSnippet(url, options = {}) {
    const clean = String(url || '').trim()
    const title = String(options.title || '').trim()
    const caption = String(options.caption || '').trim()
    const mediaType = String(options.mediaType || 'video')
    const mode = options.mode || 'image'
    const align = options.align || 'right'
    const width = Math.min(420, Math.max(120, Number.parseInt(options.width || '260', 10) || 260))
    const kind = String(options.kind || 'auto')
    if (!clean) return ''

    const youtube = mediaType === 'video' && (kind === 'youtube' || /(?:youtube\.com|youtu\.be)/i.test(clean))
    const typedSrc = youtube ? `youtube:${clean}` : mediaType === 'audio' ? `audio:${clean}` : mediaType === 'video' ? `video:${clean}` : clean

    if (mode === 'gallery') return `:::gallery\n${typedSrc} | ${caption || title || clean} | ${clean}\n:::`
    if (mode === 'thumb') {
      return `:::thumb\nsrc: ${clean}\ntype: ${youtube ? 'video' : mediaType}\nalt: ${title || caption || clean}\ncaption: ${caption || title}\nalign: ${align}\nwidth: ${width}\n:::`
    }

    const lines = [`:::${mediaType === 'audio' ? 'audio' : 'video'}`]
    lines.push(`${youtube ? 'youtube' : 'src'}: ${clean}`)
    if (title) lines.push(`title: ${title}`)
    if (caption) lines.push(`caption: ${caption}`)
    lines.push(':::')
    return lines.join('\n')
  }

  function videoUrlSnippet(url, options = {}) {
    return externalMediaUrlSnippet(url, { ...options, mediaType: 'video' })
  }

  function audioUrlSnippet(url, options = {}) {
    return externalMediaUrlSnippet(url, { ...options, mediaType: 'audio' })
  }

  function mediaCardHtml(file) {
    const title = file.filename || file.slug || 'arquivo'
    const description = file.description || file.mimeType || ''
    const src = file.contentUrl || `/api/files/${encodeURIComponent(file.slug || file.id)}/content`
    const video = isVideoFile(file)
    const audio = isAudioFile(file)
    const preview = video
      ? `<video src="${escapeHtml(src)}" preload="metadata" muted playsinline></video>`
      : audio
        ? `<div class="media-library-audio-preview" aria-hidden="true">♪</div>`
        : `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy" draggable="false" />`
    return `
      <article class="media-library-card" data-media-file="${escapeHtml(file.slug || file.id || '')}">
        <button type="button" class="media-library-preview" data-media-insert-file="${escapeHtml(file.slug || file.id || '')}">
          ${preview}
        </button>
        <div class="media-library-meta">
          <strong>${escapeHtml(title)}</strong>
          ${description ? `<span>${escapeHtml(description)}</span>` : ''}
          <code>${escapeHtml(file.slug || file.id || '')}</code>
        </div>
        <button class="secondary-button" type="button" data-media-insert-file="${escapeHtml(file.slug || file.id || '')}">${ui("Inserir", "Insert")}</button>
      </article>
    `
  }

  async function loadMediaLibrary(form, offset = 0) {
    const grid = form.querySelector('[data-media-library-grid]')
    const note = form.querySelector('[data-media-library-note]')
    const searchInput = form.querySelector('[data-media-search]')
    if (!grid) return []

    grid.innerHTML = `<p class="upload-note">${ui("Carregando mídia enviada...", "Loading uploaded media...")}</p>`
    if (note) note.innerHTML = ui("Consultando acervo de mídia.", "Loading media library.")

    try {
      const files = await listFiles({ search: searchInput?.value.trim() || '', limit: 80, offset })
      grid.dataset.files = JSON.stringify(files)
      grid.innerHTML = files.length
        ? files.map(mediaCardHtml).join('')
        : `<p class="upload-note">${ui("Nenhum arquivo foi encontrado.", "No files found.")}</p>`
      grid.insertAdjacentHTML('beforeend', paginationHtml(offset > 0, files.length === 80, 'media'))
      grid.querySelector('[data-media-prev]')?.addEventListener('click', () => loadMediaLibrary(form, Math.max(0, offset - 80)))
      grid.querySelector('[data-media-next]')?.addEventListener('click', () => loadMediaLibrary(form, offset + 80))
      if (note) note.innerHTML = files.length
        ? `${files.length}${ui(" arquivo(s) encontrado(s). Escolha como inserir antes de clicar em Inserir.", " file(s) found. Choose an insertion mode before clicking Insert.")}`
        : ui("Nenhum arquivo encontrado para essa busca.", "No files found for this search.")
      return files
    } catch (error) {
      grid.innerHTML = `<p class="upload-note">${ui("Não foi possível carregar a mídia. ", "Could not load media. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`
      if (note) note.innerHTML = ui("A listagem de mídia exige acesso de editor.", "The media library requires editor access.")
      return []
    }
  }


  function normalizeTemplateSnippet(value) {
    return String(value || '')
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
  }

  function templateCardHtml(template) {
    const call = normalizeTemplateSnippet(template.call || template.content || '')
    const kind = template.kind || 'template'
    const group = template.groupName || 'Geral'
    return `
      <article class="template-gallery-card media-library-card" data-template-card data-template-group="${escapeHtml(group)}" data-template-kind="${escapeHtml(kind)}">
        <div class="template-gallery-preview" aria-hidden="true">
          <pre><code>${escapeHtml(call || `{{${template.title || template.slug || 'Template'}}}`)}</code></pre>
        </div>
        <div class="media-library-meta template-gallery-meta">
          <strong>${escapeHtml(template.title || template.slug || 'template')}</strong>
          <span>${escapeHtml(template.description || '')}</span>
          <small>${escapeHtml(group)} · ${escapeHtml(kind)} · ${escapeHtml(template.minRole || 'guest')}</small>
        </div>
        <button class="secondary-button compact-button" type="button" data-template-insert="${escapeHtml(template.id || template.slug || '')}">${ui("Inserir", "Insert")}</button>
      </article>
    `
  }

  function filterTemplateCards(form) {
    const query = form.querySelector('[data-template-search]')?.value.trim().toLowerCase() || ''
    const group = form.querySelector('[data-template-group]')?.value || ''
    form.querySelectorAll('[data-template-card]').forEach(card => {
      const text = card.textContent.toLowerCase()
      const cardGroup = card.dataset.templateGroup || ''
      card.hidden = Boolean((query && !text.includes(query)) || (group && group !== cardGroup))
    })
  }

  async function loadTemplateGallery(form) {
    const grid = form.querySelector('[data-template-grid]')
    const groupSelect = form.querySelector('[data-template-group]')
    const note = form.querySelector('[data-template-gallery-note]')
    if (!grid) return []

    grid.innerHTML = `<p class="upload-note">${ui("Carregando templates...", "Loading templates...")}</p>`
    if (note) note.innerHTML = 'Consultando galeria de templates.'

    try {
      const templates = await listTemplates({ secure: Boolean(currentUser.canEdit) })
      grid.dataset.templates = JSON.stringify(templates)
      const groups = Array.from(new Set(templates.map(template => template.groupName || 'Geral'))).sort((a, b) => a.localeCompare(b, interfaceLocale()))
      if (groupSelect) {
        const current = groupSelect.value
        groupSelect.innerHTML = `<option value="">${ui("Todos", "All")}</option>` + groups.map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join('')
        groupSelect.value = groups.includes(current) ? current : ''
      }
      grid.innerHTML = templates.length
        ? templates.map(templateCardHtml).join('')
        : `<p class="upload-note">${ui("Nenhum template disponível para seu nível de acesso.", "No templates available for your access level.")}</p>`
      if (note) note.innerHTML = templates.length ? `${templates.length}${ui(" template(s) disponível(is).", " available template(s).")}` : ui("Nenhum template disponível.", "No templates available.")
      filterTemplateCards(form)
      return templates
    } catch (error) {
      grid.innerHTML = `<p class="upload-note">${ui("Não foi possível carregar os templates. ", "Could not load templates. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`
      if (note) note.innerHTML = ui("A API de templates não respondeu corretamente.", "The templates API returned an invalid response.")
      return []
    }
  }

  function bindTemplateGallery(form, note) {
    const panel = form.querySelector('[data-template-gallery]')
    if (!panel) return

    panel.addEventListener('click', async event => {
      const load = event.target.closest('[data-template-load]')
      if (load && panel.contains(load)) {
        await loadTemplateGallery(form)
        return
      }

      const insert = event.target.closest('[data-template-insert]')
      if (!insert || !panel.contains(insert)) return

      const templates = JSON.parse(form.querySelector('[data-template-grid]')?.dataset.templates || '[]')
      const template = templates.find(item => String(item.id || item.slug) === insert.dataset.templateInsert)
      if (!template) {
        note.innerHTML = ui("Não foi possível encontrar o template selecionado.", "Could not find the selected template.")
        return
      }

      insertAtCursor(form.elements.content, normalizeTemplateSnippet(template.call || template.content || ''))
      const galleryNote = form.querySelector('[data-template-gallery-note]')
      if (galleryNote) galleryNote.innerHTML = `Chamada do template “${escapeHtml(template.title)}” inserida no Markdown.`
    })

    panel.querySelector('[data-template-search]')?.addEventListener('input', () => filterTemplateCards(form))
    panel.querySelector('[data-template-group]')?.addEventListener('change', () => filterTemplateCards(form))
  }

  function openTemplateGallery(form) {
    const panel = form?.querySelector('[data-template-gallery]')
    if (!panel) return
    showEditorToolPanel(form, panel)
    loadTemplateGallery(form)
  }

  function bindMediaPanel(form, note) {
    const panel = form.querySelector('[data-media-panel]')
    if (!panel) return

    panel.addEventListener('click', async event => {
      const tab = event.target.closest('[data-media-tab-target]')
      if (tab && panel.contains(tab)) {
        openMediaTab(form, tab.dataset.mediaTabTarget)
        if (tab.dataset.mediaTabTarget === 'library') await loadMediaLibrary(form)
        return
      }

      const searchButton = event.target.closest('[data-media-search-button]')
      if (searchButton && panel.contains(searchButton)) {
        await loadMediaLibrary(form)
        return
      }

      const urlInsertButton = event.target.closest('[data-video-url-insert]')
      if (urlInsertButton && panel.contains(urlInsertButton)) {
        const urlInput = form.querySelector('[data-video-url]')
        const note = form.querySelector('[data-video-url-note]')
        const snippet = videoUrlSnippet(urlInput?.value || '', {
          title: form.querySelector('[data-video-url-title]')?.value || '',
          caption: form.querySelector('[data-video-url-caption]')?.value || '',
          kind: form.querySelector('[data-video-url-kind]')?.value || 'auto',
          mode: form.querySelector('[data-video-url-mode]')?.value || 'image',
          align: form.querySelector('[data-video-url-align]')?.value || 'right',
          width: form.querySelector('[data-video-url-width]')?.value || '260'
        })
        if (!snippet) {
          if (note) note.innerHTML = ui("Cole um link de vídeo antes de inserir.", "Paste a video link before inserting.")
          return
        }
        insertAtCursor(form.elements.content, snippet)
        if (note) note.innerHTML = ui("Vídeo por link inserido no Markdown.", "Video link inserted into Markdown.")
        return
      }

      const audioUrlInsertButton = event.target.closest('[data-audio-url-insert]')
      if (audioUrlInsertButton && panel.contains(audioUrlInsertButton)) {
        const urlInput = form.querySelector('[data-audio-url]')
        const note = form.querySelector('[data-audio-url-note]')
        const snippet = audioUrlSnippet(urlInput?.value || '', {
          title: form.querySelector('[data-audio-url-title]')?.value || '',
          caption: form.querySelector('[data-audio-url-caption]')?.value || '',
          mode: form.querySelector('[data-audio-url-mode]')?.value || 'image',
          align: form.querySelector('[data-audio-url-align]')?.value || 'right',
          width: form.querySelector('[data-audio-url-width]')?.value || '260'
        })
        if (!snippet) {
          if (note) note.innerHTML = ui("Cole um link de áudio antes de inserir.", "Paste an audio link before inserting.")
          return
        }
        insertAtCursor(form.elements.content, snippet)
        if (note) note.innerHTML = 'Áudio por link inserido no Markdown.'
        return
      }

      const insertButton = event.target.closest('[data-media-insert-file]')
      if (!insertButton || !panel.contains(insertButton)) return

      const slug = insertButton.dataset.mediaInsertFile
      const grid = form.querySelector('[data-media-library-grid]')
      const files = JSON.parse(grid?.dataset.files || '[]')
      const file = files.find(item => String(item.slug || item.id) === slug)
      if (!file) {
        note.innerHTML = ui("Não foi possível encontrar a imagem selecionada na listagem atual.", "Could not find the selected image in the current list.")
        return
      }

      const snippet = mediaSnippet(file, {
        mode: form.querySelector('[data-media-insert-mode]')?.value || 'thumb',
        align: form.querySelector('[data-media-insert-align]')?.value || 'right',
        width: form.querySelector('[data-media-insert-width]')?.value || '260'
      })
      insertAtCursor(form.elements.content, snippet)
      const libraryNote = form.querySelector('[data-media-library-note]')
      if (libraryNote) libraryNote.innerHTML = `${ui("Arquivo “", "File “")}${escapeHtml(file.filename || file.slug)}” inserido no Markdown.`
    })

    const searchInput = form.querySelector('[data-media-search]')
    searchInput?.addEventListener('keydown', async event => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      await loadMediaLibrary(form)
    })
  }

  function bindEditorToolbar(form) {
    const textarea = form.elements.content
    const toolbar = form.querySelector('[data-editor-tool]')?.closest('.editor-toolbar')
    if (!textarea || !toolbar) return

    const snippets = {
      heading: '## Novo título',
      subheading: '### Novo subtítulo',
      toc: '__TOC__',
      unordered: '- primeiro item\n- segundo item',
      ordered: '1. primeiro item\n2. segundo item',
      blockquote: '> texto citado\n> continuação da citação',
      codeblock: '```\ncole o código aqui\n```',
      table: '| Coluna 1 | Coluna 2 |\n| --- | --- |\n| valor | valor |',
      thumb: ':::thumb\nsrc: /api/files/arquivo/content\nalt: descrição da imagem\ncaption: legenda da miniatura\ndetails: /wiki/arquivo/arquivo\nalign: right\nwidth: 260\n:::',
      gallery: ':::gallery\n/api/files/arquivo-1/content | legenda da primeira imagem | /wiki/arquivo/arquivo-1\n/api/files/arquivo-2/content | legenda da segunda imagem | /wiki/arquivo/arquivo-2\n:::',
      quote: ':::quote\ncite: autor ou fonte\n\ntexto da citação\n:::',
      infobox: '{{Infobox\n|titulo=Nome\n|imagem=/api/files/arquivo/content\n|tipo=tipo ou categoria\n|criador=alguém\n|data=2026\n|campo livre=valor livre\n}}',
      messagebox: ':::messagebox aviso\ntitle: título do aviso\n\ntexto do aviso\n:::'
    }

    toolbar.addEventListener('click', event => {
      const button = event.target.closest('button[data-editor-tool]')
      if (!button || !toolbar.contains(button)) return
      event.preventDefault()
      event.stopPropagation()

      const tool = button.dataset.editorTool
      if (tool === 'bold') return wrapSelection(textarea, '**', '**', 'texto em negrito')
      if (tool === 'italic') return wrapSelection(textarea, '*', '*', 'texto em itálico')
      if (tool === 'underline') return wrapSelection(textarea, '__', '__', 'texto sublinhado')
      if (tool === 'strike') return wrapSelection(textarea, '~~', '~~', 'texto riscado')
      if (tool === 'inlinecode') return wrapSelection(textarea, '`', '`', 'código')
      if (tool === 'link') return wrapSelection(textarea, '[', '](https://exemplo.invalid)', 'texto do link')
      if (tool === 'media') {
        openMediaTab(form, 'library')
        loadMediaLibrary(form)
        return
      }
      if (tool === 'templates') {
        openTemplateGallery(form)
        return
      }
      if (snippets[tool]) insertLineSnippet(textarea, snippets[tool])
    })
  }

  function bindImageUpload(form, note) {
    const uploadButton = form.querySelector('[data-upload-button]')
    const fileInput = form.querySelector('[data-upload-file]')
    const captionInput = form.querySelector('[data-upload-caption]')
    const alignInput = form.querySelector('[data-upload-align]')
    const widthInput = form.querySelector('[data-upload-width]')
    const uploadNote = form.querySelector('[data-upload-note]')
    const videoUploadButton = form.querySelector('[data-video-upload-button]')
    const videoFileInput = form.querySelector('[data-video-upload-file]')
    const videoCaptionInput = form.querySelector('[data-video-upload-caption]')
    const videoTitleInput = form.querySelector('[data-video-upload-title]')
    const videoWidthInput = form.querySelector('[data-video-upload-width]')
    const videoModeInput = form.querySelector('[data-video-upload-mode]')
    const videoAlignInput = form.querySelector('[data-video-upload-align]')
    const videoUploadNote = form.querySelector('[data-video-upload-note]')
    const audioUploadButton = form.querySelector('[data-audio-upload-button]')
    const audioFileInput = form.querySelector('[data-audio-upload-file]')
    const audioCaptionInput = form.querySelector('[data-audio-upload-caption]')
    const audioTitleInput = form.querySelector('[data-audio-upload-title]')
    const audioModeInput = form.querySelector('[data-audio-upload-mode]')
    const audioAlignInput = form.querySelector('[data-audio-upload-align]')
    const audioWidthInput = form.querySelector('[data-audio-upload-width]')
    const audioUploadNote = form.querySelector('[data-audio-upload-note]')
    const content = form.elements.content

    async function uploadAndInsert({ button, file, caption, description, align = 'right', width = '260', mode = 'thumb', noteTarget }) {
      if (!file) {
        if (noteTarget) noteTarget.innerHTML = ui("Selecione um arquivo antes de enviar.", "Select a file before uploading.")
        return
      }

      button.disabled = true
      if (noteTarget) noteTarget.innerHTML = ui("Enviando arquivo para o acervo...", "Uploading file to the library...")

      try {
        const result = await uploadImage(file, { caption, description, align, width })
        const snippet = mediaSnippet(result.file || {}, { mode, align, width }) || result.markdown || ''
        insertAtCursor(content, snippet)
        const pageLink = result.file?.pageUrl || ''
        if (noteTarget) {
          noteTarget.innerHTML = pageLink
            ? `${ui("Arquivo enviado e inserido no artigo. ", "File uploaded and inserted into the article. ")}<a href="${escapeHtml(pageLink)}" data-link="route">${ui("Abrir página do arquivo", "Open file page")}</a>.`
            : ui("Arquivo enviado e inserido no artigo.", "File uploaded and inserted into the article.")
        }
      } catch (error) {
        const message = diagnosticDetail(error) || ui("erro desconhecido", "unknown error")
        if (noteTarget) noteTarget.innerHTML = `${ui("Não foi possível enviar o arquivo. ", "Could not upload the file. ")}${escapeHtml(message)}`
        note.innerHTML = `${ui("Não foi possível enviar o arquivo. ", "Could not upload the file. ")}${escapeHtml(message)}`
      } finally {
        button.disabled = false
      }
    }

    uploadButton?.addEventListener('click', async () => {
      await uploadAndInsert({
        button: uploadButton,
        file: fileInput?.files?.[0],
        caption: captionInput?.value.trim() || '',
        description: captionInput?.value.trim() || '',
        align: alignInput?.value || 'right',
        width: widthInput?.value || '260',
        noteTarget: uploadNote
      })
    })

    videoUploadButton?.addEventListener('click', async () => {
      const caption = videoCaptionInput?.value.trim() || ''
      const title = videoTitleInput?.value.trim() || ''
      await uploadAndInsert({
        button: videoUploadButton,
        file: videoFileInput?.files?.[0],
        caption,
        description: caption || title,
        align: videoAlignInput?.value || 'right',
        width: videoWidthInput?.value || '260',
        mode: videoModeInput?.value || 'thumb',
        noteTarget: videoUploadNote
      })
    })

    audioUploadButton?.addEventListener('click', async () => {
      const caption = audioCaptionInput?.value.trim() || ''
      const title = audioTitleInput?.value.trim() || ''
      await uploadAndInsert({
        button: audioUploadButton,
        file: audioFileInput?.files?.[0],
        caption,
        description: caption || title,
        align: audioAlignInput?.value || 'right',
        width: audioWidthInput?.value || '260',
        mode: audioModeInput?.value || 'image',
        noteTarget: audioUploadNote
      })
    })
  }

  function bindEditorPreview(page, form, note) {
    const previewButton = document.querySelector('[data-editor-preview-button]')
    if (!previewButton) return

    previewButton.addEventListener('click', async () => {
      previewButton.disabled = true
      try {
        await renderEditorPreview(page, form)
      } catch (error) {
        note.innerHTML = `${ui("Não foi possível gerar a pré-visualização. ", "Could not generate the preview. ")}${escapeHtml(diagnosticDetail(error) || '')}`
      } finally {
        previewButton.disabled = false
      }
    })
  }

  async function loadEditablePage(slug) {
    const existing = await getPage(slug)
    if (existing) return existing

    const isTalk = String(slug || '').startsWith('discussao/')
    const isUserPage = String(slug || '').startsWith('usuario/')
    const baseSlug = isTalk ? articleSlugFromTalk(slug) : isUserPage ? String(slug).slice('usuario/'.length) : slug
    const title = isTalk ? `Discussão: ${titleFromSlug(baseSlug)}` : isUserPage ? `Usuário: ${titleFromSlug(baseSlug)}` : titleFromSlug(slug)

    return {
      slug,
      title,
      subtitle: isTalk
        ? ui("Página de discussão associada ao artigo.", "Discussion page for the article.")
        : isUserPage
          ? `${ui("Página ", "Page ")}de usuário de ${SITE_NAME}.`
          : `${SITE_NAME} — ${SLOGAN}`,
      content: isTalk ? '## Discussão\n\nEscreva a primeira mensagem desta discussão.' : '',
      categories: isTalk ? [ui("Discussões", "Discussions")] : isUserPage ? [ui("Usuários", "Users")] : [SITE_CONFIG.site?.defaultCategory || SITE_NAME],
      aliases: [],
      redirects: [],
      isNew: true
    }
  }

  function bindPageDelete(page, note) {
    const deleteButton = document.querySelector('[data-delete-page]')
    if (!deleteButton) return

    deleteButton.addEventListener('click', async () => {
      const ok = window.confirm(`${ui("Deletar a página “", "Delete page “")}${page.title}${ui("”? Ela deixará de aparecer na leitura pública, busca e categorias.", "”? It will be removed from public reading, search and categories.")}`)
      if (!ok) return

      const typed = window.prompt(`Digite ${page.slug}${ui(" para confirmar a exclusão.", " to confirm deletion.")}`)
      if (typed !== page.slug) {
        note.innerHTML = ui("Exclusão cancelada. A confirmação não corresponde ao slug da página.", "Deletion cancelled. The confirmation does not match the page slug.")
        return
      }

      deleteButton.disabled = true
      note.innerHTML = ui("Deletando página...", "Deleting page...")

      try {
        await deletePage(page.slug)
        await navigate(pageUrl(HOME_SLUG))
      } catch (error) {
        deleteButton.disabled = false
        note.innerHTML = `${ui("Não foi possível deletar a página. ", "Could not delete the page. ")}${escapeHtml(diagnosticDetail(error) || '')}`
      }
    })
  }

  async function renderEdit(slug, serial) {
    updateChrome(slug, 'edit')

    if (String(slug || '').startsWith('arquivo/')) {
      setDocumentTitle({ title: 'Namespace de arquivo' })
      commitHtml(serial, fileNamespaceBlockedHtml(slug, currentUser))
      return
    }
    if (isGeneratedSpecialSlug(slug)) {
      const info = specialPageInfo(slug) || { key: 'index', canonical: 'especial' }
      history.replaceState(history.state, '', pageUrl(info.canonical))
      await renderSpecialPage(info, serial)
      return
    }

    if (!currentUser.canEdit) {
      setDocumentTitle({ title: ui("Edição restrita", "Restricted editing") })
      commitHtml(serial, accessRequiredHtml(slug, currentUser))
      return
    }

    const page = await loadEditablePage(slug)
    if (!isCurrentRoute(serial)) return
    setDocumentTitle(page, ' editar')
    updateChrome(page.slug, 'edit')
    if (!commitHtml(serial, formHtml(page, 'edit'))) return

    const form = document.querySelector('#editForm')
    const note = document.querySelector('#editorNote')
    bindEditorToolbar(form)
    bindEditorPreview(page, form, note)
    bindTemplateGallery(form, note)
    bindEditorRouting(form)
    bindMediaPanel(form, note)
    bindImageUpload(form, note)
    bindPageDelete(page, note)
    const localDraft = bindLocalEditorDraft(page, 'edit', form, note)

    form.addEventListener('submit', async event => {
      event.preventDefault()
      if (form.dataset.saving === '1') return
      const { urlSlug, ...rawPayload } = readFormPayload(form)
      let nextSlug = urlSlug || page.slug || slugify(rawPayload.title)
      let saveProgressFinished = false

      try {
        const conflict = await resolveEditConflictBeforeSave(page, form, rawPayload, note)
        if (!conflict.proceed) return

        setEditorSaving(form, true, ui("Salvando...", "Saving..."))
        note.innerHTML = ui("Salvando revisão... aguarde até o envio terminar.", "Saving revision... please wait.")
        nextSlug = readFormPayload(form).urlSlug || page.slug || nextSlug
        await savePage(nextSlug, { ...conflict.payload, ...(page.isNew ? {} : { sourceSlug: page.slug }) })
        localDraft.clear()
        setEditorSaving(form, false)
        saveProgressFinished = true
        await navigate(pageUrl(nextSlug))
      } catch (error) {
        if (error.status === 409) await resolveEditConflictBeforeSave(page, form, rawPayload, note)
        note.innerHTML = `${ui("Não foi possível salvar a revisão. ", "Could not save the revision. ")}${escapeHtml(diagnosticDetail(error) || ui("A API de escrita ainda não está disponível.", "The editing API is unavailable."))}`
      } finally {
        if (!saveProgressFinished && isCurrentRoute(serial)) setEditorSaving(form, false)
      }
    })
  }

  async function renderSuggest(slug, serial) {
    updateChrome(slug, 'suggest')
    if (String(slug || '').startsWith('arquivo/')) {
      setDocumentTitle({ title: 'Namespace de arquivo' })
      commitHtml(serial, fileNamespaceBlockedHtml(slug, currentUser))
      return
    }
    if (isGeneratedSpecialSlug(slug)) {
      const info = specialPageInfo(slug) || { key: 'index', canonical: 'especial' }
      history.replaceState(history.state, '', pageUrl(info.canonical))
      await renderSpecialPage(info, serial)
      return
    }
    const page = await loadEditablePage(slug)
    if (!isCurrentRoute(serial)) return

    setDocumentTitle(page, ui(" sugestão", " suggestion"))
    updateChrome(page.slug, 'suggest')
    if (!commitHtml(serial, formHtml(page, 'suggest'))) return

    const form = document.querySelector('#editForm')
    const note = document.querySelector('#editorNote')
    bindEditorToolbar(form)
    bindEditorPreview(page, form, note)
    bindTemplateGallery(form, note)
    const localDraft = bindLocalEditorDraft(page, 'suggest', form, note)

    form.addEventListener('submit', async event => {
      event.preventDefault()
      if (form.dataset.saving === '1') return
      const { urlSlug, ...payload } = readFormPayload(form)
      const nextSlug = urlSlug || page.slug || slugify(payload.title)
      let saveProgressFinished = false

      try {
        setEditorSaving(form, true, ui("Enviando...", "Submitting..."))
        note.innerHTML = ui("Enviando proposta... aguarde até o envio terminar.", "Submitting proposal... please wait.")
        const result = await submitEditProposal(nextSlug, payload)
        localDraft.clear()
        setEditorSaving(form, false)
        saveProgressFinished = true
        commitHtml(serial, proposalSubmittedHtml({ ...page, slug: nextSlug, title: payload.title }, result))
      } catch (error) {
        note.innerHTML = `${ui("Não foi possível enviar a proposta. ", "Could not submit the proposal. ")}${escapeHtml(diagnosticDetail(error) || ui("A API de propostas ainda não está disponível.", "The proposals API is unavailable."))}`
      } finally {
        if (!saveProgressFinished && isCurrentRoute(serial)) setEditorSaving(form, false)
      }
    })
  }

  async function renderSearch(query, serial, offset = 0) {
    updateChrome(currentState().slug, currentState().mode)
    setDocumentTitle({ title: ui(`Busca por ${query}`, `Search for ${query}`) })
    document.body.classList.add('is-searching')

    let results = []
    let data
    try {
      data = await getSearchPage(query, offset)
      results = data.results.filter(pageVisibleByFeatures)
      if (!isCurrentRoute(serial)) return
    } finally {
      document.body.classList.remove('is-searching')
    }

    const exact = exactSearchResult(query, results)
    if (!offset && exact?.slug && isCurrentRoute(serial)) {
      const fragment = String(exact.targetFragment || '').replace(/^#/, '')
      history.replaceState(history.state, '', `${pageUrl(exact.slug)}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`)
      await renderRead(exact.slug, serial)
      return
    }

    commitHtml(serial, searchHtml(query, results, currentUser) + paginationHtml(offset > 0, data.nextOffset !== null, 'search'))
    app.querySelector('[data-search-prev]')?.addEventListener('click', () => renderSearch(query, serial, Math.max(0, offset - 20)))
    app.querySelector('[data-search-next]')?.addEventListener('click', () => renderSearch(query, serial, data.nextOffset))
  }


  async function renderSpecialPage(info, serial, offset = 0) {
    const feature = specialFeature(info)
    canonicalizeSpecialRoute(info)
    updateChrome(info.canonical, 'read')

    const dependencyDisabled = (info.key === 'categories' && !featureEnabled('categories')) || (info.key === 'randomPage' && !featureEnabled('randomPage'))
    if ((feature && !featureEnabled(feature)) || dependencyDisabled) {
      setDocumentTitle({ title: ui('Recurso desativado', 'Feature disabled') })
      commitHtml(serial, featureDisabledHtml(ui("Página especial desativada", "Special page disabled")))
      return
    }

    if (info.key === 'index') {
      setDocumentTitle({ title: ui("Especial: Páginas especiais", "Special: Special pages") })
      commitHtml(serial, specialPagesIndexHtml())
      return
    }
    if (info.key === 'allPages') return renderAllPages(serial, offset)
    if (info.key === 'recentPages') return renderRecentPages(serial)
    if (info.key === 'categories') return renderCategories(serial)
    if (info.key === 'randomPage') {
      let page = null
      try { page = await getRandomPage() } catch {}
      const randomSlug = page?.slug || randomTitles[Math.floor(Math.random() * randomTitles.length)] || HOME_SLUG
      history.replaceState(history.state, '', pageUrl(randomSlug))
      await renderRead(randomSlug, serial)
      return
    }
    if (info.key === 'version') return renderVersion(serial)

    setDocumentTitle({ title: ui("Página especial não encontrada", "Special page not found") })
    commitHtml(serial, notFoundHtml(info.canonical, currentUser))
  }

  async function renderVersion(serial) {
    updateChrome('especial/versao', 'read')
    setDocumentTitle({ title: ui("WikiCambada Core — Versão", "WikiCambada Core — Version") })
    const status = await getSystemStatus()
    if (!isCurrentRoute(serial)) return
    commitHtml(serial, versionPageHtml(status || {}))
  }

  async function renderAdminDashboard(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração", "Administration") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const [pagesData, maintenance] = await Promise.all([
        listAdminPages(),
        getMaintenanceReport()
      ])
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminDashboardHtml({ pages: pagesData?.pages || [], maintenance, user: currentUser }))) enhanceAdminDataTables()
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar a administração. ", "Could not load administration. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminPages(serial = routeSerial, offset = 0) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: páginas", "Administration: pages") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const pagesData = await listAdminPages({ offset })
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminPagesHtml({ pages: pagesData?.pages || [], user: currentUser }) + paginationHtml(offset > 0, pagesData.nextOffset !== null))) enhanceAdminDataTables()
      app.querySelector('[data-pages-prev]')?.addEventListener('click', () => renderAdminPages(serial, Math.max(0, offset - 100)))
      app.querySelector('[data-pages-next]')?.addEventListener('click', () => renderAdminPages(serial, pagesData.nextOffset))
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar as páginas administrativas. ", "Could not load administrative pages. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminMaintenance(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: manutenção", "Administration: maintenance") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const maintenance = await getMaintenanceReport()
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminMaintenanceHtml(maintenance))) enhanceAdminDataTables()
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar a manutenção. ", "Could not load maintenance. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminBackup(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: backup e seed", "Administration: content export and seed") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    commitHtml(serial, adminBackupHtml())
  }

  async function renderAdminRedirects(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: aliases e redirecionamentos", "Administration: aliases and redirects") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const data = await getAdvancedRedirects()
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminRedirectsHtml(data || {}))) enhanceAdminDataTables()
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar aliases e redirecionamentos. ", "Could not load aliases and redirects. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminStorage(query = '', serial = routeSerial, offset = 0, cursor = '', cursors = []) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: armazenamento", "Administration: storage") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const data = await getStorageOverview({ search: query, limit: 200, offset, cursor })
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminStorageHtml(data, query) + paginationHtml(offset > 0, data.nextOffset !== null, 'files') + paginationHtml(cursors.length > 0, Boolean(data.r2NextCursor), 'objects'))) enhanceAdminDataTables()
      app.querySelector('[data-files-prev]')?.addEventListener('click', () => renderAdminStorage(query, serial, Math.max(0, offset - 200), cursor, cursors))
      app.querySelector('[data-files-next]')?.addEventListener('click', () => renderAdminStorage(query, serial, data.nextOffset, cursor, cursors))
      app.querySelector('[data-objects-prev]')?.addEventListener('click', () => renderAdminStorage(query, serial, offset, cursors.at(-1), cursors.slice(0, -1)))
      app.querySelector('[data-objects-next]')?.addEventListener('click', () => renderAdminStorage(query, serial, offset, data.r2NextCursor, [...cursors, cursor]))
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar o armazenamento. ", "Could not load storage. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminIp(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: endereços IP", "Administration: IP addresses") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const rules = await listIpRules()
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminIpHtml(rules))) enhanceAdminDataTables()
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar as regras de IP. ", "Could not load IP rules. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminUsers(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: usuários", "Administration: users") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const data = await getAdminUsers()
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminUsersHtml({ users: data?.users || [], currentUser }))) enhanceAdminDataTables()
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar ", "Could not load ")}${ui("usuários", "users")}. ${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminActivity(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: atividade", "Administration: activity") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const activity = await getRecentActivity()
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminActivityHtml(activity))) enhanceAdminDataTables()
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar atividade. ", "Could not load activity. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminTrash(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: lixeira", "Administration: trash") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const trash = await getTrash()
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminTrashHtml(trash))) enhanceAdminDataTables()
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar a lixeira. ", "Could not load trash. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminSystem(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: sistema", "Administration: system") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const status = await getSystemStatus()
      if (!isCurrentRoute(serial)) return
      commitHtml(serial, adminSystemHtml(status || {}))
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar o sistema. ", "Could not load system status. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }


  async function renderAdminSettings(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: configurações globais", "Administration: global settings") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const settings = await getAdminGlobalSettings()
      if (!isCurrentRoute(serial)) return
      commitHtml(serial, adminSettingsHtml(settings || {}))
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar as configurações globais. ", "Could not load global settings. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminTemplates(serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Administração: templates", "Administration: templates") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const templates = await listAdminTemplates()
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminTemplatesHtml(templates))) enhanceAdminDataTables()
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar templates. ", "Could not load templates. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  async function renderAdminProposals(selectedId = '', serial = routeSerial) {
    updateChrome(HOME_SLUG, 'read')
    setDocumentTitle({ title: ui("Propostas de edição", "Edit proposals") })

    if (!currentUser.canEdit) {
      commitHtml(serial, accessRequiredHtml(HOME_SLUG, currentUser))
      return
    }

    try {
      const data = await listProposals('pending')
      if (!isCurrentRoute(serial)) return
      if (commitHtml(serial, adminProposalsHtml(data, selectedId))) enhanceAdminDataTables()
    } catch (error) {
      commitHtml(serial, `<p class="empty-state">${ui("Não foi possível carregar as propostas. ", "Could not load proposals. ")}${escapeHtml(diagnosticDetail(error) || '')}</p>`)
    }
  }

  function renderFatalError(error, serial = routeSerial) {
    console.error(error)
    setDocumentTitle({ title: ui("Erro de carregamento", "Loading error") })
    commitHtml(serial, fatalErrorHtml(error))
  }

  async function refreshRandomTitles() {
    try {
      const pages = (await listPages({ limit: 1000 })).filter(pageVisibleByFeatures)
      const slugs = pages.map(page => page.slug).filter(Boolean)
      if (slugs.length) randomTitles = slugs
    } catch {
      randomTitles = [...DEFAULT_RANDOM_SLUGS]
    }
  }

  async function route({ scrollToTop = false } = {}) {
    const serial = ++routeSerial
    const entry = currentEntry()
    pendingScroll = { serial, top: scrollPositions.get(entry) ?? (scrollToTop || window.location.hash ? undefined : window.scrollY) }
    app.setAttribute('aria-busy', 'true')
    startRouteProgress()

    try {
      const state = currentState()
      const position = Number(new URLSearchParams(window.location.search).get('offset'))
      const offset = Number.isSafeInteger(position) && position > 0 ? Math.min(position, 1000000) : 0

      if (state.mode === 'search' && !featureEnabled('search')) {
        setDocumentTitle({ title: ui('Busca desativada', 'Search disabled') })
        commitHtml(serial, featureDisabledHtml(ui('Busca desativada', 'Search disabled')))
        return
      }

      if (state.mode === 'search') {
        await renderSearch(state.query, serial, offset)
        return
      }

      const specialInfo = state.mode === 'read' ? specialPageInfo(state.slug) : null
      if (specialInfo) {
        await renderSpecialPage(specialInfo, serial, offset)
        return
      }

      if (state.mode === 'read' && isGeneratedSpecialSlug(state.slug)) {
        setDocumentTitle({ title: ui("Página especial não encontrada", "Special page not found") })
        commitHtml(serial, notFoundHtml(state.slug, currentUser))
        return
      }

      if (state.slug.startsWith('discussao/') && !featureEnabled('talkPages')) {
        setDocumentTitle({ title: ui("Discussões desativadas", "Discussions disabled") })
        commitHtml(serial, featureDisabledHtml(ui("Páginas de discussão desativadas", "Discussion pages disabled")))
        return
      }

      if (state.slug.startsWith('usuario/') && !featureEnabled('userPages')) {
        setDocumentTitle({ title: ui("Páginas de usuário desativadas", "User pages disabled") })
        commitHtml(serial, featureDisabledHtml(ui("Páginas de usuário desativadas", "User pages disabled")))
        return
      }

      if (state.mode === 'read' && state.slug.startsWith('categoria/') && !featureEnabled('categories')) {
        setDocumentTitle({ title: ui('Categorias desativadas', 'Categories disabled') })
        commitHtml(serial, featureDisabledHtml(ui('Categorias desativadas', 'Categories disabled')))
        return
      }

      if (state.mode === 'read' && state.slug.startsWith('categoria/')) {
        await renderCategory(state.slug.slice('categoria/'.length), serial)
        return
      }

      if (state.mode === 'read' && state.slug.startsWith('arquivo/')) {
        await renderFile(state.slug.slice('arquivo/'.length), serial)
        return
      }


      if (state.mode === 'admin-dashboard') {
        await renderAdminDashboard(serial)
        return
      }

      if (state.mode === 'admin-pages') {
        await renderAdminPages(serial)
        return
      }

      if (state.mode === 'admin-maintenance') {
        await renderAdminMaintenance(serial)
        return
      }

      if (state.mode === 'admin-backup') {
        await renderAdminBackup(serial)
        return
      }

      if (state.mode === 'admin-redirects') {
        await renderAdminRedirects(serial)
        return
      }

      if (state.mode === 'admin-storage') {
        await renderAdminStorage(state.query, serial)
        return
      }

      if (state.mode === 'admin-ip') {
        await renderAdminIp(serial)
        return
      }

      if (state.mode === 'admin-trash') {
        await renderAdminTrash(serial)
        return
      }

      if (state.mode === 'admin-users') {
        await renderAdminUsers(serial)
        return
      }

      if (state.mode === 'admin-activity') {
        await renderAdminActivity(serial)
        return
      }

      if (state.mode === 'admin-system') {
        await renderAdminSystem(serial)
        return
      }

      if (state.mode === 'admin-settings') {
        await renderAdminSettings(serial)
        return
      }

      if (state.mode === 'admin-proposals') {
        await renderAdminProposals(state.query, serial)
        return
      }

      if (state.mode === 'admin-templates') {
        await renderAdminTemplates(serial)
        return
      }

      if (state.mode === 'edit') {
        await renderEdit(state.slug, serial)
        return
      }

      if (state.mode === 'suggest' && !featureEnabled('publicSuggestions')) {
        setDocumentTitle({ title: ui("Sugestões desativadas", "Suggestions disabled") })
        commitHtml(serial, featureDisabledHtml(ui("Sugestões públicas desativadas", "Public suggestions disabled")))
        return
      }

      if (state.mode === 'suggest') {
        await renderSuggest(state.slug, serial)
        return
      }

      if (state.mode === 'history' && !featureEnabled('pageHistory')) {
        setDocumentTitle({ title: ui("Histórico desativado", "History disabled") })
        commitHtml(serial, featureDisabledHtml(ui("Histórico público desativado", "Public history disabled")))
        return
      }

      if (state.mode === 'history') {
        await renderHistory(state.slug, serial, offset)
        return
      }

      await renderRead(state.slug, serial)
    } catch (error) {
      renderFatalError(error, serial)
    } finally {
      if (isCurrentRoute(serial)) {
        app.setAttribute('aria-busy', 'false')
        finishRouteProgress()
      }
    }
  }


  function searchSuggestionBox() {
    if (!searchForm) return null
    let box = searchForm.querySelector('[data-search-suggestions]')
    if (box) return box
    box = document.createElement('div')
    box.className = 'search-suggestions'
    box.dataset.searchSuggestions = ''
    box.setAttribute('role', 'listbox')
    box.hidden = true
    searchForm.appendChild(box)
    return box
  }

  function hideSearchSuggestions() {
    const box = searchForm?.querySelector('[data-search-suggestions]')
    if (box) box.hidden = true
  }

  function renderSearchSuggestions(query, results) {
    const box = searchSuggestionBox()
    if (!box) return
    const cleanQuery = String(query || '').trim()
    const createSlug = slugify(cleanQuery)
    const canSuggest = featureEnabled('publicSuggestions')
    const actionText = currentUser.canEdit ? ui("Criar página", "Create page") : ui('Sugerir agora', 'Suggest now')
    const actionMode = currentUser.canEdit ? 'edit' : 'suggest'
    const canCreateFromSearch = currentUser.canEdit || canSuggest
    const exact = exactSearchResult(cleanQuery, results)

    box.innerHTML = `
      ${results.length ? results.slice(0, 8).map(page => {
        const title = searchTitleForMatch(page)
        const match = searchMatchLabel(page.matchType)
        const subtitle = String(page.subtitle || match || page.matchedTitle || page.matchedSlug || page.slug || '').trim()
        const label = match || ui('resultado', 'result')
        const icon = String(title || page.slug || '?').trim().charAt(0).toUpperCase() || '?'
        return `
          <button class="search-suggestion-item" type="button" data-search-suggestion-slug="${escapeHtml(page.slug)}" data-search-suggestion-fragment="${escapeHtml(page.targetFragment || '')}">
            <span class="search-suggestion-icon">${escapeHtml(icon)}</span>
            <span class="search-suggestion-main">
              <strong>${escapeHtml(title || page.slug || ui("Página sem título", "Untitled page"))}</strong>
              <small>${escapeHtml(page.exact ? ui(`${label} exato`, `exact match by ${label}`) : subtitle)}</small>
            </span>
          </button>
        `
      }).join('') : ''}
      ${cleanQuery && !exact && canCreateFromSearch ? `
        <button class="search-suggestion-item search-suggestion-create" type="button" data-search-suggestion-action="${actionMode}" data-search-suggestion-slug="${escapeHtml(createSlug)}">
          <span class="search-suggestion-icon">＋</span>
          <span class="search-suggestion-main">
            <strong>${actionText}</strong>
            <small>${escapeHtml(cleanQuery)}</small>
          </span>
        </button>
      ` : ''}
    `
    box.hidden = !cleanQuery
  }

  function setupSearchSuggestions() {
    if (!searchForm || !searchInput) return
    searchSuggestionBox()

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim()
      window.clearTimeout(searchSuggestionTimer)
      if (query.length < 2) {
        hideSearchSuggestions()
        return
      }

      searchSuggestionTimer = window.setTimeout(async () => {
        try {
          const results = (await searchPages(query)).filter(pageVisibleByFeatures)
          renderSearchSuggestions(query, results)
        } catch {
          hideSearchSuggestions()
        }
      }, 180)
    })

    searchInput.addEventListener('focus', async () => {
      const query = searchInput.value.trim()
      if (query.length < 2) return
      try {
        const results = (await searchPages(query)).filter(pageVisibleByFeatures)
        renderSearchSuggestions(query, results)
      } catch {}
    })

    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideSearchSuggestions()
    })

    searchForm.addEventListener('click', event => {
      const item = event.target.closest('[data-search-suggestion-slug]')
      if (!item) return
      event.preventDefault()
      const slug = item.dataset.searchSuggestionSlug
      const action = item.dataset.searchSuggestionAction
      const fragment = String(item.dataset.searchSuggestionFragment || '').replace(/^#/, '')
      hideSearchSuggestions()
      if (action === 'edit') navigate(pageUrl(slug, 'edit'))
      else if (action === 'suggest') navigate(pageUrl(slug, 'suggest'))
      else navigate(`${pageUrl(slug)}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`)
    })

    document.addEventListener('click', event => {
      if (!searchForm.contains(event.target)) hideSearchSuggestions()
    })
  }

  function navigate(url) {
    history.scrollRestoration = 'manual'
    hideSearchSuggestions()
    rememberScroll()
    history.pushState({ wikiEntry: crypto.randomUUID() }, '', url)
    return navigateToEntry()
  }

  function navigateToEntry() {
    if (displayedPath !== pathAndQuery()) return route({ scrollToTop: true })
    if (app.getAttribute('aria-busy') === 'true') {
      routeSerial++
      pendingScroll = null
      app.setAttribute('aria-busy', 'false')
      finishRouteProgress()
    }
    positionPage(scrollPositions.get(currentEntry()))
  }

  function bindEvents(preserveInitialScroll = false) {
    setupSearchSuggestions()
    if (!preserveInitialScroll) history.scrollRestoration = 'manual'
    window.addEventListener('scroll', rememberScroll, { passive: true })

    document.addEventListener('input', event => {
      const form = event.target.closest?.('[data-template-form]')
      if (!form) return
      updateTemplateEditorState(form)
    })

    document.addEventListener('click', async event => {
      const restoreTarget = event.target.closest('[data-restore-revision]')
      if (restoreTarget) {
        event.preventDefault()
        if (!currentUser.canEdit) return

        const revisionNumber = restoreTarget.dataset.restoreRevision
        const slug = restoreTarget.dataset.slug || currentState().slug
        const defaultSummary = `${ui('restaurada revisão', 'restored revision')} ${revisionNumber}`
        const summary = window.prompt(ui("Resumo da restauração", "Restoration summary"), defaultSummary)
        if (summary === null) return

        restoreTarget.disabled = true
        try {
          await restoreRevision(slug, revisionNumber, summary.trim() || defaultSummary, restoreTarget.dataset.baseRevision || null)
          navigate(pageUrl(slug))
        } catch (error) {
          restoreTarget.disabled = false
          window.alert(`${ui("Não foi possível restaurar a revisão. ", "Could not restore the revision. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }


      const advancedRedirectDelete = event.target.closest('[data-advanced-redirect-delete]')
      if (advancedRedirectDelete) {
        event.preventDefault()
        const fromSlug = advancedRedirectDelete.dataset.advancedRedirectDelete || ''
        if (!fromSlug || !window.confirm(`Remover o redirecionamento /wiki/${fromSlug}?`)) return
        advancedRedirectDelete.disabled = true
        try {
          await deleteAdvancedRedirect(fromSlug)
          await renderAdminRedirects(++routeSerial)
        } catch (error) {
          advancedRedirectDelete.disabled = false
          window.alert(`${ui("Não foi possível remover o redirecionamento. ", "Could not remove the redirect. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const advancedAliasDelete = event.target.closest('[data-advanced-alias-delete]')
      if (advancedAliasDelete) {
        event.preventDefault()
        const aliasSlug = advancedAliasDelete.dataset.advancedAliasDelete || ''
        if (!aliasSlug || !window.confirm(`Remover o alias /wiki/${aliasSlug}?`)) return
        advancedAliasDelete.disabled = true
        try {
          await deleteAdvancedAlias(aliasSlug)
          await renderAdminRedirects(++routeSerial)
        } catch (error) {
          advancedAliasDelete.disabled = false
          window.alert(`${ui("Não foi possível remover o alias. ", "Could not remove the alias. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const adminAction = event.target.closest('[data-admin-page-action]')
      if (adminAction) {
        event.preventDefault()
        const slug = adminAction.dataset.slug
        const action = adminAction.dataset.adminPageAction
        if (!slug || !action) return

        let payload = { action }
        if (action === 'delete') {
          if (!window.confirm(`${ui("Apagar a página “", "Delete page “")}${slug}${ui("”? O histórico não será removido.", "”? History will be preserved.")}`)) return
        }
        if (action === 'lock' || action === 'unlock') {
          const verb = action === 'lock' ? ui('bloquear', 'lock') : ui('desbloquear', 'unlock')
          if (!window.confirm(`${ui('Confirmar', 'Confirm')} ${verb}${ui(" a página “", " page “")}${slug}”?`)) return
        }
        if (action === 'rename') {
          const title = window.prompt(ui("Novo título da página", "New page title"))
          if (!title) return
          const nextSlug = window.prompt(ui('Novo slug', 'New slug'), slugify(title)) || slugify(title)
          const defaultSummary = ui(`renomeada de ${slug} para ${nextSlug}`, `renamed from ${slug} to ${nextSlug}`)
          const summary = window.prompt(ui("Resumo da renomeação", "Rename summary"), defaultSummary) || defaultSummary
          payload = { action, title: title.trim(), slug: nextSlug.trim(), summary }
        }

        adminAction.disabled = true
        try {
          await adminPageAction(slug, payload)
          await renderAdminPages(++routeSerial)
        } catch (error) {
          adminAction.disabled = false
          window.alert(`${ui("Ação administrativa falhou. ", "Administrative operation failed. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const storageFileEdit = event.target.closest('[data-admin-file-edit]')
      if (storageFileEdit) {
        event.preventDefault()
        const slug = storageFileEdit.dataset.slug
        if (!slug) return
        const filename = window.prompt('Nome do arquivo', storageFileEdit.dataset.filename || '')
        if (filename === null) return
        const description = window.prompt(ui("Descrição do arquivo", "File description"), storageFileEdit.dataset.description || '')
        if (description === null) return

        storageFileEdit.disabled = true
        try {
          await updateStoredFile(slug, { filename: filename.trim(), description: description.trim() })
          await renderAdminStorage(currentState().query, ++routeSerial)
        } catch (error) {
          storageFileEdit.disabled = false
          window.alert(`${ui("Não foi possível atualizar o arquivo. ", "Could not update the file. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const storageFileDelete = event.target.closest('[data-admin-file-delete]')
      if (storageFileDelete) {
        event.preventDefault()
        const slug = storageFileDelete.dataset.slug
        if (!slug) return
        if (!window.confirm(`Mover o arquivo “${slug}” para a lixeira dos editores?`)) return

        storageFileDelete.disabled = true
        try {
          await deleteStoredFile(slug)
          await renderAdminStorage(currentState().query, ++routeSerial)
        } catch (error) {
          storageFileDelete.disabled = false
          window.alert(`${ui("Não foi possível deletar o arquivo. ", "Could not delete the file. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const quickIp = event.target.closest('[data-admin-ip-quick]')
      if (quickIp) {
        event.preventDefault()
        const ip = quickIp.dataset.ip
        const action = quickIp.dataset.adminIpQuick
        if (!ip || !action) return
        const label = action === 'ban_site' ? ui("banir acesso público ao site", "ban public access to the site") : ui("bloquear sugestões públicas", "block public suggestions")
        if (!window.confirm(ui(`Confirmar ${label} para ${ip}?`, `Confirm ${label} for ${ip}?`))) return

        quickIp.disabled = true
        try {
          await createIpRule({ ip, action, reason: ui("regra criada a partir de proposta de edição", "rule created from an edit proposal") })
          window.alert('Regra de IP criada.')
          await renderAdminProposals(currentState().query, ++routeSerial)
        } catch (error) {
          quickIp.disabled = false
          window.alert(`${ui("Não foi possível criar a regra de IP. ", "Could not create the IP rule. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const ipDelete = event.target.closest('[data-admin-ip-delete]')
      if (ipDelete) {
        event.preventDefault()
        const id = ipDelete.dataset.id
        if (!id) return
        if (!window.confirm('Remover esta regra de IP?')) return

        ipDelete.disabled = true
        try {
          await deleteIpRule(id)
          await renderAdminIp(++routeSerial)
        } catch (error) {
          ipDelete.disabled = false
          window.alert(`${ui("Não foi possível remover a regra. ", "Could not remove the rule. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const proposalAction = event.target.closest('[data-proposal-action]')
      if (proposalAction) {
        event.preventDefault()
        proposalAction.disabled = true
        try {
          const id = proposalAction.dataset.id
          const credit = document.querySelector(`select[data-proposal-credit][data-id="${CSS.escape(id || '')}"]`)?.value || 'contact'
          await moderateProposal(id, proposalAction.dataset.proposalAction, { creditMode: credit, expectedRevisionId: proposalAction.dataset.baseRevision || null })
          await renderAdminProposals()
        } catch (error) {
          proposalAction.disabled = false
          window.alert(`${ui("Não foi possível revisar a proposta. ", "Could not review the proposal. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const userEdit = event.target.closest('[data-admin-user-edit]')
      if (userEdit) {
        event.preventDefault()
        const form = document.querySelector('[data-user-form]')
        if (!form) return
        form.elements.email.value = userEdit.dataset.email || ''
        form.elements.displayName.value = userEdit.dataset.name || ''
        form.elements.role.value = userEdit.dataset.role || 'editor'
        form.elements.status.value = userEdit.dataset.status || 'active'
        form.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }

      const userDelete = event.target.closest('[data-admin-user-delete]')
      if (userDelete) {
        event.preventDefault()
        const email = userDelete.dataset.email || ''
        if (!email) return
        if (!window.confirm(`${ui("Remover o usuário “", "Remove user “")}${email}${ui("” do painel? O histórico de edições não será apagado.", "” from the panel? Revision history will be preserved.")}`)) return
        userDelete.disabled = true
        try {
          await deleteAdminUser(email)
          await renderAdminUsers(++routeSerial)
        } catch (error) {
          userDelete.disabled = false
          window.alert(`${ui("Não foi possível remover usuário. ", "Could not remove user. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const trashButton = event.target.closest('[data-trash-action]')
      if (trashButton) {
        event.preventDefault()
        const action = trashButton.dataset.trashAction
        const kind = trashButton.dataset.kind
        const slug = trashButton.dataset.slug
        if (!action || !kind || !slug) return
        if (action === 'hard-delete' && !window.confirm(`${ui('Remover definitivamente', 'Permanently remove')} “${slug}${ui("”? Essa ação não poderá ser desfeita.", "”? This action cannot be undone.")}`)) return
        trashButton.disabled = true
        try {
          await trashAction({ action, kind, slug })
          await renderAdminTrash(++routeSerial)
        } catch (error) {
          trashButton.disabled = false
          window.alert(`${ui("Ação da lixeira falhou. ", "Trash operation failed. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const purgeExpired = event.target.closest('[data-trash-purge-expired]')
      if (purgeExpired) {
        event.preventDefault()
        purgeExpired.disabled = true
        try {
          await trashAction({ action: 'purge-expired' })
          await renderAdminTrash(++routeSerial)
        } catch (error) {
          purgeExpired.disabled = false
          window.alert(`${ui("Não foi possível apagar expirados. ", "Could not purge expired items. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const systemAction = event.target.closest('[data-system-action]')
      if (systemAction) {
        event.preventDefault()
        const action = systemAction.dataset.systemAction
        const confirmText = action === 'force-reload'
          ? ui("Forçar recarregamento completo dos clientes abertos?", "Force open clients to reload?")
          : ui("Forçar atualização de cache local dos clientes?", "Force clients to refresh their local cache?")
        if (!window.confirm(confirmText)) return
        systemAction.disabled = true
        try {
          await forceSystemAction(action)
          await renderAdminSystem(++routeSerial)
        } catch (error) {
          systemAction.disabled = false
          window.alert(`${ui("Ação de sistema falhou. ", "System operation failed. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }


      const clearActivity = event.target.closest('[data-admin-clear-activity]')
      if (clearActivity) {
        event.preventDefault()
        const ok = window.confirm('Limpar todos os registros de atividade recente?')
        if (!ok) return
        clearActivity.disabled = true
        try {
          await clearRecentActivity()
          await renderAdminActivity(++routeSerial)
        } catch (error) {
          clearActivity.disabled = false
          window.alert(`${ui("Não foi possível limpar a atividade. ", "Could not clear activity. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }


      const templateEdit = event.target.closest('[data-template-edit]')
      if (templateEdit) {
        event.preventDefault()
        const page = document.querySelector('[data-admin-templates-page]')
        const form = document.querySelector('[data-template-form]')
        if (!page || !form) return
        const templates = JSON.parse(page.dataset.templatesJson || '[]')
        const template = templates.find(item => String(item.id) === String(templateEdit.dataset.templateId))
        if (!template) return
        form.elements.id.value = template.id || ''
        form.elements.title.value = template.title || ''
        form.elements.slug.value = template.slug || ''
        form.elements.groupName.value = template.groupName || 'Geral'
        form.elements.kind.value = template.kind || 'custom'
        form.elements.minRole.value = template.minRole || 'guest'
        form.elements.status.value = template.status || 'active'
        form.elements.imageUrl.value = template.imageUrl || ''
        form.elements.imagePosition.value = template.imagePosition || 'left'
        form.elements.accentColor.value = template.accentColor || ''
        form.elements.description.value = template.description || ''
        form.elements.params.value = template.params || ''
        form.elements.call.value = template.call || template.content || ''
        form.elements.render.value = template.render || ''
        page.querySelectorAll('[data-template-library-card]').forEach(card => {
          card.classList.toggle('is-active', String(card.dataset.templateCardId) === String(template.id))
        })
        updateTemplateEditorState(form)
        form.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }

      const templateTool = event.target.closest('[data-template-tool]')
      if (templateTool) {
        event.preventDefault()
        const form = document.querySelector('[data-template-form]')
        insertTemplateEditorSnippet(form, templateTool.dataset.templateTool)
        return
      }

      const templatePreviewButton = event.target.closest('[data-template-refresh-preview]')
      if (templatePreviewButton) {
        event.preventDefault()
        updateTemplatePreview(document.querySelector('[data-template-form]'))
        return
      }

      const templateToggle = event.target.closest('[data-template-toggle]')
      if (templateToggle) {
        event.preventDefault()
        const page = document.querySelector('[data-admin-templates-page]')
        const templates = JSON.parse(page?.dataset.templatesJson || '[]')
        const template = templates.find(item => String(item.id) === String(templateToggle.dataset.templateId))
        if (!template) return
        const nextStatus = template.status === 'disabled' ? 'active' : 'disabled'
        templateToggle.disabled = true
        try {
          await saveAdminTemplate({ ...template, status: nextStatus })
          await renderAdminTemplates(++routeSerial)
        } catch (error) {
          templateToggle.disabled = false
          window.alert(`${ui("Não foi possível atualizar o template. ", "Could not update the template. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const templateDelete = event.target.closest('[data-template-delete]')
      if (templateDelete) {
        event.preventDefault()
        const id = templateDelete.dataset.templateId
        if (!id) return
        if (!window.confirm(ui("Deletar este template? Ele deixará de aparecer na galeria do editor.", "Delete this template? It will be removed from the editor gallery."))) return
        templateDelete.disabled = true
        try {
          await deleteAdminTemplate(id)
          await renderAdminTemplates(++routeSerial)
        } catch (error) {
          templateDelete.disabled = false
          window.alert(`${ui("Não foi possível deletar o template. ", "Could not delete the template. ")}${diagnosticDetail(error) || ''}`)
        }
        return
      }

      const templateReset = event.target.closest('[data-template-reset]')
      if (templateReset) {
        event.preventDefault()
        const form = document.querySelector('[data-template-form]')
        if (!form) return
        form.reset()
        form.elements.id.value = ''
        form.elements.groupName.value = ui("Manutenção", "Maintenance")
        form.elements.kind.value = 'maintenance'
        form.elements.minRole.value = 'guest'
        form.elements.status.value = 'active'
        form.elements.imagePosition.value = 'left'
        form.elements.title.value = ''
        form.elements.slug.value = ''
        form.elements.description.value = ''
        form.elements.imageUrl.value = ''
        form.elements.accentColor.value = ''
        form.elements.params.value = ''
        form.elements.call.value = ''
        form.elements.render.value = ''
        document.querySelectorAll('[data-template-library-card]').forEach(card => card.classList.remove('is-active'))
        updateTemplateEditorState(form)
        return
      }

      const hashTarget = event.target.closest('a[href^="#"]')
      if (hashTarget && !hashTarget.dataset.link) {
        const href = hashTarget.getAttribute('href') || ''
        if (href.length > 1) {
          event.preventDefault()
          navigate(`${pathAndQuery()}${href}`)
          return
        }
      }

      const searchTarget = event.target.closest('[data-search]')
      if (searchTarget) {
        event.preventDefault()
        navigate(searchUrl(searchTarget.dataset.search))
        return
      }

      const target = event.target.closest('[data-link]')
      if (!target) return

      event.preventDefault()

      if (target.dataset.link === 'route') {
        const url = new URL(target.href, window.location.origin)
        navigate(`${decodeURI(url.pathname)}${url.search}${url.hash}`)
        return
      }

      if (target.dataset.link === 'home') {
        navigate(pageUrl(HOME_SLUG))
        return
      }

      if (target.dataset.link === 'random') {
        navigate(pageUrl('especial/pagina-aleatoria'))
        return
      }

      const slug = target.dataset.slug || currentState().slug
      const mode = target.dataset.link === 'edit' ? 'edit' : target.dataset.link === 'history' ? 'history' : target.dataset.link === 'suggest' ? 'suggest' : 'read'
      const url = new URL(target.href, window.location.origin)
      navigate(`${pageUrl(slug, mode)}${url.search}${url.hash}`)
    })

    searchForm.addEventListener('submit', async event => {
      event.preventDefault()
      const query = searchInput.value.trim()
      if (!query) return
      hideSearchSuggestions()
      try {
        const results = await searchPages(query)
        const exact = exactSearchResult(query, results)
        if (exact?.slug) {
          const fragment = String(exact.targetFragment || '').replace(/^#/, '')
          navigate(`${pageUrl(exact.slug)}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`)
          return
        }
      } catch {}
      navigate(searchUrl(query))
    })

    document.addEventListener('submit', async event => {

      const globalSettingsForm = event.target.closest('[data-global-settings-form]')
      if (globalSettingsForm) {
        event.preventDefault()
        const note = globalSettingsForm.querySelector('[data-global-settings-note]')
        const button = globalSettingsForm.querySelector('button[type="submit"]')
        const settings = {}
        globalSettingsForm.querySelectorAll('input[type="checkbox"][name]').forEach(input => {
          const parts = input.name.split('.')
          let target = settings
          while (parts.length > 1) {
            const part = parts.shift()
            target[part] ||= {}
            target = target[part]
          }
          target[parts[0]] = input.checked
        })
        if (button) button.disabled = true
        if (note) note.textContent = ui("Salvando configurações globais...", "Saving global settings...")
        try {
          await saveAdminGlobalSettings(settings)
          await loadGlobalSettings()
          if (note) note.textContent = ui("Configurações globais salvas.", "Global settings saved.")
        } catch (error) {
          if (note) note.textContent = `${ui("Não foi possível salvar. ", "Could not save. ")}${diagnosticDetail(error) || ''}`
        } finally {
          if (button) button.disabled = false
        }
        return
      }

      const templateForm = event.target.closest('[data-template-form]')
      if (templateForm) {
        event.preventDefault()
        const data = new FormData(templateForm)
        const note = templateForm.querySelector('[data-template-note]')
        const button = templateForm.querySelector('button[type="submit"]')
        if (button) button.disabled = true
        if (note) note.textContent = ui("Salvando template...", "Saving template...")
        try {
          await saveAdminTemplate({
            id: data.get('id')?.toString().trim() || '',
            title: data.get('title')?.toString().trim() || '',
            slug: data.get('slug')?.toString().trim() || '',
            groupName: data.get('groupName')?.toString().trim() || 'Geral',
            kind: data.get('kind')?.toString().trim() || 'custom',
            minRole: data.get('minRole')?.toString().trim() || 'guest',
            status: data.get('status')?.toString().trim() || 'active',
            imageUrl: data.get('imageUrl')?.toString().trim() || '',
            imagePosition: data.get('imagePosition')?.toString().trim() || 'left',
            accentColor: data.get('accentColor')?.toString().trim() || '',
            description: data.get('description')?.toString().trim() || '',
            params: data.get('params')?.toString() || '',
            call: data.get('call')?.toString() || '',
            render: data.get('render')?.toString() || ''
          })
          await renderAdminTemplates(++routeSerial)
        } catch (error) {
          if (note) note.textContent = `${ui("Não foi possível salvar o template. ", "Could not save the template. ")}${diagnosticDetail(error) || ''}`
          if (button) button.disabled = false
        }
        return
      }

      const advancedRedirectForm = event.target.closest('[data-advanced-redirect-form]')
      if (advancedRedirectForm) {
        event.preventDefault()
        const data = new FormData(advancedRedirectForm)
        const note = advancedRedirectForm.querySelector('[data-advanced-redirect-note]')
        const button = advancedRedirectForm.querySelector('button[type="submit"]')
        if (button) button.disabled = true
        if (note) note.textContent = ui("Salvando redirecionamento...", "Saving redirect...")
        try {
          await saveAdvancedRedirect({
            fromSlug: data.get('fromSlug')?.toString().trim() || '',
            toSlug: data.get('toSlug')?.toString().trim() || '',
            fragment: data.get('fragment')?.toString().trim() || ''
          })
          await renderAdminRedirects(++routeSerial)
        } catch (error) {
          if (note) note.textContent = `${ui("Não foi possível salvar o redirecionamento. ", "Could not save the redirect. ")}${diagnosticDetail(error) || ''}`
          if (button) button.disabled = false
        }
        return
      }

      const advancedAliasForm = event.target.closest('[data-advanced-alias-form]')
      if (advancedAliasForm) {
        event.preventDefault()
        const data = new FormData(advancedAliasForm)
        const note = advancedAliasForm.querySelector('[data-advanced-alias-note]')
        const button = advancedAliasForm.querySelector('button[type="submit"]')
        if (button) button.disabled = true
        if (note) note.textContent = ui("Salvando alias...", "Saving alias...")
        try {
          await saveAdvancedAlias({
            aliasTitle: data.get('aliasTitle')?.toString().trim() || '',
            toSlug: data.get('toSlug')?.toString().trim() || ''
          })
          await renderAdminRedirects(++routeSerial)
        } catch (error) {
          if (note) note.textContent = `${ui("Não foi possível salvar o alias. ", "Could not save the alias. ")}${diagnosticDetail(error) || ''}`
          if (button) button.disabled = false
        }
        return
      }

      const storageSearchForm = event.target.closest('[data-admin-storage-search]')
      if (storageSearchForm) {
        event.preventDefault()
        const query = new FormData(storageSearchForm).get('q')?.toString().trim() || ''
        navigate(`/admin/storage${query ? `?q=${encodeURIComponent(query)}` : ''}`)
        return
      }

      const ipForm = event.target.closest('[data-admin-ip-form]')
      if (ipForm) {
        event.preventDefault()
        const data = new FormData(ipForm)
        const note = ipForm.querySelector('[data-admin-ip-note]')
        const button = ipForm.querySelector('button[type="submit"]')
        const ipValue = data.get('ip')?.toString().trim() || ''
        if (!isValidIpOrCidr(ipValue)) {
          if (note) note.textContent = ui("Informe um IPv4, IPv6 ou CIDR válido.", "Enter a valid IPv4, IPv6 or CIDR address.")
          return
        }
        if (button) button.disabled = true
        if (note) note.textContent = ui("Salvando regra...", "Saving rule...")
        try {
          await createIpRule({
            ip: ipValue,
            action: data.get('action')?.toString().trim(),
            reason: data.get('reason')?.toString().trim()
          })
          await renderAdminIp(++routeSerial)
        } catch (error) {
          if (note) note.textContent = `${ui("Não foi possível salvar a regra. ", "Could not save the rule. ")}${diagnosticDetail(error) || ''}`
          if (button) button.disabled = false
        }
        return
      }

      const profileForm = event.target.closest('[data-profile-form]')
      if (profileForm) {
        event.preventDefault()
        const data = new FormData(profileForm)
        const note = profileForm.querySelector('[data-profile-note]')
        const button = profileForm.querySelector('button[type="submit"]')
        if (button) button.disabled = true
        try {
          await updateProfile({ displayName: data.get('displayName')?.toString().trim() || '' })
          currentUser = await getCurrentUser(window.location.pathname + window.location.search)
          await renderAdminUsers(++routeSerial)
        } catch (error) {
          if (note) note.textContent = `${ui("Não foi possível salvar o perfil. ", "Could not save the profile. ")}${diagnosticDetail(error) || ''}`
          if (button) button.disabled = false
        }
        return
      }

      const userForm = event.target.closest('[data-user-form]')
      if (userForm) {
        event.preventDefault()
        const data = new FormData(userForm)
        const note = userForm.querySelector('[data-user-note]')
        const button = userForm.querySelector('button[type="submit"]')
        if (button) button.disabled = true
        try {
          await updateAdminUser({
            email: data.get('email')?.toString().trim() || '',
            displayName: data.get('displayName')?.toString().trim() || '',
            role: data.get('role')?.toString().trim() || 'editor',
            status: data.get('status')?.toString().trim() || 'active'
          })
          await renderAdminUsers(++routeSerial)
        } catch (error) {
          if (note) note.textContent = `${ui("Não foi possível salvar usuário. ", "Could not save user. ")}${diagnosticDetail(error) || ''}`
          if (button) button.disabled = false
        }
        return
      }

      const form = event.target.closest('[data-admin-import-form]')
      if (!form) return
      event.preventDefault()

      const textarea = form.querySelector('[name="seed"]')
      const note = form.querySelector('[data-admin-import-note]')
      const button = form.querySelector('button[type="submit"]')
      const raw = textarea?.value?.trim()
      if (!raw) {
        if (note) note.textContent = 'Cole um JSON de seed ou backup antes de importar.'
        return
      }

      let payload = null
      try {
        payload = JSON.parse(raw)
      } catch {
        if (note) note.textContent = ui("JSON inválido.", "Invalid JSON.")
        return
      }

      if (!window.confirm(ui("Importar este seed para o D1? Essa ação pode criar novas revisões.", "Import this content seed into D1? This may create new revisions."))) return
      if (button) button.disabled = true
      if (note) note.textContent = 'Importando...'

      try {
        const result = await importSeedBackup(payload)
        if (note) note.textContent = `${ui("Importação concluída: ", "Import completed: ")}${result.imported?.length || 0}${ui(" página(s), ", " page(s), ")}${result.failed?.length || 0}${ui(' falha(s).', ' failure(s).')}`
      } catch (error) {
        if (note) note.textContent = `${ui("Não foi possível importar. ", "Could not import. ")}${diagnosticDetail(error) || ''}`
      } finally {
        if (button) button.disabled = false
      }
    })

    window.addEventListener('popstate', () => {
      rememberScroll()
      navigateToEntry()
    })
  }

  function startSystemWatcher() {
    let knownCache = null
    let knownReload = null
    let firstRun = true

    async function tick() {
      try {
        const status = await getSystemStatus()
        const cacheValue = Number(status?.cacheVersion?.value || 0)
        const reloadValue = Number(status?.reloadVersion?.value || 0)

        if (firstRun) {
          knownCache = cacheValue
          knownReload = reloadValue
          firstRun = false
          return
        }

        if (reloadValue !== knownReload) {
          window.location.reload()
          return
        }

        if (cacheValue !== knownCache) {
          clearPublicCache()
          knownCache = cacheValue
          await route({ scrollToTop: false })
        }
      } catch {}
    }

    tick()
    window.setInterval(tick, 45000)
  }

  async function boot(initial) {
    if (initial) {
      displayedEntry = currentEntry()
      displayedPath = pathAndQuery()
      rememberScroll()
    }
    bindEvents(Boolean(initial))
    const serial = routeSerial
    currentUser = await getCurrentUser(window.location.pathname + window.location.search)
    if (!initial) {
      await refreshRandomTitles()
      await route({ scrollToTop: true })
    } else if (isCurrentRoute(serial)) {
      const state = currentState()
      updateChrome(initial.slug, state.mode)
      if (initial.slug.startsWith('arquivo/')) bindSpecialFileUpload(initial.slug.slice('arquivo/'.length))
      void markMissingArticleLinks(serial).catch(() => {})
    }
    startSystemWatcher()
  }

  return { boot, route, renderFatalError }
}
