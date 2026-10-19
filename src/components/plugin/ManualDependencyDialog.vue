<template>
  <el-dialog title="依赖管理" :visible="visible" width="min(760px, 94vw)" append-to-body :before-close="close">
    <p>优先复用现有依赖；实际包变更需通过 launcher（uv run zx）启动后才能准备，并在手动重启验证后生效。ORM 及数据库驱动仅由控制台管理。</p>
    <el-radio-group v-model="action" :disabled="busy || pending" @change="invalidate">
      <el-radio-button label="install">安装或调整版本</el-radio-button>
      <el-radio-button label="uninstall">撤销手动托管</el-radio-button>
    </el-radio-group>
    <el-input v-model="input" type="textarea" :rows="3" :disabled="pending" :placeholder="action === 'uninstall' ? '每行一个已手动托管的包名，不需要版本或 extras' : '每行一个包要求，例如 example-package[feature]>=1.0'" @input="invalidate" />
    <el-alert v-if="error" type="error" :title="error" :closable="false" />
    <div v-if="preview">
      <p v-if="preview.no_change">依赖和托管声明均无需变更，确认后不会保存任何内容。</p>
      <p v-else-if="preview.declaration_only">无需安装或切换包版本；确认后只保存本次托管声明，无需重启。</p>
      <p v-else-if="!preview.changes.length">无需安装或切换包版本；托管声明变更将加入待重启事务，重启验证后生效。</p>
      <div v-for="change in preview.changes" :key="change.name" class="dependency-row">
        <code>{{ change.name }}</code><span>{{ change.from || '未安装' }} → {{ change.to || '移除托管包' }}</span>
      </div>
      <p v-for="item in preview.retained" :key="`retained-${item.name}`">保留 {{ item.name }} {{ item.version }}：{{ item.owners.join('、') }}</p>
      <el-alert v-if="preview.source_build_required" title="本次需要源码构建；确认准备即同意展示的构建与包变更。" type="warning" :closable="false" />
      <p v-if="preview.remaining_conflicts && preview.remaining_conflicts.length">保留 {{ preview.remaining_conflicts.length }} 项未受本次操作影响的历史问题，可在环境详情中继续处理。</p>
    </div>
    <p v-if="result" class="dependency-result">{{ resultMessage }}</p>
    <p v-if="operationId">操作编号：<code>{{ operationId }}</code></p>
    <template #footer>
      <el-button @click="close">关闭</el-button>
      <el-button v-if="operationId" :disabled="frozen || expired || busy" @click="refreshOperation">刷新任务状态</el-button>
      <el-button v-if="operationId && result?.apply_mode === 'restart_pending'" type="warning" :disabled="frozen || expired || busy" @click="cancelOperation">撤销待重启操作</el-button>
      <el-button v-if="operationMissing && pending" :disabled="frozen || expired || busy" @click="reanalyzeMissing">未找到任务，重新分析</el-button>
      <el-button v-if="result && result.apply_mode === 'restart_pending'" type="warning" @click="showOperation">查看并重启验证</el-button>
      <el-button v-if="!pending && !preview" type="primary" :loading="busy" :disabled="frozen || expired" @click="analyze">分析变更</el-button>
      <el-button v-if="!pending && preview" type="primary" :loading="busy" :disabled="frozen || expired" @click="submit">确认准备依赖</el-button>
    </template>
  </el-dialog>
</template>

<script>
import { newOperationId, rememberPluginOperation } from '@/utils/plugin-operation'
import { isBusinessNetworkFrozen, onBusinessNetworkChange } from '@/utils/restart-network'

const storageKey = 'zhenxun_manual_dependency_operation'

export default {
  name: 'ManualDependencyDialog',
  props: { visible: Boolean },
  data: () => ({ action: 'install', input: '', preview: null, result: null, error: '', busy: false, confirmSource: false, operationId: '', operationMissing: false, expired: false, frozen: isBusinessNetworkFrozen() }),
  computed: {
    pending() { return Boolean(this.operationId && !['completed', 'failed', 'interrupted', 'rolled_back', 'not_found'].includes(this.result?.status)) },
    resultMessage() {
      if (this.result?.reason_codes?.includes('declaration_updated')) return '托管声明已保存，依赖未改变，无需重启。'
      const messages = { restart_pending: '依赖已准备，等待重启验证。', preparing: '正在准备依赖，请等待任务结果。', applied: '启动验证通过，依赖已生效。', no_change: '依赖和托管声明无需变更。', rolled_back: '依赖操作失败或已撤销，原环境已恢复。', recovery_required: '回滚尚未确认，请保留任务记录并处理诊断。', failed: '依赖操作失败，查看具体诊断后重新分析。' }
      return messages[this.result?.apply_mode] || '操作结果待核对，请刷新任务状态。'
    },
  },
  created() {
    this.epoch = 0; this.readEpoch = 0; this.requests = new Set()
    this.operationId = sessionStorage.getItem(storageKey) || ''
    this.onVisibility = () => { if (document.hidden) this.pause(); else if (this.visible) this.resume() }
    this.onExpired = () => { this.expired = true; this.pause(); this.error = '登录已过期；已提交任务继续执行，请重新登录后查看。' }
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('zhenxun-auth-expired', this.onExpired)
    this.unsubscribe = onBusinessNetworkChange(value => { this.frozen = value; if (value) this.pause(); else if (this.visible) this.resume() })
  },
  beforeDestroy() { this.pause(); this.unsubscribe?.(); document.removeEventListener('visibilitychange', this.onVisibility); window.removeEventListener('zhenxun-auth-expired', this.onExpired) },
  mounted() { if (this.visible) this.resume() },
  watch: { visible(value) { if (value) this.resume(); else this.pause() } },
  methods: {
    pause() { this.epoch++; clearTimeout(this.timer); clearTimeout(this.analysisTimer); for (const controller of this.requests) controller.abort(); this.requests.clear(); this.busy = false },
    resume() { if (!this.expired && !this.frozen && !document.hidden && this.operationId) this.refreshOperation() },
    close() { this.$emit('update:visible', false) },
    invalidate() { if (!this.pending) this.pause(); this.preview = null; this.error = ''; if (!this.pending && this.result?.status !== 'not_found') { this.operationId = ''; this.result = null; sessionStorage.removeItem(storageKey) } if (this.values().length && !this.pending) this.analysisTimer = setTimeout(() => this.analyze(), 650) },
    reanalyzeMissing() { if (!this.operationMissing || this.busy) return; this.preview = null; this.result = { status: 'not_found' }; this.error = '服务端尚未找到此操作。可以重新分析，后续提交仍使用原操作编号，避免重复执行。' },
    values() { return this.input.split(/\n/).map(item => item.trim()).filter(Boolean) },
    diagnostic(error) {
      const body = error?.response?.data || error || {}
      const detail = body.detail || body.details
      const code = typeof detail === 'string' ? detail : detail?.code || body.info || body.message
      if (code === 'orm_dependency_console_required') return 'WebUI 不更改 ORM 或数据库驱动，请在控制台安装或调整后重新分析（orm_dependency_console_required）' + (detail?.issues ? '：' + JSON.stringify(detail.issues) : '')
      if (code === 'dependency_source_metadata_unavailable') return '源码包缺少可静态读取的依赖元数据。请提供 Wheel 或在控制台安装后重新分析；预览不会执行构建代码。'
      const messages = { dependency_not_managed: '此包未被手动托管，不能从这里卸载基础环境或其他插件的依赖', environment_analysis_stale: '环境或待处理事务已变化，请重新分析', dependency_transaction_pending: '有依赖事务正在验证或等待处理', plugin_operation_in_progress: '另一项插件操作正在执行', dependency_resolution_failed: '依赖版本无法同时满足，请查看具体包要求', dependency_layer_build_failed: '候选依赖安装失败，当前环境未切换', dependency_environment_repair_required: '现有依赖层需要先修复', dependency_operation_interrupted: '依赖准备已中断，当前环境未切换', plugin_operation_not_found: '尚未找到此操作，请先刷新任务状态', dependency_repair_requires_launcher: '需通过 launcher（uv run zx）启动后才能准备依赖' }
      return [messages[code] ? `${messages[code]}（${code}）` : code || '依赖请求失败', detail?.stage ? `阶段：${detail.stage}` : '', detail?.diagnostic || detail?.message, detail?.issues ? JSON.stringify(detail.issues) : ''].filter(Boolean).join('；')
    },
    async request(method, path, data) {
      const controller = new AbortController(); this.requests.add(controller)
      try {
        const response = await this[{ post: 'postRequest', get: 'getRequest', delete: 'deleteRequest' }[method]](`${this.$root.prefix}${path}`, data || {}, { signal: controller.signal, suppressErrorToast: true })
        if (!response?.suc) throw response || new Error('无效响应')
        return response.data
      } finally { this.requests.delete(controller) }
    },
    async analyze() {
      clearTimeout(this.analysisTimer)
      if (this.busy || this.pending || this.frozen || this.expired) return
      if (!this.values().length) { this.error = '请输入包名'; return }
      if (this.operationId && this.result?.status !== 'not_found') { this.operationId = ''; this.result = null; sessionStorage.removeItem(storageKey) }
      const epoch = ++this.epoch; this.busy = true; this.error = ''
      try { const result = await this.request('post', '/plugin/dependencies/preview', { dependencies: this.values(), handle_type: this.action }); if (epoch === this.epoch) this.preview = result }
      catch (error) { if (epoch === this.epoch) this.error = this.diagnostic(error) }
      finally { if (epoch === this.epoch) this.busy = false }
    },
    async submit() {
      if (this.busy || this.pending || !this.preview || this.frozen || this.expired) return
      if (!this.operationId) this.operationId = newOperationId()
      sessionStorage.setItem(storageKey, this.operationId)
      const epoch = ++this.epoch; this.busy = true; this.error = ''; this.operationMissing = false; this.result = { status: 'running', apply_mode: 'preparing' }
      try {
        const result = await this.request('post', '/plugin/install_dependencies', { dependencies: this.values(), handle_type: this.action, preview_id: this.preview.preview_id, expected_fingerprint: this.preview.fingerprint, operation_id: this.operationId, confirmed: true, confirm_source_build: Boolean(this.preview.source_build_required), summary_revision: this.preview.summary_revision })
        if (epoch !== this.epoch) return
        this.result = result; this.preview = null
        if (result.apply_mode === 'restart_pending') this.showOperation()
      } catch (error) {
        if (epoch !== this.epoch) return
        if (error?.info === 'environment_analysis_stale' && !this.retryingPreview) {
          this.retryingPreview = true
          try {
            const previous = this.preview?.summary_revision
            const refreshed = await this.request('post', '/plugin/dependencies/preview', { dependencies: this.values(), handle_type: this.action })
            if (epoch !== this.epoch) return
            this.preview = refreshed; this.result = null; this.busy = false
            if (previous && previous === refreshed.summary_revision) { await this.submit(); return }
            this.operationId = ''; sessionStorage.removeItem(storageKey); this.error = '环境已变化，摘要已更新；请核对差异后确认。'; return
          } catch (refreshError) { if (epoch === this.epoch) this.error = this.diagnostic(refreshError) }
          finally { this.retryingPreview = false }
          return
        }
        if (error?.info === 'plugin_operation_input_changed') { this.preview = null; this.error = '原操作已被接受，继续查询原任务；本次输入未重复提交。'; await this.refreshOperation(); return }
        if (error?.suc === false && ['dependency_preview_required', 'dependency_confirmation_required', 'environment_analysis_stale', 'dependency_transaction_pending', 'plugin_operation_in_progress', 'source_build_confirmation_required', 'dependency_repair_requires_launcher'].includes(error.info)) {
          this.result = { status: 'failed', apply_mode: 'failed' }; this.preview = null
          this.operationId = ''; sessionStorage.removeItem(storageKey); this.error = this.diagnostic(error); return
        }
        this.error = `${this.diagnostic(error)}；请查询原操作状态，不要重复提交。`
        await this.refreshOperation()
      } finally { if (epoch === this.epoch) this.busy = false }
    },
    async refreshOperation() {
      clearTimeout(this.timer)
      if (!this.operationId || !this.visible || this.frozen || this.expired || document.hidden) return
      const epoch = this.epoch
      const readEpoch = ++this.readEpoch
      try {
        const record = await this.request('get', `/store/operations/${this.operationId}`)
        if (epoch !== this.epoch || readEpoch !== this.readEpoch) return
        this.operationMissing = false
        this.result = { ...record.result, status: record.status }
        if (this.result.diagnostic) this.error = this.result.diagnostic
        if (record.status === 'running') this.timer = setTimeout(() => this.refreshOperation(), 1000)
      } catch (error) { if (epoch === this.epoch && readEpoch === this.readEpoch) { this.operationMissing = error?.info === 'plugin_operation_not_found'; this.error = this.diagnostic(error) } }
    },
    async cancelOperation() {
      if (this.busy || this.frozen || this.expired || !this.operationId) return
      const identity = this.operationId
      try { await this.$confirm('将撤销本次待重启操作及其后依赖它的操作，或清除对应的失败事务记录。已生效的环境保持不变。', '确认处理依赖事务', { type: 'warning', confirmButtonText: '确认', cancelButtonText: '保留' }) }
      catch (_) { return }
      if (this.frozen || this.expired || identity !== this.operationId) return
      const epoch = ++this.epoch; this.busy = true; this.error = ''
      try {
        await this.request('delete', `/store/transactions/pending/${identity}`)
        if (epoch !== this.epoch) return
        this.preview = null
        await this.refreshOperation()
      } catch (error) { if (epoch === this.epoch) this.error = this.diagnostic(error) }
      finally { if (epoch === this.epoch) this.busy = false }
    },
    showOperation() {
      rememberPluginOperation(this.operationId, this.action, '手动依赖', 'nonebot')
      this.$store.commit('FINISH_PLUGIN_OPERATION', { status: 'pending', title: '依赖事务等待重启', message: '候选环境已准备，重启并通过启动验证后生效。', applyMode: 'restart_pending', restartAvailable: this.result.restart_available, accessUrls: this.result.access_urls || [], accessTargets: this.result.access_targets || [] })
    },
  },
}
</script>

<style scoped>
.el-radio-group, .el-textarea, .el-alert { margin-bottom: 16px; }
.dependency-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 8px 0; }
p, code, .dependency-result { overflow-wrap: anywhere; white-space: pre-wrap; }
::v-deep .el-dialog__footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
::v-deep .el-checkbox__label { white-space: normal; }
</style>
