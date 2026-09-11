<template>
  <div class="system-page">
    <header><h1>系统设置</h1><p>管理运行配置与项目文件</p></header>
    <el-tabs v-model="activeTab" class="system-tabs">
      <el-tab-pane label="配置中心" name="configuration"><ConfigurationCenter /></el-tab-pane>
      <el-tab-pane label="消息队列" name="messages" lazy><MessageInbox /></el-tab-pane>
      <el-tab-pane label="文件管理" name="files" lazy><div class="file-panel"><FileTable class="h-full" /></div></el-tab-pane>
    </el-tabs>
  </div>
</template>

<script>
import ConfigurationCenter from "@/components/system/ConfigurationCenter.vue"
import FileTable from "@/components/system/FileTable.vue"
import MessageInbox from "@/components/system/MessageInbox.vue"

export default { name: "SystemInfo", components: { ConfigurationCenter, FileTable, MessageInbox }, data() { return { activeTab: "configuration" } } }
</script>

<style scoped>
.system-page { min-height: 100%; padding: 22px; overflow-y: auto; color: var(--text-color); background: var(--bg-color); }.system-page > header h1 { margin: 0; font-size: 24px; }.system-page > header p { margin: 5px 0 16px; color: var(--text-color-secondary); }.system-tabs { min-height: 0; padding: 0 18px 18px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color-secondary); }.file-panel { min-height: 620px; padding-top: 8px; }@media (max-width: 680px) { .system-page { padding: 12px; }.system-tabs { padding: 0 10px 12px; } }
</style>
