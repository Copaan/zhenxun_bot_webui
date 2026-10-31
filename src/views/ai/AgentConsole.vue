<template>
  <div class="agent-console">
    <div class="console-toolbar">
      <el-select v-model="personaId" size="small" placeholder="默认人设" clearable :disabled="running" class="persona-select" @change="loadHistory">
        <el-option v-for="item in personas" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-tooltip :content="agentEnabled ? '使用 Agent 工具与提示词（与超级用户在 QQ 中相同）' : '请先在 Agent 页开启 Agent'" placement="bottom">
        <el-switch v-model="agent" :disabled="!agentEnabled || running" active-text="Agent" />
      </el-tooltip>
      <span class="spacer"></span>
      <el-button size="small" icon="el-icon-folder-opened" @click="openFiles">沙箱文件</el-button>
      <el-button size="small" icon="el-icon-delete" :disabled="running" @click="clearHistory">清空记录</el-button>
    </div>
    <p class="muted">控制台使用独立会话（每个人设一份记忆），回复逐字显示，不会发到群里；工具调用会显示在对话中。</p>

    <div ref="log" class="console-log">
      <p v-if="!history.length && !runs.length" class="muted empty">发送一条消息开始对话。</p>
      <div v-for="(item, index) in history" :key="`h${index}`" class="bubble" :class="item.role"><p>{{ item.text }}</p></div>
      <div v-for="run in runs" :key="run.key" class="run">
        <div class="bubble user"><p>{{ run.input }}</p></div>
        <template v-for="(block, index) in run.blocks">
          <div v-if="block.type === 'turn'" :key="index" class="bubble assistant">
            <details v-if="block.thought" class="thought" :open="block.open && !block.text"><summary>思考过程</summary><p>{{ block.thought }}</p></details>
            <p v-if="block.text || block.open">{{ block.text }}<span v-if="block.open" class="cursor"></span></p>
          </div>
          <div v-else-if="block.type === 'tool'" :key="index" class="tool-card" :class="{ failed: block.is_error }">
            <div class="tool-head"><i :class="block.done ? (block.is_error ? 'el-icon-warning-outline' : 'el-icon-circle-check') : 'el-icon-loading'"></i><strong>{{ block.name }}</strong><small class="muted">{{ block.done ? (block.is_error ? "失败" : "完成") : "执行中" }}</small></div>
            <details><summary>参数与结果</summary><pre>{{ block.arguments }}</pre><pre v-if="block.done">{{ block.result }}</pre></details>
          </div>
        </template>
        <small v-if="run.done" class="run-footer" :class="{ error: run.done.error }">{{ footerText(run.done) }}</small>
      </div>
    </div>

    <div class="console-input">
      <el-input v-model="input" type="textarea" :rows="3" maxlength="8000" placeholder="输入消息，Ctrl+Enter 发送" @keydown.native.ctrl.enter="send" />
      <div>
        <el-button v-if="running" size="small" type="danger" plain :loading="stopping" @click="stop">停止</el-button>
        <el-button v-else type="primary" size="small" :disabled="!input.trim()" @click="send">发送</el-button>
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
import { getAuthToken } from "@/utils/auth-token"

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
    }
  },
  computed: {
    sessionId() { return `webui_console:${this.personaId == null ? "default" : this.personaId}` },
  },
  watch: {
    initialPersona(value) { if (!this.running && value !== this.personaId) { this.personaId = value; this.loadHistory() } },
    agentEnabled(value) { if (!value) this.agent = false },
  },
  mounted() { this.loadHistory() },
  beforeDestroy() { this.controller?.abort() },
  methods: {
    url(path) { return `${this.$root.prefix}/ai${path}` },
    /**
     * 载入当前人设控制台会话的历史消息
     */
    async loadHistory() {
      this.runs = []
      try {
        const response = await this.getRequest(this.url("/chat/sessions/messages"), { session_id: this.sessionId }, QUIET)
        this.history = response.suc ? response.data.messages.filter((item) => ["user", "assistant"].includes(item.role) && item.text).map((item) => ({ role: item.role, text: item.text })) : []
      } catch (_) { this.history = [] }
      this.scroll()
    },
    async clearHistory() {
      try {
        const response = await this.deleteRequest(this.url(`/chat/sessions?session_id=${encodeURIComponent(this.sessionId)}`), null, QUIET)
        if (!response.suc) throw new Error(response.info)
        this.history = []; this.runs = []
      } catch (error) { this.$message.error(apiErrorDetail(error, "清空失败。")) }
    },
    /**
     * 发送消息并读取服务端推送的流式事件
     */
    async send() {
      const message = this.input.trim()
      if (!message || this.running) return
      const run = { key: Date.now(), input: message, blocks: [], done: null }
      this.runs.push(run); this.input = ""; this.running = true
      this.controller = new AbortController()
      try {
        const response = await fetch(`${getBaseUrl()}${this.url("/console/run")}`, {
          method: "POST",
          headers: { Authorization: getAuthToken(), "Content-Type": "application/json" },
          body: JSON.stringify({ message, persona_id: this.personaId, agent: this.agent }),
          signal: this.controller.signal,
        })
        if (!response.ok) throw new Error(ERRORS[response.status] || `请求失败（${response.status}）`)
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split("\n\n")
          buffer = chunks.pop()
          chunks.forEach((chunk) => chunk.split("\n").filter((line) => line.startsWith("data: ")).forEach((line) => this.apply(run, JSON.parse(line.slice(6)))))
        }
        if (!run.done) run.done = { error: "连接已断开。" }
      } catch (error) {
        if (error.name !== "AbortError") run.done = { error: error.message || "对话失败。" }
      } finally {
        this.running = false; this.controller = null
      }
    },
    /**
     * 把一条流式事件合并到本次对话的显示块
     * @param {object} run 本次对话
     * @param {object} item 事件
     */
    apply(run, item) {
      const last = run.blocks[run.blocks.length - 1]
      const open = last && last.type === "turn" && last.open ? last : null
      if (item.type === "delta") {
        const turn = open || run.blocks[run.blocks.push({ type: "turn", text: "", thought: "", open: true }) - 1]
        if (item.kind === "reset") { turn.text = ""; turn.thought = "" } else if (item.kind === "thought") turn.thought += item.text
        else turn.text += item.text
      } else if (item.type === "turn") {
        if (open) run.blocks.pop()
        if (item.text || item.thought) run.blocks.push({ type: "turn", text: item.text, thought: item.thought, open: false })
      } else if (item.type === "tool_start") {
        if (open && !open.text && !open.thought) run.blocks.pop()
        run.blocks.push({ type: "tool", name: item.name, arguments: item.arguments, result: "", is_error: false, done: false })
      } else if (item.type === "tool_end") {
        const tool = [...run.blocks].reverse().find((block) => block.type === "tool" && block.name === item.name && !block.done)
        if (tool) Object.assign(tool, { result: item.result, is_error: item.is_error, done: true })
      } else if (item.type === "done") {
        run.blocks = run.blocks.filter((block) => !(block.type === "turn" && block.open && !block.text && !block.thought))
        run.blocks.forEach((block) => { if (block.type === "turn") block.open = false })
        run.done = item
        if (!item.error && !item.stopped) this.$emit("done", item)
      }
      this.scroll()
    },
    async stop() {
      this.stopping = true
      try { await this.postRequest(this.url("/console/stop"), { persona_id: this.personaId }, QUIET) }
      catch (error) { this.$message.error(apiErrorDetail(error, "停止失败。")) }
      finally { this.stopping = false }
    },
    footerText(done) {
      if (done.error) return `出错：${done.error}`
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
.thought { margin-bottom: 6px; color: var(--text-color-secondary); font-size: 12px; }
.thought summary { cursor: pointer; }
.thought p { margin-top: 4px; }
.cursor { display: inline-block; width: 7px; height: 1em; margin-left: 2px; vertical-align: text-bottom; background: var(--text-color-secondary); animation: blink 1s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.tool-card { max-width: 85%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; }
.tool-card.failed { border-color: var(--el-color-danger, #f56c6c); }
.tool-head { display: flex; align-items: center; gap: 6px; }
.tool-card details summary { margin-top: 4px; color: var(--text-color-secondary); font-size: 12px; cursor: pointer; }
.tool-card pre, .preview pre { margin: 6px 0 0; padding: 6px 8px; border-radius: 6px; background: var(--bg-color-hover); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow-y: auto; }
.run-footer { color: var(--text-color-secondary); font-size: 11px; }
.run-footer.error { color: var(--el-color-danger, #f56c6c); }
.console-input > div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.files { padding: 0 16px 16px; }
.files-path { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.files-path code { overflow-wrap: anywhere; }
.files .el-table { cursor: pointer; }
.preview { margin-top: 14px; }
.preview pre { max-height: 50vh; }
</style>
