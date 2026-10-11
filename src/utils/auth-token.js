const TOKEN_KEY = "zhenxunAuthToken"
for (const key of ["zhenxunSetupToken", "zhenxunMigrationSession"]) window.sessionStorage.removeItem(key)
const tokenChanged = () => window.dispatchEvent(new Event("zhenxun-auth-token-changed"))
const LEGACY_MIGRATION_KEY = "zhenxunLegacyTokenMigrated"

const readLegacyCookie = () => {
  const match = document.cookie.match(/(?:^|;\s*)tokenStr=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

const clearLegacyCookie = () => {
  const expired = "tokenStr=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Strict"
  document.cookie = expired
  if (window.location.protocol === "https:") document.cookie = `${expired};Secure`
}

export const setAuthToken = (token) => {
  const value = String(token || "").trim()
  if (value !== window.sessionStorage.getItem(TOKEN_KEY)) window.sessionStorage.removeItem("zhenxunAuthTask")
  if (value) window.sessionStorage.setItem(TOKEN_KEY, value)
  else window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.setItem(LEGACY_MIGRATION_KEY, "1")
  clearLegacyCookie()
  tokenChanged()
}

export const getAuthToken = () => {
  const stored = window.sessionStorage.getItem(TOKEN_KEY)
  if (stored) return stored
  if (window.sessionStorage.getItem(LEGACY_MIGRATION_KEY)) return null
  window.sessionStorage.setItem(LEGACY_MIGRATION_KEY, "1")
  const legacy = readLegacyCookie()
  if (!legacy) return null
  window.sessionStorage.setItem(TOKEN_KEY, legacy)
  clearLegacyCookie()
  return legacy
}

export const clearAuthToken = () => {
  window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.setItem(LEGACY_MIGRATION_KEY, "1")
  clearLegacyCookie()
  tokenChanged()
}

export const decodeJwtPayload = (token) => {
  try {
    const compact = String(token || "").replace(/^Bearer\s+/i, "")
    const parts = compact.split(".")
    if (parts.length !== 3) return null
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")
    const payload = JSON.parse(window.atob(padded))
    return payload && typeof payload === "object" ? payload : null
  } catch (error) {
    return null
  }
}

export const hasValidAuthToken = (token = getAuthToken(), now = Date.now()) => {
  const payload = decodeJwtPayload(token)
  return Boolean(
    payload &&
      payload.sub &&
      Number.isFinite(Number(payload.exp)) &&
      Number(payload.exp) * 1000 > now
  )
}



export const rememberAuthTask = (taskId) => {
  const sid = decodeJwtPayload(getAuthToken())?.sid
  if (taskId && sid) window.sessionStorage.setItem("zhenxunAuthTask", JSON.stringify({ sid, taskId }))
  else window.sessionStorage.removeItem("zhenxunAuthTask")
}

export const currentAuthTask = () => {
  try {
    const task = JSON.parse(window.sessionStorage.getItem("zhenxunAuthTask") || "null")
    return hasValidAuthToken() && task?.sid === decodeJwtPayload(getAuthToken())?.sid && /^[a-f0-9]{32}$/.test(task.taskId) ? task.taskId : ""
  } catch (_) { return "" }
}
