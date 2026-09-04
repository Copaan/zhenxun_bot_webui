<template>
  <div v-if="visible" class="restart-recovery" role="status" aria-live="polite">
    <i v-if="!timedOut" class="el-icon-loading"></i>
    <i v-else class="el-icon-warning-outline warning"></i>
    <h2>{{ timedOut ? "自动连接等待超时" : "正在重启真寻" }}</h2>
    <p>{{ timedOut ? "服务可能仍在启动，可以重新检测或手动打开下列地址。" : state.message }}</p>
    <div v-if="timedOut" class="restart-actions">
      <el-button type="primary" @click="retry">重新检测</el-button>
      <el-button @click="dismiss">关闭等待页</el-button>
    </div>
    <div v-if="timedOut" class="restart-addresses">
      <a v-for="url in state.accessUrls" :key="url" :href="recoveryHref(url)">{{ url }}</a>
    </div>
  </div>
</template>

<script>
import {
  clearRestartRecovery,
  RESTART_RECOVERY_EVENT,
  restartRecoveryState,
} from "@/utils/restart-recovery"
import { clearAuthenticationState } from "@/utils/auth-session"

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration))
const REQUEST_TIMEOUT = 3000

export default {
  name: "RestartRecoveryOverlay",
  data() {
    return { visible: false, timedOut: false, state: { accessUrls: [], returnRoute: "/dashboard", message: "" }, runId: 0 }
  },
  mounted() {
    window.addEventListener(RESTART_RECOVERY_EVENT, this.handleStart)
    const saved = restartRecoveryState()
    if (saved) this.begin(saved)
  },
  beforeDestroy() {
    window.removeEventListener(RESTART_RECOVERY_EVENT, this.handleStart)
    this.runId += 1
  },
  methods: {
    recoveryHref(baseUrl) {
      const returnRoute = this.state.returnRoute.startsWith("/") ? this.state.returnRoute : `/${this.state.returnRoute}`
      if (new URL(baseUrl).origin === window.location.origin) return `${baseUrl}/#${returnRoute}`
      return `${baseUrl}/#/?reauth=1&redirect=${encodeURIComponent(returnRoute)}`
    },
    handleStart(event) { this.begin(event.detail) },
    begin(state) {
      this.state = state
      this.visible = true
      this.timedOut = false
      this.runId += 1
      this.poll(this.runId)
    },
    async readStatus(baseUrl) {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
      try {
        const url = new URL("/zhenxun/api/configure/status", baseUrl)
        url.searchParams.set("_", String(Date.now()))
        const response = await fetch(url.toString(), {
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
        })
        return response.ok ? response.json() : null
      } finally {
        window.clearTimeout(timeout)
      }
    },
    finish(baseUrl) {
      const returnRoute = this.state.returnRoute.startsWith("/")
        ? this.state.returnRoute
        : `/${this.state.returnRoute}`
      const destination = new URL(baseUrl)
      const sameOrigin = destination.origin === window.location.origin
      destination.pathname = "/"
      destination.hash = sameOrigin
        ? returnRoute
        : `/?reauth=1&redirect=${encodeURIComponent(returnRoute)}`
      const target = destination.toString()
      this.runId += 1
      this.visible = false
      clearRestartRecovery()
      if (this.state.setup) {
        window.sessionStorage.removeItem("zhenxunSetupToken")
        window.sessionStorage.removeItem("zhenxunSetupRestartReceipt")
        window.sessionStorage.removeItem("zhenxunSetupRestartTargets")
      }
      if (sameOrigin) {
        window.history.replaceState(null, "", `/#${returnRoute}`)
        window.location.reload()
        return
      }
      clearAuthenticationState()
      window.location.replace(target)
    },
    async poll(runId) {
      for (let attempt = 0; attempt < 80 && runId === this.runId; attempt += 1) {
        await wait(1500)
        const preferred = this.state.preferredOrigin || this.state.accessUrls[0]
        const fallback = this.state.fallbackUrls || []
        const candidates = attempt < 8 ? [preferred] : [preferred, ...fallback]
        for (const baseUrl of candidates.filter(Boolean)) {
          try {
            const payload = await this.readStatus(baseUrl)
            const bootId = payload && payload.data && payload.data.boot_id
            if (!bootId || bootId === this.state.bootId) continue
            if (payload.data.transaction_verification_pending) continue
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
      this.timedOut = false
      this.runId += 1
      this.poll(this.runId)
    },
    dismiss() {
      this.runId += 1
      this.visible = false
      clearRestartRecovery()
    },
  },
}
</script>

<style scoped>
.restart-recovery { position: fixed; inset: 0; z-index: 6000; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px; padding: 24px; color: #30333a; background: rgba(250, 251, 253, .98); text-align: center; }
.restart-recovery > i { color: #c74e80; font-size: 42px; }.restart-recovery > i.warning { color: #c59027; }.restart-recovery h2, .restart-recovery p { margin: 0; }.restart-recovery p { color: #747984; line-height: 1.6; }.restart-actions { display: flex; gap: 8px; margin-top: 8px; }.restart-addresses { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }.restart-addresses a { color: #b63d70; overflow-wrap: anywhere; }
</style>
