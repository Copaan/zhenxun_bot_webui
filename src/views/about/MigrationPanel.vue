<template>
  <section class="migration-section" aria-labelledby="migration-title">
    <header class="migration-heading">
      <div><h2 id="migration-title">实例迁移</h2><span>.zx 迁移包</span></div>
      <el-button icon="el-icon-refresh" size="small" :loading="loading" @click="refresh">刷新状态</el-button>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="exportTracking" title="正在跟踪导出任务：业务进程会短暂停止，创建快照后自动恢复，再压缩并校验迁移包。连接中断时将继续查询原任务，请勿重复提交。" type="info" :closable="false" show-icon />
    <el-form v-if="authRequired" label-position="top" class="migration-form" @submit.native.prevent="login">
      <p>会话已失效，草稿和任务记录仍保留。恢复提交后请使用确认的管理员重新登录。</p>
      <el-form-item label="当前管理员"><el-input v-model="loginUsername" autocomplete="off" /></el-form-item>
      <el-form-item label="当前管理员密码"><el-input v-model="loginPassword" type="password" autocomplete="new-password" /></el-form-item>
      <el-button :loading="loginBusy" @click="login">重新登录</el-button>
    </el-form>
    <p v-if="nextOrigin">如果监听入口已经切换，请<a :href="nextOrigin" rel="noreferrer">前往确认后的入口重新登录</a>。切换不会携带登录 Token；HTTPS 转 HTTP 需由你点击此链接。</p>
    <el-alert v-if="capability && capability.maintenance" title="实例维护中，迁移尚未完成。" type="info" :closable="false" show-icon />
    <el-alert v-if="capability && !capability.restore" :title="`当前运行条件暂不支持恢复：${(capability.restore_blockers || []).join('、')}。可先核验迁移包。`" type="warning" :closable="false" show-icon />
    <div class="migration-actions">
      <el-button icon="el-icon-download" :disabled="!capability || !capability.online_export || busy || exportTracking" :loading="exportBusy" @click="exportInstance">导出实例</el-button>
      <el-button icon="el-icon-upload2" :disabled="!capability || capability.upload === false || busy" @click="$refs.file.click()">选择迁移包</el-button>
      <input ref="file" class="migration-file-input" type="file" accept=".zx" @change="selectFile" />
    </div>
    <div class="migration-source">
      <el-select v-model="discoveredPath" :disabled="busy || !capability || capability.discovery === false" placeholder="选择本机已发现的迁移包" clearable @change="selectDiscovered">
        <el-option v-for="item in packages" :key="item.path" :label="`${item.path} (${size(item.size)})`" :value="item.path" />
      </el-select>
      <span v-if="file" class="migration-filename">{{ file.name }} · {{ size(file.size) }}</span>
    </div>
    <el-form v-if="file || discoveredPath" label-position="top" class="migration-form" @submit.native.prevent>
      <el-form-item label="迁移包密码（仅加密包需要）">
        <el-input v-model="password" type="password" show-password autocomplete="new-password" :disabled="busy" maxlength="1024" />
      </el-form-item>
      <el-checkbox v-if="file" v-model="sensitiveConfirmed" :disabled="busy">确认将可能包含凭据和数据库的文件上传至当前实例</el-checkbox>
      <div class="migration-actions">
        <el-button type="primary" icon="el-icon-document-checked" :loading="busy" :disabled="!capability || capability.maintenance || Boolean(file && !sensitiveConfirmed)" @click="inspect(1)">{{ file && !sealed ? '上传并核验' : '核验迁移包' }}</el-button>
        <el-button v-if="busy" icon="el-icon-video-pause" @click="pause">停止本次请求</el-button>
        <el-button v-else icon="el-icon-close" @click="clearSelection">清除选择</el-button>
      </div>
      <el-progress v-if="file && busy && !sealed" :percentage="progress" />
    </el-form>
    <div v-if="inspection" class="migration-inspection">
      <h3>迁移包核验结果</h3>
      <el-alert title="文件完整性已核验；来源可信性未验证。恢复尚未执行。" type="info" :closable="false" />
      <dl>
        <dt>包 ID</dt><dd>{{ inspection.package_id }}</dd>
        <dt>SHA-256</dt><dd class="migration-hash">{{ inspection.sha256 }}</dd>
        <dt>源环境</dt><dd>{{ [inspection.source.core_version, inspection.source.python, inspection.source.system, inspection.source.architecture].filter(Boolean).join(' · ') || '未记录' }}</dd>
        <dt>文件数量</dt><dd>{{ inspection.total }}</dd>
      </dl>
      <p v-for="reason in inspection.replacement_blockers" :key="reason" class="migration-error-code">{{ reason }}</p>
      <div class="migration-table">
        <el-table :data="inspection.items" size="small">
          <el-table-column prop="path" label="逻辑路径" min-width="210" />
          <el-table-column prop="category" label="类别" width="90" />
          <el-table-column label="大小" width="100"><template slot-scope="scope">{{ size(scope.row.size) }}</template></el-table-column>
        </el-table>
      </div>
      <el-pagination small layout="prev, pager, next" :pager-count="5" :page-size="50" :current-page="page" :total="inspection.total" :disabled="busy" @current-change="inspect" />
      <el-button type="primary" :disabled="busy || Boolean(inspection.replacement_blockers.length)" @click="restoreVisible = true">打开完整替换向导</el-button>
    </div>
    <div class="migration-history">
      <h3>迁移任务</h3>
      <p v-if="!jobs.length">暂无迁移任务</p>
      <article v-for="job in jobs" :key="job.id" class="migration-job">
        <div><strong>{{ job.action === 'export' ? '导出实例' : '完整替换迁移' }}</strong><span>{{ stage(job.stage) }}</span></div>
        <code>{{ job.id }}</code>
        <p v-if="job.first_error" class="migration-error-code">首次错误：{{ job.first_error }}</p>
        <p v-if="job.rollback_error" class="migration-error-code">回滚错误：{{ job.rollback_error }}</p>
        <p v-if="job.progress && job.progress.last_recovery_error" class="migration-error-code">最近一次恢复核验：{{ job.progress.last_recovery_error }}</p>
        <p v-if="job.cancel_requested">已请求取消，等待实际清理结果</p>
        <p v-if="job.progress && job.progress.business_opened === false">业务入口尚未开放{{ job.progress.offline ? '；离线恢复完成后请手动启动实例' : '' }}</p>
        <div v-if="job.progress && job.progress.dependencies" class="migration-dependencies">
          <p>依赖恢复：安装 {{ Object.keys(job.progress.dependencies.installed || {}).length }} 项，版本放宽 {{ (job.progress.dependencies.relaxed || []).length }} 项，缺失 {{ (job.progress.dependencies.missing || []).length }} 项</p>
          <details v-if="(job.progress.dependencies.missing || []).length">
            <summary>查看缺失依赖</summary>
            <p v-for="item in job.progress.dependencies.missing" :key="item.name">{{ item.name }} · {{ item.code }}</p>
          </details>
          <p v-if="(job.progress.dependencies.failed_plugins || []).length">初始化失败并隔离的插件：{{ job.progress.dependencies.failed_plugins.join('、') }}</p>
        </div>
        <el-button v-if="['awaiting_credentials', 'recovery_required'].includes(job.stage)" size="small" :disabled="Boolean(recoveryBusy)" @click="openRecovery(job)">查看恢复要求 / 重新授权</el-button>
        <el-button v-if="canCancel(job)" size="small" icon="el-icon-close" :loading="cancelling === job.id" @click="cancelJob(job)">请求取消</el-button>
        <el-button v-if="job.action === 'export' && job.stage === 'completed'" size="small" :loading="downloading === job.id" @click="downloadJob(job)">下载迁移包</el-button>
      </article>
      <el-pagination v-if="jobTotal > 20" small layout="prev, pager, next" :pager-count="5" :page-size="20" :current-page="jobPage" :total="jobTotal" @current-change="changeJobPage" />
    </div>
    <el-dialog title="重新授权恢复" :visible.sync="recoveryVisible" width="min(560px, 94vw)" :close-on-click-modal="false" :before-close="closeRecovery">
      <el-alert v-if="recoveryError" :title="recoveryError" type="error" :closable="false" show-icon />
      <template v-if="recoveryRequirements">
        <p>任务：<code class="migration-hash">{{ recoveryRequirements.task_id }}</code></p>
        <el-alert title="重新授权会再次核验作业所有权，不会强行覆盖未知外部修改，也不会重置作业预算。" type="warning" :closable="false" show-icon />
        <p v-if="recoveryRequirements.committed">提交决定已保存。后续处理只允许收尾，不撤销已提交成果。</p>
        <el-form label-position="top" @submit.native.prevent>
          <template v-if="recoveryRequirements.credentials_required">
            <p class="migration-hash">{{ recoveryRequirements.engine }} · {{ recoveryRequirements.target.host }}:{{ recoveryRequirements.target.port }} / {{ recoveryRequirements.target.database }}</p>
            <el-form-item label="目标数据库受限账号"><el-input v-model="recoveryUsername" autocomplete="off" :disabled="Boolean(recoveryBusy)" maxlength="128" /></el-form-item>
            <el-form-item label="目标数据库密码"><el-input v-model="recoveryPassword" type="password" show-password autocomplete="new-password" :disabled="Boolean(recoveryBusy)" maxlength="4096" /></el-form-item>
          </template>
          <p v-else>此任务无需外部数据库凭据。</p>
          <el-checkbox v-model="recoveryConfirmed" :disabled="Boolean(recoveryBusy)">我确认继续核验并处理此任务的恢复阶段</el-checkbox>
        </el-form>
      </template>
      <span slot="footer"><el-button :disabled="Boolean(recoveryBusy)" @click="closeRecovery()">关闭</el-button><el-button type="primary" :loading="Boolean(recoveryBusy)" :disabled="!recoveryRequirements || !recoveryConfirmed" @click="reauthorize">提交授权</el-button></span>
    </el-dialog>
    <migration-restore-wizard v-if="restoreVisible && inspection" :visible="restoreVisible" :inspection="inspection" :upload-id="uploadId" :discovered-path="discoveredPath" :archive-password="password" :capability="capability" :source-busy="busy" :first-deployment="firstDeployment" @reauthenticated="restoreReauthenticated" @close="restoreVisible = false" @submitted="restoreSubmitted" />
  </section>
</template>

<script>
import { clearDirtyState, setDirtyState } from "@/utils/dirty-state"
import { migrationLogin, downloadMigration, migrationRequest, migrationStages, recoveryDatabase, terminalMigrationStages, uploadMigration } from "@/utils/migration"
import MigrationRestoreWizard from "./MigrationRestoreWizard.vue"

export default {
  name: "MigrationPanel",
  components: { MigrationRestoreWizard },
  props: { firstDeployment: Boolean },
  data: () => ({ authRequired: false, loginUsername: "", loginPassword: "", loginBusy: false, nextOrigin: "", capability: null, loading: false, busy: false, error: "", packages: [], discoveredPath: "", file: null, uploadId: null, sealed: false, password: "", sensitiveConfirmed: false, progress: 0, inspection: null, page: 1, jobs: [], jobTotal: 0, jobPage: 1, cancelling: null, recoveryVisible: false, recoveryRequirements: null, recoveryUsername: "", recoveryPassword: "", recoveryConfirmed: false, recoveryError: "", recoveryBusy: false, restoreVisible: false, exportBusy: false, exportTracking: false, downloading: null }),
  created() { this.sequence = 0; this.readSequence = 0; this.refresh() },
  beforeDestroy() { this.sequence += 1; this.readSequence += 1; this.exportSequence = (this.exportSequence || 0) + 1; this.recoverySequence = (this.recoverySequence || 0) + 1; this.controller?.abort(); clearTimeout(this.poll); clearDirtyState("migration"); clearDirtyState("migration-recovery") },
  watch: {
    recoveryUsername() { this.recoveryDirty() },
    recoveryPassword() { this.recoveryDirty() },
    recoveryConfirmed() { this.recoveryDirty() },
  },
  methods: {
    async exportInstance() {
      if (this.exportBusy || this.exportTracking) return
      const sequence = this.exportSequence = (this.exportSequence || 0) + 1
      this.exportBusy = true; this.error = ""
      try {
        const preview = await migrationRequest("/export/preview")
        if (sequence !== this.exportSequence) return
        await this.$confirm(`将导出 ${preview.total} 个文件（另有 ${preview.excluded_total} 个排除项目）。明文包包含管理员凭据、数据库及插件代码；确认后会停止业务进程、建立一致快照并自动重启原业务，再打包校验。请等待任务完成后下载。`, "确认导出实例", { type: "warning", confirmButtonText: "确认导出明文包" })
        if (sequence !== this.exportSequence) return
        this.exportTracking = true
        try {
          await migrationRequest("/export", { method: "post", data: { confirm_secrets: true, dependencies: true } })
        } catch (error) {
          if (sequence !== this.exportSequence) return
          if (error.response && error.response.status < 500) { this.exportTracking = false; throw error }
          // The launcher may have accepted the request before the worker disconnected.
          this.error = "提交结果暂未确认，正在查询原任务；不会自动重复导出。"
        }
        if (sequence !== this.exportSequence) return
        await this.refresh()
      } catch (error) { if (sequence === this.exportSequence && error !== "cancel" && error !== "close") this.error = this.message(error) }
      finally { if (sequence === this.exportSequence) this.exportBusy = false }
    },
    async downloadJob(job) {
      if (this.downloading) return
      this.downloading = job.id
      try { await downloadMigration(job.id) } catch (error) { if (error.name !== "AbortError") this.error = this.message(error) }
      finally { this.downloading = null }
    },
    async restoreReauthenticated() { this.uploadId = null; this.sealed = false; await this.inspect(1) },
    restoreSubmitted(task, entry) {
      if (entry) {
        const host = ["0.0.0.0", "::", "127.0.0.1", "localhost"].includes(entry.host) ? window.location.hostname : entry.host
        try { const url = new URL(`${entry.https ? "https" : "http"}://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${entry.port}`); if (!url.username && !url.password && url.pathname === "/") this.nextOrigin = url.origin } catch (_) { /* A failed URL never triggers navigation. */ }
      }
      this.restoreVisible = false; this.clearSelection(); this.refresh()
    },
    async login() {
      if (this.loginBusy || !this.loginUsername || !this.loginPassword) return
      this.loginBusy = true
      try { await migrationLogin(this.loginUsername, this.loginPassword); this.authRequired = false; this.loginPassword = ""; this.uploadId = null; this.sealed = false; await this.refresh() }
      catch (error) { this.error = this.message(error) }
      finally { this.loginBusy = false }
    },
    recoveryDirty() { setDirtyState("migration-recovery", Boolean(this.recoveryUsername || this.recoveryPassword || this.recoveryConfirmed)) },
    async openRecovery(job) {
      if (this.recoveryBusy) return
      const sequence = this.recoverySequence = (this.recoverySequence || 0) + 1
      this.recoveryBusy = true; this.recoveryError = ""; this.recoveryVisible = true
      this.recoveryRequirements = null
      try {
        const requirements = await migrationRequest(`/tasks/${job.id}/recovery`)
        if (sequence !== this.recoverySequence) return
        this.recoveryRequirements = requirements
      } catch (error) { if (sequence === this.recoverySequence) this.recoveryError = this.message(error) }
      finally { if (sequence === this.recoverySequence) this.recoveryBusy = false }
    },
    closeRecovery(done) {
      if (this.recoveryBusy) return
      this.recoverySequence = (this.recoverySequence || 0) + 1
      this.recoveryVisible = false; this.recoveryUsername = ""; this.recoveryPassword = ""; this.recoveryConfirmed = false; this.recoveryRequirements = null
      clearDirtyState("migration-recovery")
      if (typeof done === "function") done()
    },
    async reauthorize() {
      if (this.recoveryBusy || !this.recoveryConfirmed || !this.recoveryRequirements) return
      const sequence = this.recoverySequence
      this.recoveryBusy = true; this.recoveryError = ""
      try {
        const database = recoveryDatabase(this.recoveryRequirements, this.recoveryUsername, this.recoveryPassword)
        await migrationRequest(`/tasks/${this.recoveryRequirements.task_id}/credentials`, { method: "post", data: { database } })
        if (sequence !== this.recoverySequence) return
        this.recoveryPassword = ""; this.recoveryUsername = ""; this.recoveryConfirmed = false; this.recoveryVisible = false
        clearDirtyState("migration-recovery")
        await this.refresh()
      } catch (error) { if (sequence === this.recoverySequence) this.recoveryError = this.message(error) }
      finally { if (sequence === this.recoverySequence) this.recoveryBusy = false }
    },
    stage(value) { return migrationStages[value] || value },
    size(value) { return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MiB` : `${(value / 1024).toFixed(1)} KiB` },
    message(error) { if (error.response?.status === 401) this.authRequired = true; return error.response?.data?.detail || error.message || "迁移请求失败" },
    canCancel(job) { return !terminalMigrationStages.has(job.stage) && !["committed", "recovery_required"].includes(job.stage) && !job.cancel_requested },
    async refresh() {
      const sequence = ++this.readSequence
      clearTimeout(this.poll)
      this.loading = true
      try {
        const capability = await migrationRequest("/capabilities")
        const packages = capability.discovery === false ? { items: [] } : await migrationRequest("/discover")
        const jobs = await migrationRequest("/tasks", { params: { offset: (this.jobPage - 1) * 20, limit: 20 } })
        if (sequence !== this.readSequence) return
        this.capability = capability; this.packages = packages.items; this.jobs = jobs.items; this.jobTotal = jobs.total
        this.exportTracking = jobs.items.some((job) => job.action === "export" && !terminalMigrationStages.has(job.stage)); this.error = ""
        if (jobs.items.some((job) => !terminalMigrationStages.has(job.stage))) this.poll = setTimeout(() => this.refresh(), 5000)
      } catch (error) {
        if (sequence === this.readSequence) {
          this.error = this.message(error)
          if (!error.response || error.response.status >= 500) this.poll = setTimeout(() => this.refresh(), 5000)
        }
      }
      finally { if (sequence === this.readSequence) this.loading = false }
    },
    async selectFile(event) {
      const file = event.target.files[0]
      event.target.value = ""
      if (!file) return
      this.clearSelection(); this.file = file; setDirtyState("migration", true)
    },
    selectDiscovered(path) { this.clearSelection(); this.discoveredPath = path; setDirtyState("migration", Boolean(path)) },
    clearSelection() {
      this.sequence += 1; this.file = null; this.discoveredPath = ""; this.uploadId = null; this.sealed = false
      this.password = ""; this.sensitiveConfirmed = false; this.inspection = null; this.error = ""; this.progress = 0
      clearDirtyState("migration")
    },
    pause() { this.controller?.abort() },
    async inspect(page) {
      if (this.busy || !this.capability || this.capability.maintenance || (!this.file && !this.discoveredPath)) return
      this.busy = true; this.error = ""
      const sequence = ++this.sequence
      const controller = new AbortController(); this.controller = controller
      try {
        if (this.file && !this.sealed) {
          await uploadMigration(this.file, { uploadId: this.uploadId, signal: controller.signal, onCreated: (id) => { if (sequence === this.sequence) this.uploadId = id }, onProgress: (value) => { if (sequence === this.sequence) this.progress = value } })
          if (sequence !== this.sequence) return
          this.sealed = true
        }
        const value = await migrationRequest("/inspect", { method: "post", signal: controller.signal, data: { upload_id: this.file ? this.uploadId : null, path: this.discoveredPath || null, password: this.password || null, offset: (page - 1) * 50, limit: 50 } })
        if (sequence !== this.sequence) return
        this.inspection = value; this.page = page
      } catch (error) { if (sequence === this.sequence) this.error = controller.signal.aborted ? "请求已停止；已确认上传的分块保留，可继续核验。" : this.message(error) }
      finally { if (sequence === this.sequence) { this.busy = false; this.controller = null } }
    },
    changeJobPage(page) { this.jobPage = page; this.refresh() },
    async cancelJob(job) {
      if (this.cancelling) return
      try { await this.$confirm("提交前取消会进入清理或回滚，提交后的结果不会撤销。", "请求取消迁移", { type: "warning" }) } catch (error) { return }
      this.cancelling = job.id
      try { await migrationRequest(`/tasks/${job.id}/cancel`, { method: "post" }); await this.refresh() }
      catch (error) { this.error = this.message(error) }
      finally { this.cancelling = null }
    },
  },
}
</script>

<style scoped>
.migration-section { padding: 28px 0; border-top: 1px solid #dce2e8; color: #35424d; }
.migration-heading, .migration-actions, .migration-source { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.migration-heading h2 { font-size: 21px; margin: 0 0 6px; }
.migration-heading span, .migration-history > p { color: #64717c; font-size: 13px; }
.migration-actions { justify-content: flex-start; margin-top: 16px; }
.migration-actions .el-button { margin-left: 0; }
.migration-file-input { display: none; }
.migration-source { justify-content: flex-start; }
.migration-source .el-select { width: 380px; max-width: 100%; }
.migration-filename, .migration-hash, .migration-job code, .migration-error-code { overflow-wrap: anywhere; word-break: break-word; }
.migration-form { max-width: 640px; }
.migration-form .el-checkbox { display: flex; white-space: normal; align-items: flex-start; }
.migration-form ::v-deep .el-checkbox__label { white-space: normal; line-height: 1.6; }
.migration-section > .el-alert { margin-bottom: 12px; }
.migration-section h3 { font-size: 17px; margin: 24px 0 12px; }
.migration-inspection dl { display: grid; grid-template-columns: 85px minmax(0, 1fr); gap: 10px; font-size: 13px; }
.migration-inspection dd { margin: 0; }
.migration-table { overflow-x: auto; }
.migration-table .el-table { min-width: 360px; }
.migration-section .el-pagination { margin-top: 14px; max-width: 100%; }
.migration-job { border-bottom: 1px solid #e2e7eb; padding: 14px 0; font-size: 13px; }
.migration-job > div { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.migration-job code { display: block; color: #64717c; }
.migration-error-code { color: #a83838; }
@media (max-width: 600px) {
  .migration-section { padding: 22px 0; }
  .migration-heading h2 { font-size: 19px; }
  .migration-source .el-select { width: 100%; }
  .migration-actions { gap: 8px; }
  .migration-actions .el-button { padding: 10px; font-size: 12px; }
}
</style>
