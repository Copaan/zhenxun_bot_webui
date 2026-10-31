<template>
  <div class="ai-stats">
    <div class="stats-filters">
      <el-radio-group v-model="period" size="small" @change="load">
        <el-radio-button label="24h">24 小时</el-radio-button>
        <el-radio-button label="7d">7 天</el-radio-button>
        <el-radio-button label="30d">30 天</el-radio-button>
      </el-radio-group>
      <el-select v-model="model" size="small" clearable filterable placeholder="全部模型" class="model-select" @change="load">
        <el-option v-for="name in modelNames" :key="name" :label="name" :value="name" />
      </el-select>
      <span class="spacer"></span>
      <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="stat-tiles">
      <div v-for="tile in tiles" :key="tile.label" class="stat-tile"><small>{{ tile.label }}</small><strong>{{ tile.value }}</strong><span v-if="tile.note" class="muted">{{ tile.note }}</span></div>
    </div>

    <section class="chart-panel">
      <div class="chart-heading">
        <strong>{{ metricTitle }}</strong>
        <el-radio-group v-model="metric" size="mini" @change="render">
          <el-radio-button label="calls">调用次数</el-radio-button>
          <el-radio-button label="latency">平均耗时</el-radio-button>
          <el-radio-button label="tokens">Token</el-radio-button>
        </el-radio-group>
      </div>
      <div ref="chart" class="chart"></div>
    </section>

    <el-table :data="data.models" size="small" empty-text="所选时间内没有模型调用" class="model-table" @row-click="(row) => { model = row.model; load() }">
      <el-table-column prop="model" label="模型" min-width="200" />
      <el-table-column prop="task" label="任务" width="100" />
      <el-table-column prop="calls" label="调用" width="90" />
      <el-table-column label="成功率" width="100"><template #default="{ row }">{{ percent(row.success_rate) }}</template></el-table-column>
      <el-table-column label="平均耗时" width="110"><template #default="{ row }">{{ latency(row.avg_latency) }}</template></el-table-column>
      <el-table-column label="输入 / 输出 Token" min-width="160"><template #default="{ row }">{{ number(row.prompt_tokens) }} / {{ number(row.completion_tokens) }}</template></el-table-column>
    </el-table>
    <p class="muted">统计按模型线路记录每次请求（含重试与切换线路），保留 90 天；点击一行只看该模型的趋势。</p>
  </div>
</template>

<script>
import { apiErrorDetail } from "@/utils/api-error"
import EventBus from "@/utils/event-bus"
import { abbreviateNumber, getCssVar } from "@/utils/template"
import { debounce } from "lodash"

const EMPTY = { calls: 0, failures: 0, success_rate: null, avg_latency: null, prompt_tokens: 0, completion_tokens: 0 }

export default {
  name: "AIStats",
  data() {
    return { period: "24h", model: "", metric: "calls", loading: false, data: { unit: "hour", total: { ...EMPTY }, series: [], models: [] }, chart: null }
  },
  computed: {
    modelNames() { return [...new Set(this.data.models.map((item) => item.model))] },
    metricTitle() { return { calls: "调用次数", latency: "平均耗时（毫秒）", tokens: "Token 用量" }[this.metric] },
    tiles() {
      const total = this.data.total
      return [
        { label: "调用次数", value: this.number(total.calls), note: total.failures ? `失败 ${this.number(total.failures)} 次` : "" },
        { label: "成功率", value: this.percent(total.success_rate) },
        { label: "平均耗时", value: this.latency(total.avg_latency) },
        { label: "输入 Token", value: this.number(total.prompt_tokens) },
        { label: "输出 Token", value: this.number(total.completion_tokens) },
      ]
    },
  },
  async mounted() {
    this.resizeHandler = debounce(() => this.chart?.resize(), 200)
    window.addEventListener("resize", this.resizeHandler)
    EventBus.$on("change-theme", this.render)
    await this.load()
  },
  beforeDestroy() {
    this.destroyed = true
    window.removeEventListener("resize", this.resizeHandler)
    this.resizeHandler.cancel()
    EventBus.$off("change-theme", this.render)
    this.chart?.dispose()
    this.chart = null
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const response = await this.getRequest(`${this.$root.prefix}/ai/stats`, { period: this.period, model: this.model || undefined }, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info)
        this.data = response.data
        await this.render()
      } catch (error) { this.$message.error(apiErrorDetail(error, "统计加载失败。")) }
      finally { this.loading = false }
    },
    /**
     * 按当前指标绘制趋势图：次数与 Token 为堆叠柱，耗时为折线，始终单一纵轴
     */
    async render() {
      if (!this.chart) {
        const echarts = await this.$loadEcharts()
        if (this.destroyed || !this.$refs.chart) return
        this.chart = echarts.init(this.$refs.chart)
      }
      const times = this.data.series.map((item) => this.label(item.time))
      const text = { color: getCssVar("--text-color-secondary"), fontSize: 12 }
      const bar = (name, values, color, top) => ({ name, type: "bar", stack: "total", data: values, barMaxWidth: 24, itemStyle: { color: getCssVar(color), borderColor: getCssVar("--bg-color"), borderWidth: 1, borderRadius: top ? [4, 4, 0, 0] : 0 } })
      const series = {
        calls: [bar("成功", this.data.series.map((item) => item.calls - item.failures), "--primary-color", false), bar("失败", this.data.series.map((item) => item.failures), "--danger-color", true)],
        tokens: [bar("输入", this.data.series.map((item) => item.prompt_tokens), "--primary-color", false), bar("输出", this.data.series.map((item) => item.completion_tokens), "--primary-color-light", true)],
        latency: [{ name: "平均耗时", type: "line", data: this.data.series.map((item) => item.avg_latency), connectNulls: false, symbolSize: 8, lineStyle: { width: 2, color: getCssVar("--primary-color") }, itemStyle: { color: getCssVar("--primary-color") } }],
      }[this.metric]
      this.chart.setOption({
        tooltip: { trigger: "axis", backgroundColor: getCssVar("--el-bg-color-overlay"), borderColor: getCssVar("--border-color-light"), textStyle: { color: getCssVar("--text-color"), fontSize: 12 } },
        legend: series.length > 1 ? { top: 0, right: 0, textStyle: text } : { show: false },
        grid: { left: 8, right: 8, top: 32, bottom: 8, containLabel: true },
        xAxis: { type: "category", data: times, axisLine: { lineStyle: { color: getCssVar("--border-color") } }, axisTick: { show: false }, axisLabel: text },
        yAxis: { type: "value", splitLine: { lineStyle: { color: getCssVar("--border-color-light") } }, axisLabel: { ...text, formatter: abbreviateNumber } },
        series,
      }, true)
      this.$nextTick(() => this.chart?.resize())
    },
    label(value) {
      const date = new Date(value)
      const pad = (number) => String(number).padStart(2, "0")
      return this.data.unit === "hour" ? `${pad(date.getHours())}:00` : `${date.getMonth() + 1}/${date.getDate()}`
    },
    number(value) { return Number(value || 0).toLocaleString() },
    percent(value) { return value == null ? "—" : `${(value * 100).toFixed(1)}%` },
    latency(value) { return value == null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)} 秒` : `${value} 毫秒` },
  },
}
</script>

<style scoped>
.stats-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.model-select { width: 240px; }
.spacer { flex: 1; }
.muted { color: var(--text-color-secondary); font-size: 12px; }
.stat-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 14px 0; }
.stat-tile { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--border-color-light); border-radius: 8px; background: var(--bg-color-secondary); }
.stat-tile small { color: var(--text-color-secondary); }
.stat-tile strong { font-size: 22px; color: var(--text-color); }
.chart-panel { padding: 12px 14px; border: 1px solid var(--border-color-light); border-radius: 8px; }
.chart-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.chart { height: 300px; }
.model-table { margin-top: 14px; }
.model-table >>> .el-table__row { cursor: pointer; }
</style>
