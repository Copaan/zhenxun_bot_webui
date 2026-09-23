import { Message } from "element-ui"
import { hasDirtyState } from "./dirty-state"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "./restart-network"

const EXPECTED_REVISION = process.env.VUE_APP_WEBUI_REVISION || ""
const RESOURCE_REVISION = document.querySelector('meta[name="zhenxun-webui-resource-revision"]')?.content || ""
const DEVELOPMENT = process.env.NODE_ENV === "development"
const RELOAD_KEY = "zhenxunWebuiRevisionReload"
let pollTimer = null
let mismatchNotified = ""
let pollingStarted = false
let requestController = null
let requestStartedAt = 0
let draftNotice = null
let reloadIssued = false

const closeDraftNotice = () => {
  draftNotice?.close()
  draftNotice = null
}

export const handleWebuiRevision = (value) => {
  if (DEVELOPMENT || isBusinessNetworkFrozen() || document.hidden || reloadIssued) return
  const manifest = typeof value === "string" ? { revision: value } : (value || {})
  if (manifest.resources_ready === false) return
  const resource = manifest.resource_revision || ""
  const revision = manifest.revision || manifest.webui_revision || ""
  const expected = RESOURCE_REVISION || EXPECTED_REVISION
  const actual = RESOURCE_REVISION ? resource : revision
  if (!actual || !expected) return
  if (actual === expected) {
    closeDraftNotice()
    return
  }
  if (hasDirtyState()) {
    if (!draftNotice) draftNotice = Message({
      message: "页面资源已更新，保存或撤销修改后刷新。",
      type: "info", duration: 0, showClose: true,
    })
    return
  }
  closeDraftNotice()
  const target = `${RESOURCE_REVISION ? "resource" : "build"}:${actual}`
  if (window.sessionStorage.getItem(RELOAD_KEY) === target) {
    if (mismatchNotified !== target) {
      mismatchNotified = target
      Message.error("页面仍未加载到最新资源，请确认发布完成后手动刷新。")
    }
    return
  }
  window.sessionStorage.setItem(RELOAD_KEY, target)
  reloadIssued = true
  window.location.reload()
}

const checkManifest = async () => {
  if (isBusinessNetworkFrozen() || document.hidden || reloadIssued) return
  if (requestController) {
    if (Date.now() - requestStartedAt < 10000) return
    requestController.abort()
  }
  const controller = new AbortController()
  const epoch = businessNetworkEpoch()
  requestController = controller
  requestStartedAt = Date.now()
  try {
    const response = await fetch(`/version.json?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
    if (!response.ok) return
    const manifest = await response.json()
    if (controller.signal.aborted || isBusinessNetworkFrozen() || epoch !== businessNetworkEpoch()) return
    handleWebuiRevision(manifest)
  } catch (error) {
    // A transient network failure is handled by the next polling cycle.
  } finally {
    if (requestController === controller) requestController = null
  }
}

export const startWebuiRevisionPolling = () => {
  if (DEVELOPMENT) return
  pollingStarted = true
  if (isBusinessNetworkFrozen() || document.hidden || pollTimer) return
  checkManifest()
  pollTimer = window.setInterval(checkManifest, 3000)
}

const stopPolling = () => {
  window.clearInterval(pollTimer)
  pollTimer = null
  requestController?.abort()
  requestController = null
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPolling()
  else if (pollingStarted) startWebuiRevisionPolling()
})

onBusinessNetworkChange((frozen) => {
  if (frozen) {
    stopPolling()
    closeDraftNotice()
  } else if (pollingStarted) startWebuiRevisionPolling()
})
