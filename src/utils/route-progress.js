import Vue from "vue"

const SHOW_DELAY = 100
const HIDE_DELAY = 250
const MAX_DURATION = 15000

export const routeProgress = Vue.observable({ visible: false, value: 0 })

let showTimer = null
let trickleTimer = null
let hideTimer = null
let guardTimer = null

const clearTimers = () => {
  clearTimeout(showTimer)
  clearInterval(trickleTimer)
  clearTimeout(hideTimer)
  clearTimeout(guardTimer)
  showTimer = trickleTimer = hideTimer = guardTimer = null
}

/**
 * 开始一次页面切换；切换超过 SHOW_DELAY 毫秒仍未完成时才显示进度条
 */
export function startRouteProgress() {
  clearTimers()
  routeProgress.visible = false
  routeProgress.value = 0
  showTimer = setTimeout(() => {
    routeProgress.visible = true
    routeProgress.value = 15
    trickleTimer = setInterval(() => {
      const rest = 90 - routeProgress.value
      routeProgress.value += Math.max(rest * 0.12, 0.4)
    }, 120)
  }, SHOW_DELAY)
  guardTimer = setTimeout(finishRouteProgress, MAX_DURATION)
}

/**
 * 结束页面切换：已显示时补满后隐藏，未显示时直接取消
 */
export function finishRouteProgress() {
  const shown = routeProgress.visible
  clearTimers()
  if (!shown) {
    routeProgress.value = 0
    return
  }
  routeProgress.value = 100
  hideTimer = setTimeout(() => {
    routeProgress.visible = false
    routeProgress.value = 0
  }, HIDE_DELAY)
}
