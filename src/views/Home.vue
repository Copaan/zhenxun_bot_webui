<template>
  <div class="min-h-screen" :style="{ background: 'var(--bg-color)' }">
    <div class="flex">
      <div
        v-if="isMobile && asideShow"
        class="mobile-sidebar-mask md:hidden"
        aria-hidden="true"
        @click="toggleMenu"
      ></div>
      <!-- 侧边栏 -->
      <aside
        class="app-sidebar fixed md:relative z-50 h-screen flex flex-col"
        :style="{
          width: getMenuWidth(),
          transform: getTransform(),
          backgroundColor: 'var(--bg-color-secondary)',
        }"
      >
        <button
          v-if="isMobile && asideShow"
          type="button"
          class="mobile-sidebar-close md:hidden"
          aria-label="关闭导航菜单"
          @click="toggleMenu"
        >
          <i class="el-icon-close"></i>
        </button>
        <div class="flex flex-col h-full overflow-hidden">
          <!-- 顶部内容 -->
          <div class="flex-1 overflow-y-auto">
            <div
              class="brand-area flex justify-center"
              :class="{ 'is-collapsed': isCollapsed }"
            >
              <img
                v-if="!isCollapsed"
                class="brand-logo object-contain"
                :src="logoUrl"
                alt="Logo"
              />
              <span v-else class="brand-mark" aria-label="真寻">真</span>
            </div>

            <div class="px-2 pb-4">
              <el-menu
                class="app-menu border-0"
                @select="handleSelect"
                :default-active="activeMenu"
                :background-color="'transparent'"
                :text-color="'var(--text-color-secondary)'"
                :active-text-color="'var(--primary-color)'"
                :collapse="isCollapsed"
                :collapse-transition="false"
              >
                <el-menu-item
                  v-for="menu in menus"
                  :key="menu.module"
                  :index="normalizeRoute(menu.router)"
                  class="group my-1 flex justify-center"
                  :style="{
                    backgroundColor:
                      activeMenu === normalizeRoute(menu.router)
                        ? 'var(--bg-color-hover)'
                        : 'transparent',
                  }"
                >
                  <div class="flex items-center w-full">
                    <span
                      class="h-8 w-1 rounded-full mr-4 transition-all duration-300"
                      :style="{
                        backgroundColor:
                          activeMenu === normalizeRoute(menu.router)
                            ? 'var(--primary-color)'
                            : 'transparent',
                      }"
                    ></span>
                    <svg-icon
                      :icon-class="
                        activeMenu === normalizeRoute(menu.router)
                          ? menu.icon + '-select'
                          : menu.icon
                      "
                      size="1.7em"
                      class="w-6 h-6 transition-all duration-300"
                      :style="{
                        '--icon-color':
                          activeMenu === normalizeRoute(menu.router)
                            ? 'var(--primary-color)'
                            : 'var(--text-color-secondary)',
                      }"
                      :color="
                        activeMenu === normalizeRoute(menu.router)
                          ? 'var(--primary-color)'
                          : 'var(--text-color-secondary)'
                      "
                    />
                    <span
                      v-if="!isCollapsed"
                      class="ml-3 text-lg font-medium transition-all duration-300"
                      :style="{
                        color:
                          activeMenu === normalizeRoute(menu.router)
                            ? 'var(--primary-color)'
                            : 'var(--text-color)',
                        fontWeight:
                          activeMenu === normalizeRoute(menu.router)
                            ? '600'
                            : 'normal',
                      }"
                      >{{ menu.name }}</span
                    >
                    <el-tooltip
                      v-else
                      effect="light"
                      :content="menu.name"
                      placement="right"
                      popper-class="shadow-lg"
                    >
                      <span></span>
                    </el-tooltip>
                  </div>
                </el-menu-item>
              </el-menu>
            </div>
          </div>
        </div>
      </aside>

      <!-- 主内容区 -->
      <div
        class="app-content flex-1 flex flex-col"
        :style="{
          width: contentWidth,
          overflow: 'hidden',
        }"
      >
        <!-- 顶部导航 -->
        <header
          class="app-header flex items-center justify-between sticky top-0 z-30"
          :style="{ backgroundColor: 'var(--bg-color-secondary)' }"
        >
          <!-- 移动端菜单按钮 -->
          <button
            @click="toggleMenu"
            class="md:hidden p-2 rounded-full transition-all duration-300"
            :style="{ backgroundColor: 'var(--bg-color-hover)' }"
          >
            <svg-icon
              :icon-class="!asideShow ? 'arrow-right' : 'arrow-left'"
              class="w-5 h-5 transition-transform duration-300"
              :style="{ color: 'var(--primary-color)' }"
              :class="{ 'rotate-180': asideShow }"
            />
          </button>

          <!-- 左侧功能区 -->
          <div class="flex items-center space-x-4">
            <!-- 桌面端菜单展开/收起按钮 -->
            <button
              v-if="!isMobile"
              @click="toggleCollapse"
              class="header-icon-button hidden md:flex items-center"
              :style="{ backgroundColor: 'var(--bg-color-hover)' }"
            >
              <svg-icon
                :icon-class="isCollapsed ? 'arrow-right' : 'arrow-left'"
                class="w-5 h-5 transition-transform duration-300"
                :style="{ color: 'var(--primary-color)' }"
                :class="{ 'rotate-180': isCollapsed }"
              />
            </button>

            <el-autocomplete
              v-model="menuSearch"
              class="global-search hidden sm:block"
              value-key="name"
              prefix-icon="el-icon-search"
              placeholder="搜索页面"
              :fetch-suggestions="queryMenuSearch"
              @select="selectSearchResult"
            />
            <el-tooltip content="高级地址设置" placement="bottom">
              <router-link
                :to="{ name: 'MyApi' }"
                class="address-shortcut hidden md:grid"
                aria-label="高级地址设置"
              >
                <svg-icon icon-class="server" class="w-5 h-5" />
              </router-link>
            </el-tooltip>
            <el-tooltip :content="restartTooltip" placement="bottom">
              <el-badge :value="pendingRestartCount" :hidden="!pendingRestartCount" class="restart-badge">
                <button
                  type="button"
                  class="header-icon-button"
                  :disabled="!restartAvailable || restartLoading"
                  aria-label="重启真寻"
                  @click="restartWorker"
                >
                  <i :class="restartLoading ? 'el-icon-loading' : 'el-icon-refresh-right'"></i>
                </button>
              </el-badge>
            </el-tooltip>
          </div>

          <!-- 右侧功能区 -->
          <div class="flex items-center space-x-2 md:space-x-4">
            <el-tooltip :content="startupSummary.detail" placement="bottom" :disabled="startupDrawerVisible">
              <button
                type="button"
                class="startup-status"
                :class="`is-${startupSummary.status}`"
                @click="openStartupReport"
              >
                <i></i>
                <span class="hidden lg:inline">{{ startupSummary.label }}</span>
              </button>
            </el-tooltip>
            <el-tooltip :content="socketSummary.detail" placement="bottom">
              <span class="socket-status" :class="`is-${socketSummary.status}`">
                <i></i><span class="hidden lg:inline">{{ socketSummary.label }}</span>
              </span>
            </el-tooltip>
            <!-- 主题切换 -->
            <el-dropdown
              @command="handleThemeChange"
              trigger="click"
              class="rounded-full p-2 transition-all duration-300"
              :style="{ backgroundColor: 'var(--bg-color-hover)' }"
            >
              <span class="el-dropdown-link cursor-pointer">
                <i
                  class="el-icon-magic-stick text-xl"
                  :style="{ color: 'var(--primary-color)' }"
                ></i>
              </span>
              <el-dropdown-menu
                slot="dropdown"
                  class="shadow-lg overflow-hidden"
              >
                <el-dropdown-item
                  v-for="theme in appThemes"
                  :key="theme.value"
                  :command="theme.value"
                  class="flex items-center px-4 py-2 transition-all duration-200"
                  :style="{ backgroundColor: 'var(--bg-color-hover)' }"
                >
                  <i
                    :class="theme.icon"
                    class="mr-2"
                    :style="{ color: theme.color }"
                  ></i>
                  <span :style="{ color: 'var(--text-color)' }">{{
                    theme.label
                  }}</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>

            <!-- Bot 切换 -->
            <el-dropdown
              v-if="botState === 'ready'"
              placement="bottom-end"
              trigger="click"
              class="bot-switch-dropdown"
              @command="selectBot"
            >
              <div class="bot-switch flex items-center cursor-pointer group">
                <span class="mr-2 hidden md:inline" :style="{ color: 'var(--text-color)' }">切换 Bot</span>
                <el-image
                  :src="botInfo.ava_url || logoUrl"
                  class="w-10 h-10 rounded-full object-cover border-2 shadow-sm"
                  :style="{ borderColor: 'var(--primary-color)' }"
                >
                  <img slot="error" class="w-full h-full object-cover" :src="logoUrl" alt="当前机器人头像" />
                </el-image>
                <i class="el-icon-arrow-down ml-2"></i>
              </div>
              <el-dropdown-menu slot="dropdown" class="bot-switch-menu">
                <el-dropdown-item
                  v-for="bot in botList"
                  :key="bot.bot_key"
                  :command="bot.bot_key"
                  :disabled="bot.bot_key === botInfo.bot_key"
                  class="bot-switch-item"
                >
                  <el-image
                    :src="bot.ava_url || logoUrl"
                    class="w-9 h-9 rounded-full object-cover border-2"
                    :style="{ borderColor: 'var(--primary-color-light)' }"
                  >
                    <img slot="error" class="w-full h-full object-cover" :src="logoUrl" alt="机器人头像" />
                  </el-image>
                  <div class="bot-switch-copy">
                    <strong>{{ bot.nickname }}</strong>
                    <span>{{ bot.runtime_bot_id }} · {{ bot.platform === "qq_official" ? "QQ_Official" : bot.platform === "onebot_v11" ? "OneBot V11" : bot.adapter }}</span>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>
            <button
              v-else
              type="button"
              class="bot-connect-shortcut"
              @click="navigateTo('/protocol')"
            >
              <i class="el-icon-connection"></i>
              <span class="hidden lg:inline">连接机器人</span>
            </button>

            <!-- 用户下拉菜单 -->
            <el-dropdown
              @command="dropdownClick"
              trigger="click"
              popper-class="account-dropdown-menu"
              class="rounded-full p-2 transition-all duration-300"
              :style="{ backgroundColor: 'var(--bg-color-hover)' }"
            >
              <span class="el-dropdown-link cursor-pointer flex items-center">
                <span
                  class="font-medium mx-2 transition-all duration-300"
                  :style="{ color: 'var(--text-color)' }"
                  >管理员</span
                >
                <i
                  class="el-icon-arrow-down transition-transform duration-300"
                  :style="{ color: 'var(--primary-color)' }"
                ></i>
              </span>
              <el-dropdown-menu
                slot="dropdown"
                class="account-dropdown-menu shadow-lg overflow-hidden"
              >
                <el-dropdown-item
                  command="account-security"
                  class="account-dropdown-item flex items-center"
                >
                  <i
                    class="el-icon-lock mr-2"
                    :style="{ color: 'var(--primary-color)' }"
                  ></i>
                  <span :style="{ color: 'var(--text-color)' }">账户安全</span>
                </el-dropdown-item>
                <el-dropdown-item
                  divided
                  command="logout"
                  class="account-dropdown-item account-dropdown-danger flex items-center"
                >
                  <i
                    class="el-icon-switch-button mr-2"
                    :style="{ color: 'var(--danger-color)' }"
                  ></i>
                  <span :style="{ color: 'var(--danger-color)' }"
                    >退出登录</span
                  >
                </el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>
          </div>
        </header>

        <!-- 主内容 -->
        <main
          class="flex-1 h-full p-0"
          :style="{
            backgroundColor: 'var(--bg-color)',
            height: computedHeight + 'px',
          }"
          @click="handleMainClick"
        >
          <bot-required-state
            v-if="routeBlockState"
            :state="routeBlockState"
            :has-supported-bot="hasSupportedBot"
            @configure="navigateTo('/protocol')"
            @retry="getBotInfo()"
            @switch-supported="switchToSupportedBot"
          />
          <router-view
            v-else
            class="route-surface h-full"
            :style="{
              backgroundColor: 'var(--bg-color-secondary)',
              height: computedHeight + 'px',
            }"
            :key="routeRequiresBot ? botInfo.bot_key : undefined"
          />
        </main>
      </div>
    </div>
    <account-security-dialog
      :visible.sync="accountSecurityVisible"
      @password-reset="finishLogout"
    />
    <plugin-operation-dialog />
    <el-drawer
      title="启动事务"
      :visible.sync="startupDrawerVisible"
      :size="isMobile ? '100%' : '460px'"
      custom-class="startup-drawer"
    >
      <div v-loading="startupReportLoading" class="startup-report">
        <div class="startup-report-summary">
          <strong>{{ startupSummary.label }}</strong>
          <span>{{ startupElapsed }}</span>
        </div>
        <div class="startup-report-row">
          <span>运行模式</span>
          <strong :class="{ 'is-failed': startupOperatingMode === 'management_only' }">
            {{ startupOperatingMode === "management_only" ? "仅管理面" : startupOperatingMode === "setup_only" ? "首次配置" : "正常" }}
          </strong>
        </div>
        <div class="startup-report-row">
          <span>Bot 事件入口</span>
          <strong>{{ startupReport.accepts_bot_events ? "开放" : "关闭" }}</strong>
        </div>
        <section v-if="startupReport.running_operations?.length" class="startup-report-section">
          <h3>正在并行准备</h3>
          <div v-for="operation in startupReport.running_operations" :key="operation.component_id" class="startup-report-row">
            <span>{{ operationLabel(operation) }}</span>
            <strong>进行中</strong>
          </div>
        </section>
        <div v-else-if="startupReport.current_operation" class="startup-current-operation">
          <span>当前事务</span>
          <strong>{{ operationLabel(startupReport.current_operation) }}</strong>
        </div>
        <section class="startup-report-section">
          <h3>阶段</h3>
          <div
            v-for="stage in startupStages"
            :key="stage.key"
            class="startup-report-row"
          >
            <span>{{ stage.label }}</span>
            <strong :class="`is-${stage.state}`">{{ stage.value }}</strong>
          </div>
        </section>
        <section v-if="startupReport.load_plan" class="startup-report-section">
          <h3>插件加载</h3>
          <div class="startup-report-row">
            <span>关键预载</span>
            <strong>{{ startupReport.load_plan.counts?.critical_preload || 0 }}</strong>
          </div>
          <div class="startup-report-row">
            <span>运行时加载</span>
            <strong>{{ startupReport.load_plan.counts?.runtime_load || 0 }}</strong>
          </div>
          <div class="startup-report-row">
            <span>完成进度</span>
            <strong>{{ startupReport.load_plan.completed || 0 }} / {{ startupReport.load_plan.total || 0 }}</strong>
          </div>
          <div v-if="startupReport.load_plan.failed_plugins?.length" class="startup-failures">
            {{ startupReport.load_plan.failed_plugins.join("、") }}
          </div>
        </section>
        <section v-if="lifecycleStatus.component_count" class="startup-report-section">
          <h3>生命周期</h3>
          <div class="startup-report-row">
            <span>组件就绪</span>
            <strong>{{ lifecycleReadyCount }} / {{ lifecycleStatus.component_count }}</strong>
          </div>
          <div class="startup-report-row">
            <span>当前变更</span>
            <strong>{{ lifecycleStatus.current_mutation?.kind || "无" }}</strong>
          </div>
          <div v-if="lifecycleStatus.current_mutation?.phase" class="startup-report-row">
            <span>事务阶段</span>
            <strong>{{ lifecycleStatus.current_mutation.phase }}</strong>
          </div>
          <div class="startup-report-row">
            <span>插件代际</span>
            <strong>{{ lifecycleStatus.plugin_runtime?.generation || 0 }}</strong>
          </div>
          <div v-if="lifecycleStatus.plugin_runtime?.last_operation" class="startup-report-row">
            <span>最近代码与配置更新</span>
            <strong>{{ runtimeApplyLabel(lifecycleStatus.plugin_runtime.last_operation.apply_mode) }}</strong>
          </div>
          <p v-if="lifecycleStatus.plugin_runtime?.last_operation?.changed?.length" class="startup-diagnostic">
            {{ lifecycleStatus.plugin_runtime.last_operation.changed.join('、') }}
            <span v-if="lifecycleStatus.plugin_runtime.last_operation.reason"> · {{ runtimeReasonLabel(lifecycleStatus.plugin_runtime.last_operation.reason) }}</span>
          </p>
          <p v-for="reason in lifecycleStatus.plugin_runtime?.pending_restart_reasons || []" :key="reason" class="startup-failures">{{ runtimeReasonLabel(reason) }}</p>
          <NetworkStatus :status="lifecycleStatus.network || {}" />
          <div v-if="lifecycleUnhealthyComponents.length" class="startup-failures">
            {{ lifecycleUnhealthyComponents.join("、") }}
          </div>
        </section>
        <section v-if="startupDegradedReasons.length" class="startup-report-section">
          <h3>降级原因</h3>
          <article
            v-for="reason in startupDegradedReasons"
            :key="`${reason.stage}-${reason.source_type}-${reason.source_id}-${reason.code}`"
            class="startup-diagnostic"
          >
            <div class="startup-diagnostic-heading">
              <strong>{{ degradedReasonLabel(reason) }}</strong>
              <time>{{ formatDiagnosticTime(reason.occurred_at) }}</time>
            </div>
            <code>{{ reason.code }}</code>
            <template v-if="diagnosticFor(reason)">
              <p>
                <strong>{{ diagnosticFor(reason).error_type }}</strong>
                {{ diagnosticFor(reason).summary }}
              </p>
              <small v-if="diagnosticDetail(diagnosticFor(reason))">
                {{ diagnosticDetail(diagnosticFor(reason)) }}
              </small>
            </template>
            <div v-if="reason.diagnostic_id" class="startup-diagnostic-id">
              <span>{{ reason.diagnostic_id }}</span>
              <el-button
                type="text"
                size="mini"
                icon="el-icon-document-copy"
                @click="copyDiagnosticId(reason.diagnostic_id)"
              >复制诊断ID</el-button>
            </div>
          </article>
        </section>
        <section class="startup-report-section">
          <h3>慢事务</h3>
          <div v-if="!startupSlowOperations.length" class="startup-empty">暂无慢事务</div>
          <div
            v-for="operation in startupSlowOperations"
            :key="`${operation.name}-${operation.duration_ms}`"
            class="startup-operation-row"
          >
            <span>{{ operationLabel(operation) }}</span>
            <strong>{{ formatDuration(operation.duration_ms) }}</strong>
          </div>
        </section>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import AccountSecurityDialog from "@/components/account/AccountSecurityDialog"
import NetworkStatus from "@/components/system/NetworkStatus"
import BotRequiredState from "@/components/common/BotRequiredState"
import PluginOperationDialog from "@/components/store/PluginOperationDialog"
import logoUrl from "@/assets/image/logo.png"
import EventBus from "@/utils/event-bus"
import { clearAuthenticationState } from "@/utils/auth-session"
import { hasValidAuthToken } from "@/utils/auth-token"
import { getHeaderHeight } from "@/utils/utils"
import { hasDirtyState } from "@/utils/dirty-state"
import { requestRestartWithRecovery } from "@/utils/restart-flow"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"
import { pluginOperationResult } from "@/utils/plugin-operation"
export default {
  name: "MainHome",
  components: { AccountSecurityDialog, BotRequiredState, PluginOperationDialog, NetworkStatus },
  data() {
    return {
      accountSecurityVisible: false,
      logoUrl,
      menuSearch: "",
      socketStates: { status: "connecting", log: "idle", chat: "idle" },
      startupStatus: { state: "starting", stages: {}, errors: [] },
      startupReport: { state: "starting", stages: {}, errors: [] },
      lifecycleStatus: {
        component_count: 0,
        state_counts: {},
        components: [],
      },
      startupDrawerVisible: false,
      startupReportLoading: false,
      startupPollTimer: null,
      pluginOperationTimer: null, pluginOperationController: null, pluginReadSequence: 0,
      asideShow: false,
      isCollapsed: false,
      isMobile: false,
      collapsePreference: null,
      menus: [],
      botList: [],
      botState: "loading",
      botInitialized: false,
      botRequestSequence: 0,
      restartAvailable: false,
      restartLoading: false,
      pendingRestartCount: 0,
      restartStatusUnknown: false,
      restartRequestSequence: 0,
      pendingRestartReasons: [],
      windowHeight: window.innerHeight,
    }
  },
  watch: {
    '$store.state.pluginOperation.active'(active) {
      if (active) this.schedulePluginOperation()
      else if (this.$store.state.pluginOperation.applyMode === 'unknown') this.schedulePluginOperation()
      else this.pausePluginOperation()
    },
    asideShow() {
      EventBus.$emit("sidebar-aside", {
        asideShow: this.asideShow,
        timestamp: Date.now(),
      })
    },
  },
  computed: {
    activeMenu() {
      return this.normalizeRoute(this.$route.path)
    },
    botInfo() {
      return this.$store.state.botInfo || {}
    },
    routeRequiresBot() {
      return this.$route.matched.some((record) => record.meta.requiresBot)
    },
    requiredCapability() {
      const record = [...this.$route.matched]
        .reverse()
        .find((item) => item.meta.requiredCapability)
      return record ? record.meta.requiredCapability : ""
    },
    hasSupportedBot() {
      return Boolean(this.requiredCapability) && this.botList.some(
        (item) => item.capabilities?.[this.requiredCapability]
      )
    },
    routeBlockState() {
      if (!this.routeRequiresBot) return ""
      if (this.botState !== "ready") return this.botState
      if (
        this.requiredCapability &&
        !this.botInfo.capabilities?.[this.requiredCapability]
      ) {
        return "unsupported"
      }
      return ""
    },
    contentWidth() {
      if (this.isMobile) return "100%"
      return this.isCollapsed ? "calc(100% - 5.5rem)" : "calc(100% - 13.5rem)"
    },
    computedHeight() {
      return this.windowHeight - getHeaderHeight() + 7
    },
    socketSummary() {
      const state = this.socketStates.status
      if (state === "connected") {
        return { status: "ok", label: "实时通道正常", detail: "WebUI状态通道已连接" }
      }
      if (state === "reconnecting") {
        return { status: "warning", label: "正在重连", detail: "状态通道断开，正在自动重连" }
      }
      return { status: "warning", label: "正在连接", detail: "正在建立WebUI状态通道" }
    },
    startupSummary() {
      const state = this.startupStatus.state || "starting"
      if (this.startupStatus.operating_mode === "setup_only") return { status: "warning", label: "等待配置", detail: "首次配置尚未完成，Bot运行时和数据库暂未启动" }
      if (state === "warmup_ready") return { status: "ok", label: "服务正常", detail: "服务启动正常" }
      if (state === "runtime_ready") return { status: "warning", label: "服务预热", detail: "Bot运行时已就绪，渲染与AI服务正在预热" }
      if (state === "degraded") {
        const reason = (this.startupStatus.degraded_reasons || [])[0]
        const source = reason?.display_name || reason?.source_id
        const stage = this.startupStageLabel(reason?.stage)
        return { status: "warning", label: "部分降级", detail: source ? `${stage}：${source} (${reason.code})` : `启动完成，但有 ${this.startupStatus.errors?.length || 1} 项能力降级` }
      }
      if (state === "failed") return { status: "danger", label: "启动异常", detail: "Bot运行时初始化失败，管理功能仍可用于诊断" }
      if (state === "unknown") return { status: "unknown", label: "启动状态暂不可读取", detail: "启动状态接口请求失败，无法确认当前启动状态，稍后会自动重试" }
      return { status: "warning", label: "运行时初始化", detail: "WebUI与数据库已可用，Bot事件暂不处理" }
    },
    startupElapsed() {
      return this.formatDuration(this.startupReport.elapsed_ms || this.startupStatus.elapsed_ms || 0)
    },
    startupOperatingMode() {
      return this.startupReport.operating_mode || this.startupStatus.operating_mode || "normal"
    },
    startupStages() {
      const stages = this.startupReport.stages || this.startupStatus.stages || {}
      const labels = { management: "管理服务", runtime: "Bot运行时", warmup: "服务预热" }
      return ["management", "runtime", "warmup"].map((key) => {
        const stage = stages[key] || { state: "pending", duration_ms: null }
        const value = stage.state === "completed"
          ? this.formatDuration(stage.duration_ms)
          : stage.state === "failed" ? "失败" : stage.state === "running" ? "进行中" : stage.state === "skipped" ? "待首次配置" : "等待"
        return { key, label: labels[key], state: stage.state, value }
      })
    },
    startupSlowOperations() {
      return (this.startupReport.slow_operations || this.startupStatus.slow_operations || []).slice(0, 12)
    },
    startupDegradedReasons() {
      return this.startupReport.degraded_reasons || this.startupStatus.degraded_reasons || []
    },
    startupDiagnosticMap() {
      return (this.startupReport.diagnostics || []).reduce((result, diagnostic) => {
        result[diagnostic.diagnostic_id] = diagnostic
        return result
      }, {})
    },
    lifecycleReadyCount() {
      const states = this.lifecycleStatus.state_counts || {}
      return Number(states.ready || 0)
    },
    lifecycleUnhealthyComponents() {
      return (this.lifecycleStatus.components || [])
        .filter((component) => ["degraded", "failed"].includes(component.state))
        .slice(0, 8)
        .map((component) => component.component_id)
    },
    restartTooltip() {
      if (this.restartStatusUnknown) return this.pendingRestartCount ? `有 ${this.pendingRestartCount} 项修改等待重启应用；当前状态暂不可确认` : "重启状态暂不可确认"
      if (this.pendingRestartCount) {
        return this.restartAvailable
          ? `有 ${this.pendingRestartCount} 项修改等待重启应用`
          : `有 ${this.pendingRestartCount} 项修改等待重启应用；当前不是 launcher 托管模式，请手动重启`
      }
      return this.restartAvailable
        ? "重启真寻"
        : "当前不是 launcher 托管模式，请手动重启"
    },
  },
  created() {
    this.getBotInfo()
  },
  mounted() {
    this._stopNetworkWatch = onBusinessNetworkChange(this.handleRecoveryNetwork)
    this.getMenus()
    this.loadRestartStatus()
    this.loadStartupStatus()
    this.restorePluginOperation()
    this.$store.dispatch("initStatusSocket")
    window.addEventListener("resize", this.handleResize)
    window.addEventListener("zhenxun-websocket-state", this.handleSocketState)
    window.addEventListener("zhenxun-auth-expired", this.closeSockets)
    document.addEventListener("visibilitychange", this.pluginOperationVisibility)
    window.addEventListener("zhenxun-restart-status-changed", this.loadRestartStatus)
    const savedCollapse = localStorage.getItem("menuCollapsed")
    this.collapsePreference =
      savedCollapse == null ? null : savedCollapse === "true"
    this.applyScreenState(true)
  },
  beforeDestroy() {
    this.pausePluginOperation()
    document.removeEventListener("visibilitychange", this.pluginOperationVisibility)
    this._stopNetworkWatch?.()
    window.removeEventListener("resize", this.handleResize)
    window.removeEventListener("zhenxun-websocket-state", this.handleSocketState)
    window.removeEventListener("zhenxun-auth-expired", this.closeSockets)
    window.removeEventListener("zhenxun-restart-status-changed", this.loadRestartStatus)
    if (this.startupPollTimer) window.clearTimeout(this.startupPollTimer)
  },
  inject: ["setAppTheme", "appThemes"],
  methods: {
    runtimeApplyLabel(mode) {
      return { hot_reloaded: "插件已热重载", config_reloaded: "配置已应用", component_restarted: "组件已重建", webui_refresh: "页面资源已更新", restart_pending: "等待重启", restart_requested: "已请求重启", failed: "更新失败", rolled_back: "更新已回滚" }[mode] || "状态未确认"
    },
    runtimeReasonLabel(reason) {
      const labels = { dependencies_changed: "依赖声明变化，需要重启", plugin_dependencies_changed: "插件依赖变化，需要重启", builtin_plugin: "内置插件变化，需要重启", library_plugin: "库插件变化，需要重启", orm_model_changed: "数据库模型变化，需要重启", orm_model_new_plugin: "新插件包含数据库模型，需要重启", external_patch: "插件修改了外部模块，需要重启", thread_or_process: "插件使用了线程或进程，需要重启", dependency_missing: "缺少第三方依赖，需要安装后重启", plugin_not_hot_reloadable: "此插件不能安全热重载", import_time_config_consumer_requires_restart: "配置消费者需要重启", component_rollback_failed: "组件重建失败，需要重启", plugin_classification_miss: "插件需在启动早期加载，重启后生效" }
      if (String(reason).startsWith("environment:")) return `环境配置 ${reason.slice(12)} 需要重启`
      return labels[reason] || `更新原因：${reason}`
    },
    handleRecoveryNetwork(frozen) {
      this.pausePluginOperation()
      if (this.startupPollTimer) window.clearTimeout(this.startupPollTimer)
      this.startupPollTimer = null
      if (!frozen && !this._isDestroyed && !this._isBeingDestroyed) {
        this.loadStartupStatus()
        this.loadRestartStatus()
        this.$store.dispatch("initStatusSocket")
        this.restorePluginOperation()
      }
    },
    startupStageLabel(stage) {
      return { management: "管理阶段", runtime: "运行时", warmup: "预热阶段" }[stage] || "启动阶段"
    },
    degradedReasonLabel(reason) {
      const source = reason.display_name || reason.source_id || "未知来源"
      return `${this.startupStageLabel(reason.stage)} · ${source}`
    },
    diagnosticFor(reason) {
      return this.startupDiagnosticMap[reason.diagnostic_id] || null
    },
    diagnosticDetail(diagnostic) {
      const details = diagnostic?.details || {}
      if (details.filename) {
        const position = [details.line, details.column].filter(Boolean).join(":")
        return `${details.filename}${position ? ` · ${position}` : ""}`
      }
      if (details.fields?.length) return `字段：${details.fields.join("、")}`
      return ""
    },
    formatDiagnosticTime(value) {
      if (!value) return ""
      try { return new Date(value).toLocaleString("zh-CN", { hour12: false }) } catch (error) { return value }
    },
    async copyDiagnosticId(value) {
      try {
        await navigator.clipboard.writeText(value)
      } catch (error) {
        const input = document.createElement("textarea")
        input.value = value
        input.style.position = "fixed"
        input.style.opacity = "0"
        document.body.appendChild(input)
        input.select()
        document.execCommand("copy")
        input.remove()
      }
      this.$message.success("诊断ID已复制")
    },
    async loadStartupStatus() {
      if (this.startupPollTimer) window.clearTimeout(this.startupPollTimer)
      this.startupPollTimer = null
      if (isBusinessNetworkFrozen() || !hasValidAuthToken() || this._isDestroyed || this._isBeingDestroyed) return
      const epoch = businessNetworkEpoch()
      try {
        const response = await this.getRequest(`${this.$root.prefix}/system/startup/status`, {}, { suppressErrorToast: true })
        if (isBusinessNetworkFrozen() || !hasValidAuthToken() || epoch !== businessNetworkEpoch()) return
        if (response?.suc && response.data) this.startupStatus = response.data
        if (this.startupDrawerVisible && response?.suc && response.data) {
          this.startupReport = { ...this.startupReport, ...response.data }
        }
      } catch (error) {
        if (isBusinessNetworkFrozen() || !hasValidAuthToken() || epoch !== businessNetworkEpoch()) return
        this.startupStatus = { state: "unknown", stages: {}, errors: [{ code: "status_unavailable" }] }
      }
      if (isBusinessNetworkFrozen() || !hasValidAuthToken() || this._isDestroyed || this._isBeingDestroyed) return
      const settled = ["warmup_ready", "degraded", "failed", "unknown"].includes(this.startupStatus.state)
      this.startupPollTimer = window.setTimeout(this.loadStartupStatus, settled ? 10000 : 1200)
    },
    async openStartupReport() {
      this.startupDrawerVisible = true
      this.startupReportLoading = true
      this.startupReport = { ...this.startupStatus }
      try {
        const [response, lifecycleResponse] = await Promise.all([
          this.getRequest(
            `${this.$root.prefix}/system/startup/report`,
            {},
            { suppressErrorToast: true }
          ),
          this.getRequest(
            `${this.$root.prefix}/system/lifecycle/status`,
            {},
            { suppressErrorToast: true }
          ),
        ])
        if (response?.suc && response.data) this.startupReport = response.data
        if (lifecycleResponse?.suc && lifecycleResponse.data) {
          this.lifecycleStatus = lifecycleResponse.data
        }
      } finally {
        this.startupReportLoading = false
      }
    },
    operationLabel(operation) {
      const labels = {
        "warmup:renderer": "浏览器与渲染准备",
        "warmup:resources": "资源完整性检查",
        "warmup:runtime_index": "运行索引准备",
        "warmup:ai": "AI 服务准备",
        "warmup:ai_sandbox": "AI 沙箱准备",
        "runtime:legacy_data": "旧业务数据修复"
      }
      if (labels[operation.name]) return labels[operation.name]
      const plugin = operation.details?.plugin_id
      if (plugin) return plugin
      return String(operation.name || "启动事务")
        .replace(/^plugin_import:/, "")
        .replace(/^native_(prebind_)?(startup|ready):/, "")
    },
    formatDuration(value) {
      const duration = Number(value || 0)
      return duration >= 1000
        ? `${(duration / 1000).toFixed(2)} s`
        : `${Math.round(duration)} ms`
    },
    pausePluginOperation() {
      this.pluginReadSequence++; clearTimeout(this.pluginOperationTimer); this.pluginOperationTimer = null
      this.pluginOperationController?.abort(); this.pluginOperationController = null
    },
    pluginOperationVisibility() { if (document.hidden) this.pausePluginOperation(); else this.restorePluginOperation() },
    schedulePluginOperation() {
      clearTimeout(this.pluginOperationTimer)
      if (!this._isDestroyed && !this._isBeingDestroyed && !document.hidden && !isBusinessNetworkFrozen() && hasValidAuthToken()) this.pluginOperationTimer = setTimeout(() => this.restorePluginOperation(), 1500)
    },
    async restorePluginOperation() {
      this.pausePluginOperation()
      if (this._isDestroyed || this._isBeingDestroyed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      let saved
      const raw = sessionStorage.getItem("zhenxun_plugin_operation")
      try { saved = JSON.parse(raw || "null") } catch (error) { saved = null }
      if (!saved?.operationId) return
      const sequence = this.pluginReadSequence
      const current = () => sequence === this.pluginReadSequence && raw === sessionStorage.getItem('zhenxun_plugin_operation') && !document.hidden && !isBusinessNetworkFrozen() && hasValidAuthToken()
      const controller = new AbortController(); this.pluginOperationController = controller
      const options = { signal: controller.signal, suppressErrorToast: true }
      const context = { action: saved.action || "install", pluginName: saved.pluginName || "插件" }
      try {
        const response = await this.getRequest(`${this.$root.prefix}/store/operations/${saved.operationId}`, {}, options)
        if (!current()) return
        if (response?.suc && response.data) {
          const entry = response.data
          if (entry.status === "running") {
            this.$store.commit("START_PLUGIN_OPERATION", { ...context, title: "插件操作仍在进行", message: "页面已恢复操作进度，请等待后端完成。" })
            this.schedulePluginOperation()
            return
          }
          this.$store.commit("START_PLUGIN_OPERATION", { ...context, title: "插件操作结果", message: "正在恢复上次操作结果。" })
          this.$store.commit("FINISH_PLUGIN_OPERATION", pluginOperationResult(entry, this.restartAvailable, saved.store))
          return
        }
        const pendingResponse = await this.getRequest(`${this.$root.prefix}/store/transactions/pending`, {}, options)
        if (!current()) return
        const store = ['zhenxun', 'nonebot'].find(key => pendingResponse?.data?.[key]?.operations?.some(operation => operation.operation_id === saved.operationId))
        const transaction = store && pendingResponse.data[store]
        if (transaction) {
          const mode = { pending_restart: 'restart_pending', migration_blocked: 'restart_pending', verification_pending: 'verifying', building: 'preparing', committed: 'applied', cleanup_pending: 'applied', recovery_required: 'recovery_required', failed: transaction.rollback_confirmed ? 'rolled_back' : 'failed' }[transaction.state]
          this.$store.commit("START_PLUGIN_OPERATION", { ...context, ...this.pluginTransactionNotice(transaction) })
          if (['verifying', 'preparing'].includes(mode)) this.schedulePluginOperation()
          else this.$store.commit("FINISH_PLUGIN_OPERATION", pluginOperationResult({ status: transaction.state, result: { apply_mode: mode, transaction_state: transaction.state, cleanup_error: transaction.cleanup_error } }, this.restartAvailable, store))
          return
        }
      } catch (error) {
        if (!current()) return
      }
      this.$store.commit("START_PLUGIN_OPERATION", context)
      this.$store.commit("FINISH_PLUGIN_OPERATION", pluginOperationResult({}, this.restartAvailable, saved.store))
      this.schedulePluginOperation()
    },
    /**
     * 按插件事务状态生成恢复进度提示
     * @param {Object} transaction 待处理插件事务
     * @returns {{title: string, message: string}} 提示标题与说明
     */
    pluginTransactionNotice(transaction) {
      const notices = {
        building: ["插件事务正在准备", "正在构建插件依赖，请等待完成。"],
        pending_restart: ["插件事务等待重启", "插件修改已暂存，重启后统一应用。"],
        migration_blocked: ["插件事务被迁移阻塞", "数据库迁移未完成，插件修改暂未应用，请处理迁移后重启。"],
        verification_pending: ["插件事务等待验证", "插件修改已应用，正在等待新进程启动验证。"],
        committed: ["插件事务已完成", "插件修改已生效。"],
        cleanup_pending: ["插件事务已完成", "插件修改已生效，旧文件清理待完成。"],
        recovery_required: ["插件事务需要恢复", "插件事务未能完成，需要恢复后才能继续操作。"],
        failed: ["插件事务失败", transaction.rollback_confirmed ? "插件修改应用失败，已回滚。" : "插件修改应用失败，回滚尚未确认。"],
      }
      const [title, message] = notices[transaction.state] || ["插件事务状态未确认", "正在恢复上次插件操作结果。"]
      return { title, message }
    },
    handleSocketState(event) {
      const channel = event.detail?.channel
      if (channel && Object.prototype.hasOwnProperty.call(this.socketStates, channel)) {
        this.$set(this.socketStates, channel, event.detail.status)
      }
    },
    async loadRestartStatus() {
      if (isBusinessNetworkFrozen()) return
      const request = ++this.restartRequestSequence
      const epoch = businessNetworkEpoch()
      try {
        const response = await this.getRequest(`${this.$root.prefix}/system/restart/status`, {}, { suppressErrorToast: true })
        if (request !== this.restartRequestSequence || isBusinessNetworkFrozen() || epoch !== businessNetworkEpoch()) return
        if (!response?.suc || !response.data || !Number.isInteger(response.data.pending_count) || response.data.pending_count < 0) throw new Error("restart_status_unavailable")
        this.restartStatusUnknown = false
        this.restartAvailable = Boolean(response && response.suc && response.data.launcher_managed)
        this.pendingRestartCount = Number(response?.data?.pending_count || 0)
        this.pendingRestartReasons = response?.data?.pending_reasons || []
      } catch (error) {
        if (request !== this.restartRequestSequence || isBusinessNetworkFrozen() || epoch !== businessNetworkEpoch()) return
        this.restartAvailable = false
        this.restartStatusUnknown = true
      }
    },
    async restartWorker() {
      if (!this.restartAvailable || this.restartLoading) return
      const warning = hasDirtyState()
        ? "当前页面有尚未保存的修改，重启后这些修改会丢失。是否继续重启？"
        : "重启会短暂断开所有 Bot 和 WebUI 连接，是否继续？"
      try {
        await this.$confirm(warning, "确认重启", { type: "warning", confirmButtonText: "确认重启" })
      } catch (error) { return }
      this.restartLoading = true
      try {
        await requestRestartWithRecovery(this, {
          request: () => this.postRequest(`${this.$root.prefix}/system/restart`, {}),
          recovery: { returnRoute: this.$route.fullPath, message: "正在等待 launcher 启动新的真寻进程。" },
        })
      } catch (error) {
        this.$message.error(error.response?.data?.detail || error.message || "重启请求失败。")
      } finally {
        this.restartLoading = false
      }
    },
    selectBot(botKey) {
      this.getBotInfo(botKey)
    },
    queryMenuSearch(query, callback) {
      const keyword = String(query || "").trim().toLowerCase()
      const results = keyword
        ? this.menus.filter((menu) =>
            `${menu.name} ${menu.module}`.toLowerCase().includes(keyword)
          )
        : this.menus
      callback(results.map((menu) => ({ ...menu, value: menu.name })))
    },
    selectSearchResult(menu) {
      this.menuSearch = ""
      this.handleSelect(menu.router)
    },
    normalizeRoute(route) {
      const value = String(route || "/")
      return value.startsWith("/") ? value : `/${value}`
    },
    navigateTo(route) {
      const target = this.normalizeRoute(route)
      if (target === this.$route.path) return Promise.resolve(false)
      return new Promise((resolve) => {
        this.$router.replace(
          target,
          () => resolve(true),
          () => resolve(false)
        )
      })
    },
    dropdownClick(cmd) {
      if (cmd === "account-security") {
        this.accountSecurityVisible = true
      } else if (cmd === "logout") {
        this.finishLogout(true)
      }
    },
    closeSockets() {
      this.pausePluginOperation()
      window.clearTimeout(this.startupPollTimer)
      this.startupPollTimer = null
      this.$statusWebSocket.closeWebSocket()
      this.$logWebSocket.closeWebSocket()
      this.$chatWebSocket.closeWebSocket()
    },
    switchToSupportedBot() {
      const bot = this.botList.find(
        (item) => item.capabilities?.[this.requiredCapability]
      )
      if (bot) this.getBotInfo(bot.bot_key)
      else this.navigateTo("/protocol")
    },
    finishLogout(showMessage = false) {
      this.closeSockets()
      clearAuthenticationState()
      window.sessionStorage.removeItem("zhenxunSetupToken")
      window.sessionStorage.removeItem("zhenxunSetupRestartReceipt")
      if (showMessage === true) {
        this.$message.success("已退出登录！")
      }
      this.$router.replace("/")
    },
    getMenuWidth() {
      if (this.isCollapsed) {
        return this.isMobile ? "0rem" : "5.5rem"
      }
      return "13.5rem"
    },
    getTransform() {
      if (this.isMobile) {
        return this.asideShow ? "translateX(0)" : "translateX(-100%)"
      }
      return this.asideShow ? "translateX(0)" : "translateX(-1%)"
    },
    handleResize() {
      this.windowHeight = window.innerHeight
      this.applyScreenState(false)
    },
    applyScreenState(initial) {
      const wasMobile = this.isMobile
      this.isMobile = window.innerWidth <= 768
      if (this.isMobile) {
        if (initial || !wasMobile) this.asideShow = false
        this.isCollapsed = false
        return
      }
      this.isCollapsed =
        this.collapsePreference == null
          ? window.innerWidth <= 1280
          : this.collapsePreference
      this.asideShow = true
    },
    handleMainClick() {
      if (this.isMobile) {
        // 如果是移动端且菜单显示，点击主内容应该关闭菜单
        if (this.asideShow) {
          this.asideShow = false
          document.body.style.overflow = ""
        }
      }
    },
    async handleSelect(index) {
      const navigated = await this.navigateTo(index)
      if (navigated && this.isMobile) {
        this.asideShow = false
        document.body.style.overflow = ""
      }
    },
    toggleMenu() {
      this.asideShow = !this.asideShow
      if (this.isMobile) {
        document.body.style.overflow = this.asideShow ? "hidden" : ""
      }
    },
    toggleCollapse() {
      if (!this.isMobile) {
        this.isCollapsed = !this.isCollapsed
        this.collapsePreference = this.isCollapsed
        localStorage.setItem("menuCollapsed", this.isCollapsed)
        EventBus.$emit("sidebar-aside", {
          asideShow: !this.isCollapsed,
          timestamp: Date.now(),
        })
      }
    },
    getMenus() {
      this.getRequest(`${this.$root.prefix}/menu/get_menus`, {}, { suppressErrorToast: true }).then((resp) => {
        if (resp.suc) {
          this.menus = resp.data.menus
          this.$store.commit("SET_BOT_TYPE", resp.data.bot_type)
        } else {
          this.$message.error(resp.info)
        }
      }).catch(() => {
        this.$message.error("菜单加载失败，请刷新页面重试")
      })
    },
    async getBotInfo(botKey) {
      const requestSequence = ++this.botRequestSequence
      if (!this.botInfo.self_id) this.botState = "loading"
      try {
        const resp = await this.getRequest(
          `${this.$root.prefix}/main/get_base_info`,
          { bot_id: botKey || this.$store.state.selectedBotKey || undefined },
          { suppressErrorToast: true }
        )
        if (requestSequence !== this.botRequestSequence) return
        if (resp.suc) {
          this.botList = resp.data || []
          if (!this.botList.length) {
            this.$store.commit("SET_BOT", null)
            this.botState = "empty"
          } else {
            const persistedKey = this.$store.state.selectedBotKey
            const selected =
              this.botList.find((bot) => botKey && bot.bot_key === botKey) ||
              this.botList.find(
                (bot) => !botKey && bot.bot_key === persistedKey
              ) ||
              this.botList.find((bot) => bot.is_select) ||
              this.botList[0]
            this.botList.forEach((bot) => {
              this.$set(bot, "is_select", bot.bot_key === selected.bot_key)
            })
            this.$store.commit("SET_BOT", selected)
            this.botState = "ready"
          }
          this.$store.commit("CLEAR_CHAT")
        } else {
          this.botState = this.botInfo.self_id ? "ready" : "error"
        }
      } catch (error) {
        if (requestSequence !== this.botRequestSequence) return
        this.botState = this.botInfo.self_id ? "ready" : "error"
      } finally {
        if (requestSequence === this.botRequestSequence) this.botInitialized = true
      }
    },
    handleThemeChange(command) {
      this.setAppTheme(command)
      EventBus.$emit("change-theme", { timestamp: Date.now() })
    },
  },
}
</script>

<style scoped>
.app-sidebar,
.app-content {
  transition: width 180ms ease, transform 180ms ease;
}

.app-sidebar {
  border-right: 1px solid var(--border-color);
  box-shadow: 4px 0 18px rgba(20, 24, 31, 0.04);
}

.mobile-sidebar-mask {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: rgba(15, 23, 42, 0.45);
}

.mobile-sidebar-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-color-secondary);
  background: var(--bg-color);
}

.brand-area {
  height: 96px;
  align-items: center;
  padding: 14px 18px 8px;
}

.brand-logo {
  width: 148px;
  height: 66px;
}

.brand-area.is-collapsed {
  height: 70px;
  padding: 10px;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  color: var(--primary-color);
  background: var(--bg-color-hover);
  font-size: 17px;
  font-weight: 700;
}

.app-header {
  min-height: 64px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 10px rgba(20, 24, 31, 0.035);
}

.header-icon-button,
.bot-connect-shortcut {
  min-width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--primary-color);
  background: var(--bg-color);
}

.header-icon-button:disabled { opacity: .45; cursor: not-allowed; }
.bot-switch-menu { min-width: 280px; }.bot-switch-item { height: auto !important; padding: 8px 12px !important; line-height: 1.2 !important; }.bot-switch-item ::v-deep .el-dropdown-menu__item { display: flex; }.bot-switch-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; margin-left: 10px; }.bot-switch-copy strong, .bot-switch-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.bot-switch-copy span { color: var(--text-color-secondary); font-size: 12px; }

.route-surface {
  min-width: 0;
  overflow: auto;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: var(--primary-color-light-9);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--primary-color-light-7);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--primary-color-light-5);
}

.global-search {
  width: min(28vw, 330px);
}

::v-deep .global-search .el-input__inner {
  height: 38px;
  border-color: var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
}

.address-shortcut {
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--primary-color);
  background: var(--bg-color);
}

.socket-status,
.startup-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 767px) {
  .socket-status {
    display: none;
  }
}

.startup-status {
  min-height: 34px;
  padding: 0 6px;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.startup-status:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.socket-status i,
.startup-status i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-warning);
}

.socket-status.is-ok i,
.startup-status.is-ok i {
  background: var(--el-color-success);
}

.startup-status.is-danger i { background: var(--el-color-danger); }
.startup-status.is-unknown i { background: var(--el-color-info); }

::v-deep .startup-drawer {
  background: var(--bg-color-secondary);
  color: var(--text-color);
}

::v-deep .startup-drawer .el-drawer__body {
  min-height: 0;
  overflow: hidden;
}

.startup-report {
  height: 100%;
  overflow-y: auto;
  padding: 0 22px 28px;
}

.startup-report-summary,
.startup-current-operation,
.startup-report-row,
.startup-operation-row {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.startup-report-summary {
  padding: 4px 0 18px;
  border-bottom: 1px solid var(--border-color);
}

.startup-current-operation {
  align-items: flex-start;
  padding: 14px 0;
  color: var(--text-color-secondary);
}

.startup-current-operation strong,
.startup-operation-row span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.startup-report-section {
  padding: 18px 0 4px;
  border-top: 1px solid var(--border-color);
}

.startup-report-section h3 {
  margin: 0 0 12px;
  color: var(--text-color);
  font-size: 14px;
  letter-spacing: 0;
}

.startup-report-row,
.startup-operation-row {
  min-height: 34px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.startup-report-row strong,
.startup-operation-row strong {
  color: var(--text-color);
  font-weight: 600;
  white-space: nowrap;
}

.startup-report-row strong.is-failed,
.startup-failures {
  color: var(--danger-color);
}

.startup-failures,
.startup-empty {
  padding: 8px 0;
  overflow-wrap: anywhere;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.startup-diagnostic {
  min-width: 0;
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid var(--danger-color);
  border-radius: 6px;
  background: var(--bg-color);
}

.startup-diagnostic-heading,
.startup-diagnostic-id {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.startup-diagnostic-heading strong,
.startup-diagnostic p,
.startup-diagnostic code,
.startup-diagnostic-id span {
  overflow-wrap: anywhere;
}

.startup-diagnostic-heading strong {
  color: var(--text-color);
  font-size: 13px;
}

.startup-diagnostic-heading time,
.startup-diagnostic-id {
  color: var(--text-color-secondary);
  font-size: 11px;
}

.startup-diagnostic > code {
  display: inline-block;
  margin-top: 8px;
  color: var(--danger-color);
  font-size: 12px;
}

.startup-diagnostic p {
  margin: 8px 0 0;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.startup-diagnostic small {
  display: block;
  margin-top: 5px;
  overflow-wrap: anywhere;
  color: var(--text-color-secondary);
  font-size: 11px;
}

.startup-diagnostic p strong {
  margin-right: 5px;
  color: var(--text-color);
}

.startup-diagnostic-id {
  margin-top: 8px;
  border-top: 1px solid var(--border-color-light);
  padding-top: 6px;
}

::v-deep .el-menu-item:hover {
  background-color: var(--bg-color-hover) !important;
}
::v-deep .el-menu-item.is-active {
  background-color: var(--bg-color-hover) !important;
}

::v-deep .app-menu .el-menu-item {
  height: 46px;
  border-radius: 6px;
  line-height: 46px;
}

::v-deep .app-menu .el-menu-item span {
  letter-spacing: 0;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .el-dropdown-link span {
    display: none;
  }
}

/* 折叠菜单样式 */
::v-deep .el-menu--collapse {
  width: 73px;
}
::v-deep .el-menu--collapse .el-menu-item {
  display: flex;
  justify-content: center;
  padding: 0 10px !important;
}
::v-deep .el-menu--collapse .el-menu-item .svg-icon {
  margin-right: 0;
}

.rotate-180 {
  transform: rotate(180deg);
}
@media (max-width: 768px) {
  .app-header { min-height: 58px; padding: 10px 12px; }
  .brand-area { height: 84px; }
  .startup-diagnostic-heading { align-items: flex-start; flex-direction: column; gap: 3px; }
}
</style>

<style>
.account-dropdown-menu {
  width: 180px;
  padding: 5px !important;
  border-color: var(--border-color) !important;
  border-radius: 8px !important;
  background: var(--bg-color-secondary) !important;
}

.account-dropdown-menu .account-dropdown-item {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  margin: 0;
  padding: 0 12px !important;
  border-radius: 5px;
  line-height: 40px;
  background: transparent !important;
}

.account-dropdown-menu .account-dropdown-item:hover,
.account-dropdown-menu .account-dropdown-item:focus {
  background: var(--bg-color-hover) !important;
}

.account-dropdown-menu .account-dropdown-danger {
  margin-top: 5px;
  border-top: 1px solid var(--border-color) !important;
  border-radius: 0 0 5px 5px;
}

.account-dropdown-menu .account-dropdown-danger::before {
  display: none;
}
</style>
