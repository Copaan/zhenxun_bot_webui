<template>
  <section v-if="available" class="migration-bootstrap">
    <el-collapse v-model="expanded"><el-collapse-item name="restore" title="从旧实例 .zx 迁移包恢复">
      <template v-if="!authorized">
        <p>在目标实例本机控制台运行 <code>zx migration authorize</code>，输入一次性授权码。此授权仅用于迁移，与首次配置认领相互独立。</p>
        <el-input v-model="code" type="password" autocomplete="new-password" placeholder="本机控制台授权码" :disabled="busy" />
        <el-button type="primary" :loading="busy" @click="authorize">授权并选择迁移包</el-button>
        <p v-if="error" role="alert">{{ error }}</p>
      </template>
      <migration-panel v-else first-deployment />
    </el-collapse-item></el-collapse>
  </section>
</template>

<script>
import { authorizeMigration, clearMigrationSession, migrationRequest } from "@/utils/migration"
import MigrationPanel from "./MigrationPanel.vue"
export default {
  components: { MigrationPanel },
  data: () => ({ available: false, expanded: [], authorized: false, code: "", error: "", busy: false }),
  async created() {
    try { const value = await migrationRequest("/bootstrap/status"); this.available = value.available; if (value.discovered) this.expanded = ["restore"] } catch (_) { /* Older servers may not offer migration. */ }
  },
  beforeDestroy() { clearMigrationSession() },
  methods: {
    async authorize() {
      if (this.busy || !this.code) return
      this.busy = true; this.error = ""
      try { await authorizeMigration(this.code); this.code = ""; this.authorized = true }
      catch (error) { this.error = error.response?.data?.detail || error.message }
      finally { this.busy = false }
    },
  },
}
</script>

<style scoped>
.migration-bootstrap { padding: 20px; max-width: 980px; margin: auto; background: #fff; }
.migration-bootstrap p { line-height: 1.7; overflow-wrap: anywhere; }
.migration-bootstrap .el-button { margin-top: 12px; }
</style>
