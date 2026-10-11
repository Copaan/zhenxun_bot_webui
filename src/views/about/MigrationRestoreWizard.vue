<template>
  <section v-show="visible" class="restore-summary" aria-label="迁移恢复摘要">
    <header><h3>确认恢复内容</h3><el-button size="small" :disabled="busy || submitting" @click="close">收起摘要</el-button></header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="!compatible" title="前后端迁移流程版本不匹配，请更新配套后端后刷新。" type="error" :closable="false" />
    <p v-if="busy" role="status">正在读取迁移包和配置；尚未创建候选库，也未停止 Bot。</p>
    <el-form v-if="needsPassword" label-position="top" @submit.native.prevent="refreshPreview">
      <el-form-item label="迁移包密码"><el-input v-model="draft.archivePassword" type="password" autocomplete="new-password" show-password /></el-form-item>
      <el-button :loading="busy" @click="refreshPreview">解锁迁移包</el-button>
    </el-form>
    <template v-if="preview">
      <p>{{ firstDeployment ? '默认沿用迁移包配置和管理员。' : '默认保留本实例管理员、数据库及访问入口，其余内容按包恢复。' }}只有需要修改或缺少配置时才填写。</p>
      <section class="summary-card">
        <h4>迁移内容</h4><p>{{ preview.summary.files }} 个文件；{{ preview.summary.databases.length }} 个数据库</p>
        <MigrationDatabases :items="preview.summary.databases" />
        <details><summary>文件覆盖范围</summary><p v-for="path in coverage" :key="path" class="restore-code">{{ path }}</p><p>范围内的原内容会先备份；包内插件将在受控启动阶段初始化。</p></details>
        <details><summary>包标识和完整性</summary><p class="restore-code">{{ preview.summary.package_id }}</p><p class="restore-code">SHA-256：{{ preview.summary.sha256 }}</p></details>
      </section>
      <section class="summary-card">
        <header><h4>恢复后管理员</h4><el-button type="text" :disabled="submitting" @click="toggle('administrator')">{{ edit.administrator ? '使用默认' : '修改' }}</el-button></header>
        <p>{{ preview.summary.administrator.username || '待补充' }} · {{ source(preview.summary.administrator.source) }}；沿用已有密码，无需输入原密码。</p>
        <el-form v-if="edit.administrator" label-position="top" :disabled="submitting" @submit.native.prevent>
          <div class="restore-grid"><el-form-item label="管理员名称"><el-input v-model="draft.username" autocomplete="off" /></el-form-item><el-form-item label="新密码"><el-input v-model="draft.password" type="password" autocomplete="new-password" show-password /></el-form-item></div>
        </el-form>
      </section>
      <section class="summary-card">
        <header><h4>访问入口</h4><el-button type="text" :disabled="submitting" @click="toggle('network')">{{ edit.network ? '使用默认' : '修改' }}</el-button></header>
        <p>{{ preview.summary.network.https ? 'HTTPS' : 'HTTP' }} · {{ preview.summary.network.host || '待补充' }}:{{ preview.summary.network.port || '—' }} · {{ source(preview.summary.network.source) }}</p>
        <el-form v-if="edit.network" label-position="top" :disabled="submitting" @submit.native.prevent>
          <div class="restore-grid"><el-form-item label="监听地址"><el-input v-model="draft.host" /></el-form-item><el-form-item label="端口"><el-input-number v-model="draft.port" :min="1" :max="65535" /></el-form-item></div>
          <el-checkbox v-model="draft.changeTls">修改 HTTPS 设置</el-checkbox>
          <div v-if="draft.changeTls"><el-checkbox v-model="draft.https">启用 HTTPS</el-checkbox><template v-if="draft.https"><el-form-item label="目标证书文件"><el-input v-model="draft.cert" /></el-form-item><el-form-item label="目标私钥文件"><el-input v-model="draft.key" /></el-form-item></template></div>
        </el-form>
      </section>
      <section class="summary-card">
        <header><h4>目标数据库</h4><el-button type="text" :disabled="submitting" @click="toggle('database')">{{ edit.database ? '使用默认' : '修改' }}</el-button></header>
        <p v-if="database">{{ database.engine }} · {{ database.host ? database.host + ':' + database.port + ' / ' : '' }}{{ database.database }}<span v-if="database.username"> · {{ database.username }}</span><span v-if="database.tls"> · TLS：{{ database.tls }}</span></p><p v-else>没有选定主数据库</p>
        <el-form v-if="edit.database" label-position="top" :disabled="submitting" @submit.native.prevent><el-form-item label="新的目标连接（含需要的 TLS 参数）"><el-input v-model="draft.targetUrl" type="password" autocomplete="new-password" show-password placeholder="sqlite://data/db/zhenxun.db 或完整数据库连接" /></el-form-item></el-form>
        <el-select v-if="preview.issues.some(item => item.field === 'source_path')" v-model="draft.sourcePath" placeholder="选择包内主数据库"><el-option v-for="item in preview.summary.databases" :key="item.path" :label="item.path" :value="item.path" /></el-select>
        <details v-if="external"><summary>候选库高级设置</summary><p>确认后自动创建临时数据库进行试恢复，结束后清理。没有建库权限时，可指定已有的独立空库。</p><el-radio-group v-model="draft.candidateMode" :disabled="submitting"><el-radio label="auto">自动创建</el-radio><el-radio label="manual">手动指定</el-radio></el-radio-group><el-input v-if="draft.candidateMode === 'manual'" v-model="draft.candidateUrl" type="password" show-password autocomplete="new-password" placeholder="空候选库完整连接，可使用同一账号" /></details>
      </section>
      <ul v-if="preview.issues.length" class="restore-issues"><li v-for="(item, index) in preview.issues" :key="index">{{ issue(item) }}</li></ul>
      <p v-if="changed">配置已修改，请更新摘要后确认。</p>
      <p class="restore-confirmation">点击“开始恢复”即确认使用此迁移包、覆盖以上范围并初始化包内插件。系统将自动备份、试恢复、切换和验证；失败时按原事务回滚。请只使用自己信任的迁移包。</p>
    </template>
    <footer><el-button :loading="busy" :disabled="submitting || sourceBusy || !compatible" @click="refreshPreview">{{ changed ? '更新摘要' : '刷新摘要' }}</el-button><el-button type="danger" :loading="submitting" :disabled="!preview || !preview.ready || changed || busy || sourceBusy || !compatible" @click="confirm">{{ resumeId ? '继续原任务' : '开始恢复' }}</el-button></footer>
  </section>
</template>

<script>
import MigrationDatabases from './MigrationDatabases.vue'
import { clearDirtyState, setDirtyState } from '@/utils/dirty-state'
import { migrationErrorMessage, migrationRequest } from '@/utils/migration'

export default {
  name: 'MigrationRestoreWizard',
  components: { MigrationDatabases },
  props: { visible: Boolean, inspection: Object, uploadId: String, discoveredPath: String, archivePassword: String, capability: Object, sourceBusy: Boolean, firstDeployment: Boolean, resumeId: String },
  data: () => ({ preview: null, busy: false, submitting: false, error: '', needsPassword: false, registeredId: null, requestId: null, confirmedInput: '', edit: { administrator: false, network: false, database: false }, draft: { username: '', password: '', host: '', port: 8080, changeTls: false, https: false, cert: '', key: '', targetUrl: '', candidateMode: 'auto', candidateUrl: '', sourcePath: '', archivePassword: '' } }),
  computed: {
    compatible() { return this.capability?.restore_flow_version === 1 },
    database() { return this.preview?.summary.database },
    external() { return ['postgres', 'mysql'].includes(this.database?.engine) },
    coverage() { const value = this.preview?.summary.selection || {}; return [...(value.directories || []).map(path => path + '/'), ...(value.files || [])] },
    changed() { return JSON.stringify(this.privateInput()) !== this.confirmedInput },
    operationReason() { return this.submitting ? '正在提交恢复，请等待任务编号' : this.busy ? '正在生成恢复摘要，请等待完成' : '' },
  },
  watch: {
    operationReason: { immediate: true, handler(value) { this.$emit('operation-state', value) } },
    visible(value) { if (value) this.refreshPreview(); else this.stopReads() },
    sourceBusy(value) { if (!value && this.visible && !this.preview) this.refreshPreview() },
    draft: { deep: true, handler() { setDirtyState('migration-restore', true) } },
  },
  created() { this.sequence = 0; this.requests = new Set(); this.draft.archivePassword = this.archivePassword || ''; if (this.visible) this.refreshPreview() },
  beforeDestroy() { this.stopReads(); clearDirtyState('migration-restore'); this.$emit('operation-state', '') },
  methods: {
    source(value) { return ({ package: '迁移包', current: '当前实例', override: '本次修改' })[value] || '待确认' },
    issue(value) { const labels = { migration_environment_value_missing: '环境变量缺失，请补充该字段', migration_configuration_value_missing: '配置缺失', migration_listener_address_unavailable: '本机无法绑定此监听地址', migration_listener_port_unavailable: '目标端口已被其他进程占用', migration_tls_certificate_invalid: '证书或私钥无效、已过期或不匹配', migration_network_configuration_invalid: '监听配置无效', migration_tls_file_unavailable: '证书或私钥在目标不可用', migration_database_mapping_required: '请选择主数据库', migration_database_connection_invalid: '连接配置无法解析，请修改连接', migration_database_cross_engine_forbidden: '仅支持同引擎恢复', migration_database_credentials_required: '请补充候选库连接' }; return `${value.field}：${labels[value.code] || value.code}` },
    enableEdit(name) {
      if (this.edit[name]) return
      if (name === 'network') { this.draft.host = this.preview.summary.network.host || ''; this.draft.port = this.preview.summary.network.port || 8080; this.draft.https = Boolean(this.preview.summary.network.https) }
      if (name === 'administrator' && !this.draft.username) this.draft.username = this.preview.summary.administrator.username || ''
      this.$set(this.edit, name, true)
    },
    toggle(name) { if (this.edit[name]) this.$set(this.edit, name, false); else this.enableEdit(name) },
    privateInput() {
      const value = { archive_password: this.draft.archivePassword || null }
      if (this.edit.administrator) value.administrator = { username: this.draft.username, password: this.draft.password }
      if (this.edit.network) { value.configuration = { HOST: this.draft.host, PORT: String(this.draft.port) }; if (this.draft.changeTls) Object.assign(value.configuration, { WEBUI_HTTPS_ENABLED: String(this.draft.https), WEBUI_TLS_CERTFILE: this.draft.cert, WEBUI_TLS_KEYFILE: this.draft.key }) }
      if (this.edit.database) value.database = { target_url: this.draft.targetUrl }
      if (this.draft.candidateMode === 'manual') value.database = { ...value.database, candidate_mode: 'manual', candidate_url: this.draft.candidateUrl }
      if (this.draft.sourcePath) value.source_path = this.draft.sourcePath
      return value
    },
    async request(path, options = {}) { const controller = new AbortController(); this.requests.add(controller); try { return await migrationRequest(path, { ...options, signal: controller.signal }) } finally { this.requests.delete(controller) } },
    stopReads() { this.sequence++; for (const controller of this.requests) controller.abort(); this.busy = false; this.submitting = false },
    async refreshPreview() {
      if (!this.visible || this.busy || this.submitting || this.sourceBusy || !this.compatible) return
      const sequence = ++this.sequence; this.busy = true; this.error = ''
      try {
        let upload = this.uploadId || this.registeredId
        if (!upload) { const value = await this.request('/packages/register', { method: 'post', data: { path: this.discoveredPath, confirm_secrets: true } }); if (sequence !== this.sequence) return; this.registeredId = upload = value.id }
        const privateInput = this.privateInput()
        const value = await this.request('/restore/preview', { method: 'post', data: { upload_id: upload, private: privateInput, ...(this.resumeId ? { task_id: this.resumeId } : {}) } })
        if (sequence !== this.sequence) return
        this.preview = value; this.confirmedInput = JSON.stringify(privateInput); this.needsPassword = false; this.requestId = null
        for (const item of value.issues) { if (item.field.startsWith('administrator')) this.enableEdit('administrator'); if (['HOST', 'PORT', 'network', 'WEBUI_TLS_CERTFILE', 'WEBUI_TLS_KEYFILE'].includes(item.field)) this.enableEdit('network'); if (item.field === 'DB_URL') this.enableEdit('database') }
      } catch (error) { if (sequence === this.sequence) { this.error = migrationErrorMessage(error); const code = error.response?.data?.detail?.code || error.response?.data?.detail || ''; if (/password|encrypted/.test(code)) this.needsPassword = true; if (error.response?.status === 401) this.$emit('authorization-expired') } }
      finally { if (sequence === this.sequence) this.busy = false }
    },
    async confirm() {
      if (!this.visible || this.submitting || this.busy || this.sourceBusy || !this.preview?.ready || this.changed || !this.compatible) return
      const sequence = ++this.sequence; this.submitting = true; this.error = ''
      if (!this.requestId) this.requestId = this.resumeId || Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
      this.$emit('submit-start', this.requestId)
      try {
        const privateInput = this.privateInput()
        const task = await this.request(this.resumeId ? `/tasks/${this.resumeId}/credentials` : '/restore', { method: 'post', data: this.resumeId ? { private: privateInput } : { upload_id: this.uploadId || this.registeredId, private: privateInput, request_id: this.requestId, revision: this.preview.revision, confirmed: true } })
        if (sequence !== this.sequence) return
        clearDirtyState('migration-restore'); this.$emit('submitted', task, this.preview.summary.network)
      } catch (error) {
        if (sequence !== this.sequence) return
        this.error = migrationErrorMessage(error)
        if (error.response && error.response.status >= 400 && error.response.status < 500 && ![408, 429].includes(error.response.status)) { this.$emit('submit-rejected'); this.requestId = null } else this.$emit('submit-uncertain')
      } finally { if (sequence === this.sequence) this.submitting = false }
    },
    async close() { if (this.busy || this.submitting) return; if (this.changed) { try { await this.$confirm('关闭后清除本次修改草稿，继续吗？', '关闭恢复摘要') } catch (_) { return } } clearDirtyState('migration-restore'); this.$emit('close') },
  },
}
</script>

<style scoped>
.restore-summary { border: 1px solid #dce2e8; border-radius: 8px; padding: 20px; margin: 20px 0; }
.restore-summary header, .restore-summary footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.restore-summary h3, .restore-summary h4 { margin: 0; }
.summary-card { border-bottom: 1px solid #e2e7eb; padding: 18px 0; }
.restore-summary p, .restore-code { overflow-wrap: anywhere; line-height: 1.65; }
.restore-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.restore-issues { padding-left: 20px; color: #a83838; }
.restore-confirmation { color: #64717c; font-size: 13px; }
.restore-summary details { margin-top: 12px; }
.restore-summary summary { cursor: pointer; }
.restore-summary .el-select { max-width: 100%; }
@media (max-width: 600px) { .restore-summary { padding: 14px; } .restore-grid { grid-template-columns: 1fr; } .restore-summary footer .el-button { margin-left: 0; } }
</style>
