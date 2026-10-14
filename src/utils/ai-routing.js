// Only remove ancestors made empty by this deletion; keep unrelated draft errors.
export function removeRoutingGroup(rows, defaults, clientId) {
  const removedIds = new Set([clientId])
  const removedNames = () => {
    const kept = new Set(rows.filter(row => !removedIds.has(row.clientId)).map(row => row.name.trim()))
    return new Set(rows.filter(row => removedIds.has(row.clientId)).map(row => row.name.trim()).filter(name => name && !kept.has(name)))
  }
  let changed = true
  while (changed) {
    changed = false
    const names = removedNames()
    for (const row of rows) {
      if (removedIds.has(row.clientId) || !row.targets.length) continue
      if (row.targets.every(target => names.has(target.value))) {
        removedIds.add(row.clientId); changed = true
      }
    }
  }
  const names = removedNames()
  const kept = rows.filter(row => !removedIds.has(row.clientId))
  return {
    removed: rows.filter(row => removedIds.has(row.clientId)).map(row => row.name.trim() || "未命名路由组"),
    affected: kept.filter(row => row.targets.some(target => names.has(target.value))).map(row => row.name),
    tasks: Object.entries(defaults).filter(([, target]) => names.has(target)).map(([task]) => task),
    rows: kept.map(row => ({ ...row, targets: row.targets.filter(target => !names.has(target.value)) })),
  }
}
