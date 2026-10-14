<template>
  <div class="analytics-wrap">
    <div v-if="error" class="feedback is-error">
      <span>{{ error }}</span><el-button type="text" @click="load">重新加载</el-button>
    </div>
    <template v-else-if="loaded">
      <section class="trend-panel">
        <div class="panel-title">
          <strong>消息与调用趋势</strong>
          <span><i class="legend chat"></i>消息<i class="legend call"></i>调用</span>
        </div>
        <div v-if="trendRows.length" class="trend-bars">
          <div v-for="row in trendRows" :key="row.date" class="trend-day">
            <div class="bar-stack">
              <span class="bar chat" :style="{ height: `${row.chatHeight}%` }"></span>
              <span class="bar call" :style="{ height: `${row.callHeight}%` }"></span>
            </div>
            <small>{{ row.label }}</small>
          </div>
        </div>
        <div v-else class="feedback">近30天暂无统计记录</div>
      </section>

      <div class="ranking-grid">
        <section v-for="panel in rankings" :key="panel.title" class="ranking-panel">
          <div class="panel-title"><strong>{{ panel.title }}</strong></div>
          <div v-if="panel.rows.length" class="ranking-list">
            <div v-for="row in panel.rows" :key="row.key" class="ranking-row">
              <span>{{ row.name }}</span>
              <div><i :style="{ width: row.width + '%' }"></i></div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
          <div v-else class="feedback">暂无统计数据</div>
        </section>
      </div>
    </template>
    <div v-else class="feedback"><i class="el-icon-loading"></i>正在加载统计</div>
  </div>
</template>

<script>
const rankingRows = (items, valueKey, identityKey) => {
  const visible = (items || []).slice(0, 8)
  const maximum = Math.max(1, ...visible.map((item) => Number(item[valueKey]) || 0))
  return visible.map((item) => ({
    key: item[identityKey],
    name: item.name || item[identityKey],
    value: item[valueKey],
    width: Math.max(3, Math.round(((Number(item[valueKey]) || 0) / maximum) * 100)),
  }))
}

export default {
  name: "DashboardAnalytics",
  data: () => ({
    loaded: false,
    error: "",
    trend: { chat: [], call: [], date: [] },
    groups: [],
    plugins: [],
  }),
  computed: {
    rankings() {
      return [
        { title: "活跃群组", rows: rankingRows(this.groups, "chat_num", "group_id") },
        { title: "热门插件", rows: rankingRows(this.plugins, "count", "module") },
      ]
    },
    trendRows() {
      const start = Math.max(0, this.trend.date.length - 14)
      const chat = this.trend.chat.slice(start)
      const call = this.trend.call.slice(start)
      const dates = this.trend.date.slice(start)
      const maximum = Math.max(1, ...chat, ...call)
      return dates.map((date, index) => ({
        date,
        label: index % 2 === 0 ? date : "",
        chatHeight: Math.max(2, Math.round(((chat[index] || 0) / maximum) * 100)),
        callHeight: Math.max(2, Math.round(((call[index] || 0) / maximum) * 100)),
      }))
    },
  },
  mounted() {
    this.load()
  },
  methods: {
    async load() {
      this.loaded = false
      this.error = ""
      try {
        const quiet = { suppressErrorToast: true }
        const [trend, groups, plugins] = await Promise.all([
          this.getRequest(`${this.$root.prefix}/dashboard/get_chat_and_call_month`, null, quiet),
          this.getRequest(`${this.$root.prefix}/main/get_active_group`, null, quiet),
          this.getRequest(`${this.$root.prefix}/main/get_hot_plugin`, null, quiet),
        ])
        if (!trend.suc || !groups.suc || !plugins.suc) {
          throw new Error(trend.info || groups.info || plugins.info || "统计数据加载失败")
        }
        this.trend = Array.isArray(trend.data?.date)
          ? trend.data
          : { chat: [], call: [], date: [] }
        this.groups = Array.isArray(groups.data) ? groups.data : []
        this.plugins = Array.isArray(plugins.data) ? plugins.data : []
        this.loaded = true
      } catch (error) {
        this.error = error?.response?.data?.detail || error.message || "统计数据加载失败"
      }
    },
  },
}
</script>

<style scoped>
.analytics-wrap { min-height: 210px; }
.trend-panel, .ranking-panel { padding: 18px; border: 1px solid var(--border-color); background: var(--bg-color); }
.panel-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.panel-title span { color: var(--text-color-secondary); font-size: 12px; }
.legend { display: inline-block; width: 8px; height: 8px; margin: 0 5px 0 12px; }
.legend.chat, .bar.chat { background: var(--primary-color); }
.legend.call, .bar.call { background: var(--el-color-info); }
.trend-bars { display: grid; height: 190px; grid-template-columns: repeat(14, minmax(10px, 1fr)); gap: 8px; align-items: end; }
.trend-day { display: flex; height: 100%; min-width: 0; flex-direction: column; justify-content: flex-end; text-align: center; }
.bar-stack { display: flex; height: 150px; align-items: flex-end; justify-content: center; gap: 2px; border-bottom: 1px solid var(--border-color); }
.bar { display: block; width: 35%; min-height: 2px; }
.trend-day small { height: 20px; margin-top: 6px; color: var(--text-color-secondary); font-size: 10px; }
.ranking-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }
.ranking-list { display: flex; flex-direction: column; gap: 11px; }
.ranking-row { display: grid; grid-template-columns: minmax(80px, 1fr) 2fr 42px; gap: 10px; align-items: center; font-size: 13px; }
.ranking-row > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ranking-row > div { height: 6px; overflow: hidden; background: var(--el-fill-color-light); }
.ranking-row > div i { display: block; height: 100%; background: var(--primary-color); }
.ranking-row strong { text-align: right; }
.feedback { display: flex; min-height: 150px; align-items: center; justify-content: center; gap: 10px; color: var(--text-color-secondary); }
.feedback.is-error { min-height: 100px; color: var(--el-color-danger); }
@media (max-width: 800px) { .ranking-grid { grid-template-columns: 1fr; } .trend-bars { gap: 3px; } }
</style>
