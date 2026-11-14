<template>
  <el-select :value="value" filterable allow-create default-first-option clearable :filter-method="filter" :disabled="disabled" placeholder="搜索插件指令，也可输入后按回车" class="command-select" @visible-change="query = ''" @input="$emit('input', $event || '')">
    <el-option v-for="option in visibleOptions" :key="option.value" :value="option.value" :label="option.label" />
  </el-select>
</template>
<script>
export default {
  name: "QQCommandInput",
  props: { value: String, options: { type: Array, default: () => [] }, disabled: Boolean },
  data: () => ({ query: "" }),
  computed: { visibleOptions() { const query = this.query.toLowerCase(); return this.options.filter(option => !query || option.label.toLowerCase().includes(query)).slice(0, 80) } },
  methods: { filter(value) { this.query = value || "" } },
}
</script>
<style scoped>
.command-select { width: 100%; }
</style>
