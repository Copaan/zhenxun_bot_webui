<template>
  <main class="maintenance-page">
    <header><span>真寻 · 实例迁移</span><h1>维护与恢复</h1><p>业务入口保持关闭。请查看持久任务结果，按要求补充授权。</p></header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="connectionNotice" :title="connectionNotice" type="info" :closable="false" show-icon />
    <el-form v-if="!token" class="login-form" label-position="top" @submit.native.prevent="login">
      <h2>使用目标实例原管理员登录</h2>
      <el-form-item label="管理员账号"><el-input v-model="username" autocomplete="username" :disabled="busy" /></el-form-item>
      <el-form-item label="管理员密码"><el-input v-model="password" type="password" show-password autocomplete="current-password" :disabled="busy" /></el-form-item>
      <el-button native-type="submit" type="primary" :loading="busy">登录维护页面</el-button>
    </el-form>
    <section v-else>
      <div class="toolbar"><h2>迁移任务</h2><el-button size="small" :loading="loading" @click="refresh">刷新状态</el-button><el-button size="small" @click="logout">退出登录</el-button></div>
      <p v-if="!jobs.length">暂无任务</p>
      <article v-for="job in jobs" :key="job.id">
        <div class="task-heading"><h3>{{ job.action === 'restore' ? '完整替换迁移' : '导出实例' }}</h3><el-tag>{{ stage(job.stage) }}</el-tag></div>
        <code>{{ job.id }}</code>
        <p v-if="job.first_error" class="error-text">首次错误：{{ job.first_error }}</p>
        <p v-if="job.progress && job.progress.snapshot_mode === 'forced_stop'">强制停止后导出 · 仅核验已持久化数据</p><p v-if="job.progress && job.progress.original_worker_resumed">原实例已恢复并就绪</p>
        <details v-if="job.shutdown_diagnostic && job.shutdown_diagnostic.result !== 'confirmed'">
          <summary>查看关闭阻塞原因</summary>
          <p v-for="item in (job.shutdown_diagnostic.failed_components || [])" :key="item.component_id">
            {{ item.component_id }}：{{ item.error_code }}
            <small v-if="item.diagnostic && item.diagnostic.diagnostic_id">（{{ item.diagnostic.diagnostic_id }}）</small>
            <span v-for="(stage, index) in ((item.diagnostic && item.diagnostic.stages) || [])" :key="index"> · {{ stage.stage }}：{{ stage.error_code }}</span>
          </p>
          <p v-if="job.shutdown_diagnostic.forced">业务进程曾被强制终止。</p>
          <p v-if="job.progress && job.progress.export_recovered">已结束失败任务，允许原实例重新启动。</p>
          <p v-else-if="!(job.progress && job.progress.snapshot_mode)">关闭尚未确认，迁移快照未开始。</p>
        </details>
        <p v-if="job.rollback_error" class="error-text">回滚错误：{{ job.rollback_error }}</p>
        <p v-if="job.progress && job.progress.last_recovery_error" class="error-text">最近一次恢复核验：{{ job.progress.last_recovery_error }}</p>
        <p v-if="job.cancel_requested">取消已请求，等待实际清理结果。</p>
        <p v-if="job.progress && job.progress.validation_release === 'unconfirmed'">验证进程的资源释放尚未确认。</p>
        <template v-if="job.progress && job.progress.dependencies">
          <p>缺失依赖 {{ (job.progress.dependencies.missing || []).length }} 项；放宽版本 {{ (job.progress.dependencies.relaxed || []).length }} 项。</p>
          <details v-if="(job.progress.dependencies.missing || []).length"><summary>查看依赖结果</summary><p v-for="item in job.progress.dependencies.missing" :key="item.name">{{ item.name }} · {{ item.code }}</p></details>
          <p v-if="(job.progress.dependencies.failed_plugins || []).length">已隔离的失败插件：{{ job.progress.dependencies.failed_plugins.join('、') }}</p>
        </template>
        <el-button v-if="['awaiting_credentials','recovery_required'].includes(job.stage)" size="small" :disabled="busy" @click="selectRecovery(job)">重新授权恢复</el-button>
        <el-button v-else-if="!terminal.has(job.stage) && !['committed','committing'].includes(job.stage) && !job.cancel_requested" size="small" :disabled="busy" @click="cancel(job)">请求取消</el-button>
      </article>
      <el-pagination v-if="total > 20" small layout="prev, pager, next" :pager-count="5" :page-size="20" :total="total" :current-page="page" @current-change="changePage" />
      <section v-if="recovery" class="recovery-form">
        <h2>核对恢复授权</h2><code>{{ recovery.task_id }}</code>
        <el-alert title="只继续已确认任务。重新授权不会重置预算，不会强行覆盖未知外部修改。" type="warning" :closable="false" show-icon />
        <p v-if="recovery.committed">已持久提交，仅允许继续收尾，不再回滚。</p>
        <el-form label-position="top" @submit.native.prevent="authorize">
          <template v-if="recovery.credentials_required">
            <p>{{ recovery.engine }} · {{ recovery.target.host }}:{{ recovery.target.port }} / {{ recovery.target.database }}</p>
            <el-form-item label="目标数据库受限账号"><el-input v-model="databaseUser" autocomplete="off" :disabled="busy" maxlength="128" /></el-form-item>
            <el-form-item label="目标数据库密码"><el-input v-model="databasePassword" type="password" show-password autocomplete="new-password" :disabled="busy" maxlength="4096" /></el-form-item>
          </template>
          <p v-else>此任务无需外部数据库凭据。</p>
          <el-checkbox v-model="confirmed" :disabled="busy">确认继续此任务的恢复核验</el-checkbox>
          <div class="toolbar"><el-button native-type="submit" type="primary" :disabled="!confirmed" :loading="busy">提交授权</el-button><el-button :disabled="busy" @click="clearRecovery">关闭</el-button></div>
        </el-form>
      </section>
      <p v-if="ready">业务服务已恢复，继续前需要重新登录。</p>
      <a v-if="ready" href="/">前往管理登录页面</a>
    </section>
  </main>
</template>

<script>
import { getBaseUrl } from '@/utils/api'
const terminal = new Set(["completed", "partial", "rolled_back", "cancelled", "failed"])
const stages = { queued: "等待执行", preparing: "准备中", quiescing: "停止业务中", snapshotting: "快照中", resuming: "恢复原实例中", compressing: "压缩中", applying: "应用中", verifying: "维护验证中", committing: "提交中", committed: "已提交，等待收尾", completed: "完成", partial: "部分完成", rolling_back: "回滚中", rolled_back: "已回滚", awaiting_credentials: "等待凭据", recovery_required: "恢复受阻", cancelled: "已取消", failed: "失败" }
export default {
  name: "MigrationMaintenance",
  data: () => ({ username: "", password: "", token: "", busy: false, loading: false, error: "", connectionNotice: "", lastConnectedAt: 0, activeTaskId: "", jobs: [], total: 0, page: 1, recovery: null, databaseUser: "", databasePassword: "", confirmed: false, ready: false, terminal }),
  created() { this.sequence = 0; this.sessionRevision = 0; this.activeTaskId = sessionStorage.getItem(`migration-export:${getBaseUrl()}`) || ''; this.onLeave = event => { if (this.databasePassword || this.confirmed) { event.preventDefault(); event.returnValue = "" } }; window.addEventListener("beforeunload", this.onLeave) },
  beforeDestroy() { this.sequence += 1; clearTimeout(this.poll); window.removeEventListener("beforeunload", this.onLeave); this.token = "" },
  methods: {
    stage(value) { return stages[value] || value },
    async request(path, { method = "GET", data, form } = {}) {
      const token = this.token
      const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {}
      if (data) headers["Content-Type"] = "application/json"
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      let response, value
      try {
        response = await fetch(`/zhenxun/api/${path}`, { method, headers, body: form || (data ? JSON.stringify(data) : undefined), credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal })
        value = await response.json()
      } catch (error) { error.connectionUnavailable = true; throw error }
      finally { clearTimeout(timeout) }
      if (response.status === 401 && token === this.token) this.logout(false)
      if (!response.ok || !value.suc) throw new Error(typeof value.detail === "string" ? value.detail : "维护请求失败，请重新连接后查看任务状态。")
      return value.data
    },
    async login() {
      if (this.busy) return
      this.busy = true; this.error = ""
      try { const value = await this.request("login", { method: "POST", form: new URLSearchParams({ username: this.username, password: this.password }) }); this.token = value.access_token; this.password = ""; await this.refresh() }
      catch (error) { this.error = error.message }
      finally { this.busy = false }
    },
    logout(clear = true) { this.sequence += 1; this.sessionRevision += 1; clearTimeout(this.poll); this.token = ""; this.password = ""; this.loading = false; if (clear) this.clearRecovery() },
    async refresh() {
      if (!this.token) return
      const sequence = ++this.sequence; clearTimeout(this.poll); this.loading = true
      try {
        const [jobs, status, tracked] = await Promise.allSettled([
          this.request(`migration/tasks?offset=${(this.page - 1) * 20}&limit=20`),
          this.request("system/startup/status"),
          this.activeTaskId ? this.request(`migration/tasks/${this.activeTaskId}`) : Promise.resolve(null),
        ])
        if (sequence !== this.sequence) return
        if (jobs.status === 'fulfilled') { this.jobs = jobs.value.items; this.total = jobs.value.total }
        if (tracked.status === 'fulfilled' && tracked.value) { this.jobs = [tracked.value, ...this.jobs.filter(job => job.id !== tracked.value.id)] }
        if (status.status === 'fulfilled') this.ready = status.value.operating_mode === "normal" && ["warmup_ready", "degraded"].includes(status.value.state)
        if (jobs.status === 'rejected') throw jobs.reason
        if (tracked.status === 'rejected') throw tracked.reason
        if (!this.activeTaskId) this.activeTaskId = this.jobs.find(job => !terminal.has(job.stage))?.id || ''
        this.lastConnectedAt = Date.now(); this.connectionNotice = ''
      } catch (error) { if (sequence === this.sequence) { if (error.connectionUnavailable) this.connectionNotice = `管理连接暂时中断，正在查询原任务。${this.lastConnectedAt ? '上次连接：' + new Date(this.lastConnectedAt).toLocaleTimeString() : ''}`; else this.error = error.message } }
      finally { if (sequence === this.sequence) { this.loading = false; if (!this.ready) this.poll = setTimeout(() => this.refresh(), 5000) } }
    },
    changePage(value) { this.page = value; this.refresh() },
    clearRecovery() { this.recovery = null; this.databaseUser = ""; this.databasePassword = ""; this.confirmed = false },
    async selectRecovery(job) {
      if (this.busy) return
      this.busy = true; this.error = ""
      try { const value = await this.request(`migration/tasks/${job.id}/recovery`); this.clearRecovery(); this.recovery = value }
      catch (error) { this.error = error.message }
      finally { this.busy = false }
    },
    async authorize() {
      if (this.busy || !this.recovery || !this.confirmed) return
      const revision = this.sessionRevision
      this.busy = true; this.error = ""
      try {
        let database = {}
        if (this.recovery.credentials_required) {
          const { engine, target } = this.recovery
          if (!["mysql", "postgres"].includes(engine) || !this.databaseUser || !Number.isInteger(target.port)) throw new Error("请核对目标数据库及受限账号。")
          const host = target.host.includes(":") ? `[${target.host}]` : target.host
          database = { target_url: `${engine}://${encodeURIComponent(this.databaseUser)}:${encodeURIComponent(this.databasePassword)}@${host}:${target.port}/${encodeURIComponent(target.database)}` }
        }
        await this.request(`migration/tasks/${this.recovery.task_id}/credentials`, { method: "POST", data: { database } })
        if (revision !== this.sessionRevision) return
        this.clearRecovery(); await this.refresh()
      } catch (error) { this.error = error.message }
      finally { this.busy = false }
    },
    async cancel(job) {
      if (this.busy) return
      try { await this.$confirm("提交前取消将进入清理或回滚。已提交成果不会撤销。", "确认取消", { type: "warning" }) } catch (error) { return }
      this.busy = true
      try { await this.request(`migration/tasks/${job.id}/cancel`, { method: "POST" }); await this.refresh() }
      catch (error) { this.error = error.message }
      finally { this.busy = false }
    },
  },
}
</script>

<style>
body { margin: 0; background: #f2f5f7; color: #35424d; font-family: "Microsoft YaHei", sans-serif; }
.maintenance-page { max-width: 920px; margin: 32px auto; padding: 32px; background: #fff; box-sizing: border-box; border-top: 4px solid #4b7891; }
.maintenance-page h1 { margin: 12px 0; font-size: 28px; }.maintenance-page h2 { font-size: 19px; }.maintenance-page h3 { font-size: 16px; margin: 0; }
.maintenance-page header { margin-bottom: 30px; }.maintenance-page header p, .maintenance-page header span { color: #697c89; }
.maintenance-page .toolbar, .task-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 18px 0; }
.maintenance-page article { padding: 12px 0 24px; border-bottom: 1px solid #dce2e8; }.maintenance-page code, .maintenance-page p { overflow-wrap: anywhere; }
.maintenance-page .login-form, .maintenance-page .recovery-form { max-width: 560px; }.maintenance-page .el-alert { margin: 16px 0; }
.maintenance-page .error-text { color: #ac3c3c; }.maintenance-page .el-checkbox { white-space: normal; }.maintenance-page .el-checkbox__label { white-space: normal; }
@media (max-width:600px) { .maintenance-page { margin: 0; padding: 22px 16px; min-height: 100vh; }.maintenance-page h1 { font-size: 25px; }.maintenance-page .el-button { margin-left: 0; } }
</style>
