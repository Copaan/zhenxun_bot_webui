import { freezeBusinessNetwork, resumeBusinessNetwork } from "./restart-network"

const STORAGE_KEY = "zhenxunRestartRecovery"
const EVENT_NAME = "zhenxun-restart-recovery"
export const RECOVERY_MAX_AGE = 5 * 60 * 1000

const normalizeBaseUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim())
    if (!["http:", "https:"].includes(url.protocol)) return null
    if (url.username || url.password) return null
    if (["0.0.0.0", "::"].includes(url.hostname.replace(/^\[|\]$/g, ""))) return null
    return url.origin
  } catch (error) {
    return null
  }
}

const targetKind = (url) => {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  )
    ? "local"
    : "network"
}

const uniqueTargets = (values) => {
  const seen = new Set()
  return values.reduce((result, value) => {
    const origin = normalizeBaseUrl(value)
    if (origin && !seen.has(origin)) {
      seen.add(origin)
      result.push(origin)
    }
    return result
  }, [])
}

const choosePreferredOrigin = ({ policy, preferredUrl, targets, currentOrigin }) => {
  const current = normalizeBaseUrl(currentOrigin)
  const validOrigins = uniqueTargets(targets.map((target) => target.url))
  const explicit = normalizeBaseUrl(preferredUrl)
  const eligibleExplicit = explicit && validOrigins.includes(explicit) ? explicit : null
  if (policy === "preserve" && current) {
    if (validOrigins.includes(current)) return current
    const currentHostname = new URL(current).hostname.toLowerCase()
    if (
      eligibleExplicit &&
      new URL(eligibleExplicit).hostname.toLowerCase() === currentHostname
    ) return eligibleExplicit
    const sameHost = validOrigins.find(
      (origin) => new URL(origin).hostname.toLowerCase() === currentHostname
    )
    if (sameHost) return sameHost
  }
  if (eligibleExplicit) return eligibleExplicit
  const wantedKind = policy === "local" ? "local" : policy === "network" ? "network" : null
  if (wantedKind) {
    const matched = targets.find((target) => {
      try {
        return targetKind(new URL(target.url)) === wantedKind
      } catch (error) {
        return false
      }
    })
    if (matched) return normalizeBaseUrl(matched.url)
  }
  return normalizeBaseUrl(targets[0]?.url) || null
}

export const restartRecoveryState = () => {
  try {
    if (/([?&])reauth=1(?:&|$)/.test(window.location.hash)) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null")
    if (!value || !value.bootId || !Array.isArray(value.accessUrls) ||
        !Number.isFinite(value.startedAt) || value.startedAt > Date.now() ||
        Date.now() - value.startedAt >= RECOVERY_MAX_AGE ||
        (value.expiresAt && Date.now() >= value.expiresAt) ||
        (value.sourceOrigin && normalizeBaseUrl(value.sourceOrigin) !== window.location.origin)) {
      clearRestartRecovery()
      return null
    }
    const policy = value.policy || (value.setup ? "legacy-setup" : "preserve")
    const sourceOrigin = normalizeBaseUrl(value.sourceOrigin) || window.location.origin
    const preferredKind = value.preferredKind || targetKind(new URL(sourceOrigin))
    const available = uniqueTargets(value.accessUrls)
    const automatic = available.filter(
      (url) => targetKind(new URL(url)) === preferredKind
    )
    const preferredOrigin = choosePreferredOrigin({
      policy,
      preferredUrl: value.preferredOrigin,
      targets: automatic.map((url) => ({ url })),
      currentOrigin: sourceOrigin,
    })
    return {
      ...value,
      policy,
      sourceOrigin,
      preferredKind,
      preferredOrigin,
      accessUrls: available,
      fallbackUrls: automatic.filter((url) => url !== preferredOrigin),
    }
  } catch (error) {
    clearRestartRecovery()
    return null
  }
}

export const startRestartRecovery = ({
  bootId,
  launcherBootId = "",
  restartId = "",
  accessUrls = [],
  accessTargets = [],
  preferredUrl = "",
  policy = "preserve",
  returnRoute = "/dashboard",
  message = "配置将在新进程中生效。",
  setup = false,
}) => {
  const sourceOrigin = normalizeBaseUrl(window.location.origin)
  const sourceKind = targetKind(new URL(sourceOrigin))
  const preferredKind =
    policy === "local" ? "local" : policy === "network" ? "network" : sourceKind
  const targets = [
    ...accessTargets,
    ...accessUrls.map((url) => ({ url })),
  ].filter((target) => normalizeBaseUrl(target?.url))
  const automaticTargets = targets.filter(
    (target) => targetKind(new URL(normalizeBaseUrl(target.url))) === preferredKind
  )
  const preferredOrigin = choosePreferredOrigin({
    policy,
    preferredUrl,
    targets: automaticTargets,
    currentOrigin: sourceOrigin,
  })
  const urls = uniqueTargets([
    preferredOrigin,
    ...targets.map((target) => target.url),
  ])
  const automaticUrls = urls.filter(
    (url) => targetKind(new URL(url)) === preferredKind
  )
  const state = {
    bootId,
    launcherBootId,
    restartId,
    sessionId: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sourceOrigin,
    preferredKind,
    preferredOrigin: preferredOrigin || automaticUrls[0],
    fallbackUrls: automaticUrls.filter((url) => url !== preferredOrigin),
    accessUrls: urls,
    policy,
    returnRoute: returnRoute.startsWith("/") ? returnRoute : `/${returnRoute}`,
    message,
    setup,
    startedAt: Date.now(),
    expiresAt: Date.now() + RECOVERY_MAX_AGE,
  }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  freezeBusinessNetwork()
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: state }))
  return state
}

export const clearRestartRecovery = ({ resumeNetwork = false } = {}) => {
  window.sessionStorage.removeItem(STORAGE_KEY)
  if (resumeNetwork) resumeBusinessNetwork()
}

export const recoverySessionIsCurrent = (state) => {
  const saved = restartRecoveryState()
  return Boolean(saved && saved.bootId === state.bootId &&
    saved.sessionId === state.sessionId && saved.startedAt === state.startedAt)
}

export const recoveryStatusMatches = (state, payload) => {
  const data = payload?.data
  return Boolean(payload?.suc !== false && data?.boot_id && data.boot_id !== state.bootId &&
    !data.transaction_verification_pending &&
    (!state.launcherBootId || data.launcher_boot_id === state.launcherBootId) &&
    (!state.restartId || data.restart_id === state.restartId))
}

export const recoveryProbeTargets = (state, sourceOrigin = window.location.origin) => {
  const candidates = uniqueTargets([state.preferredOrigin, ...(state.fallbackUrls || [])])
    .filter(url => state.accessUrls.includes(url))
  if (new URL(sourceOrigin).protocol !== "https:") return candidates
  const httpListeners = new Set(state.accessUrls.filter(url => new URL(url).protocol === "http:")
    .map(url => {
      const target = new URL(url)
      return `${target.hostname}:${target.port || "80"}`
    }))
  return candidates.filter(url => {
    const target = new URL(url)
    return target.protocol === "https:" &&
      !httpListeners.has(`${target.hostname}:${target.port || "443"}`)
  })
}

export const RESTART_RECOVERY_EVENT = EVENT_NAME

// Restore the network gate before main.js starts background work or mounts views.
if (restartRecoveryState()) freezeBusinessNetwork()
