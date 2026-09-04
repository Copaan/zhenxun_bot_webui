<template>
  <section class="nonebot-store">
    <header class="store-header">
      <div>
        <h1>NoneBot 官方插件</h1>
        <p>安装 Registry 已验证版本，核心依赖受保护，共享依赖变化需确认</p>
      </div>
      <el-button icon="el-icon-refresh" :loading="loading" @click="loadPlugins(true)">检查更新</el-button>
    </header>

    <div class="store-toolbar">
      <el-input v-model.trim="search" clearable prefix-icon="el-icon-search" placeholder="搜索名称、包名、模块或作者" />
      <el-select v-model="statusFilter" aria-label="安装状态">
        <el-option label="全部状态" value="all" />
        <el-option label="未安装" value="not_installed" />
        <el-option label="已安装" value="installed" />
        <el-option label="WebUI 托管" value="managed" />
        <el-option label="可更新" value="update_available" />
        <el-option label="外部安装" value="external" />
        <el-option label="不可安装" value="blocked" />
        <el-option label="操作失败" value="failed" />
      </el-select>
      <el-select v-model="typeFilter" aria-label="插件类型">
        <el-option label="全部类型" value="all" />
        <el-option label="应用插件" value="application" />
        <el-option label="库插件" value="library" />
      </el-select>
      <el-select v-model="adapterFilter" aria-label="适配器">
        <el-option label="全部适配器" value="all" />
        <el-option v-for="adapter in enabledAdapters" :key="adapter" :label="adapterName(adapter)" :value="adapter" />
      </el-select>
      <el-checkbox v-model="includeIncompatible">显示不兼容/已失效</el-checkbox>
    </div>

    <div v-if="registryMeta.fetched_at" class="catalog-note">
      <i class="el-icon-collection-tag"></i>
      Registry 数据：{{ formatTime(registryMeta.fetched_at) }}
      <el-tag v-if="registryMeta.stale" size="mini" type="warning" effect="plain">离线缓存</el-tag>
      <el-tag v-else-if="registryMeta.cached" size="mini" type="info" effect="plain">缓存</el-tag>
      <el-tag v-if="registryMeta.invalid_entries" size="mini" type="warning" effect="plain">
        已隔离 {{ registryMeta.invalid_entries }} 条异常数据
      </el-tag>
    </div>

    <div v-if="environment" class="environment-status" :class="`is-${environmentTone}`">
      <i :class="environmentIcon"></i>
      <div>
        <strong>{{ environmentTitle }}</strong>
        <p>{{ environmentDescription }}</p>
      </div>
      <el-button v-if="environment.repairable" type="warning" plain size="small" icon="el-icon-refresh" :loading="repairing" @click="repairEnvironment">同步依赖并重启</el-button>
    </div>

    <div v-if="error" class="inline-state is-error">
      <i class="el-icon-warning-outline"></i><span>{{ error }}</span>
      <el-button type="text" @click="loadPlugins">重新加载</el-button>
    </div>

    <div v-loading="loading" class="plugin-list">
      <article v-for="plugin in plugins" :key="plugin.store_key" class="plugin-row">
        <div class="plugin-main">
          <div class="plugin-title-line">
            <h2>{{ plugin.name }}</h2>
            <el-tag v-if="plugin.is_official" size="mini" type="success" effect="plain">官方</el-tag>
            <el-tag size="mini" effect="plain">{{ typeLabel(plugin.plugin_type) }}</el-tag>
            <el-tag :type="stateTag(plugin).type" size="mini" effect="plain">{{ stateTag(plugin).label }}</el-tag>
            <el-tag v-if="plugin.compatibility_override_stale" size="mini" type="danger" effect="plain">兼容状态已变化</el-tag>
            <el-tag v-else-if="plugin.compatibility_unverified" size="mini" type="warning" effect="plain">兼容试运行</el-tag>
          </div>
          <div class="module-line">{{ plugin.project_link }} · {{ plugin.module_name }}</div>
          <p>{{ plugin.description || "暂无简介" }}</p>
          <div class="meta-line">
            <span><i class="el-icon-user"></i>{{ plugin.author || "未知作者" }}</span>
            <span><i class="el-icon-price-tag"></i>{{ plugin.version }}</span>
            <span><i class="el-icon-connection"></i>{{ adapterLabel(plugin) }}</span>
          </div>
          <div v-if="plugin.blocked_reasons.length" class="blocked-reason">
            {{ reasonLabel(plugin.blocked_reasons[0]) }}
          </div>
          <div v-if="plugin.failure_reasons && plugin.failure_reasons.length" class="blocked-reason">
            {{ reasonLabel(plugin.failure_reasons[0]) }}
            <span v-if="plugin.failure_reasons[0].paths && plugin.failure_reasons[0].paths.length">
              （{{ plugin.failure_reasons[0].paths.join("、") }}）
            </span>
          </div>
          <div v-if="plugin.pending_reasons && plugin.pending_reasons.length" class="blocked-reason">
            {{ reasonLabel(plugin.pending_reasons[0]) }}
          </div>
        </div>
        <div class="plugin-actions">
          <el-button type="text" @click="openDetail(plugin)">详情</el-button>
          <el-tooltip v-if="plugin.apply_mode === 'restart_pending'" :content="plugin.transaction_state === 'migration_blocked' ? '外部数据库迁移尚未完成；手工迁移后再次重启即可重新检查' : '事务已保存，重启并通过启动验证后生效'" placement="top">
            <span class="pending-actions">
              <el-button size="small" icon="el-icon-time" disabled>{{ plugin.transaction_state === "migration_blocked" ? "等待手工迁移" : "等待重启" }}</el-button>
              <el-button size="small" type="danger" plain icon="el-icon-close" @click="cancelPending(plugin)">取消事务</el-button>
            </span>
          </el-tooltip>
          <el-tooltip v-else-if="plugin.apply_mode === 'failed'" content="插件启动验证失败，当前运行版本已恢复" placement="top">
            <span class="pending-actions">
              <el-button size="small" icon="el-icon-warning-outline" disabled>已回滚</el-button>
              <el-button size="small" type="danger" plain icon="el-icon-delete" @click="clearFailed(plugin)">清除失败记录</el-button>
            </span>
          </el-tooltip>
          <el-button
            v-else-if="plugin.install_state === 'not_installed'"
            type="primary"
            size="small"
            icon="el-icon-download"
            @click="startAnalysis('install', plugin)"
          >安装</el-button>
          <el-button
            v-else-if="plugin.install_state === 'update_available'"
            type="warning"
            size="small"
            icon="el-icon-top"
            @click="startAnalysis('update', plugin)"
          >更新插件</el-button>
          <el-tooltip v-else-if="plugin.install_state === 'external'" content="该分发包由 WebUI 外部安装，不能自动接管或卸载" placement="top">
            <span><el-button size="small" disabled>外部安装</el-button></span>
          </el-tooltip>
          <el-tooltip v-else-if="plugin.install_state === 'blocked'" :content="reasonLabel(plugin.blocked_reasons[0])" placement="top">
            <span><el-button size="small" disabled>不可安装</el-button></span>
          </el-tooltip>
          <el-dropdown v-else trigger="click" @command="startAnalysis($event, plugin)">
            <el-button size="small">已托管<i class="el-icon-arrow-down el-icon--right" /></el-button>
            <el-dropdown-menu slot="dropdown">
              <el-dropdown-item v-if="plugin.update_available" command="update">更新插件</el-dropdown-item>
              <el-dropdown-item command="uninstall" divided>卸载</el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
        </div>
      </article>
      <div v-if="!loading && !plugins.length && !error" class="empty-state">
        <i class="el-icon-box"></i>
        <h2>没有符合条件的插件</h2>
        <p>调整搜索或兼容性筛选后重试</p>
      </div>
    </div>

    <el-pagination
      v-if="total > pageSize"
      class="store-pagination"
      background
      layout="prev, pager, next"
      :current-page.sync="page"
      :page-size="pageSize"
      :total="total"
      @current-change="loadPlugins(false)"
    />

    <el-drawer
      :visible.sync="analysisVisible"
      title="依赖分析"
      :size="drawerSize"
      append-to-body
      :before-close="closeAnalysis"
    >
      <div class="analysis-drawer">
        <template v-if="analysisPlugin">
          <div class="analysis-heading">
            <div>
              <h2>{{ analysisPlugin.name }}</h2>
              <span>{{ analysisPlugin.project_link }}@{{ analysisPlugin.version }}</span>
            </div>
            <el-tag :type="analysisStatusType" effect="plain">{{ analysisStatusLabel }}</el-tag>
          </div>

          <div v-if="analysisLoading" class="analysis-loading">
            <i class="el-icon-loading"></i>
            <strong>正在解析 PyPI 元数据与完整依赖图</strong>
            <span>不会安装软件包，也不会修改当前环境</span>
          </div>
          <template v-else-if="analysis">
            <el-alert
              v-if="analysis.status === 'blocked' || analysis.status === 'failed'"
              title="此插件不能安装"
              type="error"
              :closable="false"
              show-icon
            >
              <div v-for="reason in analysis.blocked_reasons || []" :key="reason.code" class="reason-item">
                <code>{{ reason.code }}</code>
                <strong>{{ reasonLabel(reason) }}</strong>
                <span v-if="reasonDetail(reason)">{{ reasonDetail(reason) }}</span>
                <div v-if="Array.isArray(reason.details) && reason.details.length" class="drift-list">
                  <div v-for="item in reason.details" :key="`${reason.code}-${item.name}`" class="dependency-change">
                    <code>{{ item.name }}</code><span>{{ driftDescription(item) }}</span>
                  </div>
                </div>
              </div>
              <el-button v-if="analysis.environment && analysis.environment.repairable" type="warning" plain icon="el-icon-refresh" :loading="repairing" @click="repairEnvironment">同步锁定依赖并重启</el-button>
            </el-alert>
            <template v-else-if="analysis.status === 'ready'">
              <section class="analysis-section core-ok">
                <i class="el-icon-circle-check"></i>
                <div><h3>真寻核心依赖保持不变</h3><p>NoneBot、Pydantic、FastAPI、适配器及核心闭包均已锁定。</p></div>
              </section>

              <section class="analysis-section">
                <h3>插件私有依赖</h3>
                <div v-if="!allChanges.length" class="muted">不会增加或修改 Python 包。</div>
                <div v-for="item in allChanges" :key="`${item.kind}-${item.name}`" class="dependency-change">
                  <code>{{ item.name }}</code>
                  <span v-if="item.kind === 'added'">新增 {{ item.version }}</span>
                  <span v-else-if="item.kind === 'changed'">{{ item.from }} → {{ item.to }}</span>
                  <span v-else>移除插件包 {{ item.version }}</span>
                </div>
                <p v-if="analysis.action === 'uninstall'" class="dependency-note">卸载仅移除插件分发包，已新增依赖会保留。</p>
              </section>

              <section v-if="sharedChanges.length" class="analysis-section shared-changes">
                <h3>共享依赖变化</h3>
                <p>这些包会影响整个真寻进程，只能在重启并完成启动验证后生效。</p>
                <div v-for="item in sharedChanges" :key="`shared-${item.name}`" class="dependency-change">
                  <code>{{ item.name }}</code><span>{{ item.from || "缺失" }} → {{ item.to }}</span>
                </div>
              </section>

              <el-alert v-if="compatibilityOverrides.length" title="非核心依赖兼容试运行" type="warning" :closable="false" show-icon>
                <p>下列插件声明未包含当前较新版本。系统不会降级共享包，将通过重启验证并在失败时回滚。</p>
                <div v-for="item in compatibilityOverrides" :key="`override-${item.name}`" class="dependency-change">
                  <code>{{ item.name }}</code><span>{{ item.declared_requirement }} · 当前 {{ item.effective_version }}</span>
                </div>
              </el-alert>

              <el-alert v-if="analysis.plan.non_core_changes.length" title="非核心依赖版本将变化" type="warning" :closable="false" show-icon>
                <p>这些变化可能影响其他第三方插件，需要单独确认。</p>
              </el-alert>
              <el-alert v-if="analysis.plan.source_build_required" title="需要从源码构建" type="warning" :closable="false" show-icon>
                <p>构建过程可能调用本机编译工具，仅会在停止 worker 后执行，并强制重启验证。</p>
              </el-alert>
              <el-alert v-if="analysis.plan.database_migration_possible" title="插件可能包含数据库迁移" type="warning" :closable="false" show-icon>
                <p v-if="analysis.plan.database_type === 'external'">当前使用外部数据库。系统只执行迁移检查，不会自动修改；迁移未完成时将保留旧运行版本。</p>
                <p v-else>launcher 将在停止 worker 后备份 SQLite、非交互执行迁移，并在迁移或启动失败时恢复数据库。</p>
              </el-alert>

              <div class="confirmations">
                <el-checkbox v-model="confirmCode">我了解插件代码与真寻运行在同一进程，并拥有同等权限</el-checkbox>
                <el-checkbox v-if="analysis.plan.non_core_changes.length" v-model="confirmChanges">我已核对并接受上述非核心依赖变化</el-checkbox>
                <el-checkbox v-if="analysis.plan.source_build_required" v-model="confirmSource">我已核对并接受源码构建风险</el-checkbox>
                <el-checkbox v-if="compatibilityOverrides.length" v-model="confirmCompatibility">我了解插件未声明支持当前依赖版本，并接受兼容试运行</el-checkbox>
                <el-checkbox v-if="analysis.plan.database_migration_possible" v-model="confirmMigration">我已了解并接受上述数据库迁移处理方式</el-checkbox>
              </div>
            </template>
          </template>
        </template>
      </div>
      <div v-if="analysis && analysis.status === 'ready'" class="drawer-actions">
        <el-button @click="analysisVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!canApply" :loading="applying" @click="applyAnalysis">
          {{ applyButtonLabel }}
        </el-button>
      </div>
    </el-drawer>

    <el-drawer :visible.sync="detailVisible" :title="detail ? detail.name : '插件详情'" :size="drawerSize" append-to-body>
      <div v-loading="detailLoading" class="detail-drawer">
        <template v-if="detail">
          <div class="detail-module">{{ detail.project_link }} · {{ detail.module_name }}</div>
          <h3>简介</h3><p>{{ detail.description || detail.pypi.summary || "暂无简介" }}</p>
          <h3>兼容信息</h3>
          <p>Python {{ detail.pypi.requires_python || "未限定" }} · Registry 版本 {{ detail.version }}</p>
          <h3>适配器</h3><p>{{ adapterLabel(detail) }}</p>
          <h3>配置说明</h3><p>NoneBot 插件不使用真寻 Schema 配置；插件所需环境项请按官方文档在高级配置中填写。</p>
          <el-button v-if="detail.homepage" type="primary" plain icon="el-icon-link" @click="openHomepage(detail.homepage)">打开官方文档</el-button>
        </template>
      </div>
    </el-drawer>
  </section>
</template>

<script>
import { notifyRestartStatusChanged } from "@/utils/apply-result"
import { startRestartRecovery } from "@/utils/restart-recovery"

const reasonLabels = {
  registry_module_invalid: "Registry 中的模块名不是有效的 Python 导入路径。",
  registry_plugin_invalid: "Registry 已将该插件标记为无效。",
  registry_plugin_untested: "Registry 跳过了此版本的兼容性测试。",
  adapter_incompatible: "插件声明的适配器与当前启用适配器不匹配。",
  nonebot1_plugin: "该插件依赖 NoneBot 1，无法用于当前 NoneBot 2。",
  python_version_incompatible: "当前 Python 版本不在插件支持范围内。",
  nonebot2_version_incompatible: "插件要求的 NoneBot 2 版本与当前环境冲突。",
  pydantic_version_incompatible: "插件要求的 Pydantic 版本与当前环境冲突。",
  core_dependency_conflict: "安装会改变真寻核心依赖，已阻止操作。",
  third_party_dependency_conflict: "该插件与已托管的其他 NoneBot 插件依赖冲突。",
  plugin_dependency_invalid: "插件自身的依赖声明无法得到一致解。",
  environment_drift: "当前运行环境与 uv.lock 不一致，请先同步项目依赖。",
  interpreter_mismatch: "当前worker不是由项目.venv启动，请使用uv run zx。",
  project_dependency_conflict: "插件依赖超出真寻声明的兼容范围。",
  project_lock_stale: "pyproject.toml与uv.lock不一致，请先更新锁文件。",
  source_build_required: "缺少兼容 Wheel，需要确认源码构建并重启。",
  dependency_resolution_failed: "依赖求解失败，无法生成一致的安装方案。",
  external_install_not_managed: "同名包由 WebUI 外部安装，不能自动接管。",
  plugin_not_managed: "该插件不由 WebUI 管理。",
  plugin_configuration_required: "插件缺少启动所需配置，已恢复原运行版本。",
  plugin_configuration_invalid: "插件启动配置无效，已恢复原运行版本。",
  plugin_import_failed: "插件导入失败，已恢复原运行版本。",
  plugin_startup_verification_failed: "插件未通过启动验证，已恢复原运行版本。",
  nonebot_plugin_apply_failed: "插件应用失败，已恢复原运行版本。",
  external_database_manual_migration_required: "外部数据库未完成迁移，请在控制台执行 `nb orm upgrade` 后再次重启。",
  database_migration_failed: "数据库迁移失败，SQLite备份及原运行版本已恢复。",
}

export default {
  name: "NoneBotStore",
  props: { initialSearch: { type: String, default: "" } },
  data() {
    return {
      plugins: [], total: 0, page: 1, pageSize: 30, loading: false, error: "",
      search: this.initialSearch, statusFilter: "all", typeFilter: "all", adapterFilter: "all", includeIncompatible: false,
      enabledAdapters: [],
      registryMeta: {}, searchTimer: null, analysisVisible: false, analysisLoading: false,
      analysis: null, analysisPlugin: null, analysisTimer: null, applying: false,
      confirmCode: false, confirmChanges: false, confirmSource: false, confirmCompatibility: false, confirmMigration: false,
      detailVisible: false, detailLoading: false, detail: null,
      environment: null, repairing: false,
      pluginLoadInFlight: false, queuedPluginLoad: null, componentDestroyed: false,
    }
  },
  computed: {
    drawerSize() { return window.innerWidth <= 680 ? "94%" : "600px" },
    analysisStatusLabel() {
      const labels = { queued: "等待分析", analyzing: "分析中", ready: "可应用", blocked: "已阻止", failed: "分析失败" }
      return labels[this.analysis?.status] || "准备中"
    },
    analysisStatusType() { return this.analysis?.status === "ready" ? "success" : ["blocked", "failed"].includes(this.analysis?.status) ? "danger" : "info" },
    environmentTone() { return ["immutable_drift", "incompatible_shared_drift", "project_lock_stale", "interpreter_mismatch", "failed"].includes(this.environment?.status) ? "danger" : this.environment?.status === "compatible_shared_drift" ? "warning" : "info" },
    environmentIcon() { return this.environmentTone === "danger" ? "el-icon-warning-outline" : this.environmentTone === "warning" ? "el-icon-info" : "el-icon-circle-check" },
    environmentTitle() {
      const labels = { healthy: "项目依赖环境正常", extra_packages: "项目依赖正常，存在额外包", compatible_shared_drift: "共享依赖与锁文件不同但仍兼容", immutable_drift: "不可变核心依赖需要修复", incompatible_shared_drift: "共享依赖已超出兼容范围", project_lock_stale: "项目锁文件需要更新", interpreter_mismatch: "当前启动解释器不正确", failed: "依赖环境检测失败" }
      return labels[this.environment?.status] || "正在检查依赖环境"
    },
    environmentDescription() {
      if (!this.environment) return ""
      if (this.environment.status === "extra_packages") return `检测到 ${this.environment.extra_count || 0} 个额外包；它们不会阻止插件安装，安全同步也不会删除。`
      if (this.environment.status === "compatible_shared_drift") return "实际版本仍满足真寻声明，将参与插件联合求解。"
      if (this.environment.status === "healthy") return `已保护 ${this.environment.immutable_count || 0} 个核心包，${this.environment.shared_count || 0} 个共享包可协调。`
      if (this.environment.status === "interpreter_mismatch") return "请通过项目launcher启动；同步项目.venv无法修复其他解释器。"
      if (this.environment.status === "project_lock_stale") return "WebUI不会自动修改uv.lock，请先在终端更新并审查锁文件。"
      return "查看依赖分析中的具体包差异，修复前不会安装插件。"
    },
    sharedChanges() { return this.analysis?.plan?.shared_changes || [] },
    compatibilityOverrides() { return this.analysis?.plan?.compatibility_overrides || [] },
    allChanges() {
      const changes = this.analysis?.plan?.package_changes
      if (!changes) return []
      return [
        ...(changes.added || []).map((item) => ({ ...item, kind: "added" })),
        ...(changes.changed || []).map((item) => ({ ...item, kind: "changed" })),
        ...(changes.removed || []).map((item) => ({ ...item, kind: "removed" })),
      ]
    },
    canApply() {
      if (!this.confirmCode || this.applying) return false
      if (this.analysis?.plan?.non_core_changes?.length && !this.confirmChanges) return false
      if (this.analysis?.plan?.source_build_required && !this.confirmSource) return false
      if (this.compatibilityOverrides.length && !this.confirmCompatibility) return false
      if (this.analysis?.plan?.database_migration_possible && !this.confirmMigration) return false
      return true
    },
    applyButtonLabel() {
      return { install: "安装插件", update: "更新插件", uninstall: "卸载插件" }[this.analysis?.action] || "应用"
    },
  },
  watch: {
    search() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.page = 1; this.loadPlugins(false) }, 350) },
    statusFilter() { this.page = 1; this.loadPlugins(false) },
    typeFilter() { this.page = 1; this.loadPlugins(false) },
    adapterFilter() { this.page = 1; this.loadPlugins(false) },
    includeIncompatible() { this.page = 1; this.loadPlugins(false) },
  },
  mounted() { this.loadEnvironment(); this.loadPlugins(false); this.restoreAnalysis() },
  beforeDestroy() { this.componentDestroyed = true; this.queuedPluginLoad = null; clearTimeout(this.searchTimer); clearTimeout(this.analysisTimer) },
  methods: {
    newOperationId() {
      const bytes = new Uint8Array(16)
      window.crypto.getRandomValues(bytes)
      return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
    },
    formatTime(value) { try { return new Date(value).toLocaleString("zh-CN", { hour12: false }) } catch (_) { return value } },
    typeLabel(type) { return type === "library" ? "库插件" : "应用插件" },
    adapterName(adapter) {
      const labels = { "nonebot.adapters.onebot.v11": "OneBot V11", "nonebot.adapters.qq": "QQ 官方" }
      return labels[adapter] || adapter.split(".").slice(-2).join(".")
    },
    adapterLabel(plugin) {
      const adapters = plugin.supported_adapters
      if (!Array.isArray(adapters) || !adapters.length) return "通用/未限定"
      return adapters.map((item) => item.split(".").slice(-2).join(".")).join("、")
    },
    stateTag(plugin) {
      if (plugin.apply_mode === "restart_pending") return { label: "等待重启", type: "warning" }
      const states = {
        not_installed: { label: "未安装", type: "info" }, managed: { label: "已托管", type: "success" },
        update_available: { label: "可更新", type: "warning" }, external: { label: "外部安装", type: "info" },
        blocked: { label: "不可安装", type: "danger" }, failed: { label: "失败", type: "danger" },
      }
      return states[plugin.install_state] || { label: plugin.install_state, type: "info" }
    },
    reasonLabel(reason) { return reasonLabels[reason?.code] || reason?.message || reason?.code || "当前环境不兼容" },
    reasonDetail(reason) { const label = reasonLabels[reason?.code]; return label && reason?.message && reason.message !== label ? reason.message : "" },
    driftDescription(item) {
      if (item.kind === "constraint_conflict") return `插件要求 ${item.expected || item.requirement || "-"} · 当前 ${item.actual || "未安装"}`
      const relation = { missing: "缺失", older: "版本偏低", newer: "版本偏高", version_mismatch: "版本不一致" }[item.kind] || "不一致"
      return `${relation} · 期望 ${item.expected || item.from || "-"} · 实际 ${item.actual || item.to || "未安装"}`
    },
    async loadEnvironment() {
      try {
        const response = await this.getRequest(`${this.$root.prefix}/store/nonebot/environment`, {}, { suppressErrorToast: true })
        if (response?.suc) this.environment = response.data
      } catch (_) { this.environment = { status: "failed", repairable: false } }
    },
    async loadPlugins(refresh = false) {
      const previous = this.queuedPluginLoad
      this.queuedPluginLoad = {
        params: {
          search: this.search, page: this.page, page_size: this.pageSize, status: this.statusFilter,
          plugin_type: this.typeFilter, adapter: this.adapterFilter,
          include_incompatible: this.includeIncompatible,
        },
        refresh: Boolean(refresh || previous?.refresh),
      }
      if (this.pluginLoadInFlight) return
      this.pluginLoadInFlight = true
      this.loading = true; this.error = ""
      try {
        while (this.queuedPluginLoad && !this.componentDestroyed) {
          const request = this.queuedPluginLoad
          this.queuedPluginLoad = null
          try {
            const response = await this.getRequest(`${this.$root.prefix}/store/nonebot/plugins`, {
              ...request.params,
              refresh: request.refresh,
            })
            if (this.componentDestroyed) return
            if (this.queuedPluginLoad) continue
            if (!response.suc) throw new Error(response.info || "NoneBot Registry 加载失败")
            this.plugins = response.data.items || []; this.total = Number(response.data.total || 0); this.registryMeta = response.data.registry || {}
            this.enabledAdapters = response.data.enabled_adapters || []
          } catch (error) {
            if (this.componentDestroyed) return
            if (this.queuedPluginLoad) continue
            this.plugins = []; this.total = 0; this.error = error.response?.data?.detail || error.message || "NoneBot Registry 暂时不可用。"
          }
        }
      } finally {
        this.pluginLoadInFlight = false
        if (!this.componentDestroyed) this.loading = false
      }
    },
    async openDetail(plugin) {
      this.detail = null; this.detailVisible = true; this.detailLoading = true
      try {
        const response = await this.getRequest(`${this.$root.prefix}/store/nonebot/plugins/${encodeURIComponent(plugin.project_link)}`)
        if (!response.suc) throw new Error(response.info || "详情加载失败")
        this.detail = response.data
      } catch (error) { this.$message.error(error.message || "详情加载失败"); this.detailVisible = false }
      finally { this.detailLoading = false }
    },
    openHomepage(url) { window.open(url, "_blank", "noopener,noreferrer") },
    async startAnalysis(action, plugin) {
      if (this.$store.state.pluginOperation.active) { this.$message.warning("已有插件操作正在进行，请等待完成。"); return }
      this.analysisPlugin = plugin; this.analysis = null; this.analysisLoading = true; this.analysisVisible = true
      this.confirmCode = false; this.confirmChanges = false; this.confirmSource = false; this.confirmCompatibility = false; this.confirmMigration = false
      try {
        const response = await this.postRequest(`${this.$root.prefix}/store/nonebot/analyze`, { project_link: plugin.project_link, action })
        if (!response.suc) throw new Error(response.info || "依赖分析无法启动")
        this.analysis = response.data
        sessionStorage.setItem("zhenxun_nonebot_analysis", JSON.stringify({ analysisId: response.data.analysis_id, plugin, action }))
        this.pollAnalysis(response.data.analysis_id)
      } catch (error) { this.analysisLoading = false; this.analysis = { status: "failed", blocked_reasons: [{ code: "analysis_failed", message: error.message }] } }
    },
    async pollAnalysis(id) {
      clearTimeout(this.analysisTimer)
      try {
        const response = await this.getRequest(`${this.$root.prefix}/store/nonebot/analyses/${id}`)
        if (!response.suc) {
          if (response.info === "analysis_not_found") {
            const saved = JSON.parse(sessionStorage.getItem("zhenxun_nonebot_analysis") || "null")
            sessionStorage.removeItem("zhenxun_nonebot_analysis")
            if (saved?.plugin && saved?.action) return this.startAnalysis(saved.action, saved.plugin)
          }
          throw new Error(response.info || "依赖分析失败")
        }
        this.analysis = response.data
        if (response.data.environment) this.environment = response.data.environment
        if (["queued", "analyzing"].includes(response.data.status)) {
          this.analysisTimer = setTimeout(() => this.pollAnalysis(id), 700)
        } else { this.analysisLoading = false }
      } catch (error) { this.analysisLoading = false; this.analysis = { status: "failed", blocked_reasons: [{ code: "analysis_failed", message: error.message }] } }
    },
    restoreAnalysis() {
      try {
        const saved = JSON.parse(sessionStorage.getItem("zhenxun_nonebot_analysis") || "null")
        if (!saved?.analysisId || !saved?.plugin) return
        this.analysisPlugin = saved.plugin; this.analysisVisible = true; this.analysisLoading = true
        this.pollAnalysis(saved.analysisId)
      } catch (_) { sessionStorage.removeItem("zhenxun_nonebot_analysis") }
    },
    closeAnalysis(done) {
      if (this.applying) return
      clearTimeout(this.analysisTimer); sessionStorage.removeItem("zhenxun_nonebot_analysis")
      if (typeof done === "function") done()
    },
    async repairEnvironment() {
      const environment = this.analysis?.environment || this.environment
      if (!environment?.repairable || this.repairing) return
      const changed = [...(environment.immutable_drift || []), ...(environment.incompatible_shared_drift || [])]
      const summary = changed.slice(0, 8).map((item) => `${item.name}: ${item.actual || "缺失"} → ${item.expected}`).join("\n")
      const confirmed = await this.$cuteConfirm({ title: "同步锁定依赖并重启", message: `${summary}\n\n同步使用 --locked --inexact，不会删除额外包。确认继续？`, confirmButtonText: "同步并重启", cancelButtonText: "取消", type: "warning" })
      if (!confirmed) return
      this.repairing = true
      try {
        const response = await this.postRequest(`${this.$root.prefix}/store/nonebot/environment/repair`, { expected_fingerprint: environment.fingerprint, confirmed: true })
        if (!response.suc) throw new Error(response.info || "依赖修复请求失败")
        startRestartRecovery({ bootId: response.data.boot_id, accessUrls: response.data.access_urls || [], accessTargets: response.data.access_targets || [], policy: "preserve", returnRoute: this.$route.path, message: "正在同步锁定依赖并启动新的真寻进程。" })
      } catch (error) { this.$message.error(error.response?.data?.detail || error.message || "依赖修复请求失败") }
      finally { this.repairing = false }
    },
    async cancelPending(plugin) {
      const confirmed = await this.$cuteConfirm({ title: "取消待重启事务", message: `将撤销 ${plugin.name} 的待应用变更并恢复当前运行版本。`, confirmButtonText: "撤销事务", cancelButtonText: "保留", type: "warning" })
      if (!confirmed) return
      try {
        const endpoint = plugin.pending_operation_id
          ? `${this.$root.prefix}/store/nonebot/transactions/pending/${encodeURIComponent(plugin.pending_operation_id)}`
          : `${this.$root.prefix}/store/nonebot/transactions/cancel`
        const response = plugin.pending_operation_id
          ? await this.deleteRequest(endpoint)
          : await this.postRequest(endpoint, {})
        if (!response.suc) throw new Error(response.info || "取消失败")
        this.$message.success("待重启插件事务已撤销")
        notifyRestartStatusChanged(); await this.loadPlugins(false)
      } catch (error) { this.$message.error(error.response?.data?.detail || error.message || "取消失败") }
    },
    async clearFailed(plugin) {
      const confirmed = await this.$cuteConfirm({ title: "清除失败记录", message: `${plugin.name} 已回滚到原运行版本。清除记录后可以重新分析或安装。`, confirmButtonText: "清除记录", cancelButtonText: "保留", type: "warning" })
      if (!confirmed) return
      try {
        const response = await this.postRequest(`${this.$root.prefix}/store/nonebot/transactions/cancel`, {})
        if (!response.suc) throw new Error(response.info || "清除失败")
        this.$message.success("插件失败记录已清除")
        notifyRestartStatusChanged(); await this.loadPlugins(false)
      } catch (error) { this.$message.error(error.response?.data?.detail || error.message || "清除失败") }
    },
    async applyAnalysis() {
      if (!this.canApply) return
      if (this.analysis.plan.source_build_required) {
        const confirmed = await this.$cuteConfirm({ title: "确认源码构建", message: "此操作将在 worker 停止后调用本机编译工具。确认继续？", confirmButtonText: "确认构建", cancelButtonText: "取消", type: "warning" })
        if (!confirmed) return
      }
      this.applying = true
      const action = this.analysis.action
      const labels = { install: "安装", update: "更新", uninstall: "卸载" }
      const operationId = this.newOperationId()
      sessionStorage.setItem("zhenxun_plugin_operation", JSON.stringify({ operationId, action, pluginName: this.analysisPlugin.name }))
      this.$store.commit("START_PLUGIN_OPERATION", { action, pluginName: this.analysisPlugin.name, title: `正在${labels[action]} NoneBot 插件`, message: "正在构建隔离依赖层并验证运行时边界。" })
      try {
        const response = await this.postRequest(`${this.$root.prefix}/store/nonebot/apply`, {
          analysis_id: this.analysis.analysis_id, operation_id: operationId, confirm_third_party_code: this.confirmCode,
          confirm_non_core_changes: this.confirmChanges, confirm_source_build: this.confirmSource,
          confirm_compatibility_overrides: this.confirmCompatibility,
          confirm_database_migration: this.confirmMigration,
        })
        if (!response.suc) throw new Error(response.info || `${labels[action]}失败`)
        const mode = response.data.apply_mode
        const pending = mode === "restart_pending"
        const resultMessages = {
          hot_reloaded: "插件运行时已更新，无需重启。",
          rolled_back: "操作已撤销，当前运行版本保持不变。",
          failed: "插件操作失败，已保留原运行版本。",
        }
        this.$store.commit("FINISH_PLUGIN_OPERATION", {
          status: mode === "failed" ? "error" : pending ? "pending" : "success", title: pending ? "插件事务等待重启" : `插件${labels[action]}完成`,
          message: pending ? "依赖层已准备完成，确认重启后切换并验证插件。" : (resultMessages[mode] || "插件操作已完成。"),
          applyMode: mode, restartAvailable: response.data.restart_available,
          accessUrls: response.data.access_urls || [], accessTargets: response.data.access_targets || [],
        })
        notifyRestartStatusChanged(); sessionStorage.removeItem("zhenxun_nonebot_analysis"); this.analysisVisible = false; await this.loadPlugins(false)
      } catch (error) {
        this.$store.commit("FINISH_PLUGIN_OPERATION", { status: "error", title: `插件${labels[action]}失败`, message: error.response?.data?.detail || error.message || "操作失败" })
      } finally { this.applying = false }
    },
  },
}
</script>

<style scoped>
.nonebot-store { min-height: 100%; padding: 22px; color: var(--text-color); background: var(--bg-color); }
.store-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.store-header h1 { margin: 0; font-size: 24px; }.store-header p { margin: 5px 0 0; color: var(--text-color-secondary); }
.store-toolbar { display: grid; grid-template-columns: minmax(240px, 1fr) 150px 140px 150px auto; align-items: center; gap: 10px; }
.catalog-note { display: flex; align-items: center; gap: 7px; min-height: 34px; color: var(--text-color-secondary); font-size: 12px; }
.environment-status { display: flex; align-items: flex-start; gap: 12px; margin: 12px 0; padding: 13px 14px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color-secondary); }.environment-status > i { margin-top: 2px; color: var(--success-color); font-size: 21px; }.environment-status > div { min-width: 0; flex: 1; }.environment-status strong { display: block; color: var(--text-color); }.environment-status p { margin: 4px 0 0; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; }.environment-status.is-warning { border-color: rgba(230,162,60,.45); }.environment-status.is-warning > i { color: var(--warning-color); }.environment-status.is-danger { border-color: rgba(245,108,108,.45); }.environment-status.is-danger > i { color: var(--danger-color); }
.plugin-list { min-height: 320px; border-top: 1px solid var(--border-color); }
.plugin-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; padding: 17px 4px; border-bottom: 1px solid var(--border-color); }
.plugin-main { min-width: 0; }.plugin-title-line { display: flex; min-width: 0; align-items: center; gap: 7px; }.plugin-title-line h2 { margin: 0; overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.module-line { margin-top: 4px; color: var(--text-color-secondary); font-family: Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
.plugin-main > p { margin: 9px 0; color: var(--text-color-secondary); line-height: 1.55; }.meta-line { display: flex; flex-wrap: wrap; gap: 14px; color: var(--text-color-secondary); font-size: 12px; }.meta-line i { margin-right: 4px; }
.blocked-reason { margin-top: 8px; color: var(--danger-color); font-size: 12px; }.plugin-actions, .pending-actions { display: flex; align-items: center; gap: 8px; }
.inline-state, .empty-state { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 100px; color: var(--text-color-secondary); }.inline-state.is-error { margin: 12px 0; border: 1px solid var(--el-color-danger-light-7); border-radius: 6px; color: var(--danger-color); }.empty-state { min-height: 300px; flex-direction: column; }.empty-state h2, .empty-state p { margin: 0; }.empty-state i { font-size: 34px; }
.store-pagination { margin-top: 20px; text-align: center; }.analysis-drawer, .detail-drawer { padding: 0 24px 90px; color: var(--text-color); }.analysis-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 18px; border-bottom: 1px solid var(--border-color); }.analysis-heading h2 { margin: 0 0 4px; font-size: 20px; }.analysis-heading span, .detail-module { color: var(--text-color-secondary); font-family: Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
.analysis-loading { display: flex; min-height: 260px; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-color-secondary); }.analysis-loading i { color: var(--primary-color); font-size: 34px; }.analysis-loading strong { color: var(--text-color); }
.analysis-section { margin: 18px 0; }.analysis-section h3 { margin: 0 0 10px; font-size: 14px; }.analysis-section p { margin: 3px 0; color: var(--text-color-secondary); line-height: 1.55; }.core-ok { display: flex; gap: 10px; padding: 13px; border: 1px solid var(--success-color); border-radius: 6px; }.core-ok > i { color: var(--success-color); font-size: 22px; }.core-ok h3 { margin: 0; }
.reason-item { display: flex; flex-direction: column; gap: 5px; margin: 7px 0; overflow-wrap: anywhere; }.reason-item > code { width: fit-content; }.reason-item > span { line-height: 1.5; }.drift-list { margin-top: 5px; padding: 0 10px; border: 1px solid rgba(245,108,108,.22); border-radius: 5px; }.shared-changes { padding: 12px; border: 1px solid rgba(230,162,60,.4); border-radius: 6px; }
.dependency-change { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-color); }.dependency-change code { overflow-wrap: anywhere; }.dependency-change span { color: var(--text-color-secondary); }.dependency-note, .muted { color: var(--text-color-secondary); font-size: 12px; }.confirmations { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; }.confirmations ::v-deep .el-checkbox { display: flex; height: auto; white-space: normal; }.confirmations ::v-deep .el-checkbox__label { line-height: 1.5; }
.reason-item { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; overflow-wrap: anywhere; }.drawer-actions { position: absolute; right: 0; bottom: 0; left: 0; display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; border-top: 1px solid var(--border-color); background: var(--bg-color); }.detail-drawer h3 { margin: 20px 0 7px; font-size: 14px; }.detail-drawer p { color: var(--text-color-secondary); line-height: 1.65; }
@media (max-width: 900px) { .store-toolbar { grid-template-columns: 1fr 1fr; }.plugin-row { grid-template-columns: 1fr; }.plugin-actions { justify-content: flex-end; } }
@media (max-width: 680px) { .nonebot-store { padding: 14px; }.store-header { align-items: flex-start; }.store-header h1 { font-size: 20px; }.store-toolbar { grid-template-columns: 1fr; }.environment-status { flex-wrap: wrap; }.environment-status .el-button { width: 100%; }.plugin-title-line { flex-wrap: wrap; }.plugin-actions, .pending-actions { flex-wrap: wrap; justify-content: flex-start; }.dependency-change { grid-template-columns: 1fr; gap: 3px; }.analysis-drawer, .detail-drawer { padding-right: 16px; padding-left: 16px; } }
</style>
