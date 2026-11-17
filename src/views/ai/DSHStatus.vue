<template>
  <section class="zx-panel dsh-status">
    <div class="zx-section-heading"><div><h2>DSH 执行器</h2><p>桌面使用已登录的本机应用；SDK 使用独立宿主和已配置的官方 DeepSeek Key。两种模式分别继承会话，不自动回退。</p></div><el-button size="small" @click="$emit('configure')">连接配置</el-button><el-button size="small" :loading="loading" @click="load">刷新状态</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <template v-if="status">
      <div class="dsh-tags">
        <el-tag type="info">{{ status.transport === 'sdk' ? 'SDK 独立宿主' : 'Desktop 桌面' }}</el-tag>
        <el-tag :type="status.connected ? 'success' : 'warning'">{{ status.connected ? '后端已连接' : '连接未确认' }}</el-tag>
        <el-tag type="info">{{ status.version || '版本未确认' }}</el-tag>
        <el-tag v-if="status.transport !== 'sdk'" :type="status.login_state === 'credential-stored' ? 'info' : 'warning'">{{ status.login_state === 'credential-stored' ? '桌面登录信息已保存' : status.login_state === 'signed-out' ? '请在桌面登录' : '登录状态未确认' }}</el-tag>
      </div>
      <p v-if="status.migration_required">{{ status.reason }}</p>
      <p v-else-if="!status.connected || status.mapping_trusted === false">{{ status.reason }}</p>
      <p v-else-if="status.transport === 'sdk'">普通聊天：{{ status.presets && status.presets.chat ? '已启动（无工具）' : '未启动' }}；原生 Agent：{{ status.native_ready ? '已启动' : '未启动' }}。</p>
      <p v-else>普通聊天：{{ status.presets && status.presets.chat ? '就绪' : '缺少专用预设，暂不可用' }}；原生 Agent：{{ !status.standard_ready ? '缺少 standard 预设' : !status.native_ready ? '转发组件未就绪' : '就绪' }}。</p>
      <el-alert title="超管 Agent 在各群和私聊间共享上下文，回复发到本轮触发的位置，群里的回复可能包含此前私聊或工具读取的信息。" type="warning" :closable="false" show-icon />
      <div v-if="status.transport === 'sdk'" class="dsh-choice"><el-button size="small" :disabled="Boolean(busy)" @click="hostAction('start', 'chat')">启动普通聊天 SDK</el-button><el-button size="small" :disabled="Boolean(busy)" @click="hostAction('start', 'agent')">启动原生 Agent SDK</el-button><el-button size="small" type="danger" plain :disabled="Boolean(busy) || !status.connected" @click="hostAction('stop')">停止 SDK 宿主</el-button><span class="muted">Bot 退出不关闭原生 Agent 宿主。普通聊天与原生 Agent 分开存储；SDK 暂只解除映射，不宣称远端已归档。</span></div>
      <el-collapse class="dsh-notes">
        <el-collapse-item title="注意事项">
          <ul>
            <li>{{ sdk ? 'SDK 普通聊天使用独立存储与工作目录，群聊和私聊历史隔离，执行端不开放工具。' : '普通群聊和私聊会话都放在桌面的“真寻”工作区，彼此历史隔离，不能使用桌面工具。' }}</li>
            <li>{{ sdk ? '超管 Agent 使用 SDK 原生工具组合；只继承同一 SDK 存储中的兼容会话，不迁移桌面会话。' : '超管 Agent 新建会话使用 standard 预设；继承已有会话时保留其工作目录、模型、思考等级和模式。' }}</li>
            <li>原生 Agent 的文件、命令、后台任务和子代理由 DSH 自身权限决定，真寻只校验发起人身份。</li>
            <li>{{ sdk ? '普通聊天停止时会请求取消；原生 Agent 在 Bot 退出或断线后可继续执行，但真寻不再转发，也不重放输入或补发结果。停止命令只确认当前前台轮次，不宣称后台任务全部结束。' : '停止对话、关闭 Bot 或断线只会停止真寻这边的本轮，不会停止桌面上已启动的后台任务，也不会自动补发。' }}</li>
            <li>模型临时出错时最多尝试 5 次（含首次），依次等待 2、5、10、20 秒；不会重复执行工具或重发消息。</li>
            <li>DSH 执行器暂不支持图片，请发送文字。</li>
          </ul>
        </el-collapse-item>
      </el-collapse>
      <div class="dsh-choice">
        <el-button size="small" :loading="choice.loading" :disabled="!status.connected" @click="openChoice()">选择 Agent 会话</el-button>
        <span class="muted">为当前 WebUI 账号或 QQ 超管选择当前后端的 Agent 会话；超管之后在 QQ 中的 Agent 对话会使用所选会话。</span>
      </div>
      <el-table :data="status.sessions || []" size="small" empty-text="尚未建立当前后端的真寻会话">
        <el-table-column label="会话归属" min-width="150"><template #default="{ row }">{{ owner(row) }}</template></el-table-column>
        <el-table-column label="模式" min-width="120"><template #default="{ row }">{{ row.native ? 'DSH 原生 · ' + row.preset : row.mode === 'agent' ? '受限预设（旧）' : '普通聊天' }}</template></el-table-column>
        <el-table-column label="状态" min-width="130"><template #default="{ row }">{{ row.stop_state_label || (row.inflight ? '执行中或结果待确认' : row.quarantined ? '下次对话将重建会话' : '无登记运行（非远端状态）') }}</template></el-table-column>
        <el-table-column label="操作" min-width="200"><template #default="{ row }"><div class="dsh-row-actions"><el-button v-if="row.inflight && row.inflight.run_id" size="mini" type="warning" :disabled="Boolean(busy)" @click="stopRun(row)">停止此轮</el-button><el-button v-if="row.mode === 'agent' && (row.identity || {}).source !== 'webui'" size="mini" :disabled="Boolean(busy) || !status.connected" :loading="choice.loading && choice.owner === row.owner" @click="openChoice(row.owner)">切换会话</el-button><el-button v-if="row.native" size="mini" :disabled="Boolean(busy)" @click="change(row, 'new')">新开</el-button><el-button size="mini" :disabled="Boolean(busy)" @click="change(row, 'reset')">重置</el-button><el-button size="mini" :disabled="Boolean(busy)" @click="change(row, 'archive')">{{ sdk ? '解除关联' : row.native ? '归档' : '归档并新开' }}</el-button></div></template></el-table-column>
      </el-table>
      <p class="muted">{{ sdk ? '新开或解除关联会保留 SDK 原会话；重置另清除真寻的短期历史，不删除或归档 SDK 原始记录。执行中的会话需先停止。' : '新开只解除与原会话的关联；归档会在桌面归档原会话；重置还会清除真寻的短期历史。以上操作都不会删除 DSH 历史，执行中的会话需先停止。' }}</p>
    </template>
    <el-dialog title="新建或继承 DSH 会话" :visible.sync="choice.visible" width="min(680px, 94vw)" append-to-body>
      <div class="dsh-target"><span>会话归属</span><el-select v-model="choice.owner" size="small" :disabled="choice.busy || choice.loading" @change="openChoice(choice.owner)"><el-option v-for="target in choice.targets" :key="target.owner" :value="target.owner" :label="target.label" /></el-select></div>
      <p>继承会直接使用原会话，不复制或清除历史，也不更改其模型、思考等级、计划模式和工作目录。其他用户已认领的会话不会列出。</p>
      <el-select v-model="choice.selected" filterable clearable :placeholder="sdk ? '搜索当前 SDK 存储中的兼容会话' : '搜索桌面手工或真寻创建的会话'" style="width: 100%" :disabled="choice.busy">
        <el-option v-for="item in choice.items" :key="item.remote_id" :value="item.remote_id" :disabled="item.running" :label="(item.archived ? '[已归档] ' : '') + item.title + ' · ' + item.preset" />
      </el-select>
      <div v-if="selectedSession" class="dsh-selection"><p>模型：{{ (selectedSession.model || {}).model || '后端默认' }} · 思考：{{ (selectedSession.model || {}).reasoningEffort || '默认' }}</p><p>模式：{{ selectedSession.preset }} · {{ (selectedSession.plan || {}).pending === true || (selectedSession.plan || {}).active ? '计划模式' : '执行模式' }}</p><p>工作目录：{{ selectedSession.cwd }}</p></div>
      <span slot="footer"><el-button :disabled="choice.busy" @click="choice.visible = false">取消</el-button><el-button :loading="choice.busy" @click="chooseSession(null)">{{ sdk ? '新建原生 SDK 会话' : '新建标准会话' }}</el-button><el-button type="primary" :loading="choice.busy" :disabled="!choice.selected" @click="chooseSession(choice.selected)">继承所选会话</el-button></span>
    </el-dialog>
  </section>
</template>

<script>
import { apiErrorDetail } from "@/utils/api-error"
import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"

const QUIET = { suppressErrorToast: true }
export default {
  name: "DSHStatus",
  data: () => ({ status: null, error: "", loading: false, busy: "", seq: 0, disposed: false, choice: { visible: false, loading: false, busy: false, seq: 0, targets: [], owner: null, loadedOwner: null, items: [], selected: null, revision: 0 } }),
  computed: { sdk() { return this.status?.transport === 'sdk' }, selectedSession() { return this.choice.items.find(item => item.remote_id === this.choice.selected) } },
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
    async stopRun(row) {
      if (this.busy || this.choice.busy || this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
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
      if (this.busy || this.choice.busy || this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      if (action === 'stop') {
        try { await this.$confirm('停止独立 SDK 宿主会关闭其全部会话及后台能力；不影响 DSH 桌面。请先确认原生后台工作。', '停止 SDK 宿主', { type: 'warning' }) } catch (_) { return }
      }
      if (this.busy || this.choice.busy || this.disposed || !hasValidAuthToken()) return
      const epoch = businessNetworkEpoch(), token = getAuthToken()
      this.busy = 'host'
      try {
        const response = await this.postRequest(this.url('/dsh/host/' + action), { mode, ...(action === 'stop' ? { expected_boot: this.status.host_boot } : {}) }, QUIET)
        if (this.disposed || epoch !== businessNetworkEpoch() || token !== getAuthToken()) return
        if (!response.suc) throw new Error(response.info)
        this.$message.success(response.info); await this.load()
      } catch (error) { if (!this.disposed && !document.hidden && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken()) this.$message.error(apiErrorDetail(error, '宿主操作未确认，请刷新状态。')) }
      finally { this.busy = '' }
    },
    invalidate() { this.seq++; this.loading = false; this.choice.seq++; this.choice.loading = false },
    visibility() { if (document.hidden) this.invalidate(); else this.load() },
    url(path) { return this.$root.prefix + '/ai' + path },
    owner(row) {
      const who = row.identity || {}
      if (who.platform === 'webui') return 'WebUI · ' + String(who.user_id || '').replace(/^webui:/, '')
      return (who.platform || '未知平台') + ' · ' + (who.group_id ? '群 ' + who.group_id : who.user_id || '历史记录')
    },
    async openChoice(owner = null) {
      if (this.disposed || this.choice.loading || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
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
      if (this.busy || this.choice.busy || this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const target = this.choice.targets.find((item) => item.owner === this.choice.owner)
      if (target && target !== this.choice.targets[0]) {
        try { await this.$confirm(`${target.label} 之后在 QQ 中的 Agent 对话将使用${remoteId ? '所选' : '新建的'}桌面会话，工作目录和模型以该会话为准。`, '为超管选择会话', { type: 'warning' }) } catch (_) { return }
        if (this.busy || this.choice.busy || this.disposed) return
      }
      const seq = ++this.choice.seq, epoch = businessNetworkEpoch(), token = getAuthToken()
      this.choice.busy = true
      try {
        const response = await this.postRequest(this.url('/dsh/session'), { owner: this.choice.owner, remote_id: remoteId, expected_revision: this.choice.revision }, QUIET)
        if (this.disposed || seq !== this.choice.seq || token !== getAuthToken() || epoch !== businessNetworkEpoch()) return
        if (!response.suc) throw new Error(response.info)
        this.choice.visible = false; this.$message.success(response.info); await this.load()
      } catch (error) { if (!this.disposed && !document.hidden && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken()) this.$message.error(apiErrorDetail(error, '切换未确认，请刷新列表，不要重复提交')) }
      finally { this.choice.busy = false }
    },
    async load() {
      if (this.disposed || document.hidden || this.loading || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const seq = ++this.seq, epoch = businessNetworkEpoch(), token = getAuthToken()
      const current = () => !this.disposed && !document.hidden && seq === this.seq && epoch === businessNetworkEpoch() && token === getAuthToken() && hasValidAuthToken()
      this.loading = true
      try {
        const response = await this.getRequest(this.url('/dsh/status'), null, QUIET)
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        this.status = response.data; this.error = ''
        this.$emit('status', response.data)
      } catch (error) { if (current()) this.error = apiErrorDetail(error, '执行器状态暂不可确认，保留上次结果。') }
      finally { if (current()) this.loading = false }
    },
    async change(row, action) {
      if (this.busy || this.choice.busy || this.disposed || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const text = {
        new: '解除与当前 DSH 会话的关联？下一条消息会新建会话，原会话及历史仍保留在 DSH。',
        archive: this.sdk ? '解除当前 SDK 会话关联？原记录保留在 SDK，不宣称远端已归档或删除。' : '停止并归档当前 DSH 会话？下一条消息会新建会话，桌面历史保留不删除。',
        reset: this.sdk || row.native ? '停止本会话并清除真寻短期历史？DSH 原会话保留。' : '停止本会话、归档桌面会话并清除真寻短期历史？桌面历史不会删除。',
      }[action]
      try { await this.$confirm(text, 'DSH 会话', { type: 'warning' }) } catch (_) { return }
      if (this.busy || this.choice.busy || this.disposed || !hasValidAuthToken()) return
      this.busy = row.local_id
      const epoch = businessNetworkEpoch(), token = getAuthToken()
      try {
        const query = new URLSearchParams({ session_id: row.local_id, expected_revision: row.revision, action })
        const response = await this.deleteRequest(this.url('/chat/sessions?' + query), null, QUIET)
        if (this.disposed || token !== getAuthToken() || epoch !== businessNetworkEpoch()) return
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
.dsh-status p { margin: 8px 0; font-size: 13px; line-height: 1.6; }
.dsh-status .el-alert { margin: 12px 0; }
.muted { color: var(--text-color-secondary); font-size: 12px; }
.dsh-tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.dsh-choice { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 16px 0 12px; }
.dsh-row-actions { display: flex; flex-wrap: wrap; gap: 4px; }
.dsh-row-actions .el-button + .el-button { margin-left: 0; }
.dsh-selection { overflow-wrap: anywhere; }
.dsh-target { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.dsh-target .el-select { flex: 1; }
.dsh-notes { margin: 12px 0; }
.dsh-notes ul { margin: 0; padding-left: 20px; line-height: 1.8; }
</style>
