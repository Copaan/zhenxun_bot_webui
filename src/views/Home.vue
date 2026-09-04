<template>
  <div class="min-h-screen" :style="{ background: 'var(--bg-color)' }">
    <div class="flex">
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
          <div class="flex items-center space-x-4">
            <el-tooltip :content="startupSummary.detail" placement="bottom">
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
                  v-for="theme in themes"
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

            <!-- 账号切换 -->
            <el-dropdown
              v-if="botState === 'ready'"
              placement="bottom-end"
              trigger="click"
              class="bot-switch-dropdown"
              @command="selectBot"
            >
              <div class="bot-switch flex items-center cursor-pointer group">
                <span class="mr-2" :style="{ color: 'var(--text-color)' }">切换账号</span>
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
                    <span>{{ bot.runtime_bot_id }} · {{ bot.platform === "qq_official" ? "QQ_Official" : "OneBot V11" }}</span>
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
                  >{{ botInfo.nickname || "用户" }}</span
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
            :key="rvKey"
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
        <div v-if="startupReport.current_operation" class="startup-current-operation">
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
            <span>活动资源</span>
            <strong>{{ lifecycleActiveResources }}</strong>
          </div>
          <div class="startup-report-row">
            <span>当前变更</span>
            <strong>{{ lifecycleStatus.current_mutation?.kind || "无" }}</strong>
          </div>
          <div class="startup-report-row">
            <span>活动作用域</span>
            <strong>{{ lifecycleStatus.active_scope_count || 0 }}</strong>
          </div>
          <div class="startup-report-row">
            <span>后台操作</span>
            <strong>{{ lifecycleStatus.operation_registry?.active_count || 0 }}</strong>
          </div>
          <div class="startup-report-row">
            <span>所有权覆盖</span>
            <strong>{{ lifecycleStatus.ownership?.coverage_percent ?? 100 }}%</strong>
          </div>
          <div class="startup-report-row">
            <span>文件监听</span>
            <strong>
              {{ lifecycleStatus.plugin_runtime?.watcher?.mode || "未知" }} /
              {{ lifecycleStatus.plugin_runtime?.watcher?.state || "未知" }}
            </strong>
          </div>
          <div
            v-if="lifecycleStatus.ownership?.unowned_resource_count"
            class="startup-failures"
          >
            {{ lifecycleStatus.ownership.unowned_resource_count }} 项长期资源尚未归属
          </div>
          <div v-if="lifecycleStatus.recovery_required?.length" class="startup-failures">
            需要恢复：{{ lifecycleStatus.recovery_required.join("、") }}
          </div>
          <div v-if="lifecycleUnhealthyComponents.length" class="startup-failures">
            {{ lifecycleUnhealthyComponents.join("、") }}
          </div>
          <div v-if="sharedDependencyConflicts.length" class="startup-failures">
            共享依赖冲突：{{ sharedDependencyConflicts.join("、") }}
          </div>
        </section>
        <section
          v-if="lifecycleStatus.operation_registry?.operations?.length"
          class="startup-report-section"
        >
          <h3>后台操作</h3>
          <div
            v-for="operation in lifecycleStatus.operation_registry.operations.slice(-8).reverse()"
            :key="operation.operation_id"
            class="startup-operation-row"
          >
            <span>{{ operation.kind }}</span>
            <strong :class="`is-${operation.state}`">{{ operation.phase }}</strong>
          </div>
        </section>
        <section v-if="startupDegradedReasons.length" class="startup-report-section">
          <h3>降级原因</h3>
          <div
            v-for="reason in startupDegradedReasons"
            :key="`${reason.stage}-${reason.source_type}-${reason.source_id}-${reason.code}`"
            class="startup-operation-row"
          >
            <span>{{ degradedReasonLabel(reason) }}</span>
            <strong class="is-failed">{{ reason.code }}</strong>
          </div>
        </section>
        <section v-if="lifecycleStatus.process" class="startup-report-section">
          <h3>运行健康</h3>
          <div class="startup-report-row">
            <span>异步任务</span>
            <strong>{{ lifecycleStatus.process.asyncio_task_count || 0 }}</strong>
          </div>
          <div class="startup-report-row">
            <span>线程</span>
            <strong>{{ lifecycleStatus.process.thread_count || 0 }}</strong>
          </div>
          <div class="startup-report-row">
            <span>子进程</span>
            <strong>{{ lifecycleStatus.process.child_process_count || 0 }}</strong>
          </div>
          <div class="startup-report-row">
            <span>事件循环延迟</span>
            <strong>{{ formatDuration(lifecycleStatus.process.event_loop_lag_ms) }}</strong>
          </div>
          <template v-if="launcherWorkerProcess">
            <div class="startup-report-row">
              <span>Worker spawn PID</span>
              <strong>{{ launcherWorkerProcess.spawn_pid || "-" }}</strong>
            </div>
            <div class="startup-report-row">
              <span>Worker runtime PID</span>
              <strong>{{ launcherWorkerProcess.runtime_pid || "-" }}</strong>
            </div>
          </template>
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
import BotRequiredState from "@/components/common/BotRequiredState"
import PluginOperationDialog from "@/components/store/PluginOperationDialog"
import logoUrl from "@/assets/image/logo.png"
import EventBus from "@/utils/event-bus"
import { clearCookie } from "@/utils/api"
import { getHeaderHeight } from "@/utils/utils"
import { hasDirtyState } from "@/utils/dirty-state"
import { startRestartRecovery } from "@/utils/restart-recovery"
export default {
  name: "MainHome",
  components: { AccountSecurityDialog, BotRequiredState, PluginOperationDialog },
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
        process: null,
        operation_registry: { operations: [], active_count: 0 },
      },
      startupDrawerVisible: false,
      startupReportLoading: false,
      startupPollTimer: null,
      asideShow: false,
      isCollapsed: false,
      isMobile: false,
      collapsePreference: null,
      rvKey: 0,
      menus: [],
      botList: [],
      botInfo: {},
      botState: "loading",
      botInitialized: false,
      botRequestSequence: 0,
      restartAvailable: false,
      restartLoading: false,
      pendingRestartCount: 0,
      pendingRestartReasons: [],
      firstLoad: true,
      windowHeight: window.innerHeight,
      themes: [
        {
          value: "pink",
          label: "真寻可爱",
          icon: "el-icon-present",
          color: "#F59E0B",
        },
        {
          value: "dark",
          label: "暗黑模式",
          icon: "el-icon-moon",
          color: "#6B7280",
        },
        {
          value: "light",
          label: "亮色模式",
          icon: "el-icon-sunny",
          color: "#F59E0B",
        },
        {
          value: "one-dark",
          label: "One Dark",
          icon: "el-icon-monitor",
          color: "#7C3AED",
        },
      ],
    }
  },
  watch: {
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
    routeRequiresBot() {
      return this.$route.matched.some((record) => record.meta.requiresBot)
    },
    requiredCapability() {
      const record = [...this.$route.matched]
        .reverse()
        .find((item) => item.meta.requiredCapability)
      return record ? record.meta.requiredCapability : ""
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
      if (state === "warmup_ready") return { status: "ok", label: "全部就绪", detail: "运行时、渲染与AI预热均已完成" }
      if (state === "runtime_ready") return { status: "warning", label: "服务预热", detail: "Bot运行时已就绪，渲染与AI服务正在预热" }
      if (state === "degraded") {
        const reason = (this.startupStatus.degraded_reasons || [])[0]
        const source = reason?.display_name || reason?.source_id
        const stage = this.startupStageLabel(reason?.stage)
        return { status: "warning", label: "部分降级", detail: source ? `${stage}：${source} (${reason.code})` : `启动完成，但有 ${this.startupStatus.errors?.length || 1} 项能力降级` }
      }
      if (state === "failed") return { status: "danger", label: "启动异常", detail: "Bot运行时初始化失败，管理功能仍可用于诊断" }
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
    lifecycleReadyCount() {
      const states = this.lifecycleStatus.state_counts || {}
      return Number(states.ready || 0)
    },
    lifecycleActiveResources() {
      const resources = [
        ...(this.lifecycleStatus.components || []),
        ...(this.lifecycleStatus.dynamic_scopes || []),
      ]
      return resources.reduce((total, component) => {
        const counts = component.resource_counts || {}
        return total + Object.entries(counts).reduce(
          (sum, [key, value]) => sum + (key.endsWith(":active") ? Number(value || 0) : 0),
          0
        )
      }, 0)
    },
    lifecycleUnhealthyComponents() {
      return (this.lifecycleStatus.components || [])
        .filter((component) => ["degraded", "failed"].includes(component.state))
        .slice(0, 8)
        .map((component) => component.component_id)
    },
    launcherWorkerProcess() {
      return (this.lifecycleStatus.launcher?.process_graph || [])
        .find((process) => process.role === "worker") || null
    },
    sharedDependencyConflicts() {
      const evidence = this.lifecycleStatus.plugin_runtime?.shared_dependency_evidence || {}
      return Object.keys(evidence).slice(0, 8)
    },
    restartTooltip() {
      if (this.pendingRestartCount) return `有 ${this.pendingRestartCount} 项修改等待重启应用`
      return this.restartAvailable
        ? "重启真寻"
        : "当前不是 launcher 托管模式，请手动重启"
    },
  },
  created() {
    this.getBotInfo()
  },
  mounted() {
    this.getMenus()
    this.loadRestartStatus()
    this.loadStartupStatus()
    this.restorePluginOperation()
    this.$store.dispatch("initStatusSocket")
    window.addEventListener("resize", this.handleResize)
    window.addEventListener("zhenxun-websocket-state", this.handleSocketState)
    window.addEventListener("zhenxun-auth-expired", this.closeSockets)
    window.addEventListener("zhenxun-restart-status-changed", this.loadRestartStatus)
    const savedCollapse = localStorage.getItem("menuCollapsed")
    this.collapsePreference =
      savedCollapse == null ? null : savedCollapse === "true"
    this.applyScreenState(true)
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.handleResize)
    window.removeEventListener("zhenxun-websocket-state", this.handleSocketState)
    window.removeEventListener("zhenxun-auth-expired", this.closeSockets)
    window.removeEventListener("zhenxun-restart-status-changed", this.loadRestartStatus)
    if (this.startupPollTimer) window.clearTimeout(this.startupPollTimer)
  },
  inject: ["setAppTheme"],
  methods: {
    startupStageLabel(stage) {
      return { management: "管理阶段", runtime: "运行时", warmup: "预热阶段" }[stage] || "启动阶段"
    },
    degradedReasonLabel(reason) {
      const source = reason.display_name || reason.source_id || "未知来源"
      return `${this.startupStageLabel(reason.stage)} · ${source}`
    },
    async loadStartupStatus() {
      if (this.startupPollTimer) window.clearTimeout(this.startupPollTimer)
      try {
        const response = await this.getRequest(`${this.$root.prefix}/system/startup/status`, {}, { suppressErrorToast: true })
        if (response?.suc && response.data) this.startupStatus = response.data
        if (this.startupDrawerVisible && response?.suc && response.data) {
          this.startupReport = { ...this.startupReport, ...response.data }
        }
      } catch (error) {
        this.startupStatus = { state: "failed", stages: {}, errors: [{ code: "status_unavailable" }] }
      }
      if (!["warmup_ready", "degraded", "failed"].includes(this.startupStatus.state)) {
        this.startupPollTimer = window.setTimeout(this.loadStartupStatus, 1200)
      }
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
    async restorePluginOperation() {
      let saved
      try { saved = JSON.parse(sessionStorage.getItem("zhenxun_plugin_operation") || "null") } catch (error) { saved = null }
      if (!saved?.operationId) return
      const context = { action: saved.action || "install", pluginName: saved.pluginName || "插件" }
      try {
        const response = await this.getRequest(`${this.$root.prefix}/store/operations/${saved.operationId}`, {}, { suppressErrorToast: true })
        if (response?.suc && response.data) {
          const entry = response.data
          if (entry.status === "running") {
            this.$store.commit("START_PLUGIN_OPERATION", { ...context, title: "插件操作仍在进行", message: "页面已恢复操作进度，请等待后端完成。" })
            return
          }
          const result = entry.result || {}
          const pending = result.apply_mode === "restart_pending"
          this.$store.commit("START_PLUGIN_OPERATION", { ...context, title: "插件操作结果", message: "正在恢复上次操作结果。" })
          this.$store.commit("FINISH_PLUGIN_OPERATION", {
            status: result.apply_mode === "failed" ? "error" : pending ? "pending" : "success",
            title: result.apply_mode === "failed" ? "插件操作失败" : pending ? "插件事务等待重启" : "插件操作完成",
            message: pending ? "插件修改已暂存，明确重启后统一应用。" : result.apply_mode === "failed" ? "操作失败，运行版本已保留或回滚。" : "插件运行时变更已经生效。",
            applyMode: result.apply_mode,
            restartAvailable: result.restart_available,
            accessUrls: result.access_urls || [],
            accessTargets: result.access_targets || [],
          })
          return
        }
        const pendingResponse = await this.getRequest(`${this.$root.prefix}/store/transactions/pending`, {}, { suppressErrorToast: true })
        const operations = [
          ...(pendingResponse?.data?.zhenxun?.operations || []),
          ...(pendingResponse?.data?.nonebot?.operations || []),
        ]
        if (operations.some((item) => item.operation_id === saved.operationId)) {
          this.$store.commit("START_PLUGIN_OPERATION", { ...context, title: "插件事务等待重启", message: "插件修改已暂存，明确重启后统一应用。" })
          this.$store.commit("FINISH_PLUGIN_OPERATION", { status: "pending", title: "插件事务等待重启", message: "插件修改已暂存，明确重启后统一应用。", applyMode: "restart_pending", restartAvailable: this.restartAvailable })
          return
        }
      } catch (error) {
        return
      }
      sessionStorage.removeItem("zhenxun_plugin_operation")
    },
    handleSocketState(event) {
      const channel = event.detail?.channel
      if (channel && Object.prototype.hasOwnProperty.call(this.socketStates, channel)) {
        this.$set(this.socketStates, channel, event.detail.status)
      }
    },
    async loadRestartStatus() {
      try {
        const response = await this.getRequest(`${this.$root.prefix}/system/restart/status`, {}, { suppressErrorToast: true })
        this.restartAvailable = Boolean(response && response.suc && response.data.launcher_managed)
        this.pendingRestartCount = Number(response?.data?.pending_count || 0)
        this.pendingRestartReasons = response?.data?.pending_reasons || []
      } catch (error) {
        this.restartAvailable = false
        this.pendingRestartCount = 0
        this.pendingRestartReasons = []
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
        const response = await this.postRequest(`${this.$root.prefix}/system/restart`, {})
        if (!response || !response.suc) throw new Error(response && response.info)
        startRestartRecovery({ bootId: response.data.boot_id, accessUrls: response.data.access_urls, returnRoute: this.$route.path, message: "正在等待 launcher 启动新的真寻进程。" })
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
      clearCookie("tokenStr")
      window.sessionStorage.removeItem("isAuthenticated")
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
      this.getRequest(`${this.$root.prefix}/menu/get_menus`).then((resp) => {
        if (resp.suc) {
          if (resp.warning) {
            this.$message.warning(resp.warning)
          } else {
            this.menus = resp.data.menus
            this.$store.commit("SET_BOT_TYPE", resp.data.bot_type)
          }
        } else {
          this.$message.error(resp.info)
        }
      })
    },
    async getBotInfo(botKey) {
      const requestSequence = ++this.botRequestSequence
      if (!this.botInfo.self_id) this.botState = "loading"
      try {
        const resp = await this.getRequest(
          `${this.$root.prefix}/main/get_base_info`,
          { bot_id: botKey },
          { suppressErrorToast: true }
        )
        if (requestSequence !== this.botRequestSequence) return
        if (resp.suc) {
          this.botList = resp.data || []
          if (!this.botList.length) {
            this.botInfo = {}
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
            this.botInfo = selected
            this.$store.commit("SET_BOT", selected)
            this.botState = "ready"
          }
          this.$store.commit("CLEAR_CHAT")
          if (["/command", "/manage"].includes(this.$route.path)) {
            if (this.$route.path == "/command" && this.firstLoad) {
              this.firstLoad = false
            } else {
              this.rvKey++
            }
          }
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
      if (typeof this.setAppTheme === "function") {
        this.setAppTheme(command)
        EventBus.$emit("change-theme", {
          timestamp: Date.now(),
        })
      } else {
        console.error("setAppTheme function not provided/injected correctly.")
      }
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
