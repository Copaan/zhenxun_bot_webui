import { getAuthToken, decodeJwtPayload } from "./auth-token"
import { handleAuthenticationExpired } from "./auth-session"

let started = false
let expiryTimer = null

const schedule = () => {
  window.clearTimeout(expiryTimer)
  expiryTimer = null
  const token = getAuthToken()
  if (!token) return
  const claims = decodeJwtPayload(token)
  const remaining = Number(claims?.exp) * 1000 - Date.now()
  if (!Number.isFinite(remaining) || remaining <= 0) {
    handleAuthenticationExpired(true)
    return
  }
  expiryTimer = window.setTimeout(schedule, Math.min(remaining, 2147483647))
}

export const startSessionActivity = () => {
  if (started) return
  started = true
  window.addEventListener("zhenxun-auth-token-changed", schedule)
  window.addEventListener("storage", schedule)
  document.addEventListener("visibilitychange", schedule)
  schedule()
}

export const stopSessionActivity = () => {
  started = false
  window.clearTimeout(expiryTimer)
  expiryTimer = null
  window.removeEventListener("zhenxun-auth-token-changed", schedule)
  window.removeEventListener("storage", schedule)
  document.removeEventListener("visibilitychange", schedule)
}

export const sessionActivityForTests = { onActivity: schedule, renew: schedule }
