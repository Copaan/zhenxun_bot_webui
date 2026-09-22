<template>
  <SettingsField v-if="presentation === 'settings'" v-bind="$props" :readonly="readonlyReason" @input="$emit('input', $event)" @validity="$emit('validity', $event)"><template #meta><slot name="meta" /></template><template #details><slot name="details" /></template><template #status><slot name="status" /></template></SettingsField>
  <div v-else v-show="matchesSearch || hasIssue || localError" class="schema-field" :class="{ nested: depth > 0 }" :data-field-path="path">
    <div class="field-label"><strong>{{ label }}</strong><span>{{ description }}</span></div>
    <div class="field-overview">
      <button v-if="complex && value != null" type="button" class="structure-toggle" :aria-expanded="structureOpen" @click="expanded = !expanded"><i :class="structureOpen ? 'el-icon-arrow-down' : 'el-icon-arrow-right'"></i> {{ summary }}</button>
      <el-button size="mini" type="text" @click="advanced = !advanced">{{ advanced ? '收起高级操作' : '高级操作' }}</el-button>
    </div>
    <div v-show="advanced || value === undefined || ambiguous" class="field-actions">
      <el-select v-if="variants.length" :value="variantIndex" size="mini" @input="selectVariant">
        <el-option v-for="(variant, index) in variants" :key="index" :value="index" :label="variant.title || variant.type || `类型 ${index + 1}`" />
      </el-select>
      <el-select v-else-if="!baseSchema.type && !baseSchema.properties && !baseSchema.$ref" :value="fieldType" size="mini" @input="selectType">
        <el-option v-for="type in ['string', 'integer', 'number', 'boolean', 'object', 'array', 'null']" :key="type" :value="type" :label="type" />
      </el-select>
      <el-button v-if="value === undefined && fieldType !== 'boolean'" size="mini" @click="emitValue(emptyValue(resolvedSchema))">设置值</el-button>
      <el-button v-else-if="!required" size="mini" type="text" @click="emitValue(undefined)">恢复未设置</el-button>
      <span v-if="value === undefined">未设置</span><span v-else-if="value === null">null</span>
    </div>
    <template v-if="value !== undefined && value !== null && !complex">
      <el-select v-if="options.length" :value="value" class="full-control" @input="emitValue">
        <el-option v-for="option in options" :key="String(option.value)" :label="option.label" :value="option.value" />
      </el-select>
      <el-switch v-else-if="fieldType === 'boolean'" :value="booleanDisplayValue" @input="emitValue" />
      <el-input-number v-else-if="['integer', 'number'].includes(fieldType)" :value="value" :precision="fieldType === 'integer' ? 0 : undefined" :min="resolvedSchema.minimum" :max="resolvedSchema.maximum" :step="fieldType === 'integer' ? 1 : 0.1" @change="emitValue" />
      <el-input v-else :value="value" :type="ui.secret ? 'password' : /prompt|template|description/i.test(path) || ui.component === 'textarea' ? 'textarea' : 'text'" :show-password="ui.secret" @input="emitValue" />
    </template>
    <el-switch v-else-if="fieldType === 'boolean'" :value="booleanDisplayValue" @input="emitValue" />
    <el-dialog v-if="complex && value !== undefined && value !== null" :visible.sync="expanded" :title="`${label} · 编辑`" width="min(720px, calc(100vw - 32px))" append-to-body custom-class="schema-object-dialog">
      <el-button v-if="depth >= 8 && !deepExpanded && !hasIssue && !query.trim()" size="mini" @click="deepExpanded = true">展开深层结构</el-button>
      <template v-else-if="fieldType === 'object'">
        <div class="object-grid">
          <div v-for="key in objectKeys" :key="key" class="object-entry">
            <div v-if="advanced && !Object.prototype.hasOwnProperty.call(objectProperties, key)" class="map-key">
              <el-input :value="key" size="mini" aria-label="字典键" @change="renameKey(key, $event)" />
              <el-button v-if="!requiredKeys.includes(key)" size="mini" type="text" @click="removeKey(key)">删除</el-button>
            </div>
            <SchemaField :value="objectValue[key]" :schema="propertySchema(key)" :root-schema="effectiveRoot" :label="propertySchema(key).title || key" :path="path ? `${path}.${key}` : key" :depth="depth + 1" :query="query" :required="requiredKeys.includes(key)" :issues="issues" @input="updateObject(key, $event)" @validity="$emit('validity', $event)" />
          </div>
        </div>
        <div v-if="advanced && resolvedSchema.additionalProperties !== false" class="map-key">
          <el-input v-model="newKey" size="mini" placeholder="新增字典键" @keyup.enter.native="addKey" />
          <el-button size="mini" @click="addKey">添加字段</el-button>
        </div>
      </template>
      <template v-else-if="fieldType === 'array'">
        <div class="array-editor">
          <div v-for="(item, index) in arrayValue" :key="index" class="array-row">
            <SchemaField :value="item" :schema="itemSchema(index)" :root-schema="effectiveRoot" :label="`${label} ${index + 1}`" :path="`${path}.${index}`" :depth="depth + 1" :query="query" required :issues="issues" @input="updateArray(index, $event)" @validity="$emit('validity', $event)" />
            <el-button type="text" @click="removeArray(index)">删除</el-button>
          </div>
          <el-button size="small" @click="addArray">添加一项</el-button>
        </div>
      </template>
    </el-dialog>
    <p v-if="ambiguous" class="field-help">请选择字段类型；当前内容保持不变。</p>
    <div v-if="localError || fieldError" class="field-error">{{ localError || fieldError }}</div>
  </div>
</template>

<script>
import { valueType, resolveReference, matchesSchema, emptyValue, valueSummary, fieldMatches, validateField } from "./schema-utils"
import SettingsField from "./SettingsField.vue"

export default {
  name: "SchemaField",
  components: { SettingsField },
  props: {
    presentation: { type: String, default: 'form' }, readonlyReason: { type: String, default: '' },
    query: { type: String, default: "" },
    value: { default: undefined }, schema: { type: Object, default: () => ({}) }, rootSchema: { type: Object, default: () => ({}) },
    label: { type: String, default: "" }, path: { type: String, default: "" }, depth: { type: Number, default: 0 }, ui: { type: Object, default: () => ({}) }, issues: { type: Array, default: () => [] }, required: Boolean,
  },
  data() { return { selectedVariant: null, expanded: false, advanced: false, deepExpanded: false, newKey: "", localError: "" } },
  computed: {
    summary() { return valueSummary(this.value) },
    complex() { return ["object", "array"].includes(this.fieldType) },
    matchesSearch() { return fieldMatches(this.query, `${this.path} ${this.label} ${this.ui.description || ""}`, this.schema, this.value, this.effectiveRoot) },
    hasIssue() { return Boolean(this.fieldError || this.issues.some(item => String(item.path || "").startsWith(`${this.path}.`))) },
    structureOpen() { return this.expanded || this.hasIssue || Boolean(this.localError) || Boolean(this.query.trim() && this.matchesSearch) },
    matchingVariants() { return this.value === undefined ? [] : this.variants.map((item, index) => matchesSchema(this.value, item, this.effectiveRoot) ? index : -1).filter(index => index >= 0) },
    ambiguous() { return this.variants.length > 0 && this.variantIndex === undefined },
    effectiveRoot() { return this.schema["x-root-schema"] || (Object.keys(this.rootSchema).length ? this.rootSchema : this.schema) },
    baseSchema() { return resolveReference(this.schema, this.effectiveRoot) },
    variants() {
      const variants = this.baseSchema.anyOf || this.baseSchema.oneOf
      if (variants) return variants.map(item => resolveReference(item, this.effectiveRoot))
      return Array.isArray(this.baseSchema.type) ? this.baseSchema.type.map(type => ({ ...this.baseSchema, type })) : []
    },
    variantIndex() {
      if (this.selectedVariant !== null) return this.selectedVariant
      return this.matchingVariants.length === 1 ? this.matchingVariants[0] : undefined
    },
    resolvedSchema() { return this.variants.length ? { ...this.baseSchema, ...(this.variants[this.variantIndex] || {}) } : this.baseSchema },
    fieldType() { return this.resolvedSchema.type || (this.resolvedSchema.properties ? "object" : valueType(this.value)) },
    booleanDisplayValue() {
      if (this.value !== undefined) return Boolean(this.value)
      if (Object.prototype.hasOwnProperty.call(this.resolvedSchema, "default")) {
        const value = this.resolvedSchema.default
        return typeof value === "string" ? ["true", "1", "yes", "on"].includes(value.toLowerCase()) : Boolean(value)
      }
      if (typeof this.resolvedSchema.const === "boolean") return this.resolvedSchema.const
      return false
    },
    description() { return this.ui.description || this.resolvedSchema.description || "" },
    objectProperties() { return this.resolvedSchema.properties || {} },
    requiredKeys() { return this.resolvedSchema.required || [] },
    objectValue() { return this.value && typeof this.value === "object" && !Array.isArray(this.value) ? this.value : {} },
    objectKeys() { return [...new Set([...Object.keys(this.objectProperties), ...Object.keys(this.objectValue)])] },
    arrayValue() { return Array.isArray(this.value) ? this.value : [] },
    options() { return (this.ui.options || this.resolvedSchema.enum || []).map(item => item && typeof item === "object" ? item : { value: item, label: String(item) }) },
    fieldError() { return this.issues.find(item => item.path === this.path || String(item.path || "").endsWith(`.${this.path}`))?.message || "" },
  },
  watch: { value(value) { this.localError = ""; if (this.selectedVariant !== null && !matchesSchema(value, this.variants[this.selectedVariant] || {}, this.effectiveRoot)) this.selectedVariant = null } },
  methods: {
    emptyValue,
    validate() { const issues = validateField(this.value, this.schema, this.effectiveRoot, this.path, this.required); this.localError = issues[0]?.message || ""; if (issues.length) this.expanded = true; this.$emit("validity", { path: this.path, valid: !issues.length }); return !issues.length },
    emitValue(value) { this.localError = ""; this.$emit("input", value); this.$emit("validity", { path: this.path, valid: true }) },
    async confirmTypeChange(schema) {
      if (this.value === undefined || matchesSchema(this.value, schema, this.effectiveRoot)) return true
      try { await this.$confirm("切换类型会替换当前字段内容，是否继续？", "切换字段类型", { type: "warning", customClass: "configuration-confirm", confirmButtonText: "替换内容", cancelButtonText: "保留内容" }); return true } catch (_) { return false }
    },
    async selectVariant(index) { const schema = this.variants[index]; if (!await this.confirmTypeChange(schema)) return; this.selectedVariant = index; if (this.value === undefined || !matchesSchema(this.value, schema, this.effectiveRoot)) this.emitValue(emptyValue(schema)) },
    async selectType(type) { const schema = { type }; if (this.value !== undefined && matchesSchema(this.value, schema, this.effectiveRoot)) return; if (await this.confirmTypeChange(schema)) this.emitValue(emptyValue(schema)) },
    propertySchema(key) { return this.objectProperties[key] || (typeof this.resolvedSchema.additionalProperties === "object" ? this.resolvedSchema.additionalProperties : {}) },
    itemSchema(index) { return this.resolvedSchema.prefixItems?.[index] || (Array.isArray(this.resolvedSchema.items) ? this.resolvedSchema.items[index] : this.ui.item_schema || this.resolvedSchema.items) || {} },
    updateObject(key, value) { const next = { ...this.objectValue }; if (value === undefined) delete next[key]; else Object.defineProperty(next, key, { value, enumerable: true, configurable: true, writable: true }); this.emitValue(next) },
    removeKey(key) { this.updateObject(key, undefined) },
    addKey() {
      const key = this.newKey.trim()
      if (!key || this.objectKeys.includes(key)) { this.localError = "字段名不能为空或重复"; return }
      this.updateObject(key, emptyValue(this.propertySchema(key))); this.newKey = ""
    },
    renameKey(oldKey, key) {
      if (key === oldKey) return
      if (!key || this.objectKeys.includes(key)) { this.localError = "字段名不能为空或重复"; return }
      const next = { ...this.objectValue }; Object.defineProperty(next, key, { value: next[oldKey], enumerable: true, configurable: true, writable: true }); delete next[oldKey]; this.emitValue(next)
    },
    updateArray(index, value) { const next = [...this.arrayValue]; next.splice(index, 1, value); this.emitValue(next) },
    removeArray(index) { const next = [...this.arrayValue]; next.splice(index, 1); this.emitValue(next) },
    addArray() { this.emitValue([...this.arrayValue, emptyValue(this.itemSchema(this.arrayValue.length))]) },
  },
}
</script>

<style scoped>
.schema-field { min-width: 0; }.schema-field.nested { padding-top: 4px; }.field-label { display: flex; min-height: 42px; flex-direction: column; justify-content: flex-end; margin-bottom: 7px; overflow-wrap: anywhere; }.field-label strong { font-size: 14px; }.field-label span, .object-heading span { margin-top: 3px; color: var(--text-color-secondary); font-size: 12px; line-height: 1.45; }.object-heading { padding: 8px 0; border-bottom: 1px solid var(--border-color-light); }.object-heading > div { display: flex; flex-direction: column; }.field-overview { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }.structure-toggle { min-width: 0; flex: 1; padding: 8px 0; border: 0; color: var(--text-color-secondary); background: transparent; text-align: left; cursor: pointer; overflow-wrap: anywhere; }.object-grid { display: grid; grid-template-columns: 1fr; gap: 14px 20px; padding: 8px 0 14px; }.full-control, .number-control { width: 100%; }.array-editor { display: flex; flex-direction: column; gap: 10px; }.array-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 10px; padding: 10px; border: 1px solid var(--border-color-light); border-radius: 6px; }.json-editor ::v-deep textarea { font-family: Consolas, "Courier New", monospace; font-size: 12px; }.field-error { margin-top: 5px; color: var(--danger-color); font-size: 12px; }.field-help { color: var(--text-color-secondary); font-size: 12px; }.field-actions, .map-key { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 6px 0; }.field-actions > *, .map-key > * { max-width: 100%; }.map-key .el-input { flex: 1; min-width: 100px; }.object-entry { min-width: 0; }.schema-field ::v-deep .el-input-number { max-width: 100%; }.danger-action { color: var(--danger-color); }@media (max-width: 720px) { .object-grid { grid-template-columns: 1fr; } }
</style>

<style>
.configuration-confirm.el-message-box { width:calc(100vw - 32px); max-width:420px; box-sizing:border-box; overflow-wrap:anywhere; }
</style>

