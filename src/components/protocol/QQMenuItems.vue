<template>
  <div class="qq-items">
    <article v-for="(item, index) in draftItems" :key="index" class="qq-item">
      <header><strong>{{ child ? '子菜单' : '项目' }} {{ index + 1 }}</strong><div class="item-actions">
        <el-button size="mini" aria-label="上移" :disabled="disabled || !index" icon="el-icon-top" @click="move(index, -1)" />
        <el-button size="mini" aria-label="下移" :disabled="disabled || index === draftItems.length - 1" icon="el-icon-bottom" @click="move(index, 1)" />
        <el-button size="mini" :disabled="disabled || draftItems.length >= limit" @click="copy(index)">复制</el-button>
        <el-button size="mini" :disabled="disabled" type="danger" plain @click="draftItems.splice(index, 1)">删除</el-button>
      </div></header>
      <el-form label-position="top" size="small" :disabled="disabled">
        <el-form-item :label="panel && item.type === 'command' ? '指令（也是显示名称）' : '显示名称'"><el-input v-model="item.name" maxlength="64" /><small>长度 {{ length(item.name) }} / {{ panel || child ? 14 : 10 }}（中文计 2）</small></el-form-item>
        <el-form-item label="类型"><el-select v-model="item.type" @change="prepare(item)"><el-option v-for="type in types" :key="type.value" :value="type.value" :label="type.label" /></el-select></el-form-item>
        <el-form-item v-if="item.type === 'send_message'" label="填入输入框的指令"><el-input v-model="item.send_message" maxlength="1000" /></el-form-item>
        <el-form-item v-if="item.type === 'link'" label="HTTPS 链接"><el-input v-model="item.link" placeholder="https://" maxlength="2048" /></el-form-item>
        <template v-if="item.type === 'switch'"><el-form-item label="开关标识"><el-input v-model="item.switch.switch_id" maxlength="100" /></el-form-item><el-form-item label="默认开启"><el-switch v-model="item.switch.default" /></el-form-item><p class="hint">状态随 QQ 消息传递，不会直接修改真寻插件设置。</p></template>
        <template v-if="panel"><el-form-item label="说明"><el-input v-model="item.desc" maxlength="60" /></el-form-item><el-checkbox v-model="item.only_admin">仅管理员操作（仍须通过插件权限检查）</el-checkbox></template>
      </el-form>
      <QQMenuItems v-if="item.type === 'menu'" :items.sync="item.sub_menu_items" child :disabled="disabled" />
    </article>
    <el-button :disabled="disabled || draftItems.length >= limit" size="small" icon="el-icon-plus" @click="add">添加{{ child ? '子菜单' : '项目' }}（{{ draftItems.length }}/{{ limit }}）</el-button>
  </div>
</template>

<script>
const editableItems = value => {
  const items = JSON.parse(JSON.stringify(value || []))
  for (const item of items) {
    if (item.type === "menu" && !Array.isArray(item.sub_menu_items)) item.sub_menu_items = []
    if (item.type === "switch" && !item.switch) item.switch = { switch_id: "", default: false }
  }
  return items
}
export default {
  name: "QQMenuItems",
  props: { items: { type: Array, required: true }, panel: Boolean, child: Boolean, disabled: Boolean },
  data() { return { draftItems: editableItems(this.items) } },
  watch: {
    items: { deep: true, handler(value) { const normalized = editableItems(value); if (JSON.stringify(normalized) !== JSON.stringify(this.draftItems)) this.draftItems = normalized } },
    draftItems: { deep: true, handler(value) { if (JSON.stringify(value) !== JSON.stringify(this.items)) this.$emit("update:items", JSON.parse(JSON.stringify(value))) } },
  },
  computed: {
    limit() { return this.panel ? 20 : this.child ? 5 : 10 },
    types() { return this.panel ? [{ value: "command", label: "指令" }, { value: "link", label: "链接" }] : [{ value: "send_message", label: "填入消息" }, { value: "link", label: "链接" }, ...this.child ? [] : [{ value: "menu", label: "子菜单" }, { value: "switch", label: "开关" }]] },
  },
  methods: {
    length(value) { return Array.from(value || "").reduce((n, c) => n + (c.codePointAt(0) < 128 ? 1 : 2), 0) },
    prepare(item) {
      if (item.type === "menu" && !Array.isArray(item.sub_menu_items)) this.$set(item, "sub_menu_items", [])
      if (item.type === "switch" && !item.switch) this.$set(item, "switch", { switch_id: "", default: false })
    },
    add() { if (this.draftItems.length < this.limit) this.draftItems.push(this.panel ? { name: "", type: "command", desc: "", only_admin: false } : { name: "", type: "send_message", send_message: "" }) },
    copy(index) { if (this.draftItems.length < this.limit) this.draftItems.splice(index + 1, 0, JSON.parse(JSON.stringify(this.draftItems[index]))) },
    move(index, delta) { const target = index + delta; if (target >= 0 && target < this.draftItems.length) this.draftItems.splice(target, 0, this.draftItems.splice(index, 1)[0]) },
  },
}
</script>

<style scoped>
.qq-items { display: grid; gap: 12px; }
.qq-item { padding: 14px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color); min-width: 0; }
.qq-item header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.item-actions { display: flex; flex-wrap: wrap; gap: 4px; }
.item-actions .el-button { margin: 0; }
.hint, small { color: var(--text-color-secondary); overflow-wrap: anywhere; }
</style>
