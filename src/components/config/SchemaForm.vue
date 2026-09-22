<template>
  <div class="schema-form" :class="{ 'settings-form': presentation === 'settings' }">
    <el-input v-if="searchable" v-model="search" clearable prefix-icon="el-icon-search" placeholder="搜索字段、说明或嵌套路径" />
    <section v-for="section in sections" :key="section.name || 'default'" class="schema-section">
      <button v-if="section.name" type="button" class="schema-section-heading" :aria-expanded="sectionOpen(section)" @click="$set(collapsed, section.name, !collapsed[section.name])"><i :class="sectionOpen(section) ? 'el-icon-arrow-down' : 'el-icon-arrow-right'"></i> {{ section.name }} · {{ section.fields.length }} 项</button>
      <div v-show="sectionOpen(section)" class="schema-grid">
        <SchemaField
          v-for="field in section.fields"
          :key="field.key"
          :presentation="presentation"
          :class="{ wide: wideField(field.schema) }"
          :value="formValue[field.key]"
          :schema="field.schema"
          :root-schema="field.schema['x-root-schema'] || effectiveRoot"
          :required="(resolvedSchema.required || []).includes(field.key)"
          :label="labels[field.key] || field.ui.label || resolved(field.schema).title || field.key"
          :path="field.key"
          :ui="field.ui"
          :issues="issues" :query="activeQuery"
          @input="update(field.key, $event)"
          @validity="handleValidity"
        />
      </div>
    </section>
    <el-collapse v-if="advancedFields.length" :value="activeQuery || issues.length ? ['advanced'] : advancedOpen" class="advanced-fields" @input="advancedOpen = $event">
      <el-collapse-item title="高级设置" name="advanced">
        <div class="schema-grid">
          <SchemaField
            v-for="field in advancedFields"
            :key="field.key"
            :presentation="presentation"
            :class="{ wide: wideField(field.schema) }"
            :value="formValue[field.key]"
            :schema="field.schema"
            :root-schema="field.schema['x-root-schema'] || effectiveRoot"
          :required="(resolvedSchema.required || []).includes(field.key)"
            :label="labels[field.key] || field.ui.label || resolved(field.schema).title || field.key"
            :path="field.key"
            :ui="field.ui"
            :issues="issues" :query="activeQuery"
            @input="update(field.key, $event)"
            @validity="handleValidity"
          />
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script>
import SchemaField from "./SchemaField.vue"
import { fieldMatches, resolveReference } from "./schema-utils"

export default {
  name: "SchemaForm",
  components: { SchemaField },
  props: {
    presentation: { type: String, default: 'form' },
    query: { type: String, default: "" }, searchable: { type: Boolean, default: true },
    value: { type: Object, default: () => ({}) }, schema: { type: Object, default: () => ({}) }, rootSchema: { type: Object, default: null },
    labels: { type: Object, default: () => ({}) }, fieldUi: { type: Object, default: () => ({}) }, issues: { type: Array, default: () => [] },
  },
  computed: {
    activeQuery() { return this.query || this.search },
    effectiveRoot() { return this.rootSchema || this.schema },
    resolvedSchema() { return this.resolved(this.schema) },
    properties() { return this.resolvedSchema.properties || {} },
    formValue() { return this.value || {} },
    fieldEntries() {
      return Object.entries(this.properties).map(([key, schema], index) => ({ key, schema, index, ui: this.fieldUi[key] || {} }))
        .sort((left, right) => (left.ui.order ?? left.index) - (right.ui.order ?? right.index))
    },
    advancedFields() { return this.fieldEntries.filter((field) => field.ui.advanced) },
    sections() {
      const sections = new Map()
      this.fieldEntries.filter((field) => !field.ui.advanced).forEach((field) => {
        const section = field.ui.section || ""
        if (!sections.has(section)) sections.set(section, [])
        sections.get(section).push(field)
      })
      return [...sections].map(([name, fields]) => ({ name, fields }))
    },
  },
  data() { return { invalidPaths: {}, search: "", collapsed: {}, advancedOpen: [] } },
  methods: {
    sectionOpen(section) {
      return !this.collapsed[section.name] || section.fields.some(field =>
        this.issues.some(issue => issue.path === field.key || String(issue.path || "").startsWith(`${field.key}.`)) ||
        this.activeQuery.trim() && fieldMatches(this.activeQuery, `${field.key} ${field.ui.label || ""} ${field.ui.description || ""}`, field.schema, this.formValue[field.key], this.effectiveRoot))
    },
    resolved(schema) {
      return resolveReference(schema, schema?.["x-root-schema"] || this.effectiveRoot)
    },
    update(key, value) {
      const next = { ...this.formValue, [key]: value }
      if (value === undefined) delete next[key]
      Object.keys(this.invalidPaths).forEach((path) => {
        if (!this.visible(path.split(".")[0], next)) this.$delete(this.invalidPaths, path)
      })
      this.$emit("input", next)
      this.$emit("change", key)
      this.$emit("validity-change", Object.keys(this.invalidPaths))
    },
    handleValidity({ path, valid }) {
      if (valid) this.$delete(this.invalidPaths, path)
      else this.$set(this.invalidPaths, path, true)
      this.$emit("validity-change", Object.keys(this.invalidPaths))
    },
    wideField(schema) {
      const resolved = this.resolved(schema)
      return [resolved, ...(resolved.anyOf || resolved.oneOf || [])].some(item => item.type === "object" || item.type === "array" || item.properties)
    },
    visible(key, formValue = this.formValue) {
      const condition = this.fieldUi[key]?.visible_when
      if (!condition) return true
      const current = String(condition.path || "").split(".").reduce((value, part) => value?.[part], formValue)
      if (condition.operator === "neq") return current !== condition.value
      if (condition.operator === "in") return Array.isArray(condition.value) && condition.value.includes(current)
      if (condition.operator === "contains") return Array.isArray(current) && current.includes(condition.value)
      return current === condition.value
    },
  },
}
</script>

<style scoped>
.schema-form { display: flex; flex-direction: column; gap: 20px; }.schema-section-heading { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color-light); color: var(--text-color); font-size: 14px; font-weight: 600; }.schema-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; }.schema-grid .wide { grid-column: 1 / -1; }.advanced-fields { border-bottom: 0; }@media (max-width: 720px) { .schema-grid { grid-template-columns: 1fr; }.schema-grid .wide { grid-column: auto; } }
</style>
<style scoped>
.settings-form .schema-grid { grid-template-columns:minmax(0,1fr); gap:0; }.settings-form { gap:0; }
</style>
