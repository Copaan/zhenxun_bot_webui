import axios from "axios"
import { getBaseUrl, getCookie, setCookie } from "@/utils/api"
import { handleAuthenticationExpired } from "@/utils/auth-session"
import { isBusinessNetworkFrozen, onBusinessNetworkChange } from "./restart-network"

const RENEW_INTERVAL_MS = 60 * 1000
const TRAILING_DELAY_MS = 1000
const ACTIVITY_EVENTS = ["pointerdown", "touchstart", "keydown"]

let started = false
let lastRequestAt = 0
let trailingTimer = null
let requestSequence = 0
let appliedSequence = 0
let activityVersion = 0
let renewedActivityVersion = 0
let sessionEpoch = 0
let renewal = null

const authenticated = () => Boolean(getCookie("tokenStr"))

const renew = async (trailing = false) => {
  if (isBusinessNetworkFrozen() || !authenticated()) return
  if (renewal) return renewal
  if (!trailing && Date.now() - lastRequestAt < RENEW_INTERVAL_MS) return
  if (trailing && activityVersion <= renewedActivityVersion) return
  const sequence = ++requestSequence
  const epoch = sessionEpoch
  lastRequestAt = Date.now()
  const request = axios
    .post(
      `${getBaseUrl()}/zhenxun/api/auth/activity`,
      {},
      { suppressErrorToast: true }
    )
    .then((response) => {
      const data = response?.data?.data || response?.data
      if (
        isBusinessNetworkFrozen() || epoch !== sessionEpoch ||
        sequence < appliedSequence ||
        !data?.access_token
      ) return
      appliedSequence = sequence
      renewedActivityVersion = activityVersion
      setCookie("tokenStr", `Bearer ${data.access_token}`, 1)
    })
    .catch((error) => {
      if (!isBusinessNetworkFrozen() && epoch === sessionEpoch && !axios.isCancel(error) && error?.response?.status === 401) handleAuthenticationExpired(true)
    })
    .finally(() => {
      if (renewal === request) renewal = null
    })
  renewal = request
  return request
}

const scheduleTrailingRenewal = () => {
  if (trailingTimer) window.clearTimeout(trailingTimer)
  trailingTimer = window.setTimeout(() => {
    trailingTimer = null
    void renew(true)
  }, TRAILING_DELAY_MS)
}

const onActivity = () => {
  if (isBusinessNetworkFrozen() || !authenticated()) return
  activityVersion += 1
  if (Date.now() - lastRequestAt >= RENEW_INTERVAL_MS) {
    void renew()
  }
  scheduleTrailingRenewal()
}

export const startSessionActivity = () => {
  if (started) return
  started = true
  ACTIVITY_EVENTS.forEach((event) =>
    window.addEventListener(event, onActivity, { passive: true })
  )
  window.addEventListener("zhenxun-auth-expired", resetSessionActivity)
}

const resetSessionActivity = () => {
  sessionEpoch += 1
  if (trailingTimer) window.clearTimeout(trailingTimer)
  trailingTimer = null
  renewal = null
  lastRequestAt = 0
  activityVersion = 0
  renewedActivityVersion = 0
}

export const stopSessionActivity = () => {
  if (!started) return
  started = false
  ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity))
  window.removeEventListener("zhenxun-auth-expired", resetSessionActivity)
  resetSessionActivity()
}

onBusinessNetworkChange((frozen) => {
  if (frozen) resetSessionActivity()
})

export const sessionActivityForTests = {
  onActivity,
  renew,
}
