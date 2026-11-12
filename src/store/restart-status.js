import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import { businessNetworkEpoch, isBusinessNetworkFrozen } from "@/utils/restart-network"

const emptySnapshot = () => ({ launcher_managed: false, pending_restart: false, pending_count: 0, pending_items: [], pending_reasons: [], change_items: [], reconciliation_pending: false })
let sequence = 0
let flight = null
let controller = null
const VERIFICATION_TIMEOUT = 120000
const REQUEST_TIMEOUT = 15000

export function restartChangeText(item) {
  const labels = { preparing: "正在准备", applying: "正在应用", verifying: "正在确认生效结果", attention_required: "需要处理", recovery_required: "需要恢复处理", unknown: "结果待核验", restart_pending: "等待重启", applied: "已生效", rolled_back: "已回滚", cleanup_pending: "已生效，清理待重试" }
  const reason = String(item.reason || "")
  if (reason.startsWith("environment_overridden:")) return `配置 ${reason.slice("environment_overridden:".length)} 被进程环境变量覆盖，请处理覆盖来源；重复重启不会改变结果。`
  if (reason === "external_database_manual_migration_required") return "等待手工数据库迁移，处理完成后再重启验证。"
  if (reason.startsWith("configuration_component_failed:")) return `相关组件 ${reason.split(":").slice(1).join(":")} 未就绪，请查看启动诊断。`
  if (reason.startsWith("configuration_plugin_unavailable:")) return "相关插件尚未完成初始化，请查看启动诊断。"
  if (reason === "configuration_target_changed") return "配置在提交后发生变化，请重新核对目标配置。"
  return labels[item.state] || "结果待核验"
}

export default {
  namespaced: true,
  state: () => ({ snapshot: emptySnapshot(), known: false, loading: false, workerBootId: "", verifyingSince: null }),
  getters: {
    message(state) {
      if (!state.known) return "重启状态暂不可确认，保留上次已知状态"
      const data = state.snapshot
      if (data.reconciliation_pending) return "正在确认生效结果，请勿重复提交应用"
      if (data.pending_count) return `有 ${data.pending_count} 项修改等待重启应用`
      const attention = (data.change_items || []).filter(item => ["attention_required", "recovery_required", "unknown"].includes(item.state))
      return attention.length ? `有 ${attention.length} 项变更需要处理，请查看更新与维护页面` : "重启真寻"
    },
  },
  mutations: {
    LOADING(state, value) { state.loading = value },
    RECEIVE(state, data) {
      state.snapshot = { ...emptySnapshot(), ...data }
      state.workerBootId = data.worker_boot_id || state.workerBootId
      state.verifyingSince = data.reconciliation_pending ? state.verifyingSince ?? Date.now() : null
      state.known = state.verifyingSince === null || Date.now() - state.verifyingSince < VERIFICATION_TIMEOUT
    },
    BOOT(state, value) { state.workerBootId = value; state.verifyingSince = null },
    RETRY(state) { state.verifyingSince = null },
    UNKNOWN(state) { state.known = false },
    RESET(state) { state.snapshot = emptySnapshot(); state.known = false; state.loading = false; state.workerBootId = ""; state.verifyingSince = null },
  },
  actions: {
    /** 中断进行中的读取，保留已知状态；页面转入后台时使用 */
    pause({ commit }) {
      sequence += 1
      controller?.abort()
      controller = null
      flight = null
      commit("LOADING", false)
    },
    invalidate({ commit }, reset = false) {
      sequence += 1
      controller?.abort()
      controller = null
      flight = null
      commit(reset ? "RESET" : "UNKNOWN")
      commit("LOADING", false)
    },
    refresh({ state, commit, dispatch }, { request, alive = () => true, bootId = "", force = false }) {
      if (!alive() || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return Promise.resolve()
      if (bootId && bootId !== state.workerBootId) { dispatch("invalidate"); commit("BOOT", bootId) }
      if (flight && !force) return flight
      if (force) { dispatch("invalidate"); commit("RETRY") }
      const id = ++sequence
      const expectedBoot = state.workerBootId
      const epoch = businessNetworkEpoch()
      const token = getAuthToken()
      const abort = new AbortController()
      controller = abort
      const current = () => id === sequence && alive() && !document.hidden && !isBusinessNetworkFrozen() && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken()
      commit("LOADING", true)
      flight = (async () => {
        let timer
        try {
          const response = await Promise.race([
            Promise.resolve().then(() => request({ signal: abort.signal, suppressErrorToast: true })),
            new Promise((resolve, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error("restart_status_timeout")) }, REQUEST_TIMEOUT) }),
          ])
          if (!current()) return
          const data = response?.data
          if (!response?.suc || !data || data.status_known === false || !Number.isInteger(data.pending_count) || data.pending_count < 0 || (expectedBoot && data.worker_boot_id !== expectedBoot)) throw new Error("restart_status_unavailable")
          commit("RECEIVE", data)
        } catch (error) {
          if (current()) commit("UNKNOWN")
        } finally {
          clearTimeout(timer)
          if (id === sequence) { flight = null; controller = null; commit("LOADING", false) }
        }
      })()
      return flight
    },
  },
}
