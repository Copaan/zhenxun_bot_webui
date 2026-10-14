import { Message } from "element-ui"
import { clearAuthToken, hasValidAuthToken, setAuthToken } from "./auth-token"

let lastNotificationAt = 0
let authenticationExpired = false
window.addEventListener("zhenxun-auth-token-changed", () => { if (hasValidAuthToken()) authenticationExpired = false })
export const isAuthenticationExpired = () => authenticationExpired

export const establishSession = (token) => {
  setAuthToken(token)
  window.sessionStorage.setItem("isAuthenticated", true)
}

export const clearAuthenticationState = () => {
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
    Message.error({ message: "会话已过期，连接已断开。已提交的任务仍在后台执行。" })
  }

}

export const isLocalAuthRecoveryRequest = (config = {}) => {
  if (config.authFailureMode === "local") return true
  const url = String(config.url || "")
  return /\/configure\/(claim|draft|probe|apply|restart|status)/.test(url) ||
    url.includes("/auth/console-connect")
}
