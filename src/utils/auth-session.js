import { Message } from "element-ui"
import { clearAuthToken, hasValidAuthToken, setAuthToken } from "./auth-token"

let lastNotificationAt = 0
let authenticationExpired = false
let transportNotice = null

export const showTransportWarning = (text) => {
  if (transportNotice) transportNotice.close()
  transportNotice = text && hasValidAuthToken() ? Message.warning({ message: text, duration: 8000, showClose: true, customClass: "kawaii-message webui-transport-warning" }) : null
}
window.addEventListener("zhenxun-auth-token-changed", () => { if (hasValidAuthToken()) authenticationExpired = false })
export const isAuthenticationExpired = () => authenticationExpired

export const establishSession = (token) => {
  setAuthToken(token)
  window.sessionStorage.setItem("isAuthenticated", true)
}

export const clearAuthenticationState = () => {
  if (transportNotice) { transportNotice.close(); transportNotice = null }
  clearAuthToken()
  window.sessionStorage.removeItem("isAuthenticated")
}

export const handleAuthenticationExpired = (showMessage = true) => {
  authenticationExpired = true
  clearAuthenticationState()
  window.dispatchEvent(new CustomEvent("zhenxun-auth-expired"))
  const now = Date.now()
  if (showMessage && now - lastNotificationAt > 5000) {
    lastNotificationAt = now
    Message.error({ message: "登录已失效，请重新登录" })
  }

}

export const isLocalAuthRecoveryRequest = (config = {}) => {
  if (config.authFailureMode === "local") return true
  const url = String(config.url || "")
  return /\/configure\/(claim|draft|probe|apply|restart|status)/.test(url) ||
    url.includes("/auth/console-connect")
}
