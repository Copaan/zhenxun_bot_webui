<template>
  <div ref="midInfo" class="mid-info text-gray-800 p-4 flex flex-col h-full">
    <!-- 消息接收区域 -->
    <div
      class="metric-panel message-area p-4 mb-3"
      :style="{
        height: areaHeight + 'px',
        backgroundColor: 'var(--bg-color-secondary)',
        border: '1px solid var(--border-color-light)',
      }"
    >
      <div class="title-box flex items-center mb-3">
        <p
          class="text-md font-bold flex items-center"
          :style="{ color: 'var(--primary-color)' }"
        >
          消息接收
        </p>
        <span
          class="text-xs ml-3"
          :style="{ color: 'var(--text-color-secondary)' }"
        >
          实时统计
        </span>
      </div>

      <div
        class="grid grid-cols-2 md:grid-cols-5 gap-3"
        :style="{ height: areaHeight - 80 + 'px' }"
      >
        <div
          v-for="(item, key) in progressItems"
          :key="key"
          class="flex flex-col p-1 justify-center"
        >
          <div
            class="progress-container flex-col w-full flex justify-center items-center"
          >
            <div
              class="progress-container w-full flex justify-center items-center"
            >
              <el-progress
                type="circle"
                :percentage="percentage(chCnt, key)"
                :width="progressWidth"
                :stroke-width="strokeWidth"
                :color="item.color"
                :format="() => String(chCnt[key])"
                :style="{
                  '--progress-font-size': fontSize + 'px',
                  'max-width': '100%',
                }"
              />
            </div>
            <p
              class="text-sm font-medium mt-2 text-center truncate w-full"
              :style="{ color: 'var(--text-color-secondary)' }"
            >
              {{ item.label }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 功能调用区域 -->
    <div
      class="metric-panel function-area p-4 mb-3"
      :style="{
        height: areaHeight + 'px',
        backgroundColor: 'var(--bg-color-secondary)',
        border: '1px solid var(--border-color-light)',
      }"
    >
      <div class="title-box flex items-center mb-3">
        <p
          class="text-md font-bold flex items-center"
          :style="{ color: 'var(--primary-color)' }"
        >
          功能调用
        </p>
        <span
          class="text-xs ml-3"
          :style="{ color: 'var(--text-color-secondary)' }"
        >
          实时统计
        </span>
      </div>

      <div
        class="grid grid-cols-2 md:grid-cols-5 gap-3"
        :style="{ height: areaHeight - 80 + 'px' }"
      >
        <div
          v-for="(item, key) in progressItems"
          :key="key"
          class="flex flex-col p-1 justify-center"
        >
          <div
            class="progress-container flex-col w-full flex justify-center items-center"
          >
            <div
              class="progress-container w-full flex justify-center items-center"
            >
              <el-progress
                type="circle"
                :percentage="percentage(callCnt, key)"
                :width="progressWidth"
                :stroke-width="strokeWidth"
                :color="item.color"
                :format="() => String(callCnt[key])"
                :style="{
                  '--progress-font-size': fontSize + 'px',
                  'max-width': '100%',
                }"
              />
            </div>
            <p
              class="text-sm font-medium mt-2 text-center truncate w-full"
              :style="{ color: 'var(--text-color-secondary)' }"
            >
              {{ item.label }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div
      class="metric-panel chart-area p-4 flex-1 min-h-[100px]"
      ref="chartArea"
      :style="{
        height: computedChartHeight + 'px',
        backgroundColor: 'var(--bg-color-secondary)',
        border: '1px solid var(--border-color-light)',
        background:
          'linear-gradient(to bottom right, var(--bg-color), var(--bg-color-hover))',
      }"
    >
      <div
        ref="chart"
        class="w-full h-full"
        :style="{ height: computedChartHeight - 20 + 'px' }"
      ></div>
    </div>
  </div>
</template>

<script>
import EventBus from "@/utils/event-bus"
import { getCssVar } from "@/utils/template"
import { debounce } from "lodash"

const lineSeries = (name, data, yAxisIndex, color, areaFrom, areaTo) => ({
  name,
  type: "line",
  smooth: true,
  data,
  yAxisIndex,
  lineStyle: { width: 3, color: getCssVar(color) },
  itemStyle: { color: getCssVar(color) },
  areaStyle: {
    color: {
      type: "linear",
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: getCssVar(areaFrom) },
        { offset: 1, color: getCssVar(areaTo) },
      ],
    },
  },
})

const valueAxis = (name, position) => ({
  type: "value",
  name,
  position,
  axisLine: { lineStyle: { color: getCssVar("--border-color") } },
  axisLabel: { color: getCssVar("--text-color-secondary"), fontSize: 12 },
  splitLine: { lineStyle: { color: getCssVar("--border-color-light") } },
})

export default {
  name: "MidInfo",
  data() {
    return {
      progressWidth: 80,
      strokeWidth: 8,
      fontSize: 14,
      areaHeight: 300,
      chartBorderHeight: 0,
      botInfo: null,
      chCnt: { num: 0, day: 0, week: 0, month: 0, year: 0 },
      callCnt: { num: 0, day: 0, week: 0, month: 0, year: 0 },
      progressItems: {
        num: { label: "总数", color: "#f97316" },
        day: { label: "今日", color: "#ec4899" },
        week: { label: "近7天", color: "#a855f7" },
        month: { label: "近30天", color: "#3b82f6" },
        year: { label: "近一年", color: "#10b981" },
      },
      countInterval: null,
      chart: null,
      destroyed: false,
      sidebarResizeHandler: null,
      themeChangeHandler: null,
      chatAndCallMonth: {},
    }
  },
  created() {
    this.botInfo = this.$store.state.botInfo || {}
  },
  async mounted() {
    window.addEventListener("resize", this.handleResize)
    if (!this.botInfo.self_id) return
    const echarts = await this.$loadEcharts()
    if (this.destroyed || !this.$refs.chart) return
    this.chart = echarts.init(this.$refs.chart)
    const statsBotId = this.botInfo.storage_bot_id || this.botInfo.self_id
    this.loadCounts(statsBotId)
    this.loadMonth(statsBotId)
    this.countInterval = setInterval(() => this.loadCounts(statsBotId, true), 30000)
    this.handleResize()
    this.renderChart()
    this.sidebarResizeHandler = debounce(this.handleResize, 200)
    this.themeChangeHandler = debounce(this.renderChart, 200)
    EventBus.$on("sidebar-aside", this.sidebarResizeHandler)
    EventBus.$on("change-theme", this.themeChangeHandler)
  },
  computed: {
    computedChartHeight() {
      if (!this.chartBorderHeight) {
        this.handleResize()
      }
      return this.chartBorderHeight
    },
  },
  beforeDestroy() {
    this.destroyed = true
    clearInterval(this.countInterval)
    window.removeEventListener("resize", this.handleResize)
    if (this.sidebarResizeHandler) {
      EventBus.$off("sidebar-aside", this.sidebarResizeHandler)
      this.sidebarResizeHandler.cancel()
    }
    if (this.themeChangeHandler) {
      EventBus.$off("change-theme", this.themeChangeHandler)
      this.themeChangeHandler.cancel()
    }
    this.chart?.dispose()
    this.chart = null
  },
  methods: {
    updateAreaHeight() {
      if (this.$isMobile()) {
        // 移动端使用固定高度
        this.areaHeight = 500
      } else {
        // 桌面端保持原有动态计算逻辑
        const height = window.innerHeight
        this.areaHeight = height * 0.2
        if (height > 1080) {
          this.areaHeight = height * 0.25
        }
        if (height > 1440) {
          this.areaHeight = height * 0.3
        }
        // 确保最小高度
        this.areaHeight = Math.max(this.areaHeight, 200)
      }
    },

    handleResize() {
      if (this.destroyed) return
      const width = window.innerWidth
      const height = window.innerHeight

      // 进度条大小调整逻辑保持不变
      if (width < 640) {
        this.progressWidth = Math.min(70, Math.max(50, width * 0.15))
        this.strokeWidth = 6
        this.fontSize = 10
      } else if (width < 1024) {
        this.progressWidth = 75
        this.strokeWidth = 7
        this.fontSize = 12
      } else {
        this.progressWidth = 90
        this.strokeWidth = 8
        this.fontSize = 14
      }

      // 高分辨率适配
      if (height > 1080) {
        this.progressWidth = Math.floor(height * 0.15)
        this.strokeWidth = Math.floor(this.progressWidth * 0.2)
        this.fontSize = Math.floor(this.progressWidth * 0.15)
      }

      // 确保最小和最大值
      this.progressWidth = Math.max(50, Math.min(this.progressWidth, 120))
      this.strokeWidth = Math.max(6, Math.min(this.strokeWidth, 12))
      this.fontSize = Math.max(10, Math.min(this.fontSize, 18))

      // 调用更新高度方法
      this.updateAreaHeight()

      this.$nextTick(() => {
        if (this.destroyed || !this.$refs.midInfo || !this.chart) return
        this.chartBorderHeight =
          this.$refs.midInfo.offsetHeight - this.areaHeight * 2 - 100
        this.chartBorderHeight = Math.max(this.chartBorderHeight, 180)

        this.chart.resize()
      })
    },
    percentage(counts, key) {
      if (!counts.num) return 0
      return Math.min(100, (counts[key] / counts.num) * 100)
    },
    async loadMonth(botId) {
      const loading = this.getLoading(".chart-area")
      try {
        const resp = await this.getRequest(`${this.$root.prefix}/dashboard/get_chat_and_call_month`, { bot_id: botId }).catch(() => null)
        if (this.destroyed || !resp) return
        if (!resp.suc) this.$message.error(resp.info)
        else if (resp.warning) this.$message.warning(resp.warning)
        else {
          this.chatAndCallMonth = resp.data
          this.renderChart()
        }
      } finally {
        loading.close()
      }
    },
    async loadCounts(botId, silent = false) {
      const loadings = silent ? [] : [this.getLoading(".message-area"), this.getLoading(".function-area")]
      try {
        const resp = await this.getRequest(`${this.$root.prefix}/main/get_chat_and_call_count`, { bot_id: botId }, { suppressErrorToast: silent }).catch(() => null)
        if (this.destroyed || !resp) return
        if (resp.suc && !resp.warning) {
          this.chCnt = resp.data.chat
          this.callCnt = resp.data.call
        } else if (!silent) {
          this.$message[resp.suc ? "warning" : "error"](resp.warning || resp.info)
        }
      } finally {
        loadings.forEach((item) => item.close())
      }
    },
    chartOption() {
      const textStyle = { color: getCssVar("--text-color"), fontSize: 14 }
      return {
        title: { text: "消息/调用统计", textStyle: { color: getCssVar("--primary-color"), fontSize: 16 } },
        tooltip: {
          trigger: "axis",
          backgroundColor: getCssVar("--el-bg-color-overlay"),
          borderColor: getCssVar("--border-color-light"),
          borderWidth: 1,
          textStyle,
        },
        legend: { data: ["消息统计", "调用统计"], textStyle },
        grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true, backgroundColor: getCssVar("--bg-color-secondary") },
        toolbox: {
          feature: { saveAsImage: { title: "保存图片", pixelRatio: 2 } },
          iconStyle: { borderColor: getCssVar("--primary-color-light") },
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: this.chatAndCallMonth.date || [],
          axisLine: { lineStyle: { color: getCssVar("--border-color") } },
          axisLabel: { color: getCssVar("--text-color-secondary"), fontSize: 12 },
        },
        yAxis: [valueAxis("消息统计"), valueAxis("调用统计", "right")],
        series: [
          lineSeries("消息统计", this.chatAndCallMonth.chat || [], 0, "--primary-color", "--primary-color-light", "--el-fill-color-light"),
          lineSeries("调用统计", this.chatAndCallMonth.call || [], 1, "--primary-color-light", "--el-fill-color", "--el-fill-color-lighter"),
        ],
      }
    },
    renderChart() {
      if (this.destroyed || !this.chart) return
      this.chart.setOption(this.chartOption(), true)
      this.$nextTick(() => {
        if (!this.destroyed && this.chart) this.chart.resize()
      })
    },
  },
}
</script>

<style scoped>
.mid-info {
  background-color: var(--bg-color);
}

.metric-panel {
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  background: var(--bg-color-secondary);
}

.message-area,
.function-area,
.chart-area {
  transition: height 0.3s ease, font-size 0.3s ease;
}

.title-box {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.text-md {
  font-size: 1rem;
  line-height: 1.5;
}

.text-sm {
  font-size: 0.875rem;
  line-height: 1.5;
}

.text-xs {
  font-size: 0.75rem;
  line-height: 1.5;
}

.progress-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 移动端响应式样式 */
@media (max-width: 640px) {
  .message-area,
  .function-area {
    padding: 12px;
  }

  .title-box {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .title-box span {
    margin-left: 0;
    margin-top: 4px;
    width: 100%;
  }

  .progress-container {
    min-width: 60px;
    max-width: 80px;
  }

  .grid-cols-2 {
    gap: 8px;
  }
}

/* 平板响应式样式 */
@media (max-width: 1024px) and (min-width: 641px) {
  .message-area,
  .function-area {
    padding: 12px;
  }
}

/* 自定义滚动条 */
.mid-info::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.mid-info::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb-color);
  border-radius: 9999px;
}

.mid-info::-webkit-scrollbar-track {
  background-color: var(--bg-color);
}

/* 打印样式 */
@media print {
  .mid-info {
    background-color: white !important;
  }

  .message-area,
  .function-area,
  .chart-area {
    border: 1px solid var(--border-color) !important;
    box-shadow: none !important;
  }
}
</style>
