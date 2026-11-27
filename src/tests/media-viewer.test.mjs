import test from 'node:test'
import assert from 'node:assert/strict'
import { bootMediaViewer } from '../scripts/media-viewer.js'

test('The media viewer opens on primary clicks and respects surrounding links', () => {
  const original = { document: globalThis.document, window: globalThis.window }
  const handlers = new Map(), classes = new Set()
  const classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) }
  const body = { append() {} }
  const viewer = { hidden: true, classList, style: {}, setAttribute() {}, removeAttribute() {}, querySelector: selector => selector === '[data-media-body]' ? body : null }
  const link = { closest: () => null }
  let linked = false
  const img = {
    dataset: { mediaSrc: '/api/files/example/content', mediaType: 'image', mediaDetails: '/wiki/arquivo/example' },
    getAttribute: () => '', closest(selector) {
      if (selector === 'a, button, input, textarea, select, label') return linked ? link : null
      if (selector === '[data-media-viewer]' || selector === '[data-media-details]') return this
      return null
    }
  }
  globalThis.document = {
    documentElement: { classList }, querySelector: () => viewer, querySelectorAll: () => [img],
    createElement: () => ({ setAttribute() {} }), addEventListener: (name, fn) => handlers.set(name, fn)
  }
  globalThis.window = { location: { href: 'https://example.invalid/wiki/example' } }
  function dispatch(type, button) {
    let cancelled = false
    handlers.get(type)?.({ target: img, button, preventDefault() { cancelled = true }, stopPropagation() {} })
    return cancelled
  }
  try {
    bootMediaViewer()
    assert.equal(dispatch('contextmenu', 2), false)
    assert.equal(dispatch('click', 1), false)
    assert.equal(viewer.hidden, true)
    assert.equal(dispatch('click', 0), true)
    assert.equal(viewer.hidden, false)
    window.WikiCambadaMediaViewer.close()
    linked = true
    assert.equal(dispatch('click', 0), false)
    assert.equal(viewer.hidden, true)
  } finally { Object.assign(globalThis, original) }
})
