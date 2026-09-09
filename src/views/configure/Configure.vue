<template>
  <div class="base">
    <div class="base-info">
      <MigrationBootstrap />
      <SettingForm />
    </div>
  </div>
</template>

<script>
import SettingForm from "@/components/configure/SettingForm.vue"
import MigrationBootstrap from "@/views/about/MigrationBootstrap.vue"
export default {
  name: "MainCommand",
  data() {
    return {}
  },
  components: { SettingForm, MigrationBootstrap },
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
</style>
