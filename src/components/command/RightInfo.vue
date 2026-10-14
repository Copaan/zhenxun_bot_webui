<template>
  <div
    class="right-info p-2 md:p-4 h-full"
    ref="rightInfo"
    :style="{ backgroundColor: 'var(--bg-color)' }"
  >
    <!-- 机器人信息卡片 - 三行垂直布局 -->
    <div
      class="base-info command-surface p-3 mb-3"
      :style="{
        backgroundColor: 'var(--bg-color-secondary)',
        border: '1px solid var(--border-color-light)',
      }"
    >
      <div class="space-y-2">
        <!-- 累计登录 -->
        <div class="flex items-center justify-between">
          <p
            class="text-xs font-semibold uppercase tracking-wider"
            :style="{ color: 'var(--primary-color)' }"
          >
            累计登录
          </p>
          <p
            class="text-base font-bold"
            :style="{ color: 'var(--primary-color)' }"
          >
            {{ botInfo.connect_count }}
          </p>
        </div>

        <!-- 连接时长 -->
        <div class="flex items-center justify-between">
          <p
            class="text-xs font-semibold uppercase tracking-wider"
            :style="{ color: 'var(--primary-color)' }"
          >
            连接时长
          </p>
          <p
            class="text-base font-bold"
            :style="{ color: 'var(--primary-color)' }"
          >
            {{ connectTime }}
          </p>
        </div>

        <!-- 连接日期 -->
        <div class="flex items-center justify-between">
          <p
            class="text-xs font-semibold uppercase tracking-wider"
            :style="{ color: 'var(--primary-color)' }"
          >
            连接日期
          </p>
          <p
            class="text-base font-bold"
            :style="{ color: 'var(--primary-color)' }"
          >
            {{ botInfo.connect_date }}
          </p>
        </div>
      </div>
    </div>

    <!-- 图表区域 - 自适应高度 -->
    <div class="chart-area" :style="{ height: computedChartAreaHeight + 'px' }">
      <!-- 活跃群聊图表 -->
      <div
        class="active-group chart-container command-surface p-4"
        :style="{
          backgroundColor: 'var(--bg-color-secondary)',
          border: '1px solid var(--border-color-light)',
        }"
      >
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between mb-3"
        >
          <p
            class="text-base font-bold mb-1 md:mb-0 flex items-center"
            :style="{ color: 'var(--primary-color)' }"
          >
            活跃群组
          </p>

          <div ref="groupType" class="flex flex-wrap gap-1">
            <button
              v-for="type in timeTypes"
              :key="'group' + type.value"
              @click="clickGroupType(type.value)"
              class="time-filter px-2 py-0.5 text-[10px] transition-all duration-200"
              :style="{
                backgroundColor:
                  selectGroupType === type.value
                    ? 'var(--primary-color)'
                    : 'var(--bg-color-hover)',
                color:
                  selectGroupType === type.value
                    ? 'var(--bg-color)'
                    : 'var(--primary-color)',
              }"
            >
              {{ type.label }}
            </button>
          </div>
        </div>

        <div
          ref="groupChart"
          class="w-full"
          :style="{ height: computedChartHeight + 'px' }"
        ></div>
      </div>

      <!-- 热门插件图表 -->
      <div
        class="hot-plugin chart-container command-surface p-4"
        :style="{
          backgroundColor: 'var(--bg-color-secondary)',
          border: '1px solid var(--border-color-light)',
        }"
      >
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between mb-3"
        >
          <p
            class="text-base font-bold mb-1 md:mb-0 flex items-center"
            :style="{ color: 'var(--primary-color)' }"
          >
            热门插件
          </p>

          <div class="flex flex-wrap gap-1">
            <button
              v-for="type in timeTypes"
              :key="'plugin' + type.value"
              @click="clickHotPluginType(type.value)"
              class="time-filter px-2 py-0.5 text-[10px] transition-all duration-200"
              :style="{
                backgroundColor:
                  selectHotPluginType === type.value
                    ? 'var(--primary-color)'
                    : 'var(--bg-color-hover)',
                color:
                  selectHotPluginType === type.value
                    ? 'var(--bg-color)'
                    : 'var(--primary-color)',
              }"
            >
              {{ type.label }}
            </button>
          </div>
        </div>

        <div
          ref="hotPluginChart"
          class="w-full h-full min-h-[200px]"
          :style="{ height: computedChartHeight + 'px' }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script>
import { debounce } from "lodash"
import { getChartOption } from "@/utils/template"
import EventBus from "@/utils/event-bus"
export default {
  name: "RightInfo",
  data() {
    return {
      chartHeight: 100,
      timeTypes: [
        { label: "全部", value: "all" },
        { label: "日", value: "day" },
        { label: "周", value: "week" },
        { label: "月", value: "month" },
        { label: "年", value: "year" },
      ],
      chartAreaHeight: 0,
      activeGroupData: [],
      hotPluginData: [],
      botInfo: {},
      connectTime: "",
      selectGroupType: "all",
      selectHotPluginType: "all",
      groupChart: null,
      hotPluginChart: null,
      groupCntInterval: null,
      timer: null,
      destroyed: false,
      resizeHandler: null,
      sidebarResizeHandler: null,
      themeChangeHandler: null,
    }
  },
  computed: {
    computedChartAreaHeight() {
      if (!this.chartAreaHeight) {
        this.handleResize()
      }
      return this.chartAreaHeight
    },
    computedChartHeight() {
      if (!this.chartHeight) {
        this.handleResize()
      }
      return this.chartHeight
    },
  },
  created() {
    this.botInfo = this.$store.state.botInfo || {}
    if (this.botInfo) {
      this.botConfig = this.botInfo.config || {}
    }
  },
  async mounted() {
    if (!this.botInfo.self_id) return
    await this.initCharts()
    if (this.destroyed) return
    this.setupResizeListener()
    this.startTimers()
    this.sidebarResizeHandler = debounce(this.handleResize, 200)
    this.themeChangeHandler = debounce(this.updateChartTheme, 200)
    EventBus.$on("sidebar-aside", this.sidebarResizeHandler)
    EventBus.$on("change-theme", this.themeChangeHandler)
  },
  beforeDestroy() {
    this.destroyed = true
    if (this.groupCntInterval) clearInterval(this.groupCntInterval)
    if (this.timer) clearInterval(this.timer)
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler)
      this.resizeHandler.cancel()
    }
    if (this.sidebarResizeHandler) {
      EventBus.$off("sidebar-aside", this.sidebarResizeHandler)
      this.sidebarResizeHandler.cancel()
    }
    if (this.themeChangeHandler) {
      EventBus.$off("change-theme", this.themeChangeHandler)
      this.themeChangeHandler.cancel()
    }
    this.groupChart?.dispose()
    this.hotPluginChart?.dispose()
    this.groupChart = null
    this.hotPluginChart = null
  },
  methods: {
    async initCharts() {
      const echarts = await this.$loadEcharts()
      if (
        this.destroyed ||
        !this.$refs.groupChart ||
        !this.$refs.hotPluginChart
      ) return
      this.groupChart = echarts.init(this.$refs.groupChart)
      this.hotPluginChart = echarts.init(this.$refs.hotPluginChart)
      this.getActiveGroupData()
      this.getHotPlugin()
    },
    updateChartTheme() {
      if (this.destroyed || !this.groupChart || !this.hotPluginChart) return
      this.groupChart.setOption(this.rankingOption("群组", this.activeGroupData), true)
      this.hotPluginChart.setOption(this.rankingOption("插件", this.hotPluginData), true)
      this.groupChart?.resize()
      this.hotPluginChart?.resize()
    },

    handleResize() {
      if (this.destroyed) return
      this.$nextTick(() => {
        if (this.destroyed) return
        if (this.$refs.rightInfo && this.$refs.groupType) {
          const infoHeight =
            this.$refs.rightInfo.querySelector(".base-info").offsetHeight
          this.chartAreaHeight =
            this.$refs.rightInfo.offsetHeight - infoHeight - 49 // 减去padding和margin
          this.chartAreaHeight = Math.max(this.chartAreaHeight, 300)
          if (this.$isMobile()) {
            this.chartAreaHeight = Math.max(this.chartAreaHeight, 400)
          }
          this.chartHeight =
            this.chartAreaHeight / 2 - this.$refs.groupType.offsetHeight - 20
          this.$nextTick(() => {
            if (this.destroyed) return
            this.groupChart?.resize()
            this.hotPluginChart?.resize()
          })
        }
      })
    },

    setupResizeListener() {
      this.resizeHandler = debounce(() => {
        this.$nextTick(() => {
          if (this.destroyed) return
          this.groupChart?.resize()
          this.hotPluginChart?.resize()
        })
      }, 200)
      window.addEventListener("resize", this.resizeHandler)
    },

    startTimers() {
      // 连接时间计时器
      if (this.botInfo.connect_time) {
        this.updateConnectTime()
        this.timer = setInterval(this.updateConnectTime, 1000)
      }

      // 数据刷新定时器
      this.groupCntInterval = setInterval(() => {
        this.getActiveGroupData(this.selectGroupType, true)
        this.getHotPlugin(this.selectHotPluginType, true)
      }, 25000)
    },

    updateConnectTime() {
      const now = Math.floor(Date.now() / 1000)
      this.connectTime = this.formatSeconds(
        now - this.botInfo.connect_time
      )
    },

    formatSeconds(seconds) {
      const h = Math.floor(seconds / 3600)
        .toString()
        .padStart(2, "0")
      const m = Math.floor((seconds % 3600) / 60)
        .toString()
        .padStart(2, "0")
      const s = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0")
      return `${h}:${m}:${s}`
    },

    clickGroupType(type) {
      this.selectGroupType = type
      this.getActiveGroupData(type)
    },

    clickHotPluginType(type) {
      this.selectHotPluginType = type
      this.getHotPlugin(type)
    },

    rankingOption(name, data) {
      const option = getChartOption()
      option.xAxis.name = name
      option.xAxis.data = data.map((item) => item.name)
      option.series[0].data = data
      return option
    },

    loadRanking(url, dateType, selector, silent) {
      if (!this.botInfo.self_id || this.destroyed) return Promise.resolve(null)
      const loading = silent ? null : this.getLoading(selector)
      return this.getRequest(`${this.$root.prefix}${url}`, {
        date_type: dateType === "all" ? null : dateType,
        bot_id: this.botInfo.storage_bot_id || this.botInfo.self_id,
      })
        .then((resp) => {
          if (this.destroyed) return null
          if (resp.suc && !resp.warning) return resp.data
          if (!silent) this.$message.warning(resp.warning || resp.info)
          return null
        })
        .catch(() => null)
        .finally(() => loading?.close())
    },

    async getActiveGroupData(dateType, silent) {
      const data = await this.loadRanking("/main/get_active_group", dateType, ".active-group", silent)
      if (!data) return
      this.activeGroupData = data.map((e) => ({ name: e.name || e.group_id, value: e.chat_num }))
      this.groupChart?.setOption(this.rankingOption("群组", this.activeGroupData), true)
    },

    async getHotPlugin(dateType, silent) {
      const data = await this.loadRanking("/main/get_hot_plugin", dateType, ".hot-plugin", silent)
      if (!data) return
      this.hotPluginData = data.map((e) => ({ name: e.name, value: e.count }))
      this.hotPluginChart?.setOption(this.rankingOption("插件", this.hotPluginData), true)
    },
  },
}
</script>

<style scoped>
.right-info {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb-color) var(--bg-color);
}

.command-surface {
  border-radius: 8px;
}

.time-filter {
  border-radius: 4px;
}

.right-info::-webkit-scrollbar {
  width: 6px;
}

.right-info::-webkit-scrollbar-track {
  background: var(--bg-color);
  border-radius: 10px;
}

.right-info::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb-color);
  border-radius: 10px;
}

.chart-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chart-container {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.base-info {
  transition: all 0.3s ease;
}

.base-info div:not(:last-child) {
  border-bottom: 1px dashed var(--border-color-light);
  padding-bottom: 8px;
}

.base-info:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--primary-shadow);
}

button {
  transition: all 0.2s ease;
}

button:hover {
  transform: scale(1.05);
}

/* 移动端适配 */
@media (max-width: 640px) {
  .right-info {
    padding: 0.75rem;
  }

  .base-info {
    padding: 0.75rem;
  }

  .chart-container {
    padding: 0.75rem;
  }
}
</style>
