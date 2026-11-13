import { getBaseUrl } from "@/utils/api"
import { handleAuthenticationExpired } from "@/utils/auth-session"
import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"

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

export const createAuthenticatedWebSocket = (path, parameters = {}) => {
  if (isBusinessNetworkFrozen() || !hasValidAuthToken()) return null
  const epoch = businessNetworkEpoch()
  const url = new URL(getBaseUrl())
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = path
  url.search = new URLSearchParams(parameters).toString()
  url.hash = ""

  const websocket = new WebSocket(url.toString())
  websocket.addEventListener(
    "open",
    () => {
      if (isBusinessNetworkFrozen() || epoch !== businessNetworkEpoch() || !hasValidAuthToken()) {
        websocket.close()
        return
      }
      safeWebSocketSend(
        websocket,
        JSON.stringify({ type: "auth", token: getAuthToken() || "" })
      )
    },
    { once: true }
  )
  return websocket
}

/** 管理单例连接的订阅意图，暂停不等于组件主动取消订阅。 */
export const bindSocketActivity = (client, { pauseWhenHidden = true } = {}) => {
  const connect = client.initWebSocket.bind(client)
  const disconnect = client.closeWebSocket.bind(client)
  const suspend = (client.suspendWebSocket || client.closeWebSocket).bind(client)
  let requested = false
  let args = []
  const allowed = () => !isBusinessNetworkFrozen() && hasValidAuthToken() && (!pauseWhenHidden || !document.hidden)
  const resume = () => { if (requested && allowed()) connect(...args) }
  client.initWebSocket = (...values) => {
    requested = true
    args = values
    resume()
  }
  client.closeWebSocket = () => { requested = false; args = []; disconnect() }
  document.addEventListener("visibilitychange", () => {
    if (pauseWhenHidden && document.hidden) suspend()
    else resume()
  })
  onBusinessNetworkChange((frozen) => {
    if (frozen) suspend()
    else resume()
  })
  window.addEventListener("zhenxun-auth-expired", () => client.closeWebSocket())
}
