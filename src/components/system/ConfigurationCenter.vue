<template>
  <div class="configuration-center" v-loading="loading">
    <div class="configuration-toolbar">
      <div>
        <h2>运行配置</h2>
        <p>运行时配置会直接应用；监听、协议和未知自定义变量需要重启。</p>
      </div>
      <el-button icon="el-icon-refresh" :disabled="Boolean(saving)" @click="reloadSummary">重新加载</el-button>
    </div>

    <NetworkStatus :status="networkStatus" />
    <el-tabs v-model="section">
      <el-tab-pane label="环境配置" name="env">
        <el-form label-position="top" class="env-form">
          <section v-for="group in envFieldGroups" :key="group.title" class="env-field-group">
            <header><h3>{{ group.title }}</h3><p>{{ group.description }}</p></header>
            <div class="env-field-grid">
              <el-form-item v-for="field in group.fields" :key="field.key" :label="field.label">
                <el-switch v-if="field.type === 'switch'" v-model="envFields[field.key]" :disabled="fieldDisabled(field)" />
                <el-input-number v-else-if="field.type === 'number'" v-model="envFields[field.key]" :min="1" :max="65535" controls-position="right" class="full-control" :disabled="fieldDisabled(field)" />
                <el-radio-group v-else-if="field.type === 'http-mode'" v-model="envFields[field.key]" size="small" :disabled="fieldDisabled(field)">
                  <el-radio-button v-for="option in field.options" :key="option.value" :label="option.value">{{ option.label }}</el-radio-button>
                </el-radio-group>
                <el-input v-else v-model="envFields[field.key]" :placeholder="field.placeholder" :disabled="fieldDisabled(field)" />
                <div class="field-help">{{ field.help }}</div>
                <el-alert
                  v-if="field.key === 'WEBUI_HTTP_MODE' && envFields.WEBUI_HTTPS_ENABLED && envFields.WEBUI_HTTP_MODE === 'serve'"
                  class="plaintext-warning"
                  title="HTTP入口为明文传输，登录凭据和管理数据可能被同网段设备截获，请优先使用HTTPS。"
                  type="warning"
                  :closable="false"
                  show-icon
                />
                <el-tag size="mini" :type="effectMeta(envFieldEffects[field.key]).type">{{ effectMeta(envFieldEffects[field.key]).label }}</el-tag>
              </el-form-item>
            </div>
          </section>
          <section class="env-field-group custom-env-section">
            <header class="custom-env-heading">
              <div><h3>自定义环境变量</h3><p>用于第三方插件或外部服务。未知变量保存后需要重启生效。</p></div>
              <el-button size="small" icon="el-icon-plus" @click="addCustomEnv">添加变量</el-button>
            </header>
            <div v-if="customEnv.length" class="custom-env-list">
              <div v-for="(item, index) in customEnv" :key="item.clientId" class="custom-env-row" :class="{ deleted: item.deleted }">
                <el-input v-model="item.key" placeholder="变量名称" :disabled="!item.isNew || item.deleted" @input="markEnvDirty" />
                <el-input v-if="!item.sensitive || item.replacing || item.isNew" v-model="item.value" :type="item.sensitive ? 'password' : 'text'" :show-password="item.sensitive" placeholder="变量值" :disabled="item.deleted" @input="markEnvDirty" />
                <div v-else class="secret-configured"><i class="el-icon-lock"></i><span>已配置，值不会回传</span></div>
                <el-tag size="mini" type="warning">需要重启</el-tag>
                <el-button v-if="item.sensitive && !item.isNew && !item.replacing && !item.deleted" size="small" @click="beginSecretReplace(item)">替换</el-button>
                <el-button v-if="item.deleted" size="small" @click="restoreCustomEnv(item)">撤销</el-button>
                <el-button v-else type="danger" plain size="small" icon="el-icon-delete" @click="removeCustomEnv(item, index)">删除</el-button>
              </div>
            </div>
            <div v-else class="custom-env-empty">尚未配置自定义环境变量</div>
            <div v-if="customEnvError" class="inline-error">{{ customEnvError }}</div>
          </section>
        </el-form>
        <div class="action-bar">
          <span>{{ envSaveHint }}</span>
          <el-button type="primary" :loading="saving === 'env'" @click="saveEnv">保存环境配置</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="插件配置" name="simple">
        <div class="plugin-config-workbench">
          <aside class="config-groups">
            <el-input v-model="groupSearch" clearable prefix-icon="el-icon-search" placeholder="搜索配置组" size="small" />
            <button v-for="group in filteredGroups" :key="group.module" :class="{ active: selectedGroup === group.module }" @click="selectedGroup = group.module">
              <strong>{{ group.name }}</strong><span>{{ group.module }}</span>
            </button>
            <div v-if="!filteredGroups.length" class="group-empty">没有匹配的配置组</div>
          </aside>
          <section v-if="currentGroup" class="current-config-group">
            <header class="group-heading"><div><h3>{{ currentGroup.name }}</h3><p>{{ currentGroup.module }} · {{ currentGroup.fields.length }} 个配置项</p></div><el-button size="small" @click="resetCurrentGroup">恢复本组默认值</el-button></header>
            <div class="config-form-scroll">
              <SchemaForm :key="selectedGroup" :value="currentGroupValue" :schema="currentGroupSchema" :field-ui="currentGroupUi" :issues="pluginIssues" @input="updateCurrentGroup" @validity-change="pluginInvalidPaths = $event" />
              <div v-for="field in currentSensitiveFields" :key="field.key" class="sensitive-placeholder"><i class="el-icon-lock"></i><span><strong>{{ (field.ui && field.ui.label) || field.key }}</strong>为敏感字段，请在高级原文中修改。</span></div>
            </div>
            <div class="action-bar config-action-bar">
              <span>{{ Object.keys(simpleChanges).length ? `${Object.keys(simpleChanges).length} 个配置组有未保存修改` : "未知配置组和字段会原样保留" }}</span>
              <el-button type="primary" icon="el-icon-check" :loading="saving === 'simple'" :disabled="pluginInvalidPaths.length > 0 || !Object.keys(simpleChanges).length" @click="saveSimple">保存配置</el-button>
            </div>
          </section>
          <section v-else class="current-config-empty"><i class="el-icon-setting"></i><p>选择一个配置组开始编辑</p></section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="高级原文" name="raw" lazy>
        <el-alert title="原文可能包含 Token、密码和 Secret。请勿截图、分享或粘贴到外部服务。" type="warning" :closable="false" show-icon />
        <div class="raw-switch">
          <el-radio-group :value="rawFile" size="small" :disabled="Boolean(saving)" @input="loadRaw">
            <el-radio-button label="env">.env.dev</el-radio-button>
            <el-radio-button label="simple">config.yaml</el-radio-button>
          </el-radio-group>
          <el-button size="small" icon="el-icon-refresh" @click="loadRaw(rawFile)">重新读取</el-button>
        </div>
        <el-input v-model="rawContent" type="textarea" :rows="22" resize="vertical" class="raw-editor" spellcheck="false" />
        <div v-if="rawError" class="inline-error">{{ rawError }}</div>
        <ul v-if="rawIssues.length" class="validation-issues">
          <li v-for="(issue, index) in rawIssues" :key="`${issue.code}-${index}`">
            <code v-if="issue.line">第 {{ issue.line }} 行<span v-if="issue.column">:{{ issue.column }}</span></code>
            <span>{{ issue.message }}</span>
          </li>
        </ul>
        <div class="action-bar">
          <span>保存前会重新校验语法和 revision</span>
          <el-button :loading="validating" :disabled="!rawReady" @click="validateRaw">校验</el-button>
          <el-button type="primary" :loading="saving === 'raw'" :disabled="!rawReady" @click="saveRaw">保存</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

  </div>
</template>

<script>
import SchemaForm from "@/components/config/SchemaForm.vue"
import NetworkStatus from "@/components/system/NetworkStatus.vue"
import { apiErrorDetail, apiErrorIssues } from "@/utils/api-error"
import { handleApplyResult } from "@/utils/apply-result"
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"

export default {
  name: "ConfigurationCenter",
  components: { SchemaForm, NetworkStatus },
  data() {
    return {
      networkStatus: {}, rawLoading: false,
      loading: false, saving: "", validating: false, section: "env", envRevision: "", simpleRevision: "", envFields: {}, originalEnvFields: {}, envFieldEffects: {}, customEnv: [], originalCustomEnv: [], customEnvError: "", customEnvSequence: 0, groups: [], simpleChanges: {}, groupSearch: "", selectedGroup: "", launcherManaged: false,
      rawFile: "env", rawContent: "", rawOriginal: "", rawRevision: "", rawError: "", rawIssues: [], rawLoaded: {}, pluginInvalidPaths: [], pluginIssues: [],
      envFieldDefinitions: [
        { key: "HOST", label: "监听地址", placeholder: "0.0.0.0", help: "0.0.0.0 允许局域网访问，127.0.0.1 仅本机访问。" },
        { key: "PORT", label: "监听端口", type: "number", placeholder: "8080", help: "WebUI 与适配器共享的本地服务端口；启用 HTTPS 后该端口提供 HTTPS。" },
        { key: "WEBUI_HTTPS_ENABLED", label: "启用 HTTPS", type: "switch", help: "使用用户提供的可信 PEM 证书和私钥，需要重启生效。" },
        { key: "WEBUI_TLS_CERTFILE", label: "TLS 证书路径", placeholder: "C:\\certs\\fullchain.pem", dependsOn: "WEBUI_HTTPS_ENABLED", help: "证书 PEM 的绝对路径，保存时会检查有效期及密钥匹配。" },
        { key: "WEBUI_TLS_KEYFILE", label: "TLS 私钥路径", placeholder: "C:\\certs\\privkey.pem", dependsOn: "WEBUI_HTTPS_ENABLED", help: "未加密私钥 PEM 的绝对路径。" },
        { key: "WEBUI_HTTP_MODE", label: "HTTP兼容入口", type: "http-mode", dependsOn: "WEBUI_HTTPS_ENABLED", launcherOnly: true, options: [{ value: "serve", label: "完整访问" }, { value: "redirect", label: "跳转HTTPS" }, { value: "disabled", label: "关闭" }], help: "完整访问由launcher边车代理API、静态资源和WebSocket；边车异常不会中断HTTPS和Bot。" },
        { key: "WEBUI_HTTP_REDIRECT_PORT", label: "HTTP兼容端口", type: "number", dependsOn: "WEBUI_HTTPS_ENABLED", httpModeRequired: true, launcherOnly: true, placeholder: "80", help: "默认80；端口冲突时HTTPS继续运行，HTTP入口进入降级并自动重试。" },
        { key: "LOG_LEVEL", label: "日志等级", placeholder: "INFO", help: "常用值为 DEBUG、INFO、WARNING。" },
        { key: "SYSTEM_PROXY", label: "系统代理", placeholder: "http://127.0.0.1:7890", help: "留空表示不使用代理。" },
        { key: "NICKNAME", label: "机器人昵称", placeholder: "[\"真寻\"]", help: "使用 dotenv 支持的列表格式。" },
        { key: "SELF_NICKNAME", label: "回复昵称", placeholder: "真寻", help: "回复消息中使用的自称。" },
        { key: "COMMAND_START", label: "命令前缀", placeholder: "[\"/\"]", help: "支持多个命令前缀。" },
        { key: "COMMAND_SEP", label: "命令分隔符", placeholder: "[\".\"]", help: "修改后会重建受影响的命令注册。" },
        { key: "ALCONNA_USE_COMMAND_START", label: "Alconna 使用命令前缀", type: "switch", help: "修改后会重载受影响的 Alconna 插件。" },
        { key: "SUPERUSERS", label: "超级用户", placeholder: "[\"123456\"]", help: "平台用户 ID 列表。" },
        { key: "PLATFORM_SUPERUSERS", label: "平台超级用户", placeholder: "{\"qq\":[\"123456\"]}", help: "按平台分别配置超级用户。" },
        { key: "SESSION_EXPIRE_TIMEOUT", label: "会话超时", placeholder: "120", help: "交互会话的超时秒数。" },
        { key: "IMAGE_TO_BYTES", label: "图片字节发送", type: "switch", help: "仅在适配器需要时开启。" },
        { key: "EXT_PATH", label: "扩展插件路径", placeholder: "[]", help: "额外插件目录列表。" },
      ],
    }
  },
  computed: {
    envFieldGroups() {
      return [
        { title: "WebUI 访问与 HTTPS", description: "配置HTTPS主入口及独立的HTTP兼容访问模式。", fields: this.envFieldDefinitions.slice(0, 7) },
        { title: "机器人运行环境", description: "配置日志、代理、昵称、权限和插件加载路径。", fields: this.envFieldDefinitions.slice(7) },
      ]
    },
    customOperations() {
      const original = new Map(this.originalCustomEnv.map((item) => [item.key, item]))
      const operations = []
      this.customEnv.forEach((item) => {
        if (item.deleted && !item.isNew) operations.push({ key: item.key, operation: "delete" })
        else if (item.isNew && item.key.trim()) operations.push({ key: item.key.trim(), operation: "set", value: item.value || "" })
        else if (item.replacing) operations.push({ key: item.key, operation: "set", value: item.value || "" })
        else if (!item.sensitive && original.get(item.key)?.value !== item.value) operations.push({ key: item.key, operation: "set", value: item.value || "" })
      })
      return operations
    },
    envSaveHint() {
      const changedKeys = Object.keys(this.changedEnvFields())
      const needsRestart = this.customOperations.length > 0 || changedKeys.some((key) => ["restart_required", "worker_restart"].includes(this.envFieldEffects[key]))
      if (!changedKeys.length && !this.customOperations.length) return "仅实际变化会触发运行时操作"
      if (!needsRestart) return "保存后立即应用，必要时只重载相关插件或服务"
      return this.launcherManaged ? "包含启动期配置，保存后可选择立即重启" : "包含启动期配置，保存后需要手动重启"
    },
    rawReady() { return Boolean(this.rawLoaded[this.rawFile] && /^[a-f0-9]{64}$/.test(this.rawRevision)) },
    filteredGroups() {
      const keyword = this.groupSearch.trim().toLowerCase()
      if (!keyword) return this.groups
      return this.groups.filter((group) => `${group.name} ${group.module} ${group.fields.map((field) => field.key).join(" ")}`.toLowerCase().includes(keyword))
    },
    currentGroup() { return this.groups.find((group) => group.module === this.selectedGroup) || null },
    editableCurrentFields() { return this.currentGroup ? this.currentGroup.fields.filter((field) => !field.sensitive) : [] },
    currentSensitiveFields() { return this.currentGroup ? this.currentGroup.fields.filter((field) => field.sensitive) : [] },
    currentGroupValue() { return Object.fromEntries(this.editableCurrentFields.map((field) => [field.key, field.value])) },
    currentGroupSchema() {
      const result = { type: "object", properties: {}, $defs: {}, definitions: {} }
      this.editableCurrentFields.forEach((field) => {
        const schema = field.schema || { type: "string" }
        result.properties[field.key] = schema
        Object.assign(result.$defs, schema.$defs || {})
        Object.assign(result.definitions, schema.definitions || {})
      })
      return result
    },
    currentGroupUi() { return Object.fromEntries(this.editableCurrentFields.map((field) => [field.key, { label: field.ui?.label || field.key, ...(field.ui || {}), description: field.help }])) },
  },
  mounted() { this.loadSummary() },
  beforeDestroy() { clearDirtyState("plugin-configuration"); clearDirtyState("environment-configuration"); clearDirtyState("raw-configuration") },
  methods: {
    normalizedEnvFields(fields) {
      const result = { ...fields }
      if (!["serve", "redirect", "disabled"].includes(result.WEBUI_HTTP_MODE)) {
        result.WEBUI_HTTP_MODE = [true, "true", "1", "yes", "on"].includes(
          typeof result.WEBUI_HTTP_REDIRECT_ENABLED === "string"
            ? result.WEBUI_HTTP_REDIRECT_ENABLED.toLowerCase()
            : result.WEBUI_HTTP_REDIRECT_ENABLED
        ) ? "redirect" : "serve"
      }
      this.envFieldDefinitions.forEach((field) => {
        if (field.type === "switch") result[field.key] = [true, "true", "1", "yes", "on"].includes(typeof result[field.key] === "string" ? result[field.key].toLowerCase() : result[field.key])
        if (field.type === "number") result[field.key] = Number(result[field.key] || (field.key === "WEBUI_HTTP_REDIRECT_PORT" ? 80 : 8080))
      })
      return result
    },
    effectMeta(effect) {
      return {
        in_place: { label: "立即生效", type: "success" },
        component_restart: { label: "重建组件", type: "success" },
        plugin_reactivate: { label: "重载插件", type: "success" },
        worker_restart: { label: "需要重启", type: "warning" },
        hot_reload: { label: "立即生效", type: "success" },
        plugin_reload: { label: "重载插件", type: "success" },
        service_reload: { label: "重建服务", type: "success" },
        restart_required: { label: "需要重启", type: "warning" },
      }[effect] || { label: "需要重启", type: "warning" }
    },
    normalizeCustomEnv(items) {
      return (items || []).map((item) => ({ ...item, clientId: `env-${++this.customEnvSequence}`, value: item.value || "", replacing: false, deleted: false, isNew: false }))
    },
    fieldDisabled(field) {
      return Boolean(
        (field.dependsOn && !this.envFields[field.dependsOn]) ||
        (field.httpModeRequired && this.envFields.WEBUI_HTTP_MODE === "disabled") ||
        (field.launcherOnly && !this.launcherManaged)
      )
    },
    normalizeGroups(groups) {
      return (groups || []).filter((group) => group.module !== "AI").map((group) => ({ ...group, fields: group.fields.map((field) => ({ ...field })) }))
    },
    async confirmDiscard(message) {
      try { await this.$confirm(message, "放弃未保存修改？", { type: "warning", confirmButtonText: "放弃修改", cancelButtonText: "继续编辑" }); return true } catch (_) { return false }
    },
    async reloadSummary() {
      if (this.saving || this.loading) return
      if ((Object.keys(this.changedEnvFields()).length || this.customOperations.length || Object.keys(this.simpleChanges).length) && !await this.confirmDiscard("环境及插件配置草稿将重新读取；高级原文草稿保持不变。")) return
      await this.loadSummary()
    },
    async loadSummary(scope = "all") {
      this.loading = true
      try {
        const response = await this.getRequest(`${this.$root.prefix}/system/configuration/summary`)
        if (!response.suc) throw new Error(response.info)
        this.networkStatus = response.data.network || {}
        if (scope === "all" || scope === "env") {
        this.envRevision = response.data.env.revision
        this.envFields = this.normalizedEnvFields(response.data.env.fields)
        this.originalEnvFields = this.normalizedEnvFields(response.data.env.fields)
        this.envFieldEffects = response.data.env.field_effects || {}
        this.customEnv = this.normalizeCustomEnv(response.data.env.custom_env)
        this.originalCustomEnv = this.customEnv.map((item) => ({ ...item }))
        this.customEnvError = ""
        clearDirtyState("environment-configuration")
        }
        if (scope === "all" || scope === "simple") {
        this.simpleRevision = response.data.simple.revision
        this.groups = this.normalizeGroups(response.data.simple.groups)
        if (!this.groups.some((group) => group.module === this.selectedGroup)) this.selectedGroup = this.groups[0]?.module || ""
        this.pluginInvalidPaths = []; this.pluginIssues = []
        this.simpleChanges = {}
        clearDirtyState("plugin-configuration")
        }
        this.launcherManaged = response.data.launcher_managed
      } catch (error) { this.$message.error(error.message || "配置摘要加载失败") }
      finally { this.loading = false }
    },
    markSimpleChanged(module, field) {
      if (!this.simpleChanges[module]) this.$set(this.simpleChanges, module, {})
      this.$set(this.simpleChanges[module], field.key, field.value)
    },
    updateCurrentGroup(value) {
      if (!this.currentGroup) return
      this.editableCurrentFields.forEach((field) => { if (Object.prototype.hasOwnProperty.call(value, field.key)) field.value = value[field.key] })
      this.$set(this.simpleChanges, this.currentGroup.module, { ...value }); this.pluginIssues = []
      setDirtyState("plugin-configuration", true)
    },
    resetCurrentGroup() {
      if (!this.currentGroup) return
      const values = {}
      this.editableCurrentFields.forEach((field) => { field.value = field.default_value == null ? field.default_value : JSON.parse(JSON.stringify(field.default_value)); values[field.key] = field.value })
      this.$set(this.simpleChanges, this.currentGroup.module, values)
      setDirtyState("plugin-configuration", true)
    },
    changedEnvFields() {
      const changed = {}
      this.envFieldDefinitions.forEach(({ key }) => { if (this.envFields[key] !== this.originalEnvFields[key]) changed[key] = this.envFields[key] == null ? "" : this.envFields[key] })
      return changed
    },
    addCustomEnv() { this.customEnv.push({ clientId: `env-${++this.customEnvSequence}`, key: "", value: "", sensitive: false, configured: false, replacing: false, deleted: false, isNew: true }); this.markEnvDirty() },
    beginSecretReplace(item) { item.replacing = true; item.value = ""; this.markEnvDirty() },
    removeCustomEnv(item, index) { if (item.isNew) this.customEnv.splice(index, 1); else item.deleted = true; this.markEnvDirty() },
    restoreCustomEnv(item) { item.deleted = false; this.markEnvDirty() },
    validateCustomEnv() {
      const active = this.customEnv.filter((item) => !item.deleted)
      const keys = active.map((item) => item.key.trim())
      if (keys.some((key) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))) return "变量名称只能包含字母、数字和下划线，且不能以数字开头。"
      if (new Set(keys.map((key) => key.toLowerCase())).size !== keys.length) return "自定义环境变量名称不能重复。"
      return ""
    },
    markEnvDirty() { this.customEnvError = this.validateCustomEnv(); setDirtyState("environment-configuration", Object.keys(this.changedEnvFields()).length > 0 || this.customOperations.length > 0) },
    async saveEnv() {
      if (this.saving) return
      const fields = this.changedEnvFields()
      this.customEnvError = this.validateCustomEnv()
      if (this.customEnvError) return
      const customOperations = this.customOperations
      if (!Object.keys(fields).length && !customOperations.length) return this.$message.info("没有需要保存的环境配置。")
      this.saving = "env"
      const submittedFields = JSON.stringify(this.envFields)
      const submittedCustom = JSON.stringify(this.customEnv)
      try {
        const response = await this.putRequest(`${this.$root.prefix}/system/configuration/files/env`, { expected_revision: this.envRevision, fields, custom_operations: customOperations })
        if (!response.suc) throw new Error(response.info)
        if (response.data?.apply_mode !== "failed") {
          const fieldsDraft = this.envFields
          const customDraft = this.customEnv
          await this.loadSummary("env")
          if (JSON.stringify(fieldsDraft) !== submittedFields) this.envFields = fieldsDraft
          if (JSON.stringify(customDraft) !== submittedCustom) this.customEnv = customDraft
          this.markEnvDirty()
        }
        await handleApplyResult(this, response, {
          restartRequest: () => this.postRequest(`${this.$root.prefix}/system/configuration/restart`, {}),
          returnRoute: "/system",
        })
      } catch (error) { this.$message.error(apiErrorDetail(error, "保存失败")) }
      finally { this.saving = "" }
    },
    async saveSimple() {
      if (this.saving) return
      if (!Object.keys(this.simpleChanges).length) return this.$message.info("没有需要保存的插件配置。")
      this.saving = "simple"
      const submitted = JSON.parse(JSON.stringify(this.simpleChanges))
      try {
        const response = await this.putRequest(`${this.$root.prefix}/system/configuration/files/simple`, { expected_revision: this.simpleRevision, fields: this.simpleChanges })
        if (!response.suc) throw new Error(response.info)
        if (response.data?.apply_mode !== "failed") { this.simpleRevision = response.data.revision; Object.keys(submitted).forEach(module => { if (JSON.stringify(this.simpleChanges[module]) === JSON.stringify(submitted[module])) this.$delete(this.simpleChanges, module) }); setDirtyState("plugin-configuration", Boolean(Object.keys(this.simpleChanges).length)) }
        await handleApplyResult(this, response, {
          restartRequest: () => this.postRequest(`${this.$root.prefix}/system/configuration/restart`, {}),
          returnRoute: "/system",
        })
      } catch (error) { this.pluginIssues = apiErrorIssues(error); this.$message.error(apiErrorDetail(error, "保存失败")) }
      finally { this.saving = "" }
    },
    async loadRaw(file) {
      if (this.saving || this.rawLoading) return
      if (this.rawContent !== this.rawOriginal && !await this.confirmDiscard("高级原文中的未保存修改将被放弃。")) return
      this.rawLoading = true
      try {
        const response = await this.getRequest(`${this.$root.prefix}/system/configuration/files/${file}`, {}, { suppressErrorToast: true })
        if (!response.suc) throw new Error(response.info)
        this.rawFile = file; this.rawError = ""; this.rawIssues = []
        this.rawContent = response.data.content; this.rawOriginal = response.data.content; this.rawRevision = response.data.revision; this.$set(this.rawLoaded, file, true); clearDirtyState("raw-configuration")
      } catch (error) { this.rawError = apiErrorDetail(error, "配置文件读取失败。") }
      finally { this.rawLoading = false }
    },
    async validateRaw() {
      if (!this.rawReady) return
      this.validating = true; this.rawError = ""; this.rawIssues = []
      try {
        const response = await this.postRequest(`${this.$root.prefix}/system/configuration/validate`, { file: this.rawFile, content: this.rawContent })
        if (!response.suc) throw new Error(response.info)
        this.$message.success("配置语法检查通过。")
      } catch (error) { this.rawIssues = apiErrorIssues(error); this.rawError = apiErrorDetail(error, "配置校验失败。") }
      finally { this.validating = false }
    },
    async saveRaw() {
      if (!this.rawReady || this.saving) return
      this.saving = "raw"; this.rawError = ""; this.rawIssues = []
      const content = this.rawContent
      try {
        const response = await this.putRequest(`${this.$root.prefix}/system/configuration/files/${this.rawFile}`, { expected_revision: this.rawRevision, content: this.rawContent })
        if (!response.suc) throw new Error(response.info)
        if (response.data?.apply_mode !== "failed") { this.rawRevision = response.data.revision; this.rawOriginal = content; setDirtyState("raw-configuration", this.rawContent !== content) }
        await handleApplyResult(this, response, {
          restartRequest: () => this.postRequest(`${this.$root.prefix}/system/configuration/restart`, {}),
          returnRoute: "/system",
        })
      } catch (error) { this.rawIssues = apiErrorIssues(error); this.rawError = apiErrorDetail(error, "保存失败。"); if (error.response?.status === 409) this.$set(this.rawLoaded, this.rawFile, false) }
      finally { this.saving = "" }
    },
  },
  watch: {
    section(value) { if (value === "raw" && !this.rawLoaded[this.rawFile]) this.loadRaw(this.rawFile) },
    selectedGroup() { this.pluginInvalidPaths = [] },
    envFields: { deep: true, handler() { this.markEnvDirty() } },
    customEnv: { deep: true, handler() { this.markEnvDirty() } },
    rawContent(value) { setDirtyState("raw-configuration", Boolean(this.rawReady && value !== this.rawOriginal)) },
  },
}
</script>

<style scoped>
.configuration-center { min-height: 420px; }.configuration-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }.configuration-toolbar h2 { margin: 0; font-size: 20px; }.configuration-toolbar p { margin: 5px 0 0; color: var(--text-color-secondary); }
.env-form { display: flex; flex-direction: column; gap: 18px; }.env-field-group { padding: 16px 18px 2px; border: 1px solid var(--border-color); border-radius: 8px; }.env-field-group > header { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color-light); }.env-field-group h3 { margin: 0; font-size: 16px; }.env-field-group header p { margin: 5px 0 0; color: var(--text-color-secondary); font-size: 12px; }.env-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }.field-help { margin-top: 5px; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; }.plugin-config-workbench { display: grid; height: clamp(360px, calc(100vh - 370px), 680px); grid-template-columns: 230px minmax(0, 1fr); overflow: hidden; border: 1px solid var(--border-color); border-radius: 8px; }.config-groups { display: flex; min-width: 0; flex-direction: column; gap: 4px; padding: 14px; overflow-y: auto; border-right: 1px solid var(--border-color); }.config-groups .el-input { margin-bottom: 8px; }.config-groups button { display: flex; min-height: 54px; flex-direction: column; justify-content: center; padding: 7px 9px; border: 1px solid transparent; border-radius: 6px; color: var(--text-color); background: transparent; text-align: left; cursor: pointer; }.config-groups button:hover { background: var(--bg-color-hover); }.config-groups button.active { border-color: var(--primary-color); background: var(--bg-color-hover); }.config-groups button strong, .config-groups button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.config-groups button span { margin-top: 3px; color: var(--text-color-secondary); font-size: 11px; }.current-config-group { display: flex; min-width: 0; min-height: 0; flex-direction: column; padding: 18px 20px 0; }.config-form-scroll { min-height: 0; flex: 1; padding-right: 5px; overflow-y: auto; }.group-heading { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color-light); }.group-heading h3 { margin: 0; font-size: 18px; }.group-heading p { margin: 4px 0 0; color: var(--text-color-secondary); font-size: 12px; }.group-empty, .current-config-empty { color: var(--text-color-secondary); text-align: center; }.group-empty { padding: 24px 4px; }.current-config-empty { display: grid; place-content: center; }.current-config-empty i { font-size: 36px; }.sensitive-placeholder { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 11px; border: 1px dashed var(--border-color); border-radius: 5px; color: var(--text-color-secondary); }
.plaintext-warning { margin: 8px 0; }
.action-bar { position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 16px; padding: 12px 0; border-top: 1px solid var(--border-color); background: var(--bg-color-secondary); }.config-action-bar { position: static; flex: none; margin-top: 8px; }.action-bar span { margin-right: auto; color: var(--text-color-secondary); font-size: 12px; }.raw-switch { display: flex; align-items: center; justify-content: space-between; margin: 14px 0 10px; }.raw-editor ::v-deep textarea { font-family: Consolas, "Courier New", monospace; font-size: 13px; line-height: 1.55; }.inline-error { margin-top: 8px; color: var(--el-color-danger); }
.validation-issues { margin: 10px 0 0; padding: 10px 14px 10px 34px; border: 1px solid rgba(224,82,96,.35); border-radius: 6px; color: var(--danger-color); background: rgba(224,82,96,.06); }.validation-issues li { margin: 4px 0; line-height: 1.55; }.validation-issues code { margin-right: 8px; }
.custom-env-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }.custom-env-list { display: flex; flex-direction: column; gap: 10px; padding-bottom: 16px; }.custom-env-row { display: grid; grid-template-columns: minmax(150px, .8fr) minmax(220px, 1.4fr) auto auto auto; align-items: center; gap: 9px; }.custom-env-row.deleted { opacity: .58; }.secret-configured { display: flex; min-height: 40px; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-color-secondary); }.custom-env-empty { padding: 8px 0 20px; color: var(--text-color-secondary); text-align: center; }
@media (max-width: 760px) { .env-field-grid { grid-template-columns: 1fr; }.env-field-group { padding: 14px 14px 2px; }.configuration-toolbar, .custom-env-heading { align-items: flex-start; flex-direction: column; }.custom-env-row { grid-template-columns: 1fr auto; }.custom-env-row > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }.plugin-config-workbench { grid-template-columns: 1fr; }.config-groups { display: grid; max-height: 240px; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow-y: auto; border-right: 0; border-bottom: 1px solid var(--border-color); }.config-groups .el-input { grid-column: 1 / -1; }.current-config-group { padding: 14px; }.group-heading { align-items: flex-start; flex-direction: column; }.action-bar { flex-wrap: wrap; }.action-bar span { width: 100%; }.raw-switch { gap: 10px; } }
</style>
