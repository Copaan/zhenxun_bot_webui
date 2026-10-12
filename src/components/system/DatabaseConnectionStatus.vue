<template>
  <section class="connection-check" aria-live="polite">
    <header><strong>当前运行连接</strong><span>使用 Bot 已生效的连接策略</span></header>
    <div v-if="connection" class="connection-target">
      <code>{{ connection.engine }} · {{ connection.host ? `${connection.host}:${connection.port} / ` : '' }}{{ connection.database }}</code>
      <span>配置来源：{{ sourceLabel(connection.source) }} · SSL 策略：{{ connection.ssl_mode }}（{{ sourceLabel(connection.ssl_source) }}）</span>
    </div>
    <div v-for="entry in entries" :key="entry.key" class="connection-step">
      <span>{{ entry.label }}</span>
      <el-tag size="small" :type="entry.value.status === 'ok' ? 'success' : entry.value.status === 'error' ? 'danger' : 'info'">{{ checking ? '检测中' : statusLabel(entry.value.status) }}</el-tag>
      <span v-if="entry.value.observed_tls != null">本次连接{{ entry.value.observed_tls ? '已使用 TLS' : '未使用 TLS' }}</span>
      <span v-if="entry.value.latency_ms != null">{{ entry.value.latency_ms }} ms</span>
      <time v-if="entry.value.checked_at">{{ new Date(entry.value.checked_at * 1000).toLocaleTimeString() }}</time>
      <p v-if="entry.value.status === 'error'">{{ errorLabel(entry.value.code) }}</p>
    </div>
    <p v-if="result && result.code" class="connection-error">{{ errorLabel(result.code) }}</p>
  </section>
</template>

<script>
export default {
  name: "DatabaseConnectionStatus",
  props: { result: { type: Object, default: null }, checking: Boolean },
  computed: {
    connection() { return this.result?.runtime?.connection },
    entries() { return [{ key: "runtime", label: "Bot 运行连接", value: this.result?.runtime || {} }] },
  },
  methods: {
    sourceLabel(source) { return { url: "连接配置", environment: "环境覆盖", driver_default: "驱动默认", configuration_file: "启动时配置文件", target_configuration: "目标配置" }[source] || "来源未确认" },
    statusLabel(status) { return { ok: "检测通过", error: "检测失败" }[status] || "尚未检测" },
    errorLabel(code) {
      const messages = { database_tls_not_negotiated: "数据库要求 TLS，但本次连接未确认加密。", database_tls_verification_failed: "数据库证书校验失败，请核对 CA、有效期及主机名。", database_tls_driver_incompatible: "当前 Windows 数据库驱动的 TLS 握手不兼容，未降级为明文。", database_timeout: "数据库检测超时。", database_connection_refused: "数据库拒绝连接，请核对地址、端口和监听状态。", database_runtime_unconfirmed: "未取得 Bot 当前连接。", database_connection_changed: "连接策略或证书已变化，请重新检测。", database_tls_certificate_unreadable: "配置的证书文件不可读取，请核对证书路径与权限。", database_connection_failed: "当前数据库连接检查失败。" }
      return messages[code] || code || "检测未完成，请重新检查。"
    },
  },
}
</script>

<style scoped>
.connection-check { border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; margin: 12px 0 20px; background: var(--bg-color-secondary); }
.connection-check header, .connection-target, .connection-step { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.connection-check header span, .connection-target span, time { color: var(--text-color-secondary); font-size: 12px; }
.connection-target { padding: 12px 0; }
.connection-target code { overflow-wrap: anywhere; }
.connection-step { padding: 10px 0; border-top: 1px solid var(--border-color); }
.connection-step p { flex-basis: 100%; margin: 2px 0; }
.connection-error { color: var(--danger-color); }
@media (max-width: 768px) { .connection-check { padding: 12px; } .connection-target { align-items: flex-start; flex-direction: column; } }
</style>
