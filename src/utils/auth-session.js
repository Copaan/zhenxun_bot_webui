import { Message } from "element-ui"
import router from "@/router"
import { clearAllDirtyStates } from "./dirty-state"
import { clearAuthToken } from "./auth-token"

let redirecting = false
let lastNotificationAt = 0

export const clearAuthenticationState = () => {
  clearAuthToken()
  window.sessionStorage.removeItem("isAuthenticated")
}

export const handleAuthenticationExpired = (showMessage = true) => {
  clearAuthenticationState()
  clearAllDirtyStates()
  window.dispatchEvent(new CustomEvent("zhenxun-auth-expired"))
  const now = Date.now()
  if (showMessage && now - lastNotificationAt > 5000) {
    lastNotificationAt = now
    Message.error({ message: "登录会话已失效，请重新登录。" })
  }
  if (redirecting || router.currentRoute.path === "/") return
  redirecting = true
  router.replace(
    "/",
    () => {
      redirecting = false
    },
    () => {
      redirecting = false
    }
  )
}

export const isLocalAuthRecoveryRequest = (config = {}) => {
  if (config.authFailureMode === "local") return true
  const url = String(config.url || "")
  return /\/configure\/(claim|draft|probe|apply|restart|status)/.test(url) ||
    url.includes("/auth/console-connect")
}
