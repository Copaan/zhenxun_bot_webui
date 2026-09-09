<template>
  <el-dialog title="完整替换迁移" :visible="visible" width="min(780px, 96vw)" :close-on-click-modal="false" :before-close="close">
    <div class="restore-wizard">
      <ol class="restore-steps" aria-label="恢复步骤">
        <li v-for="(label, index) in steps" :key="label" :aria-current="step === index ? 'step' : null" :class="{ active: step === index }">{{ index + 1 }}. {{ label }}</li>
      </ol>
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <el-form v-if="authRequired" label-position="top" :disabled="busy" @submit.native.prevent="login">
        <p>恢复草稿已保留。请使用当前实例的管理员重新登录，随后重新核验迁移包。</p>
        <el-form-item label="当前管理员用户名"><el-input v-model="loginUsername" autocomplete="off" /></el-form-item>
        <el-form-item label="当前管理员密码"><el-input v-model="loginPassword" type="password" autocomplete="new-password" /></el-form-item>
        <el-button :loading="busy" @click="login">重新登录并保留草稿</el-button>
      </el-form>
      <section v-if="step === 0">
        <h3>已选择的迁移包</h3>
        <p class="restore-code">{{ inspection.package_id }}</p>
        <p class="restore-code">SHA-256：{{ inspection.sha256 }}</p>
        <p>将完整替换迁移包声明的目录，目标独有文件和空目录先进入回滚区。包中未包含的类别不会清空。</p>
        <el-checkbox v-model="trusted">我信任包的来源，理解插件初始化和数据库对象可能产生无法撤销的外部副作用。</el-checkbox>
      </section>
      <el-form v-if="step === 1" :disabled="busy" label-position="top" @submit.native.prevent>
        <h3>确认恢复后的管理入口</h3>
        <div class="restore-grid">
          <el-form-item label="管理员用户名"><el-input v-model="draft.username" autocomplete="off" maxlength="128" /></el-form-item>
          <el-form-item label="管理员密码"><el-input v-model="draft.password" type="password" autocomplete="new-password" show-password maxlength="4096" /></el-form-item>
          <el-form-item label="监听地址"><el-input v-model="draft.host" placeholder="127.0.0.1" /></el-form-item>
          <el-form-item label="监听端口"><el-input-number v-model="draft.port" :min="1" :max="65535" /></el-form-item>
        </div>
        <el-checkbox v-model="draft.https">使用 HTTPS（证书路径必须在目标项目内）</el-checkbox>
        <div v-if="draft.https" class="restore-grid">
          <el-form-item label="证书路径"><el-input v-model="draft.cert" placeholder="certs/server.pem" /></el-form-item>
          <el-form-item label="私钥路径"><el-input v-model="draft.key" placeholder="certs/server-key.pem" /></el-form-item>
        </div>
        <h3>目标数据库：{{ engine || '包内未包含数据库' }}</h3>
        <p>数据库类型由包内清单确定，确认的目标连接优先于备份配置。</p>
        <el-form-item v-if="engine === 'sqlite'" label="项目内 SQLite 文件路径"><el-input v-model="draft.sqlitePath" placeholder="data/db/zhenxun.db" /></el-form-item>
        <template v-if="external">
          <el-alert title="请预先准备目标库、空候选库及两个互相隔离的受限账号。禁止超级用户、服务器级权限和其他应用连接；迁移不会建库或终止连接。" type="info" :closable="false" />
          <div v-for="scope in ['target', 'candidate']" :key="scope">
            <h4>{{ scope === 'target' ? '目标数据库' : '空候选数据库' }}</h4>
            <div class="restore-grid">
              <el-form-item label="服务器"><el-input v-model="draft[scope].host" /></el-form-item>
              <el-form-item label="端口"><el-input-number v-model="draft[scope].port" :min="1" :max="65535" /></el-form-item>
              <el-form-item label="数据库名称"><el-input v-model="draft[scope].database" /></el-form-item>
              <el-form-item label="受限账号"><el-input v-model="draft[scope].username" autocomplete="off" /></el-form-item>
              <el-form-item label="数据库密码"><el-input v-model="draft[scope].password" type="password" autocomplete="new-password" show-password /></el-form-item>
            </div>
          </div>
        </template>
        <el-form-item v-if="engine" label="再次输入目标数据库名称，确认覆盖"><el-input v-model="draft.confirmedName" :placeholder="engine === 'sqlite' ? '如 zhenxun.db' : '目标数据库名称'" /></el-form-item>
      </el-form>
      <section v-if="step === 2 && preflight">
        <h3>替换预览</h3>
        <p>新增 {{ preflight.summary.files.add }}，替换 {{ preflight.summary.files.replace }}，移除 {{ preflight.summary.files.remove }} 个文件；移除 {{ preflight.summary.removed_directories }} 个空目录。</p>
        <p>依赖 {{ preflight.summary.dependencies }} 项，来源需处理 {{ preflight.summary.dependency_issues }} 项。核心依赖受保护；普通失败会放宽一次，仍失败时尝试初始化插件并隔离失败插件。</p>
        <el-select v-model="section" @change="loadDetails(1)"><el-option v-for="item in sections" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-table :data="details.items" size="small"><el-table-column prop="path" label="路径 / 依赖" min-width="160"><template slot-scope="scope">{{ scope.row.path || scope.row.name }}</template></el-table-column><el-table-column label="操作 / 版本" width="120"><template slot-scope="scope">{{ scope.row.action || scope.row.version || scope.row.code }}</template></el-table-column></el-table>
        <el-pagination small layout="prev, pager, next" :pager-count="5" :page-size="50" :current-page="page" :total="details.total" @current-change="loadDetails" />
      </section>
      <section v-if="step === 3 && preflight">
        <h3>最终确认</h3>
        <p>{{ firstDeployment ? "首次部署将使用备份配置恢复，数据库目标必须为空。" : "现有实例将完整替换。" }}预检有效期 30 分钟；确认与停写后会再次核验目标，目标变化将要求重新预检。</p>
        <p>提交后会启用确认的管理员和监听配置、轮换会话密钥，需要重新登录。浏览器断开不会取消已确认任务。</p>
        <el-checkbox v-model="replacementConfirmed">我确认以上文件替换范围、数据库覆盖和依赖风险。</el-checkbox>
        <p v-if="!available">当前运行条件尚未开放恢复：{{ blockers.join('、') || '等待闭环验收' }}</p>
      </section>
    </div>
    <span slot="footer" class="restore-footer">
      <el-button :disabled="busy" @click="close">关闭</el-button>
      <el-button v-if="step" :disabled="busy" @click="back">上一步</el-button>
      <el-button v-if="step < 3" type="primary" :loading="busy || sourceBusy" :disabled="authRequired || sourceBusy || (step === 0 && !trusted)" @click="next">{{ step === 1 ? '执行预检' : '下一步' }}</el-button>
      <el-button v-else type="danger" :loading="busy" :disabled="authRequired || sourceBusy || !replacementConfirmed || !available" @click="confirm">确认完整替换</el-button>
    </span>
  </el-dialog>
</template>

<script>
import { clearDirtyState, setDirtyState } from "@/utils/dirty-state"
import { migrationLogin, migrationRequest, recoveryDatabase } from "@/utils/migration"

const endpoint = () => ({ host: "127.0.0.1", port: 3306, database: "", username: "", password: "" })
export default {
  name: "MigrationRestoreWizard",
  props: { visible: Boolean, inspection: { type: Object, required: true }, uploadId: String, discoveredPath: String, archivePassword: String, capability: Object, sourceBusy: Boolean, firstDeployment: Boolean },
  data: () => ({ authRequired: false, loginUsername: "", loginPassword: "", step: 0, trusted: false, replacementConfirmed: false, busy: false, error: "", preflight: null, registeredId: null, section: "files", page: 1, details: { items: [], total: 0 }, draft: { username: "", password: "", host: "127.0.0.1", port: 8080, https: false, cert: "", key: "", sqlitePath: "data/db/zhenxun.db", confirmedName: "", target: endpoint(), candidate: endpoint() }, steps: ["选择包", "核对配置", "替换与依赖", "最终确认"], sections: [{ label: "文件", value: "files" }, { label: "移除目录", value: "directories" }, { label: "依赖", value: "dependencies" }, { label: "依赖风险", value: "dependency_issues" }, { label: "跳过项目", value: "skipped" }] }),
  computed: {
    engine() { return this.inspection.database?.engine || null },
    external() { return ["mysql", "postgres"].includes(this.engine) },
    available() { return Boolean(this.capability?.restore && (!this.engine || this.capability?.databases?.[this.engine]?.restore_available)) },
    blockers() { return [...(this.capability?.restore_blockers || []), ...(this.capability?.databases?.[this.engine]?.online_restore_blockers || [])] },
  },
  watch: {
    draft: { deep: true, handler() { this.preflight = null; this.replacementConfirmed = false; setDirtyState("migration-restore", true) } },
    trusted() { setDirtyState("migration-restore", true) },
  },
  created() { this.sequence = 0; if (this.engine === "postgres") this.draft.target.port = this.draft.candidate.port = 5432 },
  beforeDestroy() { this.sequence += 1; clearDirtyState("migration-restore") },
  methods: {
    async login() {
      if (this.busy || !this.loginUsername || !this.loginPassword) return
      this.busy = true; const sequence = ++this.sequence
      try {
        await migrationLogin(this.loginUsername, this.loginPassword)
        if (sequence !== this.sequence) return
        this.loginPassword = ""; this.authRequired = false; this.error = ""
        this.preflight = null; this.registeredId = null; this.replacementConfirmed = false
        this.detailSequence = (this.detailSequence || 0) + 1; this.step = 1
        this.$emit("reauthenticated")
      } catch (error) { if (sequence === this.sequence) this.error = this.message(error) }
      finally { if (sequence === this.sequence) this.busy = false }
    },
    privateInput() {
      if (!this.draft.username || !this.draft.password || !this.draft.host) throw new Error("请填写确认后的管理员和监听地址")
      const configuration = { HOST: this.draft.host, PORT: String(this.draft.port), WEBUI_HTTPS_ENABLED: String(this.draft.https), WEBUI_TLS_CERTFILE: this.draft.https ? this.draft.cert : "", WEBUI_TLS_KEYFILE: this.draft.https ? this.draft.key : "" }
      const value = { configuration, administrator: { username: this.draft.username, password: this.draft.password }, archive_password: this.archivePassword || null }
      if (this.engine === "sqlite") configuration.DB_URL = `sqlite://${this.draft.sqlitePath}`
      if (this.external) {
        const url = scope => recoveryDatabase({ engine: this.engine, credentials_required: true, target: this.draft[scope] }, this.draft[scope].username, this.draft[scope].password).target_url
        value.database = { target_url: url("target"), candidate_url: url("candidate") }; configuration.DB_URL = value.database.target_url
      }
      return value
    },
    async next() {
      if (this.busy || this.authRequired || this.sourceBusy) return
      if (this.step !== 1) { this.step += 1; return }
      this.busy = true; this.error = ""; const sequence = ++this.sequence
      try {
        const privateInput = this.privateInput()
        let upload = this.uploadId || this.registeredId
        if (!upload) { const value = await migrationRequest("/packages/register", { method: "post", data: { path: this.discoveredPath, confirm_secrets: true } }); if (sequence !== this.sequence) return; this.registeredId = upload = value.id }
        const database = this.engine ? { engine: this.engine, source_path: this.inspection.database.path, confirmed_name: this.draft.confirmedName, ...(this.engine === "sqlite" ? { target_path: this.draft.sqlitePath } : {}) } : null
        const value = await migrationRequest("/preflight", { method: "post", data: { upload_id: upload, options: { first_deployment: this.firstDeployment === true, source_trusted: this.trusted, database }, private: privateInput } })
        if (sequence !== this.sequence) return
        this.preflight = value; this.step = 2; await this.loadDetails(1)
      } catch (error) { if (sequence === this.sequence) this.error = this.message(error) }
      finally { if (sequence === this.sequence) this.busy = false }
    },
    async loadDetails(page) {
      if (!this.preflight) return
      const id = this.preflight.id; const section = this.section; const sequence = this.detailSequence = (this.detailSequence || 0) + 1
      try { const value = await migrationRequest(`/preflights/${id}`, { params: { section, offset: (page - 1) * 50, limit: 50 } }); if (sequence === this.detailSequence && id === this.preflight?.id && section === this.section) { this.details = value; this.page = page } }
      catch (error) { if (sequence === this.detailSequence) this.error = this.message(error) }
    },
    async confirm() {
      if (this.busy || this.authRequired || this.sourceBusy || !this.available || !this.replacementConfirmed || !this.preflight) return
      this.busy = true; this.error = ""; const sequence = ++this.sequence
      try { const task = await migrationRequest(`/preflights/${this.preflight.id}/confirm`, { method: "post", data: { private: this.privateInput(), replacement_confirmed: true } }); if (sequence !== this.sequence) return; clearDirtyState("migration-restore"); this.$emit("submitted", task, { host: this.draft.host, port: this.draft.port, https: this.draft.https }) }
      catch (error) { if (sequence === this.sequence) this.error = this.message(error) }
      finally { if (sequence === this.sequence) this.busy = false }
    },
    message(error) { if (error.response?.status === 401) this.authRequired = true; return error.response?.data?.detail || error.message || "请求失败，恢复草稿已保留" },
    back() { this.step -= 1; if (this.step === 1) this.preflight = null },
    async close(done) {
      if (this.busy) return
      try { await this.$confirm("关闭将清除此恢复草稿及内存中的凭据。已确认的任务会继续执行。", "关闭恢复向导") } catch (_) { return }
      this.sequence += 1; this.detailSequence = (this.detailSequence || 0) + 1
      this.$emit("close"); if (typeof done === "function") done()
    },
  },
}
</script>

<style scoped>
.restore-wizard { overflow-wrap: anywhere; max-height: 65vh; overflow: auto; padding-right: 2px; }
.restore-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 0; list-style: none; }
.restore-steps li { padding: 10px 6px; background: #f0f3f5; border-bottom: 3px solid #dbe2e8; font-size: 13px; }
.restore-steps .active { color: #176665; border-color: #278e87; background: #e7f3f0; }
.restore-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.restore-code { overflow-wrap: anywhere; font-size: 12px; }
.restore-wizard ::v-deep .el-checkbox { display: flex; align-items: flex-start; white-space: normal; }
.restore-wizard ::v-deep .el-checkbox__label { white-space: normal; line-height: 1.6; }
.restore-wizard ::v-deep .el-input-number { width: 100%; }
.restore-wizard .el-alert { margin-bottom: 16px; }
.restore-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.restore-footer .el-button { margin: 0; }
@media (max-width: 500px) { .restore-grid { grid-template-columns: minmax(0, 1fr); } .restore-steps { grid-template-columns: repeat(2, 1fr); } }
</style>
