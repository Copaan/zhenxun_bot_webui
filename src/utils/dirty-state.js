const dirtySources = new Map()

const currentRoute = () => (window.location.hash.startsWith("#/")
  ? window.location.hash.slice(1).split("?")[0]
  : window.location.pathname)

export const setDirtyState = (source, dirty, route = currentRoute()) => {
  if (dirty) dirtySources.set(source, { route: dirtySources.get(source)?.route || route })
  else dirtySources.delete(source)
}

export const clearDirtyState = (source) => {
  dirtySources.delete(source)
}

export const clearAllDirtyStates = () => {
  dirtySources.clear()
}

export const clearDirtyStatesFor = (route) => {
  for (const [source, state] of dirtySources.entries()) {
    if (state.route === route) dirtySources.delete(source)
  }
}

export const hasDirtyState = (route = null) => {
  if (!route) return dirtySources.size > 0
  return [...dirtySources.values()].some((state) => state.route === route)
}

window.addEventListener("beforeunload", (event) => {
  if (!hasDirtyState()) return
  event.preventDefault()
  event.returnValue = ""
})
