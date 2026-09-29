<template>
  <section class="migration-section" aria-labelledby="migration-title">
    <header class="migration-heading">
      <div><h2 id="migration-title">实例迁移</h2><span>.zx 迁移包</span></div>
      <el-button icon="el-icon-refresh" size="small" :loading="loading" @click="refresh">刷新状态</el-button>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="connectionNotice" :title="connectionNotice" type="info" :closable="false" show-icon />
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
      <el-button v-if="!firstDeployment" icon="el-icon-download" :disabled="!capability || !capability.online_export || busy || exportTracking" :loading="exportBusy" @click="exportInstance">导出实例</el-button>
      <el-button icon="el-icon-upload2" :disabled="!capability || capability.upload === false || busy" @click="$refs.file.click()">选择迁移包</el-button>
      <input ref="file" class="migration-file-input" type="file" accept=".zx" @change="selectFile" />
    </div>
    <el-dialog title="确认导出实例" :visible.sync="exportDialog" custom-class="migration-export-dialog" top="5vh" width="min(560px, 94vw)" :close-on-click-modal="false">
      <DatabaseConnectionStatus :result="exportConnection" :checking="connectionChecking" migration />
      <p v-if="capability?.database_policy_version">后端能力检查策略：v{{ capability.database_policy_version }}</p>
      <p>按当前连接的数据库类型导出；已转换为 PostgreSQL 的数据库按 PostgreSQL 检查。迁移包不支持跨数据库引擎直接恢复。</p>
      <el-button size="small" :loading="connectionChecking" :disabled="exportBusy" @click="checkExportConnection">重新检测当前连接</el-button>
      <el-alert v-if="connectionInspectionTask && ['queued', 'running'].includes(connectionInspectionTask.status)" :title="`迁移工具连接检查${connectionInspectionTask.phase === 'queued' ? '排队中' : '进行中'}：已耗时 ${connectionInspectionTask.elapsed_seconds || 0}s`" type="info" :closable="false" show-icon />
      <el-alert v-if="previewTask && ['queued', 'running'].includes(previewTask.status)" :title="`导出预览${previewTask.phase === 'queued' ? '排队中' : '检查中'}：已耗时 ${previewTask.elapsed_seconds || 0}s`" type="info" :closable="false" show-icon />
      <el-alert v-if="previewTask && ['failed', 'expired'].includes(previewTask.status)" :title="`导出预览失败：${previewTask.error?.code || '检查失败'}，请关闭后重试。`" type="error" :closable="false" show-icon />
      <p v-if="exportPreview">将导出 {{ exportPreview.total }} 个文件，排除 {{ exportPreview.excluded_total }} 项。明文包包含管理员凭据、数据库及插件代码。</p>
      <details v-if="exportPreview"><summary>数据库与同名普通文件（{{ exportPreview.database_files_total || 0 }} 项）</summary>
        <p v-if="exportPreview.primary_engine">主库引擎：{{ exportPreview.primary_engine }}；原生备份完成后仍需在目标验证恢复兼容性。</p>
        <p v-for="(value, kind) in exportPreview.database_file_summary" :key="kind">{{ databaseFileLabel(kind) }}：{{ value.count }} 项 · {{ size(value.bytes) }}</p>
        <p v-for="item in exportPreview.database_files || []" :key="item.path" class="migration-hash">{{ item.path }} · {{ databaseFileLabel(item.database_file.kind) }} · {{ size(item.size) }}</p>
        <p v-if="exportPreview.database_files_total > (exportPreview.database_files || []).length">此处仅展示前 {{ (exportPreview.database_files || []).length }} 项，导出范围包含全部已选文件。</p>
      </details>
      <p v-if="error" class="migration-error-code" role="alert">{{ error }}</p>
      <p>先停止业务、建立快照，再恢复原实例并打包。</p>
      <el-checkbox v-model="allowForcedShutdown">关闭超时后允许强制停止 Bot</el-checkbox>
      <p v-if="allowForcedShutdown" class="migration-error-code">将终止整个业务进程树，可能丢失尚未落盘数据。进程退出与数据库核验通过后才继续导出；迁移包会标记强制停止来源。</p>
      <span slot="footer"><el-button @click="exportDialog = false">取消</el-button><el-button type="primary" :loading="exportBusy" :disabled="connectionChecking || !exportConnectionReady || !exportPreview" @click="confirmExport">确认导出明文包</el-button></span>
    </el-dialog>
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
      <el-alert v-if="inspectionTask && ['queued', 'running'].includes(inspectionTask.status)" :title="`迁移包检查${inspectionTask.phase === 'queued' ? '排队中' : '进行中'}：已耗时 ${inspectionTask.elapsed_seconds || 0}s`" type="info" :closable="false" show-icon />
    </el-form>
    <div v-if="inspection" class="migration-inspection">
      <h3>迁移包核验结果</h3><el-alert v-if="inspection.source.snapshot_mode === 'forced_stop'" title="此包在强制停止 Bot 后生成，可能不包含尚未落盘的内容。" type="warning" :closable="false" />
      <el-alert title="文件完整性已核验；来源可信性未验证。恢复尚未执行。" type="info" :closable="false" />
      <MigrationDatabases :items="inspection.databases || []" />
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
        <migration-task-status :job="job" />
        <p v-if="job.progress && job.progress.snapshot_mode === 'forced_stop'">强制停止后导出 · 仅核验已持久化数据</p>
        <p v-if="job.progress && job.progress.original_worker_resumed">原实例已恢复并就绪</p>
        <details v-if="job.shutdown_diagnostic && job.shutdown_diagnostic.result !== 'confirmed'">
          <summary>查看关闭阻塞原因</summary>
          <p v-for="item in (job.shutdown_diagnostic.failed_components || [])" :key="item.component_id">
            {{ item.component_id }}：{{ item.error_code }}
            <small v-if="item.diagnostic && item.diagnostic.diagnostic_id">（{{ item.diagnostic.diagnostic_id }}）</small>
            <span v-for="(stage, index) in ((item.diagnostic && item.diagnostic.stages) || [])" :key="index"> · {{ stage.stage }}：{{ stage.error_code }}</span>
          </p>
          <p v-if="job.shutdown_diagnostic.forced">业务进程曾被强制终止。</p>
          <p v-if="job.progress && job.progress.export_recovered">已结束失败任务，允许原实例重新启动。</p>
          <p v-else-if="job.first_error === 'migration_shutdown_unconfirmed' && !(job.progress && job.progress.snapshot_mode)">关闭尚未确认，迁移快照未开始。</p>
        </details>
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
            <el-form-item label="目标数据库账号"><el-input v-model="recoveryUsername" autocomplete="off" :disabled="Boolean(recoveryBusy)" maxlength="128" /></el-form-item>
            <el-form-item label="目标数据库密码"><el-input v-model="recoveryPassword" type="password" show-password autocomplete="new-password" :disabled="Boolean(recoveryBusy)" maxlength="4096" /></el-form-item>
          </template>
          <p v-else>此任务无需外部数据库凭据。</p>
          <el-checkbox v-model="recoveryConfirmed" :disabled="Boolean(recoveryBusy)">我确认继续核验并处理此任务的恢复阶段</el-checkbox>
        </el-form>
      </template>
      <span slot="footer"><el-button :disabled="Boolean(recoveryBusy)" @click="closeRecovery()">关闭</el-button><el-button type="primary" :loading="Boolean(recoveryBusy)" :disabled="!recoveryRequirements || !recoveryConfirmed" @click="reauthorize">提交授权</el-button></span>
    </el-dialog>
    <migration-restore-wizard v-if="restoreVisible && inspection" :visible="active && restoreVisible" :inspection="inspection" :upload-id="uploadId" :discovered-path="discoveredPath" :archive-password="password" :capability="capability" :source-busy="busy || Boolean(pendingRestoreId)" :first-deployment="firstDeployment" @operation-state="wizardOperation = $event" @submit-start="pendingRestoreId = $event" @submit-rejected="pendingRestoreId = ''" @submit-uncertain="restoreUnconfirmed" @reauthenticated="restoreReauthenticated" @close="restoreVisible = false" @submitted="restoreSubmitted" />
  </section>
</template>

<script>
import DatabaseConnectionStatus from "@/components/system/DatabaseConnectionStatus.vue"
import { getBaseUrl } from "@/utils/api"
import { clearDirtyState, setDirtyState } from "@/utils/dirty-state"
import { migrationLogin, migrationErrorMessage, downloadMigration, migrationRequest, migrationStages, migrationPollDelay, recoveryDatabase, terminalMigrationStages, uploadMigration, migrationConnectionMatches } from "@/utils/migration"
import MigrationTaskStatus from "./MigrationTaskStatus.vue"
import MigrationRestoreWizard from "./MigrationRestoreWizard.vue"
import MigrationDatabases from "./MigrationDatabases.vue"
import { isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"

export default {
  name: "MigrationPanel",
  components: { MigrationRestoreWizard, MigrationTaskStatus, DatabaseConnectionStatus, MigrationDatabases },
  props: { firstDeployment: Boolean, active: { type: Boolean, default: true } },
  computed: {
    exportConnectionReady() { return this.exportConnection?.ready === true && migrationConnectionMatches(this.exportConnection, this.capability) },
    running() { return this.active && !this.networkFrozen },
    switchBlockedReason() {
      if (this.pendingRestoreId) return "恢复已提交，正在核对任务结果，请勿重复配置"
      if (this.wizardOperation) return this.wizardOperation
      if (this.busy) return this.file && !this.sealed ? "正在上传迁移包，请等待完成" : "正在核验迁移包，请等待完成"
      if (this.loginBusy || this.recoveryBusy || this.cancelling) return "正在处理迁移请求，请等待完成"
      if (this.restoreVisible || this.recoveryVisible) return "请先完成或关闭当前恢复对话框"
      if (this.jobs.some(job => !terminalMigrationStages.has(job.stage)) || this.capability?.maintenance) return "迁移尚未结束，请先处理当前任务"
      return ""
    },
  },
  data: () => ({ networkFrozen: isBusinessNetworkFrozen(), wizardOperation: "", pendingRestoreId: "", exportConnection: null, connectionChecking: false, connectionSequence: 0, connectionInspectionTask: null, exportDialog: false, exportPreview: null, previewTask: null, allowForcedShutdown: false, activeExportId: "", connectionNotice: "", lastConnectedAt: 0, exportSubmittedAt: 0, authRequired: false, loginUsername: "", loginPassword: "", loginBusy: false, nextOrigin: "", capability: null, loading: false, busy: false, error: "", packages: [], discoveredPath: "", file: null, uploadId: null, sealed: false, password: "", sensitiveConfirmed: false, progress: 0, inspection: null, inspectionTask: null, page: 1, jobs: [], jobTotal: 0, jobPage: 1, cancelling: null, recoveryVisible: false, recoveryRequirements: null, recoveryUsername: "", recoveryPassword: "", recoveryConfirmed: false, recoveryError: "", recoveryBusy: false, restoreVisible: false, exportBusy: false, exportTracking: false, downloading: null }),
  created() {
    this.sequence = 0; this.readSequence = 0; this.requests = new Set(); this.waiters = new Set()
    this.activeExportId = this.firstDeployment ? "" : sessionStorage.getItem(this.exportStorageKey()) || ""; this.exportTracking = Boolean(this.activeExportId)
    this.unsubscribeNetwork = onBusinessNetworkChange(value => { this.networkFrozen = value })
    if (this.running) this.refresh()
  },
  beforeDestroy() { this.stopActivity(); this.unsubscribeNetwork?.(); clearDirtyState("migration"); clearDirtyState("migration-recovery") },
  watch: {
    running(value) { if (value) this.refresh(); else this.stopActivity() },
    switchBlockedReason: { immediate: true, handler(value) { this.$emit("switch-state", value) } },
    exportDialog(value) { if (!value) { this.connectionSequence += 1; this.previewSequence = (this.previewSequence || 0) + 1; this.connectionChecking = false; this.connectionInspectionTask = null; this.previewTask = null; if (!this.exportTracking) this.exportBusy = false } },
    recoveryUsername() { this.recoveryDirty() },
    recoveryPassword() { this.recoveryDirty() },
    recoveryConfirmed() { this.recoveryDirty() },
  },
  methods: {
    async request(path, options = {}) {
      const controller = new AbortController()
      const abort = () => controller.abort()
      if (options.signal?.aborted) abort()
      else options.signal?.addEventListener("abort", abort, { once: true })
      this.requests.add(controller)
      try { return await migrationRequest(path, { ...options, signal: controller.signal }) }
      finally { this.requests.delete(controller); options.signal?.removeEventListener("abort", abort) }
    },
    stopActivity() {
      this.connectionSequence++; this.sequence++; this.readSequence++
      this.previewSequence = (this.previewSequence || 0) + 1
      this.exportSequence = (this.exportSequence || 0) + 1; this.recoverySequence = (this.recoverySequence || 0) + 1
      this.controller?.abort(); clearTimeout(this.poll)
      for (const controller of this.requests) controller.abort()
      for (const resolve of this.waiters) resolve()
      this.refreshPromise = null; this.loading = false; this.busy = false; this.discoveryInFlight = false
      this.connectionChecking = false; this.exportBusy = false; this.recoveryBusy = false
    },
    waitForPoll(signal) {
      return new Promise(resolve => {
        const finish = () => { clearTimeout(timer); this.waiters.delete(finish); signal?.removeEventListener("abort", finish); resolve() }
        const timer = setTimeout(finish, 700)
        this.waiters.add(finish)
        if (signal?.aborted) finish(); else signal?.addEventListener("abort", finish, { once: true })
      })
    },
    bootstrapAuthorized() {
      this.authRequired = false; this.uploadId = null; this.sealed = false
      this.inspection = null; this.inspectionTask = null; this.restoreVisible = false; this.wizardOperation = ""
    },
    restoreUnconfirmed() { this.connectionNotice = "恢复提交结果尚未确认，正在查询原任务；不会自动重复提交。"; this.refresh() },
    databaseFileLabel(kind) { return ({ sqlite: "SQLite 数据库", sqlite_empty: "尚未初始化的主库", empty_placeholder: "空占位文件，原样保留", ordinary_file: "普通文件，原样保留", invalid_primary: "主库格式异常" })[kind] || "状态未确认" },
    exportStorageKey() { return `migration-export:${getBaseUrl()}` },
    trackExport(id) { this.activeExportId = id; this.exportTracking = Boolean(id); if (id) sessionStorage.setItem(this.exportStorageKey(), id); else sessionStorage.removeItem(this.exportStorageKey()) },
    async checkExportConnection() {
      if (!this.running || this.connectionChecking) return
      const sequence = ++this.connectionSequence
      this.connectionChecking = true; this.exportConnection = null
      let checkedResult = null
      try {
        const task = await this.request('/export/connection-check', { method: 'post', data: {} })
        if (sequence !== this.connectionSequence || !this.exportDialog) return
        this.connectionInspectionTask = task
        const state = await this.waitInspection(task, sequence, 'connection')
        if (sequence !== this.connectionSequence || !this.exportDialog) return
        checkedResult = state?.result || {}
        const readSequence = this.readSequence
        const current = await this.request('/capabilities', { timeout: 10000 })
        if (sequence !== this.connectionSequence || !this.exportDialog) return
        if (readSequence === this.readSequence) this.capability = current
        const value = checkedResult
        const mismatch = value.worker_generation && !migrationConnectionMatches(value, this.capability)
        if (state?.status === 'succeeded') {
          this.exportConnection = { ...value }
          if (mismatch || (value.ready && !migrationConnectionMatches(value, this.capability))) this.exportConnection = { ...value, ready: false, code: 'migration_database_preflight_stale' }
        } else this.exportConnection = { ...value, ready: false, code: state?.error?.code || 'migration_inspection_failed', diagnostic: state?.diagnostic || value.native?.diagnostic }
      } catch (error) {
        if (sequence === this.connectionSequence && this.exportDialog) this.exportConnection = { ...checkedResult, ready: false, code: this.message(error) }
      } finally { if (sequence === this.connectionSequence) this.connectionChecking = false }
    },
    async exportInstance() {
      if (!this.running || this.firstDeployment || this.exportBusy || this.exportTracking) return
      const sequence = this.previewSequence = (this.previewSequence || 0) + 1
      this.exportBusy = true; this.error = ''; this.exportPreview = null; this.exportDialog = true; this.allowForcedShutdown = false
      try {
        const previewState = await this.request('/export/preview')
        if (sequence !== this.previewSequence || !this.running || !this.exportDialog) return
        this.previewTask = previewState
        const [preview] = await Promise.all([
          this.waitInspection(previewState, sequence, 'preview'),
          this.checkExportConnection(),
        ])
        if (sequence === this.previewSequence && this.exportDialog) {
          if (preview?.status === 'succeeded') this.exportPreview = preview.result
          else this.error = `导出预览失败：${preview?.error?.code || '检查失败'}`
        }
      } catch (error) { if (sequence === this.previewSequence) this.error = this.message(error) }
      finally { if (sequence === this.previewSequence) this.exportBusy = false }
    },
    async confirmExport() {
      if (!this.running || this.exportBusy || this.exportTracking || this.connectionChecking || !this.exportConnectionReady || !this.exportPreview) return
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('')
      const sequence = this.exportSequence = (this.exportSequence || 0) + 1
      this.exportBusy = true; this.exportDialog = false; this.exportSubmittedAt = Date.now(); this.trackExport(id)
      try { await this.request('/export', { method: 'post', data: { task_id: id, connection_fingerprint: this.exportConnection.fingerprint, confirm_secrets: true, dependencies: true, allow_forced_shutdown: this.allowForcedShutdown } }) }
      catch (error) {
        if (sequence !== this.exportSequence) return
        if (error.response && error.response.status < 500) {
          this.trackExport(''); this.error = this.message(error)
          this.exportConnection = null; this.exportDialog = true
        }
        else this.connectionNotice = '提交结果暂未确认，正在查询原任务；不会自动重复导出。'
      } finally { if (sequence === this.exportSequence) { this.exportBusy = false; await this.refresh() } }
    },
    async downloadJob(job) {
      if (this.downloading) return
      this.downloading = job.id
      try { await downloadMigration(job.id) } catch (error) { if (error.name !== "AbortError") this.error = this.message(error) }
      finally { this.downloading = null }
    },
    async restoreReauthenticated() { this.uploadId = null; this.sealed = false; await this.inspect(1) },
    restoreSubmitted(task, entry) {
      this.pendingRestoreId = task.id
      this.jobs = [task, ...this.jobs.filter(job => job.id !== task.id)]
      if (entry) {
        const host = ["0.0.0.0", "::", "127.0.0.1", "localhost"].includes(entry.host) ? window.location.hostname : entry.host
        try { const url = new URL(`${entry.https ? "https" : "http"}://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${entry.port}`); if (!url.username && !url.password && url.pathname === "/") this.nextOrigin = url.origin } catch (_) { /* A failed URL never triggers navigation. */ }
      }
      this.restoreVisible = false; this.wizardOperation = ""; this.clearSelection(); this.refresh()
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
      if (!this.running || this.recoveryBusy) return
      const sequence = this.recoverySequence = (this.recoverySequence || 0) + 1
      this.recoveryBusy = true; this.recoveryError = ""; this.recoveryVisible = true
      this.recoveryRequirements = null
      try {
        const requirements = await this.request(`/tasks/${job.id}/recovery`)
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
      if (!this.running || this.recoveryBusy || !this.recoveryConfirmed || !this.recoveryRequirements) return
      const sequence = this.recoverySequence
      this.recoveryBusy = true; this.recoveryError = ""
      try {
        const database = recoveryDatabase(this.recoveryRequirements, this.recoveryUsername, this.recoveryPassword)
        await this.request(`/tasks/${this.recoveryRequirements.task_id}/credentials`, { method: "post", data: { database } })
        if (sequence !== this.recoverySequence) return
        this.recoveryPassword = ""; this.recoveryUsername = ""; this.recoveryConfirmed = false; this.recoveryVisible = false
        clearDirtyState("migration-recovery")
        await this.refresh()
      } catch (error) { if (sequence === this.recoverySequence) this.recoveryError = this.message(error) }
      finally { if (sequence === this.recoverySequence) this.recoveryBusy = false }
    },
    stage(value) { return migrationStages[value] || value },
    size(value) { return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MiB` : `${(value / 1024).toFixed(1)} KiB` },
    async waitInspection(initial, sequence, target = 'inspection') {
      let state = initial
      const signal = target === 'inspection' ? this.controller?.signal : null
      while (state && ['queued', 'running'].includes(state.status)) {
        const currentSequence = target === true || target === 'connection' ? this.connectionSequence : target === 'preview' ? this.previewSequence : this.sequence
        if (!this.running || signal?.aborted || sequence !== currentSequence) return null
        await this.waitForPoll(signal)
        const afterWait = target === true || target === 'connection' ? this.connectionSequence : target === 'preview' ? this.previewSequence : this.sequence
        if (!this.running || signal?.aborted || sequence !== afterWait || this._isDestroyed) return null
        state = await this.request(`/inspections/${state.id}`, { timeout: 10000, signal })
        const updatedSequence = target === true || target === 'connection' ? this.connectionSequence : target === 'preview' ? this.previewSequence : this.sequence
        if (sequence !== updatedSequence) return null
        if (target === 'connection') this.connectionInspectionTask = state
        else if (target === 'preview') this.previewTask = state
        else this.inspectionTask = state
      }
      return state
    },
    message(error) {
      if (error.response?.status === 401) {
        this.authRequired = true
        if (this.firstDeployment && !this.pendingRestoreId && !this.jobs.some(job => !terminalMigrationStages.has(job.stage))) this.$emit("authorization-expired")
      }
      return migrationErrorMessage(error)
    },
    canCancel(job) { return !terminalMigrationStages.has(job.stage) && !["committed", "recovery_required"].includes(job.stage) && !job.cancel_requested },
    async refresh() {
      if (!this.running || this._isDestroyed) return
      if (this.refreshPromise) return this.refreshPromise
      const promise = this.refreshState(); this.refreshPromise = promise
      try { await promise } finally { if (this.refreshPromise === promise) this.refreshPromise = null }
    },
    async refreshState() {
      const sequence = ++this.readSequence
      clearTimeout(this.poll); this.loading = true
      try {
        if (!this.discoveryInFlight) {
          this.discoveryInFlight = true
          const discovery = this.request('/discover', { timeout: 10000 }); this.discoveryRequest = discovery
          discovery.then(value => { if (sequence === this.readSequence && this.running && !this._isDestroyed) this.packages = value.items }).catch(() => {}).finally(() => { if (this.discoveryRequest === discovery) this.discoveryInFlight = false })
        }
        const trackedId = this.pendingRestoreId || this.activeExportId
        const [cap, listing, tracked] = await Promise.allSettled([
          this.request('/capabilities', { timeout: 10000 }),
          this.request('/tasks', { timeout: 10000, params: { offset: (this.jobPage - 1) * 20, limit: 20 } }),
          trackedId ? this.request(`/tasks/${trackedId}`, { timeout: 10000 }) : Promise.resolve(null),
        ])
        if (sequence !== this.readSequence) return
        if (cap.status === 'fulfilled') {
          const changed = this.capability && (this.capability.worker_generation !== cap.value.worker_generation || this.capability.database_policy_version !== cap.value.database_policy_version)
          this.capability = cap.value
          if (changed && (this.exportConnection || this.connectionChecking)) {
            this.connectionSequence += 1; this.connectionChecking = false; this.connectionInspectionTask = null
            this.exportConnection = { ready: false, code: 'migration_database_preflight_stale' }
          }
        }
        if (listing.status === 'fulfilled') { this.jobs = listing.value.items; this.jobTotal = listing.value.total }
        if (tracked.status === 'fulfilled' && tracked.value) {
          if (!this.jobs.some(job => job.id === tracked.value.id)) this.jobs.unshift(tracked.value)
          else this.jobs = this.jobs.map(job => job.id === tracked.value.id ? tracked.value : job)
          if (terminalMigrationStages.has(tracked.value.stage)) {
            if (tracked.value.id === this.pendingRestoreId) this.pendingRestoreId = ""
            else this.trackExport('')
          }
        }
        if (this.activeExportId && !this.pendingRestoreId && tracked.status === 'rejected' && tracked.reason.response?.status === 404 && (!this.exportSubmittedAt || Date.now() - this.exportSubmittedAt > 60000)) {
          this.trackExport(''); this.error = '未找到本次任务。请核对当前实例与任务历史后再提交。'
        }
        if (listing.status === 'rejected') throw listing.reason
        if (this.activeExportId && tracked.status === 'rejected') throw tracked.reason
        if (this.pendingRestoreId && tracked.status === 'rejected') throw tracked.reason
        if (!this.firstDeployment && !this.activeExportId) { const active = this.jobs.find(job => job.action === 'export' && !terminalMigrationStages.has(job.stage)); if (active) this.trackExport(active.id) }
        this.lastConnectedAt = Date.now(); this.connectionNotice = ''
      } catch (error) {
        if (sequence !== this.readSequence) return
        if (!error.response || error.response.status >= 500 || ((this.activeExportId || this.pendingRestoreId) && error.response.status === 404)) {
          this.connectionNotice = `管理连接暂时中断，正在查询原任务。${this.lastConnectedAt ? '上次连接：' + new Date(this.lastConnectedAt).toLocaleTimeString() : '暂未取得任务状态。'}`
        } else this.error = this.message(error)
      } finally {
        if (sequence === this.readSequence) { this.loading = false; if (this.running && !this._isDestroyed && (this.pendingRestoreId || this.activeExportId || this.connectionNotice || this.jobs.some(job => !terminalMigrationStages.has(job.stage)))) this.poll = setTimeout(() => this.refresh(), migrationPollDelay(this.jobs, Boolean(this.connectionNotice))) }
      }
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
      this.password = ""; this.sensitiveConfirmed = false; this.inspection = null; this.inspectionTask = null; this.error = ""; this.progress = 0
      clearDirtyState("migration")
    },
    pause() { this.controller?.abort() },
    async inspect(page) {
      if (!this.running || this.busy || !this.capability || this.capability.maintenance || (!this.file && !this.discoveredPath)) return
      this.busy = true; this.error = ""
      const sequence = ++this.sequence
      const controller = new AbortController(); this.controller = controller
      try {
        if (this.file && !this.sealed) {
          await uploadMigration(this.file, { uploadId: this.uploadId, signal: controller.signal, onCreated: (id) => { if (sequence === this.sequence) this.uploadId = id }, onProgress: (value) => { if (sequence === this.sequence) this.progress = value } })
          if (sequence !== this.sequence) return
          this.sealed = true
        }
        const task = await this.request("/inspect", { method: "post", signal: controller.signal, data: { upload_id: this.file ? this.uploadId : null, path: this.discoveredPath || null, password: this.password || null, offset: (page - 1) * 50, limit: 50 } })
        if (sequence !== this.sequence) return
        this.inspectionTask = task
        const value = await this.waitInspection(task, sequence)
        if (sequence !== this.sequence || !value) return
        if (value.status === 'succeeded') { this.inspection = value.result; this.page = page }
        else this.error = value.error?.code || '迁移包检查失败；请查看检查状态后重试。'
      } catch (error) { if (sequence === this.sequence) this.error = controller.signal.aborted ? "请求已停止；已确认上传的分块保留，可继续核验。" : this.message(error) }
      finally { if (sequence === this.sequence) { this.busy = false; this.controller = null } }
    },
    changeJobPage(page) { this.jobPage = page; this.refresh() },
    async cancelJob(job) {
      if (this.cancelling) return
      try { await this.$confirm("提交前取消会进入清理或回滚，提交后的结果不会撤销。", "请求取消迁移", { type: "warning" }) } catch (error) { return }
      this.cancelling = job.id
      try { await this.request(`/tasks/${job.id}/cancel`, { method: "post" }); await this.refresh() }
      catch (error) { this.error = this.message(error) }
      finally { this.cancelling = null }
    },
  },
}
</script>

<style scoped>
::v-deep .migration-export-dialog { display: flex; flex-direction: column; max-height: 90vh; margin-bottom: 0; }
::v-deep .migration-export-dialog .el-dialog__body { overflow-y: auto; min-height: 0; }
::v-deep .migration-export-dialog .el-dialog__header, ::v-deep .migration-export-dialog .el-dialog__footer { flex-shrink: 0; }
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
