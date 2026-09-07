<template>
  <section class="store-shell" :class="{ 'is-embedded': embedded }">
    <header class="store-header">
      <div>
        <h1>{{ capability === "ai_chat" ? "AI 聊天插件" : "插件商店" }}</h1>
        <p>{{ capability === "ai_chat" ? "选择并安装适合当前机器人的对话插件" : "浏览、安装和维护真寻插件" }}</p>
      </div>
      <el-button icon="el-icon-refresh" :loading="loading" @click="loadPlugins(true)">检查更新</el-button>
    </header>

    <div class="store-toolbar">
      <el-input v-model.trim="search" clearable prefix-icon="el-icon-search" placeholder="搜索名称、模块或作者" />
      <el-select v-model="statusFilter" aria-label="安装状态">
        <el-option label="全部状态" value="all" />
        <el-option label="未安装" value="uninstalled" />
        <el-option label="已安装" value="installed" />
        <el-option label="可更新" value="updatable" />
      </el-select>
      <el-select v-model="typeFilter" aria-label="插件类型">
        <el-option label="全部类型" value="all" />
        <el-option v-for="type in pluginTypes" :key="type" :label="type" :value="type" />
      </el-select>
      <el-select v-model="sortBy" aria-label="排序方式">
        <el-option label="默认排序" value="default" />
        <el-option label="名称" value="name" />
        <el-option label="作者" value="author" />
        <el-option label="最近版本" value="version" />
      </el-select>
    </div>

    <div v-if="error" class="inline-state is-error">
      <i class="el-icon-warning-outline"></i><span>{{ error }}</span>
      <el-button type="text" @click="loadPlugins(false)">重新加载</el-button>
    </div>

    <div v-loading="loading" class="store-content">
      <div v-if="pagedPlugins.length" class="plugin-grid">
        <article v-for="plugin in pagedPlugins" :key="plugin.store_key || plugin.id" class="plugin-card">
          <div class="plugin-card__head">
            <div class="plugin-title">
              <el-tooltip :content="plugin.name" placement="top"><h2>{{ plugin.name }}</h2></el-tooltip>
              <span>{{ plugin.module }}</span>
            </div>
            <el-tag v-if="plugin.install_state === 'locally_modified'" size="mini" type="warning" effect="plain">本地已修改</el-tag>
            <el-tag v-else-if="plugin.update_available" size="mini" type="warning" effect="plain">可更新</el-tag>
            <el-tag v-else-if="plugin.install_state === 'local_ahead'" size="mini" type="info" effect="plain">本地版本较新</el-tag>
            <el-tag v-else-if="plugin.install_state === 'version_unknown'" size="mini" type="info" effect="plain">版本未知</el-tag>
            <el-tag v-else-if="plugin.installed" size="mini" type="success" effect="plain">已安装</el-tag>
          </div>
          <p class="plugin-description">{{ plugin.description || "暂无简介" }}</p>
          <dl class="plugin-meta">
            <div><dt>作者</dt><dd>{{ plugin.author || "未知" }}</dd></div>
            <div><dt>版本</dt><dd>v{{ plugin.version || "-" }}</dd></div>
            <div><dt>类型</dt><dd>{{ plugin.plugin_type || "其他" }}</dd></div>
            <div><dt>来源</dt><dd>{{ plugin.source === "official" ? "官方" : "社区" }}</dd></div>
          </dl>
          <div v-if="plugin.installed" class="reload-diagnostic">
            <el-tag
              size="mini"
              :type="plugin.reload_support === 'hot_reloadable' ? 'success' : 'info'"
              effect="plain"
            >
              {{ reloadLabel(plugin) }}
            </el-tag>
          </div>
          <div v-else-if="plugin.catalog_status === 'missing'" class="catalog-blocked">
            目录中的插件路径已失效，暂时不能安装
          </div>
          <footer class="plugin-actions">
            <template v-if="plugin.pending_action">
              <el-button type="text" @click="showDetails(plugin)">详情</el-button>
              <span class="action-spacer"></span>
              <el-button size="small" icon="el-icon-time" disabled>等待重启</el-button>
              <el-button size="small" type="text" class="danger-text" @click="cancelPending(plugin)">撤销</el-button>
            </template>
            <template v-else>
              <el-button type="text" @click="showDetails(plugin)">详情</el-button>
              <el-tooltip content="打开插件仓库" placement="top">
                <el-button v-if="repositoryUrl(plugin)" class="icon-action" icon="el-icon-link" circle @click="openRepository(plugin)" />
              </el-tooltip>
              <span class="action-spacer"></span>
              <el-button v-if="capability === 'ai_chat' && plugin.installed" class="plugin-config-action" type="primary" plain size="small" icon="el-icon-setting" @click="openPluginConfiguration(plugin)">插件配置</el-button>
              <el-tooltip v-if="plugin.installed && plugin.reload_support === 'hot_reloadable'" content="热重载插件" placement="top">
                <el-button class="icon-action" icon="el-icon-refresh" circle :loading="actionId === (plugin.store_key || plugin.id) && actionType === 'reload'" @click="runAction('reload', plugin)" />
              </el-tooltip>
              <el-tooltip v-if="!plugin.installed" :content="plugin.catalog_status === 'missing' ? '仓库中找不到目录声明的插件文件' : '安装插件'" placement="top">
                <span><el-button type="primary" size="small" :disabled="plugin.catalog_status === 'missing'" :loading="actionId === (plugin.store_key || plugin.id)" @click="runAction('install', plugin)">安装</el-button></span>
              </el-tooltip>
              <el-button v-if="plugin.installed && plugin.update_available" type="warning" size="small" :loading="actionId === (plugin.store_key || plugin.id) && actionType === 'update'" @click="runAction('update', plugin)">更新插件</el-button>
              <el-dropdown v-if="plugin.installed" trigger="click" @command="runAction($event, plugin)">
                <el-button size="small">已安装<i class="el-icon-arrow-down el-icon--right" /></el-button>
                <el-dropdown-menu slot="dropdown"><el-dropdown-item command="remove" divided>卸载</el-dropdown-item></el-dropdown-menu>
              </el-dropdown>
            </template>
          </footer>
        </article>
      </div>
      <div v-else-if="!loading && !error" class="empty-state">
        <i class="el-icon-box"></i><h2>没有符合条件的插件</h2><p>调整搜索词或筛选条件后重试</p>
      </div>
    </div>

    <el-pagination v-if="filteredPlugins.length > pageSize" class="store-pagination" background layout="prev, pager, next" :current-page.sync="page" :page-size="pageSize" :total="filteredPlugins.length" />

    <el-drawer :visible.sync="drawerVisible" :title="selectedPlugin ? selectedPlugin.name : '插件详情'" :size="drawerSize" append-to-body>
      <div v-if="selectedPlugin" class="detail-drawer">
        <div class="detail-module">{{ selectedPlugin.module }}</div>
        <h3>简介</h3><p>{{ selectedPlugin.description || "暂无简介" }}</p>
        <h3>使用说明</h3><pre>{{ selectedPlugin.usage || "暂无使用说明" }}</pre>
        <h3>仓库</h3>
        <a v-if="repositoryUrl(selectedPlugin)" :href="repositoryUrl(selectedPlugin)" target="_blank" rel="noopener noreferrer">{{ repositoryUrl(selectedPlugin) }}</a>
        <span v-else>未提供仓库地址</span>
      </div>
    </el-drawer>
    <UpdateDialog v-if="configModule" :module="configModule" @close="configModule = ''" />
  </section>
</template>

<script>
import UpdateDialog from "@/components/plugin/UpdateDialog.vue"
import { notifyRestartStatusChanged } from "@/utils/apply-result"

export default {
  name: "StoreTemplate",
  components: { UpdateDialog },
  props: {
    capability: { type: String, default: "" },
    embedded: { type: Boolean, default: false },
  },
  data() {
    return { plugins: [], loading: false, error: "", search: "", statusFilter: "all", typeFilter: "all", sortBy: "default", page: 1, pageSize: 18, actionId: null, actionType: "", drawerVisible: false, selectedPlugin: null, configModule: "" }
  },
  computed: {
    pluginOperation() { return this.$store.state.pluginOperation },
    catalogPlugins() { return this.capability ? this.plugins.filter((item) => (item.capabilities || []).includes(this.capability)) : this.plugins },
    pluginTypes() { return [...new Set(this.catalogPlugins.map((item) => item.plugin_type).filter(Boolean))].sort() },
    filteredPlugins() {
      const keyword = this.search.toLowerCase()
      const result = this.catalogPlugins.filter((plugin) => {
        const matchesSearch = !keyword || `${plugin.name} ${plugin.module} ${plugin.author}`.toLowerCase().includes(keyword)
        const matchesType = this.typeFilter === "all" || plugin.plugin_type === this.typeFilter
        const matchesStatus = this.statusFilter === "all" || (this.statusFilter === "uninstalled" && !plugin.installed) || (this.statusFilter === "installed" && plugin.installed) || (this.statusFilter === "updatable" && plugin.update_available)
        return matchesSearch && matchesType && matchesStatus
      })
      if (this.sortBy === "default") return result
      return [...result].sort((left, right) => String(left[this.sortBy] || "").localeCompare(String(right[this.sortBy] || ""), "zh-CN"))
    },
    pagedPlugins() { const start = (this.page - 1) * this.pageSize; return this.filteredPlugins.slice(start, start + this.pageSize) },
    drawerSize() { return window.innerWidth <= 680 ? "92%" : "520px" },
  },
  watch: { search() { this.page = 1 }, statusFilter() { this.page = 1 }, typeFilter() { this.page = 1 }, sortBy() { this.page = 1 } },
  mounted() { this.loadPlugins() },
  methods: {
    newOperationId() {
      const bytes = new Uint8Array(16)
      window.crypto.getRandomValues(bytes)
      return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
    },
    repositoryUrl(plugin) { return plugin.github_url || plugin.ali_url || "" },
    openRepository(plugin) { window.open(this.repositoryUrl(plugin), "_blank", "noopener,noreferrer") },
    showDetails(plugin) { this.selectedPlugin = plugin; this.drawerVisible = true },
    reloadLabel(plugin) {
      if (plugin.reload_support === "hot_reloadable") return "支持热加载"
      if ((plugin.reload_reasons || []).includes("not_loaded")) return "尚未加载"
      return "变更后需要重启"
    },
    async openPluginConfiguration(plugin) {
      const module = String(plugin.runtime_module || plugin.module).split(".").pop()
      try {
        const response = await this.getRequest(`${this.$root.prefix}/plugin/get_plugin`, { module })
        if (!response.suc) throw new Error(response.info || "插件配置读取失败")
        if (!response.data?.config_list?.length) {
          this.$message.info("该插件无需额外配置。")
          return
        }
        this.configModule = module
      } catch (error) {
        this.$message.error(error.message || "插件配置读取失败")
      }
    },
    operationResult(response, fallback) {
      const mode = response.data?.apply_mode
      const reasons = response.data?.reason_codes || []
      const restartReason = reasons.some((item) => String(item).includes("orm_model"))
        ? "插件包含数据库模型，需要重启完成模型注册。"
        : "插件文件操作已完成，需要重启后生效。"
      const labels = {
        hot_reloaded: "运行时已热加载，无需重启。",
        restart_requested: "已请求受控重启，重启完成后生效。",
        restart_pending: response.data?.restart_available ? restartReason : `${restartReason} 当前不是 launcher 托管模式，请手动重启。`,
        failed: response.data?.rolled_back ? "运行时应用失败，插件文件已自动恢复。" : "运行时应用失败，请查看运行状态。",
      }
      const detail = labels[mode]
      return {
        status: mode === "failed" ? "error" : mode === "restart_pending" ? "pending" : "success",
        message: [fallback, detail].filter(Boolean).join("\n"),
        applyMode: mode,
        restartAvailable: Boolean(response.data?.restart_available),
        accessUrls: response.data?.access_urls || [],
        accessTargets: response.data?.access_targets || [],
      }
    },
    async loadPlugins(refresh = false) {
      this.loading = true; this.error = ""
      try {
        const response = await this.getRequest(`${this.$root.prefix}/store/get_plugin_store`, { refresh })
        if (!response.suc) throw new Error(response.info || "插件商店加载失败")
        this.plugins = Array.isArray(response.data.plugin_list) ? response.data.plugin_list : []
      } catch (error) {
        this.plugins = []
        this.error = error.response?.data?.detail || error.message || "插件商店暂时不可用。"
      } finally { this.loading = false }
    },
    async runAction(action, plugin) {
      const labels = { install: "安装", update: "更新", remove: "卸载", reload: "热重载" }
      if (this.pluginOperation.active) {
        this.$message.warning("已有插件操作正在进行，请等待完成。")
        return
      }
      if (action === "install" && plugin.catalog_status === "missing") {
        this.$message.error("目录中的插件路径已失效，请等待目录维护者修复。")
        return
      }
      const confirmed = await this.$cuteConfirm({ title: `${labels[action]}插件`, message: `确认${labels[action]}“${plugin.name}”？`, confirmButtonText: "确认", cancelButtonText: "取消", type: action === "remove" ? "warning" : "info" })
      if (!confirmed) return
      this.actionId = plugin.store_key || plugin.id
      this.actionType = action
      const operationId = this.newOperationId()
      sessionStorage.setItem("zhenxun_plugin_operation", JSON.stringify({ operationId, action, pluginName: plugin.name }))
      const runningTitles = {
        install: "正在下载并安装插件",
        update: "正在下载并更新插件",
        remove: "正在卸载插件",
        reload: "正在热重载插件",
      }
      this.$store.commit("START_PLUGIN_OPERATION", {
        action,
        pluginName: plugin.name,
        title: runningTitles[action],
        message: {
          install: "请稍后，插件正在安装，请不要刷新页面",
          update: "请稍后，插件正在更新，请不要刷新页面",
          remove: "请稍后，插件正在卸载，请不要刷新页面",
          reload: "请稍后，插件正在热重载，请不要刷新页面",
        }[action],
      })
      try {
        const payload = action === "reload"
          ? { store_key: plugin.store_key, module: plugin.runtime_module || plugin.module, operation_id: operationId }
          : { store_key: plugin.store_key, id: plugin.id, operation_id: operationId }
        let response = await this.postRequest(`${this.$root.prefix}/store/${action}_plugin`, payload, { suppressErrorToast: true })
        if (!response.suc && ["install", "update"].includes(action) && String(response.info || "").includes("source_build_confirmation_required")) {
          const sourceConfirmed = await this.$cuteConfirm({
            title: "确认源码构建风险",
            message: "该插件缺少当前环境可用的 Wheel，依赖需要从源码构建。构建会在隔离依赖层中执行，并且必须重启验证；失败时会回滚。是否继续？",
            confirmButtonText: "接受风险并继续",
            cancelButtonText: "取消",
            type: "warning",
          })
          if (!sourceConfirmed) {
            this.$store.commit("FINISH_PLUGIN_OPERATION", {
              status: "success",
              title: `已取消插件${labels[action]}`,
              message: "未授权源码构建，插件文件和依赖均未修改。",
            })
            return
          }
          payload.operation_id = this.newOperationId()
          payload.confirm_source_build = true
          response = await this.postRequest(`${this.$root.prefix}/store/${action}_plugin`, payload, { suppressErrorToast: true })
        }
        if (!response.suc) throw new Error(response.info || `${labels[action]}失败`)
        const operation = this.operationResult(response, response.info || `${labels[action]}已完成。`)
        notifyRestartStatusChanged()
        this.$store.commit("FINISH_PLUGIN_OPERATION", {
          status: operation.status,
          title: operation.status === "error" ? `插件${labels[action]}后应用失败` : `插件${labels[action]}完成`,
          message: operation.message,
          applyMode: operation.applyMode,
          restartAvailable: operation.restartAvailable,
          accessUrls: operation.accessUrls,
          accessTargets: operation.accessTargets,
        })
        if (!this._isDestroyed) await this.loadPlugins(false)
      } catch (error) {
        this.$store.commit("FINISH_PLUGIN_OPERATION", {
          status: "error",
          title: `插件${labels[action]}失败`,
          message: error.response?.data?.detail || error.message || `${labels[action]}失败`,
        })
      }
      finally { this.actionId = null; this.actionType = "" }
    },
    async cancelPending(plugin) {
      if (!plugin.pending_operation_id) return
      const confirmed = await this.$cuteConfirm({ title: "撤销待重启操作", message: `撤销“${plugin.name}”的待应用修改？`, confirmButtonText: "撤销", cancelButtonText: "保留", type: "warning" })
      if (!confirmed) return
      try {
        const response = await this.deleteRequest(`${this.$root.prefix}/store/transactions/pending/${encodeURIComponent(plugin.pending_operation_id)}`, {}, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info || "撤销失败")
        notifyRestartStatusChanged()
        await this.loadPlugins(false)
      } catch (error) {
        this.$message.error(error.response?.data?.detail || error.message || "撤销失败")
      }
    },
  },
}
</script>

<style scoped>
.store-shell { min-height: 100%; padding: 22px; color: var(--text-color); background: var(--bg-color); }
.store-shell.is-embedded { padding: 0; background: transparent; }
.store-shell.is-embedded .store-header h1 { font-size: 18px; }
.store-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.store-header h1 { margin: 0; font-size: 24px; }.store-header p { margin: 5px 0 0; color: var(--text-color-secondary); }
.store-toolbar { display: grid; grid-template-columns: minmax(240px, 1fr) 150px 150px 150px; gap: 10px; margin-bottom: 16px; }
.store-content { min-height: 260px; }.plugin-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.plugin-card { display: flex; min-width: 0; min-height: 244px; flex-direction: column; padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }
.plugin-card__head { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: 10px; }.plugin-title { min-width: 0; }
.plugin-title h2 { margin: 0; overflow: hidden; color: var(--text-color); font-size: 16px; line-height: 24px; text-overflow: ellipsis; white-space: nowrap; }
.plugin-title span, .detail-module { color: var(--text-color-secondary); font-family: Consolas, monospace; font-size: 12px; }
.plugin-description { display: -webkit-box; min-height: 44px; margin: 14px 0; overflow: hidden; color: var(--text-color-secondary); line-height: 22px; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.plugin-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin: 0 0 14px; }.plugin-meta div { min-width: 0; }.plugin-meta dt { color: var(--text-color-secondary); font-size: 11px; }.plugin-meta dd { margin: 2px 0 0; overflow: hidden; color: var(--text-color); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.reload-diagnostic { min-height: 24px; margin-bottom: 8px; }
.catalog-blocked { margin-bottom: 8px; color: var(--danger-color); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.plugin-actions { display: flex; min-height: 34px; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border-color); }.action-spacer { flex: 1; }.icon-action { width: 32px; height: 32px; padding: 0; }
.inline-state, .empty-state { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 96px; color: var(--text-color-secondary); }.inline-state.is-error { margin-bottom: 14px; border: 1px solid var(--el-color-danger-light-7); border-radius: 6px; color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
.empty-state { min-height: 300px; flex-direction: column; }.empty-state i { font-size: 34px; }.empty-state h2, .empty-state p { margin: 0; }.store-pagination { margin-top: 20px; text-align: center; }
.detail-drawer { padding: 0 22px 24px; color: var(--text-color); }.detail-drawer h3 { margin: 22px 0 8px; font-size: 14px; }.detail-drawer p, .detail-drawer pre { margin: 0; color: var(--text-color-secondary); line-height: 1.7; white-space: pre-wrap; word-break: break-word; }.detail-drawer a { word-break: break-all; }
@media (max-width: 1180px) { .plugin-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.store-toolbar { grid-template-columns: 1fr 1fr; } }
@media (max-width: 680px) { .store-shell { padding: 14px; }.store-header { align-items: flex-start; }.store-toolbar, .plugin-grid { grid-template-columns: 1fr; }.plugin-card { min-height: 224px; } }
</style>
