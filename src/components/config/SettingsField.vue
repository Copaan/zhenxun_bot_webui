<template>
  <div v-show="matches || error" class="settings-field" :data-field-path="path" :class="{ 'is-nested': inline, 'has-error': error }">
    <div class="setting-info">
      <label :for="controlId">{{ label || path }} <span v-if="required" class="required-mark">*</span></label>
      <code v-if="path && path !== label">{{ path }}</code>
      <p v-if="description">{{ description }}</p>
      <slot name="meta" />
      <details class="setting-details">
        <summary>详细信息</summary>
        <div>默认值：{{ hasDefault ? summary(base.default) : '未声明' }}</div>
        <slot name="details" />
      </details>
    </div>
    <div class="setting-edit">
      <div class="setting-controls">
        <div class="setting-input">
          <span v-if="readonly" class="setting-readonly">{{ readonly }}</span>
          <el-select v-else-if="ambiguous" :id="controlId" :value="selectedVariant" placeholder="选择值的类型" @input="changeVariant">
            <el-option v-for="(option, index) in variants" :key="index" :label="option.title || option.type || `类型 ${index + 1}`" :value="index" />
          </el-select>
          <template v-else-if="complex">
            <div class="structure-summary"><span>{{ summary(value) }}</span><el-button size="small" @click="openStructure">{{ inline ? (expanded ? '收起' : '展开') : '编辑' }}</el-button></div>
          </template>
          <el-select v-else-if="options.length" :id="controlId" :value="displayValue" :placeholder="placeholder" @input="emitValue">
            <el-option v-for="option in options" :key="String(option.value)" :value="option.value" :label="option.label" />
          </el-select>
          <div v-else-if="type === 'boolean'" class="switch-control"><el-switch :id="controlId" :value="displayValue === true" :aria-label="label" @input="emitValue" /><span>{{ value === null ? 'null' : displayValue === true ? '开启' : '关闭' }}</span></div>
          <div v-else-if="['number', 'integer'].includes(type)" class="number-control"><el-input-number :id="controlId" :value="value == null ? undefined : value" :placeholder="placeholder" :precision="type === 'integer' ? 0 : undefined" :min="resolved.minimum" :max="resolved.maximum" controls-position="right" @change="emitValue" /><span v-if="ui.unit">{{ ui.unit }}</span></div>
          <span v-else-if="type === 'null'" class="setting-readonly">null</span>
          <el-input v-else :id="controlId" :value="value == null ? '' : value" :placeholder="placeholder" :type="ui.secret ? 'password' : ui.component === 'textarea' ? 'textarea' : 'text'" :show-password="ui.secret" :autosize="{ minRows: 3, maxRows: 8 }" @input="emitValue" />
        </div>
        <el-dropdown v-if="!readonly" trigger="click" @command="operate">
          <el-button type="text" icon="el-icon-more" :aria-label="`${label}操作`" class="setting-more" />
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item v-if="hasDefault" command="default">恢复默认值</el-dropdown-item>
            <el-dropdown-item v-if="!required" command="unset">恢复未设置</el-dropdown-item>
            <el-dropdown-item v-if="nullable" command="null">设为 null</el-dropdown-item>
            <el-dropdown-item v-for="(option, index) in variants" :key="`variant-${index}`" :command="`variant:${index}`">切换为 {{ option.title || option.type || `类型 ${index + 1}` }}</el-dropdown-item>
            <el-dropdown-item v-for="choice in untyped ? ['string', 'number', 'boolean', 'object', 'array', 'null'] : []" :key="choice" :command="`type:${choice}`">切换为 {{ choice }}</el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
      </div>
      <div v-if="value === undefined && !readonly" class="setting-hint">未设置{{ hasDefault ? ' · 使用默认值' : '' }}</div>
      <div v-else-if="value === null && type !== 'null'" class="setting-hint">当前配置为 null，操作控件后才替换</div>
      <slot name="status" />
      <div v-if="error" class="field-error" role="alert">{{ error }}</div>
    </div>
    <div v-if="inline && complex && structureOpen && depth < 16" class="setting-structure">
      <template v-if="type === 'object'">
        <div v-for="key in keys" :key="key" class="structure-entry">
          <SettingsField :value="objectValue[key]" :schema="propertySchema(key)" :root-schema="root" :label="propertySchema(key).title || key" :path="`${path}.${key}`" :required="(resolved.required || []).includes(key)" :depth="depth + 1" :query="childQuery" :issues="issues" inline @input="updateKey(key, $event)" />
          <el-button v-if="!Object.prototype.hasOwnProperty.call(properties, key)" type="text" class="remove-entry" @click="removeKey(key)">删除字段</el-button>
        </div>
        <div v-if="resolved.additionalProperties !== false" class="structure-add"><el-input v-model="newKey" size="small" placeholder="新增字段名" aria-label="新增字段名" @keyup.enter.native="addKey" /><el-button size="small" @click="addKey">添加字段</el-button></div>
      </template>
      <template v-else>
        <div v-for="(item, index) in arrayValue" :key="index" class="structure-entry">
          <SettingsField :value="item" :schema="itemSchema(index)" :root-schema="root" :label="`第 ${index + 1} 项`" :path="`${path}.${index}`" :query="childQuery" :depth="depth + 1" :issues="issues" inline required @input="updateItem(index, $event)" />
          <el-button type="text" class="remove-entry" @click="removeItem(index)">删除条目</el-button>
        </div>
        <el-button size="small" @click="emitValue([...arrayValue, emptyValue(itemSchema(arrayValue.length))])">添加条目</el-button>
      </template>
    </div>
    <p v-if="inline && complex && structureOpen && depth >= 16" class="field-error">结构层级过深，请通过配置原文编辑。</p>
    <el-dialog v-if="!inline" :visible.sync="dialog" :title="`编辑${label}`" width="760px" append-to-body custom-class="settings-object-dialog" :close-on-click-modal="false" @closed="discardDialog">
      <p class="dialog-intro">应用后仅更新页面草稿，保存页面配置后才会生效。</p>
      <SettingsField v-if="dialog" :value="draft" :schema="resolved" :root-schema="root" :label="label" :path="path" :query="query" :issues="draftIssues" inline initially-open @input="draft = $event" />
      <span slot="footer"><el-button @click="dialog = false">取消</el-button><el-button type="primary" @click="applyDialog">应用到草稿</el-button></span>
    </el-dialog>
  </div>
</template>

<script>
import { valueType, resolveReference, matchesSchema, emptyValue, valueSummary, fieldMatches, validateField } from './schema-utils'
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
export default {
  name: 'SettingsField',
  props: {
    value: { default: undefined }, schema: { type: Object, default: () => ({}) }, rootSchema: { type: Object, default: () => ({}) },
    label: { type: String, default: '' }, path: { type: String, default: '' }, ui: { type: Object, default: () => ({}) },
    query: { type: String, default: '' }, issues: { type: Array, default: () => [] }, readonly: { type: String, default: '' },
    required: Boolean, inline: Boolean, initiallyOpen: Boolean, depth: { type: Number, default: 0 },
  },
  data() { return { selectedVariant: null, selectedType: '', expanded: this.initiallyOpen, dialog: false, draft: undefined, draftIssues: [], newKey: '', localError: '' } },
  computed: {
    controlId() { return `setting-${this._uid}` },
    root() { return this.schema['x-root-schema'] || (Object.keys(this.rootSchema).length ? this.rootSchema : this.schema) },
    base() { return resolveReference(this.schema, this.root) },
    variants() { return (this.base.anyOf || this.base.oneOf || (Array.isArray(this.base.type) ? this.base.type.map(type => ({ type })) : [])).map(item => resolveReference(item, this.root)) },
    variant() {
      if (this.selectedVariant !== null) return this.selectedVariant
      const matches = this.value === undefined ? [] : this.variants.map((item, index) => matchesSchema(this.value, item, this.root) ? index : -1).filter(index => index >= 0)
      if (matches.length === 1 && this.variants[matches[0]].type !== 'null') return matches[0]
      const editable = this.variants.map((item, index) => item.type !== 'null' ? index : -1).filter(index => index >= 0)
      return editable.length === 1 ? editable[0] : undefined
    },
    ambiguous() { return this.variants.length > 0 && this.variant === undefined },
    resolved() { const { anyOf, oneOf, ...base } = this.base; return this.variants.length ? { ...base, ...(this.variants[this.variant] || {}) } : base },
    type() { return this.selectedType || (typeof this.resolved.type === 'string' ? this.resolved.type : null) || (this.resolved.properties ? 'object' : valueType(this.value)) },
    untyped() { return !this.base.type && !this.base.properties && !this.variants.length },
    complex() { return ['object', 'array'].includes(this.type) },
    nullable() { return this.base.type === 'null' || this.variants.some(item => item.type === 'null') || this.untyped },
    hasDefault() { return !this.ui.secret && !this.base.writeOnly && Object.prototype.hasOwnProperty.call(this.base, 'default') },
    displayValue() { return this.value === undefined && this.hasDefault ? this.base.default : this.value },
    placeholder() { return this.value === null ? 'null' : this.hasDefault ? `默认：${valueSummary(this.base.default)}` : this.ui.placeholder || '未设置' },
    description() { return this.ui.description || this.resolved.description || '' },
    options() { return (this.ui.options || this.resolved.enum || []).map(item => item && typeof item === 'object' ? item : { label: String(item), value: item }) },
    matches() { return fieldMatches(this.query, `${this.path} ${this.label} ${this.description}`, this.schema, this.value, this.root) },
    childQuery() { return `${this.path} ${this.label} ${this.description}`.toLowerCase().includes(this.query.trim().toLowerCase()) ? '' : this.query },
    error() { return this.localError || this.issues.find(item => item.path === this.path || String(item.path || '').startsWith(`${this.path}.`))?.message || '' },
    structureOpen() { return this.expanded || Boolean(this.query.trim() && this.matches) || Boolean(this.error) },
    properties() { return this.resolved.properties || {} },
    objectValue() { return this.value && typeof this.value === 'object' && !Array.isArray(this.value) ? this.value : {} },
    keys() { return [...new Set([...Object.keys(this.properties), ...Object.keys(this.objectValue)])] },
    arrayValue() { return Array.isArray(this.value) ? this.value : [] },
  },
  watch: { value() { this.localError = ''; this.selectedType = ''; this.selectedVariant = null } },
  methods: {
    summary: valueSummary, emptyValue,
    emitValue(value) { this.localError = ''; this.$emit('input', value); const errors = validateField(value, this.schema, this.root, this.path, this.required); this.$emit('validity', { path: this.path, valid: !errors.length }) },
    async replace(value) { if (this.value !== undefined && JSON.stringify(value) !== JSON.stringify(this.value)) { try { await this.$confirm('此操作将替换当前字段的草稿内容。', '替换字段内容', { customClass: 'configuration-confirm', confirmButtonText: '替换', cancelButtonText: '取消' }) } catch (_) { return false } } this.emitValue(clone(value)); return true },
    async changeVariant(index) { if (await this.replace(emptyValue(this.variants[index]))) this.selectedVariant = index },
    async operate(command) { if (command === 'unset') { this.selectedVariant = null; this.emitValue(undefined) } else if (command === 'default') this.replace(this.base.default); else if (command === 'null') this.replace(null); else if (command.startsWith('variant:')) this.changeVariant(Number(command.split(':')[1])); else if (command.startsWith('type:')) { const type = command.split(':')[1]; if (await this.replace(emptyValue({ type }))) this.selectedType = type } },
    openStructure() { if (this.inline) { this.expanded = !this.expanded; return } this.draft = clone(this.value == null ? emptyValue(this.resolved) : this.value); this.draftIssues = []; this.dialog = true },
    discardDialog() { this.draft = undefined; this.draftIssues = [] },
    applyDialog() { this.draftIssues = validateField(this.draft, this.schema, this.root, this.path, this.required); if (this.draftIssues.length) return; this.emitValue(clone(this.draft)); this.dialog = false },
    propertySchema(key) { return this.properties[key] || (typeof this.resolved.additionalProperties === 'object' ? this.resolved.additionalProperties : {}) },
    itemSchema(index) { return this.resolved.prefixItems?.[index] || (Array.isArray(this.resolved.items) ? this.resolved.items[index] : this.resolved.items) || {} },
    updateKey(key, value) { const next = { ...this.objectValue }; if (value === undefined) delete next[key]; else Object.defineProperty(next, key, { value, enumerable: true, configurable: true, writable: true }); this.emitValue(next) },
    removeKey(key) { this.updateKey(key, undefined) },
    addKey() { const key = this.newKey.trim(); if (!key || this.keys.includes(key)) { this.localError = '字段名不能为空或重复'; return } this.updateKey(key, emptyValue(this.propertySchema(key))); this.newKey = '' },
    updateItem(index, value) { const next = [...this.arrayValue]; next.splice(index, 1, value); this.emitValue(next) },
    removeItem(index) { this.emitValue(this.arrayValue.filter((_, i) => i !== index)) },
  },
}
</script>

<style scoped>
.settings-field { display:grid; grid-template-columns:minmax(0,1fr) minmax(230px,.85fr); gap:18px 32px; padding:17px 0; border-bottom:1px solid var(--border-color-light,#edf0f3); color:var(--text-color,#253247); }
.setting-info,.setting-edit,.setting-input { min-width:0; }.setting-info label { font-size:14px; font-weight:600; line-height:1.6; }.setting-info code { display:block; margin:4px 0 0; font-size:11px; color:var(--text-color-secondary,#84909f); overflow-wrap:anywhere; }.setting-info p { margin:5px 0; font-size:12px; line-height:1.7; color:var(--text-color-secondary,#758090); overflow-wrap:anywhere; }
.setting-details { font-size:12px; color:var(--text-color-secondary,#758090); margin-top:9px; overflow-wrap:anywhere; }.setting-details summary { cursor:pointer; width:max-content; }.setting-details[open] { line-height:1.8; }.setting-controls { display:flex; gap:8px; align-items:center; }.setting-input { flex:1; }.setting-input ::v-deep .el-select,.setting-input ::v-deep .el-input { width:100%; }.setting-more { padding:9px; }.switch-control,.number-control { display:flex; align-items:center; gap:12px; }.switch-control span,.number-control > span { font-size:12px; color:var(--text-color-secondary,#758090); }.number-control ::v-deep .el-input-number { width:100%; min-width:0; }.setting-hint { margin-top:8px; font-size:11px; color:var(--text-color-secondary,#758090); }.structure-summary { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid var(--border-color-light,#edf0f3); border-radius:8px; padding:8px 10px; }.structure-summary > span { font-size:12px; min-width:0; overflow-wrap:anywhere; }.setting-readonly { font-size:12px; line-height:1.6; }.field-error,.required-mark { color:var(--danger-color,#d94d57); font-size:12px; margin-top:8px; }.setting-structure { grid-column:1/-1; min-width:0; padding:0 14px 14px; border-left:2px solid var(--border-color-light,#edf0f3); }.structure-add { display:flex; gap:8px; max-width:400px; margin-top:12px; }.structure-entry { min-width:0; }.remove-entry { color:var(--danger-color,#d94d57); }.dialog-intro { margin-top:0; color:var(--text-color-secondary,#758090); font-size:12px; }.settings-field.is-nested { gap:12px 20px; }.has-error { border-bottom-color:var(--danger-color,#d94d57); }
@media(max-width:768px) { .settings-field,.settings-field.is-nested { grid-template-columns:minmax(0,1fr); gap:12px; padding:19px 0; }.setting-structure { padding-left:10px; }.setting-info p { margin-bottom:0; } }
</style>
<style>
.settings-object-dialog.el-dialog { max-width:calc(100vw - 24px); margin-top:5vh!important; border-radius:14px; display:flex; flex-direction:column; max-height:90vh; }.settings-object-dialog .el-dialog__body { overflow-y:auto; min-height:0; padding:12px 24px 24px; }.settings-object-dialog .el-dialog__footer { border-top:1px solid var(--border-color-light,#edf0f3); }.settings-object-dialog .el-dialog__header { padding:24px; }.settings-object-dialog .el-dialog__headerbtn { top:24px; }
</style>
