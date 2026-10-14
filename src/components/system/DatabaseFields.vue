<template>
  <div class="database-fields">
    <el-form-item v-if="value.mode === 'sqlite'" label="数据库文件" class="wide">
      <el-input :value="value.path" @input="update('path', $event)" @blur="trim('path')" />
      <p v-if="pathHint" class="field-hint">{{ pathHint }}</p>
    </el-form-item>
    <el-form-item v-else-if="value.mode === 'url'" label="数据库连接 URL" class="wide">
      <el-input :value="value.url" type="password" show-password autocomplete="off" placeholder="driver://user:password@host/database" @input="update('url', $event)" />
      <p class="field-hint">仅在已有完整连接地址时使用，检查结果中不会显示。</p>
    </el-form-item>
    <template v-else>
      <el-form-item label="主机"><el-input :value="value.host" @input="update('host', $event)" @blur="trim('host')" /></el-form-item>
      <el-form-item label="端口"><el-input-number :value="value.port" :min="1" :max="65535" controls-position="right" @input="update('port', $event)" /></el-form-item>
      <el-form-item label="用户名"><el-input :value="value.username" autocomplete="off" @input="update('username', $event)" /></el-form-item>
      <el-form-item label="密码"><el-input :value="value.password" type="password" show-password autocomplete="new-password" placeholder="无密码可留空" @input="update('password', $event)" /></el-form-item>
      <el-form-item label="数据库名" class="wide"><el-input :value="value.database" @input="update('database', $event)" @blur="trim('database')" /></el-form-item>
    </template>
  </div>
</template>

<script>
export default {
  name: "DatabaseFields",
  props: {
    value: { type: Object, required: true },
    pathHint: { type: String, default: "" },
  },
  methods: {
    update(key, fieldValue) {
      this.$emit("input", { ...this.value, [key]: fieldValue })
    },
    trim(key) {
      const text = this.value[key]
      if (typeof text === "string" && text !== text.trim()) this.update(key, text.trim())
    },
  },
}
</script>

<style scoped>
.database-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
.database-fields .wide { grid-column: 1 / -1; }
.database-fields ::v-deep .el-input-number { width: 100%; }
.field-hint { margin: 4px 0 0; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; }
@media (max-width: 600px) { .database-fields { grid-template-columns: 1fr; } .database-fields .wide { grid-column: auto; } }
</style>
