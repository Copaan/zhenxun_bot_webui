export const httpModeLabel = mode => ({
  serve: "完整访问", redirect: "仅跳转HTTPS", disabled: "关闭",
}[mode] || mode || "未知")

export const httpStateLabel = state => ({
  ready: "已监听", starting: "启动中", stopped: "已停止", stopping: "关闭中",
  degraded: "降级", disabled: "未启用", unknown: "未确认",
}[state] || state || "未确认")

export const httpErrorLabel = code => ({
  address_in_use: "端口已被占用",
  address_unavailable: "监听地址不可用",
  permission_denied: "监听权限不足",
  listener_bind_failed: "监听绑定失败",
  upstream_certificate_mismatch: "HTTPS证书指纹不匹配",
  upstream_timeout: "HTTPS上游超时",
  upstream_unavailable: "HTTPS上游不可用",
  https_worker_not_ready: "HTTPS进程尚未就绪",
  startup_timeout: "边车启动超时",
  sidecar_startup_failed: "边车启动失败",
  sidecar_spawn_failed: "边车进程创建失败",
  sidecar_startup_interrupted: "边车启动已中止",
  sidecar_unexpected_exit: "边车意外退出",
  listener_identity_unverified: "监听进程身份未确认",
}[code] || code || "监听未就绪")
