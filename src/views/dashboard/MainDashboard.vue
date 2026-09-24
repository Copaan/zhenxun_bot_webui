<template>
  <div class="runtime-page">
    <section class="runtime-hero" :class="`is-${overallStatus}`">
      <div>
        <div class="eyebrow">运行概览</div>
        <h1>{{ overallTitle }}</h1>
        <p>{{ overallDescription }}</p>
      </div>
      <div class="hero-actions">
        <span v-if="overview" class="muted">{{ updatedAt }}</span>
        <el-button
          icon="el-icon-refresh"
          :loading="refreshing"
          @click="loadOverview(true)"
        >重新检查</el-button>
      </div>
    </section>

    <div v-if="loadError" class="inline-error" role="alert">
      <i class="el-icon-warning-outline"></i>
      <span>{{ loadError }}</span>
      <button type="button" @click="loadOverview(true)">重试</button>
    </div>

    <section v-if="overview" class="service-strip" aria-label="核心服务状态">
      <div v-for="service in services" :key="service.key" class="service-item">
        <span class="status-dot" :class="`is-${service.status}`"></span>
        <div>
          <strong>{{ service.label }}</strong>
          <small>{{ service.detail }}</small>
        </div>
        <span v-if="service.meta" class="muted">{{ service.meta }}</span>
      </div>
    </section>

    <section v-if="overview" class="page-section">
      <div class="section-heading">
        <div><span class="eyebrow">待处理</span><h2>{{ issueTitle }}</h2></div>
        <span class="count-badge">{{ overview.issues.length }}</span>
      </div>
      <div v-if="overview.issues.length" class="issue-list">
        <article
          v-for="issue in overview.issues"
          :key="issue.code"
          class="issue-row"
          :class="`is-${issue.severity}`"
        >
          <i :class="issue.severity === 'critical' ? 'el-icon-circle-close' : 'el-icon-warning-outline'"></i>
          <div><strong>{{ issue.title }}</strong><span>{{ issue.detail }}</span></div>
          <el-button type="text" @click="goTo(issue.action_route)">
            {{ issue.action_label }}<i class="el-icon-arrow-right el-icon--right"></i>
          </el-button>
        </article>
      </div>
      <div v-else class="all-clear">数据库、缓存和协议连接均处于可用状态。</div>
    </section>

    <section v-if="overview" class="page-section">
      <div class="section-heading">
        <div><span class="eyebrow">今日</span><h2>机器人与使用情况</h2></div>
        <span class="muted">{{ overview.bots.length }} 个连接</span>
      </div>
      <div class="daily-grid">
        <div><strong>{{ metrics.chat_day }}</strong><span>收到消息</span></div>
        <div><strong>{{ metrics.call_day }}</strong><span>插件调用</span></div>
        <div><strong>{{ overview.process.version }}</strong><span>当前版本</span></div>
        <div><strong>{{ formatDuration(overview.process.uptime_seconds) }}</strong><span>运行时间</span></div>
      </div>
      <div v-if="overview.bots.length" class="bot-list">
        <article v-for="bot in overview.bots" :key="bot.self_id" class="bot-row">
          <span class="protocol-mark">{{ platformMark(bot.platform) }}</span>
          <div><strong>{{ platformName(bot.platform) }}</strong><span>{{ bot.self_id }}</span></div>
          <span class="bot-adapter">{{ bot.adapter }}</span>
          <span class="muted">已连接 {{ formatDuration(bot.connect_seconds) }}</span>
        </article>
      </div>
      <div v-else class="empty-state">
        <i class="el-icon-connection"></i>还没有机器人连接，WebUI其他管理功能仍可使用。
      </div>
    </section>

    <section ref="analyticsAnchor" class="page-section deferred-section">
      <div class="section-heading">
        <div><span class="eyebrow">趋势</span><h2>近30天统计</h2></div>
      </div>
      <dashboard-analytics v-if="analyticsVisible" />
      <div v-else class="empty-state">向下滚动后加载统计数据</div>
    </section>

    <section class="details-section">
      <button type="button" class="details-toggle" @click="detailsOpen = !detailsOpen">
        <span><span class="eyebrow">诊断</span><strong>运行详情与实时日志</strong></span>
        <i :class="detailsOpen ? 'el-icon-arrow-up' : 'el-icon-arrow-down'"></i>
      </button>
      <dashboard-runtime-details
        v-if="detailsOpen && overview"
        :overview="overview"
      />
    </section>
  </div>
</template>

<script>
import { isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"
const DashboardAnalytics = () =>
  import("@/components/dashboard/DashboardAnalytics.vue")
const DashboardRuntimeDetails = () =>
  import("@/components/dashboard/DashboardRuntimeDetails.vue")

export default {
  name: "MainDashboard",
  components: { DashboardAnalytics, DashboardRuntimeDetails },
  data: () => ({
    overview: null,
    metrics: { chat_day: 0, call_day: 0 },
    loadError: "",
    refreshing: false,
    analyticsVisible: false,
    detailsOpen: false,
    overviewTimer: null,
    overviewRequest: null,
    overviewResumePending: false,
    pageActive: true,
    pageDisposed: false,
    networkUnsubscribe: null,
    analyticsObserver: null,
  }),
  computed: {
    cacheModeDescription() {
      const cache = this.overview?.cache || {}
      const actual = cache.actual_mode || cache.mode || "未取得"
      const states = { invalid: "配置模式无效", externally_overridden: "被外部环境覆盖", restart_pending: "重启后生效", unconfirmed: "应用状态未确认" }
      return cache.application_status && cache.application_status !== "applied"
        ? `当前 ${actual} · 配置 ${cache.configured_mode || "未设置"} · ${states[cache.application_status] || "状态未确认"}`
        : actual
    },
    overallStatus() {
      return this.overview?.overall_status || "loading"
    },
    overallTitle() {
      if (!this.overview) return "正在检查运行状态"
      if (this.overview.overall_status === "critical") return "有核心服务需要处理"
      if (this.overview.overall_status === "warning") return "真寻正在运行，有事项需要留意"
      return "真寻运行正常"
    },
    overallDescription() {
      if (!this.overview) return "正在读取数据库、缓存和协议连接状态。"
      return this.overview.overall_status === "ok"
        ? "核心服务和机器人连接均已就绪。"
        : "按照下方待办逐项处理即可，不需要在多个页面间查找状态。"
    },
    issueTitle() {
      return this.overview.issues.length ? "需要留意的事项" : "当前没有待办"
    },
    updatedAt() {
      if (!this.overview?.generated_at) return ""
      const time = new Date(this.overview.generated_at).toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
      return `更新于 ${time}`
    },
    services() {
      if (!this.overview) return []
      return [
        {
          key: "database", ...this.overview.database,
          meta: this.overview.database.latency_ms == null ? "" : `${this.overview.database.latency_ms} ms`,
        },
        { key: "cache", ...this.overview.cache, meta: this.cacheModeDescription },
        {
          key: "protocol", label: "协议连接",
          status: this.overview.protocols.connection_count ? "ok" : "warning",
          detail: this.overview.protocols.connection_count
            ? `${this.overview.protocols.connection_count} 个机器人在线`
            : "等待机器人连接",
          meta: "",
        },
        {
          key: "websocket", label: "WebUI实时通道",
          status: this.overview.websocket.status, detail: "服务端通道可用",
          meta: `${this.overview.websocket.active_connections} 个连接`,
        },
      ]
    },
  },
  mounted() {
    document.addEventListener("visibilitychange", this.syncOverviewPolling)
    this.networkUnsubscribe = onBusinessNetworkChange(this.syncOverviewPolling)
    this.syncOverviewPolling()
    this.loadMetrics()
    this.$nextTick(this.observeAnalytics)
  },
  activated() { this.pageActive = true; this.syncOverviewPolling() },
  deactivated() { this.pageActive = false; this.syncOverviewPolling() },
  beforeDestroy() {
    this.pageDisposed = true
    this.stopOverviewPolling()
    document.removeEventListener("visibilitychange", this.syncOverviewPolling)
    this.networkUnsubscribe?.()
    this.analyticsObserver?.disconnect()
  },
  methods: {
    stopOverviewPolling() {
      if (this.overviewTimer) window.clearInterval(this.overviewTimer)
      this.overviewTimer = null
    },
    canPollOverview() {
      return !this.pageDisposed && this.pageActive && !document.hidden && !isBusinessNetworkFrozen()
    },
    syncOverviewPolling() {
      if (!this.canPollOverview()) { this.stopOverviewPolling(); return }
      if (this.overviewTimer) return
      if (this.overviewRequest) this.overviewResumePending = true
      this.loadOverview(false)
      this.overviewTimer = window.setInterval(() => this.loadOverview(false), 30000)
    },
    loadOverview(force) {
      if (!this.canPollOverview()) return Promise.resolve()
      if (this.overviewRequest) return this.overviewRequest
      this.refreshing = !!force
      this.overviewRequest = this.fetchOverview(force).finally(() => {
        this.overviewRequest = null
        this.refreshing = false
        if (this.overviewResumePending) {
          this.overviewResumePending = false
          this.loadOverview(false)
        }
      })
      return this.overviewRequest
    },
    async fetchOverview(force) {
      try {
        const response = await this.getRequest(
          `${this.$root.prefix}/dashboard/overview`,
          { force: force ? "true" : "false" },
          { suppressErrorToast: true }
        )
        if (!this.canPollOverview()) return
        if (!response.suc || !response.data) throw new Error(response.info || "运行状态暂时不可用")
        this.overview = response.data
        this.loadError = ""
      } catch (error) {
        if (this.canPollOverview()) this.loadError = error?.response?.data?.detail || error.message || "运行状态暂时不可用"
      }
    },
    async loadMetrics() {
      try {
        const response = await this.getRequest(
          `${this.$root.prefix}/dashboard/get_chat_and_call_count`, null,
          { suppressErrorToast: true }
        )
        if (response.suc && response.data) this.metrics = response.data
      } catch (error) {
        console.debug("Dashboard metrics unavailable", error)
      }
    },
    observeAnalytics() {
      if (!this.$refs.analyticsAnchor || !("IntersectionObserver" in window)) {
        this.analyticsVisible = true
        return
      }
      this.analyticsObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.analyticsVisible = true
          this.analyticsObserver.disconnect()
        }
      }, { rootMargin: "240px" })
      this.analyticsObserver.observe(this.$refs.analyticsAnchor)
    },
    goTo(route) {
      if (this.$route.path !== route) this.$router.push(route)
    },
    platformName(platform) {
      if (platform === "onebot_v11") return "OneBot V11"
      if (platform === "qq_official") return "QQ官方机器人"
      return "其他协议"
    },
    platformMark(platform) {
      return platform === "qq_official" ? "官" : platform === "onebot_v11" ? "11" : "·"
    },
    formatDuration(seconds) {
      const value = Math.max(0, Number(seconds) || 0)
      const days = Math.floor(value / 86400)
      if (days) return `${days}天`
      const hours = Math.floor(value / 3600)
      if (hours) return `${hours}小时`
      const minutes = Math.floor(value / 60)
      return minutes ? `${minutes}分钟` : "刚刚"
    },
  },
}
</script>

<style lang="scss" scoped>
.runtime-page { min-height: 100%; padding: 24px; overflow: auto; color: var(--text-color); background: var(--bg-color); }
.runtime-hero, .section-heading, .hero-actions, .service-item, .issue-row, .bot-row, .details-toggle { display: flex; align-items: center; }
.runtime-hero { min-height: 140px; justify-content: space-between; gap: 24px; padding: 26px 28px; border: 1px solid var(--border-color); border-left: 4px solid var(--el-color-info); border-radius: 8px; background: var(--bg-color-secondary); }
.runtime-hero.is-ok { border-left-color: var(--el-color-success); }
.runtime-hero.is-warning { border-left-color: var(--el-color-warning); }
.runtime-hero.is-critical { border-left-color: var(--el-color-danger); }
.runtime-hero h1, .section-heading h2 { margin: 4px 0 0; letter-spacing: 0; color: var(--text-color); }
.runtime-hero h1 { font-size: 28px; }
.runtime-hero p { margin: 8px 0 0; color: var(--text-color-secondary); }
.eyebrow { font-size: 12px; font-weight: 700; color: var(--primary-color); text-transform: uppercase; }
.hero-actions { gap: 16px; flex-shrink: 0; }
.muted { font-size: 12px; color: var(--text-color-secondary); }
.inline-error { display: flex; gap: 10px; align-items: center; margin-top: 12px; padding: 12px 16px; color: var(--el-color-danger); background: var(--el-color-danger-light-9); border: 1px solid var(--el-color-danger-light-7); }
.inline-error span { flex: 1; }
.inline-error button { color: inherit; font-weight: 700; }
.service-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 12px; overflow: hidden; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }
.service-item { min-height: 82px; gap: 12px; padding: 14px 18px; border-right: 1px solid var(--border-color); }
.service-item:last-child { border-right: 0; }
.service-item > div { min-width: 0; flex: 1; }
.service-item strong, .service-item small { display: block; }
.service-item small { margin-top: 4px; overflow: hidden; color: var(--text-color-secondary); text-overflow: ellipsis; white-space: nowrap; }
.status-dot { width: 9px; height: 9px; flex: 0 0 9px; border-radius: 50%; background: var(--el-color-info); }
.status-dot.is-ok { background: var(--el-color-success); }
.status-dot.is-warning { background: var(--el-color-warning); }
.status-dot.is-critical { background: var(--el-color-danger); }
.page-section, .details-section { margin-top: 16px; padding: 22px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }
.section-heading { justify-content: space-between; margin-bottom: 18px; }
.section-heading h2 { font-size: 20px; }
.count-badge { display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid var(--border-color); border-radius: 50%; color: var(--text-color-secondary); }
.issue-list, .bot-list { border-top: 1px solid var(--border-color); }
.issue-row { min-height: 68px; gap: 14px; border-bottom: 1px solid var(--border-color); }
.issue-row > i { color: var(--el-color-warning); font-size: 20px; }
.issue-row.is-critical > i { color: var(--el-color-danger); }
.issue-row > div { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.issue-row > div span { color: var(--text-color-secondary); }
.all-clear { padding: 18px; color: var(--el-color-success); background: var(--el-color-success-light-9); border-left: 3px solid var(--el-color-success); }
.daily-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--border-color); }
.daily-grid > div { min-height: 104px; padding: 20px; border-right: 1px solid var(--border-color); }
.daily-grid > div:last-child { border-right: 0; }
.daily-grid strong, .daily-grid span { display: block; }
.daily-grid strong { overflow: hidden; font-size: 26px; text-overflow: ellipsis; white-space: nowrap; }
.daily-grid span { margin-top: 8px; color: var(--text-color-secondary); }
.bot-list { margin-top: 16px; }
.bot-row { min-height: 64px; gap: 14px; border-bottom: 1px solid var(--border-color); }
.bot-row > div { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.bot-row > div span { color: var(--text-color-secondary); font-family: Consolas, monospace; font-size: 12px; }
.protocol-mark { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid var(--primary-color); color: var(--primary-color); font-weight: 700; }
.bot-adapter { color: var(--text-color-secondary); }
.empty-state { display: flex; min-height: 110px; align-items: center; justify-content: center; gap: 10px; color: var(--text-color-secondary); border: 1px dashed var(--border-color); }
.bot-list + .empty-state { margin-top: 16px; }
.deferred-section { min-height: 260px; }
.details-section { padding: 0; overflow: hidden; }
.details-toggle { width: 100%; justify-content: space-between; padding: 20px 24px; color: var(--text-color); }
.details-toggle > span { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
@media (max-width: 1100px) { .service-strip, .daily-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .service-item:nth-child(2), .daily-grid > div:nth-child(2) { border-right: 0; } .service-item:nth-child(-n + 2), .daily-grid > div:nth-child(-n + 2) { border-bottom: 1px solid var(--border-color); } }
@media (max-width: 700px) { .runtime-page { padding: 12px; } .runtime-hero { min-height: 0; align-items: flex-start; flex-direction: column; padding: 22px; } .runtime-hero h1 { font-size: 23px; } .hero-actions { width: 100%; justify-content: space-between; } .service-strip, .daily-grid { grid-template-columns: 1fr; } .service-item, .daily-grid > div { border-right: 0; border-bottom: 1px solid var(--border-color); } .service-item:last-child, .daily-grid > div:last-child { border-bottom: 0; } .page-section { padding: 18px; } .issue-row { align-items: flex-start; flex-wrap: wrap; padding: 14px 0; } .issue-row .el-button { margin-left: 34px; } .bot-adapter { display: none; } }
</style>
