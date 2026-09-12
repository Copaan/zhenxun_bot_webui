<template>
  <div v-if="resolvedSchema" class="schema-field" :class="{ nested: depth > 0 }">
    <template v-if="fieldType === 'object' && objectProperties">
      <div v-if="label" class="object-heading">
        <div><strong>{{ label }}</strong><span v-if="description">{{ description }}</span></div>
      </div>
      <div class="object-grid">
        <SchemaField
          v-for="(childSchema, key) in objectProperties"
          v-show="childVisible(key)"
          :key="key"
          :value="objectValue[key]"
          :schema="childSchema"
          :root-schema="rootSchema"
          :label="fieldLabel(key, childSchema)"
          :path="path ? `${path}.${key}` : key"
          :depth="depth + 1"
          :issues="issues"
          @input="updateObject(key, $event)"
          @validity="$emit('validity', $event)"
        />
      </div>
      <SchemaField
        v-if="unknownObjectKeys.length"
        :value="unknownObjectValue"
        :schema="{ type: 'object' }"
        :root-schema="rootSchema"
        label="其他兼容字段"
        :path="path ? `${path}.__extra__` : '__extra__'"
        :depth="depth + 1"
        :issues="issues"
        @input="updateUnknownObject"
        @validity="$emit('validity', $event)"
      />
    </template>

    <template v-else-if="fieldType === 'array'">
      <div class="field-label"><strong>{{ label }}</strong><span>{{ description }}</span></div>
      <el-select
        v-if="primitiveItems"
        :value="arrayValue"
        multiple
        filterable
        allow-create
        default-first-option
        class="full-control"
        placeholder="输入后按回车添加"
        @input="$emit('input', $event)"
      />
      <div v-else class="array-editor">
        <div v-for="(item, index) in arrayValue" :key="index" class="array-row">
          <SchemaField
            :value="item"
            :schema="itemSchema"
            :root-schema="rootSchema"
            :label="`${label} ${index + 1}`"
            :path="`${path}.${index}`"
            :depth="depth + 1"
            :issues="issues"
            @input="updateArray(index, $event)"
            @validity="$emit('validity', $event)"
          />
          <el-button type="text" class="danger-action" @click="removeArray(index)">删除</el-button>
        </div>
        <el-button size="small" icon="el-icon-plus" @click="addArray">添加一项</el-button>
      </div>
    </template>

    <template v-else-if="fieldType === 'object'">
      <div class="field-label"><strong>{{ label }}</strong><span>{{ description || "该结构暂未提供专用表单，可使用 JSON 编辑。" }}</span></div>
      <el-input :value="jsonValue" type="textarea" :rows="5" resize="vertical" class="json-editor" @input="updateJson" />
      <div v-if="jsonError" class="field-error">JSON 格式不正确，修正后才能保存。</div>
    </template>

    <template v-else>
      <div class="field-label"><strong>{{ label }}</strong><span>{{ description }}</span><small v-if="ui.unit">单位：{{ ui.unit }}</small></div>
      <el-switch v-if="fieldType === 'boolean'" :value="Boolean(value)" @input="$emit('input', $event)" />
      <el-select v-else-if="options.length" :value="value" clearable filterable class="full-control" @input="$emit('input', $event)">
        <el-option v-for="option in options" :key="String(option.value)" :label="option.label" :value="option.value" />
      </el-select>
      <el-input-number
        v-else-if="fieldType === 'integer' || fieldType === 'number'"
        :value="value"
        :min="numericMinimum"
        :max="numericMaximum"
        :step="numericStep"
        controls-position="right"
        class="number-control"
        @change="$emit('input', $event)"
      />
      <el-input
        v-else-if="multiline"
        :value="value"
        type="textarea"
        :rows="4"
        resize="vertical"
        @input="$emit('input', $event)"
      />
      <el-input v-else :value="displayValue" :type="ui.secret ? 'password' : 'text'" :show-password="ui.secret" :autocomplete="ui.secret ? 'new-password' : 'off'" :placeholder="placeholder" @input="updateDisplayValue" />
    </template>
    <div v-if="fieldError" class="field-error">{{ fieldError }}</div>
  </div>
</template>

<script>
const LABELS = {
  timeout: "请求超时", max_retries: "最大重试次数", retry_delay: "重试基础延迟", structured_retries: "结构化生成重试",
  show_tools: "记录工具定义", show_schema: "记录结构化 Schema", show_safety: "记录安全设置",
  enable: "启用", trigger_threshold: "触发阈值", max_history_turns: "最大历史轮数", summarization_model: "总结模型",
  summarization_prompt: "总结提示词", keep_recent_turns: "保留最近轮数", vision_window_size: "多模态窗口轮数",
  llm_summary: "对话总结压缩", tool_pruning: "工具结果修剪", max_cycles: "单次最大循环", global_max_cycles: "全局最大循环",
  enable_parallel_calls: "并行工具调用", reflexion_retries: "反思重试次数", enable_fallback_summary: "启用兜底总结",
  enable_hitl: "允许向用户求助", mcp_cleanup_timeout: "MCP 闲置回收", enable_sandbox: "启用沙箱", sandbox_type: "沙箱驱动",
  docker_image: "Docker 镜像", cleanup_timeout: "闲置清理时间", enable_vfs_helper: "VFS 路径防护", gemini: "Gemini",
  safety_threshold: "安全过滤阈值", allow_mixed_tools: "允许混合工具",
}

export default {
  name: "SchemaField",
  props: {
    value: { default: null }, schema: { type: Object, default: () => ({}) }, rootSchema: { type: Object, default: () => ({}) },
    label: { type: String, default: "" }, path: { type: String, default: "" }, depth: { type: Number, default: 0 }, ui: { type: Object, default: () => ({}) }, issues: { type: Array, default: () => [] },
  },
  data() { return { jsonDraft: JSON.stringify(this.value ?? {}, null, 2), jsonError: false, lastEmittedJson: "" } },
  computed: {
    resolvedSchema() { return this.resolve(this.schema) },
    fieldType() { return this.resolvedSchema.type || "string" },
    description() { return this.ui.description || this.resolvedSchema.description || "" },
    placeholder() { return this.ui.placeholder || this.description || `请输入${this.label || "内容"}` },
    objectProperties() { return this.resolvedSchema.properties || null },
    objectValue() { return this.value && typeof this.value === "object" && !Array.isArray(this.value) ? this.value : {} },
    unknownObjectKeys() { const known = new Set(Object.keys(this.objectProperties || {})); return Object.keys(this.objectValue).filter((key) => !known.has(key)) },
    unknownObjectValue() { return Object.fromEntries(this.unknownObjectKeys.map((key) => [key, this.objectValue[key]])) },
    itemSchema() { return this.resolve(this.ui.item_schema || this.resolvedSchema.items || {}) },
    primitiveItems() { return this.ui.component === "tags" || ["string", "integer", "number"].includes(this.itemSchema.type) },
    arrayValue() { return Array.isArray(this.value) ? this.value : [] },
    options() {
      const values = this.ui.options?.length ? this.ui.options : this.resolvedSchema.enum || []
      return values.map((item) => typeof item === "object" ? item : { label: String(item), value: item })
    },
    numericMinimum() { return this.ui.minimum ?? this.resolvedSchema.minimum ?? -Infinity },
    numericMaximum() { return this.ui.maximum ?? this.resolvedSchema.maximum ?? Infinity },
    numericStep() { return this.ui.step || (this.fieldType === "integer" ? 1 : 0.1) },
    multiline() { return /prompt|template|description/i.test(this.path) || this.ui.component === "textarea" },
    jsonValue() { return this.jsonDraft },
    displayValue() { return this.value !== null && typeof this.value === "object" ? JSON.stringify(this.value, null, 2) : this.value },
    fieldError() {
      const path = this.path.replace(/\[(\d+)\]/g, ".$1").toLowerCase()
      const issue = this.issues.find((item) => {
        const issuePath = String(item.path || "").replace(/\[(\d+)\]/g, ".$1").toLowerCase()
        return issuePath === path || issuePath.endsWith(`.${path}`)
      })
      return issue?.message || ""
    },
  },
  watch: {
    value: {
      deep: true,
      handler(value) {
        const compact = JSON.stringify(value ?? {})
        if (compact === this.lastEmittedJson) {
          this.lastEmittedJson = ""
          return
        }
        this.jsonDraft = JSON.stringify(value ?? {}, null, 2)
        this.jsonError = false
        this.$emit("validity", { path: this.path, valid: true })
      },
    },
  },
  methods: {
    resolve(schema) {
      if (!schema) return {}
      let current = schema
      const visited = new Set()
      while (current?.$ref && !visited.has(current.$ref)) {
        visited.add(current.$ref)
        const resolved = current.$ref.replace(/^#\//, "").split("/").reduce((value, key) => value?.[key], this.rootSchema)
        if (!resolved) break
        const { $ref, ...siblings } = current
        current = { ...resolved, ...siblings }
      }
      const variants = current?.anyOf || current?.oneOf
      if (Array.isArray(variants)) {
        const variant = variants.find((item) => this.resolve(item).type !== "null")
        if (variant) {
          const { anyOf, oneOf, ...base } = current
          current = { ...base, ...this.resolve(variant) }
        }
      }
      if (Array.isArray(current?.allOf)) {
        const { allOf, ...base } = current
        current = current.allOf.reduce((result, item) => {
          const resolved = this.resolve(item)
          return { ...result, ...resolved, properties: { ...(result.properties || {}), ...(resolved.properties || {}) } }
        }, base)
      }
      return current || {}
    },
    fieldLabel(key, schema) { return LABELS[key] || this.resolve(schema).title || key },
    childVisible(key) {
      if (key === "enable" || !Object.prototype.hasOwnProperty.call(this.objectProperties || {}, "enable")) return true
      return this.objectValue.enable !== false
    },
    updateObject(key, value) { this.$emit("input", { ...this.objectValue, [key]: value }) },
    updateUnknownObject(value) {
      const next = { ...this.objectValue }
      this.unknownObjectKeys.forEach((key) => { delete next[key] })
      Object.entries(value || {}).forEach(([key, item]) => {
        if (!Object.prototype.hasOwnProperty.call(this.objectProperties || {}, key)) next[key] = item
      })
      this.$emit("input", next)
    },
    updateArray(index, value) { const next = [...this.arrayValue]; next.splice(index, 1, value); this.$emit("input", next) },
    removeArray(index) { const next = [...this.arrayValue]; next.splice(index, 1); this.$emit("input", next) },
    addArray() {
      const type = this.itemSchema.type
      const empty = type === "object" ? {} : type === "boolean" ? false : ["integer", "number"].includes(type) ? 0 : ""
      this.$emit("input", [...this.arrayValue, empty])
    },
    updateJson(value) {
      this.jsonDraft = value
      try {
        const parsed = JSON.parse(value)
        this.lastEmittedJson = JSON.stringify(parsed)
        this.$emit("input", parsed)
        this.jsonError = false
        this.$emit("validity", { path: this.path, valid: true })
      } catch (_) {
        this.jsonError = true
        this.$emit("validity", { path: this.path, valid: false })
      }
    },
    updateDisplayValue(value) {
      if (this.value !== null && typeof this.value === "object") {
        try { this.$emit("input", JSON.parse(value)); return } catch (_) { /* Keep editing text until valid JSON. */ }
      }
      this.$emit("input", value)
    },
  },
}
</script>

<style scoped>
.schema-field { min-width: 0; }.schema-field.nested { padding-top: 4px; }.field-label { display: flex; min-height: 42px; flex-direction: column; justify-content: flex-end; margin-bottom: 7px; }.field-label strong { font-size: 14px; }.field-label span, .object-heading span { margin-top: 3px; color: var(--text-color-secondary); font-size: 12px; line-height: 1.45; }.object-heading { padding: 8px 0; border-bottom: 1px solid var(--border-color-light); }.object-heading > div { display: flex; flex-direction: column; }.object-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; padding: 8px 0 14px; }.object-grid > .schema-field:has(.object-heading) { grid-column: 1 / -1; }.full-control, .number-control { width: 100%; }.array-editor { display: flex; flex-direction: column; gap: 10px; }.array-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 10px; padding: 10px; border: 1px solid var(--border-color-light); border-radius: 6px; }.json-editor ::v-deep textarea { font-family: Consolas, "Courier New", monospace; font-size: 12px; }.field-error { margin-top: 5px; color: var(--danger-color); font-size: 12px; }.danger-action { color: var(--danger-color); }@media (max-width: 720px) { .object-grid { grid-template-columns: 1fr; }.object-grid > .schema-field:has(.object-heading) { grid-column: auto; } }
</style>
