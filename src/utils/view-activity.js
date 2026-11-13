import { hasValidAuthToken } from "./auth-token"
import { isBusinessNetworkFrozen, onBusinessNetworkChange } from "./restart-network"

/** 统计视图仅在可见、在屏且网络可用时工作。 */
export const observeViewActivity = (element, callback) => {
  let inView = true
  let previous = null
  const update = () => {
    const active = hasValidAuthToken() && !document.hidden && inView && !isBusinessNetworkFrozen()
    if (active !== previous) { previous = active; callback(active) }
  }
  const observer = window.IntersectionObserver ? new IntersectionObserver(entries => {
    inView = entries.some(entry => entry.isIntersecting)
    update()
  }) : null
  observer?.observe(element)
  document.addEventListener("visibilitychange", update)
  window.addEventListener("zhenxun-auth-expired", update)
  const removeNetwork = onBusinessNetworkChange(update)
  update()
  return () => {
    observer?.disconnect()
    document.removeEventListener("visibilitychange", update)
    window.removeEventListener("zhenxun-auth-expired", update)
    removeNetwork()
  }
}

export const chartDisplayOptions = () => ({ devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2) })
export const chartAnimation = () => !window.matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches
