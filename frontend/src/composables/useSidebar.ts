import { ref } from 'vue'

// Breakpoints: < 768px phone (off-canvas drawer), < 1200px tablet (icon rail by default).
const MOBILE_QUERY = '(max-width: 767px)'
const TABLET_QUERY = '(max-width: 1199px)'

function watchQuery(query: string) {
  const state = ref(false)
  if (typeof window === 'undefined' || !window.matchMedia) return state
  const media = window.matchMedia(query)
  state.value = media.matches
  media.addEventListener('change', (event) => {
    state.value = event.matches
  })
  return state
}

// Module-level singletons so the header toggle and the sidebar share one state.
const isMobile = watchQuery(MOBILE_QUERY)
const isTablet = watchQuery(TABLET_QUERY)
const mobileOpen = ref(false)

export function useSidebar() {
  return {
    isMobile,
    isTablet,
    mobileOpen,
    openMobile: () => (mobileOpen.value = true),
    closeMobile: () => (mobileOpen.value = false),
  }
}
