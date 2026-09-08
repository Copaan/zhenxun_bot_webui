let frozen = false
let epoch = 0
const listeners = new Set()

export const isBusinessNetworkFrozen = () => frozen
export const businessNetworkEpoch = () => epoch

export const onBusinessNetworkChange = (listener) => {
  listeners.add(listener)
  if (frozen) listener(true)
  return () => listeners.delete(listener)
}

const setFrozen = (value) => {
  if (frozen === value) return
  frozen = value
  epoch += 1
  for (const listener of listeners) {
    try { listener(frozen) } catch (error) {
      // One failed cleanup must not prevent the remaining requests from aborting.
      console.debug("Restart network cleanup failed", error)
    }
  }
}

export const freezeBusinessNetwork = () => setFrozen(true)
export const resumeBusinessNetwork = () => setFrozen(false)
