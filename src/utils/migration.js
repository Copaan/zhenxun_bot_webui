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

export async function migrationRequest(path, { method = "get", data, signal, params } = {}) {
  const url = `${getBaseUrl()}/zhenxun/api/migration${path}`
  if (bootstrapSession && new URL(url, window.location.href).origin !== window.location.origin) throw new Error("迁移临时会话仅限当前实例入口")
  const response = await axios({
    url,
    method, data, signal, params, suppressErrorToast: true, authFailureMode: "local",
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
