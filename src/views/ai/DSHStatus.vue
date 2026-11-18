<template>
  <section class="zx-panel dsh-status">
    <div class="zx-section-heading"><div><h2>DSH</h2><p>连接桌面端或独立 SDK，管理当前使用的会话。</p></div><el-button size="small" icon="el-icon-refresh" :loading="loading" :disabled="configSaving || Boolean(busy)" @click="refreshAll">刷新</el-button></div>
    <div :class="['dsh-overview', 'is-' + tone]" aria-live="polite">
      <span class="overview-dot" />
      <div class="overview-main"><strong>{{ status ? statusLabel : loading ? '正在读取状态…' : '状态未读取' }}</strong><span v-if="status" class="muted">{{ sdk ? '独立 SDK' : '桌面端' }}<template v-if="status.version"> · v{{ status.version }}</template></span></div>
      <div v-if="status && status.connected" class="overview-chips"><span :class="['ready-chip', { 'is-ready': chatReady }]"><i :class="chatReady ? 'el-icon-check' : 'el-icon-minus'" />普通聊天</span><span :class="['ready-chip', { 'is-ready': status.native_ready }]"><i :class="status.native_ready ? 'el-icon-check' : 'el-icon-minus'" />原生 Agent</span><span v-if="sdk" :class="['ready-chip', { 'is-ready': status.permission === 'full' || sandboxReady }]"><i :class="status.permission === 'full' ? 'el-icon-unlock' : 'el-icon-lock'" />{{ permissionLabel }}</span></div>
      <el-dropdown v-if="status && sdk" trigger="click" @command="hostCommand"><el-button size="small" :disabled="statusStale || configSaving || Boolean(busy)">宿主操作 <i class="el-icon-arrow-down el-icon--right" /></el-button><el-dropdown-menu slot="dropdown"><el-dropdown-item command="agent" icon="el-icon-video-play" :disabled="statusStale || configSaving || Boolean(busy)">启动原生 Agent</el-dropdown-item><el-dropdown-item command="stop" icon="el-icon-switch-button" :disabled="statusStale || configSaving || Boolean(busy) || !status.connected">停止 SDK 宿主</el-dropdown-item></el-dropdown-menu></el-dropdown>
      <p v-if="status && (!status.connected || status.mapping_trusted === false)" class="overview-note">{{ status.reason }}</p>
      <p v-else-if="status && !sdk && status.login_state === 'signed-out'" class="overview-note">请先在 DSH 桌面完成登录。</p>
    </div>
    <el-alert v-if="status && status.restart_required" :title="status.restart_reason" type="warning" :closable="false" show-icon />
    <el-alert v-if="sdk && status.connected && status.permission === 'sandbox' && status.sandbox && !status.sandbox.available" title="本机沙箱不可用，Agent 的每条命令都需要超管批准" type="warning" :closable="false" show-icon><p class="alert-text">{{ status.sandbox.detail }}。可安装 bubblewrap（如 <code>apt install bubblewrap</code> 或 <code>yum install bubblewrap</code>），在容器中运行时还需允许创建命名空间；也可以在连接的高级设置中改用完全权限。批准时回复“全部允许”可放行本轮后续请求。</p></el-alert>
    <el-alert v-if="sdk && status.permission_pending" title="Agent 权限已修改，Agent 空闲时下次运行会自动重启工作进程后生效。" type="info" :closable="false" show-icon />
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div class="dsh-card"><div class="card-heading"><h3><i class="el-icon-connection" />连接</h3></div><DSHConnection ref="connection" :disabled="Boolean(busy) || choice.busy" @configure="$emit('configure')" @saving="configurationBusy" @saved="configurationSaved" @connected="connectionStatus" /></div>
    <div v-if="status" class="dsh-card">
      <div class="card-heading"><h3><i class="el-icon-chat-dot-square" />会话</h3><span v-if="sdk && status.connected && !status.native_ready" class="muted">使用 Agent 前，请在“宿主操作”中启动。</span><el-button size="small" icon="el-icon-plus" :loading="choice.loading" :disabled="statusStale || configSaving || !status.connected || (sdk && !status.native_ready)" @click="openChoice()">选择 Agent 会话</el-button></div>
      <el-table :data="status.sessions || []" size="small" empty-text="还没有会话，普通聊天会在首次对话时自动建立。">
        <el-table-column label="归属" min-width="160"><template #default="{ row }"><span class="owner-cell"><i :class="ownerIcon(row)" />{{ owner(row) }}</span></template></el-table-column>
        <el-table-column label="模式" min-width="100"><template #default="{ row }"><el-tag size="mini" :type="row.native ? '' : row.mode === 'agent' ? 'warning' : 'info'" effect="plain">{{ row.native ? '原生 Agent' : row.mode === 'agent' ? '旧版 Agent' : '普通聊天' }}</el-tag></template></el-table-column>
        <el-table-column label="本轮状态" min-width="140"><template #default="{ row }"><span :class="['run-state', { 'is-running': row.local_running }]">{{ row.stop_state_label || '状态待确认' }}</span></template></el-table-column>
        <el-table-column label="操作" min-width="200" align="right"><template #default="{ row }"><div class="dsh-row-actions">
          <el-button v-if="row.inflight && row.inflight.run_id" size="mini" type="warning" plain :disabled="statusStale || Boolean(busy) || configSaving" @click="stopRun(row)">停止当前轮次</el-button>
          <el-button v-if="row.mode === 'agent' && (row.identity || {}).source !== 'webui'" size="mini" :disabled="statusStale || Boolean(busy) || configSaving || !status.connected" @click="openChoice(row.owner)">选择会话</el-button>
          <el-button v-if="row.native" size="mini" :disabled="statusStale || Boolean(busy) || configSaving" @click="change(row, 'new')">新建</el-button>
          <el-dropdown trigger="click" @command="change(row, $event)"><el-button size="mini" icon="el-icon-more" :disabled="statusStale || Boolean(busy) || configSaving" aria-label="更多会话操作" /><el-dropdown-menu slot="dropdown"><el-dropdown-item command="reset" icon="el-icon-refresh-left" :disabled="statusStale || Boolean(busy) || configSaving">重置对话</el-dropdown-item><el-dropdown-item command="archive" icon="el-icon-folder" :disabled="statusStale || Boolean(busy) || configSaving">{{ sdk ? '解除关联' : row.native ? '归档' : '归档并新建' }}</el-dropdown-item></el-dropdown-menu></el-dropdown>
        </div></template></el-table-column>
      </el-table>
      <el-collapse class="dsh-notes"><el-collapse-item><span slot="title" class="notes-title"><i class="el-icon-info" />能力与操作说明</span><ul><li>普通群聊和私聊自动隔离，不开放宿主工具。DSH 当前只接收文字。</li><li>原生 Agent 的工具与后台任务由 DSH 管理；停止当前轮次不代表后台任务全部结束。</li><li>新建保留原会话。重置还会清除真寻短期历史；{{ sdk ? '解除关联不删除或归档 SDK 记录。' : '归档保留桌面历史，不永久删除。' }}</li><li>模型临时错误最多尝试 5 次；不会自动重发用户输入或补发未知结果。</li></ul></el-collapse-item></el-collapse>
    </div>
    <el-dialog title="选择 Agent 会话" :visible.sync="choice.visible" width="min(680px, 94vw)" append-to-body>
      <div class="dsh-target"><span>使用者</span><el-select v-model="choice.owner" size="small" :disabled="configSaving || choice.busy || choice.loading" @change="openChoice(choice.owner)"><el-option v-for="target in choice.targets" :key="target.owner" :value="target.owner" :label="target.label" /></el-select></div>
      <p class="muted">使用已有会话会保留历史、模型、思考等级、模式和工作目录。</p><p class="session-risk">Agent 跨群和私聊共享上下文，回复到本轮触发位置；请留意原会话中的私密内容。</p>
      <el-select v-model="choice.selected" filterable clearable :placeholder="sdk ? '搜索 SDK 会话' : '搜索桌面会话'" style="width: 100%" :disabled="configSaving || choice.busy"><el-option v-for="item in choice.items" :key="item.remote_id" :value="item.remote_id" :disabled="item.running" :label="(item.archived ? '[已归档] ' : '') + item.title + ' · ' + item.preset" /></el-select>
      <div v-if="selectedSession" class="dsh-selection"><p>模型：{{ (selectedSession.model || {}).model || '后端默认' }} · 思考：{{ (selectedSession.model || {}).reasoningEffort || '默认' }}</p><p>模式：{{ selectedSession.preset }} · {{ (selectedSession.plan || {}).pending === true || (selectedSession.plan || {}).active ? '计划模式' : '执行模式' }}</p><p>工作目录：{{ selectedSession.cwd }}</p></div>
      <span slot="footer"><el-button :disabled="configSaving || choice.busy" @click="choice.visible = false">取消</el-button><el-button :loading="choice.busy" :disabled="configSaving" @click="chooseSession(null)">新建会话</el-button><el-button type="primary" :loading="choice.busy" :disabled="configSaving || !choice.selected" @click="chooseSession(choice.selected)">使用所选会话</el-button></span>
    </el-dialog>
  </section>
</template>

<script>
import DSHConnection from "./DSHConnection.vue"
import { apiErrorDetail } from "@/utils/api-error"
import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"

const QUIET = { suppressErrorToast: true }
export default {
  name: "DSHStatus",
  components: { DSHConnection },
  data: () => ({ status: null, statusStale: false, configSaving: false, error: "", loading: false, busy: "", seq: 0, disposed: false, choice: { visible: false, loading: false, busy: false, seq: 0, targets: [], owner: null, loadedOwner: null, items: [], selected: null, revision: 0 } }),
  computed: { sdk() { return this.status?.transport === 'sdk' }, chatReady() { return Boolean(this.status?.connected && this.status.presets?.chat !== false) }, sandboxReady() { return this.status?.sandbox?.available !== false }, permissionLabel() { if (this.status?.permission === 'full') return '完全权限'; if (!this.sandboxReady) return '沙箱不可用'; const runner = this.status?.sandbox?.runner; return runner ? '沙箱 · ' + runner : '沙箱' }, tone() { if (!this.status || this.statusStale) return 'idle'; return this.status.connected && !this.status.restart_required && this.status.mapping_trusted !== false && this.chatReady ? 'success' : this.status.connected ? 'warning' : 'idle' }, statusLabel() { if (this.statusStale) return '状态待确认'; if (this.status?.mapping_trusted === false) return '需要处理'; if (this.status?.restart_required) return '需要重新连接'; if (!this.status?.connected) return '未连接'; if (this.status.presets?.chat === false) return this.sdk ? '普通聊天未启动' : '普通聊天预设未就绪'; return '已连接' }, selectedSession() { return this.choice.items.find(item => item.remote_id === this.choice.selected) } },
  mounted() {
    this.load()
    document.addEventListener("visibilitychange", this.visibility)
    window.addEventListener("zhenxun-auth-expired", this.invalidate)
    this.unlisten = onBusinessNetworkChange((frozen) => { if (frozen) this.invalidate(); else this.load() })
  },
  beforeDestroy() {
    this.disposed = true; this.invalidate()
    document.removeEventListener("visibilitychange", this.visibility)
    window.removeEventListener("zhenxun-auth-expired", this.invalidate)
    this.unlisten?.()
  },
  methods: {
    configurationBusy(value) { this.configSaving = value; if (value) { this.statusStale = true; this.invalidate(); this.choice.visible = false } else if (this.statusStale) this.$nextTick(() => { if (this.statusStale && !this.configSaving) this.load() }) },
    configurationSaved() { this.error = '配置已保存，正在重新确认执行器状态；当前显示上次结果。' },
    connectionStatus(status) { this.status = status; this.statusStale = false; this.error = ''; this.$emit('status', status) },
    async refreshAll() { if (this.configSaving || this.busy) return; await this.$refs.connection?.refresh(); await this.load() },
    hostCommand(action) { if (action === 'agent') this.hostAction('start', 'agent'); else if (action === 'stop') this.hostAction('stop') },
    async stopRun(row) {
      if (this.statusStale || this.configSaving || this.busy || this.choice.busy || this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      this.invalidate()
      const epoch = businessNetworkEpoch(), token = getAuthToken(), seq = this.seq
      const current = () => !this.disposed && !document.hidden && seq === this.seq && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken()
      this.busy = row.local_id
      try {
        const response = await this.postRequest(this.url('/dsh/session/stop'), { owner: row.owner, remote_id: row.remote_id, expected_revision: row.revision, run_id: row.inflight.run_id }, QUIET)
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        this.$message({ type: ['unknown', 'desktop_continues'].includes(response.data.state) || response.data.local_done === false ? 'warning' : 'success', message: response.info })
        await this.load()
      } catch (error) { if (current()) this.$message.warning(apiErrorDetail(error, '停止结果待核验，请刷新；不会重新执行输入。')) }
      finally { this.busy = '' }
    },
    async hostAction(action, mode = 'chat') {
      if (this.statusStale || this.configSaving || this.busy || this.choice.busy || this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      if (action === 'stop') {
        try { await this.$confirm('停止独立 SDK 宿主会关闭其全部会话及后台能力；不影响 DSH 桌面。请先确认原生后台工作。', '停止 SDK 宿主', { type: 'warning' }) } catch (_) { return }
      }
      if (this.statusStale || this.configSaving || this.busy || this.choice.busy || this.disposed || !hasValidAuthToken()) return
      const epoch = businessNetworkEpoch(), token = getAuthToken()
      this.busy = 'host'
      try {
        const response = await this.postRequest(this.url('/dsh/host/' + action), { mode, ...(action === 'stop' ? { expected_boot: this.status.host_boot } : {}) }, QUIET)
        if (this.statusStale || this.configSaving || this.disposed || document.hidden || !hasValidAuthToken() || epoch !== businessNetworkEpoch() || token !== getAuthToken()) return
        if (!response.suc) throw new Error(response.info)
        this.$message({ type: action === 'stop' && !response.data?.stopped ? 'warning' : 'success', message: response.info }); await this.load()
      } catch (error) { if (!this.disposed && !document.hidden && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken()) this.$message.error(apiErrorDetail(error, '宿主操作未确认，请刷新状态。')) }
      finally { this.busy = '' }
    },
    invalidate() { this.seq++; this.loading = false; this.choice.seq++; this.choice.loading = false },
    visibility() { if (document.hidden) this.invalidate(); else this.load() },
    url(path) { return this.$root.prefix + '/ai' + path },
    ownerIcon(row) { const who = row.identity || {}; return who.platform === 'webui' ? 'el-icon-monitor' : who.group_id ? 'el-icon-s-custom' : 'el-icon-user' },
    owner(row) {
      const who = row.identity || {}
      if (who.platform === 'webui') return 'WebUI · ' + String(who.user_id || '').replace(/^webui:/, '')
      return (who.platform || '未知平台') + ' · ' + (who.group_id ? '群 ' + who.group_id : who.user_id || '历史记录')
    },
    async openChoice(owner = null) {
      if (this.statusStale || this.configSaving || this.disposed || this.choice.loading || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const seq = ++this.choice.seq, epoch = businessNetworkEpoch(), token = getAuthToken()
      const current = () => !this.disposed && !document.hidden && seq === this.choice.seq && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken()
      this.choice.loading = true; this.choice.owner = owner
      try {
        const response = await this.getRequest(this.url('/dsh/sessions'), owner ? { owner } : null, QUIET)
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        const data = response.data
        Object.assign(this.choice, { targets: data.targets, owner: data.owner, loadedOwner: data.owner, items: data.items, selected: data.current_id, revision: data.revision, visible: true })
      } catch (error) { if (current()) { this.choice.owner = this.choice.loadedOwner; this.$message.error(apiErrorDetail(error, '无法读取当前后端会话')) } }
      finally { if (current()) this.choice.loading = false }
    },
    async chooseSession(remoteId) {
      if (this.statusStale || this.configSaving || this.busy || this.choice.busy || this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const target = this.choice.targets.find((item) => item.owner === this.choice.owner)
      if (target && target !== this.choice.targets[0]) {
        try { await this.$confirm(`${target.label} 之后在 QQ 中的 Agent 对话将使用${remoteId ? '所选' : '新建的'}DSH 会话，工作目录和模型以该会话为准。`, '为超管选择会话', { type: 'warning' }) } catch (_) { return }
        if (this.statusStale || this.configSaving || this.busy || this.choice.busy || this.disposed) return
      }
      const seq = ++this.choice.seq, epoch = businessNetworkEpoch(), token = getAuthToken()
      this.choice.busy = true
      try {
        const response = await this.postRequest(this.url('/dsh/session'), { owner: this.choice.owner, remote_id: remoteId, expected_revision: this.choice.revision }, QUIET)
        if (this.statusStale || this.configSaving || this.disposed || seq !== this.choice.seq || token !== getAuthToken() || epoch !== businessNetworkEpoch()) return
        if (!response.suc) throw new Error(response.info)
        this.choice.visible = false; this.$message.success(response.info); await this.load()
      } catch (error) { if (!this.disposed && !document.hidden && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken()) this.$message.error(apiErrorDetail(error, '切换未确认，请刷新列表，不要重复提交')) }
      finally { this.choice.busy = false }
    },
    async load() {
      if (this.configSaving || this.disposed || document.hidden || this.loading || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const seq = ++this.seq, epoch = businessNetworkEpoch(), token = getAuthToken()
      const current = () => !this.disposed && !document.hidden && seq === this.seq && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken()
      this.loading = true
      try {
        const response = await this.getRequest(this.url('/dsh/status'), null, QUIET)
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        this.status = response.data; this.statusStale = false; this.error = ''
        this.$emit('status', response.data)
      } catch (error) { if (current()) this.error = apiErrorDetail(error, '执行器状态暂不可确认，保留上次结果。') }
      finally { if (current()) this.loading = false }
    },
    async change(row, action) {
      if (this.statusStale || this.configSaving || this.busy || this.choice.busy || this.disposed || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const text = {
        new: '解除与当前 DSH 会话的关联？下一条消息会新建会话，原会话及历史仍保留在 DSH。',
        archive: this.sdk ? '解除当前 SDK 会话关联？原记录保留在 SDK，不宣称远端已归档或删除。' : '停止并归档当前 DSH 会话？下一条消息会新建会话，桌面历史保留不删除。',
        reset: this.sdk || row.native ? '停止本会话并清除真寻短期历史？DSH 原会话保留。' : '停止本会话、归档桌面会话并清除真寻短期历史？桌面历史不会删除。',
      }[action]
      try { await this.$confirm(text, 'DSH 会话', { type: 'warning' }) } catch (_) { return }
      if (this.statusStale || this.configSaving || this.busy || this.choice.busy || this.disposed || !hasValidAuthToken()) return
      this.busy = row.local_id
      const epoch = businessNetworkEpoch(), token = getAuthToken()
      try {
        const query = new URLSearchParams({ session_id: row.local_id, expected_revision: row.revision, action })
        const response = await this.deleteRequest(this.url('/chat/sessions?' + query), null, QUIET)
        if (this.statusStale || this.configSaving || this.disposed || token !== getAuthToken() || epoch !== businessNetworkEpoch()) return
        if (!response.suc) throw new Error(response.info)
        this.$message.success(response.info); await this.load()
      } catch (error) { if (!this.disposed && !document.hidden && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken()) this.$message.error(apiErrorDetail(error, '操作未确认，请刷新状态，不要重复提交。')) }
      finally { this.busy = '' }
    },
  },
}
</script>

<style scoped>
.dsh-status { overflow-wrap: anywhere; }
.dsh-status .el-alert { margin: 0 0 14px; }
.muted { color: var(--text-color-secondary); font-size: 12px; }
.dsh-overview { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin: 16px 0 14px; padding: 14px 16px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-color); }
.overview-dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--text-color-disabled); box-shadow: 0 0 0 4px var(--bg-color-secondary); }
.is-success .overview-dot { background: var(--success-color); }
.is-warning .overview-dot { background: var(--warning-color); }
.overview-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; margin-right: auto; }
.overview-main strong { font-size: 15px; }
.overview-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ready-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-color-secondary); color: var(--text-color-secondary); font-size: 12px; line-height: 20px; }
.ready-chip.is-ready { border-color: var(--success-color); color: var(--success-color); }
.overview-note { flex-basis: 100%; margin: 0; padding-left: 24px; color: var(--text-color-secondary); font-size: 12px; line-height: 1.6; }
.dsh-card { margin-bottom: 14px; padding: 16px 18px; border: 1px solid var(--border-color-light); border-radius: 10px; background: var(--bg-color-secondary); }
.dsh-card:last-of-type { margin-bottom: 0; }
.card-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 14px; }
.card-heading h3 { display: inline-flex; align-items: center; gap: 6px; margin: 0 auto 0 0; font-size: 15px; font-weight: 600; }
.card-heading h3 i { color: var(--primary-color); }
.owner-cell { display: inline-flex; align-items: center; gap: 6px; }
.owner-cell i { color: var(--text-color-secondary); }
.run-state { color: var(--text-color-secondary); font-size: 12px; }
.run-state.is-running { color: var(--primary-color); font-weight: 500; }
.dsh-row-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
.dsh-row-actions .el-button + .el-button { margin-left: 0; }
.dsh-notes { margin-top: 14px; }
.notes-title { display: inline-flex; align-items: center; gap: 6px; color: var(--text-color-secondary); }
.dsh-notes ul { margin: 0; padding-left: 20px; color: var(--text-color-secondary); font-size: 12px; line-height: 1.9; }
.dsh-status p { line-height: 1.6; }
.dsh-selection { margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: var(--bg-color); font-size: 12px; overflow-wrap: anywhere; }
.dsh-selection p { margin: 2px 0; }
.dsh-target { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.dsh-target .el-select { flex: 1; }
.alert-text { margin: 4px 0 0; font-size: 12px; line-height: 1.7; }
.alert-text code { padding: 0 4px; border-radius: 4px; background: var(--bg-color-secondary); }
.session-risk { color: var(--warning-color); font-size: 12px; }
@media (max-width: 680px) {
  .dsh-overview, .dsh-card { padding: 12px; }
  .overview-note { padding-left: 0; }
}
</style>
