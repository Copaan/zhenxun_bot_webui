<template>
  <el-dialog :title="`从备份恢复 · ${item ? item.name : ''}`" :visible="visible" custom-class="backup-dialog" top="5vh" width="min(600px, 94vw)" :close-on-click-modal="false" @close="$emit('close')">
    <template v-if="item && item.encrypted && !summary">
      <p class="backup-hint">这是加密备份，请输入导出时设置的密码。</p>
      <el-input v-model="password" type="password" show-password autocomplete="off" placeholder="备份密码" @keyup.enter.native="load" />
    </template>
    <p v-if="loading" role="status"><i class="el-icon-loading"></i> 正在读取备份…</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <template v-if="summary">
      <dl class="backup-summary">
        <dt>导出时间</dt><dd>{{ new Date(summary.created_at).toLocaleString() }}</dd>
        <dt>来源版本</dt><dd>{{ summary.bot_version || "未知" }} · Python {{ summary.python }} · {{ summary.platform }}</dd>
        <dt>数据库</dt><dd>{{ summary.database.dialect }} · {{ Object.keys(summary.database.tables).length }} 张表 · {{ totalRows }} 行</dd>
        <dt>文件</dt><dd>{{ summary.files }} 个</dd>
        <template v-if="summary.archive_summary"><dt>包体积</dt><dd>压缩 {{ formatBytes(summary.archive_summary.archive_bytes || summary.archive_summary.compressed_bytes) }} / 原始 {{ formatBytes(summary.archive_summary.raw_bytes) }}</dd></template>
        <dt>依赖</dt><dd>{{ summary.plugins.length }} 个 NoneBot 商店插件 · {{ summary.manual_requirements.length + summary.extra_requirements.length }} 项其他依赖<template v-if="(summary.unsupported_requirements || []).length"> · {{ summary.unsupported_requirements.length }} 项需手动安装</template></dd>
      </dl>
      <el-alert v-for="text in summary.warnings" :key="text" :title="text" type="warning" :closable="false" show-icon />
      <details v-if="summary.archive_summary">
        <summary>包体积分类</summary>
        <p v-for="(info, key) in summary.archive_summary.categories" :key="key" class="backup-hint">{{ labels[key] || key }}：{{ info.files }} 项，压缩 {{ formatBytes(info.compressed_bytes) }} / 原始 {{ formatBytes(info.raw_bytes) }}</p>
      </details>
      <h3>数据库恢复模式</h3>
      <el-radio-group v-model="restoreMode" class="restore-modes">
        <el-radio v-for="option in restoreModes" :key="option.value" :label="option.value">{{ option.label }}</el-radio>
      </el-radio-group>
      <p class="backup-hint">{{ modeHint }}</p>
      <template v-if="restoreMode === 'replace_database'">
        <el-checkbox v-model="backupBeforeReplace">清空前完整备份目标数据库</el-checkbox>
        <p v-if="backupBeforeReplace" class="backup-hint">{{ nativeRecoveryHint }}</p>
        <p v-if="!backupBeforeReplace" class="backup-warning">已关闭目标备份，清空后原数据可能无法自动恢复。</p>
      </template>
      <template v-else>
        <h3>导入的数据表</h3>
        <el-select v-model="includedTables" multiple filterable placeholder="选择需要导入的数据表" style="width: 100%">
          <el-option v-for="name in Object.keys(summary.database.tables)" :key="name" :label="name" :value="name" />
        </el-select>
      </template>
      <template v-if="restoreMode.startsWith('merge_')">
        <h3>旧包来源绑定（可选）</h3>
        <el-input v-model.trim="sourceBinding" maxlength="128" placeholder="同一旧实例的多个备份使用相同来源标识" />
        <p class="backup-hint">新包使用内置来源。旧包不绑定时仅保证同包重复导入不重复；不同旧包的历史数据可能视为新记录，多包合并请绑定稳定来源。</p>
      </template>
      <h3>恢复的文件（可选）</h3>
      <el-checkbox-group v-model="categories" class="backup-categories">
        <el-checkbox v-for="key in summary.categories" :key="key" :label="key">{{ labels[key] || key }}</el-checkbox>
      </el-checkbox-group>
      <el-alert v-if="access" type="warning" :closable="false" show-icon title="恢复配置会改变 WebUI 的访问方式">
        <p v-if="access.moved">恢复后 WebUI 改为通过 <b>{{ access.urls[0] }}</b> 访问，当前地址将无法打开。</p>
        <p v-if="access.username">恢复后需使用备份中的管理员账号 <b>{{ access.username }}</b> 及其密码重新登录。</p>
      </el-alert>
      <p class="backup-hint">数据库始终按所选模式导入。勾选的文件按路径覆盖，不受增量冲突策略保护；未勾选时只恢复数据库。</p>
      <details v-if="summary.archive_summary && summary.archive_summary.largest_files && summary.archive_summary.largest_files.length">
        <summary>包内最大文件</summary>
        <p v-for="file in summary.archive_summary.largest_files.slice(0, 10)" :key="file.path" class="backup-hint">{{ file.path }} · {{ formatBytes(file.compressed_bytes) }} / {{ formatBytes(file.raw_bytes) }}</p>
      </details>
      <h3>依赖</h3>
      <el-checkbox v-model="skipFailed">依赖无法安装时跳过对应插件继续恢复</el-checkbox>
      <p class="backup-hint">不勾选时，任何依赖无法安装都会中止恢复，不做任何改动。</p>
      <p class="backup-warning">确认后先在线校验并准备依赖，原实例继续运行。准备通过后自动短暂停机、保存最终快照并切换；只有实际写入失败才执行回退。</p>
    </template>
    <span slot="footer">
      <el-button @click="$emit('close')">取消</el-button>
      <el-button v-if="!summary" type="primary" :loading="loading" :disabled="item && item.encrypted && !password" @click="load">读取备份</el-button>
      <el-button v-else type="danger" :loading="submitting" :disabled="confirming || (restoreMode !== 'replace_database' && !includedTables.length)" @click="submit">开始恢复</el-button>
    </span>
  </el-dialog>
</template>

<script>
import { isAuthenticationExpired } from "@/utils/auth-session"
import { newOperationId } from "@/utils/plugin-operation"
import { formatBytes } from "@/utils/utils"
import { restoreModes, restoreModeHint, restoreOptions, nativeRecoveryHint } from "@/utils/migrationRestore"
export default {
  name: "BackupRestoreDialog",
  props: {
    visible: { type: Boolean, default: false },
    item: { type: Object, default: null },
    labels: { type: Object, default: () => ({}) },
  },
  data() {
    return { restoreModes, nativeRecoveryHint, restoreMode: "empty", backupBeforeReplace: true, includedTables: [], sourceBinding: "", operationId: "", operationInput: "", confirming: false, password: "", summary: null, categories: [], skipFailed: false, loading: false, submitting: false, error: "" }
  },
  computed: {
    modeHint() { return restoreModeHint(this.restoreMode) },
    access() {
      const access = this.summary?.restored_access
      if (!access || !this.categories.includes("configuration")) return null
      const urls = access.access_urls || []
      const listener = url => `${url.protocol}${url.port || (url.protocol === "https:" ? "443" : "80")}`
      const current = listener(window.location)
      const moved = urls.length > 0 && !urls.some(url => listener(new URL(url)) === current)
      return moved || access.username ? { urls, moved, username: access.username } : null
    },
    totalRows() { return Object.values(this.summary.database.tables).reduce((sum, rows) => sum + rows, 0) },
  },
  watch: {
    visible(value) {
      this.requestGeneration += 1
      this.loading = false; this.submitting = false; this.confirming = false
      if (!value) return
      Object.assign(this, { password: "", summary: null, categories: [], restoreMode: "empty", backupBeforeReplace: true, includedTables: [], sourceBinding: "", skipFailed: false, error: "", operationId: "" })
      if (this.item && !this.item.encrypted) this.load()
    },
  },
  created() { this.requestGeneration = 0; this.expired = () => { this.requestGeneration += 1; this.submitting = false; this.loading = false }; window.addEventListener("zhenxun-auth-expired", this.expired) },
  beforeDestroy() { this.requestGeneration += 1; this.disposed = true; window.removeEventListener("zhenxun-auth-expired", this.expired) },
  methods: {
    formatBytes,
    api(path) { return `${this.$root.prefix}/backup${path}` },
    async load() {
      if (this.loading || !this.item || isAuthenticationExpired()) return
      const generation = this.requestGeneration
      this.loading = true; this.error = ""
      try {
        const response = await this.postRequest(this.api("/inspect"), { name: this.item.name, password: this.password || null })
        if (!response?.suc) throw new Error(response?.info)
        if (this.disposed || generation !== this.requestGeneration || isAuthenticationExpired()) return
        this.summary = response.data
        this.categories = []
        this.includedTables = Object.keys(response.data.database.tables)
      } catch (error) { if (!this.disposed && generation === this.requestGeneration) this.error = error.message || "读取备份失败" }
      finally { if (!this.disposed && generation === this.requestGeneration) this.loading = false }
    },
    async submit() {
      if (this.submitting || this.confirming || (this.restoreMode !== "replace_database" && !this.includedTables.length)) return
      const confirmationGeneration = this.requestGeneration
      const confirmationInput = JSON.stringify([this.restoreMode, this.backupBeforeReplace, this.includedTables, this.categories, this.sourceBinding, this.skipFailed])
      this.confirming = true
      const moved = this.access?.moved ? `恢复后请通过 ${this.access.urls[0]} 访问 WebUI。` : ""
      try { await this.$confirm(this.modeHint + (this.restoreMode === "replace_database" && !this.backupBeforeReplace ? "原数据没有完整备份保护。" : "") + "准备通过后切换并导入。" + moved, "确认恢复", { type: "warning", confirmButtonText: "开始恢复" }) } catch { return } finally { this.confirming = false }
      if (this.submitting || confirmationGeneration !== this.requestGeneration || confirmationInput !== JSON.stringify([this.restoreMode, this.backupBeforeReplace, this.includedTables, this.categories, this.sourceBinding, this.skipFailed])) return
      if (this.disposed || !this.visible || isAuthenticationExpired()) return
      const generation = this.requestGeneration
      const options = restoreOptions(this.restoreMode, this.backupBeforeReplace, this.restoreMode === "replace_database" ? null : this.includedTables, this.sourceBinding)
      const input = JSON.stringify([this.item.name, this.password, [...this.categories].sort(), this.skipFailed, options])
      if (input !== this.operationInput) { this.operationId = ""; this.operationInput = input }
      this.operationId = this.operationId || newOperationId()
      sessionStorage.setItem("zhenxun_restore_operation", this.operationId)
      this.submitting = true; this.error = ""
      try {
        const response = await this.postRequest(this.api("/restore"), {
          ...options, operation_id: this.operationId, name: this.item.name, password: this.password || null, categories: this.categories, skip_failed: this.skipFailed,
        }, { timeout: 0 })
        if (this.disposed || generation !== this.requestGeneration || isAuthenticationExpired()) return
        if (!response?.suc) throw new Error(response?.info)
        this.$emit("submitted", response.data)
      } catch (error) { if (!this.disposed && generation === this.requestGeneration) this.error = error.message || "恢复失败" }
      finally { if (!this.disposed && generation === this.requestGeneration) this.submitting = false }
    },
  },
}
</script>

<style scoped>
.backup-summary { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 8px 12px; font-size: 13px; margin: 0 0 12px; }
.backup-summary dt { color: #64717c; }
.backup-summary dd { margin: 0; overflow-wrap: anywhere; }
.el-alert { margin-bottom: 8px; }
h3 { font-size: 15px; margin: 18px 0 6px; }
.backup-hint { color: #64717c; font-size: 13px; margin: 6px 0 10px; line-height: 1.6; }
.backup-warning { color: #a8662a; font-size: 13px; margin-top: 12px; line-height: 1.6; }
.restore-modes { display: flex; flex-wrap: wrap; gap: 12px; }
.restore-modes .el-radio { margin-right: 0; white-space: normal; }
.backup-categories { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.backup-categories .el-checkbox { margin-right: 0; }
</style>
