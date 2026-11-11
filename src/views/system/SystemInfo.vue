<template>
  <div class="system-page"><header><h1>系统设置</h1><p>管理运行配置与项目文件</p></header><ConfigurationCenter /></div>
</template>
<script>
import ConfigurationCenter from "@/components/system/ConfigurationCenter.vue"
export default { name: "SystemInfo", components: { ConfigurationCenter } }
</script>
<style scoped>
.system-page { min-height:100%; min-width:0; box-sizing:border-box; padding:22px; overflow-y:auto; color:var(--text-color); background:var(--bg-color); }.system-page > header h1 { margin:0; font-size:24px; }.system-page > header p { margin:5px 0 20px; color:var(--text-color-secondary); }@media(max-width:767px) { .system-page { padding:12px; } }
</style>
