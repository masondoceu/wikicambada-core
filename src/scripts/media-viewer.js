import { interfaceLanguage } from './core/i18n.js'

const ui = (pt, en) => interfaceLanguage() === 'en' ? en : pt

let viewerState = {
  items: [],
  index: 0
}

function safeViewerUrl(value, allowBlob = false) {
  try {
    const parsed = new URL(String(value || ''), window.location.href)
    if (parsed.username || parsed.password) return ''
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href
    if (allowBlob && parsed.protocol === 'blob:') return parsed.href
  } catch {}
  return ''
}

function safeEmbedUrl(value) {
  const url = safeViewerUrl(value)
  if (!url) return ''
  const parsed = new URL(url)
  return parsed.protocol === 'https:' && parsed.hostname === 'www.youtube-nocookie.com' && parsed.pathname.startsWith('/embed/') ? parsed.href : ''
}

function ensureViewer() {
  let viewer = document.querySelector('[data-media-viewer-root]')
  if (viewer) return viewer

  viewer = document.createElement('section')
  viewer.className = 'media-viewer-shell'
  viewer.hidden = true
  viewer.setAttribute('aria-hidden', 'true')
  viewer.setAttribute('role', 'dialog')
  viewer.setAttribute('aria-modal', 'true')
  viewer.setAttribute('data-media-viewer-root', '')
  viewer.innerHTML = `
    <div class="media-viewer-stage" data-media-close></div>
    <article class="media-viewer-card" aria-label="${ui('Visualizador de mídia', 'Media viewer')}">
      <header class="media-viewer-topbar">
        <span data-media-counter>1/1</span>
        <button type="button" class="media-viewer-icon-button" data-media-close aria-label="${ui('Fechar', 'Close')}">×</button>
      </header>
      <button type="button" class="media-viewer-nav media-viewer-prev" data-media-prev aria-label="${ui('Mídia anterior', 'Previous media')}">‹</button>
      <button type="button" class="media-viewer-nav media-viewer-next" data-media-next aria-label="${ui('Próxima mídia', 'Next media')}">›</button>
      <div class="media-viewer-body" data-media-body></div>
      <footer class="media-viewer-footer">
        <div class="media-viewer-caption">
          <strong data-media-title></strong>
          <span data-media-caption></span>
        </div>
        <a class="media-viewer-details primary-button" data-media-details href="#">${ui('Mais detalhes', 'More details')}</a>
      </footer>
    </article>
  `
  document.body.append(viewer)
  return viewer
}

function closeViewer() {
  const viewer = document.querySelector('[data-media-viewer-root]')
  if (!viewer) return

  const body = viewer.querySelector('[data-media-body]')
  if (body) body.innerHTML = ''
  viewer.classList.remove('is-open')
  viewer.hidden = true
  viewer.setAttribute('hidden', '')
  viewer.setAttribute('aria-hidden', 'true')
  viewer.style.display = ''
  document.documentElement.classList.remove('media-viewer-open')
  viewerState = { items: [], index: 0 }
}

function isViewerOpen() {
  const viewer = document.querySelector('[data-media-viewer-root]')
  return Boolean(viewer && !viewer.hidden && viewer.classList.contains('is-open'))
}

function mediaTitleFromTrigger(trigger, caption) {
  return trigger.dataset.mediaTitle || trigger.getAttribute('alt') || caption || ui('Arquivo de mídia', 'Media file')
}

function fileDetailsFromContentUrl(src) {
  try {
    const parsed = new URL(String(src || ''), window.location.href)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const apiIndex = parts.findIndex((part, index) => part === 'api' && parts[index + 1] === 'files')
    const slug = apiIndex >= 0 && parts[apiIndex + 3] === 'content' ? parts[apiIndex + 2] : ''
    if (slug) return `/wiki/arquivo/${encodeURIComponent(decodeURIComponent(slug))}`
  } catch {}

  const match = String(src || '').match(/\/api\/files\/([^/?#]+)\/content(?:[?#].*)?$/i)
  if (match?.[1]) return `/wiki/arquivo/${encodeURIComponent(decodeURIComponent(match[1]))}`
  return ''
}

function isContentUrl(url) {
  return /\/api\/files\/[^/?#]+\/content(?:[?#].*)?$/i.test(String(url || ''))
}

function mediaTriggerFromEventTarget(target) {
  if (!target?.closest) return null
  if (target.closest('[data-media-viewer-root]')) return null
  const direct = target.closest('[data-media-viewer]')
  if (direct?.dataset.mediaSrc) return direct
  const media = target.closest('img[data-media-src], video[data-media-src], audio[data-media-src], iframe[data-media-src]')
  return media || null
}

function shouldIgnoreMediaTarget(target) {
  if (target.closest?.('video[controls], audio[controls], iframe')) return true
  const interactive = target.closest?.('a, button, input, textarea, select, label')
  if (!interactive) return false
  return !interactive.closest?.('[data-media-viewer]')
}

function normalizeTrigger(trigger) {
  if (!trigger) return null
  if (trigger.dataset.mediaSrc) return trigger
  const child = trigger.querySelector?.('[data-media-src]')
  if (child) return child
  const media = trigger.matches?.('img, video, audio, iframe') ? trigger : trigger.querySelector?.('img, video, audio, iframe')
  if (media?.src) return media
  return null
}

function getTriggerSrc(trigger) {
  return trigger.dataset.mediaSrc || trigger.currentSrc || trigger.src || trigger.querySelector?.('img, video, audio, iframe')?.src || ''
}

function getTriggerType(trigger) {
  const tagName = trigger.tagName?.toLowerCase?.() || ''
  if (trigger.dataset.mediaType) return trigger.dataset.mediaType
  if (tagName === 'video' || tagName === 'iframe') return 'video'
  if (tagName === 'audio') return 'audio'
  return 'image'
}

function itemFromTrigger(trigger) {
  const src = safeViewerUrl(getTriggerSrc(trigger), true)
  const embed = safeEmbedUrl(trigger.dataset.mediaEmbed || '')
  if (!src && !embed) return null
  const caption = trigger.dataset.mediaCaption || ''
  return {
    src,
    embed,
    type: getTriggerType(trigger),
    title: mediaTitleFromTrigger(trigger, caption),
    caption,
    details: trigger.dataset.mediaDetails || '',
    element: trigger
  }
}

function collectMediaItems(trigger) {
  const root = trigger.closest?.('.article-body, .file-page, article, main, body') || document
  const triggers = Array.from(root.querySelectorAll('[data-media-src]'))
    .map(normalizeTrigger)
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)

  const items = triggers.map(itemFromTrigger).filter(Boolean)
  const selected = normalizeTrigger(trigger)
  const index = Math.max(0, triggers.indexOf(selected))
  return { items: items.length ? items : [itemFromTrigger(trigger)].filter(Boolean), index }
}

function mediaNodeForItem(item) {
  const embed = safeEmbedUrl(item.embed)
  if (embed) {
    const iframe = document.createElement('iframe')
    iframe.src = embed
    iframe.title = item.title || item.caption || ui('vídeo incorporado', 'embedded video')
    iframe.loading = 'lazy'
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
    iframe.allowFullscreen = true
    iframe.setAttribute('data-media-viewer-media', '')
    return iframe
  }

  const type = item.type === 'audio' ? 'audio' : item.type === 'video' ? 'video' : 'img'
  const media = document.createElement(type)
  media.src = safeViewerUrl(item.src, true)
  media.draggable = false
  media.setAttribute('data-media-viewer-media', '')
  if (type === 'video' || type === 'audio') {
    media.controls = true
    media.autoplay = type === 'video'
    media.preload = 'metadata'
  } else {
    media.alt = item.title || ''
  }
  return media
}

function renderViewerItem() {
  const viewer = ensureViewer()
  const body = viewer.querySelector('[data-media-body]')
  const title = viewer.querySelector('[data-media-title]')
  const caption = viewer.querySelector('[data-media-caption]')
  const details = viewer.querySelector('[data-media-details]')
  const counter = viewer.querySelector('[data-media-counter]')
  const prev = viewer.querySelector('[data-media-prev]')
  const next = viewer.querySelector('[data-media-next]')
  const item = viewerState.items[viewerState.index]
  if (!item || !body) return false

  body.innerHTML = ''
  body.append(mediaNodeForItem(item))

  if (title) title.textContent = item.title || ui('Arquivo de mídia', 'Media file')
  if (caption) caption.textContent = item.caption || ''
  if (counter) counter.textContent = `${viewerState.index + 1}/${viewerState.items.length}`

  if (prev) prev.hidden = viewerState.items.length < 2
  if (next) next.hidden = viewerState.items.length < 2

  if (details) {
    const inferredDetails = fileDetailsFromContentUrl(item.src)
    const explicitDetails = item.details || ''
    const candidate = explicitDetails && !isContentUrl(explicitDetails) ? explicitDetails : inferredDetails || explicitDetails || item.src
    const detailsUrl = safeViewerUrl(candidate)
    details.hidden = false
    details.href = detailsUrl || '#'
    details.textContent = 'Mais detalhes'

    if (detailsUrl && new URL(detailsUrl).origin === window.location.origin && detailsUrl !== item.src && !isContentUrl(detailsUrl)) {
      details.setAttribute('data-link', 'route')
      details.removeAttribute('target')
      details.removeAttribute('rel')
    } else {
      details.removeAttribute('data-link')
      if (detailsUrl) {
        details.target = '_blank'
        details.rel = 'noreferrer'
      } else {
        details.removeAttribute('target')
        details.removeAttribute('rel')
      }
    }
  }

  return true
}

function moveViewer(delta) {
  if (!viewerState.items.length) return
  viewerState.index = (viewerState.index + delta + viewerState.items.length) % viewerState.items.length
  renderViewerItem()
}

export function openViewerFromElement(element) {
  const trigger = normalizeTrigger(element)
  if (!trigger) return false

  const { items, index } = collectMediaItems(trigger)
  if (!items.length) return false
  viewerState = { items, index }

  const viewer = ensureViewer()
  if (!renderViewerItem()) return false

  viewer.hidden = false
  viewer.removeAttribute('hidden')
  viewer.style.display = 'grid'
  viewer.classList.add('is-open')
  viewer.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('media-viewer-open')
  void viewer.offsetHeight
  return false
}

function consumeAndOpen(event, trigger) {
  const normalized = normalizeTrigger(trigger)
  if (!normalized) return false
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
  openViewerFromElement(normalized)
  return true
}

export function bootMediaViewer() {
  ensureViewer()
  window.WikiCambadaMediaViewer = {
    openFromElement: openViewerFromElement,
    close: closeViewer
  }

  document.addEventListener('click', event => {
    if (event.button !== 0) return

    if (event.target.closest?.('[data-media-viewer-root] a[data-media-details]')) {
      closeViewer()
      return
    }

    const close = event.target.closest?.('[data-media-close]')
    if (close) {
      event.preventDefault()
      event.stopPropagation()
      closeViewer()
      return
    }

    const prev = event.target.closest?.('[data-media-prev]')
    const next = event.target.closest?.('[data-media-next]')
    if (prev || next) {
      event.preventDefault()
      event.stopPropagation()
      moveViewer(prev ? -1 : 1)
      return
    }

    if (isViewerOpen() && event.target.closest?.('[data-media-viewer-root]') && !event.target.closest?.('[data-media-viewer-media], .media-viewer-footer, .media-viewer-topbar, .media-viewer-nav')) {
      event.preventDefault()
      event.stopPropagation()
      closeViewer()
      return
    }

    if (shouldIgnoreMediaTarget(event.target)) return
    const trigger = mediaTriggerFromEventTarget(event.target)
    if (!trigger) return
    consumeAndOpen(event, trigger)
  }, true)

  document.addEventListener('keyup', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (shouldIgnoreMediaTarget(event.target)) return
    const trigger = mediaTriggerFromEventTarget(event.target)
    if (!trigger) return
    consumeAndOpen(event, trigger)
  }, true)

  document.addEventListener('dragstart', event => {
    if (!event.target.closest?.('[data-media-viewer]')) return
    event.preventDefault()
    event.stopPropagation()
  }, true)

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeViewer()
    if (!isViewerOpen()) return
    if (event.key === 'ArrowLeft') moveViewer(-1)
    if (event.key === 'ArrowRight') moveViewer(1)
  })
}
