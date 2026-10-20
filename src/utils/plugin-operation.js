export const reasonLabels = {
  registry_module_invalid: "Registry 中的模块名不是有效的 Python 导入路径。",
  registry_plugin_invalid: "NoneBot 官方商店的自动加载测试未通过此插件，可能已过时或缺少配置。",
  registry_plugin_untested: "NoneBot 官方商店未测试此版本能否正常加载。",
  adapter_incompatible: "插件声明的适配器与当前启用适配器不匹配。",
  nonebot1_plugin: "该插件依赖 NoneBot 1，无法用于当前 NoneBot 2。",
  python_version_incompatible: "当前 Python 版本不在插件支持范围内。",
  nonebot2_version_incompatible: "插件要求的 NoneBot 2 版本与当前环境冲突。",
  pydantic_version_incompatible: "插件要求的 Pydantic 版本与当前环境冲突。",
  core_dependency_conflict: "安装会改变真寻核心依赖，已阻止操作。",
  third_party_dependency_conflict: "该插件与现有依赖约束冲突，未放宽或升级无关包。",
  plugin_dependency_invalid: "插件自身的依赖声明无法得到一致解。",
  dependency_layer_state_mismatch: "依赖层记录与实际安装内容不一致，请先核对活动代际，不会覆盖记录或升级无关包。",
  current_environment_dependency_conflict: "本次操作涉及的依赖存在实际冲突，请查看具体包和使用者。",
  orm_dependency_console_required: "会改变已安装的 ORM 或数据库驱动版本，请在控制台调整后重试；新增的 ORM 包可以直接安装。",
  environment_drift: "当前运行环境与 uv.lock 不一致，请先同步项目依赖。",
  interpreter_mismatch: "当前解释器与实例绑定的虚拟环境不一致，请从该环境通过 uv run zx run 启动。",
  project_dependency_conflict: "插件依赖超出真寻声明的兼容范围。",
  project_lock_stale: "pyproject.toml与uv.lock不一致，请先更新锁文件。",
  source_build_required: "缺少兼容 Wheel，需要确认源码构建并重启。",
  dependency_source_metadata_unavailable: "源码包需要执行构建才能读取依赖信息，允许源码构建后可重新分析。",
  dependency_source_build_failed: "依赖源码构建失败，本次操作未保存任何改动。请安装编译工具或改用提供 Wheel 的版本后重试。",
  dependency_requirement_unsupported: "依赖需要 pip、uv 等安装工具，只能在控制台安装。",
  dependency_source_hash_mismatch: "源码归档与索引声明的校验值不一致，请检查包源后重新分析。",
  dependency_resolution_failed: "依赖求解失败，无法生成一致的安装方案。",
  dependency_restore_failed: "备份中的依赖及其相近版本都无法安装，可勾选“依赖无法安装时跳过对应插件继续恢复”后重试。",
  dependency_network: "无法连接依赖索引，请检查网络与代理后重新分析。",
  dependency_proxy_auth: "代理认证失败，请检查代理凭据后重新分析。",
  dependency_index_auth: "依赖索引认证失败，请检查索引访问权限。",
  dependency_tls: "依赖索引 TLS 校验失败，请检查证书与代理设置。",
  dependency_python: "依赖不支持当前 Python 版本。",
  dependency_disk_full: "依赖解析所需磁盘空间不足。",
  dependency_resolver_configuration: "依赖解析器参数配置异常，未执行版本放宽。",
  external_install_not_managed: "同名包在 WebUI 之外安装，不能自动接管。",
  dependency_repair_requires_launcher: "需通过 launcher（uv run zx）启动后才能准备依赖。",
  plugin_not_managed: "该插件不由 WebUI 管理。",
  plugin_configuration_required: "插件缺少启动所需配置，本次安装未生效。请在 系统设置 → 配置中心 → 环境配置 中填写并保存，重启生效后重新安装。",
  plugin_configuration_invalid: "插件启动配置无效，本次安装未生效。请在 系统设置 → 配置中心 → 环境配置 中修正并保存，重启生效后重新安装。",
  plugin_import_failed: "插件导入失败，请查看事务与回滚状态。",
  plugin_startup_verification_failed: "插件未通过启动验证，请查看回滚结果。",
  worker_startup_failed: "依赖生效后 Bot 未能完成启动，已自动回滚依赖层，请查看本地日志中的启动错误。",
  nonebot_plugin_apply_failed: "插件应用失败，请查看具体阶段和事务状态。",
  external_database_manual_migration_required: "外部数据库未完成迁移，请停止实例并备份，使用页面提供的候选环境控制台命令处理后重启。",
  database_migration_failed: "数据库迁移失败，请查看数据库回滚结果。",
  plugin_operation_in_progress: "已有插件操作正在进行，请等待完成后重试。",
  dependency_transaction_pending: "已有依赖事务等待处理，请先重启或撤销后再操作。",
  catalog_source_missing: "目录中的插件路径已失效，请等待目录维护者修复。",
  plugin_reload_failed: "插件热重载失败，请查看运行日志。",
  plugin_store_key_required: "缺少插件商店标识，无法定位插件。",
  plugin_operation_input_changed: "同一操作编号的请求内容已变化，请刷新后重试。",
  plugin_operation_not_found: "未找到该插件操作记录。",
  plugin_transaction_not_mutable: "待重启事务已失败或正在处理，请先清除记录后再操作。",
  plugin_transaction_not_cancelable: "该事务当前不能撤销。",
  plugin_transaction_operation_not_found: "待重启事务中没有该操作。",
  nonebot_transaction_not_cancelable: "该事务正在构建或验证，当前不能撤销。",
  nonebot_transaction_operation_not_found: "待重启事务中没有该操作。",
  nonebot_transaction_not_found: "没有待处理的 NoneBot 插件事务。",
  nonebot_transaction_cancel_failed: "撤销 NoneBot 插件事务失败，请查看运行日志。",
}

export function reasonText(code) {
  const value = String(code || "")
  if (reasonLabels[value]) return reasonLabels[value]
  const index = value.lastIndexOf(": ")
  if (index >= 0 && reasonLabels[value.slice(index + 2)]) return `${value.slice(0, index)}：${reasonLabels[value.slice(index + 2)]}`
  return value
}

export function newOperationId() {
  const bytes = new Uint8Array(16)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
}

export function rememberPluginOperation(operationId, action, pluginName, store) {
  sessionStorage.setItem("zhenxun_plugin_operation", JSON.stringify({ operationId, action, pluginName, store }))
}

export function storeOperationResult(response, fallback, action) {
  const data = response.data || {}
  const mode = data.apply_mode
  const reasons = data.reason_codes || []
  const staged = reasons.includes("plugin_dependencies_changed")
    ? "插件及依赖变更已暂存，依赖将在重启时安装。"
    : reasons.some((item) => String(item).includes("orm_model"))
      ? "插件包含数据库模型，变更已暂存，重启完成模型注册后生效。"
      : "插件变更已暂存，重启后应用。"
  const labels = {
    hot_reloaded: data.unchanged ? "" : action === "remove" ? "已卸载并清理运行时资源。" : "运行时已热加载，无需重启。",
    restart_requested: "已请求受控重启，重启完成后生效。",
    restart_pending: data.restart_available ? staged : `${staged} 当前不是 launcher 托管模式，请手动重启。`,
    failed: data.rolled_back ? "运行时应用失败，插件文件已自动恢复。" : "运行时应用失败，请查看运行状态。",
  }
  return {
    status: mode === "failed" ? "error" : mode === "restart_pending" ? "pending" : "success",
    message: [fallback, labels[mode]].filter(Boolean).join("\n"),
    applyMode: mode,
    restartAvailable: Boolean(data.restart_available),
    accessUrls: data.access_urls || [],
    accessTargets: data.access_targets || [],
  }
}

export function pluginOperationResult(entry, restartAvailable = false, store = "nonebot") {
  const result = entry.result || {}
  const mode = result.apply_mode
  const pending = mode === 'restart_pending'
  const manualMigration = pending && (result.transaction_state === 'migration_blocked' || result.reason === 'external_database_manual_migration_required')
  const recovery = mode === 'recovery_required' || entry.status === 'recovery_required'
  const failed = mode === 'failed' || ['failed', 'interrupted'].includes(entry.status)
  const canceled = (result.reason_codes || []).includes('transaction_canceled') || result.reason === 'transaction_canceled'
  const applied = !recovery && !failed && (canceled || ['applied', 'hot_reloaded', 'no_change'].includes(mode))
  const rolledBack = mode === 'rolled_back'
  const pendingMessage = store === 'zhenxun' ? '插件变更已暂存，重启后应用。' : '依赖已准备，重启验证后生效。'
  let message = canceled ? '待应用的插件变更已相互抵消，当前运行版本保持不变。' : pending ? pendingMessage : applied ? '插件变更已经生效。' : rolledBack ? '本次操作已回滚，原环境已恢复。' : recovery ? '回滚尚未确认，请保留事务记录并处理诊断。' : failed ? '操作未完成，请查看失败阶段和诊断。' : '操作结果待确认，正在继续查询原任务。'
  if (manualMigration) message = '外部数据库需要手工迁移，当前运行版本未切换。完成数据库迁移后再重启验证。'
  if (applied && result.remaining_conflicts?.length) message = `所选修复已生效；仍有 ${result.remaining_conflicts.length} 项依赖问题待处理。`
  if (result.cleanup_error && applied) message += ' 清理待重试，不影响已确认的生效结果。'
  if (result.diagnostic) message += `\n${result.diagnostic}`
  return {
    status: applied ? 'success' : pending ? 'pending' : 'error',
    title: manualMigration ? '等待手工数据库迁移' : pending ? '插件事务等待重启' : canceled ? '插件变更已抵消' : applied ? '插件操作完成' : rolledBack ? '插件操作已回滚' : recovery ? '事务需要恢复处理' : failed ? '插件操作未完成' : '操作结果待确认',
    message, applyMode: mode || 'unknown',
    restartAvailable: pending && !manualMigration && (result.restart_available ?? restartAvailable),
    accessUrls: result.access_urls || [], accessTargets: result.access_targets || [],
  }
}
