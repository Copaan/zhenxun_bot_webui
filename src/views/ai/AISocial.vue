<template>
  <div class="ai-social">
    <div class="zx-section-heading">
      <div>
        <h2>表情库</h2>
        <p>AI 会收藏群里的表情包并在合适时发送，也可以手动上传 png / jpg / gif / webp（单张不超过 2MB）。备注和适用场合写得越准，AI 用得越恰当；没有备注的可在“聊天设置”中开启自动补写。共 {{ stickers.length }}<template v-if="stickerLimit"> / {{ stickerLimit }}</template> 个。</p>
      </div>
      <div class="heading-actions">
        <el-input v-model="stickerQuery" size="small" clearable placeholder="搜索备注、标签、场合" class="search" @change="loadStickers" />
        <el-button size="small" icon="el-icon-download" :loading="importing" @click="importQQ">从 QQ 收藏导入</el-button>
        <el-button size="small" icon="el-icon-upload2" :loading="uploading" @click="$refs.file.click()">上传</el-button>
        <input ref="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="file-input" @change="upload" />
      </div>
    </div>
    <div v-loading="stickerLoading" class="sticker-grid">
      <p v-if="!stickers.length" class="muted">表情库是空的。</p>
      <div v-for="s in stickers" :key="s.id" class="sticker-card">
        <div class="thumb"><img v-if="s.thumb" :src="s.thumb" :alt="s.remark || `表情 ${s.id}`" /></div>
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
      stickerForm: { visible: false, saving: false, id: null, remark: "", tags: [], usage: "" },
      sourceNames: { ai: "AI", webui: "WebUI", qq: "QQ 收藏" },
    }
  },
  mounted() { this.loadStickers() },
  methods: {
    async request(method, url, data) {
      const response = await this[`${method}Request`](`${this.$root.prefix}/ai${url}`, data, QUIET)
      if (!response.suc) throw new Error(response.info)
      return response
    },
    fail(error, fallback) { this.$message.error(apiErrorDetail(error, fallback)) },
    async loadStickers() {
      this.stickerLoading = true
      try {
        const response = await this.request("get", "/chat/stickers", { query: this.stickerQuery || undefined })
        this.stickers = response.data.items
        this.stickerLimit = response.data.limit
      } catch (error) { this.fail(error, "表情库加载失败。") } finally { this.stickerLoading = false }
    },
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
  },
}
</script>

<style scoped>
.heading-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.search { width: 180px; }
.full { width: 100%; }
.wrap { overflow-wrap: anywhere; white-space: pre-wrap; }
.muted { color: var(--text-color-secondary, #909399); }
.danger { color: var(--danger-color); }
.file-input { display: none; }
.sticker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; min-height: 60px; }
.sticker-card { display: flex; gap: 12px; padding: 10px; border: 1px solid var(--border-color-light); border-radius: 8px; background: var(--bg-color-secondary); }
.thumb { flex: none; display: flex; align-items: center; justify-content: center; width: 80px; height: 80px; border-radius: 6px; background: var(--bg-color); overflow: hidden; }
.thumb img { max-width: 100%; max-height: 100%; }
.sticker-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.sticker-info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.sticker-actions { display: flex; flex-direction: column; align-items: flex-end; }
.sticker-actions .el-button + .el-button { margin-left: 0; }
</style>
