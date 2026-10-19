<template>
  <el-dialog title="切换数据库" :visible="visible" custom-class="backup-dialog" top="5vh" width="min(560px, 94vw)" :close-on-click-modal="false" @close="$emit('close')">
    <p class="backup-hint">把当前数据库中已加载插件的全部数据表复制到一个新的空数据库（未加载插件的表不包含在内），然后让 Bot 改用新数据库。原数据库保持不变，导入失败时自动切回。</p>
    <el-form label-position="top" size="small" @submit.native.prevent>
      <el-form-item label="数据库类型">
        <el-radio-group v-model="database.mode" @change="changeMode">
          <el-radio-button label="sqlite">SQLite</el-radio-button>
          <el-radio-button label="mysql">MySQL</el-radio-button>
          <el-radio-button label="postgres">PostgreSQL</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <DatabaseFields v-model="database" />
    </el-form>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <p class="backup-warning">目标数据库必须为空。Bot 将重启，期间 WebUI 暂时无法访问。</p>
    <span slot="footer">
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">复制数据并切换</el-button>
    </span>
  </el-dialog>
</template>

<script>
import DatabaseFields from "@/components/system/DatabaseFields.vue"

const initial = () => ({ mode: "sqlite", path: "data/db/zhenxun-new.db", host: "127.0.0.1", port: null, username: "", password: "", database: "" })

export default {
  name: "BackupSwitchDialog",
  components: { DatabaseFields },
  props: { visible: { type: Boolean, default: false } },
  data() { return { database: initial(), submitting: false, error: "" } },
  watch: {
    visible(value) { if (value) { this.database = initial(); this.error = "" } },
  },
  methods: {
    changeMode(mode) {
      this.database.port = { mysql: 3306, postgres: 5432 }[mode] || null
      if (mode === "postgres" && !this.database.username) this.database.username = "postgres"
      if (mode === "mysql" && !this.database.username) this.database.username = "root"
    },
    async submit() {
      this.submitting = true; this.error = ""
      try {
        const response = await this.postRequest(`${this.$root.prefix}/backup/switch`, this.database, { timeout: 0 })
        if (!response?.suc) throw new Error(response?.info)
        this.$emit("submitted", response.data)
      } catch (error) { this.error = error.message || "切换失败" }
      finally { this.submitting = false }
    },
  },
}
</script>

<style scoped>
.backup-hint { color: #64717c; font-size: 13px; margin: 0 0 12px; line-height: 1.6; }
.backup-warning { color: #a8662a; font-size: 13px; margin-top: 12px; }
</style>
