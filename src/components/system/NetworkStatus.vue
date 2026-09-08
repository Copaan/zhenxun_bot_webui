<template>
  <section v-if="runtime.scheme" class="network-status">
    <h3>当前网络入口</h3>
    <p>{{ runtime.scheme.toUpperCase() }} :{{ runtime.port }} <span v-if="runtime.http_port"> · HTTP :{{ runtime.http_port }} / {{ modeLabel }} / {{ stateLabel }}</span></p>
    <el-alert v-if="configured.pending_restart" title="网络配置已保存，等待重启生效" type="warning" :closable="false" show-icon />
    <p v-if="configured.pending_restart">目标：{{ configured.scheme.toUpperCase() }} :{{ configured.port }} · HTTP {{ httpModeLabel(configured.http_mode) }}</p>
    <el-alert v-if="runtime.http_mode === 'serve'" title="HTTP入口明文传输登录凭据和管理数据，请优先使用HTTPS。" type="warning" :closable="false" show-icon />
    <el-alert v-if="runtime.http_state === 'degraded'" :title="`HTTP入口降级：${httpErrorLabel(runtime.http_error_code || runtime.http_error)}`" type="error" :closable="false" show-icon />
    <p v-if="runtime.http_error_code">{{ runtime.http_error_code }} / {{ runtime.http_stage || '-' }} / errno {{ runtime.http_errno ?? '-' }}</p>
    <p v-if="runtime.http_retry_in_seconds">重试 {{ runtime.http_retry_count || 0 }} · 间隔 {{ runtime.http_retry_in_seconds }} s</p>
    <p v-if="runtime.http_total_retries">HTTP累计重试：{{ runtime.http_total_retries }}</p>
    <p v-if="runtime.http_unverified_child_diagnostic">未验证的子进程诊断：{{ httpErrorLabel(runtime.http_unverified_child_diagnostic.error_code) }}</p>
    <p v-if="runtime.http_first_error">首次错误：{{ runtime.http_first_error }} · 最近错误：{{ runtime.http_latest_error || runtime.http_error }}</p>
    <ul v-if="status.access_urls && status.access_urls.length">
      <li v-for="url in status.access_urls" :key="url"><a :href="url" target="_blank" rel="noopener noreferrer">{{ url }}</a></li>
    </ul>
  </section>
</template>

<script>
import { httpModeLabel, httpStateLabel, httpErrorLabel } from "@/utils/http-diagnostics"

export default {
  props: { status: { type: Object, default: () => ({}) } },
  methods: { httpModeLabel, httpErrorLabel },
  computed: {
    runtime() { return this.status.network_runtime || {} },
    configured() { return this.status.network_configured || {} },
    modeLabel() { return httpModeLabel(this.runtime.http_mode) },
    stateLabel() { return httpStateLabel(this.runtime.http_state) },
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
