// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { placeScopeSlot } from '@/sanity/plugins/scopeSlot'

const SIDEBAR = `<div class="ad-shell"><aside class="ad-sidebar">
  <div class="ad-brand"></div>
  <div class="ad-sidebar-section" id="date">Date Range</div>
  <nav class="ad-nav"></nav>
</aside></div>`
const ERROR = `<div class="ad-shell"><div><div class="ad-panel" id="err">Failed</div></div></div>`
const LOADING = `<div class="ad-shell"><div>Loading…</div></div>`

function mount(html: string) {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.replaceChildren(host)
  return host
}

// Run placement from a MutationObserver exactly as the Studio does, poke the
// DOM the way React rendering into the slot would, and count re-runs.
async function observedRuns(host: HTMLElement, slot: HTMLElement) {
  let runs = 0
  const observer = new MutationObserver(() => {
    runs++
    if (runs < 100) placeScopeSlot(host, slot)
  })
  observer.observe(host, { childList: true, subtree: true })
  slot.append(document.createElement('button'))
  await new Promise((r) => setTimeout(r, 20))
  observer.disconnect()
  return runs
}

describe('placeScopeSlot', () => {
  it('goes in the sidebar, directly above Date Range', () => {
    const host = mount(SIDEBAR)
    const slot = document.createElement('div')
    expect(placeScopeSlot(host, slot)).toBe(true)
    expect(slot.nextElementSibling?.id).toBe('date')
    expect(slot.className).toBe('ad-sidebar-section')
  })

  it('settles under a MutationObserver instead of looping (regression)', async () => {
    const host = mount(SIDEBAR)
    const slot = document.createElement('div')
    placeScopeSlot(host, slot)
    expect(await observedRuns(host, slot)).toBe(1)
    expect(slot.nextElementSibling?.id).toBe('date')
  })

  it('goes at the bottom of the error panel when there is no sidebar', async () => {
    const host = mount(ERROR)
    const slot = document.createElement('div')
    expect(placeScopeSlot(host, slot)).toBe(true)
    expect(slot.parentElement?.id).toBe('err')
    expect(await observedRuns(host, slot)).toBe(1)
  })

  it('stays detached while the dashboard is loading', () => {
    const host = mount(LOADING)
    const slot = document.createElement('div')
    expect(placeScopeSlot(host, slot)).toBe(false)
    expect(slot.isConnected).toBe(false)
  })
})
