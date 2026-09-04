const STORAGE_KEY = "zhenxunRestartRecovery"
const EVENT_NAME = "zhenxun-restart-recovery"

const normalizeBaseUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim())
    if (!["http:", "https:"].includes(url.protocol)) return null
    if (["0.0.0.0", "::"].includes(url.hostname)) return null
    return url.origin
  } catch (error) {
    return null
  }
}

const targetKind = (url) => {
  const hostname = url.hostname.toLowerCase()
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
    const currentHostname = new URL(current).hostname.toLowerCase()
    if (
      eligibleExplicit &&
      new URL(eligibleExplicit).hostname.toLowerCase() === currentHostname
    ) return eligibleExplicit
    const sameHost = validOrigins.find(
      (origin) => new URL(origin).hostname.toLowerCase() === currentHostname
    )
    if (sameHost) return sameHost
    if (validOrigins.includes(current)) return current
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
    if (!value || !value.bootId || !Array.isArray(value.accessUrls)) return null
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
      fallbackUrls: Array.isArray(value.fallbackUrls)
        ? uniqueTargets(value.fallbackUrls).filter(
            (url) => targetKind(new URL(url)) === preferredKind
          )
        : automatic.filter((url) => normalizeBaseUrl(url) !== preferredOrigin),
    }
  } catch (error) {
    return null
  }
}

export const startRestartRecovery = ({
  bootId,
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
  }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: state }))
  return state
}

export const clearRestartRecovery = () => {
  window.sessionStorage.removeItem(STORAGE_KEY)
}

export const RESTART_RECOVERY_EVENT = EVENT_NAME
