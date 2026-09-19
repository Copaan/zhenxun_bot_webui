<template>
  <div class="schema-field" :class="{ nested: depth > 0 }">
    <div class="field-label"><strong>{{ label }}</strong><span>{{ description }}</span></div>
    <div class="field-actions">
      <el-select v-if="variants.length" :value="variantIndex" size="mini" @input="selectVariant">
        <el-option v-for="(variant, index) in variants" :key="index" :value="index" :label="variant.title || variant.type || `类型 ${index + 1}`" />
      </el-select>
      <el-select v-else-if="!baseSchema.type && !baseSchema.properties && !baseSchema.$ref" :value="fieldType" size="mini" @input="selectType">
        <el-option v-for="type in ['string', 'integer', 'number', 'boolean', 'object', 'array', 'null']" :key="type" :value="type" :label="type" />
      </el-select>
      <el-button v-if="value === undefined" size="mini" @click="emitValue(emptyValue(resolvedSchema))">设置值</el-button>
      <el-button v-else-if="!required" size="mini" type="text" @click="emitValue(undefined)">恢复未设置</el-button>
      <span v-if="value === undefined">未设置</span><span v-else-if="value === null">null</span>
    </div>
    <template v-if="value !== undefined && value !== null">
      <el-button v-if="depth >= 8 && !expanded" size="mini" @click="expanded = true">展开深层结构</el-button>
      <template v-else-if="fieldType === 'object'">
        <div class="object-grid">
          <div v-for="key in objectKeys" :key="key" class="object-entry">
            <div v-if="!Object.prototype.hasOwnProperty.call(objectProperties, key)" class="map-key">
              <el-input :value="key" size="mini" aria-label="字典键" @change="renameKey(key, $event)" />
              <el-button v-if="!requiredKeys.includes(key)" size="mini" type="text" @click="removeKey(key)">删除</el-button>
            </div>
            <SchemaField :value="objectValue[key]" :schema="propertySchema(key)" :root-schema="effectiveRoot" :label="propertySchema(key).title || key" :path="path ? `${path}.${key}` : key" :depth="depth + 1" :required="requiredKeys.includes(key)" :issues="issues" @input="updateObject(key, $event)" @validity="$emit('validity', $event)" />
          </div>
        </div>
        <div v-if="resolvedSchema.additionalProperties !== false" class="map-key">
          <el-input v-model="newKey" size="mini" placeholder="新增字典键" @keyup.enter.native="addKey" />
          <el-button size="mini" @click="addKey">添加字段</el-button>
        </div>
      </template>
      <template v-else-if="fieldType === 'array'">
        <div class="array-editor">
          <div v-for="(item, index) in arrayValue" :key="index" class="array-row">
            <SchemaField :value="item" :schema="itemSchema(index)" :root-schema="effectiveRoot" :label="`${label} ${index + 1}`" :path="`${path}.${index}`" :depth="depth + 1" required :issues="issues" @input="updateArray(index, $event)" @validity="$emit('validity', $event)" />
            <el-button type="text" @click="removeArray(index)">删除</el-button>
          </div>
          <el-button size="small" @click="addArray">添加一项</el-button>
        </div>
      </template>
      <el-select v-else-if="options.length" :value="value" class="full-control" @input="emitValue">
        <el-option v-for="option in options" :key="String(option.value)" :label="option.label" :value="option.value" />
      </el-select>
      <el-switch v-else-if="fieldType === 'boolean'" :value="value" @input="emitValue" />
      <el-input-number v-else-if="['integer', 'number'].includes(fieldType)" :value="value" :precision="fieldType === 'integer' ? 0 : undefined" :min="resolvedSchema.minimum" :max="resolvedSchema.maximum" :step="fieldType === 'integer' ? 1 : 0.1" @change="emitValue" />
      <el-input v-else :value="value" :type="ui.secret ? 'password' : /prompt|template|description/i.test(path) || ui.component === 'textarea' ? 'textarea' : 'text'" :show-password="ui.secret" @input="emitValue" />
    </template>
    <div v-if="localError || fieldError" class="field-error">{{ localError || fieldError }}</div>
  </div>
</template>

<script>
import { valueType, resolveReference, matchesSchema, emptyValue } from "./schema-utils"

export default {
  name: "SchemaField",
  props: {
    value: { default: undefined }, schema: { type: Object, default: () => ({}) }, rootSchema: { type: Object, default: () => ({}) },
    label: { type: String, default: "" }, path: { type: String, default: "" }, depth: { type: Number, default: 0 }, ui: { type: Object, default: () => ({}) }, issues: { type: Array, default: () => [] }, required: Boolean,
  },
  data() { return { selectedVariant: null, expanded: false, newKey: "", localError: "" } },
  computed: {
    effectiveRoot() { return this.schema["x-root-schema"] || (Object.keys(this.rootSchema).length ? this.rootSchema : this.schema) },
    baseSchema() { return resolveReference(this.schema, this.effectiveRoot) },
    variants() {
      const variants = this.baseSchema.anyOf || this.baseSchema.oneOf
      if (variants) return variants.map(item => resolveReference(item, this.effectiveRoot))
      return Array.isArray(this.baseSchema.type) ? this.baseSchema.type.map(type => ({ ...this.baseSchema, type })) : []
    },
    variantIndex() {
      if (this.selectedVariant !== null) return this.selectedVariant
      const index = this.variants.findIndex(item => matchesSchema(this.value, item, this.effectiveRoot))
      return index < 0 ? undefined : index
    },
    resolvedSchema() { return this.variants.length ? { ...this.baseSchema, ...(this.variants[this.variantIndex] || {}) } : this.baseSchema },
    fieldType() { return this.resolvedSchema.type || (this.resolvedSchema.properties ? "object" : valueType(this.value)) },
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
    emitValue(value) { this.localError = ""; this.$emit("input", value); this.$emit("validity", { path: this.path, valid: true }) },
    selectVariant(index) { this.selectedVariant = index; this.emitValue(emptyValue(this.variants[index])) },
    selectType(type) { this.emitValue(emptyValue({ type })) },
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
.schema-field { min-width: 0; }.schema-field.nested { padding-top: 4px; }.field-label { display: flex; min-height: 42px; flex-direction: column; justify-content: flex-end; margin-bottom: 7px; }.field-label strong { font-size: 14px; }.field-label span, .object-heading span { margin-top: 3px; color: var(--text-color-secondary); font-size: 12px; line-height: 1.45; }.object-heading { padding: 8px 0; border-bottom: 1px solid var(--border-color-light); }.object-heading > div { display: flex; flex-direction: column; }.object-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; padding: 8px 0 14px; }.object-grid > .schema-field:has(.object-heading) { grid-column: 1 / -1; }.full-control, .number-control { width: 100%; }.array-editor { display: flex; flex-direction: column; gap: 10px; }.array-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 10px; padding: 10px; border: 1px solid var(--border-color-light); border-radius: 6px; }.json-editor ::v-deep textarea { font-family: Consolas, "Courier New", monospace; font-size: 12px; }.field-error { margin-top: 5px; color: var(--danger-color); font-size: 12px; }.danger-action { color: var(--danger-color); }@media (max-width: 720px) { .object-grid { grid-template-columns: 1fr; }.object-grid > .schema-field:has(.object-heading) { grid-column: auto; } }
</style>

<style scoped>
.field-actions,.map-key{display:flex;gap:8px;align-items:center;margin:6px 0}.object-entry{min-width:0}
</style>
