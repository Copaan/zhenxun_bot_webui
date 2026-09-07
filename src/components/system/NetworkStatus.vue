<template>
  <section v-if="runtime.scheme" class="network-status">
    <h3>当前网络入口</h3>
    <p>{{ runtime.scheme.toUpperCase() }} :{{ runtime.port }} <span v-if="runtime.http_port"> · HTTP :{{ runtime.http_port }} / {{ modeLabel }} / {{ stateLabel }}</span></p>
    <el-alert v-if="configured.pending_restart" title="网络配置已保存，等待重启生效" type="warning" :closable="false" show-icon />
    <p v-if="configured.pending_restart">目标：{{ configured.scheme.toUpperCase() }} :{{ configured.port }} · HTTP {{ configured.http_mode }}</p>
    <el-alert v-if="runtime.http_mode === 'serve'" title="HTTP入口明文传输登录凭据和管理数据，请优先使用HTTPS。" type="warning" :closable="false" show-icon />
    <el-alert v-if="runtime.http_state === 'degraded'" :title="`HTTP入口降级：${runtime.http_error || '监听未就绪'}`" type="error" :closable="false" show-icon />
    <ul v-if="status.access_urls && status.access_urls.length">
      <li v-for="url in status.access_urls" :key="url"><a :href="url" target="_blank" rel="noopener noreferrer">{{ url }}</a></li>
    </ul>
  </section>
</template>

<script>
export default {
  props: { status: { type: Object, default: () => ({}) } },
  computed: {
    runtime() { return this.status.network_runtime || {} },
    configured() { return this.status.network_configured || {} },
    modeLabel() { return { serve: "完整访问", redirect: "仅跳转HTTPS", disabled: "关闭" }[this.runtime.http_mode] || "未知" },
    stateLabel() { return { ready: "已监听", starting: "启动中", stopped: "已停止", stopping: "关闭中", degraded: "降级", disabled: "未启用", unknown: "未确认" }[this.runtime.http_state] || "未确认" },
  },
}
</script>

<style scoped>
.network-status { min-width: 0; padding: 12px 0; border-bottom: 1px solid var(--border-color); }
.network-status h3 { font-size: 15px; margin: 0 0 8px; }
.network-status p, .network-status li { overflow-wrap: anywhere; line-height: 1.6; }
.network-status ul { padding-left: 18px; }
.network-status .el-alert { margin: 8px 0; }
</style>
