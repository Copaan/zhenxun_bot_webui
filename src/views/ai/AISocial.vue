<template>
  <div class="ai-social">
    <div class="zx-section-heading">
      <div>
        <h2>表情库</h2>
        <p>AI 会收藏群里的表情包并在合适时发送，开启“偷表情”后还会自动收集；也可以手动上传 png / jpg / gif / webp（单张不超过 2MB）。备注和适用场合写得越准，AI 用得越恰当；没有备注的可在“聊天设置”中开启自动补写。共 {{ total }}<template v-if="stickerLimit"> / {{ stickerLimit }}</template> 个<template v-if="blocked">，{{ blocked }} 张设为不再收集（<el-button type="text" size="mini" @click="clearBlocks">清空</el-button>）</template>。</p>
      </div>
      <div class="heading-actions">
        <el-input v-model="stickerQuery" size="small" clearable placeholder="搜索备注、标签、场合" class="search" @change="resetStickerPage" />
        <el-select v-model="source" size="small" clearable placeholder="全部来源" class="filter" @change="resetStickerPage"><el-option v-for="(label, value) in sourceNames" :key="value" :label="label" :value="value" /></el-select>
        <el-select v-model="sort" size="small" class="filter" :disabled="!!stickerQuery" @change="resetStickerPage"><el-option v-for="(label, value) in sortNames" :key="value" :label="label" :value="value" /></el-select>
        <el-button size="small" icon="el-icon-download" :loading="importing" @click="importQQ">从 QQ 收藏导入</el-button>
        <el-button size="small" icon="el-icon-upload2" :loading="uploading" @click="$refs.file.click()">上传</el-button>
        <input ref="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="file-input" @change="upload" />
      </div>
    </div>
    <div v-if="stickers.length" class="batch-bar">
      <el-checkbox :value="allSelected" :indeterminate="selected.length > 0 && !allSelected" @change="toggleAll">全选</el-checkbox>
      <span class="muted">已选 {{ selected.length }} 个</span>
      <el-button size="mini" :disabled="selected.length < 2" @click="openMerge">合并</el-button>
      <el-button size="mini" :disabled="!selected.length" @click="removeSelected(false)">删除</el-button>
      <el-button size="mini" type="danger" plain :disabled="!selected.length" @click="removeSelected(true)">删除并不再收集</el-button>
    </div>
    <div v-loading="stickerLoading" class="sticker-grid">
      <p v-if="!stickers.length" class="muted">{{ stickerQuery || source ? "没有符合条件的表情。" : "表情库是空的。" }}</p>
      <div v-for="s in stickers" :key="s.id" class="sticker-card" :class="{ picked: selected.includes(s.id) }">
        <el-checkbox :value="selected.includes(s.id)" class="pick" :aria-label="`选择表情 ${s.id}`" @change="toggle(s.id)" />
        <button type="button" class="thumb" :title="`预览表情 #${s.id}`" @click="preview(s)"><img v-if="s.thumb" :src="s.thumb" loading="lazy" decoding="async" :alt="s.remark || `表情 ${s.id}`" /></button>
        <div class="sticker-info">
          <strong>#{{ s.id }} {{ s.remark || "无备注" }}</strong>
          <div v-if="s.tags.length" class="tags"><el-tag v-for="tag in s.tags" :key="tag" size="mini" type="info">{{ tag }}</el-tag></div>
          <small v-if="s.usage" class="muted wrap">适合：{{ s.usage }}</small>
          <small class="muted">{{ sourceNames[s.source] || s.source }}<template v-if="s.group_id"> · 群 {{ s.group_id }}</template> · 用过 {{ s.use_count }} 次</small>
        </div>
        <div class="sticker-actions">
          <el-button type="text" size="mini" @click="editSticker(s)">编辑</el-button>
          <el-button type="text" size="mini" class="danger" @click="removeSticker(s)">删除</el-button>
        </div>
      </div>
    </div>

    <el-pagination v-if="matchedTotal" :current-page="page" :page-size="pageSize" :total="matchedTotal" layout="prev, pager, next" @current-change="changeStickerPage" />

    <el-dialog title="编辑表情" :visible.sync="stickerForm.visible" width="520px" append-to-body>
      <el-form label-width="90px" size="small" @submit.native.prevent>
        <el-form-item label="备注"><el-input v-model="stickerForm.remark" maxlength="64" show-word-limit placeholder="表情的意思" /></el-form-item>
        <el-form-item label="标签">
          <el-select v-model="stickerForm.tags" multiple filterable allow-create default-first-option :multiple-limit="10" placeholder="输入后回车" class="full" />
        </el-form-item>
        <el-form-item label="适用场合"><el-input v-model="stickerForm.usage" type="textarea" :rows="2" maxlength="255" show-word-limit /></el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="stickerForm.visible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="stickerForm.saving" @click="saveSticker">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog title="合并表情" :visible.sync="mergeForm.visible" width="520px" append-to-body>
      <p class="muted">选一个保留，其余的标签并入它、使用次数相加，然后删除并设为不再收集。</p>
      <el-radio-group v-model="mergeForm.keep" class="merge-list">
        <el-radio v-for="s in selectedStickers" :key="s.id" :label="s.id" class="merge-item"><img v-if="s.thumb" :src="s.thumb" loading="lazy" decoding="async" :alt="s.remark || `表情 ${s.id}`" />#{{ s.id }} {{ s.remark || "无备注" }}</el-radio>
      </el-radio-group>
      <template #footer>
        <el-button size="small" @click="mergeForm.visible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="mergeForm.saving" @click="merge">合并</el-button>
      </template>
    </el-dialog>

    <el-dialog :title="previewing.title" :visible.sync="previewing.visible" width="420px" append-to-body>
      <div v-loading="previewing.loading" class="preview"><img v-if="previewing.src" :src="previewing.src" :alt="previewing.title" /></div>
    </el-dialog>
  </div>
</template>

<script>
import { apiErrorDetail } from "@/utils/api-error"

const QUIET = { suppressErrorToast: true }
const MAX_BYTES = 2 * 1024 * 1024

export default {
  name: "AISocial",
  data() {
    return {
      stickerLoading: false, uploading: false, importing: false, stickers: [], stickerLimit: 0, stickerQuery: "",
      page: 1, pageSize: 30, matchedTotal: 0, listRequest: 0, destroyed: false,
      total: 0, blocked: 0, source: "", sort: "used", selected: [],
      stickerForm: { visible: false, saving: false, id: null, remark: "", tags: [], usage: "" },
      mergeForm: { visible: false, saving: false, keep: null },
      previewing: { visible: false, loading: false, title: "", src: "" },
      sourceNames: { ai: "AI 收藏", steal: "偷表情", webui: "WebUI", qq: "QQ 收藏" },
      sortNames: { used: "最常用", new: "最新收藏", recent: "最近使用" },
    }
  },
  computed: {
    allSelected() { return this.stickers.length > 0 && this.selected.length === this.stickers.length },
    selectedStickers() { return this.stickers.filter((s) => this.selected.includes(s.id)) },
  },
  mounted() { this.loadStickers() },
  beforeDestroy() { this.destroyed = true; this.listRequest += 1 },
  methods: {
    async request(method, url, data) {
      const response = await this[`${method}Request`](`${this.$root.prefix}/ai${url}`, data, QUIET)
      if (!response.suc) throw new Error(response.info)
      return response
    },
    fail(error, fallback) { this.$message.error(apiErrorDetail(error, fallback)) },
    /**
     * 按关键词、来源和排序加载表情，并去掉已不在列表中的选择
     */
    resetStickerPage() { this.page = 1; this.selected = []; return this.loadStickers() },
    changeStickerPage(page) { this.page = page; this.selected = []; return this.loadStickers() },
    async loadStickers() {
      if (this.destroyed) return
      const request = ++this.listRequest
      this.stickerLoading = true
      try {
        const response = await this.request("get", "/chat/stickers", { query: this.stickerQuery || undefined, source: this.source || undefined, sort: this.sort, page: this.page, page_size: this.pageSize })
        if (this.destroyed || request !== this.listRequest) return
        const data = response.data
        this.matchedTotal = data.matched_total
        const lastPage = Math.max(1, Math.ceil(data.matched_total / this.pageSize))
        if (this.page > lastPage) { this.page = lastPage; return this.loadStickers() }
        this.stickers = data.items
        this.stickerLimit = data.limit
        this.total = data.total
        this.blocked = data.blocked
        const ids = new Set(data.items.map((s) => s.id))
        this.selected = this.selected.filter((id) => ids.has(id))
      } catch (error) {
        if (!this.destroyed && request === this.listRequest) this.fail(error, "表情库加载失败。")
      } finally {
        if (!this.destroyed && request === this.listRequest) this.stickerLoading = false
      }
    },
    toggle(id) {
      this.selected = this.selected.includes(id) ? this.selected.filter((item) => item !== id) : [...this.selected, id]
    },
    toggleAll(value) { this.selected = value ? this.stickers.map((s) => s.id) : [] },
    /**
     * 读取选中的图片并上传到表情库，成功后打开编辑框补充备注
     * @param {Event} event 文件选择事件
     */
    async upload(event) {
      const file = event.target.files[0]
      event.target.value = ""
      if (!file) return
      if (file.size > MAX_BYTES) { this.$message.warning("图片超过 2MB。"); return }
      this.uploading = true
      try {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
        const response = await this.request("post", "/chat/stickers", { data, remark: file.name.replace(/\.[^.]+$/, "").slice(0, 64) })
        this.$message.success(response.info)
        await this.loadStickers()
        this.editSticker(response.data)
      } catch (error) { this.fail(error, "上传失败。") } finally { this.uploading = false }
    },
    async importQQ() {
      this.importing = true
      try {
        this.$message.success((await this.request("post", "/chat/stickers/import_qq")).info)
        await this.loadStickers()
      } catch (error) { this.fail(error, "导入失败。") } finally { this.importing = false }
    },
    /**
     * 打开大图预览
     * @param {object} s 表情
     */
    async preview(s) {
      this.previewing = { visible: true, loading: true, title: `#${s.id} ${s.remark || "无备注"}`, src: s.thumb }
      try { this.previewing.src = (await this.request("get", `/chat/stickers/${s.id}/image`)).data }
      catch (error) { this.fail(error, "图片加载失败。") } finally { this.previewing.loading = false }
    },
    editSticker(s) {
      this.stickerForm = { visible: true, saving: false, id: s.id, remark: s.remark, tags: [...s.tags], usage: s.usage }
    },
    async saveSticker() {
      const form = this.stickerForm
      form.saving = true
      try {
        const tags = form.tags.map((tag) => tag.trim().slice(0, 16)).filter(Boolean)
        this.$message.success((await this.request("put", `/chat/stickers/${form.id}`, { remark: form.remark, tags, usage: form.usage })).info)
        form.visible = false
        await this.loadStickers()
      } catch (error) { this.fail(error, "保存失败。") } finally { form.saving = false }
    },
    async removeSticker(s) {
      try { await this.$confirm(`删除表情 #${s.id}${s.remark ? `“${s.remark}”` : ""}？图片文件会一并删除。`, "删除表情", { type: "warning" }) } catch (error) { return }
      try {
        this.$message.success((await this.request("delete", `/chat/stickers/${s.id}`)).info)
        await this.loadStickers()
      } catch (error) { this.fail(error, "删除失败。") }
    },
    /**
     * 删除选中的表情，block 为真时同时设为不再收集
     * @param {boolean} block 是否不再收集
     */
    async removeSelected(block) {
      const count = this.selected.length
      const note = block ? "之后 AI 和偷表情都不会再收藏这些图片，手动上传可解除。" : "图片文件会一并删除。"
      try { await this.$confirm(`删除选中的 ${count} 个表情？${note}`, block ? "删除并不再收集" : "批量删除", { type: "warning" }) } catch (error) { return }
      try {
        this.$message.success((await this.request("post", "/chat/stickers/delete", { ids: this.selected, block })).info)
        this.selected = []
        await this.loadStickers()
      } catch (error) { this.fail(error, "删除失败。") }
    },
    openMerge() {
      const keep = [...this.selectedStickers].sort((a, b) => b.use_count - a.use_count)[0]
      this.mergeForm = { visible: true, saving: false, keep: keep ? keep.id : null }
    },
    async merge() {
      const form = this.mergeForm
      form.saving = true
      try {
        const others = this.selected.filter((id) => id !== form.keep)
        this.$message.success((await this.request("post", "/chat/stickers/merge", { keep_id: form.keep, other_ids: others })).info)
        form.visible = false
        this.selected = []
        await this.loadStickers()
      } catch (error) { this.fail(error, "合并失败。") } finally { form.saving = false }
    },
    async clearBlocks() {
      try { await this.$confirm(`清空 ${this.blocked} 条不再收集记录？之后这些图片可以再次被收藏。`, "清空不再收集", { type: "warning" }) } catch (error) { return }
      try {
        this.$message.success((await this.request("delete", "/chat/stickers/blocked")).info)
        await this.loadStickers()
      } catch (error) { this.fail(error, "清空失败。") }
    },
  },
}
</script>

<style scoped>
.heading-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.search { width: 180px; }
.filter { width: 120px; }
.full { width: 100%; }
.wrap { overflow-wrap: anywhere; white-space: pre-wrap; }
.muted { color: var(--text-color-secondary, #909399); }
.danger { color: var(--danger-color); }
.file-input { display: none; }
.batch-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; }
.batch-bar .el-button + .el-button { margin-left: 0; }
.sticker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 12px; min-height: 60px; }
.sticker-card { position: relative; display: flex; gap: 12px; padding: 10px; border: 1px solid var(--border-color-light); border-radius: 8px; background: var(--bg-color-secondary); transition: border-color 0.2s; }
.sticker-card.picked { border-color: var(--primary-color, #409eff); }
.pick { position: absolute; top: 6px; left: 8px; z-index: 1; }
.thumb { flex: none; display: flex; align-items: center; justify-content: center; width: 80px; height: 80px; padding: 0; border: 0; border-radius: 6px; background: var(--bg-color); overflow: hidden; cursor: zoom-in; }
.thumb:focus-visible { outline: 2px solid var(--primary-color, #409eff); outline-offset: 2px; }
.thumb img { max-width: 100%; max-height: 100%; }
.sticker-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.sticker-info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.sticker-actions { display: flex; flex-direction: column; align-items: flex-end; }
.sticker-actions .el-button + .el-button { margin-left: 0; }
.merge-list { display: flex; flex-direction: column; gap: 8px; }
.merge-item { display: flex; align-items: center; margin-right: 0; }
.merge-item img { width: 40px; height: 40px; object-fit: contain; margin-right: 8px; vertical-align: middle; }
.preview { display: flex; align-items: center; justify-content: center; min-height: 160px; }
.preview img { max-width: 100%; max-height: 60vh; }
</style>
