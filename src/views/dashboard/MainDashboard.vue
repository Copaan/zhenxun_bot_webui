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

    <div v-if="overview" class="summary-grid" :class="{ 'single-card': !showGettingStarted }">
      <section v-if="showGettingStarted" class="summary-card getting-started">
        <div class="summary-heading">
          <h2>快速开始</h2>
          <span class="muted">{{ gettingStartedDone }} / {{ gettingStarted.length }} 已完成</span>
        </div>
        <ul class="start-list">
          <li v-for="item in incompleteGettingStarted" :key="item.key" class="start-row">
            <div><strong>{{ item.title }}</strong><span>{{ item.detail }}</span></div>
            <el-button type="text" @click="goTo(item.route)">{{ item.action }}</el-button>
          </li>
        </ul>
        <div class="summary-footer">
          <el-button type="text" @click="goTo('/ai/chat')">聊天唤醒与人设设置</el-button>
          <el-button type="text" class="start-hide" @click="hideGettingStarted">不再显示</el-button>
        </div>
      </section>
      <section class="summary-card todo-card" :class="{ 'is-empty': !overview.issues.length }">
        <div class="summary-heading">
          <h2>待办<span v-if="overview.issues.length" class="muted"> {{ overview.issues.length }} 项</span></h2>
          <span v-if="!overview.issues.length" class="no-issues">当前没有待办</span>
        </div>
        <div v-if="overview.issues.length" class="issue-list">
          <article v-for="issue in visibleIssues" :key="issue.code" class="issue-row" :class="'is-' + issue.severity">
            <i :class="issue.severity === 'critical' ? 'el-icon-circle-close' : 'el-icon-warning-outline'"></i>
            <div><strong>{{ issue.title }}</strong><span>{{ issue.detail }}</span></div>
            <el-button type="text" @click="goTo(issue.action_route)">{{ issue.action_label }}</el-button>
          </article>
        </div>
        <el-button v-if="overview.issues.length > 3" type="text" class="issues-toggle" :aria-expanded="String(issuesExpanded)" @click="issuesExpanded = !issuesExpanded">
          {{ issuesExpanded ? '收起' : '展开其余 ' + (overview.issues.length - 3) + ' 项' }}
        </el-button>
      </section>
    </div>

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
          <span class="protocol-mark">{{ platformMark(bot) }}</span>
          <div><strong>{{ platformName(bot) }}</strong><span>{{ bot.self_id }}</span></div>
          <span v-if="bot.adapter !== platformName(bot)" class="bot-adapter">{{ bot.adapter }}</span>
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
const GETTING_STARTED_KEY = "zhenxunGettingStartedHidden"

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
    issuesExpanded: false,
    overviewTimer: null,
    overviewRequest: null,
    overviewResumePending: false,
    pageActive: true,
    pageDisposed: false,
    networkUnsubscribe: null,
    analyticsObserver: null,
    gettingStartedHidden: window.localStorage.getItem(GETTING_STARTED_KEY) === "1",
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
    botName() {
      return this.overview?.getting_started?.self_nickname || "真寻"
    },
    gettingStarted() {
      const state = this.overview?.getting_started || {}
      return [
        { key: "bot", title: "连接 QQ", detail: `用 NapCat 等协议端或 QQ 官方机器人接入，让${this.botName}收发消息。`, done: !!this.overview?.bots.length, action: "去接入", route: "/protocol" },
        { key: "ai", title: "接入 AI 模型", detail: "选择厂商并填入 API Key，设置默认对话模型。", done: !!state.ai_ready, action: "去配置", route: "/ai" },
        { key: "superusers", title: "设置超级用户", detail: "填写你自己的 QQ 号，就能在聊天中使用管理指令。", done: !!state.superusers, action: "去设置", route: "/system" },
      ]
    },
    gettingStartedDone() {
      return this.gettingStarted.filter((item) => item.done).length
    },
    incompleteGettingStarted() {
      return this.gettingStarted.filter((item) => !item.done)
    },
    showGettingStarted() {
      return !this.gettingStartedHidden && this.gettingStartedDone < this.gettingStarted.length
    },
    visibleIssues() {
      const priorities = { critical: 0, warning: 1, info: 2 }
      const issues = [...(this.overview?.issues || [])].sort((left, right) =>
        (priorities[left.severity] ?? 3) - (priorities[right.severity] ?? 3))
      return this.issuesExpanded ? issues : issues.slice(0, 3)
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
          `${this.$root.prefix}/main/get_chat_and_call_count`, null,
          { suppressErrorToast: true }
        )
        if (response.suc && response.data) this.metrics = { chat_day: response.data.chat.day, call_day: response.data.call.day }
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
    hideGettingStarted() {
      window.localStorage.setItem(GETTING_STARTED_KEY, "1")
      this.gettingStartedHidden = true
    },
    goTo(route) {
      if (this.$route.path === route) this.loadOverview(true)
      else this.$router.push(route)
    },
    platformName(bot) {
      if (bot.platform === "onebot_v11") return "OneBot V11"
      if (bot.platform === "qq_official") return "QQ官方机器人"
      return bot.adapter || "其他协议"
    },
    platformMark(bot) {
      if (bot.platform === "qq_official") return "官"
      if (bot.platform === "onebot_v11") return "11"
      return (bot.adapter || "·").charAt(0).toUpperCase()
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
.runtime-hero { min-height: 88px; justify-content: space-between; gap: 20px; padding: 16px 20px; border: 1px solid var(--border-color); border-left: 4px solid var(--el-color-info); border-radius: 8px; background: var(--bg-color-secondary); }
.runtime-hero.is-ok { border-left-color: var(--el-color-success); }
.runtime-hero.is-warning { border-left-color: var(--el-color-warning); }
.runtime-hero.is-critical { border-left-color: var(--el-color-danger); }
.runtime-hero h1, .section-heading h2 { margin: 4px 0 0; letter-spacing: 0; color: var(--text-color); }
.runtime-hero h1 { font-size: 24px; }
.runtime-hero p { margin: 8px 0 0; color: var(--text-color-secondary); }
.eyebrow { font-size: 12px; font-weight: 700; color: var(--primary-color); text-transform: uppercase; }
.hero-actions { gap: 16px; flex-shrink: 0; }
.muted { font-size: 12px; color: var(--text-color-secondary); }
.inline-error { display: flex; gap: 10px; align-items: center; margin-top: 12px; padding: 12px 16px; color: var(--el-color-danger); background: var(--el-color-danger-light-9); border: 1px solid var(--el-color-danger-light-7); }
.inline-error span { flex: 1; }
.inline-error button { color: inherit; font-weight: 700; }
.service-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 12px; overflow: hidden; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }
.service-item { min-width: 0; min-height: 64px; gap: 10px; padding: 10px 14px; border-right: 1px solid var(--border-color); }
.service-item > span:last-child { flex-shrink: 0; max-width: 40%; overflow: hidden; color: var(--text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
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
.issue-list, .bot-list { border-top: 1px solid var(--border-color); }
.issue-row { min-height: 68px; gap: 14px; border-bottom: 1px solid var(--border-color); }
.issue-row > i { color: var(--el-color-warning); font-size: 20px; }
.issue-row.is-critical > i { color: var(--el-color-danger); }
.issue-row > div { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.issue-row > div span { color: var(--text-color-secondary); }
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
.start-list { margin: 0; padding: 0; border-top: 1px solid var(--border-color); list-style: none; }
.start-row { display: flex; min-height: 0; align-items: center; gap: 12px; padding: 10px 0; font-size: 13px; border-bottom: 1px solid var(--border-color); }
.start-row > div { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.start-row > div span { color: var(--text-color-secondary); }
.deferred-section { min-height: 260px; }
.details-section { padding: 0; overflow: hidden; }
.details-toggle { width: 100%; justify-content: space-between; padding: 20px 24px; color: var(--text-color); }
.details-toggle > span { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
@media (max-width: 1100px) { .service-strip, .daily-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .service-item:nth-child(2), .daily-grid > div:nth-child(2) { border-right: 0; } .service-item:nth-child(-n + 2), .daily-grid > div:nth-child(-n + 2) { border-bottom: 1px solid var(--border-color); } }
@media (max-width: 700px) { .runtime-page { padding: 12px; } .runtime-hero { min-height: 0; align-items: flex-start; flex-direction: column; padding: 22px; } .runtime-hero h1 { font-size: 23px; } .hero-actions { width: 100%; justify-content: space-between; } .service-strip, .daily-grid { grid-template-columns: minmax(0, 1fr); } .service-item, .daily-grid > div { border-right: 0; border-bottom: 1px solid var(--border-color); } .service-item:last-child, .daily-grid > div:last-child { border-bottom: 0; } .page-section { padding: 18px; } .issue-row { align-items: flex-start; flex-wrap: wrap; padding: 14px 0; } .issue-row .el-button { margin-left: 34px; } .start-row { align-items: flex-start; flex-wrap: wrap; padding: 14px 0; } .start-row .el-button { margin-left: 40px; } .bot-adapter { display: none; } }
.summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 14px; margin-top: 14px; }
.summary-grid.single-card { grid-template-columns: minmax(0, 1fr); }
.summary-card { min-width: 0; padding: 14px 16px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }
.summary-heading, .summary-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.summary-heading { margin-bottom: 8px; }
.summary-heading h2 { margin: 0; font-size: 16px; }
.summary-heading h2 .muted { margin-left: 6px; font-weight: normal; }
.summary-footer { margin-top: 8px; }
.summary-footer .el-button, .issues-toggle { padding: 4px 0; font-size: 12px; }
.summary-footer .start-hide { color: var(--text-color-secondary); }
.todo-card.is-empty .summary-heading { margin-bottom: 0; }
.no-issues { color: var(--text-color-secondary); font-size: 13px; }
.issues-toggle { margin-top: 10px; }
.summary-card .issue-row { min-height: 0; padding: 10px 0; gap: 8px; font-size: 13px; }
.summary-card .issue-row > i { font-size: 16px; }
.summary-card .issue-row > div { overflow-wrap: anywhere; }
.summary-card .issue-row .el-button { flex-shrink: 0; font-size: 12px; }
.summary-card .issue-row:last-child, .start-row:last-child { border-bottom: 0; }
.start-row .el-button { flex-shrink: 0; font-size: 12px; }
@media (max-width: 900px) { .summary-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
