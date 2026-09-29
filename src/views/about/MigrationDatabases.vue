<template>
  <details v-if="items.length" class="database-list" open>
    <summary>数据库明细（{{ items.length }}）</summary>
    <ul>
      <li v-for="(item, index) in items" :key="item.id || `${item.path || item.target_path}-${index}`">
        <strong>{{ item.role === 'primary' ? '主库' : item.role === 'auxiliary' ? '附属数据库' : '数据库（旧记录未标注角色）' }} · {{ item.engine || 'SQLite' }}</strong>
        <span class="database-path">{{ item.path || item.target_path || item.target_name || '未记录路径' }}</span>
        <span>{{ status(item) }}</span>
        <span v-if="item.revision_verified === false || item.integrity === 'unconfirmed'">原生备份已保留；内容或扩展能力核验尚未完成</span>
        <span v-if="item.error_code" class="database-error">{{ item.error_code }}</span>
      </li>
    </ul>
  </details>
</template>

<script>
export default {
  name: "MigrationDatabases",
  props: { items: { type: Array, default: () => [] }, stage: String },
  methods: {
    status(item) {
      if (["completed", "partial"].includes(this.stage) && item.state === "applied_unverified") return "运行验证通过"
      const states = { prepared: "候选已准备，等待应用", applying: "正在应用", applied_unverified: "已应用，等待运行验证", rolled_back: "已回滚", failed: "应用失败", recovery_required: "回滚受阻，保留恢复证据" }
      return states[item.state] || (item.restore_verified ? "候选恢复通过" : item.backup_verified ? "备份完成；恢复兼容性未验证" : "等待目标恢复核验")
    },
  },
}
</script>

<style scoped>
.database-list { margin: 12px 0; }
.database-list summary { cursor: pointer; padding: 6px 0; }
.database-list ul { padding: 0; list-style: none; }
.database-list li { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; padding: 10px 0; border-bottom: 1px solid #dce2e8; }
.database-path, .database-error { overflow-wrap: anywhere; word-break: break-word; }
.database-path { font-size: 12px; }
.database-error { color: #a83838; }
</style>
