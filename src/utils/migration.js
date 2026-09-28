import axios from "axios"
import { sha256 } from "js-sha256"
import { getBaseUrl } from "./api"
import { getAuthToken, setAuthToken } from "./auth-token"

export const CHUNK_SIZE = 8 * 1024 * 1024
export const MAX_ARCHIVE_SIZE = 20 * 1024 * 1024 * 1024
let bootstrapSession = null

export function clearMigrationSession() { bootstrapSession = null }

export async function authorizeMigration(code) {
  const response = await migrationRequest("/bootstrap/session", { method: "post", data: { code } })
  bootstrapSession = `${response.token_type} ${response.access_token}`
}

export async function downloadMigration(identity) {
  if (!/^[a-f0-9]{32}$/.test(identity)) throw new Error("migration_task_invalid")
  const target = new URL(`${getBaseUrl()}/zhenxun/api/migration/tasks/${identity}/download`, window.location.href)
  if (target.origin !== window.location.origin) throw new Error("请在实例自己的管理入口登录后下载迁移包")
  const name = `instance-${identity}.zx`
  const file = window.showSaveFilePicker ? await window.showSaveFilePicker({ suggestedName: name }) : null
  const response = await fetch(target, { headers: { Authorization: getAuthToken() }, redirect: "error", credentials: "same-origin", cache: "no-store" })
  if (!response.ok) throw new Error((await response.json()).detail || "migration_download_failed")
  if (file) { await response.body.pipeTo(await file.createWritable()); return }
  const length = Number(response.headers.get("Content-Length"))
  if (!length || length > 256 * 1024 * 1024) { await response.body.cancel(); throw new Error("大文件下载需要支持流式保存的浏览器，请使用 Edge 或 Chrome") }
  const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a")
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000)
}

export function recoveryDatabase(requirements, username, password) {
  if (!requirements.credentials_required) return {}
  const { engine, target } = requirements
  if (!["mysql", "postgres"].includes(engine) || !target?.host || !target.database || !username) throw new Error("migration_database_credentials_required")
  const host = target.host.includes(":") ? `[${target.host}]` : target.host
  if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) throw new Error("migration_database_connection_invalid")
  return { target_url: `${engine}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${target.port}/${encodeURIComponent(target.database)}` }
}

export async function migrationRequest(path, { method = "get", data, signal, params, timeout } = {}) {
  const url = `${getBaseUrl()}/zhenxun/api/migration${path}`
  if (bootstrapSession && new URL(url, window.location.href).origin !== window.location.origin) throw new Error("迁移临时会话仅限当前实例入口")
  const response = await axios({
    url,
    method, data, signal, params, ...(timeout === undefined ? {} : { timeout }), suppressErrorToast: true, authFailureMode: "local",
    headers: { ...(data instanceof ArrayBuffer ? { "Content-Type": "application/octet-stream" } : {}), ...(bootstrapSession ? { "X-Migration-Session": bootstrapSession } : {}) },
  })
  if (!response?.suc) throw new Error(response?.info || "migration_request_failed")
  return response.data
}

export async function migrationLogin(username, password) {
  const url = new URL(`${getBaseUrl()}/zhenxun/api/login`, window.location.href)
  if (url.origin !== window.location.origin) throw new Error("请在目标实例自己的入口重新登录；不会跨来源发送凭据")
  const response = await axios({ url: url.href, method: "post", data: new URLSearchParams({ username, password }), authFailureMode: "local", suppressErrorToast: true })
  if (!response?.suc || !response.data?.access_token) throw new Error(response?.info || "migration_login_failed")
  setAuthToken(`${response.data.token_type} ${response.data.access_token}`)
  clearMigrationSession()
}

export async function uploadMigration(file, { uploadId, signal, onCreated, onProgress, request = migrationRequest } = {}) {
  if (!/\.zx$/i.test(file.name) || file.size <= 0 || file.size > MAX_ARCHIVE_SIZE) throw new Error("migration_archive_size_or_extension_invalid")
  const state = uploadId
    ? await request(`/uploads/${uploadId}`, { signal })
    : await request("/uploads", { method: "post", data: { total: file.size }, signal })
  if (state.total !== file.size) throw new Error("migration_upload_file_changed")
  onCreated?.(state.id)
  const hash = sha256.create()
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    if (signal?.aborted) throw new Error("migration_upload_paused")
    const data = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer()
    hash.update(data)
    if (state.stage !== "sealed") {
      // Replay confirmed chunks too: equal length is not proof of file identity.
      for (let attempt = 0; ; attempt += 1) {
        try {
          await request(`/uploads/${state.id}/chunks`, {
            method: "put", data, signal, params: { offset, sha256: sha256(data) },
          })
          break
        } catch (error) {
          if (signal?.aborted || attempt >= 1 || (error.response && error.response.status < 500)) throw error
        }
      }
    }
    onProgress?.(Math.floor(Math.min(offset + data.byteLength, file.size) / file.size * 100))
  }
  const digest = hash.hex()
  if (state.stage === "sealed") {
    if (state.sha256 !== digest) throw new Error("migration_upload_file_changed")
    return state
  }
  return request(`/uploads/${state.id}/seal`, { method: "post", data: { sha256: digest }, signal })
}

export const migrationStages = {
  queued: "等待执行", preflight: "预检中", awaiting_confirmation: "等待确认",
  preparing: "准备中", quiescing: "停止业务中", snapshotting: "创建快照中",
  resuming: "恢复原实例中", compressing: "压缩校验中", applying: "应用中",
  verifying: "维护验证中", committing: "正在提交", committed: "已提交，等待收尾",
  completed: "已完成", partial: "部分完成", rolling_back: "回滚中", rolled_back: "已回滚",
  awaiting_credentials: "等待重新授权", recovery_required: "恢复受阻",
  cancelled: "已取消", failed: "失败", needs_preflight: "目标已变化，需要重新预检",
}

export const terminalMigrationStages = new Set(["completed", "partial", "rolled_back", "cancelled", "failed", "needs_preflight"])

export const migrationDatabasePhases = {
  restore_preflight: '恢复前数据库预检', export_preflight: '导出前数据库预检',
  restore_prepare: '恢复准备', restore_apply: '恢复写入', restore_rollback: '恢复回滚',
  export_snapshot: '导出数据库快照',
}

const permissionLabels = {
  privileged_roles: '高权限角色', direct_role_memberships: '直接角色成员关系', other_database_create: '其他数据库 CREATE 权限',
  global_privileges: '存在不支持的全局权限', global_grantable: '存在全局可转授权', process_privilege_missing: '缺少 PROCESS，无法完整核验其他连接', role_inheritance: '存在角色继承',
  schema_scope: '库级授权范围或转授权不符合要求', table_privileges_grants: '存在表级授权', column_privileges_grants: '存在列级授权',
  object_inventory_unconfirmed: '无法确认完整对象清单', restore_privileges_missing: '缺少恢复所需权限',
  schema_usage_missing: '缺少 public schema USAGE', table_or_sequence_select_missing: '缺少表或序列 SELECT',
  schema_restore_privileges_missing: '缺少库级恢复权限', public_schema_restore_privileges_missing: '缺少 public schema 恢复权限',
  other_account_can_connect: '另一账号仍可连接本数据库（包含 PUBLIC CONNECT）',
  same_account_or_database: '目标与候选账号或数据库未隔离', same_database: '目标与候选指向同一实际数据库',
}

const legacyPermissionReasons = new Set(['privileged_roles', 'direct_role_memberships', 'other_database_create', 'global_privileges', 'global_grantable', 'role_inheritance', 'schema_scope', 'table_privileges_grants', 'column_privileges_grants', 'other_account_can_connect', 'same_account_or_database'])

export function migrationPermissionPolicy(diagnostic = {}) {
  const reasons = [...(diagnostic.privilege_reasons || []), ...(diagnostic.isolation_reasons || []), ...Object.keys(diagnostic.permission_checks || {}).filter(key => diagnostic.permission_checks[key] > 0)]
  if (!diagnostic.policy_version && reasons.some(key => legacyPermissionReasons.has(key))) return 'legacy'
  if (diagnostic.policy_version >= 2 || diagnostic.capability_checks || diagnostic.missing_restore_privileges?.length) return 'actual'
  return 'unknown'
}

export function migrationDatabaseErrorSummary(code, diagnostic = {}) {
  if (code === 'migration_database_tool_failed') return '数据库工具执行失败，请查看退出码和诊断详情'
  if (code === 'migration_database_preflight_stale') return '检查策略或运行实例已变化，请重新检测'
  if (code === 'migration_database_capability_unconfirmed') return '未能确认账号的有效操作能力，请重新检测并查看详情'
  if (code === 'migration_database_objects_unsupported') return '数据库包含当前迁移格式不支持的对象，请查看结构核验详情'
  if (!['migration_database_privileges_unsupported', 'migration_database_candidate_isolation_required', 'migration_database_read_permission_denied', 'migration_database_privilege_scope_wildcard'].includes(code)) return ''
  const policy = migrationPermissionPolicy(diagnostic)
  const detail = migrationPermissionSummary(diagnostic)
  if (policy === 'legacy') return `此结果使用旧权限规则，请核对后端版本并重新检测${detail ? `；原始拒绝项：${detail}` : ''}`
  if (code === 'migration_database_candidate_isolation_required' && policy === 'actual') return `目标与候选必须是两个不同的实际数据库，可使用同一账号${detail ? `：${detail}` : ''}`
  if (policy === 'unknown' && code !== 'migration_database_read_permission_denied') return `权限检查未通过，检查策略与实际能力状态未确认，请重新检测${detail ? `：${detail}` : ''}`
  return `账号缺少迁移所需的实际能力${detail ? `：${detail}` : ''}`
}

export function migrationConnectionMatches(result, capabilities) {
  return Boolean(result?.worker_generation && capabilities?.worker_generation &&
    result.worker_generation === capabilities.worker_generation &&
    result.policy_version >= 2 && result.policy_version === capabilities.database_policy_version)
}

export function migrationPermissionSummary(diagnostic = {}) {
  const missing = diagnostic.missing_restore_privileges || []
  const reasons = [...new Set([...(diagnostic.privilege_reasons || []), ...Object.keys(diagnostic.permission_checks || {}).filter(key => diagnostic.permission_checks[key] > 0), ...(diagnostic.restore_privilege_reasons || []), ...(diagnostic.isolation_reasons || [])])]
  return [missing.length ? `缺少恢复权限：${missing.join('、')}` : '', ...reasons.map(reason => permissionLabels[reason] || reason)].filter(Boolean).join('；')
}

export function migrationPermissionDetails(diagnostic = {}) {
  const rows = Object.entries(diagnostic.permission_checks || {}).map(([key, value]) => ({ key, label: permissionLabels[key] || key, value: value == null ? '未检查' : value }))
  const capabilityLabels = { connection_inventory: '其他连接完整可见', object_inventory: '对象清单完整可见', table_select: '表与序列读取权限', schema_usage: 'public schema 访问权限' }
  Object.entries(diagnostic.capability_checks || {}).filter(([key]) => capabilityLabels[key]).forEach(([key, value]) => rows.push({ key: `capability-${key}`, label: capabilityLabels[key], value: value === 1 ? '满足' : value === 0 ? '不满足' : '未检查' }))
  if (diagnostic.policy_version) rows.push({ key: 'policy-version', label: '能力检查策略', value: `v${diagnostic.policy_version}` })
  if (diagnostic.grant_sources?.length) {
    const sources = { global: '全局授权', database: '库级授权', table: '表级授权', enabled_role: '已启用角色', partial_revoke: '已计入部分撤权' }
    rows.push({ key: 'grant-sources', label: '授权来源', value: diagnostic.grant_sources.map(key => sources[key] || key).join('、') })
  }
  if (diagnostic.capability === 'restore' || diagnostic.restore_permission_checks) {
    const names = diagnostic.engine === 'mysql'
      ? { select: 'SELECT', create: 'CREATE', alter: 'ALTER', drop: 'DROP', index: 'INDEX', insert: 'INSERT', update: 'UPDATE', delete: 'DELETE', references: 'REFERENCES', lock_tables: 'LOCK TABLES' }
      : diagnostic.engine === 'postgres'
        ? { database_connect: '数据库 CONNECT', database_create: '数据库 CREATE', schema_usage: 'public USAGE', schema_create: 'public CREATE', schema_owner: 'public 所有者' } : {}
    const checks = diagnostic.restore_permission_checks || {}
    Object.entries(names).forEach(([key, label]) => rows.push({ key, label, value: checks[key] === 1 ? '满足' : checks[key] === 0 ? '不满足' : '未检查' }))
  }
  return rows
}

export function migrationFailureSummary(job) {
  const progress = job.progress || {}, shutdown = job.shutdown_diagnostic || {}
  const database = job.database_diagnostic || {}
  const code = job.first_error || ''
  const components = (shutdown.failed_components || []).slice(0, 3).map(item => item.component_id).join('、')
  const databaseReason = migrationDatabaseErrorSummary(code, database)
  const reason = database.operation === 'filesystem'
    ? 'SQLite 文件或目录未通过恢复条件检查，请查看具体错误；这不是数据库账号权限错误'
    : databaseReason ? databaseReason
    : code.startsWith('migration_database_')
    ? `数据库迁移失败${database.tool ? `（${database.tool}）` : ''}，请查看工具详情`
    : code === 'migration_shutdown_unconfirmed' ? `关闭未通过核验${components ? `：${components}` : ''}`
      : code.startsWith('migration_dependency_') || code === 'migration_dependencies_incomplete' ? '依赖恢复失败，请查看依赖结果' : '迁移执行失败，请查看任务首因'
  if (code && code === database.error_code && ['restore_preflight', 'export_preflight'].includes(database.phase)) {
    return `${migrationDatabasePhases[database.phase]}失败，未停止 Bot。${reason}。`
  }
  if (job.action !== 'export') return `${reason}。`
  return `${reason}。${shutdown.forced ? '曾强制停止；' : ''}${progress.snapshot_generated ? '快照已生成；' : '快照未确认生成；'}${progress.original_worker_resumed ? '原实例已恢复并就绪。' : '原实例恢复状态未确认。'}`
}

export function migrationPollDelay(jobs, disconnected = false) {
  return !disconnected && jobs.some(job => !terminalMigrationStages.has(job.stage) && !['recovery_required', 'awaiting_credentials', 'awaiting_confirmation'].includes(job.stage)) ? 1500 : 5000
}

export function migrationDiagnosticResult(diagnostic = {}) {
  if (diagnostic.operation === 'policy') return diagnostic.return_code === 0
    ? `权限查询工具执行成功；${diagnostic.error_code ? (migrationPermissionPolicy(diagnostic) === 'legacy' ? '旧权限规则拒绝操作，请核对后端版本并重新检测' : migrationPermissionPolicy(diagnostic) === 'actual' ? '实际能力检查未通过' : '权限检查未通过，策略状态未确认') : '能力检查完成'}`
    : '能力检查未通过；工具退出状态未确认'
  return diagnostic.error_code || (diagnostic.return_code === 0 ? '工具执行成功；结果仍须通过迁移校验' : '工具执行状态未确认')
}
