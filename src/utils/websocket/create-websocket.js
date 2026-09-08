import {
  getBaseUrl,
  getCookie,
  syncApiWithBrowserLocation,
} from "@/utils/api"
import { handleAuthenticationExpired } from "@/utils/auth-session"
import { businessNetworkEpoch, isBusinessNetworkFrozen } from "@/utils/restart-network"

export const AUTH_EXPIRED_CLOSE_CODE = 4401
export const SERVICE_RESTART_CLOSE_CODE = 1012

export const handleAuthenticatedWebSocketClose = (event) => {
  if (isBusinessNetworkFrozen()) return true
  if (event.code === SERVICE_RESTART_CLOSE_CODE) return true
  if (event.code !== AUTH_EXPIRED_CLOSE_CODE) return false
  handleAuthenticationExpired(true)
  return true
}

export const safeWebSocketSend = (websocket, payload) => {
  if (isBusinessNetworkFrozen()) return false
  if (!websocket || websocket.readyState !== WebSocket.OPEN) return false
  try {
    websocket.send(payload)
    return true
  } catch (error) {
    return false
  }
}

export const emitWebSocketState = (channel, status) => {
  window.dispatchEvent(
    new CustomEvent("zhenxun-websocket-state", {
      detail: { channel, status },
    })
  )
}

export const createAuthenticatedWebSocket = (path) => {
  if (isBusinessNetworkFrozen()) return null
  const epoch = businessNetworkEpoch()
  let url = new URL(getBaseUrl())
  if (window.location.protocol === "https:" && url.protocol !== "https:") {
    syncApiWithBrowserLocation()
    emitWebSocketState(path, "mixed-content-address-reset")
    url = new URL(getBaseUrl())
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = path
  url.search = ""
  url.hash = ""

  const websocket = new WebSocket(url.toString())
  websocket.addEventListener(
    "open",
    () => {
      if (isBusinessNetworkFrozen() || epoch !== businessNetworkEpoch()) {
        websocket.close()
        return
      }
      safeWebSocketSend(
        websocket,
        JSON.stringify({ type: "auth", token: getCookie("tokenStr") || "" })
      )
    },
    { once: true }
  )
  return websocket
}
