// Only remove ancestors made empty by this deletion; keep unrelated draft errors.
export function removeRoutingGroup(rows, defaults, name) {
  const removed = new Set([name])
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (removed.has(row.name.trim()) || !row.targets.length) continue
      if (row.targets.every(target => removed.has(target.value))) {
        removed.add(row.name.trim()); changed = true
      }
    }
  }
  const affected = rows.filter(row => !removed.has(row.name.trim()) && row.targets.some(target => removed.has(target.value))).map(row => row.name)
  const tasks = Object.entries(defaults).filter(([, target]) => removed.has(target)).map(([task]) => task)
  return {
    removed: [...removed], affected, tasks,
    rows: rows.filter(row => !removed.has(row.name.trim())).map(row => ({ ...row, targets: row.targets.filter(target => !removed.has(target.value)) })),
  }
}
