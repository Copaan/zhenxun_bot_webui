<template>
  <section class="store-shell">
    <header class="store-header">
      <div>
        <h1>插件商店</h1>
        <p>浏览、安装和维护真寻插件</p>
      </div>
      <el-button icon="el-icon-refresh" :loading="loading" @click="loadPlugins(true)">检查更新</el-button>
    </header>

    <div class="store-toolbar">
      <el-input v-model.trim="search" clearable prefix-icon="el-icon-search" placeholder="搜索名称、模块或作者" />
      <el-button class="filter-toggle" :class="{ 'is-open': filtersOpen }" icon="el-icon-s-operation" :aria-expanded="String(filtersOpen)" @click="filtersOpen = !filtersOpen">筛选<span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span></el-button>
      <div class="store-filters" :class="{ 'is-open': filtersOpen }">
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
        <el-option label="版本号（从新到旧）" value="version" />
      </el-select>
      <el-select v-model="downloadSource" class="download-source" aria-label="下载源" :disabled="pluginOperation.active" @change="saveDownloadSource">
        <el-option label="自动：阿里优先，GitHub 后备" value="auto" />
        <el-option label="仅阿里" value="ali" />
        <el-option label="仅 GitHub" value="git" />
      </el-select>
      </div>
    </div>

    <div v-if="error" class="inline-state is-error">
      <i class="el-icon-warning-outline"></i><span>{{ error }}</span>
      <el-button type="text" @click="loadPlugins(false)">重新加载</el-button>
    </div>

    <div v-loading="loading && plugins.length > 0" class="store-content">
      <div v-if="loading && !plugins.length" class="plugin-grid" aria-busy="true" aria-label="正在加载插件">
        <div v-for="index in 6" :key="index" class="plugin-card is-skeleton">
          <span class="zx-skeleton skeleton-title"></span>
          <span class="zx-skeleton skeleton-module"></span>
          <span class="zx-skeleton skeleton-line"></span>
          <span class="zx-skeleton skeleton-line is-short"></span>
          <div class="skeleton-meta"><span v-for="cell in 4" :key="cell" class="zx-skeleton"></span></div>
          <span class="zx-skeleton skeleton-action"></span>
        </div>
      </div>
      <div v-else-if="pagedPlugins.length" class="plugin-grid">
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
            <div><dt>来源</dt><dd>{{ { official: "官方", community: "社区", local: "本地" }[plugin.source] || "社区" }}</dd></div>
          </dl>
          <div v-if="plugin.installed && !plugin.local" class="reload-diagnostic">
            <el-tag
              size="mini"
              :type="plugin.stopped ? 'warning' : plugin.reload_support === 'hot_reloadable' ? 'success' : 'info'"
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
              <el-tooltip v-if="plugin.apply_mode === 'failed'" :content="(plugin.failure_reasons || []).map((item) => reasonText(item.code)).join('；') || '待重启事务已失败'" placement="top">
                <el-button size="small" icon="el-icon-warning-outline" disabled>事务失败</el-button>
              </el-tooltip>
              <el-button v-else size="small" icon="el-icon-time" disabled>等待重启</el-button>
              <el-button size="small" type="text" class="danger-text" :loading="pendingActionKey === (plugin.store_key || plugin.id)" :disabled="Boolean(pendingActionKey) || pluginOperation.active" @click="cancelPending(plugin)">{{ plugin.apply_mode === "failed" ? "清除记录" : "撤销" }}</el-button>
            </template>
            <template v-else>
              <el-button type="text" @click="showDetails(plugin)">详情</el-button>
              <el-tooltip content="打开插件仓库" placement="top">
                <el-button v-if="repositoryUrl(plugin)" class="icon-action" icon="el-icon-link" circle @click="openRepository(plugin)" />
              </el-tooltip>
              <span class="action-spacer"></span>
              <el-tooltip v-if="plugin.installed && plugin.reload_support === 'hot_reloadable'" content="热重载插件" placement="top">
                <el-button class="icon-action" icon="el-icon-refresh" circle :loading="actionId === (plugin.store_key || plugin.id) && actionType === 'reload'" :disabled="Boolean(actionId) || pluginOperation.active" @click="runAction('reload', plugin)" />
              </el-tooltip>
              <el-tooltip v-if="!plugin.installed" :content="plugin.catalog_status === 'missing' ? '仓库中找不到目录声明的插件文件' : '安装插件'" placement="top">
                <span><el-button type="primary" size="small" :disabled="plugin.catalog_status === 'missing' || Boolean(actionId) || pluginOperation.active" :loading="actionId === (plugin.store_key || plugin.id)" @click="runAction('install', plugin)">安装</el-button></span>
              </el-tooltip>
              <el-button v-if="plugin.installed && plugin.update_available" type="warning" size="small" :loading="actionId === (plugin.store_key || plugin.id) && actionType === 'update'" :disabled="Boolean(actionId) || pluginOperation.active" @click="runAction('update', plugin)">更新插件</el-button>
              <el-dropdown v-if="plugin.installed && !plugin.local" trigger="click" @command="runAction($event, plugin)">
                <el-button size="small">已安装<i class="el-icon-arrow-down el-icon--right" /></el-button>
                <el-dropdown-menu slot="dropdown"><el-dropdown-item command="remove">卸载</el-dropdown-item></el-dropdown-menu>
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
  </section>
</template>

<script>
import { notifyRestartStatusChanged } from "@/utils/apply-result"
import { newOperationId, reasonText, rememberPluginOperation, storeOperationResult } from "@/utils/plugin-operation"

const compareVersion = (left, right) => {
  const parts = (value) => String(value || "").split(/[.+-]/).map((item) => (/^\d+$/.test(item) ? Number(item) : item))
  const a = parts(left)
  const b = parts(right)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index] ?? 0
    const y = b[index] ?? 0
    if (x === y) continue
    if (typeof x === "number" && typeof y === "number") return x - y
    return String(x).localeCompare(String(y))
  }
  return 0
}

export default {
  name: "StoreTemplate",
  data() {
    let source = "auto"
    try { source = localStorage.getItem("zhenxun_plugin_download_source") || "auto" } catch (_) { /* Storage may be disabled. */ }
    return { downloadSource: ["auto", "ali", "git"].includes(source) ? source : "auto", plugins: [], loading: false, error: "", search: "", statusFilter: "all", typeFilter: "all", sortBy: "default", filtersOpen: false, page: 1, pageSize: 18, actionId: null, actionType: "", pendingActionKey: "", drawerVisible: false, selectedPlugin: null }
  },
  computed: {
    pluginOperation() { return this.$store.state.pluginOperation },
    pluginTypes() { return [...new Set(this.plugins.map((item) => item.plugin_type).filter(Boolean))].sort() },
    filteredPlugins() {
      const keyword = this.search.toLowerCase()
      const result = this.plugins.filter((plugin) => {
        const matchesSearch = !keyword || `${plugin.name} ${plugin.module} ${plugin.author}`.toLowerCase().includes(keyword)
        const matchesType = this.typeFilter === "all" || plugin.plugin_type === this.typeFilter
        const matchesStatus = this.statusFilter === "all" || (this.statusFilter === "uninstalled" && !plugin.installed) || (this.statusFilter === "installed" && plugin.installed) || (this.statusFilter === "updatable" && plugin.update_available)
        return matchesSearch && matchesType && matchesStatus
      })
      if (this.sortBy === "default") return result
      if (this.sortBy === "version") return [...result].sort((left, right) => compareVersion(right.version, left.version))
      return [...result].sort((left, right) => String(left[this.sortBy] || "").localeCompare(String(right[this.sortBy] || ""), "zh-CN"))
    },
    /**
     * 统计偏离默认值的筛选项数量
     * @returns {number} 已启用的筛选项数量
     */
    activeFilterCount() { return [this.statusFilter !== "all", this.typeFilter !== "all", this.sortBy !== "default", this.downloadSource !== "auto"].filter(Boolean).length },
    pagedPlugins() { const start = (this.page - 1) * this.pageSize; return this.filteredPlugins.slice(start, start + this.pageSize) },
    drawerSize() { return window.innerWidth <= 680 ? "92%" : "520px" },
  },
  watch: { search() { this.page = 1 }, statusFilter() { this.page = 1 }, typeFilter() { this.page = 1 }, sortBy() { this.page = 1 } },
  mounted() { this.loadPlugins() },
  methods: {
    reasonText,
    saveDownloadSource() {
      try { localStorage.setItem("zhenxun_plugin_download_source", this.downloadSource) } catch (_) { /* Optional preference. */ }
      this.loadPlugins()
    },
    repositoryUrl(plugin) { return plugin.github_url || plugin.ali_url || "" },
    openRepository(plugin) { window.open(this.repositoryUrl(plugin), "_blank", "noopener,noreferrer") },
    showDetails(plugin) { this.selectedPlugin = plugin; this.drawerVisible = true },
    reloadLabel(plugin) {
      if (plugin.stopped) {
        if ((plugin.reload_reasons || []).includes("dependency_missing")) return "缺少依赖已停用，安装依赖后重启"
        return plugin.reload_support === "hot_reloadable" ? "加载失败已停用，修复后可热重载" : "加载失败已停用，修复后需重启生效"
      }
      if (plugin.parked) return "已停用（已卸载）"
      if (plugin.reload_support === "hot_reloadable") return "支持热加载"
      if ((plugin.reload_reasons || []).includes("not_loaded")) return "尚未加载"
      return "变更后需要重启"
    },
    async loadPlugins(refresh = false) {
      this.loading = true; this.error = ""
      try {
        const response = await this.getRequest(`${this.$root.prefix}/store/get_plugin_store`, { refresh, download_source: this.downloadSource })
        if (!response.suc) throw new Error(response.info || "插件商店加载失败")
        this.plugins = Array.isArray(response.data.plugin_list) ? response.data.plugin_list : []
      } catch (error) {
        this.plugins = []
        this.error = error.response?.data?.detail || error.message || "插件商店暂时不可用。"
      } finally { this.loading = false }
    },
    async runAction(action, plugin) {
      const labels = { install: "安装", update: "更新", remove: "卸载", reload: "热重载" }
      const actionKey = plugin.store_key || plugin.id
      if (this.pluginOperation.active || this.actionId) {
        this.$message.warning("已有插件操作正在进行，请等待完成。")
        return
      }
      if (action === "install" && plugin.catalog_status === "missing") {
        this.$message.error("目录中的插件路径已失效，请等待目录维护者修复。")
        return
      }
      this.actionId = actionKey
      this.actionType = action
      const requestedSource = this.downloadSource
      const sourceLabel = { auto: "自动（阿里优先，GitHub 后备）", ali: "仅阿里", git: "仅 GitHub" }[requestedSource]
      const overwrite = action === "update" && plugin.install_state === "locally_modified" ? " 本地修改将被覆盖。" : ""
      const confirmed = await this.$confirmAction({ title: `${labels[action]}插件`, message: `确认${labels[action]}“${plugin.name}”？${["install", "update"].includes(action) ? ` 下载源：${sourceLabel}` : ""}${overwrite}`, confirmButtonText: "确认", cancelButtonText: "取消", type: action === "remove" || overwrite ? "warning" : "info" })
      if (!confirmed) { this.actionId = null; this.actionType = ""; return }
      const operationId = newOperationId()
      rememberPluginOperation(operationId, action, plugin.name, "zhenxun")
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
        if (["install", "update"].includes(action)) payload.download_source = requestedSource
        let response = await this.postRequest(`${this.$root.prefix}/store/${action}_plugin`, payload, { suppressErrorToast: true })
        if (!response.suc && ["install", "update"].includes(action) && String(response.info || "").includes("source_build_confirmation_required")) {
          const sourceConfirmed = await this.$confirmAction({
            title: "确认源码构建风险",
            message: "该插件的依赖需要从源码构建。确认后会先在临时目录构建，构建失败时不修改插件文件和依赖；构建成功后需重启验证，失败时会回滚。是否继续？",
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
          payload.operation_id = newOperationId()
          rememberPluginOperation(payload.operation_id, action, plugin.name, "zhenxun")
          payload.confirm_source_build = true
          response = await this.postRequest(`${this.$root.prefix}/store/${action}_plugin`, payload, { suppressErrorToast: true })
        }
        if (!response.suc) throw new Error(response.info || `${labels[action]}失败`)
        const operation = storeOperationResult(response, response.info || `${labels[action]}已完成。`, action)
        notifyRestartStatusChanged()
        this.$store.commit("FINISH_PLUGIN_OPERATION", {
          status: operation.status,
          title: operation.status === "error" ? `插件${labels[action]}后应用失败` : `插件${labels[action]}完成`,
          message: [operation.message, response.data?.actual_download_source ? `下载源：${sourceLabel}；实际来源：${response.data.actual_download_source}` : ""].filter(Boolean).join("\n"),
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
          message: reasonText(error.response?.data?.info || error.response?.data?.detail || error.message || `${labels[action]}失败`),
        })
      }
      finally { this.actionId = null; this.actionType = "" }
    },
    async cancelPending(plugin) {
      if (!plugin.pending_operation_id) return
      const actionKey = plugin.store_key || plugin.id
      if (this.pendingActionKey || this.actionId || this.pluginOperation.active) return
      this.pendingActionKey = actionKey
      const failed = plugin.apply_mode === "failed"
      const confirmed = await this.$confirmAction({ title: failed ? "清除失败事务" : "撤销待重启操作", message: failed ? `清除“${plugin.name}”所在的失败事务记录？清除后可以重新操作。` : `撤销“${plugin.name}”的待应用修改？`, confirmButtonText: failed ? "清除" : "撤销", cancelButtonText: "保留", type: "warning" })
      if (!confirmed) { this.pendingActionKey = ""; return }
      try {
        const response = await this.deleteRequest(`${this.$root.prefix}/store/transactions/pending/${encodeURIComponent(plugin.pending_operation_id)}`, {}, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info || "撤销失败")
        this.$message.success(response.info || "待重启插件操作已撤销")
        notifyRestartStatusChanged()
        await this.loadPlugins(false)
      } catch (error) {
        this.$message.error(reasonText(error.response?.data?.info || error.response?.data?.detail || error.message || "撤销失败"))
      } finally {
        this.pendingActionKey = ""
      }
    },
  },
}
</script>

<style scoped>
.store-shell { min-height: 100%; padding: 22px; color: var(--text-color); background: var(--bg-color); }
.store-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.store-header h1 { margin: 0; font-size: 24px; }.store-header p { margin: 5px 0 0; color: var(--text-color-secondary); }
.store-toolbar { display: grid; grid-template-columns: minmax(240px, 1fr) 150px 150px 150px 230px; gap: 10px; margin-bottom: 16px; }
.store-content { min-height: 260px; }.plugin-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.plugin-card { display: flex; min-width: 0; min-height: 244px; flex-direction: column; padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }
.plugin-card.is-skeleton { gap: 10px; }.skeleton-title { width: 45%; height: 18px; }.skeleton-module { width: 30%; }.skeleton-line { width: 92%; }.skeleton-line.is-short { width: 60%; }
.skeleton-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin-top: 8px; }.skeleton-meta .zx-skeleton { width: 70%; }.skeleton-action { width: 72px; height: 28px; margin-top: auto; margin-left: auto; }
.plugin-card__head { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: 10px; }.plugin-title { min-width: 0; }
.plugin-title h2 { margin: 0; overflow: hidden; color: var(--text-color); font-size: 16px; line-height: 24px; text-overflow: ellipsis; white-space: nowrap; }
.plugin-title span, .detail-module { color: var(--text-color-secondary); font-family: Consolas, monospace; font-size: 12px; }
.plugin-description { display: -webkit-box; min-height: 44px; margin: 14px 0; overflow: hidden; color: var(--text-color-secondary); line-height: 22px; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.plugin-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin: 0 0 14px; }.plugin-meta div { min-width: 0; }.plugin-meta dt { color: var(--text-color-secondary); font-size: 11px; }.plugin-meta dd { margin: 2px 0 0; overflow: hidden; color: var(--text-color); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.reload-diagnostic { min-height: 24px; margin-bottom: 8px; }
.catalog-blocked { margin-bottom: 8px; color: var(--danger-color); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.plugin-actions { display: flex; min-height: 34px; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: auto; padding-top: 12px; border-top: 0; }.action-spacer { flex: 1; }.icon-action { width: 32px; height: 32px; padding: 0; }.plugin-actions .el-dropdown-menu { min-height: 0; padding: 4px 0; }.plugin-actions .el-dropdown-menu__item { line-height: 30px; }
.inline-state, .empty-state { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 96px; color: var(--text-color-secondary); }.inline-state.is-error { margin-bottom: 14px; border: 1px solid var(--el-color-danger-light-7); border-radius: 6px; color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
.empty-state { min-height: 300px; flex-direction: column; }.empty-state i { font-size: 34px; }.empty-state h2, .empty-state p { margin: 0; }.store-pagination { margin-top: 20px; text-align: center; }
.detail-drawer { padding: 0 22px 24px; color: var(--text-color); }.detail-drawer h3 { margin: 22px 0 8px; font-size: 14px; }.detail-drawer p, .detail-drawer pre { margin: 0; color: var(--text-color-secondary); line-height: 1.7; white-space: pre-wrap; word-break: break-word; }.detail-drawer a { word-break: break-all; }
@media (max-width: 1180px) { .plugin-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.store-toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 680px) { .store-shell { padding: 14px; }.store-header { align-items: flex-start; }.plugin-grid { grid-template-columns: 1fr; }.plugin-card { min-height: 224px; } }
.store-filters { display: contents; }.filter-toggle { display: none; }
.filter-count { display: inline-block; min-width: 18px; height: 18px; margin-left: 6px; padding: 0 5px; border-radius: 9px; color: #fff; background: var(--primary-color); font-size: 11px; line-height: 18px; text-align: center; box-sizing: border-box; }
@media (max-width: 767px) {
  .store-toolbar { grid-template-columns: minmax(0, 1fr) auto; }
  .filter-toggle { display: inline-block; margin-left: 0; }
  .filter-toggle.is-open { border-color: var(--primary-color); color: var(--primary-color); }
  .store-filters { display: none; grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .store-filters.is-open { display: grid; }
  .store-filters .download-source { grid-column: 1 / -1; }
}
</style>
