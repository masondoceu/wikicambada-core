import { SITE_CONFIG, siteLogo } from './core/config.js'
const THEME_KEY = 'wikicambada.theme'
const FONT_KEY = 'wikicambada.font'
const TEXT_SIZE_KEY = 'wikicambada.textSize'
const FALLBACK_CHOICE = 'auto'
const FALLBACK_FONT = prefersClassicFontByPlatform() ? 'classic' : 'mactype'
const FALLBACK_TEXT_SIZE = 'normal'
const CHOICES = new Set(['auto', 'light', 'dark', 'oled'])
const FONT_CHOICES = new Set(['mactype', 'classic'])
const TEXT_SIZE_CHOICES = new Set(['small', 'normal', 'large'])
const DARK_MEDIA = '(prefers-color-scheme: dark)'

function prefersClassicFontByPlatform() {
  const userAgent = navigator.userAgent || ''
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  const vendor = navigator.vendor || ''
  const iPadDesktopMode = platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1
  return iPadDesktopMode || /Mac|iPhone|iPad|iPod/i.test(platform) || /Macintosh|iPhone|iPad|iPod/i.test(userAgent) || /Apple/i.test(vendor)
}

function canUseStorage() {
  try {
    const probe = '__wikicambada_settings_probe__'
    localStorage.setItem(probe, probe)
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

function readStored(key, fallback, choices) {
  if (!canUseStorage()) return fallback
  const saved = localStorage.getItem(key) || fallback
  return choices.has(saved) ? saved : fallback
}

function writeStored(key, value, fallback, choices) {
  if (!canUseStorage()) return
  localStorage.setItem(key, choices.has(value) ? value : fallback)
}

function readChoice() {
  return readStored(THEME_KEY, CHOICES.has(SITE_CONFIG.appearance?.defaultTheme) ? SITE_CONFIG.appearance.defaultTheme : FALLBACK_CHOICE, CHOICES)
}

function readFontChoice() {
  return readStored(FONT_KEY, FALLBACK_FONT, FONT_CHOICES)
}

function readTextSizeChoice() {
  return readStored(TEXT_SIZE_KEY, FALLBACK_TEXT_SIZE, TEXT_SIZE_CHOICES)
}

function prefersDark() {
  return window.matchMedia?.(DARK_MEDIA).matches || false
}

function resolvedTheme(choice) {
  if (choice === 'dark' || choice === 'oled' || choice === 'light') return choice
  return prefersDark() ? 'dark' : 'light'
}

function themeColor(theme) {
  if (theme === 'oled') return '#000000'
  if (theme === 'dark') return '#101418'
  return '#f8f9fa'
}

function syncControls(selector, value) {
  document.querySelectorAll(selector).forEach(control => {
    control.value = value
  })
}

export function applyTheme(choice = readChoice(), options = {}) {
  const nextChoice = CHOICES.has(choice) ? choice : FALLBACK_CHOICE
  const nextTheme = resolvedTheme(nextChoice)

  document.documentElement.dataset.themeChoice = nextChoice
  document.documentElement.dataset.theme = nextTheme
  document.querySelectorAll('[data-site-logo], [data-random-logo]').forEach(element => { element.src = siteLogo(false, element.dataset.currentIconUrl) })
  document.querySelectorAll('[data-site-logo-mobile], [data-random-logo-mobile]').forEach(element => { element.src = siteLogo(true, element.dataset.currentIconUrl) })

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = themeColor(nextTheme)

  syncControls('[data-theme-control]', nextChoice)
  if (options.persist) writeStored(THEME_KEY, nextChoice, FALLBACK_CHOICE, CHOICES)
}

export function applyFont(choice = readFontChoice(), options = {}) {
  const nextChoice = FONT_CHOICES.has(choice) ? choice : FALLBACK_FONT
  document.documentElement.dataset.fontChoice = nextChoice
  document.documentElement.dataset.font = nextChoice
  syncControls('[data-font-control]', nextChoice)
  if (options.persist) writeStored(FONT_KEY, nextChoice, FALLBACK_FONT, FONT_CHOICES)
}

export function applyTextSize(choice = readTextSizeChoice(), options = {}) {
  const nextChoice = TEXT_SIZE_CHOICES.has(choice) ? choice : FALLBACK_TEXT_SIZE
  document.documentElement.dataset.textSizeChoice = nextChoice
  document.documentElement.dataset.textSize = nextChoice
  syncControls('[data-text-size-control]', nextChoice)
  if (options.persist) writeStored(TEXT_SIZE_KEY, nextChoice, FALLBACK_TEXT_SIZE, TEXT_SIZE_CHOICES)
}

export function bootThemeControls() {
  applyTheme(readChoice())
  applyFont(readFontChoice())
  applyTextSize(readTextSizeChoice())

  document.querySelectorAll('[data-theme-control]').forEach(control => {
    control.addEventListener('change', () => {
      applyTheme(control.value, { persist: true })
    })
  })

  document.querySelectorAll('[data-font-control]').forEach(control => {
    control.addEventListener('change', () => {
      applyFont(control.value, { persist: true })
    })
  })

  document.querySelectorAll('[data-text-size-control]').forEach(control => {
    control.addEventListener('change', () => {
      applyTextSize(control.value, { persist: true })
    })
  })

  window.matchMedia?.(DARK_MEDIA).addEventListener?.('change', () => {
    if ((document.documentElement.dataset.themeChoice || FALLBACK_CHOICE) === 'auto') {
      applyTheme('auto')
    }
  })
}
