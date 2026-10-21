// Positions the Analytics "Pages" switch inside sanity-plugin-analytics'
// dashboard, which has no slot for extra controls:
//   - sidebar showing → a sidebar section just above Date Range
//   - error panel instead (no sidebar) → bottom of that panel, so you can
//     always switch back to "All site"
//   - loading → detached
// Idempotent: when `slot` is already in place it touches nothing, so calling
// it from a MutationObserver on `host` settles instead of looping.

const MARKER = 'ilotScope' // → data-ilot-scope

export function placeScopeSlot(host: Element, slot: HTMLElement): boolean {
  slot.dataset[MARKER] = ''
  // Our slot shares the .ad-sidebar-section class, so exclude it explicitly.
  const dateRange = host.querySelector('.ad-sidebar > .ad-sidebar-section:not([data-ilot-scope])')
  const errorPanel = host.querySelector('.ad-panel')

  if (dateRange) {
    slot.className = 'ad-sidebar-section'
    slot.style.marginTop = ''
    if (slot.nextElementSibling !== dateRange) dateRange.before(slot)
  } else if (errorPanel && !host.querySelector('.ad-sidebar')) {
    slot.className = ''
    slot.style.marginTop = '18px'
    if (slot.parentElement !== errorPanel) errorPanel.append(slot)
  } else if (slot.isConnected) {
    slot.remove()
  }
  return slot.isConnected
}
