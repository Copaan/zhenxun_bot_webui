<template>
  <div class="base">
    <div class="base-info">
      <SettingForm ref="setup" v-show="mode === 'setup'" :active="mode === 'setup'">
        <template #header-actions="{ blockedReason }">
          <el-button size="small" :disabled="Boolean(blockedReason || frozen)" @click="showMigration(blockedReason)">从迁移包恢复</el-button>
          <small v-if="blockedReason || frozen" class="switch-reason" role="status">{{ frozen ? '正在等待实例重启，请稍候' : blockedReason }}</small>
        </template>
      </SettingForm>
      <div v-if="migrationMounted" v-show="mode === 'migration'" class="migration-shell">
        <MigrationBootstrap ref="migration" :active="mode === 'migration'">
          <template #header-actions="{ blockedReason }">
            <el-button size="small" :disabled="Boolean(blockedReason || frozen)" @click="showSetup(blockedReason)">返回部署向导</el-button>
            <small v-if="blockedReason || frozen" class="switch-reason" role="status">{{ frozen ? '正在等待实例重启，请稍候' : blockedReason }}</small>
          </template>
        </MigrationBootstrap>
      </div>
    </div>
  </div>
</template>

<script>
import SettingForm from "@/components/configure/SettingForm.vue"
import MigrationBootstrap from "@/views/about/MigrationBootstrap.vue"
import { isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"
export default {
  name: "MainCommand",
  data() {
    return { mode: "setup", migrationMounted: false, frozen: isBusinessNetworkFrozen() }
  },
  components: { SettingForm, MigrationBootstrap },
  created() { this.unsubscribeNetwork = onBusinessNetworkChange(value => { this.frozen = value }) },
  beforeDestroy() { this.unsubscribeNetwork?.() },
  methods: {
    showMigration(reason) {
      if (reason || this.frozen || this.mode !== "setup") return
      this.migrationMounted = true; this.mode = "migration"
      this.$nextTick(() => this.$refs.migration?.focusHeading())
    },
    showSetup(reason) {
      if (reason || this.frozen || this.mode !== "migration") return
      this.mode = "setup"
      this.$nextTick(() => this.$refs.setup?.focusHeading())
    },
  },
}
</script>

<style lang="scss" scoped>
.base {
  background-color: #f4f5fa;
  height: 100%;
  min-height: 0;
  width: 100%;
  overflow: auto;
}

.base-info {
  height: 100%;
  min-height: 0;
  width: 100%;
}
.migration-shell { min-height: 100%; padding: 32px 20px; background: linear-gradient(145deg, #f7f8fb 0%, #fff4f7 100%); }
.switch-reason { display: block; max-width: 260px; color: #7b7f89; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
@media (max-width: 700px) { .migration-shell { padding: 0; } .switch-reason { max-width: 100%; } }
</style>
