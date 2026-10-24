<template>
  <el-drawer :visible="visible" :title="model ? `编辑模型 · ${model.name}` : '添加模型'" size="min(600px, 100%)" append-to-body custom-class="model-editor" :wrapper-closable="!checking" @update:visible="$emit('update:visible', $event)" @closed="$emit('closed')">
    <div class="editor-body">
      <section class="editor-section">
        <h3>基本信息</h3>
        <div class="basic-grid">
          <label class="field"><span>模型名称</span><el-input v-model="draft.name" placeholder="请求时发送的 model，如 deepseek-v4-flash" /></label>
          <label class="field field-switch"><span>启用</span><el-switch v-model="draft.enabled" /></label>
          <label class="field field-wide"><span>能力参照</span><el-input v-model="draft.reference" clearable placeholder="中转站自定义别名时，填写对应的官方模型名，如 gpt-5.6-luna" /></label>
        </div>
        <p class="hint">{{ catalogHint }}</p>
      </section>

      <section class="editor-section">
        <div class="section-heading">
          <h3>能力</h3>
          <el-tag size="mini" effect="plain" :type="checkTag.type">{{ checkTag.label }}</el-tag>
          <el-popover v-if="isChat" v-model="checkPopover" placement="bottom-end" width="300" :disabled="checking">
            <p class="popover-title">核验项目</p>
            <el-checkbox-group v-model="checkItems" class="check-items"><el-checkbox v-for="(label, key) in checkLabels" :key="key" :label="key" :disabled="key === 'chat'">{{ label }}<small v-if="paidItems.includes(key)">额外工具费用</small></el-checkbox></el-checkbox-group>
            <p class="hint">按所选项目各发起一到两次小请求，可能产生少量费用；核验使用本页尚未保存的设置。</p>
            <div class="popover-actions"><el-button size="mini" @click="checkPopover = false">取消</el-button><el-button size="mini" type="primary" :disabled="!canCheck" @click="runCheck">开始核验</el-button></div>
            <el-button slot="reference" size="mini" type="primary" plain icon="el-icon-finished" :loading="checking" :disabled="!canCheck">核验能力</el-button>
          </el-popover>
        </div>
        <p class="hint">“自动”时依次取实测核验、模型发现、能力库、名称推断；强制开启的能力被接口拒绝时只对当次请求降级重试，并在控制台警告。</p>
        <el-alert v-if="chatFailure" type="error" :closable="false" show-icon :title="`基本对话失败：${chatFailure}`" class="chat-failure" />
        <div class="capability-list">
          <div v-for="row in capabilityRows" :key="row.key" class="capability-row">
            <div class="capability-head">
              <strong>{{ row.label }}</strong>
              <span class="capability-value">{{ row.value }}</span>
              <el-tag v-if="row.source" size="mini" effect="plain" :type="row.source === '手动' ? 'warning' : row.source === '实测' ? 'success' : 'info'">{{ row.source }}</el-tag>
              <el-tooltip v-if="row.result && !(row.source === '实测' && !row.result.detail)" :content="row.result.detail || resultText(row.result)" :disabled="!row.result.detail" placement="top">
                <span class="capability-result" :class="`result-${row.result.status}`">实测：{{ resultText(row.result) }}<template v-if="row.result.detail">（{{ brief(row.result.detail) }}）</template></span>
              </el-tooltip>
            </div>
            <el-select v-if="row.kind === 'multi'" v-model="draft.overrides[row.key]" multiple clearable size="small" placeholder="自动" class="capability-control"><el-option v-for="(label, key) in row.options" :key="key" :label="label" :value="key" /></el-select>
            <el-input-number v-else-if="row.kind === 'number'" v-model="draft.overrides[row.key]" :min="1" size="small" controls-position="right" placeholder="自动" class="capability-number" />
            <el-radio-group v-else-if="row.kind === 'native'" v-model="draft.nativeTools[row.type]" size="mini"><el-radio-button label="">自动</el-radio-button><el-radio-button label="on">强制开启</el-radio-button><el-radio-button label="off">强制关闭</el-radio-button></el-radio-group>
            <el-radio-group v-else v-model="draft.overrides[row.key]" size="mini"><el-radio-button label="">自动</el-radio-button><el-radio-button v-for="(label, key) in row.options" :key="key" :label="key">{{ label }}</el-radio-button></el-radio-group>
          </div>
        </div>
      </section>

      <el-collapse v-model="advancedOpen" class="editor-section advanced-section">
        <el-collapse-item title="高级" name="advanced">
          <div class="basic-grid">
            <label class="field"><span>协议覆盖</span><el-select v-model="draft.protocol" clearable placeholder="使用服务商协议" class="full"><el-option v-for="item in protocols" :key="item" :label="protocolLabels[item] || item" :value="item" /></el-select></label>
            <label class="field"><span>地址覆盖</span><el-input v-model="draft.base_url" placeholder="使用服务商地址" /></label>
            <label class="field field-wide"><span>默认生成参数（JSON）</span><el-input v-model="draft.paramsText" type="textarea" :rows="3" placeholder='{"temperature": 0.7}' /><em v-if="paramsError">{{ paramsError }}</em></label>
            <label class="field field-wide"><span>其他能力字段（JSON）</span><el-input v-model="draft.extraText" type="textarea" :rows="3" placeholder='{"reasoning_param": "budget"}' /><em v-if="extraError">{{ extraError }}</em></label>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
    <div class="editor-footer">
      <el-button :disabled="checking" @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" icon="el-icon-check" :disabled="checking" @click="confirm">确定</el-button>
    </div>
  </el-drawer>
</template>

<script>
import { apiErrorDetail } from "@/utils/api-error"
import { CHECK_LABELS, DEFAULT_CHECK_ITEMS, MODALITY_LABELS, NATIVE_TOOL_LABELS, PAID_CHECK_ITEMS, PROTOCOL_LABELS, REASONING_LEVELS, SOURCE_LABELS, STRUCTURED_LABELS, TASK_LABELS, briefDetail, checkResultText, checkState, checkSummary, clone, formatTokens, jsonError, jsonText, parseJsonObject, presetOfUrl } from "@/utils/ai-models"

const LIST_FIELDS = ["tasks", "input_modalities", "reasoning_levels"]
const HANDLED = [...LIST_FIELDS, "context_window", "max_output_tokens", "tools", "structured_output", "native_tools", "native_tools_off"]
const PROTOCOL_VENDORS = { openai_responses: "openai", gemini: "gemini", anthropic: "anthropic" }
const RESULT_ITEMS = { tools: "tools", structured_output: "structured_output", input_modalities: "image", reasoning_levels: "reasoning", "native.web_search": "web_search", "native.url_context": "url_context" }

export default {
  name: "ModelEditor",
  props: {
    visible: Boolean,
    model: { type: Object, default: null },
    names: { type: Array, default: () => [] },
    protocols: { type: Array, default: () => [] },
    canCheck: Boolean,
    checker: { type: Function, required: true },
    presets: { type: Object, default: () => ({}) },
    connection: { type: Object, default: () => ({}) },
  },
  data() {
    return { draft: this.emptyDraft(), raw: {}, resolved: null, check: null, checkedName: "", checking: false, checkPopover: false, checkItems: [...DEFAULT_CHECK_ITEMS], advancedOpen: [], checkLabels: CHECK_LABELS, paidItems: PAID_CHECK_ITEMS, protocolLabels: PROTOCOL_LABELS }
  },
  computed: {
    paramsError() { return jsonError(this.draft.paramsText) },
    extraError() { return jsonError(this.draft.extraText) },
    isChat() { const tasks = this.draft.overrides.tasks.length ? this.draft.overrides.tasks : this.resolved?.tasks || ["chat"]; return tasks.includes("chat") },
    checkTag() {
      const state = checkState({ check: this.check })
      return this.check?.checked_at ? { ...state, label: `已核验 ${new Date(this.check.checked_at * 1000).toLocaleString()}` } : state
    },
    chatFailure() { const row = (this.check?.results || []).find((item) => item.item === "chat" && item.status === "failed"); return row ? briefDetail(row.detail) : "" },
    catalogHint() {
      if (!this.resolved) return "保存或核验后显示能力来源。中转站使用自定义别名时，填写能力参照可匹配能力库。"
      return Object.values(this.resolved.sources || {}).includes("catalog") ? "该模型已在能力库中匹配。" : "该模型未在能力库中匹配；中转站自定义别名可填写能力参照。"
    },
    /**
     * 能力表的各行：当前生效值、来源、实测结果与覆盖控件
     * @returns {object[]} 行定义
     */
    capabilityRows() {
      const rows = [
        { key: "tasks", label: "任务", kind: "multi", options: TASK_LABELS },
        { key: "input_modalities", label: "输入模态", kind: "multi", options: MODALITY_LABELS },
        { key: "context_window", label: "上下文窗口", kind: "number" },
        { key: "max_output_tokens", label: "最大输出", kind: "number" },
        { key: "reasoning_levels", label: "推理强度", kind: "multi", options: Object.fromEntries(REASONING_LEVELS.map((item) => [item, item])) },
        { key: "tools", label: "工具调用", kind: "choice", options: { on: "强制开启", off: "强制关闭" } },
        { key: "structured_output", label: "结构化输出", kind: "choice", options: STRUCTURED_LABELS },
        ...Object.keys(this.draft.nativeTools).map((type) => ({ key: `native.${type}`, type, label: NATIVE_TOOL_LABELS[type] || type, kind: "native" })),
      ]
      const chatOnly = ["reasoning_levels", "tools", "structured_output"]
      return rows.filter((row) => this.isChat || !(chatOnly.includes(row.key) || row.kind === "native")).map((row) => ({ ...row, ...this.effective(row) }))
    },
  },
  watch: {
    visible(value) { if (value) this.load() },
  },
  methods: {
    emptyDraft() { return { name: "", enabled: true, reference: "", protocol: null, base_url: "", paramsText: "", extraText: "", overrides: { tasks: [], input_modalities: [], reasoning_levels: [], context_window: undefined, max_output_tokens: undefined, tools: "", structured_output: "" }, nativeTools: {} } },
    load() {
      const source = clone(this.model || { name: "", enabled: true, profile: {}, params: {} })
      const { resolved_profile, check, ...raw } = source
      const profile = raw.profile || {}
      const forcedOn = profile.native_tools || []
      const forcedOff = profile.native_tools_off || []
      const extra = Object.fromEntries(Object.entries(profile).filter(([key]) => !HANDLED.includes(key)))
      this.raw = raw; this.resolved = resolved_profile || null; this.check = check || null; this.checkedName = ""
      this.draft = {
        name: raw.name || "", enabled: raw.enabled !== false, reference: raw.reference || "", protocol: raw.protocol || null, base_url: raw.base_url || "",
        paramsText: jsonText(raw.params), extraText: jsonText(extra),
        overrides: { tasks: profile.tasks || [], input_modalities: profile.input_modalities || [], reasoning_levels: profile.reasoning_levels || [], context_window: profile.context_window ?? undefined, max_output_tokens: profile.max_output_tokens ?? undefined, tools: profile.tools == null ? "" : profile.tools ? "on" : "off", structured_output: profile.structured_output || "" },
        nativeTools: Object.fromEntries([...new Set([...Object.keys(NATIVE_TOOL_LABELS), ...forcedOn, ...forcedOff])].map((type) => [type, forcedOn.includes(type) ? "on" : forcedOff.includes(type) ? "off" : ""])),
      }
      this.advancedOpen = raw.protocol || raw.base_url || Object.keys(extra).length || Object.keys(raw.params || {}).length ? ["advanced"] : []
      this.checkItems = [...DEFAULT_CHECK_ITEMS]
    },
    /**
     * 计算一行能力的当前生效值与来源；手动覆盖优先，清除覆盖后显示待重新识别
     * @param {object} row 行定义
     * @returns {{ value: string, source: string, result: object|null }} 展示内容
     */
    effective(row) {
      const resolved = this.resolved || {}
      const sources = resolved.sources || {}
      const result = (this.check?.results || []).find((item) => item.item === RESULT_ITEMS[row.key]) || null
      if (row.kind === "native") {
        if (!this.chatSendable(row.type)) return { value: "不支持：Chat Completions 协议下该厂商没有这个内置工具", source: "", result }
        const forced = this.draft.nativeTools[row.type]
        if (forced) return { value: forced === "on" ? "支持" : "不支持", source: "手动", result }
        const source = sources[`native_tools.${row.type}`]
        if (source === "user") return { value: "保存后重新识别", source: "", result }
        if ((resolved.native_tools || []).includes(row.type)) return { value: "支持", source: SOURCE_LABELS[source] || "", result }
        if ((resolved.native_tools_off || []).includes(row.type)) return { value: "不支持", source: SOURCE_LABELS[source] || "", result }
        return { value: this.nativeAutoText(row.type), source: "", result }
      }
      const override = this.draft.overrides[row.key]
      const overridden = Array.isArray(override) ? override.length > 0 : override != null && override !== ""
      if (overridden) return { value: this.format(row.key, row.key === "tools" ? override === "on" : override), source: "手动", result }
      if (sources[row.key] === "user") return { value: "保存后重新识别", source: "", result }
      if (resolved[row.key] == null) return { value: "保存或核验后识别", source: "", result }
      return { value: this.format(row.key, resolved[row.key]), source: SOURCE_LABELS[sources[row.key]] || SOURCE_LABELS.default, result }
    },
    /**
     * 未确认的内置工具按线路自动判断是否发送：官方接口按厂商与协议的支持情况发送，中转站不发送
     * @param {string} type 内置工具类型
     * @returns {string} 说明文字
     */
    nativeAutoText(type) {
      const vendor = this.officialVendor()
      if (!vendor) return "未确认：中转站不发送，核验通过或强制开启后发送"
      const protocol = this.draft.protocol || this.connection.protocol
      const supported = type === "web_search" ? (this.presets[vendor]?.web_search || []).includes(protocol) : PROTOCOL_VENDORS[protocol] === vendor
      if (!supported) return "未确认：官方接口在当前协议下不提供，不发送"
      return "未确认：官方接口，请求时发送"
    },
    /**
     * 按接口地址识别的官方厂商，中转站为空
     * @returns {string|null} 厂商预设名
     */
    officialVendor() {
      return this.draft.base_url ? presetOfUrl(this.presets, this.draft.base_url) : this.connection.official || presetOfUrl(this.presets, this.connection.base_url)
    },
    /**
     * Chat Completions 协议只能发送有厂商写法的网页搜索，厂商按官方地址识别，中转站按服务商预设
     * @param {string} type 内置工具类型
     * @returns {boolean} 当前线路能否发送该内置工具
     */
    chatSendable(type) {
      if ((this.draft.protocol || this.connection.protocol) !== "openai_chat") return true
      const vendor = this.officialVendor() || this.connection.preset
      return type === "web_search" && (this.presets[vendor]?.web_search || []).includes("openai_chat")
    },
    format(key, value) {
      if (key === "tasks") return value.map((item) => TASK_LABELS[item] || item).join("、")
      if (key === "input_modalities") return Object.keys(MODALITY_LABELS).filter((item) => value.includes(item)).map((item) => MODALITY_LABELS[item]).join("、")
      if (key === "context_window" || key === "max_output_tokens") return formatTokens(value)
      if (key === "reasoning_levels") return value.length ? value.join("、") : "不可调节"
      if (key === "tools") return value ? "支持" : "不支持"
      if (key === "structured_output") return STRUCTURED_LABELS[value] || value
      return String(value)
    },
    resultText: checkResultText,
    brief: briefDetail,
    /**
     * 把草稿转换为模型配置
     * @returns {object} 模型配置，不含能力档案与核验状态
     */
    buildValue() {
      const draft = this.draft
      const profile = parseJsonObject(draft.extraText)
      const params = parseJsonObject(draft.paramsText)
      const overrides = draft.overrides
      LIST_FIELDS.forEach((key) => { if (overrides[key].length) profile[key] = overrides[key] })
      ;["context_window", "max_output_tokens"].forEach((key) => { if (overrides[key]) profile[key] = overrides[key] })
      if (overrides.tools) profile.tools = overrides.tools === "on"
      if (overrides.structured_output) profile.structured_output = overrides.structured_output
      const on = Object.keys(draft.nativeTools).filter((type) => draft.nativeTools[type] === "on")
      const off = Object.keys(draft.nativeTools).filter((type) => draft.nativeTools[type] === "off")
      if (on.length) profile.native_tools = on
      if (off.length) profile.native_tools_off = off
      return { ...this.raw, name: draft.name.trim(), enabled: draft.enabled, reference: draft.reference.trim() || null, protocol: draft.protocol || null, base_url: String(draft.base_url || "").trim() || null, profile, params }
    },
    validate() {
      const name = this.draft.name.trim()
      if (!name) return "请填写模型名称。"
      if (this.names.includes(name)) return "该服务商下已有同名模型。"
      if (this.paramsError || this.extraError) return `JSON 字段有误：${this.paramsError || this.extraError}`
      return ""
    },
    async runCheck() {
      const error = this.validate()
      if (error) return this.$message.warning(error)
      this.checkPopover = false; this.checking = true
      try {
        const data = await this.checker(this.buildValue(), this.checkItems)
        this.resolved = data.resolved_profile; this.check = data.check; this.checkedName = this.draft.name.trim()
        this.$message.success(`核验完成：${checkSummary(data.results) || "连通正常"}`)
      } catch (error) { this.$message.error(apiErrorDetail(error, "模型核验失败。")) }
      finally { this.checking = false }
    },
    confirm() {
      const error = this.validate()
      if (error) return this.$message.warning(error)
      const value = this.buildValue()
      const keep = value.name === this.raw.name || value.name === this.checkedName
      if (keep && this.resolved) value.resolved_profile = this.resolved
      if (keep && this.check) value.check = this.check
      this.$emit("save", value)
      this.$emit("update:visible", false)
    },
  },
}
</script>

<style scoped>
.editor-body { display: flex; flex-direction: column; gap: 18px; padding: 0 20px 20px; }
.editor-section h3 { margin: 0; font-size: 15px; }
.section-heading { display: flex; align-items: center; gap: 8px; }
.section-heading > span:last-child { margin-left: auto; }
.basic-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 16px; margin-top: 12px; }
.field { display: flex; min-width: 0; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-color-secondary); }
.field em { color: var(--danger-color); font-size: 12px; font-style: normal; }
.field-switch { align-items: flex-start; }
.field-wide { grid-column: 1 / -1; }
.full { width: 100%; }
.hint { margin: 8px 0 0; color: var(--text-color-secondary); font-size: 12px; line-height: 1.6; }
.chat-failure { margin-top: 10px; }
.capability-list { margin-top: 10px; border-top: 1px solid var(--border-color-light); }
.capability-row { display: flex; flex-direction: column; gap: 8px; padding: 11px 0; border-bottom: 1px solid var(--border-color-light); }
.capability-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 13px; }
.capability-head strong { width: 72px; flex: none; }
.capability-value { color: var(--text-color); }
.capability-result { max-width: 100%; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.result-supported { color: var(--success-color, #67c23a); }
.result-unsupported, .result-skipped { color: var(--text-color-secondary); }
.result-unknown { color: var(--warning-color, #e6a23c); }
.result-failed { color: var(--danger-color, #f56c6c); }
.capability-control { width: 100%; }
.capability-number { width: 220px; }
.capability-row .el-radio-group { display: flex; flex-wrap: wrap; }
.popover-title { margin: 0 0 8px; font-weight: 600; }
.check-items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.check-items .el-checkbox { margin-right: 0; }
.check-items small { display: block; color: var(--text-color-secondary); font-size: 11px; line-height: 1.4; }
.popover-actions { display: flex; justify-content: flex-end; margin-top: 10px; }
.advanced-section { border-top: 0; }
.editor-footer { position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border-color); background: var(--bg-color-secondary, #fff); }
::v-deep .model-editor { display: flex; flex-direction: column; }
::v-deep .model-editor .el-drawer__header { margin-bottom: 12px; color: var(--text-color); font-weight: 600; }
::v-deep .model-editor .el-drawer__body { display: flex; min-height: 0; flex: 1; flex-direction: column; overflow-y: auto; }
@media (max-width: 520px) { .capability-number { width: 100%; } }
</style>
