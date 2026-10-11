export function pluginOperationResult(entry, restartAvailable = false) {
  const result = entry.result || {}
  const mode = result.apply_mode
  const pending = mode === 'restart_pending'
  const manualMigration = pending && (result.transaction_state === 'migration_blocked' || result.reason === 'external_database_manual_migration_required')
  const recovery = mode === 'recovery_required' || entry.status === 'recovery_required'
  const failed = mode === 'failed' || ['failed', 'interrupted'].includes(entry.status)
  const applied = !recovery && !failed && ['applied', 'hot_reloaded', 'no_change'].includes(mode)
  const rolledBack = mode === 'rolled_back'
  let message = pending ? '依赖已准备，重启验证后生效。' : applied ? '插件与依赖变更已经通过验证。' : rolledBack ? '本次操作已回滚，原环境已恢复。' : recovery ? '回滚尚未确认，请保留事务记录并处理诊断。' : failed ? '操作未完成，请查看失败阶段和诊断。' : '操作结果待确认，正在继续查询原任务。'
  if (manualMigration) message = '外部数据库需要手工迁移，当前运行版本未切换。完成数据库迁移后再重启验证。'
  if (applied && result.remaining_conflicts?.length) message = `所选修复已生效；仍有 ${result.remaining_conflicts.length} 项依赖问题待处理。`
  if (result.cleanup_error && applied) message += ' 清理待重试，不影响已确认的生效结果。'
  if (result.diagnostic) message += `\n${result.diagnostic}`
  return {
    status: applied ? 'success' : pending ? 'pending' : 'error',
    title: manualMigration ? '等待手工数据库迁移' : pending ? '依赖事务等待重启' : applied ? '插件操作完成' : rolledBack ? '插件操作已回滚' : recovery ? '事务需要恢复处理' : failed ? '插件操作未完成' : '操作结果待确认',
    message, applyMode: mode || 'unknown',
    restartAvailable: pending && !manualMigration && (result.restart_available ?? restartAvailable),
    accessUrls: result.access_urls || [], accessTargets: result.access_targets || [],
  }
}
