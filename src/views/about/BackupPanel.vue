<template>
  <section class="backup-section" aria-labelledby="backup-title">
    <header class="backup-heading">
      <div><h2 id="backup-title">备份与恢复</h2><span>.zx 备份包 · 在线导出，恢复时 Bot 自动重启</span></div>
      <div class="backup-heading-actions">
        <el-button icon="el-icon-refresh" size="small" :loading="loading" @click="refresh">刷新</el-button>
        <el-button icon="el-icon-upload2" size="small" :loading="uploading !== null" @click="$refs.upload.click()">上传备份</el-button>
        <el-button icon="el-icon-coin" size="small" :disabled="restoring || !launcherManaged" :title="launcherManaged ? '' : manualRestartHint" @click="switching = true">切换数据库</el-button>
        <el-button type="primary" icon="el-icon-download" size="small" :disabled="running" @click="openExport">导出备份</el-button>
        <input ref="upload" type="file" accept=".zx" hidden @change="upload">
      </div>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-progress v-if="uploading !== null" class="backup-upload" :percentage="uploading" />
    <div v-if="restore.state !== 'idle'" :class="['backup-restore', `is-${restoreView.type}`]" role="status">
      <div>
        <strong><i v-if="restoreWorking" class="el-icon-loading"></i> {{ restoreView.title }}</strong>
        <p v-if="restoreView.detail">{{ restoreView.detail }}</p>
        <p v-for="note in restoreNotes" :key="note.text" :class="`is-${note.type}`">{{ note.text }}</p>
      </div>
      <div v-if="restore.state === 'preparing' && restore.preparation" class="preparation-status">
        <p v-for="note in (restore.preparation.checks || {}).deferred || []" :key="note">切换时核验：{{ note }}</p>
        <pre v-if="restore.preparation.confirmation_required">{{ preparationChanges }}</pre>
        <el-button v-if="restore.preparation.retryable" type="primary" size="mini" :loading="retrying" :disabled="retrying || restore.cancel_requested" @click="retryPreparation">{{ restore.preparation.confirmation_required ? '确认变更并继续' : '重试原任务' }}</el-button>
      </div>
      <el-button v-if="restoring && restore.state !== 'committing'" size="mini" :loading="canceling" :disabled="canceling || (restore.cancel_requested && restore.preparation?.phase !== 'cleanup_pending')" @click="cancelRestore">{{ restore.preparation?.phase === 'cleanup_pending' ? '重试候选清理' : '在安全点取消' }}</el-button>
      <el-button v-else-if="!restoring" size="mini" @click="dismiss">知道了</el-button>
    </div>
    <div v-if="running" class="backup-progress" role="status">
      <span>{{ status.stage === "files" ? "正在打包文件" : "正在导出数据库" }}</span>
      <el-progress v-if="status.stage === 'files' && status.total" :percentage="percent" />
      <span v-else-if="status.table">正在导出 {{ status.table }}（{{ status.done }} 行）</span>
    </div>
    <el-alert v-if="status.state === 'failed'" :title="`导出失败：${status.error}`" type="error" :closable="false" show-icon />
    <el-alert v-if="status.state === 'done' && status.manifest && status.manifest.skipped_files.length" :title="`有 ${status.manifest.skipped_files.length} 个文件读取失败未打包`" type="warning" :closable="false" show-icon />
    <p v-if="!items.length" class="backup-empty">暂无备份</p>
    <article v-for="item in items" :key="item.name" class="backup-item">
      <div>
        <strong>{{ item.name }}</strong>
        <el-tag v-if="item.encrypted" size="mini" type="success">已加密</el-tag>
      </div>
      <span>{{ formatTime(item.created_at) }} · {{ formatBytes(item.size) }}</span>
      <div class="backup-item-actions">
        <el-button size="mini" icon="el-icon-refresh-left" :disabled="restoring || !launcherManaged" :title="launcherManaged ? '' : manualRestartHint" @click="restoreItem = item">恢复</el-button>
        <el-button size="mini" icon="el-icon-download" :loading="downloading === item.name" @click="download(item)">下载</el-button>
        <el-button size="mini" icon="el-icon-delete" type="danger" plain @click="remove(item)">删除</el-button>
      </div>
    </article>

    <el-dialog title="导出备份" :visible.sync="dialog" custom-class="backup-dialog" top="5vh" width="min(600px, 94vw)" :close-on-click-modal="false">
      <p v-if="scanning" role="status"><i class="el-icon-loading"></i> 正在统计文件与依赖…</p>
      <template v-else-if="scan">
        <h3>备份内容</h3>
        <p class="backup-hint">数据库导出已加载插件的全部数据表；未加载插件的表不包含在内。恢复时写回当前使用的数据库，仅首次部署时可指定 SQLite / MySQL / PostgreSQL 空库作为恢复目标；如需更换数据库，请使用「切换数据库」。</p>
        <el-checkbox-group v-model="categories" class="backup-categories">
          <el-checkbox v-for="(info, key) in scan.categories" :key="key" :label="key">
            {{ categoryLabels[key] }} <small>{{ info.files }} 个文件 · {{ formatBytes(info.bytes) }}</small>
          </el-checkbox>
        </el-checkbox-group>
        <template v-if="scan.dependencies.length">
          <h3>依赖（{{ scan.dependencies.length }}）</h3>
          <p class="backup-hint">默认记录当前环境中插件使用的全部依赖，包括商店插件、插件声明的依赖和虚拟环境中额外安装的第三方包。恢复时优先安装备份时的版本，不可用时改装相近版本，仍无法安装的跳过并提示。<template v-if="unsupportedCount">其中 {{ unsupportedCount }} 项无法自动安装，恢复后会提示在控制台手动安装。</template></p>
          <p class="backup-dep-summary"><span v-for="group in dependencyGroups" :key="group.kind">{{ group.label }} {{ group.items.length }}</span></p>
          <el-checkbox v-model="advancedDeps">高级：手动选择要记录的依赖</el-checkbox>
          <template v-if="advancedDeps">
            <div class="backup-deps-actions">
              <el-button size="mini" @click="extras = allExtras">全选</el-button>
              <el-button size="mini" @click="extras = []">清空</el-button>
              <small>已选 {{ extras.length }} / {{ scan.dependencies.length }}</small>
            </div>
            <section v-for="group in dependencyGroups" :key="group.kind" class="backup-dep-group">
              <h4>{{ group.label }}</h4>
              <el-checkbox-group v-model="extras" class="backup-deps">
                <el-checkbox v-for="item in group.items" :key="item.name" :label="item.name">
                  {{ item.name }}<small v-if="item.version"> {{ item.version }}</small>
                  <small v-if="item.kind === 'store' || item.kind === 'plugin'" class="backup-source">{{ item.sources.join("、") }}</small>
                  <small v-if="item.url" class="backup-source">直链安装：{{ item.url }}</small>
                  <small v-if="item.unsupported" class="backup-source is-unsupported">需手动安装：{{ item.unsupported }}</small>
                </el-checkbox>
              </el-checkbox-group>
            </section>
          </template>
        </template>
        <h3>加密</h3>
        <el-input v-model="password" type="password" show-password autocomplete="new-password" placeholder="留空则不加密" />
        <p v-if="!password && categories.includes('configuration')" class="backup-warning">未加密的备份包含 .env、插件配置和证书私钥中的账号、密钥与数据库连接信息，请妥善保管。</p>
      </template>
      <span slot="footer">
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :disabled="!scan || scanning" :loading="starting" @click="startExport">开始导出</el-button>
      </span>
    </el-dialog>
    <backup-restore-dialog :visible="Boolean(restoreItem)" :item="restoreItem" :labels="categoryLabels" @close="restoreItem = null" @submitted="restarted($event, '正在从备份恢复，完成后自动返回。')" />
    <backup-switch-dialog :visible="switching" @close="switching = false" @submitted="restarted($event, '正在切换数据库，完成后自动返回。')" />
  </section>
</template>

<script>
import { isAuthenticationExpired } from "@/utils/auth-session"
import axios from "axios"
import { getBaseUrl } from "@/utils/api"
import { apiErrorDetail } from "@/utils/api-error"
import { uploadBackupInChunks } from "@/utils/chunk-upload"
import { reasonLabels, reasonText } from "@/utils/plugin-operation"
import { startRestartRecovery } from "@/utils/restart-recovery"
import { formatBytes } from "@/utils/utils"
import BackupRestoreDialog from "./BackupRestoreDialog.vue"
import BackupSwitchDialog from "./BackupSwitchDialog.vue"

const RESTORING = ["preparing", "pending", "snapshot_ready", "applying", "awaiting_orm", "importing", "verifying", "committing", "failed_import", "rollback_import", "rollback_target", "rollback_verifying"]
const DEPENDENCY_KINDS = {
  nonebot_plugin: "NoneBot 商店插件",
  manual: "手动依赖",
  store: "真寻商店插件依赖",
  plugin: "插件声明的依赖",
  venv: "虚拟环境第三方包",
  layer: "依赖层其他包",
}

export default {
  name: "BackupPanel",
  components: { BackupRestoreDialog, BackupSwitchDialog },
  props: { launcherManaged: { type: Boolean, default: false } },
  data() {
    return {
      manualRestartHint: "恢复和切换数据库需要自动重启，当前不是 launcher 托管模式",
      loading: false,
      error: "",
      items: [],
      status: { state: "idle" },
      timer: null,
      dialog: false,
      scanning: false,
      scan: null,
      categories: [],
      extras: [],
      advancedDeps: false,
      password: "",
      starting: false,
      downloading: "",
      uploading: null,
      restore: { state: "idle" },
      restoreTimer: null,
      canceling: false, retrying: false, restartHandoff: "",
      restoreItem: null,
      switching: false,
      categoryLabels: { configuration: "配置", data: "插件数据", plugins: "插件代码", resources: "资源文件" },
    }
  },
  computed: {
    running() { return this.status.state === "running" },
    percent() { return Math.min(100, Math.floor((this.status.done / this.status.total) * 100)) },
    restoring() { return RESTORING.includes(this.restore.state) },
    allExtras() {
      return (this.scan?.dependencies || []).map(item => item.name)
    },
    unsupportedCount() {
      return (this.scan?.dependencies || []).filter(item => item.unsupported).length
    },
    dependencyGroups() {
      const items = this.scan?.dependencies || []
      return Object.entries(DEPENDENCY_KINDS)
        .map(([kind, label]) => ({ kind, label, items: items.filter(item => item.kind === kind) }))
        .filter(group => group.items.length)
    },
    restoreNotes() {
      const report = this.restore.dependencies || {}
      const layer = report.layer || {}
      const notes = []
      if (this.restore.historical_result) notes.push({ type: "warning", text: "这是历史记录，不代表已通过当前版本的迁移验证。" })
      if (this.restore.cancel_requested) notes.push({ type: "info", text: "已收到取消请求，将在安全点完成处理；不会强制中断写入。" })
      if (this.restore.cleanup_error) notes.push({ type: "warning", text: "已确认的结果保持不变，临时材料待清理：" + this.restore.cleanup_error })
      const rollbackLabels = { target_database: "目标数据库", original_instance: "原实例启动", dependencies: "依赖层", files: "文件", orm: "插件 ORM" }
      const rollbackStates = { confirmed: "已确认", pending: "等待核验", unconfirmed: "结果未确认", not_applicable: "无需回退" }
      Object.entries(this.restore.rollback_components || {}).forEach(([name, state]) => {
        notes.push({ type: state === "unconfirmed" ? "warning" : "info", text: (rollbackLabels[name] || name) + "：" + (rollbackStates[state] || state) })
      })
      if (this.restore.report?.preserved_tables?.length) notes.push({ type: "info", text: "已保留目标独有表：" + this.restore.report.preserved_tables.join("、") })
      if (layer.state === "failed") {
        notes.push({ type: "error", text: `插件依赖层安装失败，商店插件与恢复的依赖都未生效：${reasonText(layer.error_code)}${layer.detail ? `（${layer.detail}）` : ""}。请在插件商店查看依赖事务后处理。` })
      } else if (layer.state === "pending") {
        notes.push({ type: "info", text: this.restore.state === "preparing" ? "依赖候选尚未生效，原实例仍使用当前依赖；准备通过后自动切换。" : "插件依赖正在应用或等待启动验证。" })
      } else if (layer.warnings?.length) {
        notes.push({ type: "warning", text: `插件依赖已安装，但有以下问题未解决：${layer.warnings.join("；")}` })
      }
      const nearby = Object.entries(report.nearby || {})
      if (nearby.length) {
        notes.push({ type: "info", text: `以下备份版本不可用，本任务选择的替代版本：${nearby.map(([name, [from, to]]) => `${name} ${from} → ${to}`).join("、")}` })
      }
      const implied = Object.entries(report.implied || {})
      if (implied.length) {
        notes.push({ type: "info", text: `以下依赖作为其他依赖的子依赖处理，按当前平台决定是否安装：${implied.map(([name, owner]) => `${name}（${owner}）`).join("、")}` })
      }
      const platformOnly = Object.entries(report.platform_only || {})
      if (platformOnly.length) {
        notes.push({ type: "info", text: `以下依赖仅适用于其他平台，已忽略：${platformOnly.map(([name, marker]) => `${name}（${marker}）`).join("、")}` })
      }
      const skipped = [...(report.skipped_plugins || []), ...(report.skipped_requirements || [])]
      if (skipped.length) {
        const reasons = report.skip_reasons || {}
        notes.push({ type: "warning", text: `已跳过无法安装的插件 / 依赖：${skipped.map(name => reasons[name] ? `${name}（${reasons[name]}）` : name).join("；")}` })
      }
      const unsupported = report.unsupported_requirements || []
      if (unsupported.length) notes.push({ type: "warning", text: `以下依赖无法由恢复自动安装，请在控制台手动安装：${unsupported.join("、")}` })
      const unrestorable = this.restore.unrestorable_files || []
      if (unrestorable.length) {
        const names = unrestorable.slice(0, 10).join("、") + (unrestorable.length > 10 ? ` 等 ${unrestorable.length} 个文件` : "")
        notes.push({ type: "warning", text: `以下文件的文件名在当前系统上无效，未恢复：${names}` })
      }
      const tables = this.restore.report?.skipped_tables
      const lost = tables && !Array.isArray(tables) ? Object.entries(tables).filter(([, rows]) => rows > 0) : []
      if (lost.length) {
        notes.push({ type: "warning", text: `以下表所属的插件当前未加载，其中的数据未导入：${lost.map(([table, rows]) => `${table}（${rows} 行）`).join("、")}。备份文件中仍保留这些数据，插件可用后可重新从备份恢复。` })
      }
      return notes
    },
    restoreError() {
      const restore = this.restore
      if (!restore.error_code || !reasonLabels[restore.error_code]) return restore.error
      return `依赖无法安装：${reasonLabels[restore.error_code]}${restore.error_detail ? `（${restore.error_detail}）` : ""}`
    },
    restoreWorking() {
      if (!this.restoring || ["awaiting_orm", "recovery_required"].includes(this.restore.state)) return false
      return this.restore.state !== "preparing" || !["blocked", "interrupted", "waiting_confirmation", "waiting_credentials", "cleanup_pending"].includes(this.restore.preparation?.phase)
    },
    preparationChanges() {
      const changes = this.restore.preparation?.changes || {}
      return JSON.stringify({ 版本调整: changes.nearby || {}, 跳过插件: changes.skipped_plugins || [], 其他平台声明: changes.platform_only || {}, 影响文件: changes.files || [], 目标结构指纹: changes.structure }, null, 2)
    },
    restoreView() {
      const restore = this.restore
      const action = restore.kind === "switch" ? "切换数据库" : "恢复"
      const progress = restore.progress ? `正在导入 ${restore.progress.table}（${restore.progress.rows} 行）` : ""
      const incomplete = this.restoreNotes.some(note => note.type !== "info")
      const preparation = restore.preparation || {}
      const phases = { waiting_credentials: "等待补充备份包密码", orm_check: "核对 ORM 状态（只读）", checking: "正在只读检查", dependencies: "正在解析依赖", building: "正在后台构建候选", rechecking: "正在切换前复核", switching: "即将短暂停机切换", waiting_confirmation: "影响摘要发生变化，请确认", blocked: "准备未完成，原实例未变更", interrupted: "准备已暂停，原实例未变更", cleanup_pending: "原实例未变更，候选清理待重试" }
      return {
        preparing: { type: preparation.error || preparation.confirmation_required ? "warning" : "info", title: phases[preparation.phase] || "正在在线准备", detail: preparation.error || "原实例继续运行；候选通过后自动短暂停机切换，无需手动重启。" },
        awaiting_orm: { type: "warning", title: "等待控制台处理插件数据库", detail: restore.error },
        snapshot_ready: { type: "info", title: "最终快照已保存", detail: "等待旧进程退出后应用" },
        applying: { type: "info", title: "正在应用依赖和文件" },
        verifying: { type: "info", title: "数据已导入，正在验证新进程", detail: "验证完成前业务入口保持关闭，回滚材料仍保留" },
        committing: { type: "info", title: "验证通过，正在结算提交", detail: "中断后继续结算，不会重复导入" },
        rollback_verifying: { type: "warning", title: "正在验证回滚后的原实例" },
        rollback_target: { type: "warning", title: "正在回退目标数据库", detail: "仅撤销本任务变化，保留原有表和无关数据" },
        recovery_required: { type: "error", title: "结果待核验，未报告成功或已回滚", detail: restore.rollback_error || restore.error },
        done_partial: { type: "warning", title: "已完成经确认的部分恢复", detail: "未恢复内容见明细" },
        canceled: { type: "info", title: "任务已取消" },
        pending: { type: "info", title: `正在准备${action}`, detail: "候选已准备，正在停写排空并保存最终快照" },
        importing: { type: "info", title: `正在${action}：导入数据`, detail: progress },
        failed_import: { type: "warning", title: "导入失败，正在回滚", detail: restore.error },
        rollback_import: { type: "warning", title: "导入失败，正在回滚", detail: restore.error },
        done: { type: incomplete ? "warning" : "success", title: incomplete ? `${action}完成，但有部分内容未生效` : `${action}完成`, detail: restore.kind === "switch" ? `已切换到 ${restore.db_url}` : `来自 ${restore.name}` },
        failed: { type: "error", title: `${action}未执行`, detail: `${this.restoreError}。没有做任何改动。` },
        rolled_back: { type: "warning", title: `${action}失败，已回滚到之前的状态`, detail: restore.error },
        rollback_failed: { type: "error", title: `${action}失败，回滚也失败了`, detail: `导入错误：${restore.error}；回滚错误：${restore.rollback_error}。请检查数据库后手动处理。` },
      }[restore.state] || { type: "info", title: restore.state }
    },
  },
  mounted() { this.requestGeneration = 0; window.addEventListener("zhenxun-auth-expired", this.stopReads); document.addEventListener("visibilitychange", this.visibilityChanged); this.refresh() },
  beforeDestroy() { this.requestGeneration += 1; this.disposed = true; window.removeEventListener("zhenxun-auth-expired", this.stopReads); document.removeEventListener("visibilitychange", this.visibilityChanged); clearTimeout(this.timer); clearTimeout(this.restoreTimer) },
  methods: {
    stopReads() {
      this.requestGeneration += 1
      clearTimeout(this.timer); clearTimeout(this.restoreTimer)
      this.loading = false
    },
    visibilityChanged() {
      this.requestGeneration += 1
      clearTimeout(this.timer); clearTimeout(this.restoreTimer)
      if (!document.hidden && !this.disposed) this.refresh()
    },
    formatBytes,
    api(path) { return `${this.$root.prefix}/backup${path}` },
    formatTime(value) { return new Date(value).toLocaleString() },
    async refresh() {
      if (this.disposed || document.hidden || isAuthenticationExpired()) return
      const generation = ++this.requestGeneration
      const operationId = sessionStorage.getItem("zhenxun_restore_operation") || undefined
      this.loading = true; this.error = ""
      try {
        const [list, status, restore] = await Promise.all([
          this.getRequest(this.api("/list")),
          this.getRequest(this.api("/export")),
          this.getRequest(this.api("/restore"), { operation_id: operationId }),
        ])
        if (this.disposed || generation !== this.requestGeneration) return
        if (!list?.suc) throw new Error(list?.info)
        this.items = list.data
        this.track(status?.data)
        this.trackRestore(restore?.data)
      } catch (error) { if (!this.disposed && generation === this.requestGeneration) this.error = error.message || "备份列表读取失败" }
      finally { if (!this.disposed && generation === this.requestGeneration) this.loading = false }
    },
    track(status) {
      if (this.disposed || document.hidden || isAuthenticationExpired()) return
      const generation = this.requestGeneration
      const wasRunning = this.running
      this.status = status || { state: "idle" }
      clearTimeout(this.timer)
      if (this.running) {
        this.timer = setTimeout(async () => {
          const response = await this.getRequest(this.api("/export"), {}, { suppressErrorToast: true }).catch(() => null)
          if (!this.disposed && generation === this.requestGeneration && !isAuthenticationExpired()) this.track(response?.data || this.status)
        }, 1000)
      } else if (wasRunning) {
        if (this.status.state === "done") this.$message.success("备份导出完成")
        this.refresh()
      }
    },
    trackRestore(restore) {
      if (this.disposed || document.hidden || isAuthenticationExpired()) return
      this.restore = restore || { state: "idle" }
      if (restore?.operation_id) sessionStorage.setItem("zhenxun_restore_operation", restore.operation_id)
      clearTimeout(this.restoreTimer)
      if (!this.restoring) return
      if (restore.restart_info?.boot_id && (restore.state !== "preparing" || restore.preparation?.phase === "switching") && this.restartHandoff !== restore.operation_id) {
        this.restartHandoff = restore.operation_id
        this.handoff(restore.restart_info, "正在自动切换，完成后返回迁移结果。")
      }
      const generation = this.requestGeneration
      this.restoreTimer = setTimeout(async () => {
        const response = await this.getRequest(this.api("/restore"), { operation_id: this.restore.operation_id || undefined }, { suppressErrorToast: true }).catch(() => null)
        if (!this.disposed && generation === this.requestGeneration && !isAuthenticationExpired()) this.trackRestore(response?.suc ? response.data : this.restore)
      }, 2000)
    },
    async retryPreparation() {
      if (this.retrying || !this.restore.preparation?.retryable || isAuthenticationExpired()) return
      const generation = this.requestGeneration
      this.retrying = true
      try {
        let password
        if (this.restore.preparation.password_required) {
          try {
            const answer = await this.$prompt("请输入原备份包密码，继续同一任务", "补充解密密码", { inputType: "password", inputValidator: value => !!value || "请输入密码" })
            password = answer.value
          } catch { return }
        }
        if (this.disposed || generation !== this.requestGeneration || isAuthenticationExpired()) return
        const response = await this.postRequest(this.api("/restore"), {
          operation_id: this.restore.operation_id, retry: true,
          password,
          confirmation_digest: this.restore.preparation.confirmation_required ? this.restore.preparation.impact_digest : null,
        }, { suppressErrorToast: true })
        if (this.disposed || generation !== this.requestGeneration || isAuthenticationExpired()) return
        if (!response?.suc) throw new Error(response?.info || "准备未能继续")
        this.trackRestore(response.data.restore)
      } catch (error) {
        if (!this.disposed && generation === this.requestGeneration) this.error = error.message || "重试失败，请查询原任务"
      } finally { this.retrying = false }
    },
    async cancelRestore() {
      if (this.canceling || !this.restore.operation_id || isAuthenticationExpired()) return
      const generation = this.requestGeneration
      this.canceling = true
      try {
        const response = await this.deleteRequest(this.api(`/restore?operation_id=${encodeURIComponent(this.restore.operation_id)}`))
        if (this.disposed || generation !== this.requestGeneration || isAuthenticationExpired()) return
        if (!response?.suc) throw new Error(response?.info || "取消请求未接受")
        this.trackRestore({ ...this.restore, cancel_requested: true })
      } catch (error) {
        if (!this.disposed && generation === this.requestGeneration) this.error = error.message || "取消请求失败，可重试查询原任务"
      } finally { this.canceling = false }
    },
    async dismiss() {
      const response = await this.deleteRequest(this.api("/restore"))
      if (response?.suc) { this.restore = { state: "idle" }; sessionStorage.removeItem("zhenxun_restore_operation") }
      else this.$message.error(response?.info || "清除失败")
    },
    restarted(data, message) {
      this.restoreItem = null; this.switching = false
      this.trackRestore(data.restore)
      this.handoff(data, message)
    },
    handoff(data, message) {
      if (!data.boot_id) return
      const username = data.restored_access?.username
      if (username) message += `恢复后请使用备份中的管理员账号 ${username} 登录。`
      startRestartRecovery({
        bootId: data.boot_id,
        accessUrls: data.access_urls,
        accessTargets: data.access_targets,
        preferredUrl: data.preferred_url,
        returnRoute: this.$route.fullPath,
        message,
      })
    },
    async upload(event) {
      const file = event.target.files[0]
      event.target.value = ""
      if (!file) return
      this.uploading = 0
      try {
        const name = await uploadBackupInChunks(this.api(""), file, {
          onProgress: (loaded, total) => { this.uploading = total ? Math.min(100, Math.round(loaded / total * 100)) : 0 },
        })
        this.$message.success(`已上传 ${name}`)
        this.refresh()
      } catch (error) { if (!axios.isCancel(error)) this.$message.error(apiErrorDetail(error, "上传失败")) }
      finally { this.uploading = null }
    },
    async openExport() {
      this.dialog = true; this.scanning = true; this.scan = null; this.password = ""; this.extras = []; this.advancedDeps = false
      try {
        const response = await this.getRequest(this.api("/scan"))
        if (!response?.suc) throw new Error(response?.info)
        this.scan = response.data
        this.categories = [...response.data.default_categories]
        this.extras = this.allExtras
      } catch (error) {
        this.dialog = false
        this.error = error.message || "导出预览失败"
      } finally { this.scanning = false }
    },
    async startExport() {
      this.starting = true
      try {
        const response = await this.postRequest(this.api("/export"), {
          categories: this.categories, extras: this.advancedDeps ? this.extras : null, password: this.password || null,
        })
        if (!response?.suc) throw new Error(response?.info)
        this.dialog = false; this.password = ""
        this.track(response.data)
      } catch (error) { this.$message.error(error.message || "导出失败") }
      finally { this.starting = false }
    },
    async download(item) {
      this.downloading = item.name
      try {
        const name = encodeURIComponent(item.name)
        const response = await this.postRequest(this.api(`/download/${name}`))
        if (!response?.suc) { this.$message.error(response?.info || "下载失败"); return }
        const link = document.createElement("a")
        link.href = `${getBaseUrl()}${this.api(`/file/${encodeURIComponent(response.data)}/${name}`)}`
        link.download = item.name
        link.click()
      } finally { this.downloading = "" }
    },
    async remove(item) {
      try { await this.$confirm(`删除 ${item.name}？`, "删除备份", { type: "warning" }) } catch { return }
      const response = await this.deleteRequest(this.api(`/${encodeURIComponent(item.name)}`))
      if (response?.suc) this.refresh()
      else this.$message.error(response?.info || "删除失败")
    },
  },
}
</script>

<style scoped>
::v-deep .backup-dialog { display: flex; flex-direction: column; max-height: 90vh; margin-bottom: 0; }
::v-deep .backup-dialog .el-dialog__body { overflow-y: auto; min-height: 0; padding-top: 4px; }
.backup-section { padding: 28px 0; border-top: 1px solid #dce2e8; color: #35424d; }
.backup-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.backup-heading h2 { font-size: 21px; margin: 0 0 6px; }
.backup-heading span, .backup-empty, .backup-hint, .backup-item > span, small { color: #64717c; font-size: 13px; }
.backup-section > .el-alert, .backup-progress, .backup-upload { margin-bottom: 12px; }
.backup-heading-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.backup-heading-actions .el-button { margin-left: 0; }
.backup-restore { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-left: 3px solid #409eff; background: #f4f8fd; padding: 10px 14px; margin-bottom: 12px; font-size: 14px; }
.backup-restore p { margin: 4px 0 0; font-size: 13px; color: #64717c; overflow-wrap: anywhere; }
.backup-restore.is-success { border-color: #67c23a; background: #f3faef; }
.backup-restore.is-warning { border-color: #e6a23c; background: #fdf8ef; }
.backup-restore.is-error { border-color: #f56c6c; background: #fdf2f2; }
.backup-restore p.is-warning { color: #a8662a; }
.backup-restore p.is-error { color: #c45656; }
.backup-source.is-unsupported { color: #a8662a; }
.backup-progress { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
.backup-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; border-bottom: 1px solid #e2e7eb; padding: 12px 0; font-size: 14px; }
.backup-item > div:first-child { display: flex; gap: 8px; align-items: center; overflow-wrap: anywhere; }
.backup-item-actions { grid-row: 1 / span 2; grid-column: 2; }
.backup-dialog h3 { font-size: 15px; margin: 18px 0 6px; }
.backup-hint { margin: 0 0 10px; line-height: 1.6; }
.backup-categories, .backup-deps { display: flex; flex-direction: column; gap: 8px; }
.backup-categories .el-checkbox, .backup-deps .el-checkbox { display: flex; align-items: flex-start; margin-right: 0; white-space: normal; }
.backup-deps ::v-deep .el-checkbox__input { margin-top: 2px; }
.backup-deps { max-height: 260px; overflow-y: auto; padding-right: 6px; }
.backup-deps-actions { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.backup-deps-actions .el-button { margin-left: 0; }
.backup-dep-summary { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0 0 8px; color: #64717c; font-size: 13px; }
.backup-dep-group h4 { font-size: 13px; margin: 12px 0 6px; color: #35424d; }
.backup-source { display: block; overflow-wrap: anywhere; }
.backup-warning { color: #a8662a; font-size: 13px; margin-top: 8px; }
@media (max-width: 600px) {
  .backup-section { padding: 22px 0; }
  .backup-restore { flex-direction: column; align-items: flex-start; }
  .backup-restore > div { width: 100%; min-width: 0; }
  .backup-item { grid-template-columns: 1fr; }
  .backup-item-actions { grid-row: auto; grid-column: 1; }
}
</style>
