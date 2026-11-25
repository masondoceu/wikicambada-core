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
  await loadSiteConfig()
  bootThemeControls()
  bootMediaViewer()
  const router = createWikiRouter({ app, searchForm, searchInput })

  try {
    await loadGlobalSettings()
    await bootRandomIcon()
    await router.boot()
  } catch (error) {
    router.renderFatalError(error)
  } finally {
    setReady()
  }
}

boot()
