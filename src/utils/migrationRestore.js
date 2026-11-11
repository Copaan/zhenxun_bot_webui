export const restoreModes = [
  { value: "empty", label: "空库导入", hint: "目标没有业务数据时直接导入；非空会停止，不自动清空。" },
  { value: "replace_database", label: "完全替换", hint: "清空目标数据库的用户对象和数据，再按迁移包恢复。" },
  { value: "replace_tables", label: "仅替换包内表", hint: "包内表恢复到备份状态，删除这些表的额外记录，保留包外表。" },
  { value: "merge_upsert", label: "增量替换", hint: "按业务标识匹配，冲突采用备份值，新增缺少的数据，保留目标额外记录。" },
  { value: "merge_skip", label: "增量跳过", hint: "按业务标识匹配，冲突保留目标值，只新增缺少的数据。" },
]

export const nativeRecoveryHint = "MySQL/PostgreSQL 覆盖失败时，会在停机维护阶段用覆盖前的完整备份自动恢复原数据。"

export function restoreModeHint(mode) {
  return restoreModes.find(item => item.value === mode)?.hint || "沿用原任务的恢复方式。"
}

export function restoreOptions(mode, backup, tables, source) {
  return {
    restore_mode: mode, backup_before_replace: backup,
    included_tables: tables === null ? null : [...tables].sort(),
    source_binding: source.trim() || null,
  }
}

export function restoreDatabasePhase(task) {
  if (task.state !== "importing") return ""
  if (task.target_backup_status === "creating") return "备份目标数据库"
  if (task.target_mutation_state === "clearing") return "清空目标数据库"
  return ""
}

export const restorePreparationLabels = {
  waiting_credentials: "等待补充备份包密码", orm_check: "核对 ORM 状态（只读）",
  checking: "校验备份和目标", dependencies: "解析目标平台依赖", building: "构建候选",
  rechecking: "切换前复核", switching: "准备切换", waiting_confirmation: "等待确认影响变化",
  blocked: "准备未完成，原实例未变更", interrupted: "准备已暂停", cleanup_pending: "候选清理待重试",
  target_backup: "备份目标数据库", clearing: "清空目标数据库", importing: "导入数据",
}

export const restoreStateLabels = {
  preparing: "准备中", pending: "等待停写", snapshot_ready: "快照已保存", applying: "应用依赖与文件",
  awaiting_orm: "等待控制台处理插件数据库", importing: "导入中", verifying: "启动验证中",
  committing: "提交结算中", failed_import: "准备回滚", rollback_import: "回滚中",
  rollback_target: "目标数据库回退中", rollback_verifying: "回滚验证中", done: "恢复完成",
  done_partial: "部分恢复完成", rolled_back: "失败且已确认回滚", failed: "准备失败",
  recovery_required: "结果待核验", canceled: "已取消", target_backup: "备份目标数据库", clearing: "清空目标数据库",
}
