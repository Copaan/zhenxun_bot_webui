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

/**
 * 筛选全部最终模型都适合指定任务的路由组
 * @param {Array<{name: string, targets: Array<{value: string}>}>} rows 路由组草稿
 * @param {Set<string>} suitableModels 适合该任务的模型全名
 * @returns {string[]} 适用的路由组名称
 */
export function routingGroupsForModels(rows, suitableModels) {
  const groups = new Map(rows.map(row => [row.name.trim(), row.targets.map(target => target.value.trim())]).filter(([name]) => name))
  const fits = (name, visiting) => {
    if (visiting.has(name)) return false
    const next = new Set(visiting).add(name)
    const targets = groups.get(name)
    return targets.length > 0 && targets.every(value => groups.has(value) ? fits(value, next) : suitableModels.has(value))
  }
  return [...groups.keys()].filter(name => fits(name, new Set()))
}
