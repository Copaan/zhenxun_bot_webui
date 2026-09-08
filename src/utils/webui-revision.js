import { Message } from "element-ui"
import { clearAllDirtyStates } from "./dirty-state"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "./restart-network"

const EXPECTED_REVISION = process.env.VUE_APP_WEBUI_REVISION || ""
const RELOAD_KEY = "zhenxunWebuiRevisionReload"
let pollTimer = null
let mismatchNotified = false
let pollingStarted = false
let requestController = null

export const handleWebuiRevision = (revision) => {
  if (isBusinessNetworkFrozen()) return
  if (!revision || !EXPECTED_REVISION || revision === EXPECTED_REVISION) return
  if (window.sessionStorage.getItem(RELOAD_KEY) === revision) {
    if (!mismatchNotified) {
      mismatchNotified = true
      Message.error("前后端资源版本不一致，请清理浏览器缓存后刷新。")
    }
    return
  }
  window.sessionStorage.setItem(RELOAD_KEY, revision)
  clearAllDirtyStates()
  window.location.reload()
}

const checkManifest = async () => {
  if (isBusinessNetworkFrozen() || requestController) return
  const controller = new AbortController()
  const epoch = businessNetworkEpoch()
  requestController = controller
  try {
    const response = await fetch(`/version.json?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
    if (!response.ok) return
    const manifest = await response.json()
    if (controller.signal.aborted || isBusinessNetworkFrozen() || epoch !== businessNetworkEpoch()) return
    handleWebuiRevision(manifest.revision || "")
  } catch (error) {
    // A transient network failure is handled by the next polling cycle.
  } finally {
    if (requestController === controller) requestController = null
  }
}

export const startWebuiRevisionPolling = () => {
  pollingStarted = true
  if (isBusinessNetworkFrozen() || pollTimer) return
  checkManifest()
  pollTimer = window.setInterval(checkManifest, 15000)
}

onBusinessNetworkChange((frozen) => {
  if (frozen) {
    window.clearInterval(pollTimer)
    pollTimer = null
    requestController?.abort()
    requestController = null
  } else if (pollingStarted) startWebuiRevisionPolling()
})
