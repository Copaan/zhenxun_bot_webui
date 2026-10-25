<template>
  <div
    class="detail-info p-5 h-full overflow-y-auto"
    :style="{
      background: 'var(--el-bg-color)',
    }"
  >
    <!-- 空状态 -->
    <div
      v-if="!detailType"
      class="flex flex-col items-center justify-center h-full"
    >
      <img
        :src="emptyDetailUrl"
        class="w-64 h-64 object-contain mb-4"
        alt="空空如也"
      />
      <p
        :style="{ color: 'var(--el-color-primary)' }"
        class="text-lg font-medium"
      >
        空空如也 ┐(ﾟ～ﾟ)┌
      </p>
    </div>

    <!-- 详细信息 -->
    <template v-else>
      <!-- 头像和信息区域 -->
      <div class="flex flex-col items-center mb-6">
        <el-avatar
          :src="data.ava_url"
          class="mb-4"
          :style="{
            height: sizeMana.avaSize + 'px',
            width: sizeMana.avaSize + 'px',
            border: '4px solid var(--el-color-primary-light-5)',
          }"
        ></el-avatar>

        <h2
          class="text-2xl font-bold mb-2"
          :style="{ color: 'var(--el-color-primary)' }"
        >
          {{ data.name }}
        </h2>

        <div
          class="identity-badge px-4 py-2 text-sm"
          :style="{
            background: 'var(--el-color-primary)',
            color: 'var(--el-color-white)',
          }"
        >
          {{ data.user_id || data.group_id }}
        </div>
      </div>

      <!-- 基本信息区域 -->
      <div
        class="detail-section p-4 mb-4"
        :style="{
          background: 'var(--el-bg-color-overlay)',
          border: '1px solid var(--el-border-color-light)',
        }"
      >
        <template v-if="detailType == 'private'">
          <!-- 好友信息 -->
          <div class="grid grid-cols-1 gap-4">
            <div class="flex items-center justify-between">
              <span :style="{ color: 'var(--el-text-color-regular)' }"
                >封禁状态:</span
              >
              <el-switch v-model="data.is_ban" disabled />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="flex items-center justify-between">
                <span :style="{ color: 'var(--el-text-color-regular)' }"
                  >聊天记录:</span
                >
                <span
                  :style="{ color: 'var(--el-color-primary)' }"
                  class="font-medium"
                  >{{ data.chat_count }}</span
                >
              </div>

              <div class="flex items-center justify-between">
                <span :style="{ color: 'var(--el-text-color-regular)' }"
                  >调用次数:</span
                >
                <span
                  :style="{ color: 'var(--el-color-success)' }"
                  class="font-medium"
                  >{{ data.call_count }}</span
                >
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <!-- 群组信息 -->
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="flex items-center justify-between">
              <span :style="{ color: 'var(--el-text-color-regular)' }"
                >群唤醒状态:</span
              >
              <el-switch v-model="data.status" />
            </div>

            <div class="flex items-center justify-between">
              <span :style="{ color: 'var(--el-text-color-regular)' }"
                >群等级:</span
              >
              <el-select
                v-model="data.level"
                placeholder=""
                class="w-24"
                popper-class="theme-select"
              >
                <el-option :label="-1" :value="-1"></el-option>
                <el-option
                  v-for="n in 10"
                  :label="n"
                  :value="n"
                  :key="n"
                ></el-option>
              </el-select>
            </div>

            <div class="flex items-center justify-between">
              <span :style="{ color: 'var(--el-text-color-regular)' }"
                >当前人数:</span
              >
              <span
                :style="{ color: 'var(--el-color-primary)' }"
                class="font-medium"
                >{{ data.member_count }}</span
              >
            </div>

            <div class="flex items-center justify-between">
              <span :style="{ color: 'var(--el-text-color-regular)' }"
                >最大人数:</span
              >
              <span
                :style="{ color: 'var(--el-color-success)' }"
                class="font-medium"
                >{{ data.max_member_count }}</span
              >
            </div>

            <div class="flex items-center justify-between">
              <span :style="{ color: 'var(--el-text-color-regular)' }"
                >聊天记录:</span
              >
              <span
                :style="{ color: 'var(--el-color-primary)' }"
                class="font-medium"
                >{{ data.chat_count }}</span
              >
            </div>

            <div class="flex items-center justify-between">
              <span :style="{ color: 'var(--el-text-color-regular)' }"
                >调用次数:</span
              >
              <span
                :style="{ color: 'var(--el-color-success)' }"
                class="font-medium"
                >{{ data.call_count }}</span
              >
            </div>
          </div>

          <div class="flex items-center justify-between mb-6">
            <span :style="{ color: 'var(--el-text-color-regular)' }"
              >插件与被动:</span
            >
            <el-button
              type="text"
              title="在插件策略中设置本群的插件与被动技能"
              @click="openPolicy"
              >前往插件策略</el-button
            >
          </div>

          <div class="flex justify-end">
            <CuteButton type="primary" @click="commit">应用设置</CuteButton>
          </div>
        </template>
      </div>

      <!-- 最喜爱的插件图表 -->
      <div
        class="detail-section p-4"
        :style="{
          background: 'var(--el-bg-color-overlay)',
          border: '1px solid var(--el-border-color-light)',
        }"
      >
        <h3
          class="text-lg font-bold mb-4"
          :style="{ color: 'var(--el-color-primary)' }"
        >
          最喜爱的插件
        </h3>
        <div ref="likePluginChart" class="h-80 w-full"></div>
      </div>
    </template>
  </div>
</template>

<script>
import emptyDetailUrl from "@/assets/image/empty.png"
import CuteButton from "../ui/CuteButton.vue"

import { getChartOption } from "@/utils/template"

export default {
  components: { CuteButton },
  name: "DetailInfo",
  data() {
    return {
      emptyDetailUrl,
      sizeMana: {
        avaSize: 100,
      },
      data: {},
      botId: null,
      detailType: null,
      likePluginChart: null,
      destroyed: false,
    }
  },
  created() {
    this.botId = this.$store.state.botInfo?.self_id || null
  },
  mounted() {
    window.addEventListener("resize", this.handleResize)
    this.handleResize()
  },
  methods: {
    handleResize() {
      this.sizeMana.avaSize = 100
    },
    /**
     * 打开插件策略页面并定位到当前群
     */
    openPolicy() {
      this.$router.push({ path: "/plugin-policy", query: { bot_id: this.data.bot_id || this.botId, group_id: this.data.group_id } })
    },
    commit() {
      const origin = this.data.origin
      const data = {
        group_id: this.data.group_id,
        status: this.data.status === origin.status ? null : this.data.status,
        level: this.data.level === origin.level ? null : this.data.level,
      }
      const loading = this.getLoading(".detail-info")

      this.postRequest(`${this.$root.prefix}/manage/update_group`, data)
        .then((resp) => {
          if (resp.suc) {
            this.$message.success(resp.info)
            this.getGroup(data.group_id)
          } else {
            this.$message.error(resp.info)
          }
        })
        .finally(() => loading.close())
    },
    getFriend(user_id) {
      if (!this.botId) return
      const loading = this.getLoading(".detail-info")

      this.getRequest(`${this.$root.prefix}/manage/get_friend_detail`, {
        bot_id: this.botId,
        user_id: user_id,
      }).then((resp) => {
        if (resp.suc && resp.data) {
          this.processFriendData(resp.data)
        } else {
          this.$message.warning(resp.warning || resp.info)
        }
      }).finally(() => loading.close())
    },
    getGroup(group_id) {
      if (!this.botId) return
      const loading = this.getLoading(".detail-info")

      this.getRequest(`${this.$root.prefix}/manage/get_group_detail`, {
        bot_id: this.botId,
        group_id: group_id,
      }).then((resp) => {
        if (resp.suc && resp.data) {
          this.processGroupData(resp.data)
        } else {
          this.$message.warning(resp.warning || resp.info)
        }
      }).finally(() => loading.close())
    },
    processFriendData(data) {
      data.name = data.remark || data.nickname
      this.data = data
      this.detailType = "private"
      this.initChart(data.like_plugin)
      this.$emit("startChat", this.data)
    },
    processGroupData(data) {
      data.origin = { status: data.status, level: data.level }
      this.data = data
      this.detailType = "group"
      this.initChart(data.like_plugin)
      this.$emit("startChat", this.data)
    },
    async initChart(likePluginObj) {
      const echarts = await this.$loadEcharts()
      if (this.destroyed) return
      this.$nextTick(() => {
        if (this.destroyed || !this.$refs.likePluginChart) return
        if (!this.likePluginChart) {
          this.likePluginChart = echarts.init(this.$refs.likePluginChart)
        }

        const likePluginList = Object.keys(likePluginObj)
        const chartOpt = getChartOption()

        chartOpt.xAxis.data = likePluginList
        chartOpt.series[0].data = likePluginList.map((e) => ({
          name: e,
          value: likePluginObj[e],
        }))

        this.likePluginChart.setOption(chartOpt)
        window.addEventListener("resize", this.resizeChart)
      })
    },
    resizeChart() {
      if (this.likePluginChart) {
        this.likePluginChart.resize()
      }
    },
  },
  beforeDestroy() {
    this.destroyed = true
    window.removeEventListener("resize", this.handleResize)
    window.removeEventListener("resize", this.resizeChart)
    if (this.likePluginChart) {
      this.likePluginChart.dispose()
      this.likePluginChart = null
    }
  },
}
</script>

<style scoped>
.identity-badge,
.detail-section {
  border-radius: 8px;
}

/* 美化滚动条 */
.detail-info::-webkit-scrollbar {
  width: 6px;
}

.detail-info::-webkit-scrollbar-track {
  background: var(--el-color-primary-light-9);
  border-radius: 3px;
}

.detail-info::-webkit-scrollbar-thumb {
  background: var(--el-color-primary-light-5);
  border-radius: 3px;
}

.detail-info::-webkit-scrollbar-thumb:hover {
  background: var(--el-color-primary-light-3);
}

/* 响应式调整 */
@media (max-width: 768px) {
  .detail-info {
    padding: 1rem;
  }

  .grid-cols-2 {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
/* 主题化下拉选择框样式 */
.theme-select {
  background-color: var(--el-bg-color-overlay) !important;
  border: 1px solid var(--el-border-color-light) !important;
  border-radius: 12px !important;
  box-shadow: var(--el-box-shadow-light) !important;
}

.theme-select .el-select-dropdown__item {
  color: var(--el-text-color-primary) !important;
}

.theme-select .el-select-dropdown__item.hover,
.theme-select .el-select-dropdown__item:hover {
  background-color: var(--el-color-primary-light-9) !important;
}

.theme-select .el-select-dropdown__item.selected {
  background-color: var(--el-color-primary-light-7) !important;
  color: var(--el-color-primary) !important;
  font-weight: bold;
}
</style>
