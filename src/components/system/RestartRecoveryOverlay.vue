<template>
  <div v-if="visible" class="restart-recovery" role="status" aria-live="polite">
    <i v-if="!timedOut && !manualRequired" class="el-icon-loading"></i>
    <i v-else class="el-icon-warning-outline warning"></i>
    <h2>{{ expired ? "恢复会话已过期" : manualRequired ? "请手动打开目标入口" : timedOut ? "自动连接等待超时" : "正在重启真寻" }}</h2>
    <p>{{ timedOut ? "服务可能仍在启动，可以重新检测或手动打开下列地址。" : state.message }}</p>
    <p v-if="insecureTargets">当前 HTTPS 页面无法安全探测 HTTP 入口，请手动打开目标地址并重新登录。</p>
    <div v-if="insecureTargets" class="restart-actions">
      <el-button v-for="url in httpTargets" :key="url" type="warning" icon="el-icon-link" @click="finish(url, true)">打开 {{ url }} 并重新登录</el-button>
    </div>
    <div v-if="timedOut && !manualRequired" class="restart-actions">
      <el-button v-if="!expired" type="primary" @click="retry">重新检测</el-button>
      <el-button @click="dismiss">关闭等待页</el-button>
    </div>
    <div v-if="timedOut || manualRequired" class="restart-addresses">
      <a v-for="url in state.accessUrls" :key="url" :href="recoveryHref(url)" @click.prevent="finish(url, true)" @auxclick.prevent="finish(url, true)">{{ url }}</a>
    </div>
  </div>
</template>

<script>
import {
  clearRestartRecovery,
  RESTART_RECOVERY_EVENT,
  restartRecoveryState,
  recoveryProbeTargets,
  recoverySessionIsCurrent,
  recoveryStatusMatches,
} from "@/utils/restart-recovery"
import { clearAuthenticationState } from "@/utils/auth-session"
import statusWebSocket from "@/utils/websocket/status-websocket"
import logWebSocket from "@/utils/websocket/log-websocket"
import chatWebSocket from "@/utils/websocket/chat-websocket"

const REQUEST_TIMEOUT = 3000

export default {
  name: "RestartRecoveryOverlay",
  data() {
    return { visible: false, timedOut: false, expired: false, state: { accessUrls: [], returnRoute: "/dashboard", message: "" }, runId: 0 }
  },
  mounted() {
    window.addEventListener(RESTART_RECOVERY_EVENT, this.handleStart)
    const saved = restartRecoveryState()
    if (saved) this.begin(saved)
  },
  computed: {
    insecureTargets() { return window.location.protocol === "https:" && this.state.accessUrls.some(url => new URL(url).protocol === "http:") },
    httpTargets() { return this.state.accessUrls.filter(url => new URL(url).protocol === "http:") },
    manualRequired() { return !recoveryProbeTargets(this.state).length },
  },
  beforeDestroy() {
    window.removeEventListener(RESTART_RECOVERY_EVENT, this.handleStart)
    this.stopPolling()
  },
  methods: {
    recoveryHref(baseUrl) {
      const returnRoute = this.state.returnRoute.startsWith("/") ? this.state.returnRoute : `/${this.state.returnRoute}`
      return `${baseUrl}/#/?reauth=1&redirect=${encodeURIComponent(returnRoute)}`
    },
    handleStart(event) { this.begin(event.detail) },
    begin(state) {
      this.stopPolling()
      this.state = state
      this.visible = true
      this.timedOut = false
      this.expired = false
      ;[statusWebSocket, logWebSocket, chatWebSocket].forEach(socket => socket.closeWebSocket())
      this.poll(this.runId)
    },
    stopPolling() {
      this.runId += 1
      this._statusController?.abort()
      window.clearTimeout(this._pollTimer)
      if (this._pollResolve) this._pollResolve()
      this._pollResolve = null
    },
    waitForPoll() {
      return new Promise(resolve => {
        this._pollResolve = resolve
        this._pollTimer = window.setTimeout(() => {
          this._pollResolve = null
          resolve()
        }, 1500)
      })
    },
    async readStatus(baseUrl) {
      if (!recoveryProbeTargets(this.state).includes(baseUrl)) return null
      const controller = new AbortController()
      this._statusController = controller
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
      try {
        const url = new URL("/zhenxun/api/configure/status", baseUrl)
        url.searchParams.set("_", String(Date.now()))
        const response = await fetch(url.toString(), {
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
        })
        return response.ok ? await response.json() : null
      } finally {
        window.clearTimeout(timeout)
        if (this._statusController === controller) this._statusController = null
      }
    },
    finish(baseUrl, manual = false) {
      if (!this.state.accessUrls.includes(baseUrl)) return
      const returnRoute = this.state.returnRoute.startsWith("/")
        ? this.state.returnRoute
        : `/${this.state.returnRoute}`
      const destination = new URL(baseUrl)
      const sameOrigin = destination.origin === window.location.origin
      destination.pathname = "/"
      destination.hash = sameOrigin && !manual
        ? returnRoute
        : `/?reauth=1&redirect=${encodeURIComponent(returnRoute)}`
      const target = destination.toString()
      this.stopPolling()
      this.visible = false
      clearRestartRecovery()
      if (this.state.setup) {
        window.sessionStorage.removeItem("zhenxunSetupToken")
        window.sessionStorage.removeItem("zhenxunSetupRestartReceipt")
        window.sessionStorage.removeItem("zhenxunSetupRestartTargets")
      }
      if (sameOrigin && !manual) {
        window.history.replaceState(null, "", `/#${returnRoute}`)
        window.location.reload()
        return
      }
      clearAuthenticationState()
      window.location.replace(target)
    },
    async poll(runId) {
      if (!recoveryProbeTargets(this.state).length) return
      for (let attempt = 0; attempt < 80 && runId === this.runId; attempt += 1) {
        await this.waitForPoll()
        if (runId !== this.runId) return
        if (!recoverySessionIsCurrent(this.state)) {
          this.expired = true
          this.timedOut = true
          return
        }
        const targets = recoveryProbeTargets(this.state)
        const candidates = attempt < 8 ? targets.slice(0, 1) : targets
        for (const baseUrl of candidates) {
          try {
            const payload = await this.readStatus(baseUrl)
            if (runId !== this.runId) return
            if (!recoverySessionIsCurrent(this.state)) {
              this.expired = true
              this.timedOut = true
              return
            }
            if (!recoveryStatusMatches(this.state, payload)) continue
            this.finish(baseUrl)
            return
          } catch (error) {
            // Connection failures are expected while launcher replaces the worker.
          }
        }
      }
      if (runId === this.runId) this.timedOut = true
    },
    retry() {
      if (!recoverySessionIsCurrent(this.state)) {
        this.expired = true
        return
      }
      this.stopPolling()
      this.timedOut = false
      this.poll(this.runId)
    },
    dismiss() {
      if (this.manualRequired) return
      this.stopPolling()
      this.visible = false
      clearRestartRecovery({ resumeNetwork: true })
    },
  },
}
</script>

<style scoped>
.restart-recovery { position: fixed; inset: 0; z-index: 6000; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px; padding: 24px; color: #30333a; background: rgba(250, 251, 253, .98); text-align: center; }
.restart-recovery > i { color: #c74e80; font-size: 42px; }.restart-recovery > i.warning { color: #c59027; }.restart-recovery h2, .restart-recovery p { margin: 0; }.restart-recovery p { color: #747984; line-height: 1.6; }.restart-actions { display: flex; gap: 8px; margin-top: 8px; }.restart-addresses { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }.restart-addresses a { color: #b63d70; overflow-wrap: anywhere; }
.restart-recovery { overflow-y: auto; }.restart-actions { flex-wrap: wrap; justify-content: center; max-width: 100%; }.restart-actions .el-button { max-width: 100%; margin: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.5; }
</style>
