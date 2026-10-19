<template>
  <div
    class="left-info-container p-4 h-full overflow-y-auto"
    :style="{ backgroundColor: 'var(--bg-color)' }"
    ref="leftInfoContainer"
  >
    <!-- 头像和信息区域 -->
    <div
      class="avatar-section command-surface p-5"
      :style="{ backgroundColor: 'var(--bg-color-secondary)' }"
    >
      <div class="flex flex-col items-center">
        <!-- 头像 -->
        <el-image
          :src="botInfo.ava_url"
          class="w-24 h-24 rounded-full border-2"
          :style="{ borderColor: 'var(--border-color)' }"
          fit="cover"
        >
          <div
            slot="error"
            class="w-full h-full flex items-center justify-center rounded-full"
            :style="{ backgroundColor: 'var(--el-fill-color)' }"
          >
            <i
              class="el-icon-picture-outline text-3xl"
              :style="{ color: 'var(--primary-color)' }"
            ></i>
          </div>
        </el-image>

        <!-- 昵称 -->
        <h2
          class="mt-4 text-xl font-bold anime-font"
          :style="{ color: 'var(--primary-color)' }"
        >
          {{ botInfo.nickname }}
        </h2>

        <!-- ID -->
        <div
          class="bot-id mt-2 px-3 py-1 text-xs font-medium"
          :style="{
            color: 'var(--primary-color)',
            background: 'var(--bg-color-hover)',
          }"
        >
          ID: {{ botInfo.self_id }}
        </div>

        <!-- 统计信息 -->
        <div
          class="w-full mt-6 grid grid-cols-3 divide-x"
          :style="{ borderColor: 'var(--border-color-light)' }"
        >
          <!-- 好友数量 -->
          <div class="text-center">
            <p
              class="text-xl font-bold"
              :style="{ color: 'var(--info-color)' }"
            >
              {{ botInfo.friend_count }}
            </p>
            <p
              class="text-xxs mt-1"
              :style="{ color: 'var(--text-color-secondary)' }"
            >
              好友数量
            </p>
          </div>

          <!-- 开关 -->
          <button
            type="button"
            class="switch-border text-center cursor-pointer"
            :disabled="statusBusy"
            :aria-label="botInfo.status ? '关闭 Bot 全局开关' : '开启 Bot 全局开关'"
            @click="handleBotStatus"
            @keydown.enter.prevent="handleBotStatus"
          >
            <svg-icon
              icon-class="switch"
              class="text-lg"
              :color="
                botInfo.status ? 'var(--success-color)' : 'var(--danger-color)'
              "
            />
            <p
              class="text-xxs mt-2"
              :style="{ color: 'var(--text-color-secondary)' }"
            >
              全局开关
            </p>
          </button>

          <!-- 群组数量 -->
          <div class="text-center">
            <p
              class="text-xl font-bold"
              :style="{ color: 'var(--success-color)' }"
            >
              {{ botInfo.group_count }}
            </p>
            <p
              class="text-xxs mt-1"
              :style="{ color: 'var(--text-color-secondary)' }"
            >
              群组数量
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 插件策略摘要 -->
    <div
      class="plugin-section"
      :style="{
        height: compact ? 'auto' : pluginSectionHeight + 'px',
        backgroundColor: 'var(--bg-color-secondary)',
      }"
    >
      <h3
        class="text-md font-bold mb-4 flex items-center"
        :style="{ color: 'var(--primary-color)' }"
      >
        <svg-icon
          icon-class="plugin"
          class="mr-2"
          color="var(--primary-color-light)"
        />
        插件策略
      </h3>

      <div class="policy-summary">
        <div class="summary-row">
          <span>当前模式</span>
          <strong>{{ policySummary.modeLabel }}</strong>
        </div>
        <div class="summary-row">
          <span>禁用插件</span>
          <strong>{{ policySummary.pluginCount }}</strong>
        </div>
        <div class="summary-row">
          <span>禁用被动技能</span>
          <strong>{{ policySummary.taskCount }}</strong>
        </div>
        <el-button
          type="primary"
          icon="el-icon-setting"
          class="w-full"
          @click="openPluginPolicy"
        >
          进入插件策略
        </el-button>
      </div>
    </div>
  </div>
</template>

<script>
import SvgIcon from "../SvgIcon/SvgIcon.vue"

export default {
  name: "LeftInfo",
  components: { SvgIcon },
  data() {
    return {
      policySummary: {
        modeLabel: "独立设置",
        pluginCount: 0,
        taskCount: 0,
      },
      botInfo: {},
      pluginSectionHeight: 0,
      compact: window.innerWidth < 768,
      statusBusy: false,
    }
  },
  created() {
    this.botInfo = this.$store.state.botInfo || {}
  },
  mounted() {
    if (this.botInfo.self_id) this.getBotModuleData()
    this.calculateHeights()
    window.addEventListener("resize", this.calculateHeights)
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.calculateHeights)
  },
  methods: {
    /**
     * 计算插件策略卡片高度，移动端改为随内容自适应
     */
    calculateHeights() {
      this.compact = window.innerWidth < 768
      if (this.compact) return
      this.$nextTick(() => {
        const container = this.$refs.leftInfoContainer
        if (container) {
          const containerHeight = container.clientHeight
          const avatarSection = container.querySelector(".avatar-section")
          const avatarHeight = avatarSection ? avatarSection.clientHeight : 0
          const padding = 16 // 根据实际padding调整

          this.pluginSectionHeight = containerHeight - avatarHeight - padding
        }
      })
    },
    handleBotStatus() {
      if (!this.botInfo.self_id || this.statusBusy) return
      this.statusBusy = true
      const loading = this.getLoading(".left-info-container")
      this.postRequest(`${this.$root.prefix}/main/change_bot_status`, {
        bot_id: this.botInfo.storage_bot_id || this.botInfo.self_id,
        status: !this.botInfo.status,
      }).then((resp) => {
        if (resp.suc) {
          if (resp.warning) {
            this.$message.warning(resp.warning)
          } else {
            this.$message.success(resp.info)
            this.botInfo.status = !this.botInfo.status
          }
        } else {
          this.$message.error(resp.info)
        }
      }).catch((error) => {
        this.$message.error(error.response?.data?.detail || error.message || "Bot 状态切换失败")
      }).finally(() => {
        this.statusBusy = false
        loading.close()
      })
    },
    getBotModuleData() {
      if (!this.botInfo.self_id) return
      var loading = this.getLoading(".left-info-container")

      this.getRequest(`${this.$root.prefix}/main/get_bot_block_module`, {
        bot_id: this.botInfo.storage_bot_id || this.botInfo.self_id,
      }).then((resp) => {
        if (resp.suc) {
          if (resp.warning) {
            this.$message.warning(resp.warning)
          } else {
            this.policySummary = {
              modeLabel:
                resp.data.policy_mode === "linked"
                  ? resp.data.policy_name || "共享策略"
                  : "独立设置",
              pluginCount: resp.data.block_plugins.length,
              taskCount: resp.data.block_tasks.length,
            }
          }
        } else {
          this.$message.error(resp.info)
        }
      }).catch((error) => {
        this.$message.error(error.response?.data?.detail || error.message || "插件策略状态加载失败")
      }).finally(() => {
        loading.close()
      })
    },
    openPluginPolicy() {
      const botId = this.botInfo.storage_bot_id || this.botInfo.self_id
      this.$router.push({ path: "/plugin-policy", query: { bot_id: botId } })
    },
  },
}
</script>

<style scoped>
/* 自定义字体 */

.switch-border {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.left-info-container {
  @apply flex flex-col h-full p-4 overflow-hidden;
  gap: 12px;
}

.command-surface,
.plugin-section {
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  background: var(--bg-color-secondary);
}

.policy-summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color-light);
  color: var(--text-color-secondary);
  font-size: 13px;
}

.summary-row strong {
  color: var(--text-color);
  font-weight: 600;
}

.avatar-section {
  flex-shrink: 0;
}

.plugin-section {
  @apply p-5 overflow-y-auto;
  flex-grow: 1;
  min-height: 300px;
}

.bot-id {
  border-radius: 6px;
}

@media (max-width: 767px) {
  .left-info-container {
    padding: 0;
    overflow: visible;
  }

  .plugin-section {
    flex-grow: 0;
    min-height: 0;
    overflow: visible;
  }
}

.anime-font {
  font-family: "Mochiy Pop P One", sans-serif;
  font-size: var(--font-size-xl);
  line-height: var(--line-height-dense);
}
</style>
