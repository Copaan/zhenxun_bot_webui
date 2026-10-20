<template>
  <section class="config-group-editor">
    <header class="group-heading">
      <div v-if="!hideTitle">
        <h3>{{ group.name }}</h3>
        <p>{{ group.module }} · {{ fields.length }} 个配置项<template v-if="ownerText"> · {{ ownerText }}</template></p>
      </div>
      <p v-else class="group-summary">{{ fields.length }} 个配置项，保存后写入 config.yaml</p>
      <el-button v-if="fields.length" size="small" @click="resetDefaults">恢复本组默认值</el-button>
    </header>
    <p v-if="shared" class="shared-note"><i class="el-icon-share"></i> 共享配置组：{{ ownerNames }} 都会读取这里的配置，修改会同时影响这些插件。</p>
    <div v-for="field in managedFields" :key="field.key" class="managed-field">
      <el-alert :title="field.help" type="info" :closable="false" />
      <pre>{{ field.key }}: {{ JSON.stringify(field.file_value === undefined ? field.value : field.file_value, null, 2) }}</pre>
      <el-button type="text" @click="$router.push('/plugin-policy')">打开插件策略</el-button>
    </div>
    <SchemaForm presentation="settings" :searchable="false" :query="query" :value="value" :schema="schema" :field-ui="fieldUi" :issues="groupIssues" @input="update" @validity-change="$emit('validity-change', group.module, $event)" />
  </section>
</template>

<script>
import SchemaForm from "./SchemaForm.vue"
import { editableFields } from "./simple-config"

export default {
  name: "ConfigGroupEditor",
  components: { SchemaForm },
  props: {
    group: { type: Object, required: true },
    issues: { type: Array, default: () => [] },
    query: { type: String, default: "" },
    hideTitle: Boolean,
  },
  computed: {
    fields() { return editableFields(this.group) },
    managedFields() { return (this.group.fields || []).filter(field => field.authority === "database") },
    owners() { return this.group.plugins || [] },
    shared() { return this.owners.length > 1 },
    ownerNames() { return [...new Set(this.owners.map(item => item.name))].join("、") },
    ownerText() {
      if (this.shared) return `${this.owners.length} 个插件共用`
      const owner = this.owners[0]
      return owner && owner.name !== this.group.name ? `插件：${owner.name}` : ""
    },
    value() { return Object.fromEntries(this.fields.map(field => [field.key, field.value])) },
    schema() {
      const result = { type: "object", properties: {} }
      this.fields.forEach(field => {
        const schema = field.schema || {}
        result.properties[field.key] = { ...schema, "x-root-schema": schema }
      })
      return result
    },
    fieldUi() {
      return Object.fromEntries(this.fields.map(field => {
        const help = String(field.help || "").trim()
        const label = field.ui?.label || (help && help.length <= 30 && !help.includes("\n") ? help : field.key)
        return [field.key, { ...(field.ui || {}), label, description: label === help ? "" : help }]
      }))
    },
    groupIssues() {
      const prefix = `${this.group.module}.`
      return this.issues.filter(issue => String(issue.path || "").startsWith(prefix)).map(issue => ({ ...issue, path: String(issue.path).slice(prefix.length) }))
    },
  },
  methods: {
    update(value) {
      this.fields.forEach(field => { field.value = value[field.key] })
      this.$emit("change", this.group.module)
    },
    resetDefaults() {
      this.update(Object.fromEntries(this.fields.map(field => [field.key, field.default_value == null ? field.default_value : JSON.parse(JSON.stringify(field.default_value))])))
    },
  },
}
</script>

<style scoped>
.config-group-editor { min-width:0; }
.group-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding-bottom:12px; border-bottom:1px solid var(--border-color-light); }
.group-heading > div { min-width:0; }
.group-heading h3 { margin:0; font-size:17px; }
.group-heading .group-summary { margin:0; }
.group-heading p { margin:4px 0 0; color:var(--text-color-secondary); font-size:12px; overflow-wrap:anywhere; }
.shared-note { margin:12px 0 0; padding:8px 12px; border-radius:6px; background:var(--bg-color-hover, #f4f6fa); color:var(--text-color-secondary); font-size:12px; line-height:1.6; }
.managed-field { margin-top:12px; }
.managed-field pre { max-width:100%; white-space:pre-wrap; overflow-wrap:anywhere; }
</style>
