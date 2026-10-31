<template>
  <div class="ai-knowledge">
    <div class="zx-section-heading">
      <div>
        <h2>知识库</h2>
        <p>上传文档后自动建立索引，AI 对话时检索相关内容来回答。全局启用的知识库用于所有群和私聊，也可以在“按群设置”中为群单独指定；检索方式在“聊天设置”中选择。文档中的图片会生成描述，可被检索，也能由 AI 发到群里。</p>
      </div>
    </div>

    <div class="status-grid">
      <div class="zx-panel status-card">
        <strong>默认模型</strong>
        <div v-for="item in modelRows" :key="item.key" class="status-row">
          <span>{{ item.label }}</span>
          <span v-if="status.models[item.key]" class="mono">{{ status.models[item.key] }}</span>
          <span v-else :class="item.required ? 'danger' : 'muted'">{{ item.empty }}</span>
        </div>
        <el-button type="text" size="mini" @click="$router.push({ path: '/ai', query: { section: 'routing' } })">去设置默认模型</el-button>
      </div>
      <div v-for="c in status.components" :key="c.key" class="zx-panel status-card">
        <strong>{{ c.title }} <el-tag size="mini" :type="c.installed ? 'success' : 'info'">{{ c.installed ? "已安装" : "未安装" }}</el-tag></strong>
        <small class="muted">{{ c.description }}</small>
        <small class="mono muted">{{ c.packages.join(" ") }}</small>
        <el-button v-if="!c.installed" size="mini" icon="el-icon-download" @click="install(c)">安装</el-button>
      </div>
    </div>

    <div class="kb-layout">
      <aside class="zx-panel kb-list">
        <el-button type="primary" size="small" icon="el-icon-plus" class="full" :disabled="!status.models.embedding && !embeddingModels.length" @click="editBase(null)">新建知识库</el-button>
        <button v-for="kb in bases" :key="kb.id" type="button" class="kb-item" :class="{ active: current && current.id === kb.id }" @click="selectBase(kb)">
          <span>{{ kb.name }}</span>
          <small class="muted">{{ kb.docs }} 个文档<template v-if="kb.global"> · 全局</template><template v-if="kb.rebuilding"> · 重建中</template></small>
        </button>
        <p v-if="!bases.length" class="muted">还没有知识库。</p>
      </aside>

      <section v-if="current" class="zx-panel kb-detail">
        <div class="zx-section-heading">
          <div>
            <h2>{{ current.name }}</h2>
            <p>{{ current.description || "无说明（说明会告诉 AI 这个库里有什么，建议填写）" }}</p>
            <small class="muted mono">{{ current.embedding_model }}<template v-if="current.dimensions"> · {{ current.dimensions }} 维</template> · 分块 {{ current.chunk_size }} / 重叠 {{ current.chunk_overlap }} · 每次检索 {{ current.top_k }} 条</small>
          </div>
          <div class="heading-actions">
            <el-switch :value="current.global" active-text="全局启用" :disabled="busyGlobal" @change="setGlobal" />
            <el-button size="small" @click="editBase(current)">编辑</el-button>
            <el-button size="small" :loading="!!rebuilding" @click="rebuild">{{ rebuilding ? `重建中 ${rebuilding.done}/${rebuilding.total}` : "重建" }}</el-button>
            <el-button size="small" type="danger" plain @click="removeBase">删除</el-button>
          </div>
        </div>

        <div class="upload-row">
          <el-button size="small" type="primary" icon="el-icon-upload2" :loading="uploading" @click="$refs.file.click()">上传文档</el-button>
          <el-checkbox v-model="extractImages" size="small">提取 pdf / docx / pptx 中的图片（每张图调用一次视觉模型）</el-checkbox>
          <input ref="file" type="file" multiple :accept="status.types.join(',')" class="file-input" @change="upload" />
        </div>
        <small class="muted">支持 {{ status.types.join(" ") }}，单个文件不超过 30MB。</small>

        <el-table v-loading="docsLoading" :data="docs" size="small" empty-text="还没有文档" class="docs">
          <el-table-column label="文件" min-width="200"><template #default="{ row }"><span class="wrap">{{ row.filename }}</span></template></el-table-column>
          <el-table-column label="大小" width="90"><template #default="{ row }">{{ formatSize(row.size) }}</template></el-table-column>
          <el-table-column label="状态" min-width="160">
            <template #default="{ row }">
              <el-tag size="mini" :type="statusTypes[row.status]">{{ statusNames[row.status] }}</el-tag>
              <small v-if="row.status === 'ready'" class="muted"> {{ row.chunks }} 块</small>
              <div v-if="row.error" class="danger wrap">{{ row.error }}</div>
            </template>
          </el-table-column>
          <el-table-column label="上传时间" width="160"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button type="text" size="mini" :disabled="row.status !== 'ready'" @click="openChunks(row)">分块</el-button>
              <el-button type="text" size="mini" class="danger" @click="removeDoc(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="zx-section-heading search-heading"><div><h2>检索测试</h2><p>按对话中的检索方式查询当前知识库。</p></div></div>
        <div class="upload-row">
          <el-input v-model="query" size="small" clearable placeholder="输入问题或关键词" class="query" @keyup.enter.native="search" />
          <el-button size="small" :loading="searching" @click="search">检索</el-button>
        </div>
        <el-alert v-for="n in notices" :key="n" :title="n" type="warning" :closable="false" class="notice" />
        <div v-for="(hit, i) in hits" :key="hit.chunk_id" class="hit">
          <div class="hit-head"><strong>[{{ i + 1 }}] {{ hit.filename }}</strong><small class="muted mono">#{{ hit.chunk_id }} · {{ hit.score }}</small></div>
          <div class="hit-body"><img v-if="hit.thumb" :src="hit.thumb" alt="" class="hit-thumb" /><span class="wrap">{{ hit.content }}</span></div>
        </div>
        <p v-if="searched && !hits.length && !searching" class="muted">没有检索到结果。</p>
      </section>
    </div>

    <el-dialog :title="form.id ? '编辑知识库' : '新建知识库'" :visible.sync="form.visible" width="560px" append-to-body>
      <el-form label-width="110px" size="small" @submit.native.prevent>
        <el-form-item label="名称"><el-input v-model="form.name" maxlength="64" show-word-limit /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="这个库里有什么，AI 据此判断何时检索" /></el-form-item>
        <el-form-item label="embedding 模型">
          <el-select v-model="form.embedding_model" clearable filterable allow-create :placeholder="status.models.embedding ? `默认：${status.models.embedding}` : '请选择'" class="full"><el-option v-for="name in embeddingModels" :key="name" :label="name" :value="name" /></el-select>
          <small class="muted">更换模型或修改分块参数后会自动重建。</small>
        </el-form-item>
        <el-form-item label="分块大小"><el-input-number v-model="form.chunk_size" :min="100" :max="4000" :step="100" /></el-form-item>
        <el-form-item label="分块重叠"><el-input-number v-model="form.chunk_overlap" :min="0" :max="1000" :step="10" /></el-form-item>
        <el-form-item label="每次检索条数"><el-input-number v-model="form.top_k" :min="1" :max="20" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="form.visible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="form.saving" :disabled="!form.name.trim()" @click="saveBase">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog :title="`分块预览：${chunkDoc ? chunkDoc.filename : ''}`" :visible.sync="chunkVisible" width="min(820px, 94vw)" append-to-body>
      <div v-loading="chunkLoading" class="chunks">
        <div v-for="c in chunks" :key="c.id" class="hit">
          <div class="hit-head"><strong>第 {{ c.seq + 1 }} 块</strong><small class="muted mono">#{{ c.id }} · {{ c.content.length }} 字<template v-if="c.has_image_vector"> · 含图片向量</template><template v-if="!c.has_vector"> · 无向量</template></small></div>
          <div class="hit-body"><img v-if="c.thumb" :src="c.thumb" alt="" class="hit-thumb" /><span class="wrap">{{ c.content }}</span></div>
        </div>
      </div>
      <el-pagination v-if="chunkTotal > chunkSize" layout="prev, pager, next" :page-size="chunkSize" :total="chunkTotal" :current-page.sync="chunkPage" small @current-change="loadChunks" />
    </el-dialog>

    <ManualDependencyDialog :visible.sync="dependencyVisible" :packages="dependencyPackages" />
  </div>
</template>

<script>
import ManualDependencyDialog from "@/components/plugin/ManualDependencyDialog.vue"
import { apiErrorDetail } from "@/utils/api-error"
import { modelProfile } from "@/utils/ai-models"

const QUIET = { suppressErrorToast: true }
const MAX_BYTES = 30 * 1024 * 1024
const POLL_MS = 2000
const emptyForm = () => ({ visible: false, saving: false, id: null, name: "", description: "", embedding_model: "", chunk_size: 500, chunk_overlap: 50, top_k: 5 })

export default {
  name: "AIKnowledge",
  components: { ManualDependencyDialog },
  props: { providers: { type: Array, default: () => [] } },
  data() {
    return {
      status: { components: [], models: {}, types: [] },
      bases: [], current: null, docs: [], docsLoading: false, rebuilding: null,
      form: emptyForm(), uploading: false, extractImages: false,
      query: "", hits: [], notices: [], searching: false, searched: false,
      chunkVisible: false, chunkDoc: null, chunks: [], chunkTotal: 0, chunkPage: 1, chunkSize: 20, chunkLoading: false,
      dependencyVisible: false, dependencyPackages: [], busyGlobal: false,
      modelRows: [
        { key: "embedding", label: "向量嵌入", empty: "未设置（必需，或为知识库单独指定）", required: true },
        { key: "vision", label: "图片描述", empty: "未设置，使用默认对话模型（需支持图片）" },
        { key: "rerank", label: "文本重排", empty: "未设置，不重排" },
      ],
      statusNames: { pending: "等待处理", processing: "处理中", ready: "已就绪", failed: "失败" },
      statusTypes: { pending: "info", processing: "warning", ready: "success", failed: "danger" },
    }
  },
  computed: {
    embeddingModels() {
      return this.providers.flatMap((provider) => (provider.models || []).filter((model) => model.enabled !== false && modelProfile(model).tasks.includes("embedding")).map((model) => `${provider.name}/${model.name}`))
    },
    busy() { return Boolean(this.rebuilding) || this.docs.some((doc) => ["pending", "processing"].includes(doc.status)) },
  },
  mounted() {
    this.loadStatus()
    this.loadBases()
  },
  beforeDestroy() { clearTimeout(this.timer) },
  methods: {
    async request(method, url, data, config = {}) {
      const response = await this[`${method}Request`](`${this.$root.prefix}/ai${url}`, data, { ...QUIET, ...config })
      if (!response.suc) throw new Error(response.info)
      return response
    },
    fail(error, fallback) { this.$message.error(apiErrorDetail(error, fallback)) },
    formatTime(value) { return value ? new Date(value).toLocaleString() : "" },
    formatSize(size) { return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB` },
    async loadStatus() {
      try { this.status = (await this.request("get", "/knowledge/status")).data } catch (error) { this.fail(error, "知识库状态加载失败。") }
    },
    async loadBases() {
      try {
        this.bases = (await this.request("get", "/knowledge/bases")).data
        const current = this.current && this.bases.find((kb) => kb.id === this.current.id)
        if (current) this.current = current
        else if (this.bases.length) this.selectBase(this.bases[0])
        else this.current = null
      } catch (error) { this.fail(error, "知识库加载失败。") }
    },
    /**
     * 全局启用或取消全局启用当前知识库
     * @param {boolean} enabled 是否全局启用
     */
    async setGlobal(enabled) {
      this.busyGlobal = true
      try {
        const response = await this.request("put", `/knowledge/bases/${this.current.id}/global`, { enabled })
        this.$message.success(response.info); await this.loadBases()
      } catch (error) { this.fail(error, "设置失败。") }
      finally { this.busyGlobal = false }
    },
    selectBase(kb) {
      this.current = kb
      this.hits = []; this.notices = []; this.searched = false
      this.loadDocs(true)
    },
    /**
     * 加载当前知识库的文档，有文档在处理或正在重建时定时刷新
     * @param {boolean} loading 是否显示加载状态
     */
    async loadDocs(loading = false) {
      clearTimeout(this.timer)
      if (!this.current) return
      const id = this.current.id
      this.docsLoading = loading
      try {
        const { data } = await this.request("get", `/knowledge/bases/${id}/docs`)
        if (!this.current || this.current.id !== id) return
        const finished = this.busy
        this.docs = data.items
        this.rebuilding = data.rebuilding
        if (this.busy) this.timer = setTimeout(() => this.loadDocs(), POLL_MS)
        else if (finished) this.loadBases()
      } catch (error) { this.fail(error, "文档加载失败。") } finally { this.docsLoading = false }
    },
    editBase(kb) {
      this.form = kb
        ? { ...emptyForm(), visible: true, id: kb.id, name: kb.name, description: kb.description, embedding_model: kb.embedding_model || "", chunk_size: kb.chunk_size, chunk_overlap: kb.chunk_overlap, top_k: kb.top_k }
        : { ...emptyForm(), visible: true }
    },
    async saveBase() {
      const form = this.form
      if (form.chunk_overlap * 2 > form.chunk_size) { this.$message.warning("分块重叠不能超过分块大小的一半。"); return }
      form.saving = true
      try {
        const payload = { name: form.name.trim(), description: form.description, embedding_model: form.embedding_model || null, chunk_size: form.chunk_size, chunk_overlap: form.chunk_overlap, top_k: form.top_k }
        const response = form.id ? await this.request("put", `/knowledge/bases/${form.id}`, payload) : await this.request("post", "/knowledge/bases", payload)
        this.$message.success(response.info)
        form.visible = false
        this.current = response.data
        await this.loadBases()
        this.loadDocs()
      } catch (error) { this.fail(error, "保存失败。") } finally { form.saving = false }
    },
    async removeBase() {
      const kb = this.current
      try { await this.$confirm(`删除知识库“${kb.name}”？其中的文档、分块和图片会一并删除，并从全局与按群设置中移除。`, "删除知识库", { type: "warning" }) } catch (error) { return }
      try {
        this.$message.success((await this.request("delete", `/knowledge/bases/${kb.id}`)).info)
        this.current = null
        await this.loadBases()
      } catch (error) { this.fail(error, "删除失败。") }
    },
    async rebuild() {
      try {
        this.$message.success((await this.request("post", `/knowledge/bases/${this.current.id}/rebuild`, {})).info)
        this.loadDocs()
      } catch (error) { this.fail(error, "重建失败。") }
    },
    /**
     * 依次上传选中的文件，每个文件在后台处理
     * @param {Event} event 文件选择事件
     */
    async upload(event) {
      const files = [...event.target.files]
      event.target.value = ""
      if (!files.length) return
      this.uploading = true
      try {
        for (const file of files) {
          if (file.size > MAX_BYTES) { this.$message.warning(`${file.name} 超过 30MB，已跳过。`); continue }
          const data = new FormData()
          data.append("file", file)
          data.append("extract_images", this.extractImages ? "true" : "false")
          try { await this.request("post", `/knowledge/bases/${this.current.id}/docs`, data, { timeout: 0 }) } catch (error) { this.fail(error, `${file.name} 上传失败。`) }
        }
      } finally { this.uploading = false }
      this.loadDocs()
      this.loadBases()
    },
    async removeDoc(doc) {
      try { await this.$confirm(`删除文档“${doc.filename}”及其分块？`, "删除文档", { type: "warning" }) } catch (error) { return }
      try {
        this.$message.success((await this.request("delete", `/knowledge/docs/${doc.id}`)).info)
        await this.loadDocs()
        this.loadBases()
      } catch (error) { this.fail(error, "删除失败。") }
    },
    openChunks(doc) {
      this.chunkDoc = doc; this.chunkPage = 1; this.chunks = []; this.chunkVisible = true
      this.loadChunks()
    },
    async loadChunks() {
      this.chunkLoading = true
      try {
        const { data } = await this.request("get", `/knowledge/docs/${this.chunkDoc.id}/chunks`, { offset: (this.chunkPage - 1) * this.chunkSize, limit: this.chunkSize })
        this.chunks = data.items
        this.chunkTotal = data.total
      } catch (error) { this.fail(error, "分块加载失败。") } finally { this.chunkLoading = false }
    },
    async search() {
      if (!this.query.trim()) return
      this.searching = true
      try {
        const { data } = await this.request("post", "/knowledge/search", { kb_ids: [this.current.id], query: this.query.trim() })
        this.hits = data.items
        this.notices = data.notices
        this.searched = true
      } catch (error) { this.fail(error, "检索失败。") } finally { this.searching = false }
    },
    install(component) {
      this.dependencyPackages = [...component.packages]
      this.dependencyVisible = true
    },
  },
}
</script>

<style scoped>
.heading-actions, .upload-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.upload-row { margin: 8px 0 4px; }
.full { width: 100%; }
.wrap { overflow-wrap: anywhere; white-space: pre-wrap; }
.mono { font-family: var(--font-mono, monospace); overflow-wrap: anywhere; }
.muted { color: var(--text-color-secondary, #909399); }
.danger { color: var(--danger-color); }
.file-input { display: none; }
.status-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 14px; }
.status-card { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.status-row { display: flex; justify-content: space-between; gap: 12px; width: 100%; font-size: 13px; }
.kb-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 14px; align-items: start; }
.kb-list { display: flex; flex-direction: column; gap: 6px; }
.kb-list .full { margin-bottom: 6px; }
.kb-item { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--text-color); text-align: left; cursor: pointer; }
.kb-item:hover { background: var(--bg-color-hover); }
.kb-item.active { border-color: var(--primary-color); background: var(--bg-color-hover); }
.docs { margin-top: 8px; }
.search-heading { margin-top: 20px; }
.query { width: 360px; max-width: 100%; }
.notice { margin: 6px 0; }
.hit { padding: 10px 0; border-bottom: 1px solid var(--border-color-light); }
.hit-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.hit-body { display: flex; gap: 12px; align-items: flex-start; font-size: 13px; }
.hit-thumb { flex: none; width: 96px; border-radius: 6px; }
.chunks { min-height: 80px; max-height: 60vh; overflow: auto; }
@media (max-width: 900px) { .kb-layout { grid-template-columns: 1fr; } }
</style>
