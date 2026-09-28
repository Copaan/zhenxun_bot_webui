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
  global_privileges: '存在不支持的全局权限', global_grantable: '存在全局可转授权', process_privilege_missing: '缺少 PROCESS', role_inheritance: '存在角色继承',
  schema_scope: '库级授权范围或转授权不符合要求', table_privileges_grants: '存在表级授权', column_privileges_grants: '存在列级授权',
  schema_usage_missing: '缺少 public schema USAGE', table_or_sequence_select_missing: '缺少表或序列 SELECT',
  schema_restore_privileges_missing: '缺少库级恢复权限', public_schema_restore_privileges_missing: '缺少 public schema 恢复权限',
  other_account_can_connect: '另一账号仍可连接本数据库（包含 PUBLIC CONNECT）',
  same_account_or_database: '目标与候选账号或数据库未隔离', same_database: '目标与候选指向同一实际数据库',
}

export function migrationPermissionSummary(diagnostic = {}) {
  const missing = diagnostic.missing_restore_privileges || []
  const reasons = [...new Set([...(diagnostic.privilege_reasons || []), ...Object.keys(diagnostic.permission_checks || {}).filter(key => diagnostic.permission_checks[key] > 0), ...(diagnostic.restore_privilege_reasons || []), ...(diagnostic.isolation_reasons || [])])]
  return [missing.length ? `缺少恢复权限：${missing.join('、')}` : '', ...reasons.map(reason => permissionLabels[reason] || reason)].filter(Boolean).join('；')
}

export function migrationPermissionDetails(diagnostic = {}) {
  const rows = Object.entries(diagnostic.permission_checks || {}).map(([key, value]) => ({ key, label: permissionLabels[key] || key, value: value == null ? '未检查' : value }))
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
  const permissionReasons = migrationPermissionSummary(database)
  const reason = database.operation === 'filesystem'
    ? 'SQLite 文件或目录未通过恢复条件检查，请查看具体错误；这不是数据库账号权限错误'
    : code.startsWith('migration_database_')
    ? ['migration_database_privileges_unsupported', 'migration_database_candidate_isolation_required', 'migration_database_read_permission_denied', 'migration_database_privilege_scope_wildcard'].includes(code)
      ? `数据库账号权限不符合迁移要求${permissionReasons ? `：${permissionReasons}` : ''}`
      : `数据库迁移失败${database.tool ? `（${database.tool}）` : ''}，请查看工具详情`
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
