<template>
  <div class="agent-console">
    <div class="console-toolbar">
      <el-select v-model="personaId" size="small" placeholder="默认人设" clearable :disabled="running" class="persona-select" @change="loadHistory">
        <el-option v-for="item in personas" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-tooltip :content="agentEnabled ? '使用 Agent 工具；服务端仍会按当前登录、人设和工具配置检查权限' : '请先在 Agent 页开启 Agent'" placement="bottom">
        <el-switch v-model="agent" :disabled="!agentEnabled || running" active-text="Agent" />
      </el-tooltip>
      <span class="spacer"></span>
      <el-button v-if="executor !== 'dsh'" size="small" icon="el-icon-folder-opened" @click="openFiles">沙箱文件</el-button>
      <el-button size="small" icon="el-icon-delete" :disabled="running" @click="clearHistory">清空记录</el-button>
    </div>
    <p v-if="executor === 'dsh'" class="muted">DSH 桌面执行器：与 QQ 超管使用不同的会话，沿用桌面的权限、模型和模式。离开页面会停止本轮且不自动补发；桌面上已启动的后台任务请在 DSH 中管理。</p>
    <p v-else class="muted">控制台使用独立会话（每个人设一份记忆），回复不会发到群里；工具调用会显示在对话中。</p>
    <el-alert v-if="historyError" :title="historyError" type="warning" :closable="false"><el-button type="text" @click="loadHistory">重新读取</el-button></el-alert>

    <div ref="log" class="console-log">
      <p v-if="!history.length && !runs.length" class="muted empty">发送一条消息开始对话。</p>
      <div v-for="(item, index) in history" :key="`h${index}`" class="bubble" :class="item.role"><p>{{ item.text }}</p></div>
      <div v-for="run in runs" :key="run.key" class="run">
        <div class="bubble user"><p>{{ run.input }}</p></div>
        <template v-for="(block, index) in run.blocks">
          <div v-if="block.type === 'turn'" :key="index" class="bubble assistant">
            <p>{{ block.text }}</p>
          </div>
          <div v-else-if="block.type === 'tool'" :key="index" class="tool-card" :class="{ failed: block.is_error }">
            <div class="tool-head"><i :class="block.done ? (block.uncertain ? 'el-icon-question' : block.is_error ? 'el-icon-warning-outline' : 'el-icon-circle-check') : 'el-icon-loading'"></i><strong>{{ block.name }}</strong><small class="muted">{{ block.done ? (block.uncertain ? "结果待核查" : block.reused ? "复用已完成结果" : block.is_error ? "未完成" : "完成") : "执行中" }}</small></div>
            <details><summary>参数与结果</summary><pre>{{ block.arguments }}</pre><pre v-if="block.done">{{ block.result }}</pre></details>
            <el-button v-if="block.parent_run_id && !block.done" type="text" size="mini" :disabled="stoppingChildren.includes(block.run_id)" @click="stopChild(block.run_id)">停止此子任务</el-button>
          </div>
        </template>
        <div v-if="run.question && !run.done" class="tool-card question"><p>{{ run.question.text }}</p><el-input v-model="run.answer" type="textarea" :rows="2" maxlength="4000" placeholder="回答本轮问题；停止对话会取消等待" /><el-button size="small" :loading="run.answering" :disabled="!run.answer.trim()" @click="answerQuestion(run)">提交回答</el-button></div>
        <small v-if="!run.done" class="run-footer muted"><i class="el-icon-loading"></i> {{ run.question ? '等待你的回答' : run.retry ? (run.retry.state === 'waiting' ? '等待 ' + run.retry.delay_seconds + ' 秒后尝试 ' : '正在尝试 ') + run.retry.attempt + '/5' : '生成中' }}</small>
        <small v-else class="run-footer" :class="{ error: run.done.error }">{{ footerText(run.done) }}</small>
        <p v-if="run.done && run.done.agent_requested && run.done.agent_available === false" class="muted">Agent 工具未启用：{{ run.done.agent_unavailable_reason || "当前授权或人设没有可用工具" }}</p>
        <p v-if="run.done && run.done.diagnostics && run.done.diagnostics.operation_uncertain" class="error">部分外部操作结果待核查，系统没有自动重试。</p>
        <p v-if="run.done && run.done.details && run.done.details.preparation && run.done.details.preparation.status === 'unknown'" class="error">准备阶段未确认结束，请查看运行记录；不会自动重新执行。</p>
        <p v-if="run.done && run.done.diagnostics && run.done.diagnostics.tool_conflicts && run.done.diagnostics.tool_conflicts.length" class="error">已排除同名冲突工具：{{ run.done.diagnostics.tool_conflicts.join('、') }}</p>
      </div>
    </div>

    <div class="console-input">
      <el-input v-model="input" type="textarea" :rows="3" maxlength="8000" placeholder="输入消息，Ctrl+Enter 发送" @keydown.native.ctrl.enter="send" />
      <div>
        <el-button v-if="running" size="small" type="danger" plain :loading="stopping" @click="stop">停止</el-button>
        <el-button v-else type="primary" size="small" :disabled="!input.trim() || historyLoading || Boolean(historyError)" @click="send">发送</el-button>
      </div>
    </div>

    <el-drawer title="沙箱文件" :visible.sync="files.visible" size="min(560px, 92vw)" append-to-body>
      <div class="files">
        <div class="files-path">
          <el-button size="mini" icon="el-icon-top" :disabled="files.path === '.'" @click="openDir(parentPath(files.path))" />
          <code>{{ files.path === "." ? "/workspace" : `/workspace/${files.path}` }}</code>
          <el-button size="mini" icon="el-icon-refresh" :loading="files.loading" @click="openDir(files.path)" />
        </div>
        <p v-if="files.error" class="muted">{{ files.error }}</p>
        <el-table v-else :data="files.items" size="small" empty-text="空目录" @row-click="openEntry">
          <el-table-column label="名称" min-width="200"><template #default="{ row }"><i :class="row.type === 'dir' ? 'el-icon-folder' : 'el-icon-document'"></i> {{ row.name }}</template></el-table-column>
          <el-table-column label="大小" width="90"><template #default="{ row }">{{ row.type === "dir" ? "" : formatBytes(row.size) }}</template></el-table-column>
          <el-table-column label="修改时间" width="160"><template #default="{ row }">{{ formatTime(row.mtime * 1000) }}</template></el-table-column>
        </el-table>
        <div v-if="files.preview" class="preview">
          <div class="files-path"><code>{{ files.preview.path }}</code><span class="spacer"></span><el-button size="mini" icon="el-icon-download" @click="download(files.preview.path)">下载</el-button></div>
          <p v-if="files.preview.binary" class="muted">二进制文件（{{ formatBytes(files.preview.size) }}），请下载查看。</p>
          <pre v-else>{{ files.preview.text }}</pre>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import { apiErrorDetail } from "@/utils/api-error"
import { getBaseUrl } from "@/utils/api"
import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"

const QUIET = { suppressErrorToast: true }
const ERRORS = { 404: "人设不存在，请刷新页面。", 409: "该人设的上一次对话还在进行，请先停止。" }

export default {
  name: "AgentConsole",
  props: {
    personas: { type: Array, default: () => [] },
    agentEnabled: { type: Boolean, default: false },
    initialPersona: { type: Number, default: null },
  },
  data() {
    return {
      personaId: this.initialPersona, agent: false, input: "", history: [], runs: [], running: false, stopping: false, controller: null,
      files: { visible: false, path: ".", items: [], error: "", loading: false, preview: null },
      requestSeq: 0, disposed: false, stoppingChildren: [],
      resolvedSession: null, executor: 'local', historySeq: 0, historyLoading: false, historyError: '',
    }
  },
  computed: {
    sessionId() { if (this.resolvedSession) return this.resolvedSession; return `webui_console:${this.personaId == null ? "default" : this.personaId}` },
  },
  watch: {
    agent() { if (!this.running) this.loadHistory() },
    initialPersona(value) { if (!this.running && value !== this.personaId) { this.personaId = value; this.loadHistory() } },
    agentEnabled(value) { if (!value) this.agent = false },
  },
  mounted() {
    this.loadHistory()
    window.addEventListener("zhenxun-auth-expired", this.interrupt)
    window.addEventListener("offline", this.interrupt)
    document.addEventListener('visibilitychange', this.historyVisibility)
    this.removeNetworkListener = onBusinessNetworkChange((frozen) => { this.historySeq++; this.historyLoading = false; if (frozen) this.interrupt(); else if (!this.running) this.loadHistory() })
  },
  beforeDestroy() {
    this.disposed = true; this.interrupt()
    window.removeEventListener("zhenxun-auth-expired", this.interrupt)
    window.removeEventListener("offline", this.interrupt)
    document.removeEventListener('visibilitychange', this.historyVisibility)
    this.removeNetworkListener?.()
  },
  methods: {
    historyVisibility() { if (document.hidden) { this.historySeq++; this.historyLoading = false } else if (!this.running) this.loadHistory() },
    url(path) { return `${this.$root.prefix}/ai${path}` },
    /**
     * 载入当前人设控制台会话的历史消息
     */
    async loadHistory() {
      if (this.disposed || document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const seq = ++this.historySeq, epoch = businessNetworkEpoch(), credential = getAuthToken()
      const current = () => !this.disposed && !document.hidden && seq === this.historySeq && epoch === businessNetworkEpoch() && credential === getAuthToken() && hasValidAuthToken()
      this.historyLoading = true
      this.runs = []
      try {
        const target = await this.getRequest(this.url('/console/session'), { persona_id: this.personaId, agent: this.agent }, QUIET)
        if (!current()) return
        if (!target.suc) throw new Error(target.info)
        this.resolvedSession = target.data.session_id; this.executor = target.data.executor
        if (!this.resolvedSession) { this.history = []; this.historyError = ''; return }
        const response = await this.getRequest(this.url("/chat/sessions/messages"), { session_id: this.resolvedSession }, QUIET)
        if (!current()) return
        if (!response.suc) throw new Error(response.info)
        this.history = response.data.messages.filter((item) => ["user", "assistant"].includes(item.role) && item.text).map((item) => ({ role: item.role, text: item.text }))
        this.historyError = ''; this.scroll()
      } catch (error) { if (current()) this.historyError = apiErrorDetail(error, '会话暂不可确认，保留上次记录。') }
      finally { if (current()) this.historyLoading = false }
    },
    async clearHistory() {
      if (!this.resolvedSession || this.running || this.historyLoading) return
      try {
        const response = await this.deleteRequest(this.url(`/chat/sessions?session_id=${encodeURIComponent(this.sessionId)}`), null, QUIET)
        if (!response.suc) throw new Error(response.info)
        this.history = []; this.runs = []; this.loadHistory()
      } catch (error) { this.$message.error(apiErrorDetail(error, "清空失败。")) }
    },
    /**
     * 发送消息并读取服务端推送的流式事件
     */
    async send() {
      if (this.historyLoading || this.historyError) return
      const message = this.input.trim()
      if (!message || this.running || this.disposed || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const seq = ++this.requestSeq, epoch = businessNetworkEpoch(), credential = getAuthToken()
      const current = () => !this.disposed && seq === this.requestSeq && epoch === businessNetworkEpoch() && credential === getAuthToken() && hasValidAuthToken()
      const run = { key: Date.now(), run_id: null, input: message, blocks: [], done: null, question: null, answer: '', answering: false }
      this.runs.push(run); this.input = ""; this.running = true
      this.controller = new AbortController()
      try {
        const response = await fetch(`${getBaseUrl()}${this.url("/console/run")}`, {
          method: "POST",
          headers: { Authorization: getAuthToken(), "Content-Type": "application/json" },
          body: JSON.stringify({ message, persona_id: this.personaId, agent: this.agent, session_id: this.resolvedSession }),
          signal: this.controller.signal,
        })
        if (!response.ok) throw new Error(ERRORS[response.status] || `请求失败（${response.status}）`)
        if (!current()) return
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        for (;;) {
          const { value, done } = await reader.read()
          if (!current()) return
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split("\n\n")
          buffer = chunks.pop()
          chunks.forEach((chunk) => chunk.split("\n").filter((line) => line.startsWith("data: ")).forEach((line) => this.apply(run, JSON.parse(line.slice(6)))))
        }
        if (current() && !run.done) run.done = { error: "连接已断开，本轮已停止；外部操作结果请查看运行记录。", outcome: "interrupted" }
      } catch (error) {
        if (current() && error.name !== "AbortError") run.done = { error: error.message || "对话失败。" }
      } finally {
        if (seq === this.requestSeq) { this.running = false; this.controller = null }
      }
    },
    /**
     * 把一条流式事件合并到本次对话的显示块
     * @param {object} run 本次对话
     * @param {object} item 事件
     */
    apply(run, item) {
      if (this.disposed) return
      if (item.type === "accepted") {
        run.run_id = item.run_id
        if (item.session_id) this.resolvedSession = item.session_id
        if (item.executor) this.executor = item.executor
      } else if (item.type === "question") {
        run.question = { id: item.question_id, text: item.question }; run.answer = ''
      } else if (item.type === "retry") {
        this.$set(run, 'retry', item)
      } else if (item.type === "settled") {
        if (run.done && run.run_id === item.run_id) run.done = { ...run.done, outcome: item.outcome, phase: item.phase, details: item.details }
      } else if (item.type === "tool_start") {
        this.$set(run, 'retry', null)
        run.blocks.push({ type: "tool", run_id: item.run_id, tool_call_id: item.tool_call_id, parent_run_id: item.parent_run_id, name: item.name, arguments: item.arguments, result: "", is_error: false, uncertain: false, reused: false, done: false })
      } else if (item.type === "tool_end") {
        const tool = run.blocks.find((block) => block.type === "tool" && block.run_id === item.run_id && block.tool_call_id === item.tool_call_id && !block.done)
        if (tool) Object.assign(tool, { result: item.result, is_error: item.is_error, uncertain: Boolean(item.uncertain), reused: Boolean(item.reused), done: true })
      } else if (item.type === "done") {
        run.question = null
        if (item.output) run.blocks.push({ type: "turn", text: item.output })
        run.done = item
        run.blocks.filter((block) => block.type === "tool" && !block.done).forEach((block) => Object.assign(block, { done: true, is_error: true, result: "执行已中断，未收到完成收据。" }))
        if (!item.error && !item.stopped) this.$emit("done", item)
      }
      this.scroll()
    },
    async answerQuestion(run) {
      if (run.answering || !run.question || run.done || this.disposed || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
      const id = run.question.id, epoch = businessNetworkEpoch(), token = getAuthToken()
      run.answering = true
      try {
        const response = await this.postRequest(this.url('/console/answer'), { run_id: run.run_id, question_id: id, answer: run.answer }, QUIET)
        if (this.disposed || token !== getAuthToken() || epoch !== businessNetworkEpoch()) return
        if (!response.suc) throw new Error(response.info)
        if (run.question && run.question.id === id) run.question = null
      } catch (error) { if (!this.disposed && token === getAuthToken()) this.$message.error(apiErrorDetail(error, '回答未提交，本轮可能已结束。')) }
      finally { run.answering = false }
    },
    async stop() {
      if (this.stopping || !this.running) return
      const run = this.runs[this.runs.length - 1]
      if (!run?.run_id) { this.interrupt(); return }
      this.stopping = true
      try { await this.postRequest(this.url("/console/stop"), { persona_id: this.personaId, run_id: run.run_id }, QUIET) }
      catch (error) { this.$message.error(apiErrorDetail(error, "停止失败。")) }
      finally { this.stopping = false }
    },
    interrupt() {
      ++this.requestSeq
      this.controller?.abort(); this.controller = null; this.running = false
      const run = this.runs[this.runs.length - 1]
      if (run && !run.done) run.done = { error: "连接已结束，本轮已停止，不会自动续跑。", outcome: "interrupted" }
    },
    async stopChild(runId) {
      if (!runId || this.disposed || this.stoppingChildren.includes(runId)) return
      this.stoppingChildren.push(runId)
      try {
        await this.postRequest(this.url("/console/stop"), { persona_id: this.personaId, run_id: runId }, QUIET)
      } catch (error) { this.$message.error(apiErrorDetail(error, "子任务停止未确认。")) }
      finally { this.stoppingChildren = this.stoppingChildren.filter((id) => id !== runId) }
    },
    footerText(done) {
      if (done.phase && done.phase !== "finished") return "正在收尾"
      const states = { interrupted: "已中断", cancelled: "已取消", failed: "失败", timeout: "已超时", exhausted: "预算耗尽", unknown: "结果待核验", skipped: "已跳过" }
      if (done.error) return `${states[done.outcome] || "出错"}：${done.error}`
      if (states[done.outcome]) return states[done.outcome]
      const parts = [`${(done.duration / 1000).toFixed(1)} 秒`, `${done.tokens} tokens`]
      if (done.stopped) parts.unshift("已停止")
      return parts.join(" · ")
    },
    scroll() { this.$nextTick(() => { const log = this.$refs.log; if (log) log.scrollTop = log.scrollHeight }) },
    openFiles() { this.files.visible = true; this.files.preview = null; this.openDir(".") },
    /**
     * 列出当前会话沙箱中的目录
     * @param {string} path 相对工作目录的路径
     */
    async openDir(path) {
      this.files.loading = true; this.files.error = ""
      try {
        const response = await this.getRequest(this.url("/sandbox/files"), { key: this.sessionId, path }, QUIET)
        if (!response.suc) throw new Error(response.info)
        this.files.path = path; this.files.items = response.data.items
      } catch (error) {
        this.files.items = []
        this.files.error = error.response?.status === 404 ? "该会话还没有运行中的沙箱，Agent 首次执行代码时会自动创建。" : apiErrorDetail(error, "无法读取目录。")
      } finally { this.files.loading = false }
    },
    joinPath(name) { return this.files.path === "." ? name : `${this.files.path}/${name}` },
    parentPath(path) { const index = path.lastIndexOf("/"); return index > 0 ? path.slice(0, index) : "." },
    async openEntry(row) {
      if (row.type === "dir") { this.files.preview = null; this.openDir(this.joinPath(row.name)); return }
      try {
        const response = await this.getRequest(this.url("/sandbox/file"), { key: this.sessionId, path: this.joinPath(row.name) }, QUIET)
        if (!response.suc) throw new Error(response.info)
        this.files.preview = response.data
      } catch (error) { this.$message.error(apiErrorDetail(error, "无法读取文件。")) }
    },
    async download(path) {
      try {
        const query = new URLSearchParams({ key: this.sessionId, path, download: "true" })
        const response = await fetch(`${getBaseUrl()}${this.url(`/sandbox/file?${query}`)}`, { headers: { Authorization: getAuthToken() } })
        if (!response.ok) throw new Error(`下载失败（${response.status}）`)
        const link = document.createElement("a")
        link.href = URL.createObjectURL(await response.blob())
        link.download = path.split("/").pop()
        link.click(); URL.revokeObjectURL(link.href)
      } catch (error) { this.$message.error(error.message) }
    },
    formatBytes(value) {
      const size = Number(value) || 0
      if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)} MB`
      return size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`
    },
    formatTime(value) { return value ? new Date(value).toLocaleString() : "" },
  },
}
</script>

<style scoped>
.console-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.console-toolbar .el-button + .el-button { margin-left: 0; }
.persona-select { width: 200px; }
.spacer { flex: 1; }
.muted { color: var(--text-color-secondary); font-size: 12px; }
.empty { margin: auto; }
.console-log { display: flex; flex-direction: column; gap: 10px; height: min(60vh, 640px); margin: 10px 0; padding: 12px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; }
.run { display: flex; flex-direction: column; gap: 8px; }
.bubble { max-width: 85%; padding: 8px 12px; border-radius: 10px; background: var(--bg-color-hover); }
.bubble.user { align-self: flex-end; background: var(--primary-color); color: #fff; }
.bubble p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.tool-card { max-width: 85%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; }
.tool-card.failed { border-color: var(--el-color-danger, #f56c6c); }
.tool-head { display: flex; align-items: center; gap: 6px; }
.tool-card details summary { margin-top: 4px; color: var(--text-color-secondary); font-size: 12px; cursor: pointer; }
.tool-card pre, .preview pre { margin: 6px 0 0; padding: 6px 8px; border-radius: 6px; background: var(--bg-color-hover); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow-y: auto; }
.run-footer { color: var(--text-color-secondary); font-size: 11px; }
.run-footer.error { color: var(--el-color-danger, #f56c6c); }
.run > p { margin: 0; font-size: 12px; line-height: 1.6; }
.run > p.error { color: var(--el-color-danger, #f56c6c); }
.question p { margin: 0 0 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
.question .el-button { margin-top: 8px; }
.console-input > div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.files { padding: 0 16px 16px; }
.files-path { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.files-path code { overflow-wrap: anywhere; }
.files .el-table { cursor: pointer; }
.preview { margin-top: 14px; }
.preview pre { max-height: 50vh; }
</style>
