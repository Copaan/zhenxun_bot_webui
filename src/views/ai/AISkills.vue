<template>
  <div class="ai-skills">
    <div class="zx-section-heading">
      <div>
        <h2>技能</h2>
        <p>技能是一份 SKILL.md 说明（可附带脚本），AI 遇到相关任务时读取并照着做；人设可以只使用其中一部分。上传 SKILL.md 或 zip 包（不超过 5MB），同名技能会被替换；附带的脚本只有超级用户在沙箱中能运行。</p>
      </div>
      <div class="heading-actions">
        <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button size="small" type="primary" icon="el-icon-upload2" :loading="uploading" @click="$refs.file.click()">上传</el-button>
        <input ref="file" type="file" accept=".md,.zip" class="file-input" @change="upload" />
      </div>
    </div>
    <el-table v-loading="loading" :data="skills" size="small" empty-text="还没有技能。">
      <el-table-column label="启用" width="70"><template #default="{ row }"><el-switch v-model="row.enabled" @change="toggle(row)" /></template></el-table-column>
      <el-table-column label="名称" prop="name" width="180" />
      <el-table-column label="说明" min-width="260"><template #default="{ row }"><span class="wrap">{{ row.description }}</span></template></el-table-column>
      <el-table-column label="附带文件" min-width="180"><template #default="{ row }"><small class="muted wrap">{{ row.files.length ? row.files.join("、") : "无" }}</small></template></el-table-column>
      <el-table-column label="操作" width="80"><template #default="{ row }"><el-button type="text" size="mini" class="danger" @click="remove(row)">删除</el-button></template></el-table-column>
    </el-table>
  </div>
</template>

<script>
import { apiErrorDetail } from "@/utils/api-error"

const QUIET = { suppressErrorToast: true }
const MAX_BYTES = 5 * 1024 * 1024

export default {
  name: "AISkills",
  data() {
    return { loading: false, uploading: false, skills: [] }
  },
  mounted() { this.load() },
  methods: {
    async request(method, url, data) {
      const response = await this[`${method}Request`](`${this.$root.prefix}/ai${url}`, data, QUIET)
      if (!response.suc) throw new Error(response.info)
      return response
    },
    fail(error, fallback) { this.$message.error(apiErrorDetail(error, fallback)) },
    async load() {
      this.loading = true
      try { this.skills = (await this.request("get", "/chat/skills")).data } catch (error) { this.fail(error, "技能加载失败。") } finally { this.loading = false }
    },
    /**
     * 读取选中的 SKILL.md 或 zip 并上传安装
     * @param {Event} event 文件选择事件
     */
    async upload(event) {
      const file = event.target.files[0]
      event.target.value = ""
      if (!file) return
      if (file.size > MAX_BYTES) { this.$message.warning("文件超过 5MB。"); return }
      this.uploading = true
      try {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
        this.$message.success((await this.request("post", "/chat/skills", { filename: file.name, data })).info)
        await this.load()
      } catch (error) { this.fail(error, "上传失败。") } finally { this.uploading = false }
    },
    async toggle(row) {
      try { this.$message.success((await this.request("put", `/chat/skills/${encodeURIComponent(row.name)}`, { enabled: row.enabled })).info) } catch (error) {
        row.enabled = !row.enabled
        this.fail(error, "保存失败。")
      }
    },
    async remove(row) {
      try { await this.$confirm(`删除技能“${row.name}”？技能目录会一并删除。`, "删除技能", { type: "warning" }) } catch (error) { return }
      try {
        this.$message.success((await this.request("delete", `/chat/skills/${encodeURIComponent(row.name)}`)).info)
        await this.load()
      } catch (error) { this.fail(error, "删除失败。") }
    },
  },
}
</script>

<style scoped>
.heading-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.wrap { overflow-wrap: anywhere; white-space: pre-wrap; }
.muted { color: var(--text-color-secondary, #909399); }
.danger { color: var(--danger-color); }
.file-input { display: none; }
</style>
