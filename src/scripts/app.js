import { loadGlobalSettings, loadSiteConfig } from './core/config.js'
import { bootRandomIcon } from './random-icon.js'
import { bootThemeControls } from './theme.js'
import { bootMediaViewer } from './media-viewer.js'
import { createWikiRouter } from './routes/wiki-router.js'

const app = document.querySelector('#app')
const searchForm = document.querySelector('#searchForm')
const searchInput = document.querySelector('#searchInput')

function setReady() {
  const shell = document.querySelector('.page-shell')
  const bootScreen = document.querySelector('#bootScreen')

  document.documentElement.classList.remove('is-booting')
  document.documentElement.classList.add('is-ready')

  if (shell) shell.removeAttribute('aria-hidden')
  if (bootScreen) bootScreen.setAttribute('aria-hidden', 'true')
  app.setAttribute('aria-busy', 'false')
}

async function boot() {
  let initial
  try {
    const node = document.querySelector('#wiki-initial')
    if (node?.textContent) initial = JSON.parse(node.textContent)
  } catch {}
  await loadSiteConfig(initial)
  bootThemeControls()
  bootMediaViewer()
  const router = createWikiRouter({ app, searchForm, searchInput })

  try {
    if (!initial) await loadGlobalSettings()
    if (initial) {
      setReady()
      if (initial.config?.branding?.randomIcons) void bootRandomIcon().catch(() => {})
    } else await bootRandomIcon()
    await router.boot(initial)
  } catch (error) {
    if (!initial) router.renderFatalError(error)
  } finally {
    setReady()
  }
}

boot()
