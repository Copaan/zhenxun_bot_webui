<template>
  <div class="data-page" v-loading="loading">
    <header class="page-header">
      <div><h1>数据与缓存</h1><p>配置持久化数据库，检查连接并管理真寻缓存。</p></div>
      <el-button icon="el-icon-refresh" @click="loadRuntime">重新检查</el-button>
    </header>

    <section class="settings-band">
      <div class="section-heading">
        <div><h2>数据库连接</h2><p>保存前会使用独立连接执行 SELECT 1，不影响当前 ORM。</p></div>
        <span class="status-pill" :class="`is-${databaseStatus.status || 'unknown'}`">
          <i></i>{{ statusLabel(databaseStatus.status) }}
          <em v-if="databaseStatus.latency_ms != null">{{ databaseStatus.latency_ms }} ms</em>
        </span>
      </div>
      <el-tabs v-model="databaseMode" class="database-tabs">
        <el-tab-pane label="SQLite" name="sqlite">
          <el-form label-position="top" class="form-grid"><el-form-item label="SQLite 路径" class="wide"><el-input v-model="databaseDrafts.sqlite.path" /></el-form-item></el-form>
        </el-tab-pane>
        <el-tab-pane label="MySQL" name="mysql">
          <el-form label-position="top" class="form-grid">
            <el-form-item label="主机"><el-input v-model="databaseDrafts.mysql.host" /></el-form-item>
            <el-form-item label="端口"><el-input-number v-model="databaseDrafts.mysql.port" :min="1" :max="65535" controls-position="right" /></el-form-item>
            <el-form-item label="用户名"><el-input v-model="databaseDrafts.mysql.username" /></el-form-item>
            <el-form-item label="密码"><el-input v-model="databaseDrafts.mysql.password" type="password" show-password :placeholder="databaseDrafts.mysql.has_password ? '留空沿用当前密码' : '请输入密码'" /></el-form-item>
            <el-form-item label="数据库名" class="wide"><el-input v-model="databaseDrafts.mysql.database" /></el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="PostgreSQL" name="postgres">
          <el-form label-position="top" class="form-grid">
            <el-form-item label="主机"><el-input v-model="databaseDrafts.postgres.host" /></el-form-item>
            <el-form-item label="端口"><el-input-number v-model="databaseDrafts.postgres.port" :min="1" :max="65535" controls-position="right" /></el-form-item>
            <el-form-item label="用户名"><el-input v-model="databaseDrafts.postgres.username" /></el-form-item>
            <el-form-item label="密码"><el-input v-model="databaseDrafts.postgres.password" type="password" show-password :placeholder="databaseDrafts.postgres.has_password ? '留空沿用当前密码' : '请输入密码'" /></el-form-item>
            <el-form-item label="数据库名" class="wide"><el-input v-model="databaseDrafts.postgres.database" /></el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="高级 URL" name="url">
          <el-form label-position="top" class="form-grid"><el-form-item label="数据库连接 URL" class="wide"><el-input v-model="databaseDrafts.url.url" type="password" show-password :placeholder="databaseDrafts.url.has_saved_url ? '留空沿用当前 URL' : 'driver://user:password@host/database'" /></el-form-item></el-form>
        </el-tab-pane>
      </el-tabs>
    </section>

    <section class="settings-band">
      <div class="section-heading">
        <div><h2>缓存服务</h2><p>MEMORY 适合单实例；Redis 可共享普通业务缓存。</p></div>
        <span class="status-pill" :class="`is-${cacheStatus.status || 'unknown'}`">
          <i></i>{{ statusLabel(cacheStatus.status) }}
          <em v-if="cacheStatus.latency_ms != null">{{ cacheStatus.latency_ms }} ms</em>
        </span>
      </div>
      <el-radio-group v-model="cache.mode" class="mode-selector">
        <el-radio-button label="NONE">NONE</el-radio-button>
        <el-radio-button label="MEMORY">MEMORY</el-radio-button>
        <el-radio-button label="REDIS">REDIS</el-radio-button>
      </el-radio-group>
      <el-form v-if="cache.mode === 'REDIS'" label-position="top" class="form-grid redis-form">
        <el-form-item label="Redis 主机"><el-input v-model="cache.host" /></el-form-item>
        <el-form-item label="端口"><el-input-number v-model="cache.port" :min="1" :max="65535" controls-position="right" /></el-form-item>
        <el-form-item label="密码" class="wide"><el-input v-model="cache.password" type="password" show-password :placeholder="cache.has_password ? '留空沿用当前密码' : '无密码可留空'" /></el-form-item>
      </el-form>
      <div v-if="runtime.cache && runtime.cache.redis && cache.mode === 'REDIS'" class="metric-row">
        <span>Redis 键数 <strong>{{ formatNumber(runtime.cache.redis.dbsize) }}</strong></span>
        <span>内存使用 <strong>{{ formatBytes(runtime.cache.redis.used_memory) }}</strong></span>
      </div>
    </section>

    <section class="settings-band">
      <div class="section-heading"><div><h2>运行时缓存</h2><p>权限与限制快照只能刷新，不允许直接清空。</p></div></div>
      <div class="metrics-grid">
        <div class="metric"><span>运行时条目</span><strong>{{ runtimeEntryCount }}</strong></div>
        <div class="metric"><span>临时缓存条目</span><strong>{{ boundedTotals.items }}</strong></div>
        <div class="metric"><span>命中</span><strong>{{ boundedTotals.hits }}</strong></div>
        <div class="metric"><span>未命中</span><strong>{{ boundedTotals.misses }}</strong></div>
        <div class="metric"><span>淘汰</span><strong>{{ boundedTotals.evictions }}</strong></div>
        <div class="metric"><span>过期</span><strong>{{ boundedTotals.expirations }}</strong></div>
      </div>
      <el-table :data="runtimeCacheRows" size="small" class="runtime-table">
        <el-table-column prop="name" label="缓存" min-width="120" />
        <el-table-column prop="entry_count" label="条目" width="90" />
        <el-table-column prop="negative_count" label="负缓存" width="90" />
        <el-table-column label="状态" width="100"><template slot-scope="scope"><el-tag size="mini" :type="scope.row.has_error ? 'danger' : scope.row.loaded ? 'success' : 'info'">{{ scope.row.has_error ? "异常" : scope.row.loaded ? "已加载" : "未加载" }}</el-tag></template></el-table-column>
      </el-table>
      <div class="cache-actions">
        <el-button :loading="cacheAction === 'refresh'" @click="refreshRuntime">刷新运行时缓存</el-button>
        <el-button :loading="cacheAction === 'local'" @click="clearLocal">清理本地临时缓存</el-button>
        <el-button v-if="cache.mode === 'REDIS'" type="danger" plain :loading="cacheAction === 'redis'" @click="clearRedis">清理真寻 Redis 命名空间</el-button>
      </div>
    </section>

    <div v-if="pageError" class="inline-error">{{ pageError }}</div>
    <footer class="save-bar">
      <span>{{ launcherManaged ? "保存后可确认由 launcher 受控重启" : "当前为直接 worker，保存后需手动重启" }}</span>
      <el-button :loading="probing" @click="probe">测试连接</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
    </footer>

  </div>
</template>

<script>
import { handleApplyResult } from "@/utils/apply-result"
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"

const createDatabaseDrafts = () => ({
  sqlite: { mode: "sqlite", path: "data/db/zhenxun.db" },
  mysql: { mode: "mysql", host: "127.0.0.1", port: 3306, username: "", password: "", database: "", has_password: false },
  postgres: { mode: "postgres", host: "127.0.0.1", port: 5432, username: "", password: "", database: "", has_password: false },
  url: { mode: "url", url: "", has_saved_url: false },
})

export default {
  name: "DatabaseManage",
  data() {
    return {
      loading: false, saving: false, probing: false, cacheAction: "", revision: "", launcherManaged: false, runtime: {}, operationError: "",
      databaseMode: "sqlite",
      savedDatabaseMode: "sqlite",
      databaseDrafts: createDatabaseDrafts(),
      databaseBaselines: {},
      databaseProbeErrors: {},
      draftsInitialized: false,
      cache: { mode: "MEMORY", host: "127.0.0.1", port: 6379, password: "" },
      probeResults: {},
      cacheBaseline: "",
    }
  },
  computed: {
    activeDatabase() { return this.databaseDrafts[this.databaseMode] },
    activeProbeResult() { return this.probeResults[this.databaseMode] || {} },
    databaseStatus() { return this.activeProbeResult.database || (this.databaseMode === this.savedDatabaseMode ? this.runtime.database?.connection : {}) || {} },
    pageError() { return this.operationError || this.databaseProbeErrors[this.databaseMode] || "" },
    cacheStatus() {
      if (this.activeProbeResult.cache) return this.activeProbeResult.cache
      if (this.cache.mode === "REDIS") return this.runtime.cache?.redis || {}
      return { status: "ok", latency_ms: 0 }
    },
    runtimeCacheRows() { return Object.entries(this.runtime.cache?.runtime || {}).map(([name, value]) => ({ name, ...value })) },
    runtimeEntryCount() { return this.runtimeCacheRows.reduce((total, item) => total + Number(item.entry_count || 0), 0) },
    boundedTotals() {
      const totals = { items: 0, hits: 0, misses: 0, evictions: 0, expirations: 0 }
      Object.values(this.runtime.cache?.bounded || {}).forEach((item) => Object.keys(totals).forEach((key) => { totals[key] += Number(item[key] || 0) }))
      return totals
    },
  },
  mounted() { this.loadRuntime() },
  beforeDestroy() { clearDirtyState("database-configuration") },
  watch: {
    databaseDrafts: { deep: true, handler() { this.updateDirtyState() } },
    cache: { deep: true, handler() { this.updateDirtyState() } },
  },
  methods: {
    statusLabel(status) { return { ok: "连接正常", warning: "需要注意", error: "连接异常" }[status] || "尚未检查" },
    formatNumber(value) { return value == null ? "-" : Number(value).toLocaleString() },
    formatBytes(value) { if (!value) return "-"; const units = ["B", "KB", "MB", "GB"]; let size = Number(value); let index = 0; while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1 } return `${size.toFixed(index ? 1 : 0)} ${units[index]}` },
    async loadRuntime() {
      if (this.loading || this.saving) return
      this.loading = true; this.operationError = ""
      try {
        const response = await this.getRequest(`${this.$root.prefix}/database/runtime`)
        if (!response.suc) throw new Error(response.info)
        this.runtime = response.data; this.launcherManaged = response.data.launcher_managed
        if (!this.draftsInitialized) {
          this.revision = response.data.revision
          const configuration = response.data.database.configuration
          const mode = configuration.mode || "sqlite"
          this.databaseMode = mode
          this.savedDatabaseMode = mode
          this.databaseDrafts[mode] = { ...this.databaseDrafts[mode], ...configuration, mode }
          Object.keys(this.databaseDrafts).forEach((key) => { this.$set(this.databaseBaselines, key, JSON.stringify(this.databaseDrafts[key])) })
          this.draftsInitialized = true
        }
        if (!this.cacheBaseline) this.cache = { ...this.cache, ...response.data.cache.configuration }
        this.$nextTick(() => { if (!this.cacheBaseline) this.cacheBaseline = JSON.stringify(this.cache); this.updateDirtyState() })
      } catch (error) { this.operationError = error.response?.data?.detail || error.message || "数据服务状态加载失败。" }
      finally { this.loading = false }
    },
    payload() {
      return { database: { ...this.activeDatabase, port: this.activeDatabase.port || null }, cache: { ...this.cache } }
    },
    updateDirtyState() {
      if (!this.draftsInitialized || !this.cacheBaseline) return
      const databaseDirty = Object.keys(this.databaseDrafts).some((key) => JSON.stringify(this.databaseDrafts[key]) !== this.databaseBaselines[key])
      setDirtyState("database-configuration", databaseDirty || JSON.stringify(this.cache) !== this.cacheBaseline)
    },
    async probe() {
      if (this.probing || this.saving) return
      const mode = this.databaseMode
      const draft = JSON.stringify(this.databaseDrafts[mode])
      const cache = JSON.stringify(this.cache)
      this.probing = true; this.operationError = ""; this.$delete(this.databaseProbeErrors, this.databaseMode)
      try {
        const response = await this.postRequest(`${this.$root.prefix}/database/probe`, this.payload())
        if (!response.suc) throw new Error(response.info)
        if (draft !== JSON.stringify(this.databaseDrafts[mode]) || cache !== JSON.stringify(this.cache)) return
        this.$set(this.probeResults, mode, response.data)
        if (response.data.database.status === "error" || response.data.cache.status === "error") this.$set(this.databaseProbeErrors, mode, "连接检查未通过，请根据状态修改配置。")
        else this.$message.success("数据库与缓存检查完成。")
      } catch (error) { if (draft === JSON.stringify(this.databaseDrafts[mode])) this.$set(this.databaseProbeErrors, mode, error.response?.data?.detail || error.message || "连接检查失败。") }
      finally { this.probing = false }
    },
    async save() {
      if (this.saving || this.probing) return
      const mode = this.databaseMode
      const draft = JSON.stringify(this.databaseDrafts[mode])
      const cache = JSON.stringify(this.cache)
      this.saving = true; this.operationError = ""
      try {
        const response = await this.putRequest(`${this.$root.prefix}/database/configuration`, { expected_revision: this.revision, ...this.payload() })
        if (!response.suc) { this.$set(this.probeResults, mode, response.data || {}); throw new Error(response.info) }
        if (response.data?.apply_mode !== "failed") {
        this.revision = response.data.revision
        this.savedDatabaseMode = mode
        this.$set(this.databaseBaselines, mode, draft)
        this.cacheBaseline = cache
        this.updateDirtyState()
        }
        await handleApplyResult(this, response, {
          restartPrompt: "数据与缓存配置已保存，需要重启后生效。",
          restartRequest: () => this.postRequest(`${this.$root.prefix}/system/configuration/restart`, {}),
          returnRoute: "/database",
          recoveryMessage: "数据服务配置将在新进程中生效。",
        })
      } catch (error) { this.operationError = error.response?.data?.detail || error.message || "配置保存失败。" }
      finally { this.saving = false }
    },
    async refreshRuntime() { await this.cacheRequest("refresh", "/database/cache/refresh", {}) },
    async clearLocal() { await this.cacheRequest("local", "/database/cache/clear", { scope: "local" }) },
    async clearRedis() {
      try {
        const result = await this.$prompt("只会删除 ZHENXUN:* 键。请输入“清理真寻Redis缓存”确认。", "高风险操作", { confirmButtonText: "清理", cancelButtonText: "取消", inputPlaceholder: "清理真寻Redis缓存" })
        await this.cacheRequest("redis", "/database/cache/clear", { scope: "redis", confirmation: result.value })
      } catch (error) { /* User cancelled. */ }
    },
    async cacheRequest(action, path, payload) {
      if (this.cacheAction || this.saving) return
      this.cacheAction = action
      try {
        const response = await this.postRequest(`${this.$root.prefix}${path}`, payload)
        if (!response.suc) throw new Error(response.info)
        this.$message.success(response.info); await this.loadRuntime()
      } catch (error) { this.$message.error(error.response?.data?.detail || error.message || "缓存操作失败") }
      finally { this.cacheAction = "" }
    },
  },
}
</script>

<style scoped>
.data-page { min-height: 100%; padding: 22px; color: var(--text-color); background: var(--bg-color); }.page-header, .section-heading, .save-bar, .cache-actions, .metric-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }.page-header { margin-bottom: 16px; }.page-header h1, .section-heading h2 { margin: 0; }.page-header h1 { font-size: 24px; }.page-header p, .section-heading p { margin: 5px 0 0; color: var(--text-color-secondary); }
.settings-band { margin-bottom: 14px; padding: 18px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }.section-heading h2 { font-size: 18px; }.mode-selector { margin: 18px 0 14px; }.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }.form-grid .wide { grid-column: 1 / -1; }.form-grid ::v-deep .el-input-number { width: 100%; }.metric-row { justify-content: flex-start; margin-top: 10px; color: var(--text-color-secondary); }.metric-row span { padding-right: 22px; }
.metrics-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin: 16px 0; }.metric { min-width: 0; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; }.metric span { display: block; overflow: hidden; color: var(--text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.metric strong { display: block; margin-top: 5px; font-size: 20px; }.runtime-table { margin-bottom: 14px; }.cache-actions { justify-content: flex-start; flex-wrap: wrap; }
.save-bar { position: sticky; bottom: 0; z-index: 3; padding: 12px 0; border-top: 1px solid var(--border-color); background: var(--bg-color); }.save-bar span { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }.inline-error { margin: 10px 0; padding: 10px 12px; border: 1px solid var(--el-color-danger-light-7); border-radius: 5px; color: var(--el-color-danger); background: var(--el-color-danger-light-9); }.status-pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 9px; border: 1px solid var(--border-color); border-radius: 5px; color: var(--text-color-secondary); font-size: 12px; white-space: nowrap; }.status-pill i { width: 8px; height: 8px; border-radius: 50%; background: var(--el-color-info); }.status-pill.is-ok i { background: var(--el-color-success); }.status-pill.is-error i { background: var(--el-color-danger); }.status-pill em { font-style: normal; }
@media (max-width: 1050px) { .metrics-grid { grid-template-columns: repeat(3, 1fr); } }@media (max-width: 680px) { .data-page { padding: 12px; }.page-header, .section-heading { align-items: flex-start; }.form-grid { grid-template-columns: 1fr; }.form-grid .wide { grid-column: auto; }.mode-selector { display: flex; overflow-x: auto; }.metrics-grid { grid-template-columns: repeat(2, 1fr); }.save-bar { flex-wrap: wrap; }.save-bar span { width: 100%; } }
</style>
