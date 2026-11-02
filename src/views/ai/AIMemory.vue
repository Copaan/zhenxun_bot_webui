<template>
  <div class="ai-memory">
    <div class="zx-section-heading">
      <div>
        <h2>长期记忆</h2>
        <p>开启后，AI 会在后台把群聊和私聊整理成记忆片段，之后聊到相关内容时召回；群记忆整群共享，私聊记忆按用户区分。自动整理的记忆每天淡忘一点，被召回时加深，淡忘到很低时归档；归档的记忆不再召回，可以恢复。开关与整理间隔在“聊天设置”的“长期记忆”分组。</p>
      </div>
      <div class="heading-actions">
        <el-tag size="small" :type="status.mode === 'off' ? 'info' : 'success'">{{ modeNames[status.mode] || status.mode }}</el-tag>
        <span class="embedding-switch">
          <span class="muted">向量召回</span>
          <el-switch :value="status.embedding_enabled" :disabled="switching" @change="toggleEmbedding" />
        </span>
        <span class="muted embedding-model">向量模型：<span class="mono">{{ status.embedding_enabled ? status.embedding_model || "未设置，只用关键词" : "已关闭，只用关键词" }}</span></span>
        <el-button size="small" icon="el-icon-refresh-right" :loading="status.rebuilding" :disabled="!status.embedding_enabled || !status.embedding_model" @click="rebuild">重算向量</el-button>
      </div>
    </div>

    <div class="mem-layout">
      <aside class="zx-panel scope-list">
        <el-button type="primary" size="small" icon="el-icon-plus" class="full" @click="editMemory(null)">添加记忆</el-button>
        <button v-for="s in status.scopes" :key="scopeKey(s)" type="button" class="scope-item" :class="{ active: current && scopeKey(current) === scopeKey(s) }" @click="selectScope(s)">
          <span>{{ scopeName(s) }}</span>
          <small class="muted">{{ s.count }} 条</small>
        </button>
        <p v-if="!status.scopes.length" class="muted">还没有记忆。</p>
        <small v-if="status.archived" class="muted">另有 {{ status.archived }} 条已归档</small>
      </aside>

      <section v-if="current" class="zx-panel mem-detail">
        <div class="zx-section-heading">
          <div><h2>{{ scopeName(current) }}</h2><p>共 {{ total }} 条{{ archived ? "已归档的" : "" }}记忆</p></div>
          <div class="heading-actions">
            <el-input v-model="query" size="small" clearable placeholder="搜索内容" class="search" @change="load(1)" />
            <el-select v-model="source" size="small" clearable placeholder="全部来源" class="filter" @change="load(1)"><el-option v-for="(label, value) in sourceNames" :key="value" :label="label" :value="value" /></el-select>
            <el-checkbox v-model="archived" @change="load(1)">已归档</el-checkbox>
          </div>
        </div>
        <div v-loading="loading" class="memories">
          <p v-if="!items.length" class="muted">没有符合条件的记忆。</p>
          <div v-for="m in items" :key="m.id" class="memory">
            <div class="memory-head">
              <strong>#{{ m.id }}</strong>
              <small class="muted">{{ formatTime(m.created_at) }} · {{ sourceNames[m.source] || m.source }} · 重要度 {{ m.importance.toFixed(2) }} · 召回 {{ m.access_count }} 次<template v-if="!m.has_vector"> · 无向量</template></small>
              <span class="actions">
                <el-button type="text" size="mini" @click="editMemory(m)">编辑</el-button>
                <el-button type="text" size="mini" @click="toggleArchive(m)">{{ m.archived ? "恢复" : "归档" }}</el-button>
                <el-button type="text" size="mini" class="danger" @click="remove(m)">删除</el-button>
              </span>
            </div>
            <p class="wrap">{{ m.content }}</p>
            <ul v-if="m.facts.length" class="facts"><li v-for="fact in m.facts" :key="fact">{{ fact }}</li></ul>
            <div v-if="m.topics.length || m.participants.length" class="tags">
              <el-tag v-for="tag in m.topics" :key="`t-${tag}`" size="mini">{{ tag }}</el-tag>
              <el-tag v-for="p in m.participants" :key="`p-${p}`" size="mini" type="info">{{ p }}</el-tag>
            </div>
          </div>
        </div>
        <el-pagination v-if="total > pageSize" layout="prev, pager, next" :page-size="pageSize" :total="total" :current-page.sync="page" small @current-change="load" />

        <div class="zx-section-heading recall-heading">
          <div><h2>召回测试</h2><p>按 AI 对话时的方式召回这个{{ current.group_id ? "群" : "用户" }}的记忆，不会加深记忆。</p></div>
          <div class="heading-actions">
            <el-input v-model="recallQuery" size="small" placeholder="输入一句聊天内容" class="query" @keyup.enter.native="recall" />
            <el-button size="small" type="primary" :loading="recalling" :disabled="!recallQuery.trim()" @click="recall">召回</el-button>
          </div>
        </div>
        <p v-if="recalled && !recalled.length" class="muted">没有召回到记忆。</p>
        <div v-for="h in recalled || []" :key="`r-${h.id}`" class="hit">
          <div class="memory-head"><strong>#{{ h.id }}</strong><small class="muted">分数 {{ h.score }} · 重要度 {{ h.importance.toFixed(2) }}</small></div>
          <p class="wrap">{{ h.content }}</p>
        </div>
      </section>
      <section v-else class="zx-panel"><p class="muted">从左侧选择一个群或用户查看记忆。</p></section>
    </div>

    <el-dialog :title="form.id ? `编辑记忆 #${form.id}` : '添加记忆'" :visible.sync="form.visible" width="560px" append-to-body>
      <el-form label-width="90px" size="small" @submit.native.prevent>
        <template v-if="!form.id">
          <el-form-item label="范围">
            <el-radio-group v-model="form.kind"><el-radio label="group">群</el-radio><el-radio label="user">私聊用户</el-radio></el-radio-group>
          </el-form-item>
          <el-form-item :label="form.kind === 'group' ? '群号' : '用户 id'"><el-input v-model="form.target" maxlength="255" /></el-form-item>
        </template>
        <el-form-item label="内容"><el-input v-model="form.content" type="textarea" :rows="5" maxlength="2000" show-word-limit placeholder="用第一人称写，提到别人时写名字加 QQ 号" /></el-form-item>
        <el-form-item label="要点"><el-select v-model="form.facts" multiple filterable allow-create default-first-option :multiple-limit="20" placeholder="一句话一条，输入后回车" class="full" /></el-form-item>
        <el-form-item label="话题"><el-select v-model="form.topics" multiple filterable allow-create default-first-option :multiple-limit="10" placeholder="输入后回车" class="full" /></el-form-item>
        <el-form-item label="重要度"><el-slider v-model="form.importance" :min="0" :max="1" :step="0.05" show-input :show-input-controls="false" input-size="mini" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="form.visible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="form.saving" :disabled="!form.content.trim() || (!form.id && !form.target.trim())" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { apiErrorDetail } from "@/utils/api-error"

const QUIET = { suppressErrorToast: true }

export default {
  name: "AIMemory",
  data() {
    return {
      status: { mode: "off", rebuilding: false, embedding_enabled: true, embedding_model: "", scopes: [], archived: 0 },
      switching: false,
      current: null, items: [], total: 0, page: 1, pageSize: 50, loading: false,
      query: "", source: "", archived: false,
      recallQuery: "", recalled: null, recalling: false,
      form: { visible: false, saving: false, id: null, kind: "group", target: "", content: "", facts: [], topics: [], importance: 0.6, archived: false },
      modeNames: { off: "未开启", inject: "自动召回", tool: "按需召回" },
      sourceNames: { auto: "自动整理", tool: "AI 记下", webui: "手动添加" },
    }
  },
  mounted() { this.loadStatus() },
  methods: {
    async request(method, url, data) {
      const response = await this[`${method}Request`](`${this.$root.prefix}/ai${url}`, data, QUIET)
      if (!response.suc) throw new Error(response.info)
      return response
    },
    fail(error, fallback) { this.$message.error(apiErrorDetail(error, fallback)) },
    formatTime(value) { return value ? new Date(value).toLocaleString() : "" },
    scopeKey(s) { return s.group_id ? `g:${s.group_id}` : `u:${s.user_id}` },
    scopeName(s) { return s.group_id ? `群 ${s.group_id}` : `私聊 ${s.user_id}` },
    scopeParams(s) { return s.group_id ? { group_id: s.group_id } : { user_id: s.user_id } },
    /**
     * 加载记忆概况，保持当前选中的范围
     */
    async loadStatus() {
      try {
        this.status = (await this.request("get", "/memory/status")).data
        if (this.current) return
        if (this.status.scopes.length) await this.selectScope(this.status.scopes[0])
      } catch (error) { this.fail(error, "长期记忆加载失败。") }
    },
    async selectScope(s) {
      this.current = s
      this.recalled = null
      await this.load(1)
    },
    /**
     * 按筛选条件加载当前范围的记忆
     * @param {number} page 页码
     */
    async load(page) {
      if (!this.current) return
      this.page = page || this.page
      this.loading = true
      try {
        const params = { ...this.scopeParams(this.current), query: this.query || undefined, source: this.source || undefined, archived: this.archived, page: this.page }
        const data = (await this.request("get", "/memory/items", params)).data
        this.items = data.items
        this.total = data.total
        this.pageSize = data.page_size
      } catch (error) { this.fail(error, "记忆加载失败。") } finally { this.loading = false }
    },
    async refresh() {
      await this.loadStatus()
      await this.load()
    },
    editMemory(m) {
      const scope = this.current || {}
      this.form = m
        ? { visible: true, saving: false, id: m.id, kind: "group", target: "", content: m.content, facts: [...m.facts], topics: [...m.topics], importance: m.importance, archived: m.archived }
        : { visible: true, saving: false, id: null, kind: scope.user_id ? "user" : "group", target: scope.group_id || scope.user_id || "", content: "", facts: [], topics: [], importance: 0.6, archived: false }
    },
    async save() {
      const form = this.form
      form.saving = true
      const body = { content: form.content.trim(), facts: form.facts, topics: form.topics, importance: form.importance }
      try {
        if (form.id) {
          this.$message.success((await this.request("put", `/memory/items/${form.id}`, { ...body, archived: form.archived })).info)
        } else {
          const scope = form.kind === "group" ? { group_id: form.target.trim() } : { user_id: form.target.trim() }
          this.$message.success((await this.request("post", "/memory/items", { ...body, ...scope })).info)
          this.current = { ...scope, count: 0 }
        }
        form.visible = false
        await this.refresh()
      } catch (error) { this.fail(error, "保存失败。") } finally { form.saving = false }
    },
    async toggleArchive(m) {
      try {
        const body = { content: m.content, facts: m.facts, topics: m.topics, importance: m.importance, archived: !m.archived }
        await this.request("put", `/memory/items/${m.id}`, body)
        this.$message.success(m.archived ? "已恢复。" : "已归档。")
        await this.refresh()
      } catch (error) { this.fail(error, "操作失败。") }
    },
    async remove(m) {
      try { await this.$confirm(`删除记忆 #${m.id}？删除后无法恢复，只想让 AI 不再想起可以归档。`, "删除记忆", { type: "warning" }) } catch (error) { return }
      try {
        this.$message.success((await this.request("delete", `/memory/items/${m.id}`)).info)
        await this.refresh()
      } catch (error) { this.fail(error, "删除失败。") }
    },
    async recall() {
      this.recalling = true
      try {
        this.recalled = (await this.request("post", "/memory/recall", { ...this.scopeParams(this.current), query: this.recallQuery.trim() })).data
      } catch (error) { this.fail(error, "召回失败。") } finally { this.recalling = false }
    },
    async toggleEmbedding(enabled) {
      this.switching = true
      try {
        this.$message.success((await this.request("put", "/memory/embedding", { enabled })).info)
        await this.loadStatus()
      } catch (error) { this.fail(error, "切换失败。") } finally { this.switching = false }
    },
    async rebuild() {
      try { await this.$confirm("用当前的向量模型重算全部记忆的向量？更换向量模型后需要重算。", "重算向量", { type: "warning" }) } catch (error) { return }
      try {
        this.$message.success((await this.request("post", "/memory/rebuild")).info)
        this.status.rebuilding = true
        setTimeout(() => this.loadStatus(), 3000)
      } catch (error) { this.fail(error, "重算失败。") }
    },
  },
}
</script>

<style scoped>
.heading-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ai-memory > .zx-section-heading { flex-wrap: wrap; align-items: flex-start; }
.ai-memory > .zx-section-heading > div:first-child { flex: 1 1 480px; min-width: 0; }
.ai-memory > .zx-section-heading > .heading-actions { flex: 0 1 auto; justify-content: flex-end; min-width: 0; }
.embedding-switch { display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
.embedding-model { min-width: 0; max-width: 340px; overflow-wrap: anywhere; }
.full { width: 100%; }
.wrap { margin: 4px 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.mono { font-family: var(--font-mono, monospace); overflow-wrap: anywhere; }
.muted { color: var(--text-color-secondary, #909399); }
.danger { color: var(--danger-color); }
.search { width: 180px; }
.filter { width: 120px; }
.query { width: 360px; max-width: 100%; }
.mem-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 14px; align-items: start; }
.scope-list { display: flex; flex-direction: column; gap: 6px; }
.scope-list .full { margin-bottom: 6px; }
.scope-item { display: flex; justify-content: space-between; gap: 8px; padding: 10px 12px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--text-color); text-align: left; cursor: pointer; }
.scope-item:hover { background: var(--bg-color-hover); }
.scope-item.active { border-color: var(--primary-color); background: var(--bg-color-hover); }
.memories { min-height: 80px; }
.memory, .hit { padding: 10px 0; border-bottom: 1px solid var(--border-color-light); font-size: 13px; }
.memory-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.memory-head .actions { margin-left: auto; }
.memory-head .el-button + .el-button { margin-left: 8px; }
.facts { margin: 4px 0; padding-left: 20px; color: var(--text-color-secondary, #909399); }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.recall-heading { margin-top: 20px; }
.el-pagination { margin-top: 12px; text-align: right; }
@media (max-width: 900px) { .mem-layout { grid-template-columns: 1fr; } }
</style>
