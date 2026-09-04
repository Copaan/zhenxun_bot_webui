function normalizedHostname(hostname) {
  return String(hostname || "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
}

function isWildcard(hostname) {
  return ["0.0.0.0", "::"].includes(normalizedHostname(hostname))
}

function isLoopback(hostname) {
  const value = normalizedHostname(hostname)
  return (
    value === "localhost" ||
    value.endsWith(".localhost") ||
    value === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(value)
  )
}

function parseTarget(value, baseOrigin) {
  try {
    const target = new URL(value, baseOrigin)
    if (!target.hostname || isWildcard(target.hostname)) return null
    target.pathname = ""
    target.search = ""
    target.hash = ""
    return target
  } catch (error) {
    return null
  }
}

function targetForHost(origin, hostname, port) {
  const value = normalizedHostname(hostname)
  if (!value || isWildcard(value)) return null
  const authority = value.includes(":") ? `[${value}]` : value
  return parseTarget(`${origin.protocol}//${authority}:${port}`, origin.origin)
}

function pushUnique(targets, seen, target) {
  if (!target || seen.has(target.origin)) return
  seen.add(target.origin)
  targets.push(target.origin)
}

export function buildRestartTargets({
  mode,
  customHost,
  port,
  accessUrls,
  currentOrigin = window.location.origin,
  preferReturned = false,
}) {
  const origin = new URL(currentOrigin)
  const currentTarget = targetForHost(origin, origin.hostname, port)
  const returnedTargets = (accessUrls || [])
    .map((value) => parseTarget(value, origin.origin))
    .filter(Boolean)
  const loopbackTargets = returnedTargets.filter((target) =>
    isLoopback(target.hostname)
  )
  const networkTargets = returnedTargets.filter(
    (target) => !isLoopback(target.hostname)
  )
  const targets = []
  const seen = new Set()

  if (mode === "local") {
    if (!preferReturned && currentTarget && isLoopback(currentTarget.hostname)) {
      pushUnique(targets, seen, currentTarget)
    }
    loopbackTargets.forEach((target) => pushUnique(targets, seen, target))
    if (preferReturned && currentTarget && isLoopback(currentTarget.hostname)) {
      pushUnique(targets, seen, currentTarget)
    }
  } else if (mode === "custom") {
    if (preferReturned) {
      returnedTargets
        .filter(
          (target) =>
            normalizedHostname(target.hostname) ===
            normalizedHostname(customHost)
        )
        .forEach((target) => pushUnique(targets, seen, target))
    }
    pushUnique(targets, seen, targetForHost(origin, customHost, port))
  } else {
    if (!preferReturned && currentTarget && !isLoopback(currentTarget.hostname)) {
      pushUnique(targets, seen, currentTarget)
    }
    networkTargets.forEach((target) => pushUnique(targets, seen, target))
    if (preferReturned && currentTarget && !isLoopback(currentTarget.hostname)) {
      pushUnique(targets, seen, currentTarget)
    }
  }

  return targets
}
